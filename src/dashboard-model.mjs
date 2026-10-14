import { validDate } from './flights.mjs';
import { filterFlights } from './flight-filters.mjs';

export const DEFAULT_FILTERS = { search: '', from: '', to: '', year: null, month: null, mode: 'all', minMinutes: null, maxMinutes: null, minKm: null, maxKm: null, hideShort: false, sort: 'date', xcType: 'open', error: '' };
export const DASHBOARD_METRICS = { durationSeconds: 'Recorded airtime', count: 'Flights', openXcKm: 'Open XC distance', flyingDays: 'Flying days' };
export const dateISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mean = values => { const known = values.filter(Number.isFinite); return known.length ? known.reduce((a,b) => a+b,0)/known.length : null; };
export const monthEnd = (year, month) => new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
export function yearDates(year, month = null) {
  return { from: `${year}-${String(month || 1).padStart(2,'0')}-01`, to: month ? monthEnd(year,month) : `${year}-12-31`, year, month, mode: month ? 'month' : 'year' };
}
export function shortcutDates(mode, today = dateISO(new Date())) {
  const year = Number(today.slice(0,4)), month = Number(today.slice(5,7));
  if (mode === 'all') return { from:'',to:'',year:null,month:null,mode };
  if (mode === 'this-year') return { ...yearDates(year), to:today, mode };
  if (mode === 'last-year') return { ...yearDates(year-1), mode };
  if (mode === 'this-month') return { ...yearDates(year,month), to:today, mode };
  if (mode === 'last-30') return { from:addDays(today,-29),to:today,year:null,month:null,mode };
  return { from:'',to:'',year:null,month:null,mode:'custom' };
}
export function shiftYear(date, year) {
  const month = Number(date.slice(5,7)), day = Number(date.slice(8,10));
  return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,Number(monthEnd(year,month).slice(8)))).padStart(2,'0')}`;
}
export function openXC(flight) {
  if (flight.type === 'manual') return Number.isFinite(flight.openXcDistanceKm) && flight.openXcDistanceKm >= 0 ? { distanceKm:flight.openXcDistanceKm, source:'manual', approximate:false } : null;
  const value = flight.xc?.open;
  return Number.isFinite(value?.distanceKm) && value.distanceKm >= 0 ? { ...value,source:'calculated',approximate:!value.optimal } : null;
}
export function summary(flights) {
  let distance = 0, calculated = 0, manual = 0, approximate = 0;
  for (const flight of flights) { const value=openXC(flight); if (!value) continue; distance+=value.distanceKm; value.source==='manual' ? manual++ : calculated++; if (value.approximate) approximate++; }
  const durationSeconds=flights.reduce((total,f)=>total+f.durationSeconds,0);
  const known=calculated+manual;
  return { count:flights.length,durationSeconds,averageSeconds:flights.length?durationSeconds/flights.length:null,
    flyingDays:new Set(flights.filter(f=>validDate(f.date)).map(f=>f.date)).size,
    openXcKm:known?distance:flights.length?null:0,
    coverage:{total:flights.length,known,calculated,manual,unavailable:flights.length-known,approximate} };
}
export function selectFlights(flights, filters) { return filterFlights(flights, { ...DEFAULT_FILTERS,...filters,xcType:'open' }); }
export function validateFilters(filters) {
  if (filters.from && !validDate(filters.from) || filters.to && !validDate(filters.to)) return 'Enter valid From and To dates.';
  if (filters.from && filters.to && filters.from > filters.to) return 'From date must not be after To date.';
  for (const key of ['minMinutes','maxMinutes','minKm','maxKm']) if (filters[key] !== null && filters[key] !== undefined && (!Number.isFinite(filters[key]) || filters[key] < 0)) return 'Enter finite, non-negative duration and distance values.';
  if (filters.minMinutes !== null && filters.maxMinutes !== null && filters.minMinutes > filters.maxMinutes) return 'Minimum duration must not exceed maximum duration.';
  if (filters.minKm !== null && filters.maxKm !== null && filters.minKm > filters.maxKm) return 'Minimum Open XC distance must not exceed maximum distance.';
  return '';
}
export function daysBetween(from,to) {
  const result=[];
  if (!validDate(from)||!validDate(to)||from>to) return result;
  for (let date=from;date<=to;date=addDays(date,1)) result.push(date);
  return result;
}
function rangeOf(flights,filters) {
  const dates=flights.filter(f=>validDate(f.date)).map(f=>f.date).sort();
  return { from:filters.from||dates[0]||null,to:filters.to||dates.at(-1)||null };
}
function buckets(flights,range,granularity) {
  const entries=new Map();
  if (granularity==='day') for (const date of daysBetween(range.from,range.to)) entries.set(date,[]);
  else if (range.from && range.to) {
    const first=Number(range.from.slice(0,4)),last=Number(range.to.slice(0,4));
    for(let year=first;year<=last;year++) {
      if(granularity==='year') entries.set(String(year),[]);
      else for(let m=1;m<=12;m++) { const key=`${year}-${String(m).padStart(2,'0')}`; if(key>=range.from.slice(0,7)&&key<=range.to.slice(0,7)) entries.set(key,[]); }
    }
  }
  for(const f of flights){if(!validDate(f.date))continue;const key=f.date.slice(0,granularity==='day'?10:granularity==='month'?7:4);if(!entries.has(key))entries.set(key,[]);entries.get(key).push(f);}
  return [...entries].sort(([a],[b])=>a.localeCompare(b)).map(([key,items])=>({key,...summary(items)}));
}
function cumulative(flights,dates) {
  const groups=new Map();
  for(const flight of flights){if(!validDate(flight.date))continue;if(!groups.has(flight.date))groups.set(flight.date,[]);groups.get(flight.date).push(flight);}
  let durationSeconds=0,openXcKm=0,known=0,approximate=0,manual=0;
  const unknownOnly=flights.length>0&&!flights.some(f=>openXC(f));
  return dates.map(date=>{for(const f of groups.get(date)||[]){durationSeconds+=f.durationSeconds;const value=openXC(f);if(value){openXcKm+=value.distanceKm;known++;if(value.approximate)approximate++;if(value.source==='manual')manual++;}}
    return {date,durationSeconds,openXcKm:known||!unknownOnly?openXcKm:null,approximate,manual};});
}
const durationBands=[0,1,10,30,60,120,240,Infinity],xcBands=[0,1,5,20,50,100,200,Infinity];
function distribution(flights,bounds,value) {
  return bounds.slice(0,-1).map((from,i)=>({from,to:bounds[i+1],count:flights.filter(f=>{const n=value(f);return Number.isFinite(n)&&n>=from&&n<bounds[i+1];}).length}));
}
export function buildDashboard(flights, input={}, today=dateISO(new Date())) {
  const filters={...DEFAULT_FILTERS,...input};
  filters.error = validateFilters(filters) || filters.error;
  const selected=selectFlights(flights,filters);
  if ((filters.from || filters.to) && filters.mode === 'all') filters.mode = 'custom';
  const years=[...new Set(flights.filter(f=>validDate(f.date)).map(f=>Number(f.date.slice(0,4))))].sort((a,b)=>a-b);
  const range=rangeOf(selected,filters), singleYear=range.from&&range.to&&range.from.slice(0,4)===range.to.slice(0,4)&&filters.mode!=='all';
  const rangeDays=daysBetween(range.from,range.to).length;
  const granularity=filters.mode==='all'?'year':rangeDays>0&&rangeDays<=31?'day':singleYear?'month':'year';
  const selectedYear=singleYear?Number(range.from.slice(0,4)):null,currentYear=Number(today.slice(0,4));
  const referenceYears=singleYear?years.filter(y=>y<currentYear&&y!==selectedYear):[];
  const cutoff=singleYear&&selectedYear===currentYear&&range.to>today?today:range.to;
  const periodFor=year=>selectFlights(flights,{...filters,from:shiftYear(range.from,year),to:shiftYear(cutoff,year)});
  const previous=singleYear&&years.includes(selectedYear-1)?summary(periodFor(selectedYear-1)):null;
  const referenceSummaries=referenceYears.map(y=>summary(periodFor(y)));
  const average=Object.fromEntries(['count','durationSeconds','averageSeconds','openXcKm','flyingDays'].map(key=>[key,mean(referenceSummaries.map(s=>s[key]))]));
  const comparisonSelected=singleYear?summary(selectFlights(flights,{...filters,to:cutoff})):null;
  const datedSelected=selected.filter(f=>validDate(f.date));
  const calendarYears=years.filter(year=>(!filters.from||year>=Number(filters.from.slice(0,4)))&&(!filters.to||year<=Number(filters.to.slice(0,4))));
  if(singleYear&&!calendarYears.includes(selectedYear))calendarYears.push(selectedYear);
  const byDay=new Map();for(const f of datedSelected){if(!byDay.has(f.date))byDay.set(f.date,[]);byDay.get(f.date).push(f);}
  const calendars=calendarYears.sort((a,b)=>b-a).map(year=>({year,days:daysBetween(`${year}-01-01`,`${year}-12-31`).map(date=>({date,...summary(byDay.get(date)||[]),outside:!!(filters.from&&date<filters.from||filters.to&&date>filters.to),future:date>today}))}));
  let progress;
  if(singleYear){
    // A leap-year calendar supplies a common month/day axis without March drift.
    const canonical=daysBetween(shiftYear(range.from,2000),shiftYear(cutoff,2000));
    const series=year=>{
      const from=shiftYear(range.from,year),to=shiftYear(cutoff,year),rows=cumulative(periodFor(year),daysBetween(from,to)),lookup=new Map(rows.map(r=>[r.date.slice(5),r]));
      let last={durationSeconds:0,openXcKm:null,approximate:0,manual:0};
      return canonical.map(date=>{last=lookup.get(date.slice(5))||last;return {...last,date,label:date.slice(5)};});
    };
    const references=referenceYears.map(series), current=series(selectedYear);
    const averaged=references.length?canonical.map((date,i)=>({date,durationSeconds:mean(references.map(r=>r[i].durationSeconds)),openXcKm:mean(references.map(r=>r[i].openXcKm)),approximate:references.some(r=>r[i].approximate)?1:0,manual:references.reduce((n,r)=>n+r[i].manual,0)})):null;
    progress={selected:current,previous:previous?series(selectedYear-1):null,average:averaged};
  }else progress={selected:cumulative(datedSelected,daysBetween(range.from,range.to)),previous:null,average:null};
  const best=value=>selected.filter(f=>Number.isFinite(value(f))).sort((a,b)=>value(b)-value(a)||(a.date||'').localeCompare(b.date||'')||a.path.localeCompare(b.path))[0]||null;
  const scatter=selected.filter(f=>openXC(f)).map(f=>({flight:f,minutes:f.durationSeconds/60,...openXC(f)}));
  const activityBuckets=buckets(selected,range,granularity).map(row=>granularity==='year'&&!years.includes(Number(row.key))?{...row,count:null,durationSeconds:null,openXcKm:null,flyingDays:null,noArchive:true}:row);
  return {filters,years,selected,summary:summary(selected),range,singleYear,selectedYear,granularity,buckets:activityBuckets,calendars,
    previous,average,comparisonSelected,referenceYears,progress,undated:selected.length-datedSelected.length,
    best:{duration:best(f=>f.durationSeconds),distance:best(f=>openXC(f)?.distanceKm)},
    distributions:{duration:distribution(selected,durationBands,f=>f.durationSeconds/60),distance:distribution(selected,xcBands,f=>openXC(f)?.distanceKm)},scatter};
}
