import { buildStatistics, comparison, MONTHS, METRICS } from './statistics.mjs';

const $ = id => document.getElementById(id);
const node = (tag, text = '', className = '') => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
const hours = value => `${(value / 3600).toLocaleString(undefined, { maximumFractionDigits: 1 })} h`;
function format(key, value) {
  if (!Number.isFinite(value)) return '—';
  if (key.endsWith('Seconds')) return hours(value);
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${key === 'distanceKm' ? ' km' : ''}`;
}
function delta(key, value, baseline) {
  const { difference, percent } = comparison(value, baseline);
  if (difference === null) return 'Unavailable';
  if (!difference) return 'No change';
  return `${difference > 0 ? '+' : '−'}${format(key, Math.abs(difference))}${percent === null ? ' (baseline zero)' : ` (${percent > 0 ? '+' : ''}${percent.toFixed(0)}%)`}`;
}

export function setupStatistics(getFlights, onPeriodChange) {
  const filters = { year: null, month: null, metric: 'durationSeconds' };
  let model = buildStatistics([]);
  function choose(year, month = null) {
    filters.year = year; filters.month = month;
    render(); onPeriodChange({ ...filters });
  }
  $('stats-year').addEventListener('change', () => choose($('stats-year').value ? Number($('stats-year').value) : null));
  $('stats-month').addEventListener('change', () => choose(filters.year, $('stats-month').value ? Number($('stats-month').value) : null));
  $('stats-metric').addEventListener('change', () => { filters.metric = $('stats-metric').value; render(); });
  $('stats-reset').addEventListener('click', () => choose(null));

  function chartBar(key, value, max, className, label) {
    const track = node('div', '', 'bar-track');
    const fill = node('div', '', `chart-fill ${className}`);
    fill.style.width = `${Number.isFinite(value) && max > 0 ? Math.max(0, value / max * 100) : 0}%`;
    track.append(fill); track.title = `${label}: ${format(key, value)}`; track.setAttribute('aria-hidden', 'true');
    return track;
  }
  function render() {
    const flights = getFlights();
    model = buildStatistics(flights, filters.year, filters.month);
    if (filters.year !== null && !model.years.includes(filters.year)) { filters.year = null; filters.month = null; model = buildStatistics(flights); }
    const yearSelect = $('stats-year');
    yearSelect.replaceChildren(new Option('All years', ''));
    [...model.years].reverse().forEach(year => yearSelect.add(new Option(String(year), String(year))));
    yearSelect.value = filters.year ?? '';
    const monthSelect = $('stats-month');
    if (monthSelect.options.length === 1) MONTHS.forEach((name, index) => monthSelect.add(new Option(name, String(index + 1))));
    monthSelect.disabled = filters.year === null; monthSelect.value = filters.month ?? '';
    $('stats-period').textContent = filters.year === null ? 'Your flying, across the years' : `${filters.month ? `${MONTHS[filters.month - 1]} ` : ''}${filters.year}`;
    const summary = model.selected;
    const cards = node('div', '', 'statistics-cards');
    for (const [key, label] of [...Object.entries(METRICS).map(([key, value]) => [key, value.label]), ['averageSeconds', 'Average flight'], ['longestSeconds', 'Longest flight']]) {
      const card = node('article', '', 'panel statistic-card');
      card.append(node('small', label), node('strong', format(key, summary[key])));
      if (filters.year !== null) card.append(node('p', `${filters.year - 1}: ${model.previous ? format(key, model.previous[key]) : 'No recorded year'} · ${delta(key, summary[key], model.previous?.[key])}`, 'stat-comparison'));
      const medianLabel = filters.month ? `Median ${MONTHS[filters.month - 1]}` : 'Median year';
      card.append(node('p', `${medianLabel}: ${format(key, model.median[key])}${filters.year === null ? '' : ` · ${delta(key, summary[key], model.median[key])}`}`, 'stat-comparison'));
      if (key === 'distanceKm') card.append(node('p', `${summary.trackedCount} of ${summary.count} flights have GPS distance`, 'stat-footnote'));
      cards.append(card);
    }
    $('statistics-cards').replaceChildren(...cards.children);
    const key = filters.metric;
    $('annual-heading').textContent = `${METRICS[key].label} by year`;
    const annualMax = Math.max(0, ...model.yearly.map(row => row[key]).filter(Number.isFinite));
    const annualMedian = model.yearly.length ? buildStatistics(flights).median[key] : null;
    $('annual-caption').textContent = `Median year: ${format(key, annualMedian)}. Click a year to explore it.`;
    const annual = document.createDocumentFragment();
    for (const row of model.yearly) {
      const button = node('button', '', `chart-row${filters.year === row.year ? ' active' : ''}`);
      button.type = 'button'; button.setAttribute('aria-label', `${row.year}: ${format(key, row[key])}. Show year.`);
      button.append(node('span', String(row.year), 'chart-label'), chartBar(key, row[key], annualMax, 'selected-bar', String(row.year)), node('span', format(key, row[key]), 'chart-value'));
      if (annualMax > 0 && Number.isFinite(annualMedian)) {
        const line = node('span', '', 'median-line'); line.style.left = `${annualMedian / annualMax * 100}%`; button.querySelector('.bar-track').append(line);
      }
      button.addEventListener('click', () => choose(row.year)); annual.append(button);
    }
    $('annual-chart').replaceChildren(annual);
    $('monthly-heading').textContent = filters.year === null ? 'Your typical month' : `${filters.year} month by month`;
    $('monthly-caption').textContent = filters.year === null ? `Median ${METRICS[key].label.toLowerCase()} for each calendar month across recorded years.` : `${METRICS[key].label}: ${filters.year}, ${filters.year - 1}${model.previous ? '' : ' (unavailable)'}, and the median for each calendar month. Click a month to filter flights.`;
    $('monthly-legend').hidden = filters.year === null;
    $('legend-selected').textContent = filters.year ?? '';
    $('legend-previous').textContent = filters.year === null ? '' : filters.year - 1;
    const monthlyMax = Math.max(0, ...model.monthly.flatMap(row => [row.selected?.[key], row.previous?.[key], row.median[key]]).filter(Number.isFinite));
    const monthly = document.createDocumentFragment();
    for (const row of model.monthly) {
      const button = node(filters.year === null ? 'div' : 'button', '', `month-row${filters.month === row.month ? ' active' : ''}`);
      if (filters.year !== null) { button.type = 'button'; button.addEventListener('click', () => choose(filters.year, row.month)); }
      button.append(node('span', row.name.slice(0, 3), 'chart-label'));
      const bars = node('div', '', 'month-bars');
      const values = filters.year === null ? [[row.median[key], 'median-bar', 'Median']] : [[row.selected[key], 'selected-bar', String(filters.year)], [row.previous?.[key], 'previous-bar', String(filters.year - 1)], [row.median[key], 'median-bar', 'Median']];
      for (const [value, cls, label] of values) bars.append(chartBar(key, value, monthlyMax, cls, label));
      button.append(bars, node('span', format(key, filters.year === null ? row.median[key] : row.selected[key]), 'chart-value'));
      button.setAttribute('aria-label', `${row.name}: ${values.map(([value, , label]) => `${label} ${format(key, value)}`).join(', ')}`);
      monthly.append(button);
    }
    $('monthly-chart').replaceChildren(monthly);
    const note = `Based on ${model.years.length} recorded years. Comparisons use complete calendar periods as represented by loaded files, not matched year-to-date periods. Missing years are unavailable; empty months in recorded years count as zero. The median includes the selected year. ${model.undatedCount ? `${model.undatedCount} undated flights appear only in all-time totals. ` : ''}Manual flights contribute time and flight counts; GPS distance includes tracked flights only. Short recordings remain included.`;
    $('statistics-note').textContent = note;
    $('statistics-empty').hidden = flights.length > 0;
    $('statistics-content').hidden = flights.length === 0;
  }
  render();
  return { refresh: () => { render(); onPeriodChange({ ...filters }); }, get filters() { return { ...filters }; }, get model() { return model; } };
}
