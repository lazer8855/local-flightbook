import { test } from 'node:test';
import assert from 'node:assert/strict';
import contour from 'maplibre-contour';
import { terrainSources, terrainLayers, contourLabelData } from '../src/terrain.mjs';

test('Terrarium heights decode in metres, including fractions and negative terrain', () => {
  const rgba = new Uint8Array([128, 3, 128, 255, 127, 255, 0, 255]);
  const decoded = contour.decodeParsedImage(2, 1, 'terrarium', rgba);
  assert.deepEqual([...decoded.data], [3.5, -1]);
});

test('Contour generation follows 100 m steps on a synthetic slope', () => {
  const heights = new Float32Array(16);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) heights[y * 4 + x] = x * 100;
  const tile = contour.HeightTile.fromRawDem({ width: 4, height: 4, data: heights });
  const lines = contour.generateIsolines(100, tile, 4096, 0);
  assert.ok(Object.keys(lines).length > 0);
  assert.ok(Object.keys(lines).every(elevation => Number(elevation) % 100 === 0));
});

test('Local terrain sources cap data at 12 and use no HTTP endpoints', () => {
  const sources = terrainSources({ header: { minZoom: 0, maxZoom: 12, minLon: 5, minLat: 43, maxLon: 17, maxLat: 49 }, rasterURL: 'local-terrain-raster://{z}/{x}/{y}', contourURL: 'local-terrain-contour://{z}/{x}/{y}' });
  assert.equal(sources['terrain-dem'].encoding, 'terrarium');
  assert.equal(sources['terrain-dem'].tileSize, 512);
  assert.equal(sources['terrain-dem'].maxzoom, 12);
  assert.equal(sources['terrain-contours'].maxzoom, 12);
  assert.deepEqual(sources['terrain-dem'].bounds, [5, 43, 17, 49]);
  assert.ok(Object.values(sources).every(source => !source.tiles || source.tiles.every(url => !/^https?:/.test(url))));
});

test('Shading and contours toggle independently, with labelled 500 m major lines', () => {
  const layers = terrainLayers(false, true);
  assert.equal(layers[0].layout.visibility, 'none');
  assert.equal(layers[1].layout.visibility, 'visible');
  assert.equal(layers[2].layout.visibility, 'visible');
  assert.equal(layers[2].source, 'terrain-labels');
});

test('Height labels use visible major contours only and deduplicate tile features', () => {
  const major = { properties: { ele: 1000, level: 1 }, geometry: { type: 'LineString', coordinates: [[7, 47], [8, 47], [9, 47]] } };
  const minor = { ...major, properties: { ele: 1100, level: 0 } };
  const labels = contourLabelData([major, major, minor], point => point[0] < 9);
  assert.equal(labels.features.length, 1);
  assert.deepEqual(labels.features[0].geometry.coordinates, [8, 47]);
  assert.equal(labels.features[0].properties.ele, 1000);
  assert.equal(contourLabelData([major], () => false).features.length, 0);
});
