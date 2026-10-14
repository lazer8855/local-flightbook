const collection = features => ({ type: 'FeatureCollection', features });
export const EMPTY_MAP_DATA = collection([]);

// Each flight contributes once per approximately 250 m cell. This describes
// route popularity, independent of logger sample rate or time spent circling.
export function buildMapOverview(flights, cellMetres = 250) {
  const tracks = [], cells = new Map();
  const latitudeStep = cellMetres / 111320;
  let excluded = 0;
  for (const flight of flights) {
    if (flight.points.length < 2) { excluded++; continue; }
    tracks.push({ type: 'Feature', properties: { path: flight.path }, geometry: { type: 'LineString', coordinates: flight.points.map(point => [point.lon, point.lat]) } });
    const visited = new Set();
    for (const point of flight.points) {
      const row = Math.floor(point.lat / latitudeStep);
      const latitude = (row + 0.5) * latitudeStep;
      const longitudeStep = latitudeStep / Math.max(0.01, Math.cos(latitude * Math.PI / 180));
      const column = Math.floor(point.lon / longitudeStep), key = `${row}:${column}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!cells.has(key)) cells.set(key, { lon: (column + 0.5) * longitudeStep, lat: latitude, count: 0 });
      cells.get(key).count++;
    }
  }
  const density = collection([...cells.values()].map(cell => ({ type: 'Feature', properties: { flightCount: cell.count }, geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] } })));
  return { tracks: collection(tracks), density, flightCount: tracks.length, excluded };
}
