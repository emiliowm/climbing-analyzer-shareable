"""
Barn Door Detection Service.

This service detects "barn-dooring" - a rotational instability where the
climber's body swings away from the wall like a door on hinges.

Barn Door Phenomenon:
- Occurs when all contact points are on one side of the body
- Body rotates around the contact line (acts as hinge)
- Common beginner mistake, wastes energy, increases fall risk

Detection Criteria (ALL must be true):
1. All contact points on one side (left OR right, not both)
2. Torso rotation > 35°/second (rapid rotation)
3. Sustained rotation over 5+ consecutive frames

Why These Thresholds:
- 35°/s: Fast enough to indicate loss of control (not intentional movement)
- 5 frames: Filters out brief rotations during normal movement
- One-sided contacts: Structural requirement for barn-dooring

Torso Rotation Calculation:
- Use shoulder line angle (left shoulder to right shoulder)
- Compare angle between consecutive frames
- Convert to degrees/second based on video FPS

Prevention Techniques:
- Keep contact points on both sides of body
- Maintain three points of contact when possible
- Flag arm position (straight arm on side with fewer contacts)

Barn Door Events:
- Count total barn door occurrences in video
- Each sustained rotation (5+ frames) counts as one event
- Used in summary metrics and technique feedback

Implementation Notes:
- Requires contact point data from contact_detector
- Requires shoulder landmarks for rotation calculation
- Will be migrated from app.py lines 465-560 in Phase 3

See glossary.md for detailed definition of:
- Barn Door (Barn-Dooring)
"""

# TODO: Implement in Phase 3 - Video Processing
# Copy from app.py lines 465-560 (detect_barn_door function)
# Add rotation calculation
# Add one-sided contact check
# Add sustained rotation tracking


def detect_barn_door(landmarks, contact_points, previous_rotation_frames):
    """
    Detect barn-dooring (rotational instability).
    
    Args:
        landmarks: Current frame landmarks from MediaPipe
        contact_points: List of static contact points
        previous_rotation_frames: Counter for sustained rotation
        
    Returns:
        tuple: (is_barn_dooring: bool, rotation_frames: int)
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("Barn door detection will be implemented in Phase 3")
