import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseIGC, parseManualFlight, createManualFlight, scanFolder } from '../src/flights.mjs';

const fix = (time, lat = '4715292N', lon = '00733349E', validity = 'A') => `B${time}${lat}${lon}${validity}0056300681`;
const igc = (date = '110622', fixes = [fix('142437'), fix('142538')]) => `AXSX001\r\nHFPLTPILOT:Test\r\nHFGTYGLIDERTYPE:Sky KEA\r\nHPSITSITE:Test site\r\nHFDTE${date}\r\n${fixes.join('\r\n')}\r\n`;

test('IGC dates and coordinates come from records, with both header variants', () => {
  const flight = parseIGC(igc().replace('HFGTY', 'HOGTY'), 'wrong-year/Jan/elsewhere.IGC');
  assert.equal(flight.date, '2022-06-11');
  assert.equal(flight.wing, 'Sky KEA'); assert.equal(flight.site, 'Test site');
  assert.equal(flight.durationSeconds, 61);
  assert.ok(Math.abs(flight.points[0].lat - 47.2548666667) < 1e-8);
  assert.equal(flight.points[0].gpsAltitude, 681);
  assert.equal(flight.points[0].pressureAltitude, 563);
});

test('Southern/western coordinates, midnight, invalid fixes, and short tracks', () => {
  const flight = parseIGC(igc('021214', [fix('235930', '3058014S', '06435100W'), fix('235940', '3058014S', '06435100W', 'V'), fix('000100', '3058012S', '06435096W')]));
  assert.equal(flight.durationSeconds, 90); assert.equal(flight.points.length, 2);
  assert.ok(flight.points[0].lat < 0 && flight.points[0].lon < 0);
  assert.ok(flight.distanceKm > 0);
  assert.match(flight.warnings.join(), /invalid GPS/);
  assert.match(parseIGC(igc('110622', [fix('142437'), fix('142438')])).warnings.join(), /Short recording/);
});

test('Malformed dates are flagged, not inferred from folders; bad fixes are skipped', () => {
  const flight = parseIGC(igc('310222', [fix('246099'), fix('142437'), fix('142438')]), '2022/February/28/flight.igc');
  assert.equal(flight.date, null); assert.equal(flight.points.length, 2);
  assert.match(flight.warnings.join(), /invalid date/);
});

test('Manual JSON round trips and rejects incompatible/invalid records', () => {
  const manual = createManualFlight({ date: '2026-10-13', durationMinutes: '42.5', site: '  Test site  ', wing: 'Wing', notes: 'Notes' });
  const loaded = parseManualFlight(JSON.stringify(manual));
  assert.equal(loaded.durationSeconds, 2550); assert.equal(loaded.site, 'Test site');
  assert.equal(loaded.id, manual.id); assert.equal(loaded.distanceKm, null);
  assert.equal(parseManualFlight('{"something":"unrelated"}'), null);
  assert.throws(() => parseManualFlight(JSON.stringify({ ...manual, version: 2 })), /version/);
  assert.throws(() => createManualFlight({ date: '2026-02-30', durationMinutes: 10 }), /Invalid/);
  assert.throws(() => createManualFlight({ date: '2026-10-13', durationMinutes: 0 }), /Invalid/);
});

function memoryDirectory(entries) {
  return { kind: 'directory', async *entries() {
    for (const [name, value] of Object.entries(entries)) yield [name, typeof value === 'string' ? { kind: 'file', getFile: async () => new File([value], name) } : memoryDirectory(value)];
  } };
}

test('Recursive scanning handles arbitrary names, copies, manual IDs, and bad files', async () => {
  const manual = createManualFlight({ date: '2026-10-13', durationMinutes: 30 });
  const result = await scanFolder(memoryDirectory({
    'Flights ü': { 'Site folder': { 'one.IGC': igc(), 'copy.igc': igc(), 'manual.json': JSON.stringify(manual) } },
    'other-manual.json': JSON.stringify({ ...manual, notes: 'Copied ID' }),
    'invalid.json': '{', 'unrelated.json': '{}', 'ignored.txt': 'whatever',
    'second.igc': igc('120622')
  }));
  assert.equal(result.flights.length, 3); assert.equal(result.issues.length, 3);
  assert.equal(result.flights[0].date, '2026-10-13');
  assert.ok(result.flights.some(flight => flight.path.includes('Flights ü/Site folder')));
});

export function diskDirectory(path) {
  return { kind: 'directory', name: path.split(/[\\/]/).at(-1), async *entries() {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      yield [entry.name, entry.isDirectory() ? diskDirectory(child) : { kind: 'file', getFile: async () => new File([await readFile(child)], entry.name) }];
    }
  } };
}

test('The supplied 431 IGC files scan without parse failures', async context => {
  const fixture = (await readdir('.', { withFileTypes: true })).find(entry => entry.isDirectory() && entry.name.startsWith('skytraxx'));
  if (!fixture) { context.skip('Private IGC archive is not included in the repository'); return; }
  const result = await scanFolder(diskDirectory(fixture.name));
  assert.equal(result.examined, 431);
  assert.equal(result.issues.filter(issue => !issue.message.startsWith('Duplicate')).length, 0);
  assert.ok(result.flights.every(flight => flight.date && flight.points.length > 0));
  const years = [...new Set(result.flights.map(flight => flight.date.slice(0, 4)))].sort();
  assert.deepEqual(years, ['2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022']);
  console.log(JSON.stringify({ suppliedFiles: result.examined, uniqueFlights: result.flights.length, duplicateFiles: result.issues.length, shortRecordings: result.flights.filter(flight => flight.durationSeconds < 60).length }));
});
