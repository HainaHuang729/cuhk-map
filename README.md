# CUHK Dining and Bus Map

香港中文大学校园餐饮和校巴地图。

## Files

- `index.html`: GitHub Pages 入口页，使用 Leaflet、OpenStreetMap 底图，并通过 Overpass API 实时读取校园道路、绿地/水体和 POI，同时显示可开关的校巴路线。
- `cuhk_map.html`: 本地生成的离线版页面，已经内嵌扩展道路、楼宇、绿地/水体、餐饮和功能 POI 数据，并引用本地校巴路线数据。
- `data/cuhk_bus_routes.js`: CUHK 校巴路线、站点、颜色、官方时刻表规则和小车位置估算函数。路线站序来自公开校内交通资料；可匹配的站点使用 OSM bus-stop/platform 节点，线路沿本地 OSM 校园道路中心线绘制。
- `data/cuhk_boundary.geojson`: CUHK 校园边界原始数据，当前页面不再显示边界图层。
- `data/cuhk_roads_poi_coffee_tea_clipped.geojson`: 扩展 bbox 内的道路、建筑轮廓、绿地/水体、餐饮和功能 POI 数据（沿用原文件名，但当前不再按边界裁剪）。
- `scripts/`: 生成、裁剪数据、补充建筑/餐饮 POI 和生成校巴道路路径用的脚本。

## Data

数据来自 OpenStreetMap / Overpass，遵循 ODbL；地图瓦片由 OpenStreetMap contributors 提供。

当前本地数据使用 2026-06-11 的 Overpass 查询结果，可识别到 37 个 POI：22 个餐厅/饭堂、2 个快餐/小食、7 个咖啡点、2 个医疗点、3 个住宿点、1 个码头。餐饮、茶饮、医疗、住宿和码头统一合并为“常用信息”显示开关，但地图小标仍保留各自的食、快、咖、茶、医、宿、渡样式。

离线底图已补充 196 个 OSM 建筑轮廓，并按建筑、车行路、服务路、步道/楼梯、绿地/水体分层绘制；楼宇名称可作为独立图层显示或关闭。

当前地图取消显示校园边界，避免边界线干扰道路和站点阅读；道路数据改用扩展 bbox 查询，不再按校园边界裁剪。

校巴路线包括 1A、1B、2、3、4、8、N、H、5、6A、6B、7 和收费穿梭小巴上下行。每条线路使用独立颜色，估算小车本体带方向箭头；线路默认关闭，地图图层面板中的“校巴路线”可一键显示或隐藏全部线路，也可单独显示或隐藏每条线路；图层面板和路线弹窗会显示对应时刻表。

校巴站点作为独立“站”标记一直显示在地图上，不跟随路线开关隐藏；选中站点后会显示站名、明确标注的上下行方向、途经线路、当前按时刻表估算的小车数量，以及每条途经线路的预计下一班到站时间。明确有上/下行区分的站点会按路线法线错开到道路两侧显示，未标方向的站点仍按同一站显示。

1A 使用已复核的 OSM 道路中心线路径；其他线路由 `scripts/generate_bus_route_paths.mjs` 将站点序列自动贴合到本地 OSM 可行车道路网络。收费小巴的部分中途点在 OSM 中没有独立 bus-stop 节点，仍使用地图锚点并贴近最近道路。

时刻表来自 CUHK Transport Office 官方页面/PDF：Monday to Saturday Shuttle、Night-time & Public Holidays、Meet-Class、Paid Shuttle Up/Down。地图上的小车位置不是实时 GPS，而是按香港时间、官方发车分钟、估算全程运行时间和当前路线折线插值得到；离线页面暂不自动判断公众假期或教学日。
