# CUHK Coffee and Tea Map

香港中文大学咖啡/茶饮地图。

## Files

- `index.html`: GitHub Pages 入口页，使用 Leaflet、OpenStreetMap 底图，并通过 Overpass API 实时读取校园道路、绿地/水体和咖啡/茶饮 POI。
- `cuhk_map.html`: 本地生成的离线版页面，已经内嵌 CUHK 边界、道路和 POI 数据。
- `data/cuhk_boundary.geojson`: CUHK 校园边界。
- `data/cuhk_roads_poi_coffee_tea_clipped.geojson`: 已裁剪到校园边界内的道路和咖啡/茶饮 POI 数据。
- `scripts/`: 生成和裁剪数据用的脚本。

## Data

数据来自 OpenStreetMap / Overpass，遵循 ODbL；地图瓦片由 OpenStreetMap contributors 提供。

当前 OSM 数据中可识别到 8 个咖啡类 POI，暂未识别到明确的奶茶类 POI。
