from django.db import models
from django.contrib.auth.models import User
import uuid


class Video(models.Model):
    STATUS_CHOICES = [
        ('uploading', 'Uploading'),
        ('processing', 'Processing'),
        ('complete', 'Complete'),
        ('error', 'Error'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='videos')
    
    # File info
    title = models.CharField(max_length=255)
    original_file = models.FileField(upload_to='videos/original/')
    processed_file = models.FileField(upload_to='videos/processed/', null=True, blank=True)
    thumbnail = models.ImageField(upload_to='videos/thumbnails/', null=True, blank=True)
    
    # Metadata
    duration = models.FloatField(null=True, blank=True)
    fps = models.FloatField(null=True, blank=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    
    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploading')
    progress = models.IntegerField(default=0)  # 0-100
    error_message = models.TextField(null=True, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.status})"


class VideoMetrics(models.Model):
    """
    Video analysis metrics with chunked frame storage.
    
    DESIGN DECISION: Chunked JSON vs Individual Rows
    ================================================
    We use chunked JSONField storage (100 frames per chunk) instead of
    individual FrameMetric rows because:
    
    ✅ Simpler implementation
    ✅ Fast sequential access (scrubbing through video)
    ✅ Fewer database rows (54 chunks vs 5,400 rows per 3-min video)
    ✅ Easy pagination for frontend
    ✅ Events (barn door, unstable) are pre-computed during processing
    
    Individual rows would add complexity for queries we don't need:
    - "Find all videos where frame 50 has barn door" (not a use case)
    - 5,400 rows × 100 videos = 540,000 rows (database bloat)
    
    RE-PROCESSING DECISION: No Versioning (Overwrite)
    ==================================================
    We overwrite metrics on re-process instead of versioning because:
    
    ✅ Users care about current results, not historical algorithm versions
    ✅ Keeps database simple
    ✅ Can always add versioning later if needed
    
    However, we track algorithm_version so we can:
    - Query "find all videos processed with old algorithm" for batch re-processing
    - Debug detection improvements
    """
    video = models.OneToOneField(Video, on_delete=models.CASCADE, related_name='metrics')
    
    # Algorithm tracking for batch re-processing
    algorithm_version = models.CharField(
        max_length=20, 
        default="1.0.0",
        help_text="Version of analysis algorithm used. Enables batch re-processing when improved."
    )
    
    # Summary metrics
    flow_score = models.FloatField()
    flow_score_rating = models.CharField(max_length=20)
    
    stability_index_percent = models.FloatField()
    flexion_index_percent = models.FloatField()
    
    barn_door_events = models.IntegerField()
    avg_hip_distance = models.FloatField()
    
    # Frame-by-frame data (JSON)
    frame_data = models.JSONField()  # List of all frame metrics
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Metrics for {self.video.title}"
