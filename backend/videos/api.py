# videos/api.py
from ninja import NinjaAPI, File, Form
from ninja.files import UploadedFile
from django.shortcuts import get_object_or_404
from django.http import FileResponse, Http404
from django.contrib.auth.models import User
from typing import List
import mimetypes
from .models import Video, VideoMetrics
from .schemas import FrameMetricsSchema, VideoSchema, VideoMetricsSchema, VideoUploadSchema
from .tasks import process_video_task

api = NinjaAPI()

@api.post("/videos/upload", response=VideoSchema)
def upload_video(request, file: UploadedFile = File(...), title: str = Form(...), file_size: int = Form(...)):
    """Upload a new video"""
    # TODO: Add authentication - temporarily using first available user for testing
    user = User.objects.first()
    if not user:
        # Create a default test user if none exists
        user = User.objects.create_user('testuser', 'test@example.com', 'testpass')
    
    video = Video.objects.create(
        user=user,
        title=title,
        original_file=file,
        file_size=file_size,
        status='uploading'
    )
    
    # Start processing task
    process_video_task.delay(str(video.id))
    
    return video

@api.get("/videos", response=List[VideoSchema])
def list_videos(request):
    """List all user's videos"""
    # TODO: Add authentication - currently public for testing
    return Video.objects.all()

@api.get("/videos/{video_id}", response=VideoSchema)
def get_video(request, video_id: str):
    """Get video details"""
    # TODO: Add authentication - currently public for testing
    return get_object_or_404(Video, id=video_id)


@api.get("/videos/{video_id}/stream")
def stream_video(request, video_id: str):
    """Stream original uploaded video for in-browser playback."""
    video = get_object_or_404(Video, id=video_id)
    if not video.original_file:
        raise Http404("Video file not found")

    try:
        video.original_file.open("rb")
    except FileNotFoundError as exc:
        raise Http404("Video file not found") from exc

    content_type, _ = mimetypes.guess_type(video.original_file.name)
    response = FileResponse(
        video.original_file,
        content_type=content_type or "video/mp4",
    )
    response["Accept-Ranges"] = "bytes"
    response["Cache-Control"] = "no-cache"
    return response

@api.get("/videos/{video_id}/metrics", response=VideoMetricsSchema)
def get_metrics(request, video_id: str):
    """Get video metrics"""
    # TODO: Add authentication - currently public for testing
    video = get_object_or_404(Video, id=video_id)
    return video.metrics

@api.get("/videos/{video_id}/frames", response=List[FrameMetricsSchema])
def get_frame_data(request, video_id: str):
    """Get frame-by-frame data"""
    # TODO: Add authentication - currently public for testing
    video = get_object_or_404(Video, id=video_id)
    normalized_frames = []
    frame_rows = getattr(video.metrics, "frame_data", []) if hasattr(video, "metrics") else []

    for frame in frame_rows:
        frame_payload = dict(frame) if isinstance(frame, dict) else {}

        raw_pose_landmarks = frame_payload.get("pose_landmarks", [])
        normalized_landmarks = []
        if isinstance(raw_pose_landmarks, list):
            for index, landmark in enumerate(raw_pose_landmarks):
                if not isinstance(landmark, dict):
                    continue
                normalized_landmarks.append(
                    {
                        "id": int(landmark.get("id", index)),
                        "x": float(landmark.get("x", 0.0)),
                        "y": float(landmark.get("y", 0.0)),
                        "z": float(landmark.get("z", 0.0)),
                        "visibility": float(landmark.get("visibility", 0.0)),
                    }
                )

        raw_contact_points = frame_payload.get("contact_points", [])
        normalized_contacts = []
        if isinstance(raw_contact_points, list):
            for contact in raw_contact_points:
                if not isinstance(contact, dict):
                    continue
                position = contact.get("position", [0.0, 0.0])
                if not isinstance(position, list) or len(position) < 2:
                    position = [0.0, 0.0]
                normalized_contacts.append(
                    {
                        "landmark_id": int(contact.get("landmark_id", -1)),
                        "position": [float(position[0]), float(position[1])],
                        "is_static": bool(contact.get("is_static", False)),
                    }
                )

        frame_payload.setdefault("com_position", [0.0, 0.0])
        frame_payload.setdefault("left_elbow_angle", 0.0)
        frame_payload.setdefault("right_elbow_angle", 0.0)
        frame_payload.setdefault("hip_z_distance", 0.0)
        frame_payload.setdefault("frame_quality", "bad")
        frame_payload.setdefault("is_stable", False)
        frame_payload.setdefault("barn_door_warning", False)
        frame_payload["pose_landmarks"] = normalized_landmarks
        frame_payload["contact_points"] = normalized_contacts
        normalized_frames.append(frame_payload)
    return normalized_frames

@api.delete("/videos/{video_id}")
def delete_video(request, video_id: str):
    """Delete a video"""
    # TODO: Add authentication - currently public for testing
    video = get_object_or_404(Video, id=video_id)
    video.delete()
    return {"success": True}
