(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CUHK_TRANSPORT_ROUTE_SCHEMES = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const LEGACY_SCHEME_ID = "legacy";
  const NEW_SCHEME_ID = "2026-09";
  let legacyRoutes = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSchemeId(value) {
    return String(value || "").toLowerCase() === LEGACY_SCHEME_ID ? LEGACY_SCHEME_ID : NEW_SCHEME_ID;
  }

  function applyTransportRouteScheme(mapData, requestedSchemeId) {
    if (!mapData || !Array.isArray(mapData.routes)) return false;
    if (!legacyRoutes) legacyRoutes = clone(mapData.routes);
    const schemeId = normalizeSchemeId(requestedSchemeId);
    if (mapData.metadata && mapData.metadata.transportRouteScheme === schemeId) return false;

    if (schemeId === NEW_SCHEME_ID) ensure2026Stops(mapData);
    mapData.routes = schemeId === NEW_SCHEME_ID
      ? build2026Routes(legacyRoutes, mapData.stops || {})
      : clone(legacyRoutes);
    mapData.metadata = {
      ...(mapData.metadata || {}),
      transportRouteScheme: schemeId,
      transportRouteSchemeSource: schemeId === NEW_SCHEME_ID
        ? "CUHK Transport Office route pages and PDF effective 2026-09-01; checked 2026-09-02"
        : "legacy published route data",
      transportRouteSchemeEffectiveDate: schemeId === NEW_SCHEME_ID ? "2026-09-01" : undefined,
    };
    return true;
  }

  function build2026Routes(sourceRoutes, stops) {
    const routes = clone(sourceRoutes);
    const byId = Object.fromEntries(routes.map((route) => [route.id, route]));
    const route1 = clone(byId["1A"]);
    const route2 = clone(byId["2"]);
    const route2S = clone(byId["2"]);
    const route3 = byId["3"];
    const route4 = byId["4"];
    const route6A = byId["6A"];
    const routeN = byId.N;

    route1.id = "1";
    route1.name = "本部线";
    route1.schedule = schedule(
      "周一至周六（公众假期除外）07:40-18:55；每小时 10、25、40、55 分开出",
      "07:40",
      "18:55",
      [10, 25, 40, 55],
      route1.schedule
    );
    route1.schedule.notes = ["公众假期停驶"];
    route1.replacesRouteIds = ["1A"];
    route1.etaRouteId = "1A";

    route2.schedule = schedule(
      "周一至周六（公众假期除外）07:45-18:45；每小时 15、45 分开出",
      "07:45",
      "18:45",
      [15, 45],
      route2.schedule
    );
    route2.schedule.notes = ["公众假期停驶", "每小时 45 分班次停邵逸夫堂"];
    route2.conditionalStops = { shaw_hall: { departMinutes: [45] } };
    route2.stops = [
      "university_station_piazza",
      "university_sports_centre",
      "shaw_hall",
      "fung_king_hey",
      "united_college",
      "new_asia",
      "united_college",
      "university_admin",
      "sh_ho",
      "university_station",
    ];

    route2S.id = "2S";
    route2S.name = "新联线（S）";
    route2S.color = byId["1B"] && byId["1B"].color || route2.color;
    route2S.stops = [
      "university_station_piazza",
      "postgraduate_hostel",
      "university_sports_centre",
      "shaw_hall",
      "fung_king_hey",
      "united_college",
      "new_asia",
      "united_college",
      "university_admin",
      "sh_ho",
      "postgraduate_hostel",
      "university_station",
    ];
    route2S.path = build2SPath(route2, byId["1B"], stops) || clone(route2.path);
    route2S.pathSource = "composed_reviewed_road_segments_2026_08";
    route2S.schedule = schedule(
      "周一至周六（公众假期除外）08:00-18:30；每小时 00、30 分开出",
      "08:00",
      "18:30",
      [0, 30],
      route2.schedule
    );
    route2S.schedule.estimatedTripMinutes = 25;
    route2S.schedule.referenceRun = {
      source: "manual_reference_2026_09_01_0830",
      conditions: "低客流、下雨、每站约停靠 5 秒",
      firstStopMappedTo: "university_station_piazza",
      durationMinutes: 25,
      confidence: "low",
      softReference: true,
      expectedRangeMinutes: [22, 30],
    };
    route2S.schedule.notes = ["公众假期停驶"];
    route2S.stopDirections = { 5: "上行", 7: "下行" };
    route2S.etaRouteId = "2S";

    route3.stops[route3.stops.length - 1] = "university_station_piazza";
    route3.path = extendPathViaRoute(
      route3.path,
      route6A.path,
      stops.university_station.coord,
      stops.university_station_piazza.coord
    ) || route3.path;
    route3.pathSource = "composed_reviewed_road_segments_2026_09";

    const route8 = byId["8"];
    route8.schedule = schedule(
      "周一至周六（公众假期除外）07:35-18:35；每小时 15、35、55 分开出",
      "07:35",
      "18:35",
      [15, 35, 55],
      route8.schedule
    );
    route8.schedule.notes = [
      "公众假期停驶",
      "非教学日停大学站广场及崇基教学楼，不停大学站",
    ];
    route8.path = build2026Route8Path(route4, route8, route6A, stops) || route8.path;
    route8.pathSource = "composed_reviewed_road_segments_2026_09";
    route8.stops = [
      "yasumoto",
      "campus_circuit_east",
      "cw_chu",
      "area_39",
      "cw_chu",
      "united_residence",
      "chan_chun_ha_hostel",
      "shaw_college",
      "residences_3_4",
      "university_admin",
      "science_centre",
      "new_asia_circle",
      "united_college",
      "residences_3_4",
      "shaw_college",
      "area_39",
      "campus_circuit_north",
      "campus_circuit_east",
      "university_station",
      "university_station_piazza",
      "chung_chi_teaching",
    ];
    route8.stopDirections = {
      1: "上行",
      2: "上行",
      3: "上行",
      4: "下行",
      7: "下行",
      8: "下行",
      12: "下行",
      13: "上行",
      14: "上行",
      15: "下行",
      17: "下行",
    };
    route8.conditionalStops = {
      university_station: { teachingDaysOnly: true },
      university_station_piazza: { nonTeachingDaysOnly: true },
      chung_chi_teaching: { nonTeachingDaysOnly: true },
    };

    route6A.stops = route6A.stops.filter((stopId) => stopId !== "shaw_college");
    route6A.stopDirections = { 0: "下行", 3: "下行", 5: "下行" };
    route6A.schedule.notes = ["只限教学日", "不停逸夫书院"];

    const route7 = byId["7"];
    route7.schedule = teachingSchedule([
      { label: "周一至周五教学日", days: [1, 2, 3, 4, 5], first: "08:18", last: "17:18", departMinutes: [0, 18] },
      { label: "周六教学日", days: [6], first: "08:18", last: "13:18", departMinutes: [0, 18] },
    ], "教学日周一至五 08:18-17:18、周六 08:18-13:18；每小时 00、18 分开出", route7.schedule);

    const routeNCircleIndex = routeN.stops.indexOf("new_asia");
    if (routeNCircleIndex >= 0) routeN.stops[routeNCircleIndex] = "new_asia_circle";
    routeN.conditionalStops = { postgraduate_hostel: { departMinutes: [0] } };
    routeN.stopDirections = { 5: "下行", 6: "上行", 7: "上行", 8: "上行", 9: "下行", 13: "下行", 14: "下行", 16: "下行" };

    const routeH = byId.H;
    routeH.stops = clone(routeN.stops);
    routeH.path = clone(routeN.path);
    routeH.pathSource = "shared_night_holiday_route_2026_09";
    routeH.conditionalStops = {
      postgraduate_hostel: { departMinutes: [0] },
      area_39: { departMinutes: [0] },
    };
    routeH.stopDirections = clone(routeN.stopDirections);
    routeH.schedule.notes = ["星期日及公众假期服务", "每小时 00 分班次停研究生宿舍一座及 39 区"];

    const replacement = [route1, route2, route2S];
    const result = [];
    routes.forEach((route) => {
      if (route.id === "1A") result.push(...replacement);
      if (["1A", "1B", "2"].includes(route.id)) return;
      result.push(route);
    });
    return result;
  }

  function schedule(summary, first, last, departMinutes, baseSchedule) {
    return {
      ...clone(baseSchedule || {}),
      source: "shuttle_2026_09_01",
      estimatedTripMinutes: Number(baseSchedule && baseSchedule.estimatedTripMinutes) || 20,
      summary,
      rules: [{
        label: "周一至周六",
        days: [1, 2, 3, 4, 5, 6],
        first,
        last,
        departMinutes,
        exceptPublicHolidays: true,
      }],
      notes: [],
    };
  }

  function teachingSchedule(rules, summary, baseSchedule) {
    return {
      ...clone(baseSchedule || {}),
      source: "meet_class_2026_09_01",
      estimatedTripMinutes: Number(baseSchedule && baseSchedule.estimatedTripMinutes) || 20,
      summary,
      rules: rules.map((rule) => ({ ...rule, teachingDaysOnly: true })),
      notes: ["只限教学日；非教学日、阅读周及大学假期停驶"],
    };
  }

  function ensure2026Stops(mapData) {
    if (!mapData.stops) return;
    const isGcj02 = /GCJ-02/i.test(String(mapData.metadata && mapData.metadata.coordinateSystem || ""));
    if (!mapData.stops.campus_circuit_north) {
      mapData.stops.campus_circuit_north = {
        name: "环迴北站",
        coord: isGcj02 ? [114.2102547, 22.4230095] : [114.205375, 22.42584],
        source: "CUHK Transport Office route 8 / OSM Campus Circuit North",
      };
    }
    mapData.stops.new_asia_circle = {
      name: "新亚坊",
      coord: isGcj02 ? [114.2125231, 22.4182361] : [114.2076468, 22.4210723],
      osmId: "node/2036051434",
      source: "CUHK Transport Office route pages / OpenStreetMap",
    };
    if (mapData.stops.new_asia) {
      Object.assign(mapData.stops.new_asia, {
        name: "新亚书院",
        coord: isGcj02 ? [114.2124352, 22.4184348] : [114.2075587, 22.4212709],
        osmId: "node/1502822176",
        source: "OpenStreetMap",
      });
    }
  }

  function build2SPath(route2, route1B, stops) {
    if (!route2 || !route1B || !stops.university_station_piazza || !stops.shaw_hall || !stops.university_admin) return null;
    const prefix = pathSlice(route1B.path, stops.shaw_hall.coord, false);
    const middle = pathBetween(route2.path, stops.shaw_hall.coord, stops.university_admin.coord);
    const suffix = pathSlice(route1B.path, stops.university_admin.coord, true);
    if (!prefix.length || !middle.length || !suffix.length) return null;
    return joinPaths([stops.university_station_piazza.coord], prefix, middle, suffix);
  }

  function build2026Route8Path(route4, route8, route6A, stops) {
    if (!route4 || !route8 || !route6A || !stops.yasumoto || !stops.area_39 ||
      !stops.university_station || !stops.chung_chi_teaching) return null;
    const prefix = pathBetween(route4.path, stops.yasumoto.coord, stops.area_39.coord);
    const body = pathSlice(route8.path, stops.area_39.coord, true);
    const nonTeachingTail = pathBetween(
      route6A.path,
      stops.university_station.coord,
      stops.chung_chi_teaching.coord
    );
    if (!prefix.length || !body.length || !nonTeachingTail.length) return null;
    return joinPaths(prefix, body, nonTeachingTail);
  }

  function extendPathViaRoute(path, connectorPath, connectorStart, destination) {
    const suffix = pathBetween(connectorPath, connectorStart, destination);
    if (!Array.isArray(path) || !path.length || !suffix.length) return null;
    return joinPaths(path, suffix);
  }

  function pathBetween(path, startCoord, endCoord) {
    if (!Array.isArray(path) || !path.length) return [];
    const startIndex = nearestPathIndex(path, startCoord, 0);
    const endIndex = nearestPathIndex(path, endCoord, startIndex);
    return endIndex >= startIndex ? path.slice(startIndex, endIndex + 1) : [];
  }

  function pathSlice(path, coord, after) {
    if (!Array.isArray(path) || !path.length) return [];
    const index = nearestPathIndex(path, coord, 0);
    return after ? path.slice(index) : path.slice(0, index + 1);
  }

  function nearestPathIndex(path, coord, startIndex) {
    let bestIndex = startIndex || 0;
    let bestDistance = Infinity;
    for (let index = bestIndex; index < path.length; index += 1) {
      const dx = path[index][0] - coord[0];
      const dy = path[index][1] - coord[1];
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function joinPaths(...parts) {
    const result = [];
    parts.forEach((part) => part.forEach((coord) => {
      const previous = result[result.length - 1];
      if (!previous || previous[0] !== coord[0] || previous[1] !== coord[1]) result.push(clone(coord));
    }));
    return result;
  }

  return {
    LEGACY_SCHEME_ID,
    NEW_SCHEME_ID,
    normalizeSchemeId,
    applyTransportRouteScheme,
  };
});
