# Local Flightbook prototype

Double-click **dashboard.html** in desktop Chrome or Edge. No running server,
Node installation, account, internet connection, or API key is needed to use it.
If another browser is your default, right-click the HTML and use **Open with**.

Download the [latest beta release](https://github.com/lazer8855/local-flightbook/releases/tag/v0.1.0-beta.3):

- [dashboard.html](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.3/dashboard.html) — the standalone dashboard.
- [europe.pmtiles](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.2/europe.pmtiles) — Europe background map, 1.38 GB.
- [terrain-alps.pmtiles](https://github.com/lazer8855/local-flightbook/releases/download/v0.1.0-beta.2/terrain-alps.pmtiles) — optional Alpine elevation for shading, contours and 3D, 1.59 GB.

Map archives are release assets and are not included in a Git clone or the source-code ZIP. Checksums, map provenance and attribution are attached to the release. Downloading requires internet; using the downloaded dashboard and maps works offline.

All maps listed below remain available from [beta 2](https://github.com/lazer8855/local-flightbook/releases/tag/v0.1.0-beta.2) and work with beta 3. Europe, Switzerland and Alpine terrain
are direct PMTiles downloads. GitHub's per-asset size limit requires the two
world archives to be supplied as numbered parts. Download both parts of the
desired world archive and `join-world-maps.ps1` into one folder, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\join-world-maps.ps1 -Map world
powershell -ExecutionPolicy Bypass -File .\join-world-maps.ps1 -Map terrain-world
```

The script reconstructs the original PMTiles file and checks its SHA-256;
existing output files are never overwritten. Use the reconstructed file with
**Choose map** or **Choose terrain**. On macOS/Linux, concatenate each archive's
`.part01` then `.part02` with `cat` and verify against `SHA256SUMS.txt`.
Parts can be deleted after successful reconstruction. Allow disk space for both
the downloaded parts and the reconstructed map during this step.

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
All map packages remain attached to beta 2 and are compatible with beta 3.

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
This terrain package is attached to beta 2 as two parts and works with beta 3.

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
IDs are retained and flagged in Review. All files count until you explicitly
exclude an entry; duplicate files are no longer silently skipped.
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

Manual files may also include optional `startTime` (`HH:mm`, local time) and
`startTimeUtc` (ISO UTC timestamp). The form stores both when you enter a start
time, using your browser's local time zone, including its daylight-saving offset
for that date. Existing files without a start time remain compatible. Unchanged
timestamps keep their stored UTC instant when edited in another time zone.

## Review duplicates and questionable flights

The **Review** tab checks the full archive independently of shared filters:

- Exact file duplicates (SHA-256) and repeated manual-flight IDs.
- Similar IGC recordings: nearby start times, overlapping periods and matching
  sampled positions. Nearby pilots can produce similar tracks; review manually.
- Manual/IGC matches: UTC start times within a configurable tolerance (default
  5 minutes). Without a manual start time, matching local date and similar
  duration produce a lower-confidence suggestion, not a confirmed duplicate.
- Recordings under a configurable threshold (default 1 minute), separately
  from suspicious files with missing dates, insufficient/invalid fixes, malformed
  records, out-of-order timestamps or gaps over 10 minutes. Repeated timestamps
  are silently skipped; GPS jumps do not trigger review warnings.
- **Allowed invalid GPS fixes** sets how many invalid (`V`) fixes may be skipped
  without a warning. The default is 15; with 10 allowed, only recordings with
  more than 10 invalid fixes are flagged for this reason. Other problems still
  appear. Raw counts remain visible in flight details as recording notes.
- Files that could not be imported, with their paths and error messages.

Open candidates side by side, **Ignore warning**, **Exclude flight**, or
**Count only this entry** in a duplicate/matching group. Exclusions immediately
affect Flightbook, statistics, comparisons and map overviews. Opening an excluded
flight deliberately previews its track individually. Ignore does not exclude;
all decisions can be reversed, and excluded flights remain listed for recovery.
Manual notes remain on their original entry; review does not merge or delete files.

Click **Save decisions** and approve folder write access when requested. Only
`flightbook-review.json` in the selected root folder is written; IGC and manual
JSON files remain untouched. The version-1 review file stores exclusions,
ignored findings and thresholds. It is read again when you reconnect the folder.
Unsaved changes survive rescans and save failures; reconnecting warns before
discarding them. Invalid review files and external changes are protected from
overwrite. Review identities use relative file paths plus content hashes for
IGC or IDs for manual entries; renamed/moved files must be reviewed again.

## Inspect an individual IGC flight

Below the map, **Flight analysis** shows GPS altitude (blue), recorded barometric
altitude (orange, when present), and a grey approximate terrain profile when a
local elevation archive is loaded. Hover or drag along the profile, use the
keyboard-accessible recorded-time slider, or click the map track/route to select
a recorded GPS fix. The pink map cursor follows the selected ground position;
it remains a ground marker in 3D. Analysis is available in the map's full-window
view and hides in All tracks/Heatmap mode. Manual flights have no GPS profile.

The readings show recorded UTC time, GPS/barometric altitude, ten-second smoothed
climb/sink rate and GPS ground speed. Recording gaps over 30 seconds are not
connected in the profile; speeds across these gaps stay unknown. Flight details
also show pilot and glider registration when present, first/last recorded fix
times, and average recorded ground speed. These fix times are not automatically
detected takeoff/landing times; averages include the entire recording span.

**Scored XC route** overlays the winning optimized start (S), numbered turnpoints, finish
(F) and each scored leg's distance on the original track. It updates as local
calculations/refinement finish and can be toggled independently. Time-limited
results remain approximate. The route is a ground overlay in 3D and is unavailable
for manual flights or recordings without a calculated positive scored XC distance.

Terrain elevations are sampled locally from the chosen archive, at up to zoom
12 (or the archive's lower maximum). The profile uses at most 256 terrain samples;
the selected fix can obtain its own terrain reading. Outside coverage or missing
tiles stay unknown. Approximate AGL is GPS altitude minus sampled ground elevation:
coarse terrain, GPS noise and vertical-datum differences affect it and can produce
negative values. It is not a clearance measurement. Replacing a terrain archive
clears old readings and recalculates the profile. No runtime network access is used.

## Shared statistics views

Every statistics card has an **⤢ Expand** control, including summary cells,
activity/calendar charts, cumulative graphs, personal bests and the advanced
graphs. It fills the browser window without requiring browser fullscreen
permission. Close with **Close (Esc)** or Escape; filters, selection and chart
controls stay live, keyboard focus stays inside the dialog and returns to the
expand button afterward.

Yearly activity charts show at most ten years at once in the normal cards;
scroll sideways for additional years. Expanded charts fit every year without
horizontal scrolling, switching to horizontal rows when needed. Bar widths,
spacing and row heights adapt to the available space. Closing an expanded card
restores its normal scroll position. Values appear
inside bars when they fit, with compact airtime labels such as `12h30` (12 hours,
30 minutes). Hover, tap or keyboard focus exposes the exact full value, including
for very small or zero bars. Selecting a bar still applies the shared date filter.

This redesign is included in beta 2 and the current source build.

**Flightbook** presents a compact airtime summary, flight library and map.
**Statistics** presents four equal cells for flights, recorded airtime, average
flight duration and scored XC distance; flying days appear as supporting context.
Switching tabs preserves the shared filters and selected flight. Loading a folder
starts at All time. Year/month choices, date shortcuts and inclusive custom dates
combine with search, duration/scored XC ranges and the optional short-recording
filter. Active chips can be removed individually. Clear filters restores All time
while preserving list sorting. All filters affect both views and all map modes.

Two activity graphs default to recorded airtime and flight count; either can
switch to scored XC or flying days. Bars use daily buckets for up to 31 days,
monthly buckets for longer ranges within a year, and annual buckets for All time
or multi-year ranges. The daily calendar colours recorded airtime; selecting a
day filters both views. Personal bests and scatter points open their flight
without clearing filters. Expand **Advanced statistics** for duration/XC bands
and the airtime-versus-XC scatter plot. Wing/site and altitude/climb statistics
are not part of this update.

The two cumulative graphs show recorded airtime and available scored XC. Within
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

Scored XC totals update while calculations run, with calculated/manual/unavailable
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
## XC scoring, calculation and saved results

Loading/rescanning a folder reads saved XC results immediately and never starts
XC calculations. Use **Calculate missing XC scores (N)** to process previously
unseen recordings. Grant folder write permission when requested: results are
saved in `flightbook-xc.json` in the selected root folder, every five completed
files and when finishing or cancelling. IGC files and manual JSON remain untouched.
The first pass can take time; subsequent loads reuse the database. Files need at
least five valid fixes for calculation. Exact copies are calculated only once.

The default reference is the pinned **Swiss CCC 2026 geometry rules**, applied
consistently to all archive years. See [SHV Sportreglement D 2026, sections
6.1–6.3](https://www.shv-fsvl.ch/fileadmin/files/redakteure/Allgemein/Sport/Reglemente/2026/Reglement_D_2026.pdf).
The highest estimated points select **one route and its distance**:

| Candidate | Multiplier |
| --- | --- |
| Open route, up to three turnpoints | 1.0 |
| Straight distance, furthest two recorded points | 1.2 |
| Flat triangle | 1.2 |
| FAI triangle | 1.4 |

Triangles use the 20% closure limit and subtract the closing gap. FAI triangles
require each leg to be at least 28% of the perimeter. Points round to hundredths.
World XContest's additional 5%-closure bonuses are not Swiss CCC multipliers and
are not used. The 10 km CCC final-ranking minimum is identified in details;
shorter flights retain their local geometry distance and estimated points for
flightbook use. These are not official scores: trimming, engine use, airspace,
licences, class and other eligibility checks are not performed.

The winning distance drives filters, sorting, statistics, comparisons, charts,
records and the map route. Details/list/records show its route type and estimated
points. The map closes triangle routes and marks any subtracted closing gap.
A shorter triangle can beat a longer open route; as searches improve, winning
points cannot decrease, but the associated winning distance can change.

Standard calculation allows roughly **1 second per candidate** plus preparation;
**Refine estimated scores** (all unfinished results) or **Refine this XC score**
allows roughly **5 seconds per unfinished candidate**. Proven optimal candidates
are reused rather than searched again. A result remains **≈** until all candidate
searches are proven optimal; an unknown route is not proof that it is absent.
All original valid fixes are used; tracks are not simplified or automatically
trimmed. Progress and **Cancel** remain available while the worker runs. Cancel
keeps completed results; the interrupted file remains pending. During a run,
folder changes and manual editing are temporarily disabled.

The version-1 database is keyed by raw-file SHA-256, so renaming/moving an IGC
reuses its result and changing its contents makes it a new calculation. Results
for temporarily missing files remain in the database. Entries retain every
candidate's distance, route/closure geometry, quality, budget and timestamp,
along with algorithm/scoring versions and the winner. Scoring changes can rescore
compatible saved candidates without expensive geometry searches; geometry-version
changes mark entries as pending. Unknown XC stays unknown, rather than zero.
Manual `openXcDistanceKm` values remain manually entered open routes, with no
invented triangle or points, and participate in all distance summaries/graphs.

Invalid databases are protected from overwrite. Saves check for external changes
and retain completed results in memory on failure; use **Save XC database** to
retry. The page warns before closing/reconnecting with unsaved results. Keep the
database with the flight folder when moving/backing it up. Both the database and
private flight files are excluded from Git. Bundled workers need no server or
runtime internet access.

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
