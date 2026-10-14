import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateXC } from '../src/xc.mjs';
const track = coordinates => coordinates.map(([lon,lat],i)=>({lon,lat,time:i*60,pressureAltitude:1000,gpsAltitude:1000}));
test('open XC follows up to three turnpoints rather than accumulated circling distance', () => {
  const points=track([[8,47],[8.01,47],[8.02,47],[8.03,47],[8.04,47],[8.05,47]]);
  const xc=calculateXC(points,500);
  assert.equal(xc.open.optimal,true);
  assert.ok(xc.open.distanceKm>3.7 && xc.open.distanceKm<3.9);
  assert.equal(xc.triangle.distanceKm,0);
});
test('closed balanced triangle qualifies for FAI; returned distance deducts its gap', () => {
  const points=track([[8,47],[8.1,47],[8.05,47.06],[8,47],[8,47]]);
  const xc=calculateXC(points,500);
  assert.equal(xc.fai.optimal,true);
  assert.ok(xc.fai.distanceKm>20);
  assert.equal(xc.fai.gapKm,0);
  assert.ok(xc.fai.legsKm.every(d=>d>=xc.fai.perimeterKm*.28));
  assert.ok(Math.abs(xc.triangle.distanceKm-(xc.triangle.perimeterKm-xc.triangle.gapKm))<.011);
});
test('closing gap is subtracted; unbalanced triangles fail the FAI ratio', () => {
  const xc=calculateXC(track([[8,47],[8.2,47],[8.18,47.005],[8.002,47],[8.002,47]]),500);
  assert.ok(xc.triangle.distanceKm>0);
  assert.ok(xc.triangle.gapKm>0);
  assert.ok(Math.abs(xc.triangle.distanceKm-(xc.triangle.perimeterKm-xc.triangle.gapKm))<.011);
  assert.equal(xc.fai.distanceKm,0);
});
test('short or empty recordings have no invented XC distance; original fixes are unchanged', () => {
  assert.equal(calculateXC(track([[8,47],[8.1,47]])),null);
  const points=track([[8,47],[8.1,47],[8.05,47.06],[8,47],[8,47]]), before=structuredClone(points);
  calculateXC(points,500);
  assert.deepEqual(points,before);
});
