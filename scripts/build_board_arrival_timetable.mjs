import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const DEFAULT_MAX_STOP_DISTANCE_METERS = 80;
const DEFAULT_MAX_GPS_ACCURACY_METERS = 50;
const DEFAULT_MAX_SCHEDULE_ERROR_MINUTES = 8;

const args = parseArgs(process.argv.slice(2));
if (!args.inputFile) printUsage(1);

const mapModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../data/cuhk_bus_routes.js"
);
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(mapModulePath, "utf8"), context);

const mapData = context.CUHK_BUS_DATA;
const mapUtils = context.CUHK_BUS_UTILS;
const routesById = new Map(mapData.routes.map((route) => [String(route.id), route]));
const broadcasts = readRecords(args.inputFile).filter(isBoardBroadcast);
const rejectionCounts = {};
const matched = [];

for (const broadcast of broadcasts) {
  const result = matchBroadcastToScheduledTrip(broadcast);
  if (result.matched) {
    matched.push(result.matched);
  } else {
    rejectionCounts[result.reason] = (rejectionCounts[result.reason] || 0) + 1;
  }
}

const trips = buildObservedTrips(matched);
const output = {
  schema: "cuhk_board_arrival_timetable_v1",
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(args.inputFile),
  coordinateSystem: mapData.metadata.coordinateSystem || "GCJ-02",
  filters: {
    maxStopDistanceMeters: args.maxStopDistanceMeters,
    maxGpsAccuracyMeters: args.maxGpsAccuracyMeters,
    maxScheduleMatchErrorMinutes: args.maxScheduleErrorMinutes,
  },
  summary: {
    broadcasts: broadcasts.length,
    matchedBroadcasts: matched.length,
    rejectedBroadcasts: broadcasts.length - matched.length,
    observedTrips: trips.length,
    observedStops: trips.reduce((sum, trip) => sum + trip.stops.length, 0),
    routes: countBy(trips, (trip) => trip.routeId),
    rejectionCounts,
    medianArrivalResidualMinutes: round(percentile(
      matched.map((item) => item.residualMinutes).sort((a, b) => a - b),
      0.5
    )),
  },
  trips,
};

const rendered = `${JSON.stringify(output, null, 2)}\n`;
if (args.outFile) {
  fs.writeFileSync(args.outFile, rendered);
  console.error(`Wrote ${args.outFile}`);
} else {
  process.stdout.write(rendered);
}

function parseArgs(rawArgs) {
  const result = {
    inputFile: "",
    outFile: "",
    maxStopDistanceMeters: DEFAULT_MAX_STOP_DISTANCE_METERS,
    maxGpsAccuracyMeters: DEFAULT_MAX_GPS_ACCURACY_METERS,
    maxScheduleErrorMinutes: DEFAULT_MAX_SCHEDULE_ERROR_MINUTES,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--out") {
      result.outFile = rawArgs[++index] || "";
    } else if (arg === "--max-stop-distance") {
      result.maxStopDistanceMeters = Number(rawArgs[++index]);
    } else if (arg === "--max-accuracy") {
      result.maxGpsAccuracyMeters = Number(rawArgs[++index]);
    } else if (arg === "--max-schedule-error") {
      result.maxScheduleErrorMinutes = Number(rawArgs[++index]);
    } else if (arg === "--help" || arg === "-h") {
      printUsage(0);
    } else if (!result.inputFile) {
      result.inputFile = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return result;
}

function printUsage(exitCode) {
  const text = [
    "Usage:",
    "  node scripts/build_board_arrival_timetable.mjs <board_broadcast_export.json> [--out timetable.json]",
    "",
    "Options:",
    "  --max-stop-distance <meters>   Default: 80",
    "  --max-accuracy <meters>        Default: 50",
    "  --max-schedule-error <minutes> Default: 8",
  ].join("\n");
  (exitCode ? process.stderr : process.stdout).write(`${text}\n`);
  process.exit(exitCode);
}

function readRecords(file) {
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    for (const key of ["records", "data", "list", "items"]) {
      if (Array.isArray(parsed && parsed[key])) return parsed[key];
    }
    return parsed && typeof parsed === "object" ? [parsed] : [];
  } catch {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function isBoardBroadcast(record) {
  return !!record && (
    record.recordType === "board_broadcast" ||
    record.schema === "board_broadcast_v1"
  );
}

function matchBroadcastToScheduledTrip(broadcast) {
  if (Number(broadcast.nearestStopDistanceMeters) > args.maxStopDistanceMeters) {
    return { reason: "stop_distance" };
  }
  if (Number(broadcast.gps && broadcast.gps.accuracy) > args.maxGpsAccuracyMeters) {
    return { reason: "gps_accuracy" };
  }

  const route = routesById.get(String(broadcast.routeId || ""));
  if (!route) return { reason: "unknown_route" };
  const observedAt = new Date(broadcast.timestamp || broadcast.createdAt || "");
  if (!Number.isFinite(observedAt.getTime())) return { reason: "invalid_timestamp" };

  const stopIndexes = matchingStopIndexes(route, broadcast);
  if (!stopIndexes.length) return { reason: "stop_not_on_route" };
  const vehicles = mapUtils.activeVehicles(route, observedAt);
  if (!vehicles.length) return { reason: "no_active_scheduled_vehicle" };

  const clock = mapUtils.hongKongClock(observedAt);
  let best = null;
  for (const vehicle of vehicles) {
    for (const stopIndex of stopIndexes) {
      const stopOffsetMinutes = mapUtils.routeStopOffsetMinutes(route, stopIndex, vehicle.tripMinutes);
      const scheduledArrivalMinute = vehicle.departure + stopOffsetMinutes;
      const residualMinutes = clock.minutes - scheduledArrivalMinute;
      const candidate = {
        broadcast,
        route,
        vehicle,
        stopIndex,
        stopOffsetMinutes,
        scheduledArrivalMinute,
        residualMinutes,
        errorMinutes: Math.abs(residualMinutes),
      };
      if (!best || candidate.errorMinutes < best.errorMinutes) best = candidate;
    }
  }
  if (!best || best.errorMinutes > args.maxScheduleErrorMinutes) {
    return { reason: "ambiguous_schedule_match" };
  }

  const serviceDate = String(broadcast.serviceDate || hongKongDate(observedAt));
  const scheduledDeparture = mapUtils.formatTime(best.vehicle.departure);
  return {
    matched: {
      tripId: `${serviceDate}:${route.id}:${scheduledDeparture}`,
      serviceDate,
      routeId: route.id,
      routeName: route.name,
      routeService: route.service,
      ruleLabel: best.vehicle.ruleLabel || "",
      scheduledDeparture,
      scheduledDepartureMinute: best.vehicle.departure,
      stopId: broadcast.stopId,
      stopName: broadcast.stopName || mapData.stops[broadcast.stopId]?.name || broadcast.stopId,
      stopIndex: best.stopIndex,
      direction: broadcast.direction || mapUtils.routeStopDirectionLabel(route, best.stopIndex) || "",
      scheduledArrival: formatMinute(best.scheduledArrivalMinute),
      scheduledArrivalMinute: round(best.scheduledArrivalMinute, 3),
      observedArrival: observedAt.toISOString(),
      observedArrivalLocal: hongKongDateTime(observedAt),
      residualMinutes: round(best.residualMinutes, 3),
      stopDistanceMeters: finiteOrNull(broadcast.nearestStopDistanceMeters),
      gpsAccuracyMeters: finiteOrNull(broadcast.gps && broadcast.gps.accuracy),
      reportId: String(broadcast.id || broadcast._id || ""),
      anonymousUserKey: String(broadcast.userAnonymousKey || broadcast._openid || ""),
    },
  };
}

function matchingStopIndexes(route, broadcast) {
  const stopIndexes = [];
  const given = Number(broadcast.stopIndex);
  if (Number.isInteger(given) && route.stops[given] === broadcast.stopId) {
    return [given];
  }
  route.stops.forEach((stopId, stopIndex) => {
    if (stopId === broadcast.stopId) stopIndexes.push(stopIndex);
  });
  return stopIndexes;
}

function buildObservedTrips(rows) {
  const tripGroups = groupBy(rows, (row) => row.tripId);
  return [...tripGroups.values()]
    .map((tripRows) => {
      const first = tripRows[0];
      const stopGroups = groupBy(tripRows, (row) => `${row.stopIndex}:${row.stopId}`);
      const stops = [...stopGroups.values()]
        .map(summarizeObservedStop)
        .sort((a, b) => a.stopIndex - b.stopIndex);
      const residuals = stops.map((stop) => stop.residualMinutes);
      return {
        tripId: first.tripId,
        serviceDate: first.serviceDate,
        routeId: first.routeId,
        routeName: first.routeName,
        routeService: first.routeService,
        ruleLabel: first.ruleLabel,
        scheduledDeparture: first.scheduledDeparture,
        inferredDelayMinutes: round(percentile(residuals.sort((a, b) => a - b), 0.5)),
        evidenceCount: tripRows.length,
        uniqueObservers: uniqueCount(tripRows.map((row) => row.anonymousUserKey).filter(Boolean)),
        stops,
      };
    })
    .sort((a, b) => (
      a.serviceDate.localeCompare(b.serviceDate) ||
      a.scheduledDeparture.localeCompare(b.scheduledDeparture) ||
      String(a.routeId).localeCompare(String(b.routeId))
    ));
}

function summarizeObservedStop(rows) {
  const sorted = rows.slice().sort((a, b) => a.observedArrival.localeCompare(b.observedArrival));
  const first = sorted[0];
  const residuals = sorted.map((row) => row.residualMinutes).sort((a, b) => a - b);
  return {
    stopId: first.stopId,
    stopName: first.stopName,
    stopIndex: first.stopIndex,
    direction: first.direction,
    scheduledArrival: first.scheduledArrival,
    observedArrival: first.observedArrivalLocal,
    residualMinutes: first.residualMinutes,
    medianResidualMinutes: round(percentile(residuals, 0.5)),
    evidenceCount: sorted.length,
    uniqueObservers: uniqueCount(sorted.map((row) => row.anonymousUserKey).filter(Boolean)),
    medianStopDistanceMeters: round(percentile(
      sorted.map((row) => row.stopDistanceMeters).filter(Number.isFinite).sort((a, b) => a - b),
      0.5
    )),
    medianGpsAccuracyMeters: round(percentile(
      sorted.map((row) => row.gpsAccuracyMeters).filter(Number.isFinite).sort((a, b) => a - b),
      0.5
    )),
  };
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = String(getKey(item) || "(unknown)");
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  const index = (values.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function uniqueCount(values) {
  return new Set(values).size;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function formatMinute(value) {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function hongKongDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hongKongDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}
