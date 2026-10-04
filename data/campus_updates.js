(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CUHK_CAMPUS_UPDATES = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const checkedAt = "2026-10-04";
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
    { id: "east-up-20260928", stopId: "campus_circuit_east", direction: "上行", routes: ["4", "8"], start: "2026-09-28T00:00:00+08:00", text: "环迴东上行站临时迁至原站南侧、夏鼎基运动场入口转弯附近（4/8线）；至工程完结。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-campus-circuit-east-upward/" },
    { id: "east-down-20260919", stopId: "campus_circuit_east", direction: "下行", routes: ["8"], start: "2026-09-19T08:35:00+08:00", text: "环迴东下行站临时迁至原站北侧、物业管理处对出（8线）；至工程完结。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-campus-circuit-east-downwards/" },
    { id: "mini-station-20260915", stopId: "university_station", routes: ["MINI-N", "MINI-S"], start: "2026-09-15T00:00:00+08:00", text: "大学站收费小巴候车位置因停车场工程临时迁移，请按现场临时站牌候车；至工程完结。", coordinateStatus: "official_photo_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/pslb-stop-temporary-relocation/" },
    { id: "mini-engineering-20260803", stopId: "engineering", routes: ["MINI-S"], start: "2026-08-03T09:00:00+08:00", text: "何善衡工程学大楼收费小巴站临时迁至原站南侧、教研楼一座附近；至工程完结。", coordinateStatus: "official_diagram_only", sourceUrl: "https://transport.cuhk.edu.hk/newsdetails/bus-stop-temporary-relocation-shaw-college-16/" },
  ];
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
    return notices.filter((notice) => notice.stopId === stopId && Date.parse(notice.start) <= at.getTime() && (!notice.end || Date.parse(notice.end) > at.getTime()));
  }
  function eventText(event) {
    return `${event.dateText}\n${event.title}${event.access ? `\n${event.access}` : ""}`;
  }
  return { checkedAt, venues, events, notices, eventsForBuilding, noticesForStop, eventText };
});
