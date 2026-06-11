import json
import math
import sys
from pathlib import Path


EPS = 1e-10


def pairwise(ring):
    for index in range(len(ring) - 1):
        yield ring[index], ring[index + 1]


def close_ring(ring):
    if not ring:
        return ring
    if almost_same(ring[0], ring[-1]):
        return ring
    return ring + [ring[0]]


def almost_same(a, b, eps=EPS):
    return abs(a[0] - b[0]) <= eps and abs(a[1] - b[1]) <= eps


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1]]


def add(a, b):
    return [a[0] + b[0], a[1] + b[1]]


def mul(a, scalar):
    return [a[0] * scalar, a[1] * scalar]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def distance2(a, b):
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def point_on_segment(point, a, b):
    ab = sub(b, a)
    ap = sub(point, a)
    scale = max(1.0, math.hypot(ab[0], ab[1]))
    if abs(cross(ab, ap)) > EPS * scale:
        return False
    return (
        min(a[0], b[0]) - EPS <= point[0] <= max(a[0], b[0]) + EPS
        and min(a[1], b[1]) - EPS <= point[1] <= max(a[1], b[1]) + EPS
    )


def point_in_ring(point, ring):
    x, y = point
    inside = False
    closed = close_ring(ring)
    for a, b in pairwise(closed):
        if point_on_segment(point, a, b):
            return 0
        xi, yi = a
        xj, yj = b
        if (yi > y) != (yj > y):
            x_intersect = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_intersect:
                inside = not inside
    return 1 if inside else -1


def point_in_polygon(point, polygon):
    if not polygon:
        return False
    outer = point_in_ring(point, polygon[0])
    if outer == -1:
        return False
    for hole in polygon[1:]:
        in_hole = point_in_ring(point, hole)
        if in_hole == 1:
            return False
    return True


def point_in_boundary(point, polygons):
    return any(point_in_polygon(point, polygon) for polygon in polygons)


def extract_polygons(geojson):
    features = geojson.get("features", []) if geojson.get("type") == "FeatureCollection" else [geojson]
    polygons = []
    for feature in features:
        geometry = feature.get("geometry", feature)
        if not geometry:
            continue
        if geometry.get("type") == "Polygon":
            polygons.append(geometry["coordinates"])
        elif geometry.get("type") == "MultiPolygon":
            polygons.extend(geometry["coordinates"])
    return polygons


def bbox_of_segment(a, b):
    return (
        min(a[0], b[0]) - EPS,
        min(a[1], b[1]) - EPS,
        max(a[0], b[0]) + EPS,
        max(a[1], b[1]) + EPS,
    )


def bboxes_overlap(a, b):
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def boundary_edges(polygons):
    edges = []
    for polygon in polygons:
        for ring in polygon:
            for a, b in pairwise(close_ring(ring)):
                edges.append((a, b, bbox_of_segment(a, b)))
    return edges


def segment_intersection_ts(p1, p2, edges):
    segment_bbox = bbox_of_segment(p1, p2)
    direction = sub(p2, p1)
    denom_self = dot(direction, direction)
    if denom_self <= EPS:
        return [0.0, 1.0]

    ts = [0.0, 1.0]
    for q1, q2, edge_bbox in edges:
        if not bboxes_overlap(segment_bbox, edge_bbox):
            continue
        edge = sub(q2, q1)
        denominator = cross(direction, edge)
        qp = sub(q1, p1)

        if abs(denominator) <= EPS:
            if abs(cross(qp, direction)) > EPS:
                continue
            t0 = dot(sub(q1, p1), direction) / denom_self
            t1 = dot(sub(q2, p1), direction) / denom_self
            start = max(0.0, min(t0, t1))
            end = min(1.0, max(t0, t1))
            if start <= end + EPS:
                ts.extend([start, end])
            continue

        t = cross(qp, edge) / denominator
        u = cross(qp, direction) / denominator
        if -EPS <= t <= 1.0 + EPS and -EPS <= u <= 1.0 + EPS:
            ts.append(min(1.0, max(0.0, t)))

    ts.sort()
    unique = []
    for t in ts:
        if not unique or abs(t - unique[-1]) > EPS:
            unique.append(t)
    return unique


def interpolate(p1, p2, t):
    return add(p1, mul(sub(p2, p1), t))


def clip_segment(p1, p2, polygons, edges):
    ts = segment_intersection_ts(p1, p2, edges)
    pieces = []
    for start, end in zip(ts, ts[1:]):
        if end - start <= EPS:
            continue
        mid = interpolate(p1, p2, (start + end) / 2)
        if point_in_boundary(mid, polygons):
            a = interpolate(p1, p2, start)
            b = interpolate(p1, p2, end)
            if distance2(a, b) > EPS * EPS:
                pieces.append([a, b])
    return pieces


def append_piece(parts, piece):
    if not piece or len(piece) < 2:
        return
    a, b = piece
    if distance2(a, b) <= EPS * EPS:
        return
    if parts and almost_same(parts[-1][-1], a):
        parts[-1].append(b)
    else:
        parts.append([a, b])


def clip_linestring(coords, polygons, edges):
    parts = []
    for p1, p2 in pairwise(coords):
        for piece in clip_segment(p1, p2, polygons, edges):
            append_piece(parts, piece)
    return [part for part in parts if len(part) >= 2]


def all_coords_inside(geometry, polygons):
    coords = []

    def collect(value):
        if isinstance(value, list) and len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
            coords.append(value)
            return
        if isinstance(value, list):
            for child in value:
                collect(child)

    collect(geometry.get("coordinates", []))
    return bool(coords) and all(point_in_boundary(coord, polygons) for coord in coords)


def clipped_feature(feature, polygons, edges, stats):
    geometry = feature.get("geometry")
    if not geometry:
        return None

    geom_type = geometry.get("type")
    props = feature.get("properties", {})

    if geom_type == "Point":
        if point_in_boundary(geometry["coordinates"], polygons):
            stats["points_kept"] += 1
            return feature
        stats["points_dropped"] += 1
        return None

    if geom_type == "LineString":
        parts = clip_linestring(geometry["coordinates"], polygons, edges)
        if not parts:
            stats["lines_dropped"] += 1
            return None
        stats["lines_kept"] += 1
        new_geometry = {"type": "LineString", "coordinates": parts[0]}
        if len(parts) > 1:
            new_geometry = {"type": "MultiLineString", "coordinates": parts}
        return {"type": "Feature", "properties": props, "geometry": new_geometry}

    if geom_type == "MultiLineString":
        all_parts = []
        for line in geometry["coordinates"]:
            all_parts.extend(clip_linestring(line, polygons, edges))
        if not all_parts:
            stats["lines_dropped"] += 1
            return None
        stats["lines_kept"] += 1
        new_geometry = {"type": "LineString", "coordinates": all_parts[0]}
        if len(all_parts) > 1:
            new_geometry = {"type": "MultiLineString", "coordinates": all_parts}
        return {"type": "Feature", "properties": props, "geometry": new_geometry}

    if geom_type in {"Polygon", "MultiPolygon"}:
        if all_coords_inside(geometry, polygons):
            stats["polygons_kept"] += 1
            return feature
        stats["polygons_dropped"] += 1
        return None

    stats["unsupported_dropped"] += 1
    return None


def main():
    if len(sys.argv) != 4:
        raise SystemExit(
            "Usage: clip_geojson_to_boundary.py boundary.geojson input.geojson output.geojson"
        )

    boundary_path = Path(sys.argv[1])
    input_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    boundary = json.loads(boundary_path.read_text(encoding="utf-8"))
    source = json.loads(input_path.read_text(encoding="utf-8"))
    polygons = extract_polygons(boundary)
    if not polygons:
        raise SystemExit("No Polygon or MultiPolygon geometry found in boundary file")

    edges = boundary_edges(polygons)
    stats = {
        "points_kept": 0,
        "points_dropped": 0,
        "lines_kept": 0,
        "lines_dropped": 0,
        "polygons_kept": 0,
        "polygons_dropped": 0,
        "unsupported_dropped": 0,
    }

    features = []
    for feature in source.get("features", []):
        clipped = clipped_feature(feature, polygons, edges, stats)
        if clipped:
            features.append(clipped)

    result = {
        "type": "FeatureCollection",
        "name": output_path.stem,
        "features": features,
        "metadata": {
            **source.get("metadata", {}),
            "clip_boundary": boundary_path.name,
            "clip_method": "segment intersections with midpoint-in-polygon filtering",
        },
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    counts = {}
    for feature in features:
        geom_type = feature["geometry"]["type"]
        counts[geom_type] = counts.get(geom_type, 0) + 1

    print(
        json.dumps(
            {
                "output": str(output_path),
                "features": len(features),
                "geometry_counts": counts,
                "stats": stats,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
