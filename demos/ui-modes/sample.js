(() => {
  "use strict";
  const DATA = window.CAMPUS_SAMPLE;
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const escape = (text) =>
    String(text ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const icons = () => window.lucide.createIcons();
  const latlng = (coord) => [coord[1], coord[0]];
  const colors = {
    1: "#725786",
    2: "#437e80",
    "2S": "#437e80",
    8: "#b4823f",
    N: "#6c7995",
    H: "#81749b",
    3: "#827d55",
    4: "#91667c",
  };
  const route = (id) => DATA.routes.find((row) => row.id === id);
  const badge = (id) =>
    `<span class="route-badge" style="--route-color:${colors[id] || "#806591"}">${escape(id)}</span>`;
  const scenes = [
    ["map", "地图", "map"],
    ["menu", "侧边栏", "panel-left"],
    ["bus", "校巴气泡", "bus-front"],
    ["stop", "站点气泡", "map-pin"],
    ["dining", "餐厅", "utensils"],
    ["search", "搜索", "search"],
    ["navigation", "导航方案", "route"],
    ["metro", "线路图", "git-commit-horizontal"],
    ["calendar", "校历", "calendar-days"],
    ["schedule", "日程表", "calendar-clock"],
    ["manage", "课程管理", "notebook-tabs"],
    ["add", "添加", "calendar-plus"],
    ["boarding", "上车", "log-in"],
    ["weather", "天气", "cloud-sun"],
    ["feedback", "反馈", "message-square"],
  ];
  const themeSets = {
    abc: [
      { id: "a", name: "轻紫", note: "清晰 · 轻量" },
      { id: "b", name: "深紫", note: "鲜明 · 聚焦" },
      { id: "c", name: "金线", note: "留白 · 克制" },
    ],
    de: [
      { id: "d", name: "站牌", note: "交通导视 · 紧凑" },
      { id: "e", name: "轻透", note: "底部展开 · 轻盈" },
    ],
    fg: [
      { id: "f", name: "紫夜", note: "深色地图 · 夜间" },
      { id: "g", name: "极简", note: "平面留白 · 专注" },
    ],
  };
  themeSets.af = [themeSets.abc[0], themeSets.fg[0]];
  const params = new URLSearchParams(location.search);
  const activeSet = Object.hasOwn(themeSets, params.get("set"))
    ? params.get("set")
    : "af";
  const themes = themeSets[activeSet];
  const initialTheme = themes.some((theme) => theme.id === params.get("theme"))
    ? params.get("theme")
    : themes[0].id;
  document.body.dataset.themeSet = activeSet;
  document
    .querySelector(".comparison")
    .style.setProperty(
      "--preview-count",
      activeSet === "af" ? 1 : themes.length,
    );
  document.querySelector(".edition-nav").innerHTML = [
    ["af", "A / F 双模式"],
    ["abc", "A–C"],
    ["de", "D–E"],
    ["fg", "F–G"],
  ]
    .map(([id, name]) => {
      const url = new URL(location.href);
      url.searchParams.set("set", id);
      return `<a href="${escape(url.href)}" ${id === activeSet ? 'aria-current="page"' : ""}>${name}</a>`;
    })
    .join("");
  document.querySelector(".mobile-variants").innerHTML = themes
    .map(
      (theme, index) =>
        `<button role="tab" aria-selected="${theme.id === initialTheme}" data-variant="${theme.id}">${activeSet === "af" ? `${icon(theme.id === "a" ? "sun" : "moon")}${theme.id === "a" ? "浅色" : "深色"}` : `${theme.id.toUpperCase()} ${theme.name}`}</button>`,
    )
    .join("");
  let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let reduced = paused;
  let activeTheme = initialTheme;
  let activeScene = scenes.some(([id]) => id === params.get("scene"))
    ? params.get("scene")
    : "map";
  let elapsed = 0;
  let lastFrame = performance.now();
  const models = [];
  const measures = new Map();
  function measurePath(points) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const meters =
        Math.hypot(
          (b[0] - a[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360),
          b[1] - a[1],
        ) * 111320;
      cumulative.push(cumulative.at(-1) + meters);
    }
    return { points, cumulative, total: cumulative.at(-1) };
  }
  for (const row of DATA.routes) measures.set(row.id, measurePath(row.path));
  function positionAt(id, progress) {
    const profile = measures.get(id),
      target = profile.total * progress;
    let index = 1;
    while (
      index < profile.cumulative.length - 1 &&
      profile.cumulative[index] < target
    )
      index++;
    const a = profile.points[index - 1],
      b = profile.points[index];
    const ratio =
      (target - profile.cumulative[index - 1]) /
      Math.max(0.01, profile.cumulative[index] - profile.cumulative[index - 1]);
    return {
      coord: [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio],
      heading:
        (Math.atan2(
          (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180),
          b[1] - a[1],
        ) *
          180) /
        Math.PI,
    };
  }
  const initialEvents = () => [
    {
      id: "course1",
      title: "数据结构",
      english: "Data Structures",
      code: "CSCI2100",
      kind: "课",
      place: "康本园 LT1",
      time: "10:30–12:15",
      date: "2026-10-26",
      repeat: "每周一",
      term: "term1",
      manual: false,
    },
    {
      id: "event1",
      title: "小组讨论",
      english: "",
      code: "",
      kind: "",
      place: "李兆基楼 203",
      time: "14:30–15:15",
      date: "2026-10-25",
      repeat: "10月25日",
      term: "term1",
      manual: true,
    },
    {
      id: "course2",
      title: "数据结构",
      english: "Tutorial",
      code: "CSCI2100 T01",
      kind: "题",
      place: "康本园 503",
      time: "15:30–16:15",
      date: "2026-10-28",
      repeat: "每周三",
      term: "term1",
      manual: false,
    },
  ];
  const placeEntries = () => [
    ...Object.entries(DATA.stops).map(([id, row]) => ({
      id,
      name: row.name,
      coord: row.coord,
      kind: "stop",
      type: "校巴站",
    })),
    ...DATA.dining.map((row) => ({ ...row, kind: "dining", type: "餐厅" })),
    {
      id: "LSK",
      name: "李兆基楼",
      english: "Lee Shau Kee Building",
      coord: [114.2065, 22.4185],
      kind: "building",
      type: "楼宇",
    },
    {
      id: "YIA",
      name: "康本国际学术园",
      english: "Yasumoto International Academic Park",
      coord: DATA.stops.yasumoto.coord,
      kind: "building",
      type: "楼宇",
    },
    {
      id: "UL",
      name: "大学图书馆",
      english: "University Library",
      coord: DATA.stops.university_library?.coord || DATA.stops.shaw_hall.coord,
      kind: "building",
      type: "楼宇",
    },
  ];
  class Sample {
    constructor(theme) {
      this.theme = theme;
      this.scene = "map";
      this.ride = null;
      this.selectedPlace = null;
      this.selectedBus = null;
      this.layers = { buses: true, stops: false, dining: false };
      this.trajectory = false;
      this.events = initialEvents();
      this.month = 9;
      this.year = 2026;
      this.selectedDay = 25;
      this.selectedPlan = 0;
      this.activeMetro = "1";
      this.editingId = null;
      this.searchQuery = "";
      this.originName = "我的位置";
      this.destinationName = "联合书院学生膳堂";
      const column = document.createElement("article");
      column.className = `sample-column ${theme.id === activeTheme ? "mobile-active" : ""}`;
      column.dataset.variant = theme.id;
      column.innerHTML = `<div class="variant-heading"><span class="variant-letter">${theme.id.toUpperCase()}</span><strong>${theme.name}</strong><span class="variant-note">${theme.note}</span></div>
        <div class="device"><div class="screen theme-${theme.id}">
          <div class="map" id="map-${theme.id}" aria-label="香港中文大学校园地图"></div>
          <div class="statusbar"><span>9:41</span><span class="signals">${icon("signal")}${icon("wifi")}${icon("battery-full")}</span></div>
          <div class="wechat-capsule" aria-hidden="true"><span class="three-dots">···</span><span class="capsule-divider"></span><span class="capsule-circle"></span></div>
          <div class="topbar"><button class="icon-button" data-action="menu" title="侧边栏" aria-label="打开侧边栏">${icon("menu")}</button><button class="search-button" data-action="search" aria-label="搜索地点">${icon("search")}<span>搜索地点</span></button></div>
          <div class="map-attribution">© OpenStreetMap</div>
          <div class="map-controls"><button class="icon-button" data-action="recenter" title="回到当前位置" aria-label="回到当前位置">${icon("locate-fixed")}</button></div>
          <div class="bottom-actions"><button class="primary-action" data-action="primary">${icon("bus-front")}<span>上车</span></button></div>
          <div class="route-view"></div><div class="backdrop"></div><aside class="drawer" aria-label="侧边栏" inert></aside>
          <section class="panel" role="dialog" aria-modal="true" aria-label="详情" inert></section>
          <div class="toast" role="status"></div><div class="home-indicator"></div>
        </div></div>`;
      document.getElementById("phones").append(column);
      this.column = column;
      this.root = column.querySelector(".screen");
      this.panel = this.root.querySelector(".panel");
      this.drawer = this.root.querySelector(".drawer");
      this.map = L.map(`map-${theme.id}`, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
        zoomSnap: 0.25,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        minZoom: 14,
        maxZoom: 18,
        fadeAnimation: false,
        zoomAnimation: !reduced,
      }).setView([22.41915, 114.2067], 16);
      this.backgroundLayer = L.layerGroup().addTo(this.map);
      this.background();
      this.routeLayer = L.layerGroup().addTo(this.map);
      this.stopLayer = L.layerGroup().addTo(this.map);
      this.diningLayer = L.layerGroup().addTo(this.map);
      this.walkLayer = L.layerGroup().addTo(this.map);
      this.busLayer = L.layerGroup().addTo(this.map);
      this.selectionLayer = L.layerGroup().addTo(this.map);
      L.marker(latlng(DATA.stops.science_centre.coord), {
        icon: L.divIcon({
          className: "",
          html: '<div class="self-mark"></div>',
          iconSize: [15, 15],
          iconAnchor: [7.5, 7.5],
        }),
        zIndexOffset: 450,
      }).addTo(this.map);
      this.vehicles = [];
      for (const [id, progress] of [
        ["1", 0.31],
        ["2", 0.27],
        ["8", 0.62],
      ]) {
        const initial = positionAt(id, progress);
        const marker = L.marker(latlng(initial.coord), {
          icon: L.divIcon({
            className: "",
            html: `<div class="map-triangle" style="--bus-color:${colors[id]};--heading:${initial.heading}deg"><div class="triangle-shape"></div><div class="triangle-number">${id}</div></div>`,
            iconSize: [28, 32],
            iconAnchor: [14, 19],
          }),
          zIndexOffset: 500,
        }).addTo(this.busLayer);
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          this.selectBus(id, marker);
        });
        this.vehicles.push({ id, progress, marker, heading: initial.heading });
      }
      this.renderStops();
      this.renderDining();
      this.bind();
      this.renderDrawer();
      this.map.on("click", () => this.close());
      this.observer = new ResizeObserver(() =>
        requestAnimationFrame(() => {
          this.map.invalidateSize({ animate: false });
        }),
      );
      this.observer.observe(this.root);
    }
    background() {
      const night = () => this.theme.id === "f";
      const polygons = DATA.background.features.filter((row) =>
        ["Polygon", "MultiPolygon"].includes(row.geometry.type),
      );
      const green = polygons.filter(
        (row) =>
          !row.properties.building &&
          !row.properties.amenity &&
          row.properties.natural !== "water" &&
          row.properties.landuse !== "education",
      );
      L.geoJSON(green, {
        interactive: false,
        style: (f) => ({
          stroke: false,
          fillOpacity: 0.65,
          fillColor: night()
            ? f.properties.leisure === "pitch"
              ? "#374f49"
              : "#303f3a"
            : f.properties.leisure === "pitch"
              ? "#c9d9c1"
              : "#d4e0ce",
        }),
      }).addTo(this.backgroundLayer);
      L.geoJSON(
        polygons.filter(
          (row) =>
            row.properties.natural === "water" ||
            row.properties.leisure === "swimming_pool",
        ),
        {
          interactive: false,
          style: () => ({
            fillColor: night() ? "#2d4654" : "#d1e2e6",
            fillOpacity: 0.9,
            color: night() ? "#395664" : "#c4d8df",
            weight: 0.5,
          }),
        },
      ).addTo(this.backgroundLayer);
      L.geoJSON(
        polygons.filter((row) => row.properties.building),
        {
          interactive: false,
          style: () => ({
            fillColor: night() ? "#45424e" : "#d7dcd7",
            fillOpacity: 1,
            color: night() ? "#55515d" : "#c9d0ca",
            weight: 0.6,
          }),
        },
      ).addTo(this.backgroundLayer);
      const roads = {
        type: "FeatureCollection",
        features: DATA.background.features.filter(
          (row) => row.geometry.type === "LineString" && row.properties.highway,
        ),
      };
      const roadWidth = (f) =>
        ["motorway", "secondary", "tertiary"].includes(f.properties.highway)
          ? 8
          : ["residential", "unclassified", "service"].includes(
                f.properties.highway,
              )
            ? 5
            : 1.3;
      L.geoJSON(roads, {
        interactive: false,
        style: (f) => ({
          color: night() ? "#4d4c55" : "#cdd5cf",
          weight: roadWidth(f) + 1.5,
          opacity: 0.8,
          lineCap: "round",
        }),
      }).addTo(this.backgroundLayer);
      L.geoJSON(roads, {
        interactive: false,
        style: (f) => ({
          color: night() ? "#76717b" : "#f9faf7",
          weight: roadWidth(f),
          opacity: 1,
          lineCap: "round",
          dashArray: f.properties.highway === "steps" ? "2 3" : null,
        }),
      }).addTo(this.backgroundLayer);
      for (const [id, text, dx, dy] of [
        ["united_college", "联合书院", -25, -22],
        ["new_asia", "新亚书院", 10, -25],
        ["shaw_college", "逸夫书院", -12, -21],
        ["university_station", "大学站", -10, -20],
        ["sh_ho", "善衡书院", 10, -13],
        ["shaw_hall", "邵逸夫堂", 0, -22],
        ["science_centre", "科学馆", 15, -9],
      ]) {
        const point = DATA.stops[id];
        if (!point) continue;
        L.marker(latlng(point.coord), {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div class="map-label ${id.includes("college") ? "major" : ""}" style="transform:translate(${dx}px,${dy}px)">${text}</div>`,
            iconSize: [1, 1],
            iconAnchor: [0, 0],
          }),
        }).addTo(this.backgroundLayer);
      }
    }
    setTheme(theme) {
      if (this.theme.id === theme.id) return;
      const wasModeFocused =
        this.drawer.contains(document.activeElement) &&
        document.activeElement?.dataset.action === "mode";
      const scroll = this.drawer.scrollTop;
      this.root.classList.remove(`theme-${this.theme.id}`);
      this.theme = theme;
      this.root.classList.add(`theme-${theme.id}`);
      this.column.dataset.variant = theme.id;
      this.column.querySelector(".variant-letter").textContent =
        theme.id.toUpperCase();
      this.column.querySelector(".variant-heading strong").textContent =
        theme.name;
      this.column.querySelector(".variant-note").textContent = theme.note;
      this.backgroundLayer.eachLayer((layer) => {
        if (layer instanceof L.GeoJSON) layer.resetStyle();
      });
      this.renderDrawer();
      this.drawer.scrollTop = scroll;
      if (wasModeFocused)
        this.drawer
          .querySelector(`[data-mode="${theme.id}"]`)
          ?.focus({ preventScroll: true });
      this.modeAnimation?.cancel();
      if (!reduced)
        this.modeAnimation = this.root
          .querySelector(".map")
          .animate([{ opacity: 0.88 }, { opacity: 1 }], {
            duration: 180,
            easing: "ease-out",
          });
    }
    bind() {
      this.root.addEventListener("click", (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const action = button.dataset.action;
        if (action === "mode") switchTheme(button.dataset.mode);
        else if (action === "primary") this.primary();
        else if (action === "recenter") {
          this.map.panTo(latlng(DATA.stops.science_centre.coord), {
            animate: !reduced,
            duration: 0.25,
          });
          this.toast("科学馆附近");
        } else if (action === "layer") {
          this.layers[button.dataset.layer] =
            !this.layers[button.dataset.layer];
          this.renderLayers();
          this.renderDrawer();
        } else if (action === "month") {
          this.month += Number(button.dataset.offset);
          if (this.month > 11) {
            this.month = 0;
            this.year++;
          }
          if (this.month < 0) {
            this.month = 11;
            this.year--;
          }
          this.selectedDay = 1;
          this.calendar();
        } else if (action === "day") {
          this.selectedDay = Number(button.dataset.day);
          this.calendar();
        } else if (action === "day-schedule") this.schedule();
        else if (action === "metro-item") {
          this.activeMetro =
            this.activeMetro === button.dataset.route
              ? ""
              : button.dataset.route;
          this.metro();
        } else if (action === "board-route") {
          this.ride = button.dataset.route;
          this.close();
          this.updatePrimary();
          this.toast(`已上${this.ride}号线`);
        } else if (action === "plan") {
          this.selectedPlan = Number(button.dataset.index);
          this.navigation(false);
        } else if (action === "search-place") {
          const entry = placeEntries().find(
            (row) => row.id === button.dataset.place,
          );
          if (entry) this.selectPlace(entry);
        } else if (action === "course-choice") {
          this.courseChoice();
        } else if (action === "course-add") {
          const existing = this.events.some((row) => row.id === "course1");
          if (existing)
            this.events = this.events.filter(
              (row) => !row.id.startsWith("course"),
            );
          else
            this.events.push(...initialEvents().filter((row) => !row.manual));
          this.courseChoice();
          this.toast(existing ? "已移除课程" : "已加入日程");
        } else if (action === "import-preview") {
          this.courseChoice();
        } else if (action === "swap") {
          [this.originName, this.destinationName] = [
            this.destinationName,
            this.originName,
          ];
          this.search();
        } else if (action === "event-edit") {
          this.editingId = button.dataset.id;
          this.editEvent();
        } else if (action === "event-remove") {
          this.events = this.events.filter((row) => row.id !== this.editingId);
          this.manage();
          this.toast("已移除");
        } else if (action === "event-save") this.saveEvent();
        else if (action === "event-kind") {
          this.eventKind = button.dataset.kind;
          this.add();
        } else if (action === "course-location") {
          this.selectPlace({
            id: "event-place",
            name: button.dataset.place,
            coord: [114.2066, 22.4192],
            kind: "event",
            type: "日程地点",
          });
        } else if (action === "record") {
          this.trajectory = !this.trajectory;
          this.dataContribution();
        } else if (action === "submit-feedback") {
          if (!this.panel.querySelector("textarea")?.value.trim()) {
            this.toast("请填写反馈内容");
            return;
          }
          this.feedbackSent = true;
          this.feedback();
          this.toast("已收到反馈");
        } else if (action === "back-calendar") this.calendar();
        else if (action === "warning") {
          this.weatherWarning = !this.weatherWarning;
          this.weather();
        } else if (action === "privacy") this.privacy();
        else if (action === "share") this.toast("分享卡片已生成");
        else this.show(action);
      });
      this.root
        .querySelector(".backdrop")
        .addEventListener("click", () => this.close());
      this.panel.addEventListener("input", (event) => {
        if (event.target.matches("[data-search-input]")) {
          this.searchQuery = event.target.value;
          this.renderSearchResults();
        }
      });
      this.panel.addEventListener("change", (event) => {
        if (event.target.matches("[data-manage-term]")) {
          this.manageTerm = event.target.value;
          this.manage();
        }
      });
      this.root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.close();
      });
      let pointerY = null;
      this.panel.addEventListener("pointerdown", (event) => {
        if (event.target.classList.contains("panel-grip"))
          pointerY = event.clientY;
      });
      this.panel.addEventListener("pointerup", (event) => {
        if (pointerY !== null && event.clientY - pointerY > 35) this.close();
        pointerY = null;
      });
    }
    renderLayers() {
      this.layers.buses
        ? this.map.addLayer(this.busLayer)
        : this.map.removeLayer(this.busLayer);
      this.renderStops();
      this.renderDining();
    }
    renderStops(ids = null) {
      this.stopLayer.clearLayers();
      if (!this.layers.stops && !ids) return;
      for (const id of new Set(
        ids || [
          "shaw_hall",
          "science_centre",
          "united_college",
          "new_asia",
          "university_admin",
          "sh_ho",
          "university_station",
          "residences_3_4",
          "shaw_college",
          "cw_chu",
        ],
      )) {
        const point = DATA.stops[id];
        if (!point) continue;
        const marker = L.marker(latlng(point.coord), {
          icon: L.divIcon({
            className: "",
            html: '<div class="station-mark">站</div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          zIndexOffset: 250,
        }).addTo(this.stopLayer);
        marker.on("click", () => this.selectStop(id, marker));
      }
    }
    renderDining() {
      this.diningLayer.clearLayers();
      if (!this.layers.dining) return;
      for (const place of DATA.dining) {
        const marker = L.marker(latlng(place.coord), {
          icon: L.divIcon({
            className: "",
            html: '<div class="dining-mark">餐</div>',
            iconSize: [23, 23],
            iconAnchor: [11.5, 11.5],
          }),
          zIndexOffset: 300,
        }).addTo(this.diningLayer);
        marker.on("click", () =>
          this.selectPlace({ ...place, kind: "dining", type: "餐厅" }, marker),
        );
      }
    }
    renderDrawer() {
      this.drawer.innerHTML = `<button class="drawer-weather" data-action="weather" aria-label="天气详情"><div class="weather-line"><div class="temperature">26°</div>${icon("cloud-sun")}</div><div class="weather-description">多云 &nbsp; 湿度 72%</div><div class="operation-row"><span><i class="status-dot"></i>穿梭 正常</span><span><i class="status-dot"></i>转堂 正常</span></div></button>
        ${activeSet === "af" ? `<div class="mode-control" role="group" aria-label="显示模式"><button data-action="mode" data-mode="a" aria-pressed="${this.theme.id === "a"}">${icon("sun")}浅色</button><button data-action="mode" data-mode="f" aria-pressed="${this.theme.id === "f"}">${icon("moon")}深色</button></div>` : ""}
        <div class="drawer-links"><button class="drawer-link" data-action="metro">${icon("git-commit-horizontal")}线路图</button>
        ${[
          ["buses", "校巴", "bus-front"],
          ["stops", "站点", "map-pin"],
          ["dining", "餐厅", "utensils"],
        ]
          .map(
            ([id, name, ico]) =>
              `<button class="drawer-link layer ${this.layers[id] ? "active" : ""}" aria-pressed="${this.layers[id]}" data-action="layer" data-layer="${id}">${icon(ico)}${name}<span class="layer-state"></span></button>`,
          )
          .join("")}
        <button class="drawer-link" data-action="calendar">${icon("calendar-days")}校历</button><button class="drawer-link" data-action="data">${icon("map-pinned")}添加数据</button>
        <button class="drawer-link" data-action="trajectory">${icon("waypoints")}轨迹采集</button><button class="drawer-link" data-action="privacy">${icon("shield-check")}隐私说明</button><button class="drawer-link feedback" data-action="feedback">${icon("message-square")}反馈</button></div>`;
      icons();
    }
    show(scene) {
      this.scene = scene;
      if (scene === "map") this.close(true);
      else if (scene === "menu") this.menu();
      else if (scene === "bus") {
        this.close(true);
        this.selectBus("8", this.vehicles.find((row) => row.id === "8").marker);
      } else if (scene === "stop") {
        this.close(true);
        this.layers.stops = true;
        this.renderStops();
        this.selectStop("shaw_hall");
      } else if (scene === "dining") {
        this.close(true);
        this.layers.dining = true;
        this.renderDining();
        const target =
          DATA.dining.find((row) => /[聯联]合.*[學学]生/.test(row.name)) ||
          DATA.dining[0];
        this.selectPlace({ ...target, kind: "dining", type: "餐厅" });
      } else if (scene === "search") this.search();
      else if (scene === "navigation") this.navigation();
      else if (scene === "metro") this.metro();
      else if (scene === "calendar") this.calendar();
      else if (scene === "schedule") {
        this.selectedDay = 26;
        this.schedule();
      } else if (scene === "manage") this.manage();
      else if (scene === "add") this.add();
      else if (scene === "catalog") this.catalog();
      else if (scene === "import") this.importCourse();
      else if (scene === "boarding") this.boarding();
      else if (scene === "weather") this.weather();
      else if (scene === "feedback") this.feedback();
      else if (scene === "data" || scene === "trajectory")
        this.dataContribution();
    }
    panelContent(content, kind = "") {
      this.panel.style.maxHeight = "";
      this.drawer.classList.remove("open");
      this.drawer.inert = true;
      this.root.querySelector(".route-view").classList.remove("open");
      this.panel.className = `panel ${kind}`;
      this.panel.innerHTML = `<div class="panel-grip"></div><div class="fade-content">${content}</div>`;
      this.panel.inert = false;
      this.root.querySelector(".backdrop").classList.add("open");
      requestAnimationFrame(() => this.panel.classList.add("open"));
      this.root.querySelector(".bottom-actions").style.visibility = "hidden";
      icons();
    }
    menu() {
      this.map.closePopup();
      this.panel.classList.remove("open");
      this.panel.inert = true;
      this.root.querySelector(".backdrop").classList.add("open");
      this.drawer.inert = false;
      this.renderDrawer();
      requestAnimationFrame(() => this.drawer.classList.add("open"));
    }
    close(clear = true) {
      this.drawer.classList.remove("open");
      this.panel.classList.remove("open");
      this.root.querySelector(".backdrop").classList.remove("open");
      this.drawer.inert = true;
      this.panel.inert = true;
      this.root.querySelector(".route-view").classList.remove("open");
      this.root.querySelector(".bottom-actions").style.visibility = "visible";
      if (clear) {
        this.map.closePopup();
        this.routeLayer.clearLayers();
        this.walkLayer.clearLayers();
        this.selectionLayer.clearLayers();
        this.selectedPlace = null;
        this.selectedBus = null;
        this.renderStops();
      }
      this.updatePrimary();
    }
    popup(point, html) {
      L.popup({
        closeButton: false,
        maxWidth: 250,
        minWidth: 180,
        offset: [0, -17],
        autoPan: true,
        autoPanPaddingTopLeft: [18, 103],
        autoPanPaddingBottomRight: [18, 106],
      })
        .setLatLng(latlng(point))
        .setContent(html)
        .openOn(this.map);
      icons();
    }
    selectBus(id, marker) {
      this.close(true);
      this.selectedBus = id;
      const r = route(id);
      this.drawRoute(r);
      this.renderStops(r.stops);
      const point = marker
        ? marker.getLatLng()
        : latlng(DATA.stops.shaw_hall.coord);
      this.map.panTo(point, { animate: !reduced, duration: 0.25 });
      this.popup(
        [point.lng, point.lat],
        `<div class="popup-route">${badge(id)}<div class="popup-title">${escape(r.name)}</div></div><div class="popup-sub">下一站</div><div class="popup-title">${id === "8" ? "陈震夏宿舍" : "邵逸夫堂"}</div><div class="popup-time">预计 2 分钟</div><div class="popup-message">4分钟前有人在敬文书院上车</div>`,
      );
      this.updatePrimary();
    }
    selectStop(id) {
      this.close(true);
      this.selectedPlace = { id, ...DATA.stops[id], kind: "stop" };
      this.layers.stops = true;
      this.renderStops();
      this.map.panTo(latlng(DATA.stops[id].coord), {
        animate: !reduced,
        duration: 0.25,
      });
      this.popup(
        DATA.stops[id].coord,
        `<div class="popup-title">${escape(DATA.stops[id].name)}</div><div class="popup-sub">预计到站</div>${[
          ["1", 2],
          ["2", 5],
          ["2S", 9],
        ]
          .map(
            ([r, time]) =>
              `<div class="popup-service">${badge(r)}<span>${time} 分钟</span></div>`,
          )
          .join("")}`,
      );
      this.updatePrimary();
    }
    selectPlace(place) {
      if (!place) return;
      this.close(true);
      this.selectedPlace = place;
      this.destinationName = place.name;
      L.marker(latlng(place.coord), {
        icon: L.divIcon({
          className: "",
          html:
            place.kind === "event"
              ? '<div class="star-mark">★</div>'
              : '<div class="place-mark"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        zIndexOffset: 600,
      }).addTo(this.selectionLayer);
      this.map.panTo(latlng(place.coord), {
        animate: !reduced,
        duration: 0.25,
      });
      this.popup(
        place.coord,
        `<div class="popup-title">${escape(place.name)}</div>${place.english ? `<div class="popup-sub">${escape(place.english)}</div>` : ""}${place.kind === "dining" ? `<div class="popup-sub">${escape(place.floor || "")}</div><div class="popup-time">11:00–20:00</div>` : place.kind === "event" ? '<div class="popup-sub">14:30–15:15 小组讨论</div>' : ""}`,
      );
      this.updatePrimary();
    }
    updatePrimary() {
      const button = this.root.querySelector("[data-action=primary]");
      button.classList.toggle("onboard", !!this.ride && !this.selectedPlace);
      button.innerHTML = this.selectedPlace
        ? `${icon("navigation")}<span>导航</span>`
        : this.ride
          ? `${icon("check")}<span>下车</span><span class="inline-route">${this.ride}号线</span>`
          : `${icon("bus-front")}<span>上车</span>`;
      icons();
    }
    primary() {
      if (this.selectedPlace) this.navigation();
      else if (this.ride) {
        this.ride = null;
        this.updatePrimary();
        this.toast("已下车");
      } else this.boarding();
    }
    drawRoute(r, from = null, to = null) {
      this.routeLayer.clearLayers();
      let points = r.path;
      if (from !== null && to !== null) {
        const profile = measures.get(r.id);
        const start = r.progress[from] * profile.total,
          end = r.progress[to] * profile.total;
        points = profile.points.filter(
          (_, i) =>
            profile.cumulative[i] >= start && profile.cumulative[i] <= end,
        );
      }
      if (points.length < 2) points = r.path;
      L.polyline(points.map(latlng), {
        color: "#fff",
        weight: 8,
        opacity: 0.95,
        lineJoin: "round",
      }).addTo(this.routeLayer);
      L.polyline(points.map(latlng), {
        color: colors[r.id] || "#77538a",
        weight: 4,
        opacity: 0.9,
        lineJoin: "round",
      }).addTo(this.routeLayer);
    }
    boarding() {
      this.map.closePopup();
      this.panelContent(
        `<div class="panel-title">选择校巴<span class="subtitle">科学馆附近</span></div>${[
          ["1", "本部线", "邵逸夫堂"],
          ["2", "新联线", "邵逸夫堂"],
          ["8", "环回线", "科学馆"],
        ]
          .map(
            ([id, name, stop]) =>
              `<button class="list-row" data-action="board-route" data-route="${id}">${badge(id)}<div class="list-copy"><div class="list-title">${id}号线</div><div class="list-subtitle">${name} · ${stop}</div></div>${icon("chevron-right")}</button>`,
          )
          .join("")}`,
      );
    }
    search() {
      this.panelContent(
        `<div class="panel-title">搜索与路线<button title="互换起终点" aria-label="互换起终点" data-action="swap">${icon("arrow-down-up")}</button></div><div class="inline-notice">${escape(this.originName)} &nbsp; → &nbsp; ${escape(this.destinationName)}</div><div class="search-input-wrap">${icon("search")}<input class="form-field" data-search-input placeholder="楼宇、站点、餐厅" aria-label="搜索楼宇站点餐厅" value="${escape(this.searchQuery)}"></div><div class="search-results"></div><button class="submit" data-action="navigation">${icon("route")}搜索路线</button>`,
        "search-panel",
      );
      this.renderSearchResults();
    }
    renderSearchResults() {
      const q = this.searchQuery.toLowerCase().trim();
      const rows = placeEntries()
        .filter((row) =>
          `${row.name} ${row.english || ""} ${row.id}`
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 9);
      const target = this.panel.querySelector(".search-results");
      if (!target) return;
      target.innerHTML = rows.length
        ? rows
            .map(
              (row) =>
                `<button class="list-row" data-action="search-place" data-place="${escape(row.id)}"><span class="row-icon">${icon(row.kind === "dining" ? "utensils" : row.kind === "stop" ? "bus-front" : "building-2")}</span><div class="list-copy"><div class="list-title">${escape(row.name)}</div><div class="list-subtitle">${row.type}</div></div>${icon("chevron-right")}</button>`,
            )
            .join("")
        : '<div class="empty">没有找到匹配地点</div>';
      icons();
    }
    navigation(reset = true) {
      this.map.closePopup();
      this.selectedPlace = null;
      this.updatePrimary();
      if (reset) this.selectedPlan = 0;
      this.panelContent(
        `<div class="plan-header"><span>${escape(this.originName)}</span>${icon("arrow-right")}<span>${escape(this.destinationName)}</span></div><div class="plan-options">${[
          [
            "2",
            "12",
            "步行至邵逸夫堂，乘2号线",
            "联合书院下车，步行至膳堂",
            "步行 260米",
            "候车 4分钟",
          ],
          [
            "walk",
            "19",
            "沿校园步行路网",
            "经中央道前往联合书院",
            "步行 " + (DATA.navigation.direct?.meters || 980) + "米",
            "无需候车",
          ],
          [
            "2S",
            "21",
            "步行至大学体育中心，乘2S",
            "联合书院下车，步行至膳堂",
            "步行 480米",
            "候车 6分钟",
          ],
        ]
          .map(
            ([id, time, first, last, dist, wait], index) =>
              `<button class="plan-card ${this.selectedPlan === index ? "active" : ""}" data-action="plan" data-index="${index}"><div class="plan-head">${id === "walk" ? `<span class="route-badge" style="--route-color:#8a8190">${icon("footprints")}</span>` : badge(id)}<strong>${id === "walk" ? "步行" : id + "号线"}${index === 0 ? '<span class="recommend">较快</span>' : ""}</strong><span class="plan-total">${time}<small>分钟</small></span></div><div class="plan-steps"><b>${first}</b><br>${last}</div><div class="plan-foot"><span>${dist}</span><span>${wait}</span></div></button>`,
          )
          .join("")}</div>`,
      );
      this.root.querySelector(".backdrop").classList.remove("open");
      this.walkLayer.clearLayers();
      const drawWalk = (coords) => {
        if (!coords?.length) return;
        L.polyline(coords.map(latlng), {
          color: "#fff",
          weight: 8,
          opacity: 0.95,
        }).addTo(this.walkLayer);
        L.polyline(coords.map(latlng), {
          color: "#765689",
          weight: 4,
          opacity: 0.9,
        }).addTo(this.walkLayer);
      };
      if (this.selectedPlan === 1) {
        this.routeLayer.clearLayers();
        drawWalk(DATA.navigation.direct?.coords);
      } else {
        this.drawRoute(route("2"), 2, 4);
        drawWalk(DATA.navigation.first?.coords);
        drawWalk(DATA.navigation.last?.coords);
      }
      // Keep the path visible above the route choices.
      this.panel.style.maxHeight = "52%";
      const visible = [
        ...this.routeLayer.getLayers(),
        ...this.walkLayer.getLayers(),
      ].flatMap((layer) => layer.getLatLngs());
      if (visible.length)
        this.map.fitBounds(L.latLngBounds(visible), {
          paddingTopLeft: [22, 105],
          paddingBottomRight: [22, this.root.clientHeight * 0.52 + 18],
          maxZoom: 17,
          animate: !reduced,
          duration: 0.25,
        });
    }
    metro() {
      this.close(true);
      this.root.querySelector(".bottom-actions").style.visibility = "hidden";
      const view = this.root.querySelector(".route-view");
      view.classList.add("open");
      const rows = [
        ["1", "本部线", "邵逸夫堂", "2"],
        ["2", "新联线", "联合书院", "4"],
        ["8", "环回线", "陈震夏宿舍", "3"],
        ["2S", "新联线（S）", "大学体育中心", "6"],
        ["N", "夜间线", "善衡书院", "8"],
      ];
      view.innerHTML = `<div class="route-view-header">线路图</div>${rows.map(([id, name, next, eta]) => `<div class="metro-item"><button class="metro-summary" data-action="metro-item" data-route="${id}">${badge(id)}<div class="metro-main"><div class="metro-name">${name}</div><div class="metro-stop">${next}</div></div><span class="route-eta">${eta}<small>分钟</small></span></button>${this.activeMetro === id ? this.lcd(id) : ""}</div>`).join("")}`;
      icons();
      requestAnimationFrame(() => {
        this.frame(elapsed);
        const scroll = view.querySelector(".lcd-wrap");
        if (scroll)
          scroll.scrollLeft = Math.max(
            0,
            Number(scroll.querySelector(".lcd-bus").dataset.position || 120) -
              scroll.clientWidth / 2,
          );
      });
    }
    lcd(id) {
      const r = route(id);
      return `<div class="lcd-wrap"><div class="lcd-track" data-lcd-route="${id}"><div class="lcd-bus">${icon("bus-front")}</div>${r.stops.map((stop, index) => `<div class="lcd-stop"><span class="lcd-dot"></span>${escape(DATA.stops[stop]?.name.replace(/ \/.*/, ""))}</div>`).join("")}</div></div>`;
    }
    eventsOnDay(day) {
      const date = `${this.year}-${String(this.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(this.year, this.month, day).getDay();
      return this.events.filter((event) => {
        if (event.weekly || !event.manual) {
          const expected =
            event.weekday ??
            (event.repeat.includes("一")
              ? 1
              : event.repeat.includes("三")
                ? 3
                : 0);
          return (
            weekday === expected &&
            date >= (event.startDate || "2026-09-07") &&
            date <= (event.endDate || "2026-12-05")
          );
        }
        return event.date === date;
      });
    }
    calendar() {
      this.panel.style.maxHeight = "";
      const leading = new Date(this.year, this.month, 1).getDay(),
        days = new Date(this.year, this.month + 1, 0).getDate();
      const cells = Array.from(
        { length: leading },
        () => '<span class="calendar-day blank"></span>',
      );
      for (let day = 1; day <= days; day++) {
        const weekday = new Date(this.year, this.month, day).getDay(),
          today = this.year === 2026 && this.month === 9 && day === 25;
        cells.push(
          `<button class="calendar-day ${[0, 6].includes(weekday) ? "weekend" : ""} ${today ? "today" : ""} ${this.selectedDay === day ? "selected" : ""}" data-action="day" data-day="${day}" aria-label="${this.month + 1}月${day}日">${day}${this.eventsOnDay(day).length ? '<span class="day-dot"></span>' : ""}</button>`,
        );
      }
      while (cells.length % 7)
        cells.push('<span class="calendar-day blank"></span>');
      const dayEvent = this.eventsOnDay(this.selectedDay)[0];
      this.panelContent(
        `<div class="calendar-month"><button data-action="month" data-offset="-1" aria-label="上个月">${icon("chevron-left")}</button><span>${this.year}年${this.month + 1}月</span><button data-action="month" data-offset="1" aria-label="下个月">${icon("chevron-right")}</button></div><div class="button-pair calendar-actions"><button class="quiet-action" data-action="add">${icon("plus")}添加</button><button class="quiet-action" data-action="manage">${icon("notebook-tabs")}管理</button></div><div class="weekday-grid">${"日一二三四五六"
          .split("")
          .map((day) => `<span>${day}</span>`)
          .join(
            "",
          )}</div><div class="calendar-grid">${cells.join("")}</div><div class="calendar-agenda"><div class="agenda-date">${this.month + 1}月${this.selectedDay}日</div>${dayEvent ? `<button class="agenda-row" data-action="day-schedule"><span class="agenda-time">${dayEvent.time.split("–")[0]}</span><span class="agenda-line"></span><span><span class="agenda-title">${escape(dayEvent.title)}</span><span class="agenda-place" style="display:block">${escape(dayEvent.place)}</span></span></button>` : '<div class="empty">暂无日程</div>'}</div><div class="calendar-bottom"><span>第一学期</span><button data-action="day-schedule">当日日程${icon("chevron-right")}</button></div>`,
      );
    }
    schedule() {
      this.panel.style.maxHeight = "";
      const hours = Array.from(
        { length: 14 },
        (_, i) => `${String(i + 8).padStart(2, "0")}:30`,
      );
      const events = this.eventsOnDay(this.selectedDay);
      this.panelContent(
        `<div class="panel-title"><button data-action="back-calendar" title="返回校历" aria-label="返回校历">${icon("arrow-left")}</button><span>日程表</span><span class="subtitle">${this.month + 1}月</span></div><div class="schedule-scroll">${hours
          .map((hour) => {
            const event = events.find(
              (row) =>
                row.time.split("–")[0] <= hour && row.time.split("–")[1] > hour,
            );
            const first = event && event.time.split("–")[0] === hour;
            return `<div class="time-row"><span class="time-label">${hour}</span><div class="time-cell">${event ? `<div class="schedule-class ${event.manual ? "manual" : ""}">${first ? `<div class="schedule-title">${escape(event.title)} ${event.kind ? `<small>${event.kind === "课" ? "L" : event.kind === "题" ? "T" : "P"}</small>` : ""}</div>${event.english ? `<div class="list-subtitle">${escape(event.english)}</div>` : ""}` : ""}<button class="schedule-place" data-action="course-location" data-place="${escape(event.place)}">${icon("map-pin")}${escape(event.place)}</button></div>` : ""}</div></div>`;
          })
          .join("")}</div>`,
      );
    }
    manage() {
      this.panel.style.maxHeight = "";
      const term = this.manageTerm || "term1";
      const events = this.events.filter((event) => event.term === term);
      this.panelContent(
        `<div class="panel-title">管理<select class="form-field" data-manage-term style="width:87px;height:29px;font-size:10px" aria-label="学期"><option ${term === "term1" ? "selected" : ""}>term1</option><option ${term === "term2" ? "selected" : ""}>term2</option></select></div>${events.map((event) => `<button class="manage-card" data-action="event-edit" data-id="${event.id}"><div class="manage-card-head"><span>${escape(event.title)}</span><span>${escape(event.place)}</span></div>${event.english ? `<div class="list-subtitle">${escape(event.english)}</div>` : ""}<div class="manage-card-meta">${escape(event.repeat)} &nbsp; ${escape(event.time)}</div>${event.code ? `<div class="manage-card-code">${escape(event.code)} ${event.kind === "课" ? "L" : "T"}</div>` : ""}</button>`).join("") || '<div class="empty">暂无已添加课程或日程</div>'}<button class="quiet-action" style="margin-top:16px" data-action="add">${icon("plus")}添加</button>`,
      );
    }
    add() {
      this.panel.style.maxHeight = "";
      const weekly = this.eventKind === "weekly";
      this.panelContent(
        `<div class="panel-title">添加<span class="subtitle">日程与课程</span></div><div class="segment-control"><button class="${!weekly ? "active" : ""}" data-action="event-kind" data-kind="single">单次事件</button><button class="${weekly ? "active" : ""}" data-action="event-kind" data-kind="weekly">每周循环</button></div><label class="form-label">名称</label><input class="form-field" name="event-title" placeholder="输入名称" aria-label="名称"><label class="form-label">${weekly ? "星期" : "日期"}</label>${weekly ? '<select class="form-field" name="event-weekday" aria-label="星期"><option value="1">每周一</option><option value="2">每周二</option><option value="3">每周三</option><option value="4">每周四</option><option value="5">每周五</option><option value="6">每周六</option><option value="0">每周日</option></select><label class="form-label">起止日期</label><div class="button-pair"><input type="date" class="form-field" name="event-begin" aria-label="开始日期" value="2026-10-25"><input type="date" class="form-field" name="event-finish" aria-label="结束日期" value="2026-12-05"></div>' : '<input class="form-field" type="date" name="event-date" value="2026-10-25" aria-label="日期">'}<label class="form-label">时间</label><div class="button-pair"><select class="form-field" name="event-start" aria-label="开始时间"><option>14:30</option><option>15:30</option><option>16:30</option></select><select class="form-field" name="event-end" aria-label="结束时间"><option>15:15</option><option>16:15</option><option>17:15</option></select></div><label class="form-label">地点</label><input class="form-field" name="event-place" placeholder="搜索楼宇或输入地点" aria-label="地点" list="places-${this.theme.id}"><datalist id="places-${this.theme.id}">${placeEntries()
          .filter((row) => row.kind === "building")
          .map((row) => `<option value="${escape(row.name)}">`)
          .join(
            "",
          )}</datalist><button class="submit" data-action="event-save">${icon("check")}保存</button><div class="section-label">课程</div><button class="list-row" data-action="catalog"><span class="row-icon">${icon("book-open")}</span><span class="list-copy"><span class="list-title">课程目录</span></span>${icon("chevron-right")}</button><button class="list-row" data-action="import"><span class="row-icon">${icon("file-down")}</span><span class="list-copy"><span class="list-title">导入 CUTS 课表</span></span>${icon("chevron-right")}</button>`,
      );
      this.editingId = null;
    }
    editEvent() {
      const event = this.events.find((row) => row.id === this.editingId);
      if (!event) return;
      this.eventKind = "single";
      this.panelContent(
        `<div class="panel-title">修改日程</div><label class="form-label">名称</label><input class="form-field" name="event-title" aria-label="名称" value="${escape(event.title)}"><label class="form-label">日期</label><input type="date" class="form-field" name="event-date" aria-label="日期" value="${event.date}"><label class="form-label">时间</label><div class="button-pair"><select class="form-field" name="event-start"><option>${event.time.split("–")[0]}</option><option>15:30</option></select><select class="form-field" name="event-end"><option>${event.time.split("–")[1]}</option><option>16:15</option></select></div><label class="form-label">地点</label><input class="form-field" name="event-place" aria-label="地点" value="${escape(event.place)}"><button class="submit" data-action="event-save">${icon("check")}保存修改</button><button class="danger-action" data-action="event-remove">移除日程</button>`,
      );
    }
    saveEvent() {
      const value = (name) =>
        this.panel.querySelector(`[name="${name}"]`)?.value || "";
      const title = value("event-title").trim(),
        place = value("event-place").trim();
      if (!title) {
        this.toast("请填写名称");
        this.panel.querySelector("[name=event-title]").focus();
        return;
      }
      if (value("event-start") >= value("event-end")) {
        this.toast("结束时间需晚于开始时间");
        return;
      }
      const weekly =
        this.eventKind === "weekly" &&
        !!this.panel.querySelector("[name=event-weekday]");
      if (weekly && value("event-begin") > value("event-finish")) {
        this.toast("结束日期需晚于开始日期");
        return;
      }
      const existing = this.events.find((row) => row.id === this.editingId);
      const event = {
        ...(existing || {
          id: "event" + Date.now(),
          manual: true,
          term: "term1",
          english: "",
          code: "",
          kind: "",
        }),
        title,
        place: place || "地点待定",
        time: `${value("event-start")}–${value("event-end")}`,
        date: value("event-date") || value("event-begin"),
        weekly,
        weekday: weekly ? Number(value("event-weekday")) : undefined,
        startDate: weekly ? value("event-begin") : undefined,
        endDate: weekly ? value("event-finish") : undefined,
        repeat:
          existing && !existing.manual
            ? existing.repeat
            : weekly
              ? `每周${"日一二三四五六"[Number(value("event-weekday"))]}`
              : value("event-date").slice(5).replace("-", "月") + "日",
      };
      if (existing)
        this.events = this.events.map((row) =>
          row.id === existing.id ? event : row,
        );
      else this.events.push(event);
      this.manage();
      this.toast("已保存");
    }
    catalog() {
      this.panelContent(
        `<div class="panel-title">课程目录<select class="form-field" style="width:87px;height:29px;font-size:10px" aria-label="目录学期"><option>term1</option><option>term2</option></select></div><div class="search-input-wrap">${icon("search")}<input class="form-field" placeholder="课程序号、名称或代号" aria-label="搜索课程"></div><button class="manage-card" data-action="course-choice"><div class="list-title">数据结构</div><div class="list-subtitle">Data Structures</div><div class="manage-card-code">CSCI2100</div></button>`,
      );
    }
    courseChoice() {
      const added = this.events.some((row) => row.id === "course1");
      this.panelContent(
        `<div class="panel-title">数据结构<span class="subtitle">CSCI2100</span></div><div class="list-subtitle">Data Structures</div><div class="section-label">讲座 L</div><label class="list-row"><input type="radio" name="lecture-${this.theme.id}" checked><span class="list-copy"><span class="list-title">L01</span><span class="list-subtitle" style="display:block">周一 10:30–12:15 · 康本园 LT1</span></span></label><div class="section-label">习题 T</div><label class="list-row"><input type="radio" name="tutorial-${this.theme.id}" checked><span class="list-copy"><span class="list-title">T01</span><span class="list-subtitle" style="display:block">周三 15:30–16:15 · 康本园 503</span></span></label><label class="list-row"><input type="radio" name="tutorial-${this.theme.id}"><span class="list-copy"><span class="list-title">T02</span><span class="list-subtitle" style="display:block">周四 16:30–17:15 · 康本园 505</span></span></label><button class="quiet-action ${added ? "active" : ""}" aria-pressed="${added}" style="margin-top:20px" data-action="course-add">${icon(added ? "check" : "plus")}加入日程</button>`,
      );
    }
    importCourse() {
      this.panelContent(
        `<div class="panel-title">导入课表</div><label class="form-label">CUTS 分享链接</label><textarea class="form-field" aria-label="CUTS分享链接" placeholder="https://cuts.fddsa.com/"></textarea><button class="submit" data-action="import-preview">${icon("file-search")}预览课程</button>`,
      );
    }
    weather() {
      this.panelContent(
        `<div class="panel-title">天气<span class="subtitle">沙田</span></div><div class="weather-hero"><div><div class="weather-degrees">26°</div><div class="weather-description">多云</div></div>${icon("cloud-sun")}</div><div class="weather-facts"><span><b>72%</b><small>湿度</small></span><span><b>3级</b><small>风力</small></span><span><b>低</b><small>紫外线</small></span></div>${this.weatherWarning ? `<div class="warning-banner">${icon("triangle-alert")}<span><b>黑色暴雨警告</b><br>校巴安排以交通处最新通知为准。</span></div>` : ""}<div class="settings-row"><span>天气警告</span><button class="switch ${this.weatherWarning ? "active" : ""}" data-action="warning" role="switch" aria-checked="${!!this.weatherWarning}" aria-label="天气警告"></button></div>`,
      );
    }
    feedback() {
      this.panelContent(
        `<div class="panel-title">反馈</div>${this.feedbackSent ? `<div class="weather-hero" style="padding:25px 0;justify-content:center">${icon("circle-check")}</div><div class="popup-title" style="text-align:center">已收到反馈</div><div class="list-subtitle" style="text-align:center;padding:8px 0 25px">谢谢你帮忙完善校园出行信息。</div>` : `<label class="form-label">类型</label><select class="form-field" aria-label="反馈类型"><option>站点位置</option><option>校巴路线</option><option>到站时间</option><option>餐厅信息</option><option>其他问题</option></select><label class="form-label">内容</label><textarea class="form-field" placeholder="具体地点、线路或遇到的问题" aria-label="反馈内容"></textarea><label class="form-label">联系方式（选填）</label><input class="form-field" placeholder="邮箱或微信号" aria-label="联系方式"><button class="submit" data-action="submit-feedback">${icon("send")}提交反馈</button>`}`,
      );
    }
    dataContribution() {
      this.panelContent(
        `<div class="panel-title">添加数据</div><button class="list-row" data-action="feedback"><span class="row-icon">${icon("map-pin-plus")}</span><span class="list-copy"><span class="list-title">地点与出入口</span><span class="list-subtitle" style="display:block">楼梯、电梯、天桥、步行入口</span></span>${icon("chevron-right")}</button><button class="list-row" data-action="feedback"><span class="row-icon">${icon("utensils")}</span><span class="list-copy"><span class="list-title">餐厅信息</span><span class="list-subtitle" style="display:block">地点、营业时间、暂停营业</span></span>${icon("chevron-right")}</button><div class="settings-row"><span>完整轨迹采集<small>${this.trajectory ? "采集中" : "未开始"}</small></span><button class="switch ${this.trajectory ? "active" : ""}" data-action="record" role="switch" aria-checked="${this.trajectory}" aria-label="轨迹采集"></button></div>`,
      );
    }
    privacy() {
      this.panelContent(
        `<div class="panel-title">隐私说明</div><div class="list-title" style="line-height:2;font-weight:400">上车记录用于校巴在站时间参考，不显示个人身份。完整轨迹采集需要单独开启。</div><div class="list-subtitle" style="line-height:1.9;margin-top:15px">本样品仅使用公开校园地图及演示数据，不读取定位，不上传任何内容。</div>`,
      );
    }
    toast(text) {
      const node = this.root.querySelector(".toast");
      node.textContent = text;
      node.classList.add("open");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => node.classList.remove("open"), 1900);
    }
    frame(time) {
      for (const vehicle of this.vehicles) {
        const progress =
          (vehicle.progress + (time * 0.006) / measures.get(vehicle.id).total) %
          1;
        const point = positionAt(vehicle.id, progress);
        vehicle.marker.setLatLng(latlng(point.coord));
        const difference =
          ((point.heading - vehicle.heading + 540) % 360) - 180;
        vehicle.heading += difference * 0.16;
        const arrow = vehicle.marker
          .getElement()
          ?.querySelector(".triangle-shape");
        if (arrow)
          arrow.style.setProperty("--heading", `${vehicle.heading}deg`);
        if (this.selectedBus === vehicle.id && this.map._popup)
          this.map._popup.setLatLng(latlng(point.coord));
      }
      for (const track of this.root.querySelectorAll(".lcd-track")) {
        const id = track.dataset.lcdRoute,
          r = route(id);
        const vehicle = this.vehicles.find((row) => row.id === id);
        const progress =
          ((vehicle?.progress || 0.25) +
            (time * 0.006) / measures.get(id).total) %
          1;
        let index = 1;
        while (index < r.progress.length - 1 && r.progress[index] < progress)
          index++;
        const fraction =
          (progress - r.progress[index - 1]) /
          Math.max(0.001, r.progress[index] - r.progress[index - 1]);
        const position =
          65 + (index - 1 + Math.min(1, Math.max(0, fraction))) * 94;
        const bus = track.querySelector(".lcd-bus");
        bus.style.transform = `translate3d(${position - 14}px,0,0)`;
        bus.dataset.position = position;
        track.querySelectorAll(".lcd-stop").forEach((stop, stopIndex) => {
          stop.classList.toggle("past", stopIndex < index - 1);
          stop.classList.toggle("current", stopIndex === index - 1);
          stop.style.setProperty("--segment-progress", fraction);
        });
      }
    }
  }
  const nav = document.getElementById("scene-options");
  nav.innerHTML = scenes
    .map(
      ([id, name, ico]) =>
        `<button class="${id === "map" ? "active" : ""}" data-scene="${id}">${icon(ico)}${name}</button>`,
    )
    .join("");
  const previews =
    activeSet === "af"
      ? [themes.find((theme) => theme.id === initialTheme)]
      : themes;
  for (const theme of previews) models.push(new Sample(theme));
  function switchTheme(id) {
    if (activeSet !== "af") return;
    const theme = themes.find((theme) => theme.id === id);
    if (!theme) return;
    activeTheme = id;
    models[0].setTheme(theme);
    document
      .querySelectorAll(".mobile-variants [data-variant]")
      .forEach((tab) =>
        tab.setAttribute("aria-selected", tab.dataset.variant === id),
      );
  }
  function setScene(scene) {
    activeScene = scene;
    document
      .querySelectorAll("[data-scene]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.scene === scene),
      );
    for (const model of models) {
      model.panel.style.maxHeight = "";
      model.show(scene);
    }
    document.querySelectorAll(".edition-nav a").forEach((link) => {
      const url = new URL(link.href);
      url.searchParams.set("scene", scene);
      link.href = url.href;
    });
  }
  setScene(activeScene);
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scene]");
    if (button) setScene(button.dataset.scene);
  });
  document
    .querySelector(".mobile-variants")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-variant]");
      if (!button) return;
      if (activeSet === "af") {
        switchTheme(button.dataset.variant);
        return;
      }
      activeTheme = button.dataset.variant;
      document
        .querySelectorAll(".mobile-variants [data-variant]")
        .forEach((tab) =>
          tab.setAttribute(
            "aria-selected",
            tab.dataset.variant === activeTheme,
          ),
        );
      document
        .querySelectorAll(".sample-column")
        .forEach((column) =>
          column.classList.toggle(
            "mobile-active",
            column.dataset.variant === activeTheme,
          ),
        );
      const model = models.find((row) => row.theme.id === activeTheme);
      requestAnimationFrame(() => model.map.invalidateSize({ animate: false }));
    });
  function updateMotion() {
    if (reduced) for (const model of models) model.modeAnimation?.cancel();
    document.body.classList.toggle("reduced", reduced);
    document.getElementById("reduce-motion").checked = reduced;
    const button = document.getElementById("motion-toggle");
    button.innerHTML = icon(paused ? "play" : "pause");
    button.title = paused ? "播放动效" : "暂停动效";
    button.setAttribute("aria-label", button.title);
    icons();
  }
  document.getElementById("motion-toggle").addEventListener("click", () => {
    paused = !paused;
    updateMotion();
  });
  document
    .getElementById("reduce-motion")
    .addEventListener("change", (event) => {
      reduced = event.target.checked;
      paused = reduced;
      updateMotion();
    });
  document.getElementById("reset").addEventListener("click", () => {
    elapsed = 0;
    for (const model of models) {
      model.ride = null;
      model.events = initialEvents();
      model.selectedDay = 25;
      model.month = 9;
      model.year = 2026;
      model.searchQuery = "";
      model.feedbackSent = false;
      model.layers = { buses: true, stops: false, dining: false };
      model.renderLayers();
    }
    setScene(activeScene);
  });
  function frame(now) {
    const delta = Math.min(now - lastFrame, 50);
    lastFrame = now;
    if (!paused && !document.hidden) {
      elapsed += delta;
      for (const model of models)
        if (model.column.offsetWidth) model.frame(elapsed);
    }
    requestAnimationFrame(frame);
  }
  icons();
  updateMotion();
  requestAnimationFrame(frame);
  // Export prototype controls solely for local visual QA, never a production API.
  window.UI_SAMPLE = {
    models,
    setScene,
    setTheme: switchTheme,
    setPaused(value) {
      paused = value;
      updateMotion();
    },
    get state() {
      return {
        scene: activeScene,
        theme: activeTheme,
        themeSet: activeSet,
        paused,
        reduced,
      };
    },
  };
})();
