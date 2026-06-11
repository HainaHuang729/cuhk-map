import json
import sys
from collections import Counter
from pathlib import Path


NAME_KEYS = ("name", "name:zh", "name:zh-Hans", "name:en")
TEXT_KEYS = NAME_KEYS + ("brand", "operator", "cuisine", "shop", "amenity")

COFFEE_KEYWORDS = (
    "咖啡",
    "coffee",
    "café",
    "cafe",
    "mccafé",
    "mccafe",
    "星巴克",
    "瑞幸",
    "luckin",
    "库迪",
    "manner",
    "太平洋咖啡",
    "kcoffee",
)

MILK_TEA_KEYWORDS = (
    "奶茶",
    "茶饮",
    "喜茶",
    "奈雪",
    "贡茶",
    "gong cha",
    "霸王茶姬",
    "古茗",
    "蜜雪冰城",
    "茉莉奶白",
    "一点点",
    "茶百道",
    "沪上阿姨",
    "益禾堂",
    "柠季",
    "书亦",
    "bubble tea",
    "bubble_tea",
)


def name_of(props):
    for key in NAME_KEYS:
        value = props.get(key)
        if value:
            return str(value).strip()
    return ""


def text_of(props):
    return " ".join(str(props.get(key, "")) for key in TEXT_KEYS).lower()


def beverage_category(props):
    cuisine = str(props.get("cuisine", "")).lower()
    shop = props.get("shop")
    text = text_of(props)

    if "bubble_tea" in cuisine or "bubble tea" in cuisine:
        return "milk_tea"
    if any(keyword.lower() in text for keyword in MILK_TEA_KEYWORDS):
        return "milk_tea"
    if cuisine == "tea" and any(keyword.lower() in text for keyword in ("tea", "茶", "茗")):
        return "milk_tea"
    if shop == "beverages" and any(keyword.lower() in text for keyword in MILK_TEA_KEYWORDS):
        return "milk_tea"

    if cuisine == "coffee_shop":
        return "coffee"
    if any(keyword.lower() in text for keyword in COFFEE_KEYWORDS):
        return "coffee"
    return ""


def point_from_overpass_element(element):
    if element.get("type") == "node" and "lat" in element and "lon" in element:
        return [element["lon"], element["lat"]]
    center = element.get("center")
    if center and "lat" in center and "lon" in center:
        return [center["lon"], center["lat"]]
    return None


def main():
    if len(sys.argv) != 4:
        raise SystemExit(
            "Usage: build_enriched_coffee_tea_geojson.py base.geojson overpass.json output.geojson"
        )

    base_path = Path(sys.argv[1])
    overpass_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    base = json.loads(base_path.read_text(encoding="utf-8"))
    overpass = json.loads(overpass_path.read_text(encoding="utf-8"))

    non_points = [
        feature
        for feature in base.get("features", [])
        if (feature.get("geometry") or {}).get("type") != "Point"
    ]

    poi_features = []
    skipped = Counter()
    seen = set()
    for element in overpass.get("elements", []):
        props = dict(element.get("tags") or {})
        osm_id = f"{element.get('type')}/{element.get('id')}"
        props["@id"] = osm_id

        if osm_id in seen:
            continue
        seen.add(osm_id)

        if not name_of(props):
            skipped["unnamed"] += 1
            continue

        category = beverage_category(props)
        if not category:
            skipped["not_beverage"] += 1
            continue

        point = point_from_overpass_element(element)
        if not point:
            skipped["no_point"] += 1
            continue

        props["drink_category"] = category
        poi_features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "Point", "coordinates": point},
            }
        )

    poi_features.sort(
        key=lambda feature: (
            feature["properties"].get("drink_category", ""),
            name_of(feature["properties"]),
            feature["properties"].get("@id", ""),
        )
    )

    counts = Counter(feature["properties"]["drink_category"] for feature in poi_features)
    result = {
        "type": "FeatureCollection",
        "name": output_path.stem,
        "features": non_points + poi_features,
        "metadata": {
            **base.get("metadata", {}),
            "source": "OpenStreetMap via targeted Overpass query",
            "poi_filter_7": "targeted coffee and milk-tea query over nodes, ways, and relations",
            "kept_beverage_poi_count": len(poi_features),
            "kept_beverage_categories": dict(counts),
            "overpass_timestamp": overpass.get("osm3s", {}).get("timestamp_osm_base"),
            "skipped_candidates": dict(skipped),
        },
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    geometry_counts = Counter((feature.get("geometry") or {}).get("type") for feature in result["features"])
    print(
        json.dumps(
            {
                "output": str(output_path),
                "features": len(result["features"]),
                "poi": len(poi_features),
                "poi_categories": dict(counts.most_common()),
                "geometry_counts": dict(geometry_counts),
                "skipped": dict(skipped),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
