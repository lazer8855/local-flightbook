import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapOverview } from '../src/map-overview.mjs';

const point = (lon, lat) => ({ lon, lat });
test('Overview keeps each track separate and preserves all fixes', () => {
  const a = [point(7.1, 47.1), point(7.2, 47.2), point(7.3, 47.3)];
  const b = [point(-64.1, -30.1), point(-64.2, -30.2)];
  const overview = buildMapOverview([{ path: 'a', points: a }, { path: 'b', points: b }, { path: 'manual', points: [] }, { path: 'one fix', points: [a[0]] }]);
  assert.equal(overview.flightCount, 2); assert.equal(overview.excluded, 2);
  assert.deepEqual(overview.tracks.features.map(feature => feature.geometry.coordinates.length), [3, 2]);
  assert.deepEqual(overview.tracks.features[1].geometry.coordinates[0], [-64.1, -30.1]);
});

test('Heatmap counts flights once per cell, independent of sampling rate/circling', () => {
  const a = point(7.33349, 47.25486), b = point(8.2, 48.2);
  const sparse = buildMapOverview([{ path: 'a', points: [a, b] }, { path: 'b', points: [a, b] }]);
  const dense = buildMapOverview([{ path: 'a', points: [...Array(100).fill(a), b] }, { path: 'b', points: [a, b] }]);
  assert.deepEqual(dense.density, sparse.density);
  assert.equal(dense.density.features.length, 2);
  assert.ok(dense.density.features.every(feature => feature.properties.flightCount === 2));
});

test('Heatmap supports empty input and only the supplied filtered flights', () => {
  assert.equal(buildMapOverview([]).density.features.length, 0);
  const overview = buildMapOverview([{ path: 'filtered flight', points: [point(7, 47), point(7.1, 47.1)] }]);
  assert.equal(overview.flightCount, 1);
  assert.ok(overview.density.features.every(feature => feature.properties.flightCount === 1));
});
