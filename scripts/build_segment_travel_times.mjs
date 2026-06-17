import fs from "node:fs";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outFile = outIndex >= 0 ? args[outIndex + 1] : "";
const inputFiles = args.filter((arg, index) => (
  arg !== "--out" && (outIndex < 0 || index !== outIndex + 1)
));

if (!inputFiles.length) {
  console.error("Usage: node scripts/build_segment_travel_times.mjs <database_export.json...> [--out data/segment_travel_times.generated.json]");
  process.exit(1);
}

const globalSegments = new Map();
const routeSegments = new Map();
const stopDwell = new Map();
const summary = {
  files: 0,
  records: 0,
  rideSessions: 0,
  segmentObservations: 0,
  dwellObservations: 0,
  skippedSegments: 0,
};

for (const file of inputFiles) {
  const records = readRecords(file);
  summary.files += 1;
  summary.records += records.length;
  for (const record of records) {
    if (!isRideSession(record)) continue;
    summary.rideSessions += 1;
    const segments = record.etaCalibration && record.etaCalibration.segmentTravelMinutes || {};
    for (const [key, segment] of Object.entries(segments)) {
      const normalized = normalizeSegment(record, key, segment);
      if (!normalized) {
        summary.skippedSegments += 1;
        continue;
      }
      const routeSpecific = isRouteSpecificSegment(segment);
      const target = routeSpecific ? routeSegments : globalSegments;
      const targetKey = routeSpecific ? `${normalized.routeId}:${normalized.key}` : normalized.key;
      if (!target.has(targetKey)) target.set(targetKey, []);
      target.get(targetKey).push(normalized);
      summary.segmentObservations += 1;
    }
    const dwell = record.etaCalibration && record.etaCalibration.stopDwellSeconds || {};
    for (const [stopId, item] of Object.entries(dwell)) {
      const normalized = normalizeDwell(record, stopId, item);
      if (!normalized) continue;
      if (!stopDwell.has(normalized.stopId)) stopDwell.set(normalized.stopId, []);
      stopDwell.get(normalized.stopId).push(normalized);
      summary.dwellObservations += 1;
    }
  }
}

const output = {
  schema: "cuhk_segment_travel_times_v1",
  generatedAt: new Date().toISOString(),
  summary,
  segments: summarizeSegmentMap(globalSegments),
  routeSegments: summarizeSegmentMap(routeSegments),
  stopDwellSeconds: summarizeDwellMap(stopDwell),
};

const text = `${JSON.stringify(output, null, 2)}\n`;
if (outFile) {
  fs.writeFileSync(outFile, text);
  console.error(`Wrote ${outFile}`);
} else {
  process.stdout.write(text);
}

function readRecords(file) {
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return recordsFromParsedJson(parsed);
  } catch (error) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .flatMap(recordsFromParsedJson);
  }
}

function recordsFromParsedJson(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  for (const key of ["records", "data", "list", "items"]) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return [parsed];
}

function isRideSession(record) {
  return !!record && (
    record.recordType === "ride_gps_session" ||
    record.schema === "ride_gps_session_v2" ||
    record.etaCalibration && record.etaCalibration.segmentTravelMinutes
  );
}

function normalizeSegment(record, fallbackKey, segment) {
  if (!segment || !Number.isFinite(Number(segment.minutes))) return null;
  const fromStopId = String(segment.fromStopId || fallbackKey.split("->")[0] || "");
  const toStopId = String(segment.toStopId || fallbackKey.split("->")[1] || "");
  if (!fromStopId || !toStopId) return null;
  const minutes = Number(segment.minutes);
  if (minutes < 0.2 || minutes > 20) return null;
  return {
    key: `${fromStopId}->${toStopId}`,
    fromStopId,
    fromStopName: segment.fromStopName || "",
    toStopId,
    toStopName: segment.toStopName || "",
    routeId: segment.routeId || record.routeId || record.etaCalibration && record.etaCalibration.routeId || "",
    routeName: segment.routeName || record.routeName || record.etaCalibration && record.etaCalibration.routeName || "",
    minutes,
    source: segment.source || "",
    observedAt: record.etaCalibration && record.etaCalibration.observedAt || record.createdAt || "",
    serviceBucket: segment.serviceBucket || record.serviceBucket || "",
  };
}

function isRouteSpecificSegment(segment) {
  if (segment.shareAcrossRoutes === true) return false;
  if (segment.source === "direct_observed" || segment.source === "stop_passage" || segment.source === "stop_visit") return false;
  return segment.shareAcrossRoutes === false;
}

function normalizeDwell(record, fallbackStopId, item) {
  const seconds = Number(item && item.seconds);
  const stopId = String(item && item.stopId || fallbackStopId || "");
  if (!stopId || !Number.isFinite(seconds) || seconds < 3 || seconds > 180) return null;
  return {
    stopId,
    stopName: item.stopName || "",
    routeId: record.routeId || record.etaCalibration && record.etaCalibration.routeId || "",
    routeName: record.routeName || record.etaCalibration && record.etaCalibration.routeName || "",
    seconds,
    source: item.source || "",
    observedAt: record.etaCalibration && record.etaCalibration.observedAt || record.createdAt || "",
    serviceBucket: item.serviceBucket || record.serviceBucket || "",
  };
}

function summarizeSegmentMap(map) {
  const result = {};
  for (const [key, observations] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const minutes = observations.map((item) => item.minutes).sort((a, b) => a - b);
    const first = observations[0];
    const routeIds = [...new Set(observations.map((item) => item.routeId).filter(Boolean))].sort();
    result[key] = {
      fromStopId: first.fromStopId,
      fromStopName: first.fromStopName,
      toStopId: first.toStopId,
      toStopName: first.toStopName,
      minutes: round(percentile(minutes, 0.5)),
      p25Minutes: round(percentile(minutes, 0.25)),
      p75Minutes: round(percentile(minutes, 0.75)),
      meanMinutes: round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length),
      samples: minutes.length,
      sourceRoutes: routeIds,
      sources: [...new Set(observations.map((item) => item.source).filter(Boolean))].sort(),
      lastObservedAt: observations.map((item) => item.observedAt).filter(Boolean).sort().at(-1) || "",
    };
  }
  return result;
}

function summarizeDwellMap(map) {
  const result = {};
  for (const [stopId, observations] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const seconds = observations.map((item) => item.seconds).sort((a, b) => a - b);
    const first = observations[0];
    result[stopId] = {
      stopId,
      stopName: first.stopName,
      seconds: Math.round(percentile(seconds, 0.5)),
      p25Seconds: Math.round(percentile(seconds, 0.25)),
      p75Seconds: Math.round(percentile(seconds, 0.75)),
      meanSeconds: Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length),
      samples: seconds.length,
      sourceRoutes: [...new Set(observations.map((item) => item.routeId).filter(Boolean))].sort(),
      sources: [...new Set(observations.map((item) => item.source).filter(Boolean))].sort(),
      lastObservedAt: observations.map((item) => item.observedAt).filter(Boolean).sort().at(-1) || "",
    };
  }
  return result;
}

function percentile(values, p) {
  if (!values.length) return NaN;
  if (values.length === 1) return values[0];
  const index = (values.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function round(value) {
  return Number(Number(value).toFixed(2));
}
