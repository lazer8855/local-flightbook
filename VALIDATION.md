# Prototype validation

Validated by opening `dashboard.html` directly with a `file://` URL on Windows.
No local HTTP server was used. Real native folder/save dialogs and browser
permission prompts were exercised; file API methods were not mocked.

| Browser | Version | Coverage |
|---|---|---|
| Chrome for Testing | 145.0.7632.6 | Initial file/map workflow passed |
| Desktop Google Chrome | 154.0.8037.98 | File/map workflow, statistics, overview modes, terrain/3D, XC distances and numeric filters passed |
| Desktop Microsoft Edge | 155.0.4283.45 | File/map workflow, statistics, overview modes, terrain/3D, XC distances and numeric filters passed |

Machine-readable results are in `validation/chrome.json` and
`validation/edge.json` and `validation/chrome-stable.json`; screenshots are in
`validation/artifacts/`.

## Confirmed behaviour

- XC calculations use a bundled classic worker with `igc-xc-score` 1.8.0. Offline browser tests verify open/free/FAI distances, refinement without decreasing results, inclusive duration and XC filters, invalid ranges, duration sorting, map/heatmap filtering, clearing filters, and unknown manual distances. The full archive has 429 eligible tracks and two with fewer than five fixes. A separate complete run checked all 431 files with no calculation errors, valid triangle closure/FAI ratios, closing-gap deductions and plausible bounds relative to recorded track length (`validation/xc-archive.json`). Initial per-discipline budgets are 75 ms; results are explicitly time-limited estimates unless the optimizer proves optimality. Initial searches may find no triangle; these remain unknown until refinement, not zero. Statistics retain their year/month scope.

- Offline 3D terrain and elevated flight rendering passed in Chrome 154 and Edge 155. Browser checks cover actual GPU draw frames, one elevated segment per pair of GPS fixes, 60° initial tilt, full-window viewing, basemap reconnection during 3D, ground overview modes, and returning to flat 2D. Terrain uses a separate DEM source from hill shading, at exaggeration 1. Screenshots: `validation/artifacts/chrome-3d-flight.png` and `edge-3d-flight.png`.

- Full-window entry and Escape exit passed in offline Chrome and Edge, preserving zoom. Selected tracks render one coloured segment per consecutive pair of original fixes, with a vertical-speed legend. Both runs reported no HTTP requests or console errors.

- Local HTML is a secure context with both folder and save picker APIs available.
- Cancelling or denying folder access gives retry instructions. A subsequent
  selection and approval imports the archive successfully.
- All 431 supplied IGC files scan successfully through year/German-month/day
  folders with spaces and umlauts. No byte-identical duplicate files were found.
- Thirty-one parser/scanner/statistics/map/terrain/vertical-speed/3D/XC/filter tests pass, including arbitrary nesting, dates independent
  of folder names, invalid dates/fixes, both hemispheres, midnight rollover,
  manual JSON validation, duplicate handling, calendar-period comparisons,
  empty months, missing years, medians, zero baselines, and unknown GPS distance.
- Terrain tests cover Terrarium elevation decoding, 100 m contour generation,
  the zoom-12 cap, independent switches, and visible major-contour label placement.
- Map tests confirm that overview tracks remain separate with every fix preserved,
  and each flight contributes only once per geographic heatmap cell, independent
  of repeated fixes/circling. Manual flights and tracks with fewer than two valid
  points are omitted from overview modes.
- Chrome and Edge rendered all 431 tracks simultaneously, plus a 64-flight heatmap for
  2018 containing 4,040 visited cells. Browser tests verify year/month/search
  filtering, empty-result handling, and clicking a flight to return to single view.
- Year/month controls and chart clicks filter the flight library by file dates.
  Browser checks verify 64 flights in 2018, two flights in June 2022, zero flights
  in January 2022, and a return to all 431 flights after resetting the period.
- Cards show period totals, previous-calendar-year totals/differences, and the
  median over recorded years. Monthly charts compare the same calendar month
  across years. All-time monthly charts show the median month, not a sum of
  lifetime monthly totals. Full calendar periods are used, not matched YTD dates.
- 44 recordings are shorter than one minute. Other warnings identify recordings
  containing invalid GPS fixes; these fixes are skipped without dropping the file.
- The selected Swiss track retains all 1,326 valid coordinate points in the
  GeoJSON map source. Its displayed GPS track distance is approximately 11.98 km.
- Background features and local labels render at continent (~zoom 3), regional
  (~zoom 10), and flight (~zoom 12.8) scales. Screenshots show the track, markers,
  local labels, roads, attribution, and light/dark dashboard UI.
- Cancelling a manual save preserves form fields. Saving creates valid version-1
  JSON in a chosen nested scratch folder, which is then found during rescanning.
  Reopening the dashboard and reconnecting that folder reads the saved flight.
- The complete browser test runs with its network disabled. The dashboard makes
  zero HTTP(S) requests and emits zero console/page errors.
- Original IGC files are only read. Manual browser-test writes are confined to
  `.cache/manual-fixture-*`, separate from the supplied archive.

## Map archive

`europe.pmtiles` contains zoom levels 0–10 for bounds `[-25,34,45,72]`, extracted
from `https://build.protomaps.com/20261012.pmtiles` with go-pmtiles 1.31.2.
Measured size: **1,375,193,610 bytes (1.38 GB / 1.28 GiB)**. The exact checksum,
source version, and extraction metadata are in `map-manifest.json`.

At regional scale it shows major roads, water, land cover, boundaries, and place
names. At flight scale the zoom-10 background is enlarged; it does not gain finer
paths/buildings/terrain detail. Track coordinates remain independent of that
limit. A smaller map package would require a lower maximum zoom or smaller region.

## Optional Alps terrain

`terrain-alps.pmtiles` covers bounds `[5,43,17,49]` at zoom levels 0–12. Its
measured size is **1,588,744,127 bytes (1.59 GB / 1.48 GiB)**; no zoom 13–17
archive was included. The source version observations, extracted checksum,
and attribution references are in `terrain-manifest.json`.

Chrome and Edge passed offline terrain loading without a basemap, terrain over the Swiss
flight, independent shading/contour switches, rejection of the wrong map file,
and preservation of terrain when connecting the Europe basemap afterward.
Rendered contours include 500–1,300 m around the sample Jura flight. Labels are
anchored on visible major contours (multiples of 500 m), with collision handling
to keep numeric heights readable on tightly winding lines. Rendering and contour
generation use bundled classic workers and direct local-file reads.

## Compatibility finding

Chromium rejected MapLibre's default module blob worker from the opaque local
file origin. The build bundles the worker as an IIFE and selects MapLibre's
existing classic-worker path for blob URLs. This passed both browser tests with
browser sandboxing enabled and without disabling web security or origin checks.
The build fails explicitly if a future MapLibre update changes the adapter target.

Selecting the flight folder and map remains necessary on each opening. Browser
permission persistence is not required. Safari/Firefox direct folder-write
support, automatic takeoff/landing detection, 3D terrain, detailed topographic
maps, matched year-to-date comparisons, and automatic archive-completeness
detection are outside this version. Statistics describe the files actually loaded.
