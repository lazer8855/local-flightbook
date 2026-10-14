# Local Flightbook prototype

Double-click **dashboard.html** in desktop Chrome or Edge. No running server,
Node installation, account, internet connection, or API key is needed to use it.
If another browser is your default, right-click the HTML and use **Open with**.

Download the [first beta release](https://github.com/lazer8855/local-flightbook/releases/tag/v0.1.0-beta.1):

- [dashboard.html](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.1/dashboard.html) — the standalone dashboard.
- [europe.pmtiles](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.1/europe.pmtiles) — Europe background map, 1.38 GB.
- [terrain-alps.pmtiles](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.1/terrain-alps.pmtiles) — optional Alpine elevation for shading, contours and 3D, 1.59 GB.

Map archives are release assets and are not included in a Git clone or the source-code ZIP. Checksums, map provenance and attribution are attached to the release. Downloading requires internet; using the downloaded dashboard and maps works offline.

The current local dashboard also supports the Switzerland and world maps and
worldwide terrain listed below. These additional archives have been generated
locally and are not yet included in the linked beta release. The beta dashboard
uses **Choose Europe map** and **Choose Alps terrain**; use the updated local
`dashboard.html` for the **Choose map** and **Choose terrain** controls.

| File | Coverage | Maximum zoom | Size | Features |
| --- | --- | --- | --- | --- |
| `switzerland.pmtiles` | Switzerland bounding box | 15 | 998 MB | Background map |
| `europe.pmtiles` | Europe | 10 | 1.375 GB | Background map |
| `world.pmtiles` | World | 10 | 3.783 GB | Background map |
| `terrain-alps.pmtiles` | Alpine arc | 12 | 1.589 GB | Shading, contours, 3D |
| `terrain-world.pmtiles` | World | 8 | 3.208 GB | Shading and 3D |

Sizes use decimal MB/GB. Both world archives are individually below 4 GB;
together they require approximately **6.992 GB** of disk space. Choose one
background map and optionally one terrain archive; either terrain works with
any background map within its coverage.

1. Click **Choose flight folder**, select your root flight folder, and allow read
   access. The app recursively reads IGC files and its own flightbook JSON files.
2. Click **Choose map** and select **switzerland.pmtiles**, **world.pmtiles**, or **europe.pmtiles**.
   Optionally click **Choose terrain** and select **terrain-alps.pmtiles**
   for detailed Alpine shading, contours and 3D, or **terrain-world.pmtiles**
   for worldwide shading and 3D at lower detail. This is a separate local file
   selection. Contours are disabled for the world terrain archive.
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

Keep `dashboard.html` and your chosen `.pmtiles` map together for convenient selection;
the browser does not grant access simply because they are neighbours.
The existing flight folder can remain alongside them, with any internal structure.
Distribute `THIRD_PARTY_NOTICES.txt` and the matching map manifest with these
files: `map-manifest.json` for Europe, `map-switzerland-manifest.json` for
Switzerland, or `map-world-manifest.json` for the world. Terrain also needs its
matching manifest and `terrain-attribution.json`, as described below.
No personal flight files need to be distributed with the app.

## Additional offline maps

Two additional maps are generated locally beside `dashboard.html`:

| File | Coverage | Zoom levels | Exact size |
| --- | --- | --- | --- |
| `switzerland.pmtiles` | Switzerland bounding box | 0–15 | 997,855,920 bytes (998 MB) |
| `world.pmtiles` | Worldwide Web Mercator | 0–10 | 3,783,467,968 bytes (3.783 GB) |

Select either with **Choose map**. Switzerland includes some neighbouring areas
because extraction selects intersecting tiles rather than clipping the national
border. The world map covers latitudes up to approximately ±85.05°; the poles
are outside Web Mercator. Zooming closer enlarges the available background detail.
Optional Alps or world terrain works with either basemap within its coverage.

The world map is below the decimal **4,000,000,000-byte** limit. Zoom 10 is the
highest level that fits: the same source at zoom 11 was estimated at 8.0 GB by
the extraction tool's dry run. Both files use the pinned 2026-10-12 Protomaps source.
SHA-256 checksums, provenance, and attribution are recorded in
`map-switzerland-manifest.json` and `map-world-manifest.json`; distribute the
matching manifest and `THIRD_PARTY_NOTICES.txt` with each map.

Recreate either archive (requires internet and go-pmtiles 1.31.2):

```powershell
powershell -File scripts/prepare-map.ps1 -Map switzerland
powershell -File scripts/prepare-map.ps1 -Map world
```

Add `-PMTilesExecutable <path>` when the tool is not in `.cache/pmtiles-tool/`.
The script refuses to overwrite existing archives and verifies structure,
checksums, and the world's size limit. `-Map europe` remains the default.
These new local files are not yet assets of the linked beta release.

## Map detail

The Europe map is **1,375,193,610 bytes** (1.38 GB / 1.28 GiB), extracted from the
2026-10-12 Protomaps basemap, version 4.15.2, at zoom levels 0–10. Bounds are
longitude −25° to 45°, latitude 34° to 72°. Intersecting tiles may show extra
context outside these bounds, particularly at low zoom.

It provides land, water, boundaries, land cover, roads, and place labels. It is a
general-purpose regional map, without hill shading, satellite imagery, or a
detailed hiking-path layer. You can zoom to 19; background detail stops at the selected archive's maximum zoom.
All valid GPS fixes are retained in the track; the track source uses zero
simplification tolerance. Flights outside map coverage still display their track.

The heatmap measures route popularity: each flight contributes once per
approximately 250 m geographic cell, regardless of recording rate or time spent
circling. Colours blend at the current zoom, so this is an exploratory view,
not an absolute numerical scale. Flights with fewer than two valid fixes,
including manual flights without GPS data, are omitted from both overview modes.

## Worldwide terrain

`terrain-world.pmtiles` provides worldwide shading and 3D elevation at zoom
levels 0–8. Its verified size is **3,208,209,733 bytes (3.208 GB / 2.99 GiB)**,
below the decimal 4 GB limit. Choose it with **Choose terrain**. It works with
any of the basemaps, or without a basemap, and uses the same offline terrain
worker. Coverage extends to approximately ±85.05° latitude.

Zooming closer enlarges the zoom 8 elevation data. Mountains have less detail
than the Alps package. Contours are disabled for this archive because the
existing contour display needs zoom 11 or higher; select `terrain-alps.pmtiles`
for detailed Alpine terrain and contours.

Provenance and SHA-256 are in `terrain-world-manifest.json`. Include that file,
`terrain-attribution.json`, and `THIRD_PARTY_NOTICES.txt` when distributing the
archive. The source ETag matches the existing Alps terrain source. Recreate it
with `powershell -File scripts/prepare-terrain.ps1 -Map world`, adding
`-PMTilesExecutable <path>` if needed. The script refuses to overwrite an
existing archive and verifies source ETag, size limit, structure, and checksum.
The new file is local and has not been published to the linked beta release.

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
without selecting a basemap. Outside the terrain region, the existing
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
  "openXcDistanceKm": 12.5,
  "site": "Flying site",
  "wing": "Wing name",
  "notes": "Optional notes"
}
```

`openXcDistanceKm` is optional: omit it when distance is unavailable, or enter
zero explicitly for zero kilometres. Existing version-1 files remain compatible.
Manual distance is Open XC, not GPS track length. Use **Edit manual flight** on
a selected manual entry. The save dialog suggests its original file and folder:
choosing the original updates it with the same ID; choosing another JSON file
creates a copy with a new ID. Cancellation/failure keeps the form, and IGC files
cannot be overwritten. Files are rescanned after saving.

## Shared dashboard and statistics

This redesign is available in the local build/source; the linked first beta
release has not been replaced or republished.

**Flightbook** presents a compact airtime summary, flight library and map.
**Statistics** presents four equal cells for flights, recorded airtime, average
flight duration and Open XC distance; flying days appear as supporting context.
Switching tabs preserves the shared filters and selected flight. Loading a folder
starts at All time. Year/month choices, date shortcuts and inclusive custom dates
combine with search, duration/Open XC ranges and the optional short-recording
filter. Active chips can be removed individually. Clear filters restores All time
while preserving list sorting. All filters affect both views and all map modes.

Two activity graphs default to recorded airtime and flight count; either can
switch to Open XC or flying days. Bars use daily buckets for up to 31 days,
monthly buckets for longer ranges within a year, and annual buckets for All time
or multi-year ranges. The daily calendar colours recorded airtime; selecting a
day filters both views. Personal bests and scatter points open their flight
without clearing filters. Expand **Advanced statistics** for duration/XC bands
and the airtime-versus-XC scatter plot. Wing/site and altitude/climb statistics
are not part of this update.

The two cumulative graphs show recorded airtime and available Open XC. Within
one calendar year they compare with the same dates one year earlier, and an
equally weighted average of other recorded years before the current calendar
year. The selected and current years are excluded from average references.
Current-year comparisons stop at the same elapsed calendar date. Leap-day
alignment carries values through February 29 for non-leap years; February 29
range boundaries shift to February 28. All time/multi-year cumulative views show
chronological totals without comparison curves. Missing years are unavailable;
empty matching periods in recorded years contribute zero counts/time. Unknown
XC is excluded from distance averages. The archive may still be incomplete;
the dashboard does not infer archive completeness.

Open XC totals update while calculations run, with calculated/manual/unavailable
coverage. Totals and records containing time-limited results show **≈**. Blank
distance is never treated as zero. Undated flights contribute to unbounded
selection totals and records, but not dated charts or calendars. Recorded
airtime still includes any logger waiting before/after the flight.

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

Shared numeric ranges are inclusive and use Open XC only. Pending, failed,
insufficient-fix and manual-without-distance entries have unknown XC and are
excluded whenever an XC range is active, including a minimum of zero. Manually
entered distances participate in filters, totals, records and every distance
graph. Triangle results remain in individual IGC flight details.

The XC worker and its LGPL dependency are bundled into `dashboard.html`; no external script or internet request is needed. Build sources, pinned dependencies, and notices are included in the project so the worker can be rebuilt or modified.

## Map inspection

Click **Choose terrain**, select `terrain-alps.pmtiles` or `terrain-world.pmtiles`,
then click **3D view**. Mountains use actual elevation with no exaggeration,
and the selected flight is drawn at its recorded GPS altitude with climb/sink
colours. World terrain has less detail than the Alps archive. Right-drag to
rotate and tilt; the compass resets north. **2D view** restores the flat view.
Full window works in both modes. All tracks and Heatmap remain ground overlays.
Outside the selected archive bounds, terrain is flat. GPS/terrain height
differences can put near-ground fixes below the surface; no automatic height
correction is applied.

Use **Full window** in Flight explorer to fill the browser window. Click **Exit full window** or press **Escape** to return; the map position and zoom are kept.

Selected tracks show vertical speed: blue for sinking, orange for climbing, grey for level flight or unavailable altitude. The legend spans −3 to +3 m/s; stronger rates use the end colours. Rates use ten-second centred altitude differences, preferring varying barometric altitude and otherwise using GPS altitude. Recording gaps over 30 seconds are grey. All tracks and Heatmap retain their overview colours. Original GPS coordinates and files are unchanged.
