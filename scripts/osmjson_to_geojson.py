import json
import sys


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: osmjson_to_geojson.py input.osm.json output.geojson")

    input_path, output_path = sys.argv[1], sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as f:
        osm = json.load(f)

    elements = osm.get("elements", [])
    nodes = {
        el["id"]: (el["lon"], el["lat"])
        for el in elements
        if el.get("type") == "node" and "lat" in el and "lon" in el
    }

    features = []
    for el in elements:
        el_type = el.get("type")
        tags = el.get("tags") or {}
        if not tags:
            continue

        props = dict(tags)
        props["@id"] = f"{el_type}/{el.get('id')}"

        geometry = None
        if el_type == "node" and "lat" in el and "lon" in el:
            geometry = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
        elif el_type == "way":
            coords = [nodes[node_id] for node_id in el.get("nodes", []) if node_id in nodes]
            if len(coords) < 2:
                continue
            if len(coords) >= 4 and coords[0] == coords[-1] and any(
                key in tags for key in ("building", "landuse", "leisure", "natural")
            ):
                geometry = {"type": "Polygon", "coordinates": [coords]}
            else:
                geometry = {"type": "LineString", "coordinates": coords}

        if geometry:
            features.append({"type": "Feature", "properties": props, "geometry": geometry})

    collection = {
        "type": "FeatureCollection",
        "name": "luohu_roads_poi_osm",
        "features": features,
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "license": "ODbL",
            "attribution": "© OpenStreetMap contributors",
            "osm_timestamp": osm.get("osm3s", {}).get("timestamp_osm_base"),
        },
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(collection, f, ensure_ascii=False, separators=(",", ":"))

    counts = {}
    for feature in features:
        geom_type = feature["geometry"]["type"]
        counts[geom_type] = counts.get(geom_type, 0) + 1
    print(json.dumps({"features": len(features), "geometry_counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
