import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics, comparison, average } from '../src/statistics.mjs';

const flight = (date, hours = 1, distanceKm = 10) => ({ date, durationSeconds: hours * 3600, distanceKm });
const fixtures = [flight('2020-06-01', 1), flight('2020-06-01', 2), flight('2020-07-01', 3), flight('2021-06-01', 4), flight('2022-07-01', 5), flight(null, 2), flight('2022-07-01', 1, null)];

test('All-time summary includes undated/manual flights; annual average uses recorded years', () => {
  const stats = buildStatistics(fixtures);
  assert.deepEqual(stats.years, [2020, 2021, 2022]);
  assert.equal(stats.selected.count, 7); assert.equal(stats.selected.durationSeconds, 18 * 3600);
  assert.equal(stats.selected.flyingDays, 4); assert.equal(stats.selected.trackedCount, 6);
  assert.equal(stats.undatedCount, 1); assert.equal(stats.average.count, 2);
  assert.equal(stats.average.durationSeconds, (6 + 4 + 6) * 3600 / 3);
});

test('Calendar year and same-month comparison use the immediately previous year', () => {
  const year = buildStatistics(fixtures, 2021);
  assert.equal(year.selected.count, 1); assert.equal(year.previous.count, 3);
  const month = buildStatistics(fixtures, 2021, 6);
  assert.equal(month.selected.durationSeconds, 4 * 3600);
  assert.equal(month.previous.durationSeconds, 3 * 3600);
  assert.equal(month.average.durationSeconds, (3 + 4 + 0) * 3600 / 3);
  assert.equal(month.monthly[5].average.durationSeconds, (3 + 4 + 0) * 3600 / 3);
  assert.equal(month.monthly.length, 12);
  assert.equal(month.monthly[5].selected.count, 1);
  assert.equal(month.monthly[5].previous.count, 2);
});

test('Empty months contribute zeros, while missing years are unavailable', () => {
  const stats = buildStatistics([flight('2020-06-01'), flight('2022-07-01')], 2022, 6);
  assert.equal(stats.previous, null);
  assert.equal(stats.selected.count, 0);
  assert.equal(stats.average.count, 0.5);
  assert.equal(stats.monthly[0].average.count, 0);
  assert.equal(stats.monthly[5].previous, null);
});

test('Unknown GPS distance is not invented for manual-only periods', () => {
  const stats = buildStatistics([flight('2020-06-01', 1, null), flight('2021-06-01', 2, 30)], 2020, 6);
  assert.equal(stats.selected.distanceKm, null);
  assert.equal(stats.average.distanceKm, 30);
  assert.equal(stats.monthly[0].average.distanceKm, 0);
});

test('Zero/missing baselines avoid infinite percentages; averages use every value', () => {
  assert.deepEqual(comparison(2, 0), { difference: 2, percent: null });
  assert.deepEqual(comparison(0, 0), { difference: 0, percent: 0 });
  assert.deepEqual(comparison(2, null), { difference: null, percent: null });
  assert.deepEqual(comparison(3, 2), { difference: 1, percent: 50 });
  assert.equal(average([4, 1, 3, 2]), 2.5); assert.equal(average([]), null);
  assert.equal(average([1, 1, 10]), 4);
  const empty = buildStatistics([]);
  assert.equal(empty.selected.count, 0); assert.equal(empty.average.count, null);
});
