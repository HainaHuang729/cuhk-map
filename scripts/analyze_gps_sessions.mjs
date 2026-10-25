import fs from "node:fs";
import path from "node:path";

const REASON_TEXT = {
  usable_calibration: "has usable stop-to-stop timing calibration",
  usable_calibration_low_track: "has usable calibration, but the raw track is short or sparse",
  usable_dwell_only: "has usable stop dwell observations, but no usable segment timing",
  stale_paused_session: "session duration is too long; likely left running after the ride",
  too_few_samples: "too few GPS samples to infer movement",
  same_stop_short: "board and alight are the same stop, and the session is very short",
  too_short_duration: "session duration is too short to infer a stop segment",
  same_stop_no_progress: "board and alight are the same stop",
  too_short_distance: "track distance is too short to infer a stop segment",
  missing_board_or_alight_stop: "missing a reliable board or alight stop",
  no_reliable_stop_sequence: "track exists, but no reliable stop sequence was produced",
  unknown_record_shape: "record shape is not a recognized ride session",
};

const STATUS_WEIGHT = {
  valid: 0,
  partial: 1,
  weak: 2,
  invalid: 3,
};

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.inputFiles.length) {
  printUsage(args.help ? 0 : 1);
}

const loadedFiles = [];
const rideSessions = [];
const sampleChunks = [];

for (const file of args.inputFiles) {
  const records = readRecords(file);
  loadedFiles.push({ file, records: records.length });
  for (const record of records) {
    if (isRideSession(record)) {
      rideSessions.push(analyzeSession(record, file));
    } else if (isSampleChunk(record)) {
      sampleChunks.push(analyzeSampleChunk(record, file));
    }
  }
}

const segmentObservations = rideSessions.flatMap((session) => session.usableSegments);
const dwellObservations = rideSessions.flatMap((session) => session.usableDwell);
const segmentSummary = summarizeSegmentObservations(segmentObservations, false);
const routeSegmentSummary = summarizeSegmentObservations(segmentObservations, true);
const dwellSummary = summarizeDwellObservations(dwellObservations);
const chunkSummary = summarizeSampleChunks(sampleChunks);

const output = {
  schema: "cuhk_gps_session_analysis_v1",
  generatedAt: new Date().toISOString(),
  inputFiles: loadedFiles,
  summary: buildSummary({
    loadedFiles,
    rideSessions,
    sampleChunks,
    segmentObservations,
    dwellObservations,
    chunkSummary,
  }),
  recommendations: buildRecommendations(segmentSummary, routeSegmentSummary, dwellSummary),
  segments: segmentSummary,
  routeSegments: routeSegmentSummary,
  stopDwellSeconds: dwellSummary,
  sessions: rideSessions
    .slice()
    .sort(compareSessions),
  sampleChunks: chunkSummary,
};

const rendered = args.format === "markdown"
  ? renderMarkdown(output)
  : `${JSON.stringify(output, null, 2)}\n`;

if (args.outFile) {
  fs.writeFileSync(args.outFile, rendered);
  console.error(`Wrote ${args.outFile}`);
} else {
  process.stdout.write(rendered);
}

function parseArgs(rawArgs) {
  const result = {
    inputFiles: [],
    outFile: "",
    format: "json",
    help: false,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--out") {
      result.outFile = rawArgs[index + 1] || "";
      index += 1;
    } else if (arg === "--format") {
      result.format = rawArgs[index + 1] || "json";
      index += 1;
    } else {
      result.inputFiles.push(arg);
    }
  }
  if (!["json", "markdown"].includes(result.format)) {
    throw new Error(`Unsupported format: ${result.format}`);
  }
  return result;
}

function printUsage(exitCode) {
  const usage = [
    "Usage:",
    "  node scripts/analyze_gps_sessions.mjs <database_export.json...> [--format json|markdown] [--out report.json]",
    "",
    "Examples:",
    "  node scripts/analyze_gps_sessions.mjs ~/Desktop/database_export.json --format markdown --out ~/Desktop/gps-report.md",
    "  node scripts/analyze_gps_sessions.mjs export-a.json export-b.json --out gps-report.json",
  ].join("\n");
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${usage}\n`);
  process.exit(exitCode);
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
  if (!record || typeof record !== "object") return false;
  return (
    record.recordType === "ride_gps_session" ||
    record.schema === "ride_gps_session_v2" ||
    record.cloudPayloadSchema === "ride_gps_session_cloud_compact_v1" ||
    record.cloudPayloadSchema === "ride_gps_session_cloud_core_v2" ||
    (!!record.etaCalibration && !!record.board && !!record.alight) ||
    (!!record.board && !!record.alight && Array.isArray(record.gpsSamples))
  );
}

function isSampleChunk(record) {
  if (!record || typeof record !== "object") return false;
  return (
    record.recordType === "ride_gps_sample_chunk" ||
    record.schema === "ride_gps_sample_chunk_v1" ||
    record.cloudPayloadSchema === "ride_gps_sample_chunk_v1"
  );
}

function analyzeSession(record, sourceFile) {
  const usableSegments = Object.entries(record.etaCalibration?.segmentTravelMinutes || {})
    .map(([key, segment]) => normalizeSegment(record, key, segment))
    .filter(Boolean);
  const usableDwell = Object.entries(record.etaCalibration?.stopDwellSeconds || {})
    .map(([stopId, item]) => normalizeDwell(record, stopId, item))
    .filter(Boolean);
  const skippedSegments = Object.entries(record.etaCalibration?.segmentTravelMinutes || {})
    .length - usableSegments.length;
  const skippedDwell = Object.entries(record.etaCalibration?.stopDwellSeconds || {})
    .length - usableDwell.length;
  const sampleCount = getSampleCount(record);
  const durationSeconds = getDurationSeconds(record);
  const distanceMeters = getDistanceMeters(record);
  const board = normalizeEvent(record.board);
  const alight = normalizeEvent(record.alight);
  const classification = classifySession({
    record,
    sampleCount,
    durationSeconds,
    distanceMeters,
    board,
    alight,
    usableSegments,
    usableDwell,
  });

  return {
    id: record.payloadId || record.id || record._id || "",
    cloudId: record._id || "",
    sourceFile: path.basename(sourceFile),
    routeId: stringify(record.routeId || record.etaCalibration?.routeId),
    routeName: stringify(record.routeName || record.etaCalibration?.routeName),
    routeService: stringify(record.routeService),
    serviceDate: stringify(record.serviceDate || record.etaCalibration?.serviceDate),
    serviceDayType: stringify(record.serviceDayType || record.etaCalibration?.serviceDayType),
    serviceTimeBucket: stringify(record.serviceTimeBucket || record.etaCalibration?.serviceTimeBucket),
    serviceTimeBucketLabel: stringify(record.serviceTimeBucketLabel || record.etaCalibration?.serviceTimeBucketLabel),
    startedAt: stringify(record.startedAt || record.trackSummary?.startedAt),
    endedAt: stringify(record.endedAt || record.trackSummary?.endedAt),
    createdAt: stringify(record.createdAt),
    durationSeconds,
    durationMinutes: durationSeconds === null ? null : round(durationSeconds / 60, 2),
    sampleCount,
    distanceMeters,
    board,
    alight,
    qualityScore: classification.qualityScore,
    status: classification.status,
    reasonCode: classification.reasonCode,
    reasonText: REASON_TEXT[classification.reasonCode] || classification.reasonCode,
    weakSignals: buildWeakSignals({ board, alight, sampleCount, durationSeconds, distanceMeters }),
    calibration: {
      observedAt: stringify(record.etaCalibration?.observedAt),
      segmentCount: usableSegments.length,
      dwellCount: usableDwell.length,
      skippedSegments,
      skippedDwell,
    },
    usableSegments,
    usableDwell,
  };
}

function analyzeSampleChunk(record, sourceFile) {
  const sampleCount = getSampleCount(record);
  const durationSeconds = getDurationSeconds(record);
  const distanceMeters = getDistanceMeters(record);
  return {
    id: record.payloadId || record.id || record._id || "",
    cloudId: record._id || "",
    parentPayloadId: stringify(record.parentPayloadId || record.sessionId),
    sessionId: stringify(record.sessionId),
    sourceFile: path.basename(sourceFile),
    routeId: stringify(record.routeId),
    routeName: stringify(record.routeName),
    startedAt: stringify(record.startedAt),
    endedAt: stringify(record.endedAt),
    createdAt: stringify(record.createdAt),
    chunkIndex: numberOrNull(record.chunkIndex),
    chunkNumber: numberOrNull(record.chunkNumber),
    chunkCount: numberOrNull(record.chunkCount),
    sampleOffset: numberOrNull(record.sampleOffset),
    sampleCount,
    durationSeconds,
    durationMinutes: durationSeconds === null ? null : round(durationSeconds / 60, 2),
    distanceMeters,
  };
}

function normalizeSegment(record, fallbackKey, segment) {
  if (!segment || !Number.isFinite(Number(segment.minutes))) return null;
  const fromStopId = stringify(segment.fromStopId || fallbackKey.split("->")[0]);
  const toStopId = stringify(segment.toStopId || fallbackKey.split("->")[1]);
  if (!fromStopId || !toStopId) return null;
  const minutes = Number(segment.minutes);
  if (minutes < 0.2 || minutes > 20) return null;
  const routeSpecific = isRouteSpecificSegment(segment);
  return {
    key: `${fromStopId}->${toStopId}`,
    fromStopId,
    fromStopName: stringify(segment.fromStopName),
    toStopId,
    toStopName: stringify(segment.toStopName),
    routeId: stringify(segment.routeId || record.routeId || record.etaCalibration?.routeId),
    routeName: stringify(segment.routeName || record.routeName || record.etaCalibration?.routeName),
    routeSpecific,
    shareAcrossRoutes: segment.shareAcrossRoutes === true,
    minutes: round(minutes, 2),
    source: stringify(segment.source),
    serviceBucket: stringify(segment.serviceBucket || record.serviceBucket),
    serviceDate: stringify(segment.serviceDate || record.serviceDate),
    serviceDayType: stringify(segment.serviceDayType || record.serviceDayType),
    serviceTimeBucket: stringify(segment.serviceTimeBucket || record.serviceTimeBucket),
    fromTimestamp: stringify(segment.fromTimestamp),
    toTimestamp: stringify(segment.toTimestamp),
    observedAt: stringify(record.etaCalibration?.observedAt || record.createdAt),
    sessionId: record.payloadId || record.id || record._id || "",
  };
}

function normalizeDwell(record, fallbackStopId, item) {
  const seconds = Number(item?.seconds);
  const stopId = stringify(item?.stopId || fallbackStopId);
  if (!stopId || !Number.isFinite(seconds) || seconds < 3 || seconds > 180) return null;
  return {
    stopId,
    stopName: stringify(item.stopName),
    routeId: stringify(record.routeId || record.etaCalibration?.routeId),
    routeName: stringify(record.routeName || record.etaCalibration?.routeName),
    seconds: Math.round(seconds),
    source: stringify(item.source),
    serviceBucket: stringify(item.serviceBucket || record.serviceBucket),
    serviceDate: stringify(item.serviceDate || record.serviceDate),
    serviceDayType: stringify(item.serviceDayType || record.serviceDayType),
    serviceTimeBucket: stringify(item.serviceTimeBucket || record.serviceTimeBucket),
    observedAt: stringify(record.etaCalibration?.observedAt || record.createdAt),
    sessionId: record.payloadId || record.id || record._id || "",
  };
}

function isRouteSpecificSegment(segment) {
  if (segment.shareAcrossRoutes === true) return false;
  if (["direct_observed", "stop_passage", "stop_visit"].includes(segment.source)) return false;
  return segment.shareAcrossRoutes === false;
}

function classifySession({ sampleCount, durationSeconds, distanceMeters, board, alight, usableSegments, usableDwell }) {
  const sameStop = !!board.stopId && board.stopId === alight.stopId;
  if (durationSeconds !== null && durationSeconds > 6 * 3600) {
    return { status: "invalid", reasonCode: "stale_paused_session", qualityScore: 0 };
  }
  if (usableSegments.length > 0) {
    const lowTrack = sampleCount < 30 || (distanceMeters !== null && distanceMeters < 250);
    const qualityScore = Math.min(100, Math.round(
      70 +
      Math.min(10, sampleCount / 40) +
      Math.min(10, (distanceMeters || 0) / 350) +
      Math.min(8, usableSegments.length * 1.5) +
      Math.min(2, usableDwell.length * 0.5)
    ));
    return {
      status: "valid",
      reasonCode: lowTrack ? "usable_calibration_low_track" : "usable_calibration",
      qualityScore,
    };
  }
  if (usableDwell.length > 0) {
    return {
      status: "partial",
      reasonCode: "usable_dwell_only",
      qualityScore: Math.min(75, 50 + usableDwell.length * 4),
    };
  }
  if (sampleCount < 8) {
    return { status: "invalid", reasonCode: "too_few_samples", qualityScore: Math.max(5, sampleCount * 3) };
  }
  if (durationSeconds !== null && durationSeconds < 90 && sameStop) {
    return { status: "invalid", reasonCode: "same_stop_short", qualityScore: 15 };
  }
  if (durationSeconds !== null && durationSeconds < 90) {
    return { status: "weak", reasonCode: "too_short_duration", qualityScore: 30 };
  }
  if (sameStop) {
    return { status: "weak", reasonCode: "same_stop_no_progress", qualityScore: 30 };
  }
  if (!board.stopId || !alight.stopId) {
    return { status: "weak", reasonCode: "missing_board_or_alight_stop", qualityScore: 30 };
  }
  if (distanceMeters !== null && distanceMeters < 250) {
    return { status: "weak", reasonCode: "too_short_distance", qualityScore: 35 };
  }
  return { status: "weak", reasonCode: "no_reliable_stop_sequence", qualityScore: 40 };
}

function buildWeakSignals({ board, alight, sampleCount, durationSeconds, distanceMeters }) {
  const signals = [];
  if (board.stopId && board.stopDistanceMeters !== null && board.stopDistanceMeters <= 120) {
    signals.push({
      type: "board_stop_hint",
      stopId: board.stopId,
      stopName: board.stopName,
      timestamp: board.timestamp,
      distanceMeters: board.stopDistanceMeters,
    });
  }
  if (alight.stopId && alight.stopDistanceMeters !== null && alight.stopDistanceMeters <= 120) {
    signals.push({
      type: "alight_stop_hint",
      stopId: alight.stopId,
      stopName: alight.stopName,
      timestamp: alight.timestamp,
      distanceMeters: alight.stopDistanceMeters,
    });
  }
  if (sampleCount >= 8 && durationSeconds !== null) {
    signals.push({
      type: "track_shape_hint",
      sampleCount,
      durationSeconds,
      distanceMeters,
    });
  }
  return signals;
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") {
    return {
      stopId: "",
      stopName: "",
      stopIndex: null,
      timestamp: "",
      lat: null,
      lon: null,
      accuracy: null,
      stopDistanceMeters: null,
      routeErrorMeters: null,
      routeDistanceMeters: null,
      routeProgress: null,
    };
  }
  return {
    stopId: stringify(event.stopId),
    stopName: stringify(event.stopName),
    stopIndex: numberOrNull(event.stopIndex),
    timestamp: stringify(event.timestamp),
    lat: numberOrNull(event.lat),
    lon: numberOrNull(event.lon),
    accuracy: numberOrNull(event.accuracy),
    stopDistanceMeters: numberOrNull(event.stopDistanceMeters),
    routeErrorMeters: numberOrNull(event.routeErrorMeters),
    routeDistanceMeters: numberOrNull(event.routeDistanceMeters),
    routeProgress: numberOrNull(event.routeProgress),
  };
}

function getSampleCount(record) {
  const explicit = numberOrNull(record.sampleCount);
  if (explicit !== null) return explicit;
  const summary = numberOrNull(record.trackSummary?.sampleCount);
  if (summary !== null) return summary;
  return Array.isArray(record.gpsSamples) ? record.gpsSamples.length : 0;
}

function getDurationSeconds(record) {
  const summary = numberOrNull(record.trackSummary?.durationSeconds);
  if (summary !== null) return summary;
  const startedAt = Date.parse(record.startedAt || record.trackSummary?.startedAt || "");
  const endedAt = Date.parse(record.endedAt || record.trackSummary?.endedAt || "");
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt) {
    return Math.round((endedAt - startedAt) / 1000);
  }
  return null;
}

function getDistanceMeters(record) {
  const summary = numberOrNull(record.trackSummary?.distanceMeters);
  if (summary !== null) return summary;
  const explicit = numberOrNull(record.distanceMeters);
  if (explicit !== null) return explicit;
  if (!Array.isArray(record.gpsSamples) || record.gpsSamples.length < 2) return null;
  let meters = 0;
  let previous = null;
  for (const sample of record.gpsSamples) {
    const current = normalizePoint(sample);
    if (!current) continue;
    if (previous) {
      const step = haversineMeters(previous, current);
      if (step <= 150) meters += step;
    }
    previous = current;
  }
  return Math.round(meters);
}

function normalizePoint(point) {
  const lat = numberOrNull(point?.lat);
  const lon = numberOrNull(point?.lon);
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

function summarizeSegmentObservations(observations, routeSpecificOnly) {
  const map = new Map();
  for (const observation of observations) {
    if (routeSpecificOnly && !observation.routeSpecific) continue;
    const key = routeSpecificOnly
      ? `${observation.routeId}:${observation.key}`
      : observation.key;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(observation);
  }
  const result = {};
  for (const [key, group] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const minutes = group.map((item) => item.minutes).sort((a, b) => a - b);
    const first = group[0];
    result[key] = {
      key: first.key,
      fromStopId: first.fromStopId,
      fromStopName: first.fromStopName,
      toStopId: first.toStopId,
      toStopName: first.toStopName,
      routeId: routeSpecificOnly ? first.routeId : "",
      routeName: routeSpecificOnly ? first.routeName : "",
      minutes: round(percentile(minutes, 0.5), 2),
      p25Minutes: round(percentile(minutes, 0.25), 2),
      p75Minutes: round(percentile(minutes, 0.75), 2),
      meanMinutes: round(mean(minutes), 2),
      minMinutes: round(minutes[0], 2),
      maxMinutes: round(minutes[minutes.length - 1], 2),
      samples: minutes.length,
      confidence: confidenceForSamples(minutes.length),
      sourceRoutes: uniqueSorted(group.map((item) => item.routeId).filter(Boolean)),
      sources: uniqueSorted(group.map((item) => item.source).filter(Boolean)),
      serviceTimeBuckets: uniqueSorted(group.map((item) => item.serviceTimeBucket).filter(Boolean)),
      lastObservedAt: maxString(group.map((item) => item.observedAt)),
      sessionIds: uniqueSorted(group.map((item) => item.sessionId).filter(Boolean)),
    };
  }
  return result;
}

function summarizeDwellObservations(observations) {
  const map = new Map();
  for (const observation of observations) {
    if (!map.has(observation.stopId)) map.set(observation.stopId, []);
    map.get(observation.stopId).push(observation);
  }
  const result = {};
  for (const [stopId, group] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const seconds = group.map((item) => item.seconds).sort((a, b) => a - b);
    const first = group[0];
    result[stopId] = {
      stopId,
      stopName: first.stopName,
      seconds: Math.round(percentile(seconds, 0.5)),
      p25Seconds: Math.round(percentile(seconds, 0.25)),
      p75Seconds: Math.round(percentile(seconds, 0.75)),
      meanSeconds: Math.round(mean(seconds)),
      minSeconds: seconds[0],
      maxSeconds: seconds[seconds.length - 1],
      samples: seconds.length,
      confidence: confidenceForSamples(seconds.length),
      sourceRoutes: uniqueSorted(group.map((item) => item.routeId).filter(Boolean)),
      sources: uniqueSorted(group.map((item) => item.source).filter(Boolean)),
      serviceTimeBuckets: uniqueSorted(group.map((item) => item.serviceTimeBucket).filter(Boolean)),
      lastObservedAt: maxString(group.map((item) => item.observedAt)),
      sessionIds: uniqueSorted(group.map((item) => item.sessionId).filter(Boolean)),
    };
  }
  return result;
}

function summarizeSampleChunks(chunks) {
  const map = new Map();
  for (const chunk of chunks) {
    const key = chunk.parentPayloadId || chunk.sessionId || chunk.id || chunk.cloudId;
    if (!map.has(key)) {
      map.set(key, {
        key,
        routeId: chunk.routeId,
        routeName: chunk.routeName,
        startedAt: chunk.startedAt,
        endedAt: chunk.endedAt,
        createdAt: chunk.createdAt,
        expectedChunkCount: chunk.chunkCount,
        chunks: [],
      });
    }
    const group = map.get(key);
    group.routeId ||= chunk.routeId;
    group.routeName ||= chunk.routeName;
    group.startedAt = minString([group.startedAt, chunk.startedAt]);
    group.endedAt = maxString([group.endedAt, chunk.endedAt]);
    group.createdAt = maxString([group.createdAt, chunk.createdAt]);
    if (chunk.chunkCount !== null) group.expectedChunkCount = Math.max(group.expectedChunkCount || 0, chunk.chunkCount);
    group.chunks.push(chunk);
  }
  return [...map.values()]
    .map((group) => {
      const totalSamples = group.chunks.reduce((sum, chunk) => sum + chunk.sampleCount, 0);
      const chunkIndexes = uniqueSorted(group.chunks.map((chunk) => chunk.chunkIndex).filter((value) => value !== null));
      const missingIndexes = [];
      if (Number.isFinite(group.expectedChunkCount)) {
        for (let index = 0; index < group.expectedChunkCount; index += 1) {
          if (!chunkIndexes.includes(index)) missingIndexes.push(index);
        }
      }
      const durationSeconds = durationBetween(group.startedAt, group.endedAt);
      return {
        key: group.key,
        routeId: group.routeId,
        routeName: group.routeName,
        startedAt: group.startedAt,
        endedAt: group.endedAt,
        durationSeconds,
        durationMinutes: durationSeconds === null ? null : round(durationSeconds / 60, 2),
        chunkRecords: group.chunks.length,
        expectedChunkCount: group.expectedChunkCount || null,
        missingIndexes,
        complete: !!group.expectedChunkCount && missingIndexes.length === 0,
        sampleCount: totalSamples,
        files: uniqueSorted(group.chunks.map((chunk) => chunk.sourceFile)),
      };
    })
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

function buildSummary({ loadedFiles, rideSessions, sampleChunks, segmentObservations, dwellObservations, chunkSummary }) {
  const reasonCounts = countBy(rideSessions, (session) => session.reasonCode);
  const statusCounts = countBy(rideSessions, (session) => session.status);
  const routeCounts = countBy(rideSessions, (session) => session.routeId || "(unknown)");
  const validRouteCounts = countBy(
    rideSessions.filter((session) => session.status === "valid" || session.status === "partial"),
    (session) => session.routeId || "(unknown)"
  );
  return {
    files: loadedFiles.length,
    records: loadedFiles.reduce((sum, file) => sum + file.records, 0),
    rideSessions: rideSessions.length,
    sampleChunks: sampleChunks.length,
    chunkedTracks: chunkSummary.length,
    completeChunkedTracks: chunkSummary.filter((chunk) => chunk.complete).length,
    validSessions: rideSessions.filter((session) => session.status === "valid").length,
    partialSessions: rideSessions.filter((session) => session.status === "partial").length,
    weakSessions: rideSessions.filter((session) => session.status === "weak").length,
    invalidSessions: rideSessions.filter((session) => session.status === "invalid").length,
    segmentObservations: segmentObservations.length,
    dwellObservations: dwellObservations.length,
    reasonCounts,
    statusCounts,
    routeCounts,
    validRouteCounts,
  };
}

function buildRecommendations(segments, routeSegments, dwell) {
  const recommendations = [];
  for (const item of Object.values(segments)) {
    recommendations.push({
      type: "segment",
      key: item.key,
      routeId: "",
      label: `${item.fromStopName || item.fromStopId} -> ${item.toStopName || item.toStopId}`,
      value: item.minutes,
      unit: "minutes",
      samples: item.samples,
      confidence: item.confidence,
      action: item.samples >= 2 ? "merge" : "review",
      sourceRoutes: item.sourceRoutes,
      lastObservedAt: item.lastObservedAt,
    });
  }
  for (const item of Object.values(routeSegments)) {
    recommendations.push({
      type: "route_segment",
      key: item.key,
      routeId: item.routeId,
      label: `${item.routeId} ${item.fromStopName || item.fromStopId} -> ${item.toStopName || item.toStopId}`,
      value: item.minutes,
      unit: "minutes",
      samples: item.samples,
      confidence: item.confidence,
      action: item.samples >= 2 ? "merge" : "review",
      sourceRoutes: item.sourceRoutes,
      lastObservedAt: item.lastObservedAt,
    });
  }
  for (const item of Object.values(dwell)) {
    recommendations.push({
      type: "dwell",
      key: item.stopId,
      routeId: "",
      label: item.stopName || item.stopId,
      value: item.seconds,
      unit: "seconds",
      samples: item.samples,
      confidence: item.confidence,
      action: item.samples >= 2 ? "merge" : "review",
      sourceRoutes: item.sourceRoutes,
      lastObservedAt: item.lastObservedAt,
    });
  }
  return recommendations.sort((a, b) => {
    const actionOrder = (a.action === "merge" ? 0 : 1) - (b.action === "merge" ? 0 : 1);
    if (actionOrder) return actionOrder;
    const confidenceOrder = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (confidenceOrder) return confidenceOrder;
    return b.samples - a.samples;
  });
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# CUHK GPS session analysis");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Files: ${report.summary.files}`);
  lines.push(`- Records: ${report.summary.records}`);
  lines.push(`- Ride sessions: ${report.summary.rideSessions}`);
  lines.push(`- Sample chunks: ${report.summary.sampleChunks} (${report.summary.chunkedTracks} chunked tracks, ${report.summary.completeChunkedTracks} complete)`);
  lines.push(`- Valid / partial / weak / invalid: ${report.summary.validSessions} / ${report.summary.partialSessions} / ${report.summary.weakSessions} / ${report.summary.invalidSessions}`);
  lines.push(`- Segment observations: ${report.summary.segmentObservations}`);
  lines.push(`- Dwell observations: ${report.summary.dwellObservations}`);
  lines.push("");

  lines.push("## Reason counts");
  lines.push("");
  lines.push("| Reason | Count | Meaning |");
  lines.push("| --- | ---: | --- |");
  for (const [reason, count] of sortedEntries(report.summary.reasonCounts, "valueDesc")) {
    lines.push(`| ${escapeCell(reason)} | ${count} | ${escapeCell(REASON_TEXT[reason] || "")} |`);
  }
  lines.push("");

  lines.push("## Route counts");
  lines.push("");
  lines.push("| Route | Sessions | Valid/partial |");
  lines.push("| --- | ---: | ---: |");
  for (const [routeId, count] of sortedEntries(report.summary.routeCounts, "keyAsc")) {
    lines.push(`| ${escapeCell(routeId)} | ${count} | ${report.summary.validRouteCounts[routeId] || 0} |`);
  }
  lines.push("");

  lines.push("## Segment suggestions");
  lines.push("");
  lines.push("| Segment | Minutes | Samples | Confidence | Routes | Last observed |");
  lines.push("| --- | ---: | ---: | --- | --- | --- |");
  for (const item of Object.values(report.segments).sort((a, b) => b.samples - a.samples || a.key.localeCompare(b.key))) {
    lines.push([
      escapeCell(`${item.fromStopName || item.fromStopId} -> ${item.toStopName || item.toStopId}`),
      item.minutes,
      item.samples,
      item.confidence,
      escapeCell(item.sourceRoutes.join(", ")),
      escapeCell(shortTime(item.lastObservedAt)),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");

  lines.push("## Dwell suggestions");
  lines.push("");
  lines.push("| Stop | Seconds | Samples | Confidence | Routes | Last observed |");
  lines.push("| --- | ---: | ---: | --- | --- | --- |");
  for (const item of Object.values(report.stopDwellSeconds).sort((a, b) => b.samples - a.samples || a.stopId.localeCompare(b.stopId))) {
    lines.push([
      escapeCell(item.stopName || item.stopId),
      item.seconds,
      item.samples,
      item.confidence,
      escapeCell(item.sourceRoutes.join(", ")),
      escapeCell(shortTime(item.lastObservedAt)),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");

  if (report.sampleChunks.length) {
    lines.push("## Sample chunks");
    lines.push("");
    lines.push("| Track | Route | Chunks | Samples | Complete | Duration |");
    lines.push("| --- | --- | ---: | ---: | --- | ---: |");
    for (const chunk of report.sampleChunks) {
      lines.push([
        escapeCell(shortId(chunk.key)),
        escapeCell(chunk.routeId),
        `${chunk.chunkRecords}/${chunk.expectedChunkCount || "?"}`,
        chunk.sampleCount,
        chunk.complete ? "yes" : `no (${chunk.missingIndexes.join(",")})`,
        chunk.durationMinutes ?? "",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    lines.push("");
  }

  lines.push("## Session details");
  lines.push("");
  lines.push("| Time | Route | Board -> Alight | Samples | Duration | Distance | Status | Reason | Seg/Dwell |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: |");
  for (const session of report.sessions) {
    lines.push([
      escapeCell(shortTime(session.startedAt)),
      escapeCell(session.routeId),
      escapeCell(`${session.board.stopName || session.board.stopId || "?"} -> ${session.alight.stopName || session.alight.stopId || "?"}`),
      session.sampleCount,
      session.durationMinutes ?? "",
      session.distanceMeters ?? "",
      session.status,
      escapeCell(session.reasonCode),
      `${session.usableSegments.length}/${session.usableDwell.length}`,
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function compareSessions(a, b) {
  const status = STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status];
  if (status) return status;
  const route = String(a.routeId).localeCompare(String(b.routeId));
  if (route) return route;
  return String(a.startedAt).localeCompare(String(b.startedAt));
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = stringify(getKey(item)) || "(blank)";
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function confidenceForSamples(samples) {
  if (samples >= 5) return "high";
  if (samples >= 2) return "medium";
  return "low";
}

function confidenceRank(confidence) {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  if (confidence === "low") return 1;
  return 0;
}

function sortedEntries(object, mode) {
  const entries = Object.entries(object || {});
  if (mode === "valueDesc") {
    return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

function durationBetween(startedAt, endedAt) {
  const start = Date.parse(startedAt || "");
  const end = Date.parse(endedAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

function haversineMeters(a, b) {
  const radius = 6371008.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(value) {
  return value * Math.PI / 180;
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

function mean(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minString(values) {
  return values.filter(Boolean).sort()[0] || "";
}

function maxString(values) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringify(value) {
  return value === undefined || value === null ? "" : String(value);
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function shortTime(value) {
  if (!value) return "";
  return String(value).replace(".000Z", "Z");
}

function shortId(value) {
  const text = String(value || "");
  if (text.length <= 18) return text;
  return `${text.slice(0, 9)}...${text.slice(-6)}`;
}
