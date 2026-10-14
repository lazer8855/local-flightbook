import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, summary, openXC, yearDates, shortcutDates, shiftYear } from '../src/dashboard-model.mjs';
import { createManualFlight, parseManualFlight } from '../src/flights.mjs';

const manual=(date,minutes,km,extra={})=>({type:'manual',date,durationSeconds:minutes*60,path:`${date}-${minutes}.json`,points:[],...(km===undefined?{}:{openXcDistanceKm:km}),...extra});
const track=(date,minutes,km,optimal=true)=>({type:'igc',date,durationSeconds:minutes*60,path:`${date}.igc`,points:[],xc:{open:{distanceKm:km,optimal}}});
const today='2026-10-14';
test('shared selection includes inclusive dates, short-log filtering, text, duration and manual XC',()=>{
  const flights=[manual('2022-06-01',.5,0),manual('2022-06-02',30,12,{site:'Swiss'}),manual('2022-06-03',60),manual('2023-06-02',30,25)];
  const m=buildDashboard(flights,{from:'2022-06-01',to:'2022-06-02',minMinutes:30,minKm:10,search:'Swiss'},today);
  assert.equal(m.summary.count,1);assert.equal(m.summary.openXcKm,12);assert.equal(m.granularity,'day');
  assert.equal(buildDashboard(flights,{hideShort:true},today).summary.count,3);
  assert.equal(buildDashboard(flights,{from:'2022-06-03',to:'2022-06-01'},today).summary.count,0);
  assert.deepEqual(m.years,[2022,2023]);
});
test('coverage distinguishes manual, zero, estimate and unavailable without inventing distance',()=>{
  const s=summary([manual('2022-01-01',10,0),manual('2022-01-02',10),track('2022-01-03',10,20,false),track('2022-01-04',10,null)]);
  assert.equal(s.openXcKm,20);assert.deepEqual(s.coverage,{total:4,known:2,calculated:1,manual:1,unavailable:2,approximate:1});
  assert.equal(summary([manual('2022-01-02',10)]).openXcKm,null);assert.equal(summary([]).openXcKm,0);
  assert.equal(openXC(manual('2022-01-02',10,0)).source,'manual');
});
test('adaptive grouping uses days, months and years; sorting never changes aggregates',()=>{
  const f=[manual('2021-05-01',10,4),manual('2022-06-01',20,6)];
  assert.equal(buildDashboard(f,{},today).granularity,'year');
  assert.equal(buildDashboard(f,yearDates(2022),today).granularity,'month');
  assert.equal(buildDashboard(f,yearDates(2022,6),today).granularity,'day');
  assert.deepEqual(buildDashboard(f,{sort:'xc'},today).summary,buildDashboard(f,{},today).summary);
});
test('reference years exclude selected/current, retain zero periods and share non-date criteria',()=>{
  const f=[manual('2020-06-01',60,10),manual('2021-06-01',120,20),manual('2022-07-01',60,30),manual('2026-06-01',1000,100)];
  const m=buildDashboard(f,yearDates(2021,6),today);
  assert.deepEqual(m.referenceYears,[2020,2022]);assert.equal(m.average.durationSeconds,1800);
  assert.equal(m.average.openXcKm,5);assert.equal(m.previous.durationSeconds,3600);
  assert.equal(m.progress.average.at(-1).openXcKm,m.average.openXcKm);
  const filtered=buildDashboard(f,{...yearDates(2021,6),minMinutes:90},today);
  assert.equal(filtered.summary.durationSeconds,7200);assert.equal(filtered.average.durationSeconds,0);
  assert.equal(filtered.previous.count,0);assert.deepEqual(filtered.years,[2020,2021,2022,2026]);
});
test('current-year curves stop at matched date; leap days align without March drift',()=>{
  const f=[manual('2024-02-29',60,5),manual('2025-02-28',30,3),manual('2025-03-01',10,1),manual('2026-02-28',20,2),manual('2026-12-01',60,10)];
  const m=buildDashboard(f,yearDates(2026),'2026-03-01');
  assert.equal(m.progress.selected.at(-1).label,'03-01');assert.equal(m.comparisonSelected.count,1);
  const leap=m.progress.selected.find(r=>r.label==='02-29'), prior=m.progress.selected.find(r=>r.label==='02-28');
  assert.equal(leap.durationSeconds,prior.durationSeconds);assert.equal(m.progress.average.at(-1).durationSeconds,3000);
  assert.equal(shiftYear('2024-02-29',2025),'2025-02-28');
  assert.equal(m.progress.previous.at(-1).durationSeconds,2400);
});
test('bands have inclusive lower/exclusive upper boundaries, scatter and records include manual distances',()=>{
  const f=[manual('2022-06-01',1,1),manual('2022-06-02',10,5),manual('2022-06-03',30,20),manual('2022-06-04',240,200),manual('2022-06-05',20)];
  const m=buildDashboard(f,{},today);
  assert.equal(m.distributions.duration[0].count,0);assert.equal(m.distributions.duration[1].count,1);assert.equal(m.distributions.duration.at(-1).count,1);
  assert.equal(m.distributions.distance[0].count,0);assert.equal(m.distributions.distance[1].count,1);assert.equal(m.distributions.distance.at(-1).count,1);
  assert.equal(m.scatter.length,4);assert.ok(m.scatter.every(p=>p.source==='manual'));
  assert.equal(m.best.distance,f[3]);assert.equal(m.best.duration,f[3]);
});
test('date shortcuts use inclusive local calendar dates and 30 days across year boundaries',()=>{
  assert.equal(shortcutDates('last-30','2026-01-10').from,'2025-12-12');
  assert.equal(shortcutDates('this-month',today).from,'2026-10-01');assert.equal(shortcutDates('this-month',today).to,today);
  assert.equal(shortcutDates('last-year',today).to,'2025-12-31');assert.equal(shortcutDates('all',today).from,'');
  assert.equal(buildDashboard([],shortcutDates('last-30','2026-01-10'),today).granularity,'day');
});
test('empty selections have stable years, no records, unavailable references and no NaN',()=>{
  const m=buildDashboard([manual('2021-01-01',10)],yearDates(2022,6),today);
  assert.deepEqual(m.years,[2021]);assert.equal(m.summary.count,0);assert.equal(m.best.distance,null);
  assert.equal(buildDashboard([],{},today).average.count,null);
  assert.ok(!JSON.stringify(m).includes('NaN'));
});
test('manual schema stays version 1, omits blank distance and rejects invalid values',()=>{
  const input={date:'2026-10-14',durationMinutes:42.5};
  const blank=createManualFlight({...input,openXcDistanceKm:''});assert.equal(blank.version,1);assert.ok(!('openXcDistanceKm' in blank));
  const zero=createManualFlight({...input,openXcDistanceKm:'0'});const parsed=parseManualFlight(JSON.stringify(zero));
  assert.equal(parsed.xc.open.distanceKm,0);assert.equal(parsed.distanceKm,null);assert.equal(parsed.xc.open.source,'manual');
  for(const value of [-1,'NaN','Infinity'])assert.throws(()=>createManualFlight({...input,openXcDistanceKm:value}),/distance/);
  assert.throws(()=>parseManualFlight(JSON.stringify({...blank,openXcDistanceKm:'10'})),/distance/);
});
