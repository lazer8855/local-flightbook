// Ten-second centred altitude differences; never smooth across recording gaps.
export function trackRates(points = []) {
  const barometric = points.filter(p => Number.isFinite(p.pressureAltitude));
  const usePressure = barometric.length === points.length && barometric.some(p => p.pressureAltitude !== barometric[0]?.pressureAltitude);
  const field = usePressure ? 'pressureAltitude' : 'gpsAltitude';
  const features = [];
  let start = 0;
  while (start < points.length) {
    let end = start;
    while (end + 1 < points.length && points[end + 1].time > points[end].time && points[end + 1].time - points[end].time <= 30) end++;
    let left = start, right = start;
    for (let i = start; i < end; i++) {
      const midpoint = (points[i].time + points[i + 1].time) / 2;
      while (left < i && points[left].time < midpoint - 5) left++;
      while (right < end && points[right + 1].time <= midpoint + 5) right++;
      const a = points[Math.min(left, i)], b = points[Math.max(right, i + 1)];
      const valid = points.slice(Math.min(left, i), Math.max(right, i + 1) + 1).every(p => Number.isFinite(p[field]));
      features.push(segment(points[i], points[i + 1], valid ? (b[field] - a[field]) / (b.time - a.time) : null));
    }
    if (end + 1 < points.length) features.push(segment(points[end], points[end + 1], null));
    start = end + 1;
  }
  return { source: usePressure ? 'barometric' : 'GPS', data: { type: 'FeatureCollection', features } };
}

function segment(a, b, rate) {
  return { type: 'Feature', properties: { rate }, geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] } };
}

export const RATE_COLOR = ['case', ['==', ['get', 'rate'], null], '#8b9095', ['interpolate', ['linear'], ['get', 'rate'], -3, '#2166ac', -0.2, '#75b5df', 0, '#8b9095', 0.2, '#f2ba70', 3, '#d85a19']];
