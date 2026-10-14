export function filterFlights(flights, filters = {}) {
  const { search = '', minMinutes = null, maxMinutes = null, minKm = null, maxKm = null, xcType = 'open', sort = 'date' } = filters;
  const text = search.trim().toLocaleLowerCase();
  const bounded = (value, min, max) => min === null && max === null || Number.isFinite(value) && (min === null || value >= min) && (max === null || value <= max);
  const result = flights.filter(flight =>
    [flight.date, flight.site, flight.wing, flight.path].join(' ').toLocaleLowerCase().includes(text) &&
    bounded(flight.durationSeconds / 60, minMinutes, maxMinutes) &&
    bounded(flight.xc?.[xcType]?.distanceKm, minKm, maxKm));
  if (sort === 'duration') result.sort((a, b) => b.durationSeconds - a.durationSeconds || a.path.localeCompare(b.path));
  else if (sort === 'xc') result.sort((a, b) => (b.xc?.[xcType]?.distanceKm ?? -1) - (a.xc?.[xcType]?.distanceKm ?? -1) || a.path.localeCompare(b.path));
  else result.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.path.localeCompare(b.path));
  return result;
}
