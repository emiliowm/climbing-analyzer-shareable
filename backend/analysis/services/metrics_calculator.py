"""
Metrics Calculation Service.

This service calculates biomechanical metrics from pose data, including
the Flow Score (movement smoothness) and other technique indicators.

Flow Score (0-100):
- Measures movement smoothness based on jerk (rate of change of acceleration)
- Lower jerk = smoother movement = better technique
- Expert climbers plan movements in advance and move decisively

Flow Score Calculation:
1. Calculate center of mass (CoM) for each frame
2. Compute velocity (first derivative of position)
3. Compute acceleration (second derivative of position)
4. Compute jerk (third derivative of position)
5. Calculate coefficient of variation (CV) of jerk
6. Map CV to 0-100 score using calibrated bands

Coefficient of Variation (CV):
- CV = (standard deviation / mean) × 100
- Makes score frame-rate independent
- 30fps and 60fps videos produce comparable scores

Scoring Bands:
| CV Range  | Score Range | Rating        |
|-----------|-------------|---------------|
| < 50%     | 80-100      | Expert        |
| 50-100%   | 40-80       | Intermediate  |
| 100-150%  | 10-40       | Beginner      |
| > 150%    | 0-10        | Needs work    |

Other Metrics:
- Stability Index: % of frames where CoM is inside support polygon
- Flexion Index: % of frames with elbow angle < 90° (over-pulling)
- Barn Door Events: Count of rotational instability occurrences
- Average Hip Distance: Mean distance from wall (body positioning)

Implementation Notes:
- Uses numpy for efficient array operations
- Handles edge cases (division by zero, etc.)
- Will be migrated from app.py lines 153-307 in Phase 3

See glossary.md for detailed definitions of:
- Flow Score
- Jerk
- Coefficient of Variation (CV)
- Stability Index
- Lock-off / Flexion Index
"""

# TODO: Implement in Phase 3 - Video Processing
# Copy from app.py lines 153-307 (calculate_flow_score and related functions)
# Add CoM calculation
# Add velocity/acceleration/jerk computation
# Add CV calculation and scoring bands


def calculate_flow_score(frame_metrics):
    """
    Calculate Flow Score from frame-by-frame metrics.
    
    Args:
        frame_metrics: List of FrameMetrics objects
        
    Returns:
        tuple: (flow_score: float, rating: str, cv: float)
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("Flow score calculation will be implemented in Phase 3")


def calculate_center_of_mass(landmarks):
    """
    Calculate center of mass from pose landmarks.
    
    Args:
        landmarks: MediaPipe pose landmarks
        
    Returns:
        numpy.ndarray: CoM position (x, y)
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("CoM calculation will be implemented in Phase 3")


def calculate_torso_length(landmarks):
    """
    Calculate torso length for body-size-independent thresholds.
    
    Args:
        landmarks: MediaPipe pose landmarks
        
    Returns:
        float: Normalized torso length
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("Torso length calculation will be implemented in Phase 3")
