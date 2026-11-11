# Third-Party Notices

The root MIT license applies to this project's original software and
documentation. It does not replace the licenses or rights of third-party
libraries, icons, map databases, university information, or trademarks.

## Leaflet

- Bundled files: `demos/ui-modes/assets/leaflet.js` and `leaflet.css`.
- License: BSD 2-Clause.
- Copyright: Volodymyr Agafonkin and CloudMade.
- Full notice: [leaflet-LICENSE.txt](demos/ui-modes/assets/leaflet-LICENSE.txt).
- Project: https://leafletjs.com/

## Lucide and Feather Icons

- Bundled library: `demos/ui-modes/assets/lucide.js`.
- Lucide: ISC; includes portions of Feather under MIT.
- Copyright: Lucide Contributors and Cole Bemis, as stated in the bundled notice.
- Full notice: [lucide-LICENSE.txt](demos/ui-modes/assets/lucide-LICENSE.txt).
- The campus facility PNG badges embedded in `data/campus_guide.js` and the
  icon-based UI also use Lucide artwork. Keep the same notices when reusing
  those assets, not only when copying the JavaScript library.
- Project: https://lucide.dev/

## OpenStreetMap

- Attribution: OpenStreetMap contributors.
- Database license: Open Data Commons Open Database License (ODbL) 1.0.
- Copyright and attribution: https://www.openstreetmap.org/copyright
- License: https://opendatacommons.org/licenses/odbl/1-0/
- OSM-derived material includes campus GeoJSON geometry, road and walking
  networks, building anchors, the embedded map data in the HTML/demo files,
  `data/campus_walking.js`, and the campus map renderings in
  `assets/campus-light.png` and `assets/campus-dark.png`.
- Keep visible map attribution and the applicable database notices. The MIT
  software license is not a relicensing of the underlying OSM database.
- Files can mix original code with embedded map data; the code and data retain
  their respective licenses.

## University and Other Source Information

Route schedules, service notices, dining information, building names and
facility details are compiled from the official sources cited in the data
files. Those citations, dates, access restrictions and uncertainty notices
must remain attached to the information. Source websites, documents, logos
and trademarks are not relicensed under MIT by this repository.

The published ETA model contains aggregate estimates, not the underlying
personal journeys. The MIT code license does not grant access to cloud
records, raw GPS traces, boarding records or personal information.

This is an independent campus guide, not an official CUHK service. Use of the
university name for geographic identification does not imply endorsement.

## JengMap Reference Data (2026-11-11)

Selected data references are attributed to [JengMap](https://jengmap.com/credits.html),
OpenStreetMap contributors and the HKSAR Lands Department. Original JengMap
application code, photographs and page artwork are not included.

- [Matched walking reference database](data/walking_attributes.reference.geojson):
  derivative OSM/Lands Department references, available under the applicable
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) terms. Government
  source data also retains [DATA.GOV.HK terms](https://data.gov.hk/en/terms-and-conditions).
  Matching is partial and does not verify access, opening hours or accessibility.
- [Connections reference database](data/campus_connections.reference.json):
  university landmark facts, KMB/Transport Department stop facts and MTR exit
  identifiers retain their cited source terms. The OSM-derived exit positions
  are attributed to JengMap / OpenStreetMap contributors under ODbL.
- The corresponding entries embedded in `data/campus_guide.js` retain those
  data terms. The MIT software license does not relicense these databases.
- Student nicknames are factual search aids attributed to
  [CUpedia](https://cupedia.org/wiki/b8ddca20-6a6b-41f7-85a5-922bd4d55201) and the
  [CUHK Taiwanese Student Association library guide](https://cuhktsa.gitbook.io/cuhk-tsa/xue-xiao-sheng-cun-yu-sheng-huo/3-4-tu-shu-guan).
  No articles, photographs or student personal data are reproduced.

See [scope, matching limits and reproduction](maintenance/campus-connections.md).

## MTR Identification Mark

The red/white MTR symbol embedded in `data/campus_guide.js` identifies MTR
station exits only. Source: [HK MTR logo SVG](https://upload.wikimedia.org/wikipedia/en/b/b9/HK_MTR_logo.svg),
checked against the [MTR website](https://www.mtr.com.hk/ch/customer/main/index.html)
on 2026-11-11. Its geometry and colours are retained and rasterized to PNG.
The mark belongs to MTR Corporation; it is not Lucide artwork or relicensed
under MIT. Its use does not imply affiliation with or endorsement by MTR.

## MTR Next Train Data

University Station train information is retrieved on demand from
[MTR's official Next Train dataset](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data).
Train times, platforms and destinations remain subject to the provider's terms;
the application's MIT licence does not relicense this data. The interface names
MTR as the source and does not imply an official MTR app or guaranteed arrivals.
