import test from 'node:test';
import assert from 'node:assert/strict';
import { filterFlights } from '../src/flight-filters.mjs';
const flights = [
  {path:'a',date:'2022-01-01',durationSeconds:600,xc:{open:{distanceKm:5},triangle:{distanceKm:2}}},
  {path:'b',date:'2021-01-01',durationSeconds:3600,xc:{open:{distanceKm:40},triangle:{distanceKm:20}}},
  {path:'manual',date:'2023-01-01',durationSeconds:1200},
  {path:'pending',date:'2022-01-02',durationSeconds:1500,xc:{open:{distanceKm:null}}}
];
test('duration ranges include boundaries and combine with search and XC ranges', () => {
  assert.deepEqual(filterFlights(flights,{minMinutes:10,maxMinutes:20}).map(f=>f.path),['manual','a']);
  assert.deepEqual(filterFlights(flights,{minMinutes:10,maxMinutes:60,minKm:5,maxKm:40,search:'2021'}).map(f=>f.path),['b']);
  assert.equal(filterFlights(flights,{minMinutes:40,maxMinutes:10}).length,0);
});
test('XC type changes the range; pending/manual are unknown rather than zero', () => {
  assert.deepEqual(filterFlights(flights,{xcType:'triangle',minKm:10}).map(f=>f.path),['b']);
  assert.deepEqual(filterFlights(flights,{minKm:0,maxKm:10}).map(f=>f.path),['a']);
  assert.equal(filterFlights(flights).length,4);
});
test('sorting preserves input and puts unknown XC last', () => {
  assert.deepEqual(filterFlights(flights,{sort:'xc'}).slice(0,2).map(f=>f.path),['b','a']);
  assert.deepEqual(filterFlights(flights,{sort:'duration'}).map(f=>f.path),['b','pending','manual','a']);
  assert.equal(flights[0].path,'a');
});
