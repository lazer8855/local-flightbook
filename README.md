# Local Flightbook prototype

Double-click **dashboard.html** in desktop Chrome or Edge. No running server,
Node installation, account, internet connection, or API key is needed to use it.
If another browser is your default, right-click the HTML and use **Open with**.

Download the [first beta release](https://github.com/lazer8855/local-flightbook/releases/tag/v0.1.0-beta.1):

- [dashboard.html](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.1/dashboard.html) — the standalone dashboard.
- [europe.pmtiles](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.1/europe.pmtiles) — Europe background map, 1.38 GB.
- [terrain-alps.pmtiles](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.1/terrain-alps.pmtiles) — optional Alpine elevation for shading, contours and 3D, 1.59 GB.

Map archives are release assets and are not included in a Git clone or the source-code ZIP. Checksums, map provenance and attribution are attached to the release. Downloading requires internet; using the downloaded dashboard and maps works offline.

1. Click **Choose flight folder**, select your root flight folder, and allow read
   access. The app recursively reads IGC files and its own flightbook JSON files.
2. Click **Choose Europe map** and select **europe.pmtiles** beside the dashboard.
   Optionally click **Choose Alps terrain** and select **terrain-alps.pmtiles**
   for hill shading and contour lines. This is a separate local file selection.
3. Select a flight to see its track, recording duration, GPS distance, and altitude.
   In **Map view**, choose **All tracks** to overlay the filtered flights, or
   **Heatmap** to see frequently flown areas. Use **Fit all flights** to zoom out
   to their combined extent. Year/month and search filters apply to both modes;
   choose the all-time overview and clear search to include the whole archive.
   Clicking a flight returns to the individual-track view.
4. Use **+ Manual flight**, complete the form, and choose a JSON save location
   inside your flight folder. The app rescans after saving. Files saved elsewhere
   are valid, but require connecting their parent folder to appear in the library.

Each new session requires selecting the files/folder again. Cancellation or
denied access keeps the app usable and provides retry instructions. Original IGC
files are read only. Manual entries are saved only through the browser save
dialog. Selecting an existing file there can overwrite it after browser confirmation.

Keep `dashboard.html` and `europe.pmtiles` together for convenient selection;
the browser does not grant access simply because they are neighbours.
The existing flight folder can remain alongside them, with any internal structure.
Distribute `THIRD_PARTY_NOTICES.txt` and `map-manifest.json` with these files.
No personal flight files need to be distributed with the app.

## Map detail

The Europe map is **1,375,193,610 bytes** (1.38 GB / 1.28 GiB), extracted from the
2026-10-12 Protomaps basemap, version 4.15.2, at zoom levels 0–10. Bounds are
longitude −25° to 45°, latitude 34° to 72°. Intersecting tiles may show extra
context outside these bounds, particularly at low zoom.

It provides land, water, boundaries, land cover, roads, and place labels. It is a
general-purpose regional map, without hill shading, satellite imagery, or a
detailed hiking-path layer. You can zoom to 19, but background detail stops at 10.
All valid GPS fixes are retained in the track; the track source uses zero
simplification tolerance. Flights outside map coverage still display their track.

The heatmap measures route popularity: each flight contributes once per
approximately 250 m geographic cell, regardless of recording rate or time spent
circling. Colours blend at the current zoom, so this is an exploratory view,
not an absolute numerical scale. Flights with fewer than two valid fixes,
including manual flights without GPS data, are omitted from both overview modes.

## Alps terrain

The optional `terrain-alps.pmtiles` package adds terrain shading and height lines
over Switzerland and the Alpine arc (bounds 5°–17° E, 43°–49° N). It is
**1,588,744,127 bytes (1.59 GB / 1.48 GiB)**, containing zoom levels 0–12 only;
the larger zoom 13–17 archives are omitted. Zooming closer enlarges that elevation
detail while flight tracks retain all recorded coordinates.

Use the separate **Terrain shading** and **Contours** switches in the map panel.
Contours appear from zoom 11, at 100 m intervals, with readable labels on major
500 m contours. Labels are collision-managed and need not appear on every line.
Terrain works with individual flights, all tracks, and the heatmap, and also
without selecting the Europe basemap. Outside the terrain region, the existing
map and flight tracks remain available. Reconnect the terrain file after reopening.

Elevation images are decoded and contours generated inside a bundled classic
worker using local PMTiles reads. No tile server, CDN, internet access, or key
is used at runtime. Missing contour neighbour tiles are treated as no-data,
avoiding invented zero-height cliffs at the edge of the extracted region.

Provenance and checksums are in `terrain-manifest.json`, and Mapterhorn's source
attribution catalogue is retained in `terrain-attribution.json`. Include both
with the optional terrain file when distributing the dashboard. To recreate it,
run `powershell -File scripts/prepare-terrain.ps1 -PMTilesExecutable <path>`.
This checks the observed upstream ETag, refuses to overwrite an existing file,
and verifies the extraction checksum. The upstream terrain archive is mutable;
keep the supplied extract for reproducible offline use.

Map styles, fonts, controls/marker icons, and the classic map worker are bundled
inside the HTML. Map data is read directly from the selected browser `File` with
PMTiles `FileSource`. The page's content security policy blocks HTTP requests.
Attribution links only navigate to their websites when explicitly clicked.

## Data and interpretation

Flight dates come from IGC headers or manual JSON, never folder names. Missing
or invalid dates are shown for review. Byte-identical files and repeated manual
IDs are skipped; different recordings on the same day remain separate flights.
Invalid GPS fixes are skipped. Recordings under one minute are flagged and remain
included in prototype summary totals. Recorded time is the span between first
and last valid fixes, which may include waiting before/after flight. It is not
automatic takeoff/landing detection. GPS distance is the sum of track segments,
not scored cross-country distance. Marker labels identify the first and last fixes.

Manual files use this versioned format (duration is in seconds):

```json
{
  "format": "local-flightbook",
  "version": 1,
  "id": "a-unique-flight-id",
  "date": "2026-10-13",
  "durationSeconds": 2550,
  "site": "Flying site",
  "wing": "Wing name",
  "notes": "Optional notes"
}
```

The dashboard includes all-time totals, yearly and monthly charts, search,
light/dark UI, and the flight explorer. Choose a year and optionally a month to
see period totals and filter the flight library. Click chart rows to drill down.
Chart metrics include recorded time, flights, GPS track distance, and flying days.
Period cards also show average and longest flight duration.

Comparisons use the same calendar year/month one year earlier, and the median
across all years with recorded flights (including the selected year). A missing
year is unavailable, while an empty month inside a recorded year contributes
zero to count/time/day totals. Median duration statistics omit empty periods;
GPS medians omit periods where every flight lacks GPS data. Unknown distance is
not counted as zero. Undated flights contribute only to all-time totals.

Comparisons reflect the files you load: an incomplete archive or current year
is not automatically treated as a complete season. The current comparison is
for full calendar periods, not matched year-to-date periods. Open **How
comparisons are calculated** for this explanation in the dashboard.

## Development and validation

Development only requires Node 24 and npm. Run `npm ci`, `npm run build`, and
`npm test`. The build produces a single HTML file with bundled dependency notices.
The build adapter explicitly selects a classic blob worker because Chromium
rejects module workers from an opaque `file://` origin. Browser security settings
are not disabled.

`npm run test:browser` runs headed Windows browser tests using real folder and
save dialogs. It defaults to the workspace Chrome for Testing executable.
To use an installed browser, set `FLIGHTBOOK_BROWSER` to its executable path and
`FLIGHTBOOK_BROWSER_LABEL` to a report label such as `edge`, then run it. UI
automation accepts English/German permission button names and is restricted to
the browser carrying that test's process tag. It writes manual test records only
inside `.cache/`, not your supplied flight archive. The page runs with network
access disabled for the entire browser test, and HTTP requests are recorded.

Reports are in `validation/`, with screenshots in `validation/artifacts/`.
Parser tests cover the supplied 431 IGC files, arbitrary folders, umlauts,
both hemisphere signs, midnight rollover, invalid fixes/dates, duplicate files,
and manual JSON validation. Browser tests cover permission denial/cancellation,
rescan, real JSON writes, reopening, map labels/backgrounds, track-coordinate
retention, and offline use.

To recreate the map, obtain go-pmtiles 1.31.2 from its official release and run
`powershell -File scripts/prepare-map.ps1 -PMTilesExecutable <path-to-pmtiles.exe>`.
It downloads the pinned source's Europe subset, refuses to overwrite an existing
map, and verifies the recorded SHA-256. Daily upstream builds may be removed;
keep the supplied map archive. Map provenance is recorded in `map-manifest.json`.

Map sources and terms:
[Protomaps basemaps](https://docs.protomaps.com/basemaps/downloads),
[OpenStreetMap attribution](https://www.openstreetmap.org/copyright).
## XC distances and flight filters

Each IGC track with at least five valid fixes is scored locally in a bundled background worker using `igc-xc-score` 1.8.0. The dashboard shows **Open XC**, **Free triangle**, and **FAI triangle** separately from accumulated GPS track length. Open XC optimizes start, up to three turnpoints, and finish. Triangle scoring uses the XContest-style 20% closure limit, subtracts the closing gap, and applies the 28% minimum-leg rule for FAI triangles. Values are kilometres without contest multipliers. Distances use all valid fixes, WGS84/Vincenty calculations, and no automatic launch/landing trimming; waiting or driving in a recording can affect the result. See [XContest rules](https://www.xcontest.org/world/en/rules/).

Initial searches run for about 75 ms per discipline plus setup in a background worker. **≈** identifies a time-limited result; **Not found yet** means no qualifying route was found within the budget, not proof of its absence. **Refine XC distances** gives the selected flight up to two seconds per discipline; results never decrease. Even refined results may remain approximate and differ from an official contest result. Progress appears in the library. Results are cached by file-content hash for rescans during the session, and recomputed after reopening. Original files and GPS geometry are unchanged.

The library supports minimum/maximum duration in minutes, minimum/maximum XC distance in kilometres, distance discipline selection, text search, and sorting by date/duration/XC. Numeric ranges are inclusive and combine with the year/month selection. Pending, failed, manual, and insufficient-fix XC values are unknown and excluded whenever an XC range is active, including a minimum of zero. Clear library filters resets these controls while preserving the year/month. These filters affect the library, selected flight, All tracks and Heatmap; statistics retain their year/month scope.

The XC worker and its LGPL dependency are bundled into `dashboard.html`; no external script or internet request is needed. Build sources, pinned dependencies, and notices are included in the project so the worker can be rebuilt or modified.

## Map inspection

Choose **Alps terrain**, then click **3D view**. Mountains use actual elevation with no exaggeration, and the selected flight is drawn at its recorded GPS altitude with climb/sink colours. Right-drag to rotate and tilt; the compass resets north. **2D view** restores the flat view. Full window works in both modes. All tracks and Heatmap remain ground overlays. Outside the Alps archive bounds, terrain is flat. GPS/terrain height differences can put near-ground fixes below the surface; no automatic height correction is applied.

Use **Full window** in Flight explorer to fill the browser window. Click **Exit full window** or press **Escape** to return; the map position and zoom are kept.

Selected tracks show vertical speed: blue for sinking, orange for climbing, grey for level flight or unavailable altitude. The legend spans −3 to +3 m/s; stronger rates use the end colours. Rates use ten-second centred altitude differences, preferring varying barometric altitude and otherwise using GPS altitude. Recording gaps over 30 seconds are grey. All tracks and Heatmap retain their overview colours. Original GPS coordinates and files are unchanged.
