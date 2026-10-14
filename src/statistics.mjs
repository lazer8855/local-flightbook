import { validDate } from './flights.mjs';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const METRICS = {
  count: { label: 'Flights', unit: 'flights' },
  durationSeconds: { label: 'Recorded time', unit: 'hours' },
  distanceKm: { label: 'GPS track distance', unit: 'km' },
  flyingDays: { label: 'Flying days', unit: 'days' }
};

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarise(flights) {
  const tracked = flights.filter(flight => Number.isFinite(flight.distanceKm));
  const seconds = flights.reduce((sum, flight) => sum + flight.durationSeconds, 0);
  return {
    count: flights.length,
    durationSeconds: seconds,
    distanceKm: tracked.length ? tracked.reduce((sum, flight) => sum + flight.distanceKm, 0) : (flights.length ? null : 0),
    trackedCount: tracked.length,
    flyingDays: new Set(flights.filter(flight => validDate(flight.date)).map(flight => flight.date)).size,
    averageSeconds: flights.length ? seconds / flights.length : null,
    longestSeconds: flights.length ? flights.reduce((longest, flight) => Math.max(longest, flight.durationSeconds), 0) : null
  };
}

export function inPeriod(flight, year = null, month = null) {
  return validDate(flight.date) && (year === null || Number(flight.date.slice(0, 4)) === year) && (month === null || Number(flight.date.slice(5, 7)) === month);
}

export function buildStatistics(flights, year = null, month = null) {
  const dated = flights.filter(flight => validDate(flight.date));
  const years = [...new Set(dated.map(flight => Number(flight.date.slice(0, 4))))].sort((a, b) => a - b);
  const period = (y, m = null) => summarise(dated.filter(flight => inPeriod(flight, y, m)));
  const yearly = years.map(y => ({ year: y, ...period(y) }));
  const baseline = month === null ? yearly : years.map(y => period(y, month));
  const medianSummary = Object.fromEntries([...Object.keys(METRICS), 'averageSeconds', 'longestSeconds'].map(key => [key, median(baseline.map(summary => summary[key]).filter(Number.isFinite))]));
  const monthly = MONTHS.map((name, i) => {
    const m = i + 1;
    const medians = Object.fromEntries(Object.keys(METRICS).map(key => [key, median(years.map(y => period(y, m)[key]).filter(Number.isFinite))]));
    return { month: m, name, selected: year === null ? null : period(year, m), previous: year !== null && years.includes(year - 1) ? period(year - 1, m) : null, median: medians };
  });
  return { years, yearly, monthly, selected: summarise(year === null ? flights : dated.filter(flight => inPeriod(flight, year, month))), previous: year !== null && years.includes(year - 1) ? period(year - 1, month) : null, median: medianSummary, undatedCount: flights.length - dated.length };
}

export function comparison(value, baseline) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return { difference: null, percent: null };
  const difference = value - baseline;
  return { difference, percent: baseline === 0 ? (value === 0 ? 0 : null) : difference / baseline * 100 };
}
