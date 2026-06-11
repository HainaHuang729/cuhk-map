import fs from "node:fs";

const [basePath, overpassPath, outputPath] = process.argv.slice(2);

if (!basePath || !overpassPath || !outputPath) {
  throw new Error("Usage: node scripts/build_enriched_food_poi_geojson.mjs base.geojson overpass.json output.geojson");
}

const NAME_KEYS = ["name", "name:zh", "name:zh-Hans", "name:en"];
const COFFEE_WORDS = [
  "coffee",
  "café",
  "cafe",
  "咖啡",
  "mccafe",
  "mccafé",
  "starbucks",
  "pacific coffee",
];
const TEA_WORDS = [
  "bubble tea",
  "bubble_tea",
  "milk tea",
  "奶茶",
  "茶饮",
  "茶飲",
  "喜茶",
  "贡茶",
  "貢茶",
];

const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const overpass = JSON.parse(fs.readFileSync(overpassPath, "utf8"));
const nonPointFeatures = base.features.filter((feature) => (feature.geometry || {}).type !== "Point");
const seen = new Set();
const skipped = {};

const poiFeatures = [];
for (const element of overpass.elements || []) {
  const properties = { ...(element.tags || {}) };
  const osmId = `${element.type}/${element.id}`;
  if (seen.has(osmId)) continue;
  seen.add(osmId);

  const name = nameOf(properties);
  if (!name) {
    count(skipped, "unnamed");
    continue;
  }

  const point = pointOf(element);
  if (!point) {
    count(skipped, "no_point");
    continue;
  }

  const category = poiCategory(properties);
  if (!category) {
    count(skipped, "not_food_or_drink");
    continue;
  }

  properties["@id"] = osmId;
  properties.poi_category = category;
  if (category === "coffee" || category === "milk_tea" || category === "other_drink") {
    properties.drink_category = category;
  }

  poiFeatures.push({
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: point },
  });
}

poiFeatures.sort((a, b) => (
  `${a.properties.poi_category}:${nameOf(a.properties)}:${a.properties["@id"]}`
    .localeCompare(`${b.properties.poi_category}:${nameOf(b.properties)}:${b.properties["@id"]}`, "zh-Hant")
));

const categoryCounts = {};
for (const feature of poiFeatures) count(categoryCounts, feature.properties.poi_category);

const result = {
  ...base,
  name: outputPath.split("/").pop().replace(/\.geojson$/, ""),
  features: [...nonPointFeatures, ...poiFeatures],
  metadata: {
    ...(base.metadata || {}),
    source: "OpenStreetMap via targeted Overpass query",
    poi_filter_8: "targeted campus food and drink query over nodes, ways, and relations",
    kept_poi_count: poiFeatures.length,
    kept_poi_categories: categoryCounts,
    overpass_timestamp: overpass.osm3s && overpass.osm3s.timestamp_osm_base,
    skipped_candidates: skipped,
  },
};

fs.writeFileSync(outputPath, JSON.stringify(result), "utf8");
console.log(JSON.stringify({
  output: outputPath,
  features: result.features.length,
  poi: poiFeatures.length,
  categories: categoryCounts,
  skipped,
}, null, 2));

function nameOf(properties) {
  for (const key of NAME_KEYS) {
    const value = properties[key];
    if (value) return String(value).trim();
  }
  return "";
}

function pointOf(element) {
  if (Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return [element.lon, element.lat];
  }
  if (element.center && Number.isFinite(element.center.lon) && Number.isFinite(element.center.lat)) {
    return [element.center.lon, element.center.lat];
  }
  return null;
}

function poiCategory(properties) {
  const amenity = String(properties.amenity || "").toLowerCase();
  const shop = String(properties.shop || "").toLowerCase();
  const cuisine = String(properties.cuisine || "").toLowerCase();
  const text = Object.values(properties).join(" ").toLowerCase();

  if (amenity === "fast_food") return "fast_food";
  if (["restaurant", "food_court", "canteen"].includes(amenity)) return "restaurant";
  if (amenity === "cafe") {
    if (TEA_WORDS.some((word) => text.includes(word))) return "milk_tea";
    return "coffee";
  }
  if (cuisine.includes("bubble_tea") || TEA_WORDS.some((word) => text.includes(word))) return "milk_tea";
  if (cuisine === "coffee_shop" || COFFEE_WORDS.some((word) => text.includes(word))) return "coffee";
  if (["coffee", "tea", "beverages"].includes(shop)) return "other_drink";
  if (shop === "bakery") return "fast_food";
  return "";
}

function count(object, key) {
  object[key] = (object[key] || 0) + 1;
}
