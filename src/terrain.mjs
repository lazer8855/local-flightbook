import { PMTiles, FileSource } from 'pmtiles';

let nextSource = 0;
export async function createTerrain(file, maplibre) {
  const archive = new PMTiles(new FileSource(file));
  const header = await archive.getHeader(), metadata = await archive.getMetadata();
  if (header.tileType !== 4 || !/mapterhorn/i.test(metadata.attribution || '')) throw new Error('Choose the Mapterhorn terrain-alps.pmtiles elevation package, not the Europe basemap');
  if (header.maxZoom > 12) throw new Error('This dashboard expects an elevation package capped at zoom 12');
  if (header.maxZoom < 11) throw new Error('This terrain package lacks zoom 11–12 data needed for the contour layer');
  const blobURL = URL.createObjectURL(new Blob([TERRAIN_WORKER], { type: 'text/javascript' }));
  const worker = new Worker(blobURL);
  const pending = new Map(); let nextRequest = 0, disposed = false;
  const prefix = `local-terrain-${++nextSource}`;
  const rasterProtocol = `${prefix}-raster`, contourProtocol = `${prefix}-contour`;
  function request(type, args = {}, signal) {
    if (disposed || signal?.aborted) return Promise.reject(new DOMException('Terrain request cancelled', 'AbortError'));
    return new Promise((resolve, reject) => {
      const id = ++nextRequest;
      const cancel = () => { cleanup(); worker.postMessage({ type: 'cancel', id }); reject(new DOMException('Terrain request cancelled', 'AbortError')); };
      const timeout = setTimeout(() => { cleanup(); worker.postMessage({ type: 'cancel', id }); reject(new Error('Local terrain processing timed out; try zooming out or reconnecting the file')); }, 60000);
      function cleanup() { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); pending.delete(id); }
      pending.set(id, { resolve: result => { cleanup(); resolve(result); }, reject: error => { cleanup(); reject(error); } });
      signal?.addEventListener('abort', cancel, { once: true });
      worker.postMessage({ id, type, ...args });
    });
  }
  worker.onmessage = ({ data }) => {
    const callback = pending.get(data.id);
    if (data.error) callback?.reject(Object.assign(new Error(data.error.message), { name: data.error.name }));
    else callback?.resolve(data.result);
  };
  worker.onerror = () => { for (const callback of [...pending.values()]) callback.reject(new Error('The local terrain worker could not start')); };
  function dispose() {
    disposed = true;
    for (const callback of [...pending.values()]) callback.reject(new DOMException('Terrain archive replaced', 'AbortError'));
    worker.terminate(); URL.revokeObjectURL(blobURL);
    maplibre.removeProtocol(rasterProtocol); maplibre.removeProtocol(contourProtocol);
  }
  try { await request('init', { file }); }
  catch (error) { dispose(); throw error; }
  const protocol = type => async (params, abortController) => {
    const coordinates = params.url.match(/:\/\/(\d+)\/(\d+)\/(\d+)/);
    if (!coordinates) throw new Error('Invalid terrain tile address');
    const [, z, x, y] = coordinates;
    return request(type, { z: Number(z), x: Number(x), y: Number(y) }, abortController.signal);
  };
  maplibre.addProtocol(rasterProtocol, protocol('raster'));
  maplibre.addProtocol(contourProtocol, protocol('contours'));
  return { file, header, dispose, rasterURL: `${rasterProtocol}://{z}/{x}/{y}`, contourURL: `${contourProtocol}://{z}/{x}/{y}` };
}

export function terrainSources(terrain) {
  const h = terrain.header, bounds = [h.minLon, h.minLat, h.maxLon, h.maxLat];
  return {
    'terrain-elevation': { type: 'raster-dem', tiles: [terrain.rasterURL], encoding: 'terrarium', tileSize: 512, minzoom: h.minZoom, maxzoom: Math.min(12, h.maxZoom), bounds },
    'terrain-dem': { type: 'raster-dem', tiles: [terrain.rasterURL], encoding: 'terrarium', tileSize: 512, minzoom: h.minZoom, maxzoom: Math.min(12, h.maxZoom), bounds, attribution: '© <a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener">Mapterhorn terrain sources</a>' },
    'terrain-contours': { type: 'vector', tiles: [terrain.contourURL], minzoom: 11, maxzoom: Math.min(12, h.maxZoom), bounds },
    'terrain-labels': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  };
}

export function terrainLayers(shading, contours) {
  return [
    { id: 'terrain-shading', type: 'hillshade', source: 'terrain-dem', layout: { visibility: shading ? 'visible' : 'none' }, paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#43554b', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#677658' } },
    { id: 'terrain-contour-lines', type: 'line', source: 'terrain-contours', 'source-layer': 'contours', minzoom: 11, layout: { visibility: contours ? 'visible' : 'none' }, paint: { 'line-color': '#877355', 'line-opacity': 0.65, 'line-width': ['case', ['>', ['get', 'level'], 0], 1.1, 0.5] } },
    { id: 'terrain-contour-labels', type: 'symbol', source: 'terrain-labels', minzoom: 11, layout: { visibility: contours ? 'visible' : 'none', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'], 'text-font': ['Flightbook'], 'text-size': 11, 'text-anchor': 'bottom', 'text-offset': [0, -0.2], 'text-padding': 12 }, paint: { 'text-color': '#766245', 'text-halo-color': '#fffdf3', 'text-halo-width': 1.5 } }
  ];
}

// Label a visible point on each major line instead of bending text along tight
// curves. Numeric heights remain legible even on short/winding contour segments.
export function contourLabelData(features, contains) {
  const labels = [], seen = new Set();
  for (const feature of features) {
    const elevation = Number(feature.properties.ele);
    if (!Number.isFinite(elevation) || elevation % 500 !== 0 || Number(feature.properties.level) < 1) continue;
    const lines = feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : [];
    for (const line of lines) {
      const visible = line.filter(contains);
      if (!visible.length) continue;
      const coordinate = visible[Math.floor(visible.length / 2)];
      const key = `${elevation}/${coordinate[0].toFixed(4)}/${coordinate[1].toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push({ type: 'Feature', properties: { ele: elevation }, geometry: { type: 'Point', coordinates: coordinate } });
    }
  }
  return { type: 'FeatureCollection', features: labels };
}
