export function parseIGC(text, path = '') {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const dateLine = lines.find(line => /^H[FO]DTE(?:DATE:)?\d{6}/.test(line));
  const dateMatch = dateLine?.match(/^H[FO]DTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/);
  let date = null;
  if (dateMatch) {
    const [, day, month, yy] = dateMatch;
    const year = Number(yy) >= 80 ? 1900 + Number(yy) : 2000 + Number(yy);
    const candidate = `${year}-${month}-${day}`;
    if (validDate(candidate)) date = candidate;
  }
  const header = key => lines.find(line => new RegExp(`^H.[A-Z]*${key}:`).test(line))?.split(':').slice(1).join(':').trim() || '';
  const points = [];
  let previousTime = -1, dayOffset = 0, invalidFixes = 0, malformedFixes = 0, unorderedFixes = 0;
  for (const line of lines) {
    const match = line.match(/^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{5})([NS])(\d{3})(\d{5})([EW])([AV])([\d-]\d{4})([\d-]\d{4})/);
    if (!match) { if(line.startsWith('B'))malformedFixes++; continue; }
    const [, hh, mm, ss, latDeg, latMin, ns, lonDeg, lonMin, ew, validity, pressure, gps] = match;
    if (validity !== 'A') { invalidFixes++; continue; }
    const seconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
    const latMinutes = Number(latMin) / 1000, lonMinutes = Number(lonMin) / 1000;
    const lat = (Number(latDeg) + latMinutes / 60) * (ns === 'S' ? -1 : 1);
    const lon = (Number(lonDeg) + lonMinutes / 60) * (ew === 'W' ? -1 : 1);
    if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59 || latMinutes >= 60 || lonMinutes >= 60 || Math.abs(lat) > 90 || Math.abs(lon) > 180) { malformedFixes++; continue; }
    if (previousTime >= 0 && seconds + dayOffset < previousTime - 43200) dayOffset += 86400;
    const time = seconds + dayOffset;
    if (time <= previousTime) { if(time < previousTime)unorderedFixes++; continue; }
    points.push({ lon, lat, time, pressureAltitude: Number(pressure), gpsAltitude: Number(gps) });
    previousTime = time;
  }
  const durationSeconds = points.length > 1 ? points.at(-1).time - points[0].time : 0;
  const warnings = [];
  if (!date) warnings.push('Missing or invalid date');
  if (points.length < 2) warnings.push('Not enough valid GPS fixes');
  if (durationSeconds < 60) warnings.push('Short recording (<1 minute)');
  if (invalidFixes) warnings.push(`${invalidFixes} invalid GPS fixes skipped`);
  if (malformedFixes) warnings.push(`${malformedFixes} malformed GPS records skipped`);
  if (unorderedFixes) warnings.push(`${unorderedFixes} out-of-order timestamps skipped`);
  let distanceKm = 0;
  for (let i = 1; i < points.length; i++) distanceKm += haversine(points[i - 1], points[i]);
  return { type: 'igc', path, date, durationSeconds, site: header('SITE').replace(/^Unknown$/i, ''), wing: header('GLIDERTYPE'), points, distanceKm, invalidFixes, warnings };
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

const sourceHandles = new WeakMap();
export const getSourceHandle = flight => sourceHandles.get(flight);

export function createManualFlight(input) {
  const flight = { format: 'local-flightbook', version: 1, id: crypto.randomUUID(), date: input.date, durationSeconds: Number(input.durationMinutes) * 60, site: input.site?.trim() || '', wing: input.wing?.trim() || '', notes: input.notes?.trim() || '' };
  if (input.openXcDistanceKm !== undefined && String(input.openXcDistanceKm).trim() !== '') flight.openXcDistanceKm = Number(input.openXcDistanceKm);
  if(input.startTime){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime))throw new Error('Start time must be HH:mm');
    const local=new Date(`${input.date}T${input.startTime}:00`);
    if(!Number.isFinite(local.getTime())||local.getHours()!==Number(input.startTime.slice(0,2))||local.getMinutes()!==Number(input.startTime.slice(3)))throw new Error('Start time does not exist in the current local time zone');
    flight.startTime=input.startTime;flight.startTimeUtc=local.toISOString();
  }
  parseManualFlight(JSON.stringify(flight));
  return flight;
}

export function parseManualFlight(text, path = '') {
  const flight = JSON.parse(text);
  if (flight.format !== 'local-flightbook') return null;
  if (flight.version !== 1) throw new Error('Unsupported manual-flight version');
  if (typeof flight.id !== 'string' || !flight.id.trim() || !validDate(flight.date) || !Number.isFinite(flight.durationSeconds) || flight.durationSeconds <= 0) throw new Error('Invalid manual-flight ID, date, or duration');
  for (const key of ['site', 'wing', 'notes']) if (flight[key] !== undefined && typeof flight[key] !== 'string') throw new Error(`Invalid ${key}`);
  if (flight.openXcDistanceKm !== undefined && (!Number.isFinite(flight.openXcDistanceKm) || flight.openXcDistanceKm < 0)) throw new Error('Open XC distance must be a finite, non-negative number');
  if(flight.startTime!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(flight.startTime))throw new Error('Invalid manual start time');
  if(flight.startTimeUtc!==undefined&&(!flight.startTime||typeof flight.startTimeUtc!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(flight.startTimeUtc)||!Number.isFinite(Date.parse(flight.startTimeUtc))||new Date(flight.startTimeUtc).toISOString()!==flight.startTimeUtc))throw new Error('Invalid UTC start time');
  return { ...flight, type: 'manual', path, points: [], distanceKm: null, warnings: [], xc: flight.openXcDistanceKm === undefined ? undefined : { open: { distanceKm: flight.openXcDistanceKm, source: 'manual' } } };
}

export function haversine(a, b) {
  const rad = Math.PI / 180;
  const lat = (b.lat - a.lat) * rad, lon = (b.lon - a.lon) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function scanFolder(directory, onProgress = () => {}) {
  const flights = [], issues = [], hashes = new Map();
  let examined = 0;
  async function visit(handle, prefix = '') {
    for await (const [name, entry] of handle.entries()) {
      const path = `${prefix}${name}`;
      if (entry.kind === 'directory') { await visit(entry, `${path}/`); continue; }
      if (!/\.(igc|json)$/i.test(name)) continue;
      examined++;
      try {
        const file = await entry.getFile();
        const bytes = await file.arrayBuffer();
        const text = new TextDecoder().decode(bytes);
        const flight = /\.igc$/i.test(name) ? parseIGC(text, path) : parseManualFlight(text, path);
        if (!flight) continue;
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
        flight.contentHash = digest;
        flight.key = hashes.has(digest) ? `${digest}:${path}` : digest;
        hashes.set(digest, path);
        if (flight.type === 'manual') sourceHandles.set(flight, entry);
        flights.push(flight);
      } catch (error) { issues.push({ path, message: error.message }); }
      if (examined % 10 === 0) { onProgress(examined); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
  }
  await visit(directory);
  flights.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path));
  return { flights, issues, examined };
}
