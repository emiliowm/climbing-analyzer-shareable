# videos/schemas.py
from ninja import Schema
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class VideoUploadSchema(Schema):
    """Schema for video upload request"""
    title: str
    file_size: int

class VideoSchema(Schema):
    """Schema for video response"""
    id: UUID
    title: str
    status: str
    progress: int
    duration: Optional[float] = None
    fps: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    processed_at: Optional[datetime] = None

class VideoMetricsSchema(Schema):
    """Schema for video metrics summary"""
    flow_score: float
    flow_score_rating: str
    stability_index_percent: float
    flexion_index_percent: float
    barn_door_events: int
    avg_hip_distance: float


class ContactPointSchema(Schema):
    landmark_id: int
    position: List[float]
    is_static: bool


class PoseLandmarkSchema(Schema):
    id: int
    x: float
    y: float
    z: float
    visibility: float


class FrameMetricsSchema(Schema):
    """Schema for individual frame metrics"""
    frame_number: int
    timestamp: float
    com_position: List[float]
    left_elbow_angle: float
    right_elbow_angle: float
    hip_z_distance: float
    frame_quality: str
    is_stable: bool
    barn_door_warning: bool
    pose_landmarks: List[PoseLandmarkSchema]
    contact_points: List[ContactPointSchema]
