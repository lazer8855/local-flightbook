import * as maplibre from 'maplibre-gl';
import { PMTiles, FileSource, Protocol } from 'pmtiles';
import { scanFolder, createManualFlight, getSourceHandle } from './flights.mjs';
import { setupDashboard } from './dashboard-ui.mjs';
import { setupReview } from './review-ui.mjs';
import { buildMapOverview, EMPTY_MAP_DATA } from './map-overview.mjs';
import { createTerrain, terrainSources, terrainLayers, contourLabelData } from './terrain.mjs';
import { trackRates, RATE_COLOR } from './track-rate.mjs';
import { flight3DLayer } from './flight-3d.mjs';
import { startXC } from './xc-controller.mjs';
import { XC_TYPES } from './xc-types.mjs';

const $ = id => document.getElementById(id);
const state = { directory: null, flights: [], issues: [], selected: null, archive: null, bounds: null };
state.mapMode = 'single';
state.threeD = false;
let overviewCache = null;
const xcCache = new Map();
let xcController = null, xcRefreshTimer = null, xcRevision = 0;
let map = null, markers = [], busy = false, mapGeneration = 0;
let dashboard = null;
let review = null;
let editingManual = null;
let terrain = null, terrainGeneration = 0, terrainApplyQueued = false;
let terrainLabelSignature = '';
const rateCache = new WeakMap();
function selectedRates() {
  if (!state.selected) return trackRates();
  if (!rateCache.has(state.selected)) rateCache.set(state.selected, trackRates(state.selected.points));
  return rateCache.get(state.selected);
}
const duration = seconds => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
const node = (tag, text, className = '') => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
const setStatus = text => { $('status').textContent = text; };
const cancelled = error => error.name === 'AbortError';
const protocol = new Protocol();
maplibre.addProtocol('pmtiles', protocol.tile);
const workerURL = URL.createObjectURL(new Blob([MAP_WORKER], { type: 'text/javascript' }));
maplibre.setWorkerUrl(workerURL);

function baseStyle(archive = null, header = null) {
  const sources = {}, layers = [{ id: 'background', type: 'background', paint: { 'background-color': '#c8dfe5' } }];
  if (archive) {
    sources.basemap = { type: 'vector', url: `pmtiles://${archive.source.getKey()}`, minzoom: header.minZoom, maxzoom: header.maxZoom, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · Natural Earth · Protomaps', bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat] };
    const layer = (id, type, sourceLayer, paint, extras = {}) => ({ id, type, source: 'basemap', 'source-layer': sourceLayer, paint, ...extras });
    layers.push(
      layer('land', 'fill', 'earth', { 'fill-color': '#f3f2e9' }),
      layer('landcover', 'fill', 'landcover', { 'fill-color': ['match', ['get', 'kind'], 'forest', '#d3e2cd', 'glacier', '#f9ffff', 'urban_area', '#e7e3df', '#e6ebd9'], 'fill-opacity': 0.7 }),
      layer('landuse', 'fill', 'landuse', { 'fill-color': ['match', ['get', 'kind'], ['forest', 'wood', 'park', 'national_park', 'nature_reserve'], '#d6e5d0', ['glacier'], '#f9ffff', ['residential', 'commercial', 'industrial'], '#e7e3df', '#ececdd'], 'fill-opacity': 0.5 }),
      layer('water', 'fill', 'water', { 'fill-color': '#c8dfe5' }, { filter: ['==', ['geometry-type'], 'Polygon'] }),
      layer('waterways', 'line', 'water', { 'line-color': '#b6d3dc', 'line-width': 1 }, { filter: ['==', ['geometry-type'], 'LineString'] }),
      layer('boundaries', 'line', 'boundaries', { 'line-color': '#a7a7aa', 'line-width': 0.8, 'line-dasharray': [3, 3] }),
      layer('road-casing', 'line', 'roads', { 'line-color': '#d6c9b4', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 2.5, 16, 6] }, { minzoom: 5 }),
      layer('roads', 'line', 'roads', { 'line-color': '#fffaf0', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.2, 10, 1.3, 16, 4] }, { minzoom: 5 }),
      layer('places', 'symbol', 'places', { 'text-color': '#415954', 'text-halo-color': '#fffef8', 'text-halo-width': 1.5 }, { layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name'], ''], 'text-font': ['Flightbook'], 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 10, 13], 'text-max-width': 8, 'text-padding': 5, 'symbol-sort-key': ['coalesce', ['get', 'min_zoom'], 10] } })
    );
  }
  if (terrain) {
    Object.assign(sources, terrainSources(terrain));
    for (const layer of terrainLayers($('terrain-shading').checked, $('terrain-contours').checked)) {
      const before = layer.type === 'hillshade' ? 'water' : layer.type === 'symbol' ? 'places' : 'road-casing';
      const index = layers.findIndex(candidate => candidate.id === before);
      if (index < 0) layers.push(layer); else layers.splice(index, 0, layer);
    }
  }
  sources.track = { type: 'geojson', data: trackData(), tolerance: 0, lineMetrics: true };
  sources['track-rate'] = { type: 'geojson', data: state.mapMode === 'single' ? selectedRates().data : EMPTY_MAP_DATA, tolerance: 0 };
  sources.density = { type: 'geojson', data: state.mapMode === 'heat' ? overviewData().density : EMPTY_MAP_DATA };
  layers.push({ id: 'flight-heatmap', type: 'heatmap', source: 'density', layout: { visibility: state.mapMode === 'heat' ? 'visible' : 'none' }, paint: {
    'heatmap-weight': ['get', 'flightCount'],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.02, 6, 0.08, 10, 0.45, 14, 1, 19, 2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 9, 10, 18, 15, 40, 19, 80],
    'heatmap-opacity': 0.85,
    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(35,110,190,0)', 0.15, '#499ed6', 0.35, '#47baa4', 0.55, '#efe07d', 0.75, '#f69b47', 1, '#d34539']
  } });
  layers.push({ id: 'track-halo', type: 'line', source: 'track', paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.85 } }, { id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#b94e38', 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
  layers.push({ id: 'track-rate', type: 'line', source: 'track-rate', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: state.mapMode === 'single' ? 'visible' : 'none' }, paint: { 'line-color': RATE_COLOR, 'line-width': 3 } });
  return { version: 8, sources, layers, ...(state.threeD && terrain ? { terrain: { source: 'terrain-elevation', exaggeration: 1 } } : {}) };
}

function trackData() {
  if (state.mapMode !== 'single') return overviewData().tracks;
  return { type: 'FeatureCollection', features: state.selected?.points.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: state.selected.points.map(point => [point.lon, point.lat]) } }] : [] };
}

function visibleFlights() {
  return dashboard?.visible || state.flights;
}

function libraryFilters() {
  return dashboard?.filters || {};
}

function libraryFilterError() {
  return dashboard?.filters.error || '';
}

function refreshLibrary(fit = false) {
  const filtered = visibleFlights();
  renderFlights();
  if (!filtered.includes(state.selected)) {
    const next = filtered.find(flight => flight.points.length > 1) || filtered[0];
    if (next) selectFlight(next);
    else { state.selected = null; drawFlight(); $('flight-detail').replaceChildren(node('p', 'No flight matches these filters.', 'muted')); }
  } else if (state.mapMode !== 'single') { drawFlight(); if (fit) fitTrack(); }
}

function xcText(value) {
  if (!value) return 'Calculating…';
  if (value.distanceKm === null) return 'Not found yet · refine';
  if (!value.distanceKm && value.optimal) return 'No qualifying route';
  return `${value.source === 'manual' ? 'Manual · ' : value.optimal ? '' : '≈ '}${value.distanceKm.toFixed(2)} km`;
}

function renderXCDetail() {
  const target = $('xc-detail'), flight = state.selected;
  if (!target || !flight) return;
  const grid = node('div', '', 'detail-grid');
  for (const [key, label] of Object.entries(XC_TYPES)) {
    const cell = node('div', '');
    cell.append(node('small', label), node('strong', flight.type === 'manual' ? key === 'open' && flight.xc?.open ? xcText(flight.xc.open) : 'Unavailable' : flight.points.length < 5 ? 'Unavailable' : flight.xcError ? 'Calculation failed' : xcText(flight.xc?.[key])));
    const value = flight.xc?.[key];
    if (value?.gapKm !== null && value?.gapKm !== undefined) cell.append(node('small', `Closing gap ${value.gapKm.toFixed(2)} km, subtracted`));
    grid.append(cell);
  }
  const refine = node('button', xcController?.refining === flight ? 'Refining…' : 'Refine XC distances', 'secondary');
  refine.type = 'button'; refine.disabled = flight.points.length < 5 || !xcController || xcController.refining === flight;
  refine.addEventListener('click', () => { xcController.refine(flight); renderXCDetail(); });
  const note = flight.type === 'manual' ? 'Open XC distance is manually entered. GPS track distance and triangle distances are unavailable.' : flight.xcError ? `XC error: ${flight.xcError}` : flight.points.length < 5 ? 'XC calculation needs at least five valid GPS fixes.' : 'XContest-style distance estimates over the recorded track, without contest multipliers. ≈ means the search time limit was reached. Refinement runs a longer search; official contest validation is separate.';
  target.replaceChildren(node('h3', 'Cross-country distances'), grid, node('p', note, 'muted'), refine);
}

function updateXCStatus() {
  const eligible = state.flights.filter(f => f.points.length >= 5), complete = eligible.filter(f => f.xc || f.xcError).length;
  const failed = eligible.filter(f => f.xcError).length;
  $('xc-status').textContent = !state.flights.length ? 'XC distances are calculated locally after loading flights.' : `XC calculations: ${complete} of ${eligible.length} tracks processed${xcController?.pending ? ` · ${xcController.pending} queued or calculating` : ' · complete'}${failed ? ` · ${failed} failed; select a flight to retry refinement` : ''}. Manual Open XC values contribute when entered.`;
}

function onXCUpdate(flight) {
  xcRevision++;
  if (state.selected === flight) renderXCDetail();
  if (!xcRefreshTimer) xcRefreshTimer = setTimeout(() => {
    xcRefreshTimer = null; updateXCStatus();
    const before = visibleFlights().map(f => f.key).sort().join('|');
    dashboard?.refresh();
    if (before !== visibleFlights().map(f => f.key).sort().join('|')) refreshLibrary();
    else renderFlights();
  }, 1500);
}

function overviewData() {
  const filters = libraryFilters();
  const key = visibleFlights().map(f => f.key).sort().join('|');
  if (!overviewCache || overviewCache.flights !== state.flights || overviewCache.key !== key) overviewCache = { flights: state.flights, key, data: buildMapOverview(visibleFlights()) };
  return overviewCache.data;
}

function ensureMap() {
  if (map) return map;
  try {
    map = new maplibre.Map({ container: 'map', style: baseStyle(), center: [10, 50], zoom: 3, maxZoom: 19, attributionControl: { compact: false } });
    map.addControl(new maplibre.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    map.addControl(new maplibre.ScaleControl(), 'bottom-left');
    map.on('error', event => { $('map-status').textContent = `Map error: ${event.error.message}. You can reconnect the map file.`; });
    map.on('load', drawFlight);
    map.on('style.load', () => { applyTerrain(); drawFlight(); });
    map.on('idle', updateTerrainLabels);
    return map;
  } catch (error) { $('map-status').textContent = `Map could not start: ${error.message}. Check that your browser supports WebGL.`; return null; }
}

async function connectMap(file) {
  if (!file) return;
  const generation = ++mapGeneration;
  $('map-status').textContent = `Opening ${file.name}…`;
  try {
    const archive = new PMTiles(new FileSource(file));
    const header = await archive.getHeader();
    if (header.tileType !== 1) throw new Error('This prototype needs a vector (MVT) PMTiles archive');
    const metadata = await archive.getMetadata();
    const names = new Set(metadata.vector_layers?.map(layer => layer.id));
    for (const required of ['earth', 'water', 'places', 'roads']) if (!names.has(required)) throw new Error(`Map is not a compatible Protomaps basemap (missing ${required})`);
    if (generation !== mapGeneration) return;
    const activeMap = ensureMap();
    if (!activeMap) return;
    state.archive = archive;
    state.bounds = [header.minLon, header.minLat, header.maxLon, header.maxLat];
    protocol.add(archive);
    activeMap.once('style.load', () => {
      drawFlight();
      if (state.mapMode !== 'single' && overviewData().flightCount) fitTrack();
      else if (!state.selected?.points.length) activeMap.fitBounds([[header.minLon, header.minLat], [header.maxLon, header.maxLat]], { padding: 30, duration: 0 });
    });
    terrainLabelSignature = '';
    activeMap.setStyle(baseStyle(archive, header));
    $('map-status').textContent = `${file.name} · ${(file.size / 1024 ** 3).toFixed(2)} GiB · detail through zoom ${header.maxZoom}. Zoom further to inspect the full-precision track.`;
    if (state.selected?.points.length) fitTrack();
  } catch (error) { $('map-status').textContent = `Could not open map: ${error.message}. Choose a compatible basemap .pmtiles file and retry.`; }
}

function removeTerrainLayers() {
  if (!map) return;
  map.setTerrain(null);
  for (const id of ['terrain-contour-labels', 'terrain-contour-lines', 'terrain-shading']) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of ['terrain-labels', 'terrain-contours', 'terrain-dem', 'terrain-elevation']) if (map.getSource(id)) map.removeSource(id);
}

function applyTerrain() {
  if (!terrain || !map) return;
  if (!map.isStyleLoaded()) {
    if (!terrainApplyQueued) { terrainApplyQueued = true; map.once('idle', () => { terrainApplyQueued = false; applyTerrain(); }); }
    return;
  }
  if (!map.getSource('terrain-dem')) {
    terrainLabelSignature = '';
    for (const [id, source] of Object.entries(terrainSources(terrain))) map.addSource(id, source);
    for (const layer of terrainLayers($('terrain-shading').checked, $('terrain-contours').checked)) {
      const before = layer.type === 'hillshade' ? 'water' : layer.type === 'symbol' ? 'places' : 'road-casing';
      map.addLayer(layer, map.getLayer(before) ? before : 'track-halo');
    }
    if (!state.archive) map.setPaintProperty('background', 'background-color', '#f3f2e9');
  } else {
    map.setLayoutProperty('terrain-shading', 'visibility', $('terrain-shading').checked ? 'visible' : 'none');
    for (const id of ['terrain-contour-lines', 'terrain-contour-labels']) map.setLayoutProperty(id, 'visibility', $('terrain-contours').checked ? 'visible' : 'none');
  }
  if (!!map.getTerrain() !== state.threeD) map.setTerrain(state.threeD ? { source: 'terrain-elevation', exaggeration: 1 } : null);
}

function updateTerrainLabels() {
  const source = map?.getSource('terrain-labels');
  if (!source || !map.isStyleLoaded()) return;
  const bounds = map.getBounds();
  const data = $('terrain-contours').checked && map.getZoom() >= 11 ? contourLabelData(map.queryRenderedFeatures({ layers: ['terrain-contour-lines'] }), point => bounds.contains(point)) : EMPTY_MAP_DATA;
  const signature = JSON.stringify(data);
  if (signature !== terrainLabelSignature) { terrainLabelSignature = signature; source.setData(data); }
}

async function connectTerrain(file) {
  if (!file) return;
  const generation = ++terrainGeneration;
  $('terrain-status').textContent = `Opening ${file.name}…`;
  let next;
  try {
    next = await createTerrain(file, maplibre);
    if (generation !== terrainGeneration) { next.dispose(); return; }
    if (!ensureMap()) { next.dispose(); throw new Error('WebGL map is unavailable'); }
    removeTerrainLayers(); terrain?.dispose(); terrain = next;
    $('terrain-shading').disabled = false;
    $('terrain-contours').disabled = next.header.maxZoom < 11;
    if ($('terrain-contours').disabled) $('terrain-contours').checked = false;
    $('map-3d').disabled = false;
    applyTerrain();
    $('terrain-status').textContent = `${file.name} · ${(file.size / 1024 ** 3).toFixed(2)} GiB · elevation detail capped at zoom ${Math.min(12, next.header.maxZoom)}. ${next.header.maxZoom < 11 ? 'Shading and 3D available; contours require terrain with zoom 11 or higher.' : '100 m contours, labels every 500 m, visible from zoom 11.'}`;
    if (state.selected?.points.length || (state.mapMode !== 'single' && overviewData().flightCount)) fitTrack();
    else map.fitBounds([[next.header.minLon, next.header.minLat], [next.header.maxLon, next.header.maxLat]], { padding: 30, duration: 0 });
  } catch (error) {
    if (next && terrain !== next) next.dispose();
    if (generation === terrainGeneration) $('terrain-status').textContent = `Could not open terrain: ${error.message}. Choose a compatible terrain .pmtiles file and retry.`;
  }
}

function drawFlight() {
  if (!map || !map.getSource('track')) return;
  if (!map.getLayer('flight-3d')) map.addLayer(flight3DLayer(maplibre));
  map.getSource('track').setData(trackData());
  map.getSource('density')?.setData(state.mapMode === 'heat' ? overviewData().density : EMPTY_MAP_DATA);
  const single = state.mapMode === 'single', heat = state.mapMode === 'heat';
  map.getSource('track-rate').setData(single ? selectedRates().data : EMPTY_MAP_DATA);
  map.setLayoutProperty('track-rate', 'visibility', single && !state.threeD ? 'visible' : 'none');
  const elevated = map.getLayer('flight-3d')?.implementation;
  elevated?.setFlight(state.threeD && single ? state.selected?.points || [] : [], selectedRates().data.features);
  map.setLayoutProperty('flight-heatmap', 'visibility', heat ? 'visible' : 'none');
  if (heat) map.setPaintProperty('flight-heatmap', 'heatmap-weight', ['/', ['get', 'flightCount'], Math.max(1, overviewData().flightCount)]);
  map.setLayoutProperty('track', 'visibility', single || heat ? 'none' : 'visible');
  map.setLayoutProperty('track-halo', 'visibility', single && !state.threeD ? 'visible' : 'none');
  map.setPaintProperty('track', 'line-width', single ? 3 : 1.5);
  map.setPaintProperty('track', 'line-color', single ? '#b94e38' : '#167166');
  map.setPaintProperty('track', 'line-opacity', single ? 1 : 0.4);
  $('map-mode').value = state.mapMode;
  $('heatmap-legend').hidden = !heat;
  $('rate-legend').hidden = !single || !state.selected?.points.length;
  $('rate-source').textContent = `10 s smoothed ${selectedRates().source} vertical speed · grey: level or unavailable`;
  $('three-d-status').hidden = !state.threeD;
  $('fit').textContent = single ? 'Fit track' : 'Fit all flights';
  $('fit').disabled = single ? !state.selected?.points.length : !overviewData().flightCount;
  $('map-view-status').textContent = single ? 'Selected flight. Choose All tracks or Heatmap to explore the filtered flight library.' : `${overviewData().flightCount} GPS tracks in the current filters · ${overviewData().excluded} flights without a usable track omitted.${heat ? ' Hotter areas were visited by more flights; each flight counts once per ~250 m cell.' : ' Overlapping tracks reveal frequently flown routes. Click a flight in the library to inspect it individually.'}`;
  markers.forEach(marker => marker.remove()); markers = [];
  const points = state.selected?.points || [];
  if (single && points.length) {
    for (const [point, label, colour] of [[points[0], 'First recorded fix', '#167166'], [points.at(-1), 'Last recorded fix', '#b94e38']]) {
      const marker = new maplibre.Marker({ color: colour }).setLngLat([point.lon, point.lat]).setPopup(new maplibre.Popup().setText(label)).addTo(map);
      marker.getElement().setAttribute('aria-label', label); markers.push(marker);
    }
  }
}

function fitTrack() {
  if (!map) return;
  const bounds = new maplibre.LngLatBounds();
  if (state.mapMode === 'single') (state.selected?.points || []).forEach(point => bounds.extend([point.lon, point.lat]));
  else for (const feature of overviewData().tracks.features) for (const point of feature.geometry.coordinates) bounds.extend(point);
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, { padding: 50, maxZoom: 16, duration: 0 });
}

function selectFlight(flight, inspect = false) {
  if (inspect) state.mapMode = 'single';
  state.selected = flight;
  $('flight-detail').replaceChildren();
  const heading = node('h2', flight.site || (flight.type === 'manual' ? 'Manual flight' : 'Recorded flight'));
  const grid = node('div', '', 'detail-grid');
  const maxGPS = flight.points.length ? flight.points.reduce((max, point) => Math.max(max, point.gpsAltitude), -Infinity) : null;
  for (const [label, value] of [['Date', flight.date || 'Needs review'], ['Recorded time', duration(flight.durationSeconds)], ['GPS track distance', flight.distanceKm === null ? '—' : `${flight.distanceKm.toFixed(2)} km`], ['Max GPS altitude', maxGPS === null ? '—' : `${maxGPS} m`], ['Wing', flight.wing || '—'], ['GPS fixes', flight.type === 'manual' ? '—' : flight.points.length.toLocaleString()]]) {
    const cell = node('div', ''); cell.append(node('small', label), node('strong', String(value))); grid.append(cell);
  }
  $('flight-detail').append(heading, node('p', flight.path, 'path'), grid);
  if(flight.reviewExcluded)$('flight-detail').append(node('p','Excluded flight — individual preview only. Restore inclusion in Review to count it in totals and map overviews.','warning'));
  if(flight.type==='manual'&&flight.startTime)$('flight-detail').append(node('p',`Manual start: ${flight.date} ${flight.startTime}${flight.startTimeUtc?` · ${flight.startTimeUtc} UTC`:' · local time (no stored UTC offset)'}`,'muted'));
  const xcDetail = node('div', '', 'xc-detail'); xcDetail.id = 'xc-detail'; $('flight-detail').append(xcDetail); renderXCDetail();
  if (flight.type === 'manual') {
    const edit = node('button', 'Edit manual flight', 'secondary'); edit.id = 'edit-manual'; edit.type = 'button';
    edit.addEventListener('click', () => openManual(flight)); $('flight-detail').append(edit);
  }
  if (flight.notes) $('flight-detail').append(node('p', flight.notes));
  if (flight.warnings.length) $('flight-detail').append(node('p', `Recording notes: ${flight.warnings.join(' · ')}`, 'muted'));
  if (state.bounds && flight.points.some(p => p.lon < state.bounds[0] || p.lon > state.bounds[2] || p.lat < state.bounds[1] || p.lat > state.bounds[3])) $('flight-detail').append(node('p', 'This track extends beyond the local map coverage. Its GPS track still displays.', 'muted'));
  $('fit').disabled = !flight.points.length;
  renderFlights(); ensureMap(); drawFlight(); fitTrack();
}

function renderFlights() {
  const filtered = visibleFlights();
  const filters = libraryFilters();
  const fragment = document.createDocumentFragment();
  for (const flight of filtered) {
    const button = node('button', '', `flight-item${state.selected === flight ? ' selected' : ''}`);
    button.type = 'button'; button.setAttribute('aria-pressed', String(state.selected === flight));
    button.append(node('strong', `${flight.date || 'Undated'} · ${duration(flight.durationSeconds)}`), node('small', `${flight.site || 'Unnamed site'} · ${flight.type === 'manual' ? 'Manual' : 'IGC'}`), node('small', flight.path));
    if (flight.points.length >= 5 || flight.xc?.open) button.append(node('small', `Open XC: ${flight.xcError ? 'Unavailable' : xcText(flight.xc?.open)}`));
    if ((flight.reviewWarnings||flight.warnings).length) button.append(node('small', 'Needs review', 'warning'));
    button.addEventListener('click', () => selectFlight(flight, true)); fragment.append(button);
  }
  if (!filtered.length) fragment.append(node('p', state.flights.length ? 'No flights match this filter.' : 'No flights loaded yet.', 'empty'));
  $('flight-list').replaceChildren(fragment);
}

function renderImportIssues(){
  const warnings=state.flights.filter(flight=>(flight.reviewWarnings||flight.warnings).length);
  const issues=node('ul','');
  for(const issue of [...state.issues,...warnings.map(flight=>({path:flight.path,message:(flight.reviewWarnings||flight.warnings).join(' · ')}))])issues.append(node('li',`${issue.path}: ${issue.message}`));
  $('issues').replaceChildren(issues.children.length?issues:node('p','No import warnings.'));
  $('review-summary').textContent=`Import details and review (${warnings.length+state.issues.length})`;
}
async function rescan() {
  if (!state.directory || busy) return;
  busy = true; $('folder').disabled = true; $('rescan').disabled = true;
  xcController?.stop(); xcController = null; clearTimeout(xcRefreshTimer); xcRefreshTimer = null;
  try {
    const result = await scanFolder(state.directory, count => setStatus(`Scanning… ${count} candidate files read.`));
    state.flights = result.flights; state.issues = result.issues;
    await review?.load();
    for (const flight of state.flights) if (xcCache.has(flight.key)) flight.xc = xcCache.get(flight.key);
    dashboard?.refresh();
    const selectedKey = state.selected?.key;
    state.selected = null;
    $('flight-count').textContent = state.flights.length.toLocaleString();
    $('airtime').textContent = duration(state.flights.reduce((sum, flight) => sum + flight.durationSeconds, 0));
    $('years').textContent = new Set(state.flights.filter(flight => flight.date).map(flight => flight.date.slice(0, 4))).size;
    $('folder-name').textContent = state.directory.name;
    renderImportIssues();
    setStatus(`Loaded ${state.flights.length} flights from ${result.examined} candidate files. Folder names do not determine flight dates.`);
    renderFlights();
    const eligible = visibleFlights();
    const selection = eligible.find(flight => flight.key === selectedKey) || eligible.find(flight => flight.points.length > 1) || eligible[0];
    if (selection) selectFlight(selection);
    else { drawFlight(); $('fit').disabled = true; $('flight-detail').replaceChildren(node('p', 'No flight selected.', 'muted')); }
    xcController = startXC(state.flights, xcCache, onXCUpdate, state.selected); updateXCStatus(); renderXCDetail();
  } catch (error) { setStatus(`Could not read the folder: ${error.message}. Click Choose flight folder to reconnect and approve access.`); }
  finally { busy = false; $('folder').disabled = !('showDirectoryPicker' in window); $('rescan').disabled = !state.directory; }
}

$('folder').addEventListener('click', async () => {
  if(review?.dirty&&!window.confirm('Unsaved review decisions will be discarded when reconnecting a folder. Continue?'))return;
  try { state.directory = await window.showDirectoryPicker({ mode: 'read' }); review?.reconnect(); dashboard?.reset(); await rescan(); }
  catch (error) { setStatus(cancelled(error) ? 'Folder selection cancelled or access not granted. Click Choose flight folder to retry.' : `Folder access failed: ${error.message}. Retry in desktop Chrome or Edge.`); }
});
$('rescan').addEventListener('click', rescan);
$('choose-map').addEventListener('click', () => { $('map-file').value = ''; $('map-file').click(); });
$('map-file').addEventListener('change', event => connectMap(event.target.files[0]));
$('choose-terrain').addEventListener('click', () => { $('terrain-file').value = ''; $('terrain-file').click(); });
$('terrain-file').addEventListener('change', event => connectTerrain(event.target.files[0]));
$('terrain-shading').addEventListener('change', applyTerrain);
$('terrain-contours').addEventListener('change', applyTerrain);
$('fit').addEventListener('click', fitTrack);
$('map-3d').addEventListener('click', () => {
  state.threeD = !state.threeD;
  $('map-3d').textContent = state.threeD ? '2D view' : '3D view';
  $('map-3d').setAttribute('aria-pressed', String(state.threeD));
  if (!state.threeD) map.setTerrain(null);
  applyTerrain(); drawFlight();
  map.jumpTo({ pitch: state.threeD ? 60 : 0, ...(state.threeD ? {} : { bearing: 0 }) });
});
let expanded = false, previousFocus;
function expandMap(value) {
  expanded = value;
  const panel = $('map-panel');
  if (value) previousFocus = document.activeElement;
  panel.classList.toggle('map-expanded', value);
  document.body.classList.toggle('map-window-open', value);
  for (const sibling of document.querySelectorAll('body > header, main > :not(.workspace), .flight-panel')) sibling.inert = value;
  $('map-expand').textContent = value ? 'Exit full window (Esc)' : 'Full window';
  $('map-expand').setAttribute('aria-expanded', String(value));
  if (value) { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); }
  else { panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); }
  $('map-expand').focus();
  if (!value) previousFocus?.focus();
  requestAnimationFrame(() => map?.resize());
}
$('map-expand').addEventListener('click', () => expandMap(!expanded));
document.addEventListener('keydown', event => {
  if (!expanded) return;
  if (event.key === 'Escape') { event.preventDefault(); expandMap(false); }
  if (event.key === 'Tab') {
    const controls = [...$('map-panel').querySelectorAll('button, select, input, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
$('map-mode').addEventListener('change', () => { state.mapMode = $('map-mode').value; drawFlight(); fitTrack(); });
$('theme').addEventListener('click', () => { document.body.classList.toggle('dark'); $('theme').textContent = document.body.classList.contains('dark') ? 'Light theme' : 'Dark theme'; });
function openManual(flight = null) {
  editingManual = flight; const form = $('manual-form'); form.reset(); $('save-status').textContent = '';
  $('manual-title').textContent = flight ? 'Edit manual flight' : 'Add a manual flight';
  $('manual-help').textContent = flight ? 'Choose the original JSON file to update it and keep its ID. Choosing another file creates a copy with a new ID. IGC files cannot be overwritten.' : 'Save a flightbook JSON file inside your connected flight folder. Open XC distance is optional; blank means unavailable, zero means zero kilometres.';
  for (const [key,value] of Object.entries(flight ? { date:flight.date,durationMinutes:flight.durationSeconds/60,site:flight.site||'',wing:flight.wing||'',notes:flight.notes||'',openXcDistanceKm:flight.openXcDistanceKm??'' } : {date:new Date().toLocaleDateString('en-CA')})) form.elements[key].value = value;
  form.elements.startTime.value=flight?.startTime||'';
  $('manual-time-zone').textContent=`Times are entered in ${Intl.DateTimeFormat().resolvedOptions().timeZone}; the UTC instant is stored for matching IGC recordings. Leave blank if unknown.`;
  $('manual-dialog').showModal();
}
$('add-manual').addEventListener('click', () => openManual());
$('close-manual').addEventListener('click', () => $('manual-dialog').close());
$('manual-form').addEventListener('submit', async event => {
  event.preventDefault();
  let flight;
  try { flight = createManualFlight(Object.fromEntries(new FormData(event.target))); }
  catch (error) { $('save-status').textContent = error.message; return; }
  $('save-manual').disabled = true;
  try {
    const originalHandle = editingManual ? getSourceHandle(editingManual) : null;
    const handle = await window.showSaveFilePicker({ suggestedName: originalHandle?.name || `${flight.date}-manual-${flight.id.slice(0, 8)}.json`, ...(originalHandle || state.directory ? { startIn: originalHandle || state.directory } : {}), types: [{ description: 'Flightbook JSON', accept: { 'application/json': ['.json'] } }] });
    if (/\.igc$/i.test(handle.name)) throw new Error('IGC files cannot be overwritten. Select a .json file.');
    if (!/\.json$/i.test(handle.name)) throw new Error('Choose a .json filename.');
    if(handle.name.toLowerCase()==='flightbook-review.json')throw new Error('This filename is reserved for review decisions. Choose another JSON file.');
    if(editingManual?.startTimeUtc&&flight.date===editingManual.date&&flight.startTime===editingManual.startTime)flight.startTimeUtc=editingManual.startTimeUtc;
    if (originalHandle && await handle.isSameEntry(originalHandle)) flight.id = editingManual.id;
    const writable = await handle.createWritable();
    try { await writable.write(`${JSON.stringify(flight, null, 2)}\n`); await writable.close(); }
    catch (error) { await writable.abort().catch(() => {}); throw error; }
    $('save-status').textContent = `Saved ${handle.name}. ${state.directory ? 'Rescanning your connected folder…' : 'Connect its parent flight folder to load it.'}`;
    if (state.directory) {
      await rescan();
      const savedEntry = state.flights.find(item => item.id === flight.id);
      if (savedEntry) { if (!visibleFlights().includes(savedEntry)) dashboard?.reset(); selectFlight(savedEntry, true); }
      $('save-status').textContent = state.flights.some(item => item.id === flight.id) ? `Saved and loaded ${handle.name}.` : `Saved ${handle.name}. It was not found in the connected folder; connect its parent folder to load it.`;
    }
    event.target.reset();
    editingManual = null;
  } catch (error) { $('save-status').textContent = cancelled(error) ? 'Save cancelled or permission not granted. Your form is kept; retry when ready.' : `Could not save: ${error.message}. Your form is kept; retry when ready.`; }
  finally { $('save-manual').disabled = false; }
});

if (!window.isSecureContext || !('showDirectoryPicker' in window) || !('showSaveFilePicker' in window)) {
  $('folder').disabled = true; $('add-manual').disabled = true;
  setStatus('Folder access and direct saving are unavailable in this browser. Open dashboard.html in desktop Chrome or Edge. Map file selection remains available.');
}
ensureMap();

dashboard = setupDashboard(() => state.flights, change => change?.sortOnly ? renderFlights() : refreshLibrary(true), flight => selectFlight(flight, true), () => requestAnimationFrame(() => map?.resize()));
review = setupReview(()=>state.flights,()=>state.issues,()=>state.directory,()=>{dashboard?.refresh();refreshLibrary();renderImportIssues();},flight=>dashboard.inspect(flight));

// Read-only validation data; no handles, mutation methods, or remote services.
Object.defineProperty(window, 'flightbookDiagnostics', { get: () => ({
  flightCount: state.flights.length,
  filteredFlights: visibleFlights().length,
  libraryFilters: libraryFilters(),
  xcProcessed: state.flights.filter(f => f.xc).length,
  xcErrors: state.flights.filter(f => f.xcError).map(f => ({ path: f.path, message: f.xcError })),
  xcEligible: state.flights.filter(f => f.points.length >= 5).length,
  xcPending: xcController?.pending || 0,
  selectedXC: state.selected?.xc || null,
  selectedDuration: state.selected?.durationSeconds ?? null,
  mapExpanded: expanded,
  threeD: state.threeD,
  terrainActive: !!map?.getTerrain(),
  pitch: map?.getPitch() || 0,
  elevatedSegments: map?.getLayer('flight-3d')?.implementation?.segments || 0,
  elevatedFrames: map?.getLayer('flight-3d')?.implementation?.frames || 0,
  rateSegments: map?.getSource('track-rate')?.serialize()?.data?.features?.length || 0,
  altitudeSource: selectedRates().source,
  terrainConnected: !!terrain,
  terrainMaxZoom: terrain ? Math.min(12, terrain.header.maxZoom) : null,
  terrainShadingVisible: map?.getLayer('terrain-shading') ? map.getLayoutProperty('terrain-shading', 'visibility') === 'visible' : false,
  terrainContoursVisible: map?.getLayer('terrain-contour-lines') ? map.getLayoutProperty('terrain-contour-lines', 'visibility') === 'visible' : false,
  renderedContours: map?.isStyleLoaded() && map.getLayer('terrain-contour-lines') ? map.queryRenderedFeatures({ layers: ['terrain-contour-lines'] }).length : 0,
  contourHeights: map?.isStyleLoaded() && map.getLayer('terrain-contour-lines') ? map.queryRenderedFeatures({ layers: ['terrain-contour-lines'] }).map(feature => ({ elevation: feature.properties.ele, level: feature.properties.level })) : [],
  renderedContourLabels: map?.isStyleLoaded() && map.getLayer('terrain-contour-labels') ? map.queryRenderedFeatures({ layers: ['terrain-contour-labels'] }).map(feature => feature.properties.ele) : [],
  mapMode: state.mapMode,
  overviewFlights: state.mapMode === 'single' ? 0 : overviewData().flightCount,
  mapTrackCount: map?.getSource('track')?.serialize()?.data?.features?.length || 0,
  heatCells: state.mapMode === 'heat' ? overviewData().density.features.length : 0,
  heatmapVisible: map?.getLayer('flight-heatmap') ? map.getLayoutProperty('flight-heatmap', 'visibility') === 'visible' : false,
  statisticsPeriod: dashboard.filters,
  statisticsSummary: dashboard.model.summary,
  dashboardView: dashboard.view,
  reviewFindings: review?.findings.length || 0,
  reviewExcluded: review?.excludedCount || 0,
  reviewDirty: review?.dirty || false,
  statisticsGranularity: dashboard.model.granularity,
  referenceYears: dashboard.model.referenceYears,
  selectedManualId: state.selected?.type === 'manual' ? state.selected.id : null,
  selectedPath: state.selected?.path || null,
  selectedFixes: state.selected?.points.length || 0,
  trackCoordinates: map?.getSource('track')?.serialize()?.data?.features?.[0]?.geometry?.coordinates.length || 0,
  zoom: map?.getZoom() || 0,
  mapLoaded: map?.loaded() || false,
  backgroundFeatures: map?.isStyleLoaded() && map.getLayer('land') ? map.queryRenderedFeatures({ layers: ['land', 'places', 'roads'] }).length : 0,
  placeLabels: map?.isStyleLoaded() && map.getLayer('places') ? map.queryRenderedFeatures({ layers: ['places'] }).slice(0, 15).map(feature => feature.properties.name) : []
}) });
