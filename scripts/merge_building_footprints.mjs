import fs from "node:fs";

const [basePath, overpassPath, outputPath] = process.argv.slice(2);

if (!basePath || !overpassPath || !outputPath) {
  throw new Error("Usage: node scripts/merge_building_footprints.mjs base.geojson overpass.json output.geojson");
}

const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const overpass = JSON.parse(fs.readFileSync(overpassPath, "utf8"));

const nonBuildingFeatures = base.features.filter((feature) => {
  const properties = feature.properties || {};
  const geometry = feature.geometry || {};
  return geometry.type === "Point" || !properties.building;
});

const buildingFeatures = [];
const skipped = {};
const seen = new Set();

for (const element of overpass.elements || []) {
  if (element.type !== "way") {
    count(skipped, "non_way");
    continue;
  }
  if (!element.tags || !element.tags.building) {
    count(skipped, "not_building");
    continue;
  }
  if (!Array.isArray(element.geometry) || element.geometry.length < 4) {
    count(skipped, "no_geometry");
    continue;
  }

  const id = `way/${element.id}`;
  if (seen.has(id)) continue;
  seen.add(id);

  const coordinates = element.geometry.map((point) => [point.lon, point.lat]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    count(skipped, "open_way");
    continue;
  }

  buildingFeatures.push({
    type: "Feature",
    properties: {
      ...element.tags,
      "@id": id,
    },
    geometry: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  });
}

buildingFeatures.sort((a, b) => {
  const nameA = nameOf(a.properties) || a.properties["@id"];
  const nameB = nameOf(b.properties) || b.properties["@id"];
  return nameA.localeCompare(nameB, "zh-Hant");
});

const result = {
  ...base,
  features: [...nonBuildingFeatures, ...buildingFeatures],
  metadata: {
    ...(base.metadata || {}),
    building_source: "OpenStreetMap via Overpass building query",
    building_count: buildingFeatures.length,
    building_overpass_timestamp: overpass.osm3s && overpass.osm3s.timestamp_osm_base,
    skipped_building_candidates: skipped,
  },
};

fs.writeFileSync(outputPath, JSON.stringify(result), "utf8");
console.log(JSON.stringify({
  output: outputPath,
  features: result.features.length,
  buildings: buildingFeatures.length,
  skipped,
}, null, 2));

function nameOf(properties) {
  return properties.name || properties["name:zh"] || properties["name:en"] || "";
}

function count(object, key) {
  object[key] = (object[key] || 0) + 1;
}
