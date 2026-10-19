import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseFlight,nearestTime,fixTime,sampleIndices,openRoute} from '../src/flight-analysis.mjs';
import {terrainAddress,sampleDem} from '../src/terrain-sampling.mjs';
import {parseIGC} from '../src/flights.mjs';
import {calculateXC} from '../src/xc.mjs';
test('analysis preserves fixes, uses actual seconds, and leaves gap speeds/rates unknown',()=>{
  const points=[0,10,20,90].map((time,i)=>({lon:8+i*.001,lat:47,time,gpsAltitude:1000+i*10,pressureAltitude:900+i*10}));
  const result=analyseFlight({points,distanceKm:1,durationSeconds:90});
  assert.equal(result.rows.length,4);assert.equal(result.rateSource,'barometric');
  assert.equal(result.rows[0].groundSpeedKmh,null);assert.ok(result.rows[1].groundSpeedKmh>20);
  assert.equal(result.rows[3].groundSpeedKmh,null);assert.equal(result.rows[2].verticalSpeed,null);assert.equal(result.rows[3].segment,1);
  assert.equal(result.averageGroundSpeedKmh,40);assert.equal(points[0].segment,undefined);
  assert.deepEqual(analyseFlight({points:[]}).rows,[]);
});
test('UTC fix times cross midnight correctly and nearest-time selection handles boundaries',()=>{
  const points=[{time:86390},{time:86410},{time:86430}];
  assert.equal(fixTime({date:'2024-12-31'},points[1]),'2025-01-01 00:00:10 UTC');
  assert.match(fixTime({},points[1]),/date unknown; next day/);
  assert.equal(nearestTime(points,86300),0);assert.equal(nearestTime(points,86417),1);assert.equal(nearestTime(points,99999),2);assert.equal(nearestTime([],0),-1);
  const indices=sampleIndices(5000,256);assert.equal(indices.length,256);assert.equal(indices[0],0);assert.equal(indices.at(-1),4999);
});
test('Open XC overlay includes actual optimized endpoints and every scored leg',()=>{
  const points=Array.from({length:10},(_,i)=>({lon:8+i*.01,lat:47,time:i*10,gpsAltitude:1000,pressureAltitude:1000}));
  const xc=calculateXC(points,500),route=openRoute({xc});
  assert.equal(xc.open.routePoints.length,5);assert.equal(route.features.filter(f=>f.geometry.type==='LineString').length,4);
  const vertices=route.features.filter(f=>f.geometry.type==='Point');assert.equal(vertices[0].properties.label,'S');assert.equal(vertices.at(-1).properties.label,'F');
  for(const p of xc.open.routePoints){assert.equal(points[p.index].lon,p.lon);assert.equal(points[p.index].lat,p.lat);}
  assert.ok(Math.abs(xc.open.legsKm.reduce((a,b)=>a+b,0)-xc.open.distanceKm)<.02);
  assert.equal(openRoute({type:'manual',xc:{open:{distanceKm:10}}}).features.length,0);
});
test('local terrain sampling respects coverage, zoom limits, bilinear values and unknown elevations',()=>{
  const header={minLon:-25,maxLon:45,minLat:34,maxLat:72,maxZoom:8};
  const address=terrainAddress({lon:8,lat:47},header);assert.equal(address.z,8);assert.ok(address.u>=0&&address.u<=1);
  assert.equal(terrainAddress({lon:80,lat:47},header),null);assert.equal(terrainAddress({lon:8,lat:90},header),null);
  const tile={width:2,height:2,data:new Float32Array([-10,0,10,20])};
  assert.equal(sampleDem(tile,{u:.5,v:.5}),5);assert.equal(sampleDem(tile,{u:0,v:0}),-10);
  tile.data[0]=NaN;assert.equal(sampleDem(tile,{u:.5,v:.5}),null);
});
test('pilot and glider registration are read from IGC headers without inferring a launch',()=>{
  const f=parseIGC('HFDTE010624\nHFPLTPILOTINCHARGE:Example Pilot\nHFGIDGLIDERID:CH-123\nHFGTYGLIDERTYPE:Example Wing\n');
  assert.equal(f.pilot,'Example Pilot');assert.equal(f.registration,'CH-123');assert.equal(f.wing,'Example Wing');assert.equal(f.site,'');
});
