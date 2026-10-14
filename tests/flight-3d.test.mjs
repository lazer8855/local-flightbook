import test from 'node:test';
import assert from 'node:assert/strict';
import { flightMesh, rateRGB } from '../src/flight-3d.mjs';
test('3D mesh uses GPS altitude and preserves the altitude difference at each end', () => {
  const points = [{lon:8,lat:47,gpsAltitude:1000},{lon:8.1,lat:47.1,gpsAltitude:1200}];
  const mesh = flightMesh(points,[{properties:{rate:2}}], p => [p.lon,p.lat,p.gpsAltitude]);
  assert.equal(mesh.segments,1);
  assert.deepEqual(mesh.origin,[8,47,1000]);
  assert.equal(mesh.vertices.length,66);
  assert.equal(mesh.vertices[2],0);
  assert.equal(mesh.vertices[5],200);
});
test('missing GPS altitude skips segments and colour scale agrees with 2D', () => {
  assert.equal(flightMesh([{gpsAltitude:null},{gpsAltitude:100}],[],()=>[0,0,0]).segments,0);
  assert.deepEqual(rateRGB(null),[139,144,149].map(v=>v/255));
  assert.deepEqual(rateRGB(-8),[33,102,172].map(v=>v/255));
  assert.deepEqual(rateRGB(8),[216,90,25].map(v=>v/255));
});
