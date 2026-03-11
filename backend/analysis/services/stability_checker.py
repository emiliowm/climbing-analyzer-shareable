"""
Stability Analysis Service.

This service determines if a climber is in a stable position by checking
if their center of mass (CoM) projects inside the support polygon formed
by contact points.

Stability Theory:
- Support polygon = convex hull of all static contact points
- If CoM projects inside polygon → passively stable (gravity alone keeps balance)
- If CoM projects outside polygon → requires active muscular force to maintain position

Center of Mass Approximation:
- CoM = midpoint between shoulder midpoint and hip midpoint
- Approximates torso CoM (contains ~50% of body mass)
- Limb positions average out over climbing sequence
- See glossary.md for detailed explanation

Support Polygon Construction:
- Use only static contact points (from contact_detector)
- Minimum 2 points required for stability check
- 1 point: Always unstable (can't form polygon)
- 2 points: Check if CoM is between points (within 10% tolerance)
- 3+ points: Use point-in-polygon algorithm (ray casting)

Special Cases:
- 0 contact points: Unstable (mid-move)
- 1 contact point: Unstable (one-handed/one-footed)
- 2 contact points: Linear stability check
- 3+ contact points: Full polygon check

Stability Index:
- Percentage of frames where climber is stable
- Target: >70% for good technique
- Lower index suggests poor balance or rushed movements

Implementation Notes:
- Uses ray casting algorithm for point-in-polygon test
- Handles edge cases (collinear points, etc.)
- Will be migrated from app.py lines 413-462 in Phase 3

See glossary.md for detailed definitions of:
- Center of Mass (CoM)
- Support Polygon
- Stability Index
"""

# TODO: Implement in Phase 3 - Video Processing
# Copy from app.py lines 413-462 (check_stability, point_in_polygon functions)
# Add CoM calculation
# Add support polygon construction
# Add point-in-polygon algorithm


def check_stability(com_position, contact_points):
    """
    Check if center of mass is inside support polygon.
    
    Args:
        com_position: Center of mass coordinates (x, y)
        contact_points: List of static contact points
        
    Returns:
        bool: True if stable (CoM inside polygon), False otherwise
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("Stability checking will be implemented in Phase 3")


def point_in_polygon(point, polygon):
    """
    Ray casting algorithm to test if point is inside polygon.
    
    Args:
        point: (x, y) coordinates to test
        polygon: List of (x, y) vertices forming polygon
        
    Returns:
        bool: True if point is inside polygon
        
    TODO: Implement in Phase 3
    """
    raise NotImplementedError("Point-in-polygon test will be implemented in Phase 3")
