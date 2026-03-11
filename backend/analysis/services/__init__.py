"""
Analysis Services Package.

This package contains all video analysis services for the climbing
technique analyzer. Services are organized by responsibility:

- pose_detector: MediaPipe pose detection
- kalman_filter: Landmark smoothing
- contact_detector: Hand/foot contact detection
- stability_checker: Balance analysis
- barn_door_detector: Rotational instability detection
- metrics_calculator: Flow score and biomechanical metrics

All services will be implemented in Phase 3 (Video Processing).
Currently, these are placeholder modules with comprehensive documentation.
"""

# Service imports (will be uncommented in Phase 3)
# from .pose_detector import detect_pose
# from .kalman_filter import LandmarkKalmanFilter
# from .contact_detector import detect_contact_points
# from .stability_checker import check_stability, point_in_polygon
# from .barn_door_detector import detect_barn_door
# from .metrics_calculator import (
#     calculate_flow_score,
#     calculate_center_of_mass,
#     calculate_torso_length
# )

__all__ = [
    # 'detect_pose',
    # 'LandmarkKalmanFilter',
    # 'detect_contact_points',
    # 'check_stability',
    # 'point_in_polygon',
    # 'detect_barn_door',
    # 'calculate_flow_score',
    # 'calculate_center_of_mass',
    # 'calculate_torso_length',
]
