(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CUHK_CAMPUS_UPDATES = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const checkedAt = "2026-10-25";
  const transportSource = "https://transport.cuhk.edu.hk/whats-new/";
  const hallSource = "https://www.srrsh.cuhk.edu.hk/en/event-calendar";
  const venues = [
    // Web coordinates invert the project's existing WGS84-to-GCJ02 transform.
    { code: "YIA", name: "康本国际学术园", coord: [114.215957, 22.41333], webCoord: [114.21108834, 22.4161705] },
    { code: "RRS", name: "邵逸夫堂", coord: [114.21198, 22.417118], webCoord: [114.20710258, 22.41995336] },
  ];
  const events = [
    { id: "inclusive-20261006", buildingCode: "RRS", title: "共融音乐会：和而不同", start: "2026-10-06T19:00:00+08:00", dateText: "10月6日 19:00", venueDetail: "邵逸夫堂", access: "中大师生及受邀嘉宾；免费，须预先登记", sourceUrl: "https://www.srrsh.cuhk.edu.hk/en/di-festival-202627-%E2%80%93-inclusive-concert-beauty-our-differences" },
    { id: "leap-20261009", buildingCode: "YIA", title: "CUHK LEAP 创新创业活动", start: "2026-10-09T11:00:00+08:00", end: "2026-10-10T18:00:00+08:00", dateText: "10月9–10日 每日11:00–18:00", venueDetail: "康本国际学术园", sourceUrl: "https://alumni.cuhk.edu.hk/events/cuhkleap2026/" },
    { id: "na-founders-20261009", buildingCode: "RRS", title: "新亚77周年院庆暨奖学金颁奖", start: "2026-10-09T11:30:00+08:00", dateText: "10月9日 11:30", venueDetail: "邵逸夫堂礼堂", sourceUrl: hallSource },
    { id: "cusa-20261010", buildingCode: "RRS", title: "职员协会45周年综艺晚会", start: "2026-10-10T19:00:00+08:00", dateText: "10月10日 19:00", venueDetail: "邵逸夫堂礼堂", sourceUrl: hallSource },
    { id: "conclave-20261014", buildingCode: "RRS", title: "Conclave 放映及映后讨论", start: "2026-10-14T19:00:00+08:00", dateText: "10月14日 19:00", venueDetail: "邵逸夫堂礼堂", sourceUrl: hallSource },
    { id: "tianshan-20261015", buildingCode: "RRS", title: "天山问候民族艺术晚会", start: "2026-10-15T19:30:00+08:00", dateText: "10月15日 19:30", venueDetail: "邵逸夫堂礼堂", sourceUrl: hallSource },
    { id: "infoday-20261017", buildingCode: "RRS", title: "本科入学资讯日讲座", start: "2026-10-17T09:30:00+08:00", dateText: "10月17日 入学讲座09:30/14:00；医护讲座11:45/15:45", venueDetail: "邵逸夫堂礼堂（仅此场地的讲座）", sourceUrl: hallSource },
    { id: "molecules-20261022", buildingCode: "RRS", title: "叶军讲座：Molecules under New Light", start: "2026-10-22T16:30:00+08:00", dateText: "10月22日 16:30", venueDetail: "邵逸夫堂", access: "免费；欢迎公众，须预先登记；英语", sourceUrl: "https://www.srrsh.cuhk.edu.hk/en/united-college-70th-anniversary-distinguished-visiting-scholar-scheme-2026-2027-public-lecture-2" },
    { id: "uc-anniversary-20261023", buildingCode: "RRS", title: "联合书院70周年院庆典礼", start: "2026-10-23T11:30:00+08:00", dateText: "10月23日 11:30", venueDetail: "邵逸夫堂礼堂", sourceUrl: hallSource },
  ];
  const notices = [
    { id: "mini-academic-20261020", stopId: "teaching_research_1", routes: ["MINI-N", "MINI-S"], start: "2026-10-20T00:00:00+08:00", text: "10月20日起，教研楼一座收费小巴站因崇基路工程临时迁移，至工程结束。临时站位于教研楼一座旁，按交通处图示及现场临时站牌候车；地图暂保留原坐标。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/pslb-stop-temporary-relocation-2/", sourceImageUrl: "https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_27_重要車務資訊_收費小巴站臨時遷移.jpg" },
    { id: "mini-cc-c-20261020", stopId: "chung_chi_staff_quarters", routes: ["MINI-N", "MINI-S"], start: "2026-10-20T00:00:00+08:00", text: "10月20日起，崇基C座收费小巴站因崇基路工程临时迁移，至工程结束。临时站按交通处图示及现场站牌候车；地图暂保留原坐标。公告指崇基C座，不代表D座另有迁站。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/pslb-stop-temporary-relocation-2/", sourceImageUrl: "https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_27_重要車務資訊_收費小巴站臨時遷移.jpg" },
    { id: "infoday-science-20261017", stopId: "science_centre", routes: ["8"], start: "2026-10-17T00:00:00+08:00", end: "2026-10-18T00:00:00+08:00", text: "10月17日资讯日：科学馆校巴站停用，8号线改停中央道碧秋楼旁的邵逸夫堂校巴站。", coordinateStatus: "existing_school_bus_stop", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-suspension/" },
    { id: "infoday-shaw-20261017", stopId: "shaw_hall", routes: ["8", "MINI-N"], start: "2026-10-17T00:00:00+08:00", end: "2026-10-18T00:00:00+08:00", text: "10月17日资讯日：8号线科学馆站及收费小巴上行邵逸夫堂站，改停此处的邵逸夫堂校巴站（中央道碧秋楼旁）。", coordinateStatus: "existing_school_bus_stop", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-suspension/" },
    { id: "east-up-20260928", stopId: "campus_circuit_east", direction: "上行", routes: ["4", "8"], start: "2026-09-28T00:00:00+08:00", text: "环迴东上行站临时迁至原站南侧、夏鼎基运动场入口转弯附近（4/8线）；至工程完结。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-campus-circuit-east-upward/" },
    { id: "east-down-20260919", stopId: "campus_circuit_east", direction: "下行", routes: ["8"], start: "2026-09-19T08:35:00+08:00", text: "环迴东下行站临时迁至原站北侧、物业管理处对出（8线）；至工程完结。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-campus-circuit-east-downwards/", sourceReusedDetectedOn: "2026-10-25", reconfirmationText: "环迴东下行旧迁站公告的网址已被其他站务通知复用，原临时位置是否仍适用待重新确认。候车请以现场站牌及交通处最新指示为准。" },
    { id: "mini-station-20260915", stopId: "university_station", routes: ["MINI-N", "MINI-S"], start: "2026-09-15T00:00:00+08:00", text: "大学站收费小巴候车位置因停车场工程临时迁移，请按现场临时站牌候车；至工程完结。", coordinateStatus: "official_photo_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/pslb-stop-temporary-relocation/" },
    { id: "mini-engineering-20260803", stopId: "engineering", routes: ["MINI-S"], start: "2026-08-03T09:00:00+08:00", text: "何善衡工程学大楼收费小巴站临时迁至原站南侧、教研楼一座附近；至工程完结。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-shaw-college-16/" },
  ];
  // Dated activities have no published end time; archive them without inventing one.
  const historicalNotices = [
    { id: "shaw-activity-20261022", date: "2026-10-22", startTime: "10:00", endTime: null, scope: "dated_activity", routes: ["3", "4", "5", "7", "8", "N"], stopIds: ["shaw_college"], text: "10月22日10:00起至活动结束，逸夫书院上、下行校巴站临时迁至逸夫大讲堂附近。上行涉及3/5/8/N，下行涉及3/4/7/8/N。", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-shaw-college-bus-stop/", sourceImageUrl: "https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_30_重要車務資訊_逸夫書院站臨時遷移.jpg" },
    { id: "piazza-yia-activity-20261023", date: "2026-10-23", startTime: "18:20", endTime: null, scope: "dated_activity", routes: ["2", "2S", "3", "4", "8"], stopIds: ["university_station_piazza", "yasumoto"], text: "10月23日18:20起至池旁路书院活动结束，2/2S/3/4/8号线的大学站广场、康本园站临时迁移；3号线以大学站校巴站为终点。", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-campus-circuit-east-downwards/", sourceImageUrl: "https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_28_重要車務資訊_2348號線校巴站臨時遷移.jpg" },
    { id: "mini-down-activity-20261023", date: "2026-10-23", startTime: "18:20", endTime: null, scope: "dated_activity", routes: ["MINI-S"], stopIds: ["engineering", "teaching_research_1", "chung_chi_staff_quarters", "ho_tim", "yasumoto"], text: "10月23日18:20起至池旁路书院活动结束，收费小巴下行暂停何善衡工程学大楼、教研楼一座、崇基C座、何添楼及康本园五站。", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/pslb-stop-temporary-suspension-5/", sourceImageUrl: "https://transport.cuhk.edu.hk/wp-content/uploads/news/Service_Information/TSP_ISI_2026_29_重要車務資訊_收費小巴站下行臨時停用.jpg" },
  ];
  const serviceAlerts = [
    { id: "infoday-suspension-20261017", routes: ["3", "4"], date: "2026-10-17", text: "10月17日资讯日，3号线及4号线暂停服务。访客请使用资讯日专用接驳巴士。", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/school-bus-roue-service-suspension/" },
  ];
  const temporaryStopStates = new WeakMap();
  function localDate(at = new Date()) {
    if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at)) return at;
    const value = new Date(new Date(at).getTime() + 8 * 3600000);
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : "";
  }
  function suspensionForRoute(routeId, at = new Date()) {
    const date = localDate(at);
    return serviceAlerts.find((alert) => alert.date === date && alert.routes.includes(routeId)) || null;
  }
  function applyTemporaryStops(data, at = new Date()) {
    const active = localDate(at) === "2026-10-17";
    let changed = false;
    (data.routes || []).filter((route) => route.id === "8").forEach((route) => {
      let state = temporaryStopStates.get(route);
      // A route-scheme refresh replaces the stop array; retain that new baseline.
      if (!state || route.stops !== state.applied) state = { base: route.stops.slice(), applied: route.stops };
      const stops = active ? state.base.map((id) => id === "science_centre" ? "shaw_hall" : id) : state.base;
      if (stops.join("|") !== route.stops.join("|")) {
        route.stops = stops.slice();
        changed = true;
      }
      state.applied = route.stops;
      temporaryStopStates.set(route, state);
    });
    return changed;
  }
  function expiresAt(event) {
    // Unknown event end times expire after the advertised Hong Kong calendar day.
    return event.end ? Date.parse(event.end) : Date.parse(`${event.start.slice(0, 10)}T23:59:59.999+08:00`);
  }
  function eventsForBuilding(code, at = new Date(), lookAheadDays = 30) {
    const now = at.getTime();
    return events.filter((event) => event.buildingCode === code && expiresAt(event) >= now && Date.parse(event.start) <= now + lookAheadDays * 86400000)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  function noticesForStop(stopId, at = new Date()) {
    return notices.filter((notice) => notice.stopId === stopId && Date.parse(notice.start) <= at.getTime() && (!notice.end || Date.parse(notice.end) > at.getTime()))
      .map((notice) => notice.sourceReusedDetectedOn && localDate(at) >= notice.sourceReusedDetectedOn ? {
        ...notice,
        text: notice.reconfirmationText,
        coordinateStatus: "needs_reconfirmation",
        needsReconfirmation: true,
        previousSourceUrl: notice.sourceUrl,
        sourceUrl: transportSource,
      } : notice);
  }
  function eventText(event) {
    return `${event.dateText}\n${event.title}${event.access ? `\n${event.access}` : ""}`;
  }
  return { checkedAt, venues, events, notices, historicalNotices, serviceAlerts, suspensionForRoute, applyTemporaryStops, eventsForBuilding, noticesForStop, eventText };
});
