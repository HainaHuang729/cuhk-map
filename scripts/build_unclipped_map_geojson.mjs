import fs from "node:fs";

const [overpassPath, previousPath, outputPath] = process.argv.slice(2);

if (!overpassPath || !previousPath || !outputPath) {
  throw new Error("Usage: node scripts/build_unclipped_map_geojson.mjs overpass.json previous.geojson output.geojson");
}

const overpass = JSON.parse(fs.readFileSync(overpassPath, "utf8"));
const previous = JSON.parse(fs.readFileSync(previousPath, "utf8"));
const nodes = new Map();
const features = [];
const seenFeatureIds = new Set();
const DINING_CATEGORIES = new Set(["restaurant", "fast_food", "coffee", "milk_tea", "other_drink"]);

for (const element of overpass.elements || []) {
  if (element.type === "node" && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    nodes.set(element.id, [element.lon, element.lat]);
  }
}

for (const element of overpass.elements || []) {
  const tags = element.tags || {};
  if (!Object.keys(tags).length) continue;

  const id = `${element.type}/${element.id}`;
  if (seenFeatureIds.has(id)) continue;
  seenFeatureIds.add(id);

  if (element.type === "way") {
    const coordinates = (element.nodes || []).map((nodeId) => nodes.get(nodeId)).filter(Boolean);
    if (coordinates.length < 2) continue;

    const closed = coordinates.length >= 4 && sameCoordinate(coordinates[0], coordinates[coordinates.length - 1]);
    const polygon = closed && !tags.highway && (tags.building || tags.landuse || tags.leisure || tags.natural || tags.water);
    features.push({
      type: "Feature",
      properties: { ...tags, "@id": id },
      geometry: polygon
        ? { type: "Polygon", coordinates: [coordinates] }
        : { type: "LineString", coordinates },
    });
  }
}

const currentPoi = previous.features.filter((feature) => {
  const properties = feature.properties || {};
  const geometry = feature.geometry || {};
  return geometry.type === "Point" && DINING_CATEGORIES.has(properties.poi_category);
});
const functionalPoi = [];
const seenPoiIds = new Set(currentPoi.map((feature) => (feature.properties || {})["@id"]).filter(Boolean));

for (const element of overpass.elements || []) {
  const tags = element.tags || {};
  const category = functionalPoiCategory(tags);
  if (!category) continue;

  const id = `${element.type}/${element.id}`;
  if (seenPoiIds.has(id)) continue;

  const name = nameOf(tags);
  if (!name) continue;

  const point = pointOf(element);
  if (!point) continue;

  seenPoiIds.add(id);
  functionalPoi.push({
    type: "Feature",
    properties: {
      ...tags,
      "@id": id,
      poi_category: category,
      functional_category: category,
    },
    geometry: { type: "Point", coordinates: point },
  });
}

functionalPoi.sort((a, b) => (
  `${a.properties.poi_category}:${nameOf(a.properties)}:${a.properties["@id"]}`
    .localeCompare(`${b.properties.poi_category}:${nameOf(b.properties)}:${b.properties["@id"]}`, "zh-Hant")
));

const allPoi = [...currentPoi, ...functionalPoi];
const functionalCategoryCounts = functionalPoi.reduce((acc, feature) => {
  const category = (feature.properties || {}).poi_category;
  acc[category] = (acc[category] || 0) + 1;
  return acc;
}, {});

const counts = [...features, ...allPoi].reduce((acc, feature) => {
  const props = feature.properties || {};
  const geom = feature.geometry || {};
  if (props.highway) acc.roads += 1;
  if (props.building) acc.buildings += 1;
  if (geom.type === "Point" && props.poi_category) acc.poi += 1;
  acc.features += 1;
  return acc;
}, { features: 0, roads: 0, buildings: 0, poi: 0 });

const output = {
  type: "FeatureCollection",
  name: outputPath.split("/").pop().replace(/\.geojson$/, ""),
  features: [...features, ...allPoi],
  metadata: {
    ...(previous.metadata || {}),
    source: "OpenStreetMap via expanded CUHK bbox Overpass query, with existing reviewed campus dining POIs retained",
    clip_boundary: null,
    clip_method: "not clipped",
    road_coverage: "expanded bbox 22.4095,114.1965,22.4308,114.2168",
    osm_timestamp: overpass.osm3s && overpass.osm3s.timestamp_osm_base,
    road_count: counts.roads,
    building_count: counts.buildings,
    building_overpass_timestamp: overpass.osm3s && overpass.osm3s.timestamp_osm_base,
    retained_poi_count: currentPoi.length,
    functional_poi_count: functionalPoi.length,
    functional_poi_categories: functionalCategoryCounts,
  },
};

fs.writeFileSync(outputPath, JSON.stringify(output), "utf8");

console.log(JSON.stringify({ output: outputPath, ...counts }, null, 2));

function sameCoordinate(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function functionalPoiCategory(tags) {
  const amenity = String(tags.amenity || "").toLowerCase();
  const healthcare = String(tags.healthcare || "").toLowerCase();
  const building = String(tags.building || "").toLowerCase();
  const tourism = String(tags.tourism || "").toLowerCase();
  const manMade = String(tags.man_made || "").toLowerCase();
  const station = String(tags.station || "").toLowerCase();

  if (
    ["hospital", "clinic", "doctors", "pharmacy"].includes(amenity) ||
    ["hospital", "clinic", "doctor", "doctors", "pharmacy"].includes(healthcare) ||
    building === "hospital"
  ) {
    return "medical";
  }
  if (["hotel", "guest_house", "hostel"].includes(tourism)) return "accommodation";
  if (amenity === "ferry_terminal" || manMade === "pier" || station === "ferry") return "ferry";
  return "";
}

function pointOf(element) {
  if (Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return [element.lon, element.lat];
  }
  if (element.center && Number.isFinite(element.center.lon) && Number.isFinite(element.center.lat)) {
    return [element.center.lon, element.center.lat];
  }
  if (element.type === "way") {
    const coordinates = (element.nodes || []).map((nodeId) => nodes.get(nodeId)).filter(Boolean);
    return coordinates.length ? bboxCenter(coordinates) : null;
  }
  return null;
}

function bboxCenter(coordinates) {
  const bounds = coordinates.reduce((acc, [lon, lat]) => ({
    minLon: Math.min(acc.minLon, lon),
    minLat: Math.min(acc.minLat, lat),
    maxLon: Math.max(acc.maxLon, lon),
    maxLat: Math.max(acc.maxLat, lat),
  }), { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity });
  return [(bounds.minLon + bounds.maxLon) / 2, (bounds.minLat + bounds.maxLat) / 2];
}

function nameOf(tags) {
  return String(tags.name || tags["name:zh"] || tags["name:zh-Hant"] || tags["name:zh-Hans"] || tags["name:en"] || "").trim();
}
