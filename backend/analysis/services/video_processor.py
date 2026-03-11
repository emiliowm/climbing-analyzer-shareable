"""
Production-ready video processor with stream support and explicit cleanup.

ARCHITECTURE NOTES:
- Accepts both file paths (str) and file-like objects (BinaryIO)
- For streams, creates temp file then cleans up
- Explicit resource cleanup prevents MediaPipe/OpenCV memory leaks
- No Django dependencies - can be tested in isolation

This service integrates all analysis components:
- PoseDetector: MediaPipe pose landmark detection
- KalmanFilter: Landmark smoothing to reduce jitter
- detect_contact_points: Static contact point detection with hysteresis
- check_stability: Support polygon and CoM stability analysis
- detect_barn_door: Rotational instability detection
- calculate_flow_score: Movement smoothness scoring based on jerk

Returns VideoMetrics data structure (dict, not Django model) for storage.
"""

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from typing import Tuple, Dict, List, Union, BinaryIO, Optional, Callable
from collections import deque
from contextlib import contextmanager
from dataclasses import dataclass, asdict
import tempfile
import os
import gc


# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class ContactPoint:
    """Represents a static contact point (hand or foot) on the climbing wall."""
    landmark_id: int
    position: np.ndarray
    frames_static: int
    is_static: bool


class SimpleLandmark:
    """Simple landmark class to hold smoothed coordinates."""
    def __init__(self, x: float, y: float, z: float, visibility: float):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = visibility


@dataclass
class FrameMetrics:
    """Stores all biomechanical metrics for a single frame."""
    frame_number: int
    timestamp: float
    com_position: np.ndarray
    com_velocity: np.ndarray
    com_acceleration: np.ndarray
    left_elbow_angle: float
    right_elbow_angle: float
    hip_z_distance: float
    contact_points: List[ContactPoint]
    pose_landmarks: List[SimpleLandmark]
    is_stable: bool
    barn_door_warning: bool


# ============================================================================
# KALMAN FILTER FOR LANDMARK SMOOTHING
# ============================================================================

class LandmarkKalmanFilter:
    """
    Constant Velocity Kalman Filter for smoothing MediaPipe landmark jitter.
    
    State vector: [x, y, vx, vy]
    - x, y: position coordinates
    - vx, vy: velocity components
    
    This filter assumes constant velocity motion between frames, which is
    appropriate for human movement at typical video frame rates (24-120 fps).
    """
    
    def __init__(self, dt: float = 1/30):
        """
        Initialize Kalman Filter with constant velocity model.
        
        Args:
            dt: Time step between frames (1/fps)
        """
        from filterpy.kalman import KalmanFilter
        
        self.kf = KalmanFilter(dim_x=4, dim_z=2)
        
        # State transition matrix (constant velocity model)
        self.kf.F = np.array([
            [1, 0, dt, 0],
            [0, 1, 0, dt],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ])
        
        # Measurement matrix (we only observe position)
        self.kf.H = np.array([
            [1, 0, 0, 0],
            [0, 1, 0, 0]
        ])
        
        # Measurement noise covariance (MediaPipe has some jitter)
        self.kf.R *= 0.01
        
        # Process noise covariance (allow for acceleration)
        self.kf.Q *= 0.01
        
        # Initial state covariance
        self.kf.P *= 1000
        
        self.initialized = False
    
    def update(self, measurement: np.ndarray) -> np.ndarray:
        """
        Update filter with new measurement and return smoothed position.
        
        Args:
            measurement: [x, y] position from MediaPipe
            
        Returns:
            Smoothed [x, y] position
        """
        if not self.initialized:
            # Initialize state with first measurement
            self.kf.x = np.array([measurement[0], measurement[1], 0, 0])
            self.initialized = True
            return measurement
        
        # Predict next state
        self.kf.predict()
        
        # Update with measurement
        self.kf.update(measurement)
        
        # Return smoothed position
        return self.kf.x[:2]
    
    def get_velocity(self) -> np.ndarray:
        """Get current velocity estimate [vx, vy]."""
        return self.kf.x[2:]


# ============================================================================
# BIOMECHANICAL CALCULATIONS
# ============================================================================

def calculate_angle(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> float:
    """
    Calculate the interior angle at point p2 formed by points p1-p2-p3.
    
    Args:
        p1, p2, p3: 2D or 3D coordinate arrays
        
    Returns:
        Angle in degrees (0-180)
    """
    v1 = p1 - p2
    v2 = p3 - p2
    
    cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    
    angle = np.arccos(cos_angle)
    return np.degrees(angle)


def calculate_center_of_mass(landmarks: List) -> np.ndarray:
    """
    Calculate Center of Mass (CoM) as midpoint between shoulders and hips.
    
    Physics Rationale:
    The human body's center of mass during climbing is approximated by the
    midpoint of the torso. This simplification is valid because:
    1. The torso contains ~50% of body mass
    2. Limb positions vary but average out over the climbing sequence
    3. For stability analysis, torso CoM is the critical reference point
    
    Args:
        landmarks: MediaPipe pose landmarks
        
    Returns:
        [x, y] coordinates of CoM in normalized space
    """
    # Get shoulder midpoint
    left_shoulder = np.array([landmarks[11].x, landmarks[11].y])
    right_shoulder = np.array([landmarks[12].x, landmarks[12].y])
    shoulder_mid = (left_shoulder + right_shoulder) / 2
    
    # Get hip midpoint
    left_hip = np.array([landmarks[23].x, landmarks[23].y])
    right_hip = np.array([landmarks[24].x, landmarks[24].y])
    hip_mid = (left_hip + right_hip) / 2
    
    # CoM is midpoint of torso
    com = (shoulder_mid + hip_mid) / 2
    
    return com


def calculate_torso_length(landmarks: List) -> float:
    """
    Calculate torso length for dynamic threshold scaling.
    
    Args:
        landmarks: MediaPipe pose landmarks
        
    Returns:
        Euclidean distance between shoulder and hip midpoints
    """
    left_shoulder = np.array([landmarks[11].x, landmarks[11].y])
    right_shoulder = np.array([landmarks[12].x, landmarks[12].y])
    shoulder_mid = (left_shoulder + right_shoulder) / 2
    
    left_hip = np.array([landmarks[23].x, landmarks[23].y])
    right_hip = np.array([landmarks[24].x, landmarks[24].y])
    hip_mid = (left_hip + right_hip) / 2
    
    return np.linalg.norm(shoulder_mid - hip_mid)


def calculate_flow_score(accelerations: List[np.ndarray], dt: float) -> Tuple[float, str]:
    """
    Calculate Flow Score based on Jerk (rate of change of acceleration) using CV.
    
    Physics Rationale - Jerk and Movement Smoothness:
    In biomechanics, "jerk" (the derivative of acceleration) is the gold standard
    for measuring movement smoothness. Low jerk indicates:
    1. Smooth, controlled transitions between movements
    2. Efficient force application without sudden corrections
    3. Superior motor planning and execution
    
    Scoring (based on CV of jerk):
    - CV < 50%: Expert level (score 80-100) - Very smooth movement
    - CV 50-100%: Intermediate (score 40-80) - Some micro-corrections
    - CV 100-150%: Beginner (score 10-40) - Noticeable jerkiness
    - CV > 150%: Needs work (score 0-10) - Significant instability
    
    Args:
        accelerations: List of 2D acceleration vectors (normalized coordinates)
        dt: Time step between frames (1/fps)
        
    Returns:
        Tuple of (flow_score, rating_string)
    """
    if len(accelerations) < 3:  # Need at least 3 points for jerk
        return 0.0, "Insufficient data"
    
    # Calculate jerk (derivative of acceleration)
    jerk_values = []
    for i in range(1, len(accelerations)):
        jerk = (accelerations[i] - accelerations[i-1]) / dt
        jerk_magnitude = np.linalg.norm(jerk)
        jerk_values.append(jerk_magnitude)
    
    if len(jerk_values) < 2:
        return 0.0, "Insufficient data"
    
    # Calculate statistics
    mean_jerk = np.mean(jerk_values)
    sigma_jerk = np.std(jerk_values)
    
    # Coefficient of Variation (CV) - frame-rate independent
    if mean_jerk > 0:
        cv_jerk = (sigma_jerk / mean_jerk) * 100
    else:
        cv_jerk = 0
    
    # Calculate score based on CV of jerk
    # Lower CV = smoother movement = higher score
    if cv_jerk < 50:
        # Expert range: 80-100
        score = 100 - (cv_jerk * 0.4)  # Linear from 100 at CV=0 to 80 at CV=50
        rating = "Expert"
    elif cv_jerk < 100:
        # Intermediate range: 40-80
        score = 80 - ((cv_jerk - 50) * 0.8)  # Linear from 80 at CV=50 to 40 at CV=100
        rating = "Intermediate"
    elif cv_jerk < 150:
        # Beginner range: 10-40
        score = 40 - ((cv_jerk - 100) * 0.6)  # Linear from 40 at CV=100 to 10 at CV=150
        rating = "Beginner"
    else:
        # Needs work: 0-10
        score = max(0, 10 - ((cv_jerk - 150) * 0.1))  # Approaches 0 as CV increases
        rating = "Needs work"
    
    # Ensure score is in valid range
    score = max(0, min(100, score))
    
    return round(score, 2), rating


def detect_contact_points(
    landmarks: List,
    previous_positions: deque,
    torso_length: float,
    current_static_flags: Dict[int, bool]
) -> List[ContactPoint]:
    """
    Detect static contact points (hands/feet) using temporal hysteresis.
    
    Temporal Hysteresis:
    To prevent flickering detection due to hand tremor on small holds:
    - Threshold to become static: 2% of torso length over 5 frames
    - Threshold to become non-static: 4% of torso length (2x higher)
    
    Args:
        landmarks: Current frame MediaPipe landmarks
        previous_positions: Deque of previous 5 frames' landmark positions
        torso_length: Current torso length for dynamic scaling
        current_static_flags: Dictionary tracking current static state
        
    Returns:
        List of ContactPoint objects
    """
    contact_points = []
    
    # Limb endpoints to check: wrists (15, 16) and ankles (27, 28)
    limb_indices = [15, 16, 27, 28]
    
    for idx in limb_indices:
        current_pos = np.array([landmarks[idx].x, landmarks[idx].y])
        
        # Check if we have enough history
        if len(previous_positions) < 5:
            contact_points.append(ContactPoint(
                landmark_id=idx,
                position=current_pos,
                frames_static=0,
                is_static=False
            ))
            continue
        
        # Calculate maximum movement over last 5 frames
        max_movement = 0
        for prev_frame in previous_positions:
            prev_pos = np.array([prev_frame[idx].x, prev_frame[idx].y])
            movement = np.linalg.norm(current_pos - prev_pos)
            max_movement = max(max_movement, movement)
        
        # Apply hysteresis thresholds
        currently_static = current_static_flags.get(idx, False)
        
        if currently_static:
            # Higher threshold to become non-static (4% of torso)
            threshold = torso_length * 0.04
            is_static = max_movement < threshold
        else:
            # Lower threshold to become static (2% of torso)
            threshold = torso_length * 0.02
            is_static = max_movement < threshold
        
        contact_points.append(ContactPoint(
            landmark_id=idx,
            position=current_pos,
            frames_static=5 if is_static else 0,
            is_static=is_static
        ))
    
    return contact_points


def check_stability(com: np.ndarray, contact_points: List[ContactPoint]) -> Tuple[bool, Optional[np.ndarray]]:
    """
    Check if CoM projection falls within support polygon.
    
    Args:
        com: Center of mass [x, y]
        contact_points: List of detected contact points
        
    Returns:
        Tuple of (is_stable, hull_points)
    """
    from scipy.spatial import ConvexHull
    
    static_points = [cp.position for cp in contact_points if cp.is_static]
    
    if len(static_points) < 3:
        # Cannot form a polygon, use distance-based check
        if len(static_points) == 2:
            # Check distance to line segment
            p1, p2 = static_points[0], static_points[1]
            line_vec = p2 - p1
            point_vec = com - p1
            line_len = np.linalg.norm(line_vec)
            line_unitvec = line_vec / (line_len + 1e-6)
            proj_length = np.dot(point_vec, line_unitvec)
            proj_length = np.clip(proj_length, 0, line_len)
            closest_point = p1 + line_unitvec * proj_length
            distance = np.linalg.norm(com - closest_point)
            # Consider stable if within 10% of torso length
            is_stable = distance < 0.1
            return is_stable, np.array(static_points)
        else:
            # 0 or 1 points - inherently unstable
            return False, np.array(static_points) if static_points else None
    
    # 3+ points: use convex hull
    try:
        hull = ConvexHull(static_points)
        hull_points = np.array(static_points)[hull.vertices]
        
        # Check if CoM is inside hull using cross product method
        is_inside = point_in_polygon(com, hull_points)
        
        return is_inside, hull_points
    except:
        return False, np.array(static_points)


def point_in_polygon(point: np.ndarray, polygon: np.ndarray) -> bool:
    """Check if point is inside polygon using ray casting algorithm."""
    n = len(polygon)
    inside = False
    
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if point[1] > min(p1y, p2y):
            if point[1] <= max(p1y, p2y):
                if point[0] <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (point[1] - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or point[0] <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    
    return inside


def detect_barn_door(
    contact_points: List[ContactPoint],
    landmarks: List,
    torso_rotation_history: deque,
    dt: float
) -> bool:
    """
    Detect "barn-dooring" - rotational instability when body swings away from wall.
    
    Detection Logic:
    1. Check for one-sided contact (all left OR all right)
    2. Calculate torso rotation angle (shoulder line)
    3. Measure angular velocity over last 5 frames
    4. Flag if rotation > 35 degrees/second
    
    Args:
        contact_points: List of current contact points
        landmarks: MediaPipe landmarks
        torso_rotation_history: Deque of recent torso angles
        dt: Time step between frames
        
    Returns:
        True if barn-dooring detected
    """
    static_points = [cp for cp in contact_points if cp.is_static]
    
    # Need at least 2 contact points for potential barn door
    if len(static_points) < 2:
        return False
    
    # Check if contact points are one-sided
    # Left side: indices 15 (left wrist), 27 (left ankle)
    # Right side: indices 16 (right wrist), 28 (right ankle)
    left_indices = {15, 27}
    right_indices = {16, 28}
    
    point_indices = {cp.landmark_id for cp in static_points}
    
    # Check if all points are on same side
    all_left = point_indices.issubset(left_indices) and len(point_indices) > 0
    all_right = point_indices.issubset(right_indices) and len(point_indices) > 0
    
    one_sided = all_left or all_right
    
    if not one_sided:
        return False
    
    # Calculate current torso rotation angle (shoulder line)
    left_shoulder = np.array([landmarks[11].x, landmarks[11].y])
    right_shoulder = np.array([landmarks[12].x, landmarks[12].y])
    shoulder_vec = right_shoulder - left_shoulder
    current_angle = np.arctan2(shoulder_vec[1], shoulder_vec[0])
    
    # Add to history
    torso_rotation_history.append(current_angle)
    
    # Need at least 5 frames of history to detect sustained rotation
    if len(torso_rotation_history) < 5:
        return False
    
    # Calculate angular velocity over last 5 frames
    angle_changes = []
    for i in range(len(torso_rotation_history) - 1):
        # Handle angle wrapping (-π to π)
        angle_diff = torso_rotation_history[i+1] - torso_rotation_history[i]
        # Normalize to [-π, π]
        angle_diff = np.arctan2(np.sin(angle_diff), np.cos(angle_diff))
        angle_changes.append(angle_diff)
    
    # Average angular velocity (radians/second)
    avg_angular_velocity = np.mean(angle_changes) / dt
    
    # Barn door threshold: 35 degrees/second = 0.611 radians/second
    barn_door_threshold = np.radians(35)
    
    # Detect barn door if sustained rotation exceeds threshold
    is_barn_door = abs(avg_angular_velocity) > barn_door_threshold
    
    return is_barn_door


# ============================================================================
# VIDEO PROCESSOR
# ============================================================================

class VideoProcessor:
    """
    Production-ready video processor with stream support and explicit cleanup.
    
    ARCHITECTURE NOTES:
    - Accepts both file paths (str) and file-like objects (BinaryIO)
    - For streams, creates temp file then cleans up
    - Explicit resource cleanup prevents MediaPipe/OpenCV memory leaks
    - No Django dependencies - can be tested in isolation
    """
    
    def __init__(self, model_path: str):
        """
        Args:
            model_path: Path to MediaPipe model file
        """
        self.model_path = model_path
        self._video_capture = None
        self._temp_file = None
    
    @contextmanager
    def _get_video_path(self, video_source: Union[str, BinaryIO]) -> str:
        """
        Context manager that handles both file paths and streams.
        For streams, creates a temporary file.
        """
        if isinstance(video_source, str):
            # Direct file path
            yield video_source
        else:
            # Stream - write to temp file
            self._temp_file = tempfile.NamedTemporaryFile(
                suffix='.mp4', 
                delete=False
            )
            try:
                # Stream in chunks to handle large files (memory-safe)
                for chunk in iter(lambda: video_source.read(8192), b''):
                    self._temp_file.write(chunk)
                self._temp_file.flush()
                yield self._temp_file.name
            finally:
                self._temp_file.close()
                if os.path.exists(self._temp_file.name):
                    os.unlink(self._temp_file.name)
    
    def process(
        self, 
        video_source: Union[str, BinaryIO],
        progress_callback: Optional[Callable[[int], None]] = None
    ) -> Dict:
        """
        Process video from path OR stream.
        
        Args:
            video_source: File path string OR file-like object (S3 compatible)
            progress_callback: Optional callback for progress updates (0-100)
            
        Returns:
            Dict with summary metrics and frame data
        """
        with self._get_video_path(video_source) as video_path:
            return self._process_video(video_path, progress_callback)
    
    def _process_video(self, video_path: str, progress_callback) -> Dict:
        """Internal processing logic with guaranteed cleanup"""
        try:
            # Initialize MediaPipe Pose Landmarker
            base_options = python.BaseOptions(model_asset_path=self.model_path)
            options = vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.VIDEO,
                num_poses=1,
                min_pose_detection_confidence=0.5,
                min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            
            # Open video
            self._video_capture = cv2.VideoCapture(video_path)
            fps = self._video_capture.get(cv2.CAP_PROP_FPS)
            if fps == 0:
                fps = 30  # Fallback
            dt = 1.0 / fps
            
            total_frames = int(self._video_capture.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(self._video_capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(self._video_capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            # Initialize Kalman filters for all landmarks
            landmark_filters = {i: LandmarkKalmanFilter(dt) for i in range(33)}
            
            # Storage for metrics
            all_metrics = []
            com_positions = []
            com_velocities = []
            com_accelerations = []
            
            # Temporal tracking
            previous_positions = deque(maxlen=5)
            current_static_flags = {}
            torso_rotation_history = deque(maxlen=5)
            
            frame_count = 0
            
            # Create pose landmarker
            with vision.PoseLandmarker.create_from_options(options) as landmarker:
                while self._video_capture.isOpened():
                    ret, frame = self._video_capture.read()
                    if not ret:
                        break
                    
                    # Update progress
                    if progress_callback:
                        progress = int((frame_count / total_frames) * 90)
                        progress_callback(progress)
                    
                    # Convert frame to MediaPipe Image
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                    
                    # Calculate timestamp in milliseconds
                    timestamp_ms = int(frame_count * 1000 / fps)
                    
                    # Detect pose landmarks
                    detection_result = landmarker.detect_for_video(mp_image, timestamp_ms)
                    
                    if detection_result.pose_landmarks and len(detection_result.pose_landmarks) > 0:
                        landmarks = detection_result.pose_landmarks[0]  # Get first person
                        
                        # Apply Kalman filtering to all landmarks
                        smoothed_landmarks = []
                        for i, lm in enumerate(landmarks):
                            measurement = np.array([lm.x, lm.y])
                            smoothed_pos = landmark_filters[i].update(measurement)
                            
                            # Create smoothed landmark
                            smoothed_lm = SimpleLandmark(
                                x=smoothed_pos[0],
                                y=smoothed_pos[1],
                                z=lm.z,
                                visibility=lm.visibility
                            )
                            smoothed_landmarks.append(smoothed_lm)
                        
                        # Calculate torso length
                        torso_length = calculate_torso_length(smoothed_landmarks)
                        
                        # Calculate Center of Mass
                        com = calculate_center_of_mass(smoothed_landmarks)
                        com_positions.append(com)
                        
                        # Calculate velocity and acceleration
                        if len(com_positions) >= 2:
                            velocity = (com_positions[-1] - com_positions[-2]) / dt
                            com_velocities.append(velocity)
                        else:
                            com_velocities.append(np.array([0.0, 0.0]))
                        
                        if len(com_velocities) >= 2:
                            acceleration = (com_velocities[-1] - com_velocities[-2]) / dt
                            com_accelerations.append(acceleration)
                        else:
                            com_accelerations.append(np.array([0.0, 0.0]))
                        
                        # Calculate elbow angles
                        # Left elbow: shoulder(11) -> elbow(13) -> wrist(15)
                        left_shoulder = np.array([smoothed_landmarks[11].x, smoothed_landmarks[11].y, smoothed_landmarks[11].z])
                        left_elbow = np.array([smoothed_landmarks[13].x, smoothed_landmarks[13].y, smoothed_landmarks[13].z])
                        left_wrist = np.array([smoothed_landmarks[15].x, smoothed_landmarks[15].y, smoothed_landmarks[15].z])
                        left_elbow_angle = calculate_angle(left_shoulder, left_elbow, left_wrist)
                        
                        # Right elbow: shoulder(12) -> elbow(14) -> wrist(16)
                        right_shoulder = np.array([smoothed_landmarks[12].x, smoothed_landmarks[12].y, smoothed_landmarks[12].z])
                        right_elbow = np.array([smoothed_landmarks[14].x, smoothed_landmarks[14].y, smoothed_landmarks[14].z])
                        right_wrist = np.array([smoothed_landmarks[16].x, smoothed_landmarks[16].y, smoothed_landmarks[16].z])
                        right_elbow_angle = calculate_angle(right_shoulder, right_elbow, right_wrist)
                        
                        # Hip Z-distance
                        hip_z = (smoothed_landmarks[23].z + smoothed_landmarks[24].z) / 2
                        
                        # Detect contact points
                        contact_points = detect_contact_points(
                            smoothed_landmarks,
                            previous_positions,
                            torso_length,
                            current_static_flags
                        )
                        
                        # Update static flags
                        current_static_flags = {cp.landmark_id: cp.is_static for cp in contact_points}
                        
                        # Check stability
                        is_stable, hull_points = check_stability(com, contact_points)
                        
                        # Detect barn-dooring (rotational instability)
                        barn_door = detect_barn_door(contact_points, smoothed_landmarks, torso_rotation_history, dt)
                        
                        # Store metrics
                        metrics = FrameMetrics(
                            frame_number=frame_count,
                            timestamp=frame_count / fps,
                            com_position=com,
                            com_velocity=com_velocities[-1],
                            com_acceleration=com_accelerations[-1],
                            left_elbow_angle=left_elbow_angle,
                            right_elbow_angle=right_elbow_angle,
                            hip_z_distance=hip_z,
                            contact_points=contact_points,
                            pose_landmarks=smoothed_landmarks,
                            is_stable=is_stable,
                            barn_door_warning=barn_door
                        )
                        all_metrics.append(metrics)
                        
                        # Update previous values
                        previous_positions.append(smoothed_landmarks)
                    
                    frame_count += 1
            
            # Calculate summary metrics
            summary = self._calculate_summary(all_metrics, fps)
            
            if progress_callback:
                progress_callback(100)
            
            return {
                'summary': summary,
                'frame_data': [self._metrics_to_dict(m) for m in all_metrics],
                'video_info': {
                    'fps': fps,
                    'total_frames': total_frames,
                    'width': width,
                    'height': height,
                    'duration': total_frames / fps
                }
            }
        finally:
            # CRITICAL: Explicit cleanup prevents memory leaks
            self._cleanup()
    
    def _cleanup(self):
        """Explicit resource cleanup - prevents memory leaks"""
        if self._video_capture is not None:
            self._video_capture.release()
            self._video_capture = None
        
        # Force garbage collection for MediaPipe
        gc.collect()
    
    def _calculate_summary(self, all_metrics: List[FrameMetrics], fps: float) -> Dict:
        """Calculate summary metrics from all frames"""
        if not all_metrics:
            return {
                'flow_score': 0.0,
                'flow_score_rating': 'No data',
                'stability_index_percent': 0.0,
                'flexion_index_percent': 0.0,
                'barn_door_events': 0,
                'avg_hip_distance': 0.0
            }
        
        # Extract accelerations for flow score
        accelerations = [m.com_acceleration for m in all_metrics]
        dt = 1.0 / fps
        flow_score, flow_rating = calculate_flow_score(accelerations, dt)
        
        # Elbow flexion index (% of frames with elbow < 90°)
        left_flexion_frames = sum(1 for m in all_metrics if m.left_elbow_angle < 90)
        right_flexion_frames = sum(1 for m in all_metrics if m.right_elbow_angle < 90)
        max_flexion_frames = max(left_flexion_frames, right_flexion_frames)
        flexion_index = (max_flexion_frames / len(all_metrics)) * 100
        
        # Stability index (% of frames stable)
        stable_frames = sum(1 for m in all_metrics if m.is_stable)
        stability_index = (stable_frames / len(all_metrics)) * 100
        
        # Barn door events
        barn_door_frames = sum(1 for m in all_metrics if m.barn_door_warning)
        
        # Average hip distance
        avg_hip_distance = np.mean([m.hip_z_distance for m in all_metrics])
        
        return {
            'flow_score': flow_score,
            'flow_score_rating': flow_rating,
            'stability_index_percent': round(stability_index, 2),
            'flexion_index_percent': round(flexion_index, 2),
            'barn_door_events': barn_door_frames,
            'avg_hip_distance': round(float(avg_hip_distance), 4)
        }
    
    def _metrics_to_dict(self, metrics: FrameMetrics) -> Dict:
        """Convert FrameMetrics to dictionary for JSON storage"""
        avg_elbow = (metrics.left_elbow_angle + metrics.right_elbow_angle) / 2
        quality_good = (
            metrics.is_stable
            and not metrics.barn_door_warning
            and 55 <= avg_elbow <= 160
            and abs(metrics.hip_z_distance) <= 0.4
        )

        return {
            'frame_number': metrics.frame_number,
            'timestamp': metrics.timestamp,
            'com_position': metrics.com_position.tolist(),
            'com_velocity': metrics.com_velocity.tolist(),
            'com_acceleration': metrics.com_acceleration.tolist(),
            'left_elbow_angle': metrics.left_elbow_angle,
            'right_elbow_angle': metrics.right_elbow_angle,
            'hip_z_distance': metrics.hip_z_distance,
            'frame_quality': 'good' if quality_good else 'bad',
            'is_stable': metrics.is_stable,
            'barn_door_warning': metrics.barn_door_warning,
            'pose_landmarks': [
                {
                    'id': index,
                    'x': lm.x,
                    'y': lm.y,
                    'z': lm.z,
                    'visibility': lm.visibility,
                }
                for index, lm in enumerate(metrics.pose_landmarks)
            ],
            'contact_points': [
                {
                    'landmark_id': cp.landmark_id,
                    'position': cp.position.tolist(),
                    'is_static': cp.is_static
                }
                for cp in metrics.contact_points
            ]
        }
