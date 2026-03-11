"""
Contact Point Detection Service.

This service detects when a climber's hands and feet are in contact with
the climbing wall using temporal hysteresis to prevent flickering.

Detection Strategy:
- Track wrist (15, 16) and ankle (27, 28) landmarks
- Landmark is "static" if movement < threshold for N consecutive frames
- Use different thresholds for becoming static vs. leaving static (hysteresis)

Temporal Hysteresis Thresholds:
- Become static: Movement < 2% of torso length over 5 frames
- Leave static: Movement > 4% of torso length (2x higher)
- Prevents flickering when hand/foot is nearly stationary

Why Torso-Relative Thresholds:
- Makes detection body-size independent
- Tall climber and short climber use same % threshold
- Torso length = distance between shoulder midpoint and hip midpoint

Contact Point States:
- is_static: Boolean indicating if currently in contact
- frames_static: Counter for how long contact has been maintained
- position: Current landmark position (for stability analysis)

Implementation Notes:
- Requires 5 consecutive frames below threshold to register contact
- Single frame above threshold breaks contact (with hysteresis)
- Contact points feed into stability analysis
- Will be migrated from app.py lines 310-410 in Phase 3

See glossary.md for detailed definitions of:
- Contact Point
- Temporal Hysteresis
- Torso Length
"""

# TODO: Implement in Phase 3 - Video Processing
# Copy from app.py lines 310-410 (detect_contact_points function)
# Add ContactPoint dataclass
# Add temporal hysteresis logic
# Add torso-relative threshold calculation


def detect_contact_points(landmarks, torso_length, previous_contacts):
    """
    Detect static contact points (hands/feet on wall).
    
    Args:
        landmarks: Current frame landmarks from MediaPipe
        torso_length: Normalized torso length for threshold scaling
        previous_contacts: Contact points from previous frame
        
    Returns:
        list[ContactPoint]: Updated contact points with static status
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("Contact detection will be implemented in Phase 3")
