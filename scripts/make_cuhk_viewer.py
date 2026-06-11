from pathlib import Path
import json

from make_luohu_viewer import TEMPLATE


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ROOT / "outputs"


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    boundary = load_json(OUTPUTS / "cuhk_boundary.geojson")
    data_path = OUTPUTS / "cuhk_roads_poi_coffee_tea_clipped.geojson"
    if not data_path.exists():
        data_path = OUTPUTS / "cuhk_roads_poi_coffee_tea.geojson"
    roads_poi = load_json(data_path)

    template = (
        TEMPLATE
        .replace("罗湖区开源地图", "香港中文大学地图")
        .replace("罗湖区", "香港中文大学")
        .replace("已裁剪至罗湖边界", "已裁剪至校园边界")
        .replace("咖啡 / 奶茶茶饮店地图（OSM 增强筛选）", "校园咖啡 / 茶饮地图（OSM）")
        .replace("POI（咖啡/奶茶）", "POI（咖啡/茶饮）")
    )

    html_text = template.replace(
        "__BOUNDARY_DATA__",
        json.dumps(boundary, ensure_ascii=False, separators=(",", ":")),
    ).replace(
        "__MAP_DATA__",
        json.dumps(roads_poi, ensure_ascii=False, separators=(",", ":")),
    )

    output_path = OUTPUTS / "cuhk_map.html"
    output_path.write_text(html_text, encoding="utf-8")

    print(
        json.dumps(
            {
                "output": str(output_path),
                "data": str(data_path),
                "boundary_features": len(boundary.get("features", [])),
                "map_features": len(roads_poi.get("features", [])),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
