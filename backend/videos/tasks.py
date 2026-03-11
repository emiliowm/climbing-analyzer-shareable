from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.utils import timezone
from django.core.cache import cache
from django.db import transaction
from django.core.files.storage import default_storage
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Video, VideoMetrics
from analysis.services.video_processor import VideoProcessor
import os
import tempfile

# Lock expires after 30 minutes (safety buffer)
LOCK_EXPIRE = 60 * 30


def get_video_for_processing(video: Video) -> str:
    """
    Download video from storage to temp file.
    Returns path to temporary file.
    
    Handles:
    - Local file storage (returns path directly if available)
    - S3/MinIO (downloads to temp file)
    """
    file_field = video.original_file
    
    # Check if file is on local filesystem
    local_path = get_local_storage_path(file_field)
    if local_path and os.path.exists(local_path):
        return local_path
    
    # Download from remote storage to temp file
    temp_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
    try:
        with default_storage.open(file_field.name, 'rb') as source:
            for chunk in source.chunks(chunk_size=8192):
                temp_file.write(chunk)
        temp_file.flush()
        return temp_file.name
    except Exception:
        os.unlink(temp_file.name)
        raise


def get_local_storage_path(file_field) -> str | None:
    """Safely return local storage path, if backend supports absolute paths."""
    try:
        return file_field.path
    except (AttributeError, NotImplementedError):
        return None


def to_json_compatible(value):
    """
    Recursively convert NumPy-like values to plain Python JSON-safe types.
    Handles scalar wrappers (e.g., numpy.bool_, numpy.float32) and arrays.
    """
    if isinstance(value, dict):
        return {str(k): to_json_compatible(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json_compatible(v) for v in value]

    # NumPy scalar wrappers expose .item()
    item_method = getattr(value, "item", None)
    if callable(item_method):
        try:
            return to_json_compatible(item_method())
        except (TypeError, ValueError):
            pass

    # NumPy arrays expose .tolist()
    tolist_method = getattr(value, "tolist", None)
    if callable(tolist_method):
        try:
            return to_json_compatible(tolist_method())
        except (TypeError, ValueError):
            pass

    return value


@shared_task(bind=True, max_retries=3)
def process_video_task(self, video_id: str):
    """
    Idempotent video processing task.
    
    Guarantees:
    - Only one task processes a video at a time (distributed lock)
    - Restarts don't create duplicate metrics
    - Partial data is cleaned up on failure
    - Graceful timeout handling
    
    Args:
        video_id: UUID of video to process
    """
    lock_id = f'video-processing-lock-{video_id}'
    temp_path = None
    video = None
    
    # Acquire distributed lock
    if not cache.add(lock_id, 'locked', LOCK_EXPIRE):
        # Another task is already processing this video
        raise self.retry(countdown=60)
    
    try:
        video = Video.objects.get(id=video_id)
        
        # Skip if already complete (idempotency)
        if video.status == 'complete':
            return {'status': 'already_complete', 'video_id': str(video_id)}
        
        # Mark as processing
        video.status = 'processing'
        video.save()
        
        # Clean up any partial data from previous failed attempts
        VideoMetrics.objects.filter(video=video).delete()
        
        # Get video file (handles S3/local transparently)
        temp_path = get_video_for_processing(video)
        
        # Get model path
        model_path = os.path.join(os.path.dirname(__file__), '..', 'pose_landmarker.task')
        
        # Process video with stream-compatible processor
        processor = VideoProcessor(model_path)
        
        # Get channel layer for WebSocket updates
        channel_layer = get_channel_layer()
        
        def progress_callback(percent):
            video.progress = percent
            video.save()
            
            # Update task state for Celery
            self.update_state(
                state='PROGRESS',
                meta={'percent': percent, 'status': 'processing'}
            )
            
            # Send WebSocket update
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f'video_{video_id}',
                    {
                        'type': 'video_progress',
                        'progress': percent,
                        'status': 'processing'
                    }
                )
        
        results = processor.process(temp_path, progress_callback=progress_callback)
        summary = to_json_compatible(results.get('summary', {}))
        frame_data = to_json_compatible(results.get('frame_data', []))
        video_info = to_json_compatible(results.get('video_info', {}))

        def to_optional_float(value):
            if value is None:
                return None
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        def to_optional_int(value):
            if value is None:
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                return None
        
        # Save metrics atomically (prevents partial data on crash)
        with transaction.atomic():
            VideoMetrics.objects.create(
                video=video,
                algorithm_version="1.0.0",  # Track for batch re-processing
                flow_score=summary['flow_score'],
                flow_score_rating=summary['flow_score_rating'],
                stability_index_percent=summary['stability_index_percent'],
                flexion_index_percent=summary['flexion_index_percent'],
                barn_door_events=summary['barn_door_events'],
                avg_hip_distance=summary['avg_hip_distance'],
                frame_data=frame_data
            )
            video.duration = to_optional_float(video_info.get('duration'))
            video.fps = to_optional_float(video_info.get('fps'))
            video.width = to_optional_int(video_info.get('width'))
            video.height = to_optional_int(video_info.get('height'))
            video.status = 'complete'
            video.progress = 100
            video.processed_at = timezone.now()
            video.save()
        
        # Send completion WebSocket notification
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f'video_{video_id}',
                {
                    'type': 'video_progress',
                    'progress': 100,
                    'status': 'complete'
                }
            )
        
        return {'status': 'success', 'video_id': str(video_id)}
    
    except SoftTimeLimitExceeded:
        # Graceful timeout - cleanup and mark as error
        if video:
            video.status = 'error'
            video.error_message = 'Processing timed out. Video may be too long.'
            video.save()
        raise
        
    except Exception as exc:
        if video:
            video.status = 'error'
            video.error_message = str(exc)
            video.save()
        raise self.retry(exc=exc, countdown=60, max_retries=3)
        
    finally:
        # Always release lock
        cache.delete(lock_id)
        
        # Clean up temp file if we created one
        local_original_path = get_local_storage_path(video.original_file) if video else None
        if temp_path and temp_path != local_original_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
