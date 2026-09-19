"""Add manoeuvres only when the dedicated walking response matches the transit leg.
Keep its original geometry and schedule: extra instructions must not silently reroute a traveller.
"""
import math
from app.models import WalkingSubstep
from app.services.instructions import walk_directions


def metres(a, b):
    return math.hypot((a[0]-b[0])*111320*math.cos(math.radians(a[1])), (a[1]-b[1])*111320)


def distance_to_path(point, path):
    scale = 111320 * math.cos(math.radians(point[1]))
    def xy(p):
        return ((p[0]-point[0])*scale,(p[1]-point[1])*111320)
    best = float('inf')
    for a,b in zip(path,path[1:]):
        ax,ay = xy(a); bx,by = xy(b)
        dx,dy = bx-ax,by-ay
        t = max(0,min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy or 1)))
        best = min(best,math.hypot(ax+t*dx,ay+t*dy))
    return best


def walking_substeps(detail, coords, seconds, leg_id):
    if not detail or len(coords) < 2:
        return []
    from app.services.itinerary import decode_polyline
    try:
        shape = decode_polyline(detail['route_geometry'])
        # Deliberately conservative. Reject a different or more coarsely sampled path.
        if not shape or metres(shape[0], coords[0]) > 15 or metres(shape[-1], coords[-1]) > 15:
            return []
        if any(distance_to_path(p,coords) > 10 for p in shape):
            return []
        if any(distance_to_path(p,shape) > 10 for p in coords):
            return []
        rows = [r for r in detail['route_instructions'] if float(r[2]) > 0]
        if not rows:
            return []
        distance = sum(float(r[2]) for r in rows)
        length = sum(metres(a,b) for a,b in zip(coords,coords[1:]))
        if abs(distance-length) > max(20, length*0.12):
            return []
        # Matched detail may sample the same path more densely. Use it for substep highlights.
        coords = shape
        anchors = []
        for row in rows:
            lat, lon = map(float, row[3].split(','))
            point = [lon,lat]
            index = min(range(len(coords)), key=lambda i: metres(point,coords[i]))
            if metres(point,coords[index]) > 15 or anchors and index < anchors[-1]:
                return []
            anchors.append(index)
        out = []
        elapsed = 0
        cumulative = 0
        for i, row in enumerate(rows):
            turn = str(row[0]).upper().replace(' ', '_')
            turn = {'SLIGHT_LEFT':'SLIGHTLY_LEFT','SLIGHT_RIGHT':'SLIGHTLY_RIGHT','STRAIGHT':'CONTINUE','UTURN':'UTURN_LEFT','SHARP_RIGHT':'HARD_RIGHT','SHARP_LEFT':'HARD_LEFT'}.get(turn,turn)
            if i == 0:
                turn = 'DEPART'
            if turn not in {'DEPART','LEFT','RIGHT','SLIGHTLY_LEFT','SLIGHTLY_RIGHT','HARD_LEFT','HARD_RIGHT','CONTINUE','UTURN_LEFT','UTURN_RIGHT'}:
                return []
            instruction = walk_directions([{'distance':row[2], 'streetName':row[1], 'relativeDirection':turn,
                                           'absoluteDirection':str(row[6]).upper().replace(' ','')}])[0]
            end = anchors[i+1] if i+1 < len(anchors) else len(coords)-1
            if end <= anchors[i]:
                return []
            cumulative += float(row[2])
            total = round(seconds*cumulative/distance)
            out.append(WalkingSubstep(id=f'{leg_id}-walk-{i+1}', instruction=instruction, maneuver=turn,
                                      distance_metres=round(float(row[2])), duration_seconds=total-elapsed,
                                      coordinates=coords[anchors[i]:end+1]))
            elapsed = total
        return out
    except (KeyError, ValueError, TypeError, IndexError, OverflowError):
        return []
