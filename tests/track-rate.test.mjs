import test from 'node:test';
import assert from 'node:assert/strict';
import { trackRates } from '../src/track-rate.mjs';

const point = (time, altitude) => ({ time, pressureAltitude: altitude, gpsAltitude: altitude, lon: 8 + time / 10000, lat: 47 });
test('rates use seconds and retain every coordinate through irregular recordings', () => {
  const points = [0, 1, 4, 9, 12].map(t => point(t, 1000 + t * 2));
  const result = trackRates(points);
  assert.equal(result.source, 'barometric');
  assert.equal(result.data.features.length, points.length - 1);
  result.data.features.forEach((f, i) => {
    assert.equal(f.properties.rate, 2);
    assert.deepEqual(f.geometry.coordinates, [[points[i].lon, 47], [points[i + 1].lon, 47]]);
  });
});
test('GPS fallback shows sinking when pressure altitude is absent or constant', () => {
  const points = [0, 5, 10].map(t => ({ ...point(t, 1000 - t), pressureAltitude: 0 }));
  const result = trackRates(points);
  assert.equal(result.source, 'GPS');
  assert.ok(result.data.features.every(f => f.properties.rate === -1));
});
test('gaps and missing altitude have unknown rates rather than false climbs', () => {
  const points = [point(0, 1000), point(5, 1010), point(60, 1100), point(65, 1105)];
  assert.deepEqual(trackRates(points).data.features.map(f => f.properties.rate), [2, null, 1]);
  assert.equal(trackRates([{ ...point(0, 0), gpsAltitude: null }, { ...point(5, 0), gpsAltitude: null }]).data.features[0].properties.rate, null);
  assert.equal(trackRates().data.features.length, 0);
});
