import { DEFAULT_FILTERS, DASHBOARD_METRICS, yearDates, shortcutDates, buildDashboard, openXC, validateFilters } from './dashboard-model.mjs';
import { comparison, MONTHS } from './statistics.mjs';

const $=id=>document.getElementById(id);
const node=(tag,text='',cls='')=>{const el=document.createElement(tag);el.textContent=text;el.className=cls;return el;};
const SVG='http://www.w3.org/2000/svg';
const svgNode=(tag,attrs={})=>{const el=document.createElementNS(SVG,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
export function timeText(seconds) {
  if(!Number.isFinite(seconds))return '—';
  if(seconds<0)return `−${timeText(-seconds)}`;
  if(seconds<60)return `${Math.round(seconds)} sec`;
  const minutes=Math.round(seconds/60);return minutes>=60?`${Math.floor(minutes/60)} h ${minutes%60} min`:`${minutes} min`;
}
const number=n=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:1}):'—';
const metricText=(key,value)=>key==='durationSeconds'||key==='averageSeconds'?timeText(value):`${number(value)}${key==='openXcKm'?' km':''}`;
const coverageText=s=>`${s.coverage.calculated} calculated · ${s.coverage.manual} manual · ${s.coverage.unavailable} unavailable${s.coverage.approximate?' · includes estimates':''}`;
const distanceText=s=>`${s.coverage.approximate?'≈ ':''}${metricText('openXcKm',s.openXcKm)}`;
const sourceText=f=>f.type==='manual'?'Manual':openXC(f)?.approximate?'Calculated estimate':'Calculated';

export function setupDashboard(getFlights,onChange,onInspect,onViewChange) {
  let filters={...DEFAULT_FILTERS}, view='flightbook',model=buildDashboard([]);
  const inputMap={search:'search','duration-min':'minMinutes','duration-max':'maxMinutes','xc-min':'minKm','xc-max':'maxKm'};
  function set(patch,notify=true) {filters={...filters,...patch};filters.error=validateFilters(filters)||patch.error||'';render();if(notify)onChange({sortOnly:Object.keys(patch).length===1&&Object.hasOwn(patch,'sort')});}
  function readInputs(){
    const patch={error:''};
    for(const [id,key]of Object.entries(inputMap)){
      const input=$(id);patch[key]=id==='search'?input.value:input.value===''?null:input.valueAsNumber;
      const invalid=id!=='search'&&!input.validity.valid;input.setAttribute('aria-invalid',String(invalid));
      if(invalid)patch.error='Enter finite, non-negative duration and distance values.';
    }
    if(patch.minMinutes!==null&&patch.maxMinutes!==null&&patch.minMinutes>patch.maxMinutes)patch.error='Minimum duration must not exceed maximum duration.';
    if(patch.minKm!==null&&patch.maxKm!==null&&patch.minKm>patch.maxKm)patch.error='Minimum Open XC distance must not exceed maximum distance.';
    patch.hideShort=$('hide-short').checked;set(patch);
  }
  for(const id of Object.keys(inputMap))$(id).addEventListener('input',readInputs);
  $('hide-short').addEventListener('change',readInputs);
  $('flight-sort').addEventListener('change',()=>set({sort:$('flight-sort').value}));
  $('filter-toggle').addEventListener('click',()=>{const open=$('filter-panel').hidden;$('filter-panel').hidden=!open;$('filter-toggle').setAttribute('aria-expanded',String(open));});
  for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
    if(button.dataset.preset==='custom'){set({mode:'custom',year:null,month:null});$('date-from').focus();}
    else set(shortcutDates(button.dataset.preset));
  });
  $('stats-year').addEventListener('change',()=>set($('stats-year').value?yearDates(Number($('stats-year').value)):shortcutDates('all')));
  $('stats-month').addEventListener('change',()=>{if(filters.year)set(yearDates(filters.year,$('stats-month').value?Number($('stats-month').value):null));});
  for(const id of ['date-from','date-to'])$(id).addEventListener('change',()=>{
    const from=$('date-from').value,to=$('date-to').value;
    set({from,to,mode:'custom',year:null,month:null,error:from&&to&&from>to?'From date must not be after To date.':''});
  });
  function navigate(direction){
    if(!filters.year)return;
    if(filters.month){const date=new Date(Date.UTC(filters.year,filters.month-1+direction,1));set(yearDates(date.getUTCFullYear(),date.getUTCMonth()+1));}
    else set(yearDates(filters.year+direction));
  }
  $('period-prev').addEventListener('click',()=>navigate(-1));$('period-next').addEventListener('click',()=>navigate(1));
  $('clear-filters').addEventListener('click',()=>set({...DEFAULT_FILTERS,sort:filters.sort}));
  for(const button of document.querySelectorAll('[data-minutes]'))button.addEventListener('click',()=>set({minMinutes:Number(button.dataset.minutes)}));
  for(const button of document.querySelectorAll('[data-km]'))button.addEventListener('click',()=>set({minKm:Number(button.dataset.km)}));
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>chooseView(button.dataset.view));
  for(const id of ['activity-metric-1','activity-metric-2']){
    for(const [key,label]of Object.entries(DASHBOARD_METRICS))$(id).add(new Option(label,key));
    $(id).value=id.endsWith('1')?'durationSeconds':'count';$(id).addEventListener('change',renderActivity);
  }
  function chooseView(value){
    view=value;
    $('flightbook-view').hidden=view!=='flightbook';$('statistics-view').hidden=view!=='statistics';
    for(const button of document.querySelectorAll('[data-view]')){button.setAttribute('aria-selected',String(button.dataset.view===view));button.tabIndex=button.dataset.view===view?0:-1;}
    onViewChange?.(view);
  }
  $('view-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();chooseView(event.key==='Home'?'flightbook':event.key==='End'?'statistics':view==='flightbook'?'statistics':'flightbook');document.querySelector(`[data-view="${view}"]`).focus();});
  function inspect(flight){chooseView('flightbook');onInspect(flight);$('flight-detail').scrollIntoView({block:'nearest',behavior:'smooth'});}
  function dateTitle(){return filters.mode==='all'?'All time':filters.from&&filters.to?`${filters.from} – ${filters.to}`:filters.from?`From ${filters.from}`:filters.to?`Until ${filters.to}`:'Custom dates';}
  function renderChips(){
    const chips=$('filter-chips');chips.replaceChildren();
    const chip=(text,patch)=>{const b=node('button',`${text} ×`,'filter-chip');b.type='button';b.setAttribute('aria-label',`Remove ${text} filter`);b.addEventListener('click',()=>set(patch));chips.append(b);};
    if(filters.mode!=='all')chip(dateTitle(),shortcutDates('all'));
    if(filters.search)chip(`Search: ${filters.search}`,{search:''});
    for(const [key,label,unit]of [['minMinutes','Duration ≥','min'],['maxMinutes','Duration ≤','min'],['minKm','Open XC ≥','km'],['maxKm','Open XC ≤','km']])if(filters[key]!==null)chip(`${label} ${filters[key]} ${unit}`,{[key]:null,error:''});
    if(filters.hideShort)chip('Hide recordings < 1 min',{hideShort:false});
  }
  function comparisonText(key){
    if(!model.singleYear)return 'Select a single-year period for comparisons.';
    const selected=model.comparisonSelected?.[key];
    const difference=value=>{const c=comparison(selected,value);return c.difference===null?'Unavailable':`${c.difference>0?'+':''}${metricText(key,c.difference)}${c.percent===null?'':` (${c.percent>0?'+':''}${number(c.percent)}%)`}`;};
    return `Previous year: ${model.previous?difference(model.previous[key]):'Unavailable'} · Average (${model.referenceYears.length} other years): ${difference(model.average[key])}`;
  }
  function renderSummary(){
    const s=model.summary;
    $('compact-airtime').textContent=timeText(s.durationSeconds);
    $('compact-totals').textContent=`${s.count} flights · ${s.flyingDays} flying days · ${distanceText(s)} Open XC`;
    $('compact-average').textContent=`Average flight: ${timeText(s.averageSeconds)}`;
    $('compact-coverage').textContent=coverageText(s);
    $('statistics-cards').replaceChildren();
    for(const [key,label]of [['count','Flights'],['durationSeconds','Recorded airtime'],['averageSeconds','Average flight duration'],['openXcKm','Open XC distance']]){
      const card=node('article','','summary-cell');card.append(node('small',label),node('strong',key==='openXcKm'?distanceText(s):metricText(key,s[key])),node('p',comparisonText(key),'stat-comparison'));
      if(key==='openXcKm')card.append(node('small',coverageText(s)));
      $('statistics-cards').append(card);
    }
    $('statistics-context').textContent=`${s.flyingDays} flying days · ${s.count} matching flights${model.undated?` · ${model.undated} undated flights included only in totals`:''}`;
    const notice=model.singleYear?`Comparisons use the same calendar dates and non-date filters. Average references: ${model.referenceYears.join(', ')||'none'}; the selected year and current calendar year are excluded. Current-year comparisons stop at today. Each reference year has equal weight. Unknown Open XC is excluded from distance averages; an empty matching period contributes zero.`:'All time and multi-year graphs show chronological totals. Select a single-year period for previous-year and other-year average comparisons.';
    $('statistics-note').textContent=notice;
    $('statistics-empty').hidden=s.count>0;$('statistics-empty').textContent=getFlights().length?'No flights match this selection. Adjust or clear filters.':'Connect a flight folder to get started.';
  }
  function renderActivity(){
    for(let i=1;i<=2;i++){
      const key=$(`activity-metric-${i}`).value,host=$(`activity-chart-${i}`),max=Math.max(0,...model.buckets.map(b=>b[key]).filter(Number.isFinite));
      host.replaceChildren();$(`activity-title-${i}`).textContent=`${DASHBOARD_METRICS[key]} by ${model.granularity}`;
      $(`activity-caption-${i}`).textContent=key==='openXcKm'?`Available distance only. ${coverageText(model.summary)}. Bars select dates.`:'Bars select dates. Hover or focus for exact values.';
      const bars=node('div','','activity-bars');bars.setAttribute('aria-label',`${DASHBOARD_METRICS[key]} by ${model.granularity}`);
      for(const row of model.buckets){
        const button=node('button','','activity-column');button.type='button';button.dataset.focusKey=`activity-${i}-${row.key}`;const value=row[key],label=model.granularity==='month'?MONTHS[Number(row.key.slice(5))-1].slice(0,3):model.granularity==='day'?row.key.slice(8):row.key;
        const caption=row.noArchive?`${row.key}: no recorded year in the archive`:`${row.key}: ${metricText(key,value)}${key==='openXcKm'?`. ${coverageText(row)}`:''}`;button.title=caption;button.setAttribute('aria-label',caption);
        const track=node('span','','column-track'),fill=node('span','','column-fill');fill.style.height=`${max&&Number.isFinite(value)?Math.max(2,value/max*100):0}%`;
        track.append(fill);button.append(node('span',metricText(key,value),'column-value'),track,node('span',label,'column-label'));
        button.addEventListener('click',()=>{if(model.granularity==='year')set(yearDates(Number(row.key)));else if(model.granularity==='month')set(yearDates(Number(row.key.slice(0,4)),Number(row.key.slice(5))));else set({from:row.key,to:row.key,year:null,month:null,mode:'custom'});});bars.append(button);
      }
      if(!model.buckets.length)host.append(node('p','No dated flights in this selection.','muted'));else host.append(bars);
    }
  }
  function renderCalendars(){
    const host=$('activity-calendars'), expanded=new Map([...host.querySelectorAll('.calendar-year')].map(el=>[el.dataset.year,el.open]));host.replaceChildren();
    for(const [index,calendar]of model.calendars.entries()){
      const details=node('details','','calendar-year');details.dataset.year=String(calendar.year);details.open=expanded.has(String(calendar.year))?expanded.get(String(calendar.year)):index===0;details.append(node('summary',String(calendar.year)));
      const labels=node('div','','calendar-months');for(const name of MONTHS)labels.append(node('span',name.slice(0,3)));details.append(labels);
      const grid=node('div','','calendar-grid');const offset=(new Date(`${calendar.year}-01-01T12:00:00Z`).getUTCDay()+6)%7;
      for(let j=0;j<offset;j++)grid.append(node('span','','calendar-placeholder'));
      const max=Math.max(1,...calendar.days.map(d=>d.durationSeconds));
      for(const day of calendar.days){
        const b=node('button','','calendar-day');b.type='button';b.dataset.focusKey=`day-${day.date}`;b.disabled=day.outside||day.future;
        const level=day.durationSeconds?Math.max(1,Math.ceil(day.durationSeconds/max*4)):0;b.dataset.level=level;b.classList.toggle('future',day.future);b.classList.toggle('outside',day.outside);
        const text=`${day.date}: ${timeText(day.durationSeconds)}, ${day.count} flights, ${distanceText(day)} Open XC${day.coverage.manual?' · Manual distance included':''}${day.outside?' · outside selection':''}${day.future?' · future date':''}`;
        b.title=text;b.setAttribute('aria-label',text);b.addEventListener('focus',()=>$('calendar-tooltip').textContent=text);b.addEventListener('pointerenter',()=>$('calendar-tooltip').textContent=text);
        b.addEventListener('click',()=>set({from:day.date,to:day.date,year:null,month:null,mode:'custom'}));grid.append(b);
      }
      details.append(grid);host.append(details);
    }
    if(!model.calendars.length)host.append(node('p','No dated flights to display.','muted'));
  }
  function lineChart(host,key){
    const wasOpen=!!host.querySelector('.chart-data')?.open;host.replaceChildren();
    const series=[['selected',model.progress.selected],['previous',model.progress.previous],['average',model.progress.average]].filter(([,rows])=>rows?.length);
    if(!series.length){host.append(node('p','No dated data.','muted'));return;}
    const max=Math.max(1,...series.flatMap(([,rows])=>rows.map(r=>r[key]).filter(Number.isFinite)));
    const svg=svgNode('svg',{viewBox:'0 0 640 230',role:'img','aria-label':`Cumulative ${DASHBOARD_METRICS[key]}`});
    const progressValue=row=>`${key==='openXcKm'&&row?.approximate?'≈ ':''}${metricText(key,row?.[key])}${key==='openXcKm'&&row?.manual?' · manual distance included':''}`;
    const title=svgNode('title');title.textContent=`Cumulative ${DASHBOARD_METRICS[key]}. ${series.map(([name,rows])=>`${name}: ${progressValue(rows.at(-1))}`).join('; ')}`;svg.append(title);
    for(let step=0;step<=4;step++){const y=190-step*40;svg.append(svgNode('line',{x1:70,x2:620,y1:y,y2:y,class:'plot-grid'}));const label=svgNode('text',{x:62,y:y+4,'text-anchor':'end',class:'plot-label'});label.textContent=metricText(key,max*step/4);svg.append(label);}
    for(const [name,rows]of series){
      let path='',started=false;
      rows.forEach((r,i)=>{if(!Number.isFinite(r[key])){started=false;return;}path+=`${started?'L':'M'}${70+i/Math.max(1,rows.length-1)*550},${190-r[key]/max*160} `;started=true;});
      svg.append(svgNode('path',{d:path,fill:'none',class:`progress-line ${name}`}));
    }
    const dates=model.progress.selected;
    for(const [index,x,anchor]of [[0,70,'start'],[dates.length-1,620,'end']]){const label=svgNode('text',{x,y:217,'text-anchor':anchor,class:'plot-label'});label.textContent=model.singleYear?dates[index]?.date.slice(5):dates[index]?.date;svg.append(label);}
    host.append(svg);
    const table=node('details','','chart-data');table.append(node('summary','Read exact values'));
    const tbody=node('tbody');const headers=node('tr');for(const label of ['Date','Selected','Previous year','Other-year average'])headers.append(node('th',label));tbody.append(headers);
    // Exact daily values are rendered only on demand, including long archives.
    table.addEventListener('toggle',()=>{if(!table.open||tbody.children.length>1)return;for(let i=0;i<dates.length;i++){const row=node('tr');row.append(node('td',model.singleYear?dates[i].date.slice(5):dates[i].date));for(const rows of [model.progress.selected,model.progress.previous,model.progress.average])row.append(node('td',progressValue(rows?.[i])));tbody.append(row);}});
    const element=node('table');element.append(tbody);table.append(element);host.append(table);if(wasOpen)table.open=true;
  }
  function renderProgress(){
    lineChart($('progress-time'),'durationSeconds');lineChart($('progress-xc'),'openXcKm');
    $('progress-legend').textContent=model.singleYear?`Selected · Previous year${model.previous?'':' (unavailable)'} · Other-year average${model.referenceYears.length?'':' (unavailable)'}`:'Chronological totals · select a single-year period for reference lines';
    $('progress-coverage').textContent=coverageText(model.summary);
    if([model.progress.selected,model.progress.previous,model.progress.average].some(rows=>rows?.some(row=>row.approximate))) $('progress-coverage').textContent+=' · Open XC reference curves may also include estimates';
  }
  function renderRecords(){
    const host=$('personal-bests');host.replaceChildren();
    for(const [key,label]of [['duration','Longest recorded airtime'],['distance','Longest Open XC distance']]){
      const flight=model.best[key],button=node('button','','record-row');button.type='button';button.dataset.focusKey=`record-${key}`;button.disabled=!flight;
      const value=flight?(key==='duration'?timeText(flight.durationSeconds):`${openXC(flight).approximate?'≈ ':''}${number(openXC(flight).distanceKm)} km · ${sourceText(flight)}`):'Unavailable';
      button.append(node('strong',label),node('span',value),node('small',flight?`${flight.date||'Undated'} · ${flight.site||'Unnamed site'} →`:''));
      if(flight)button.addEventListener('click',()=>inspect(flight));host.append(button);
    }
  }
  function renderAdvanced(){
    for(const [kind,id,unit]of [['duration','duration-distribution','min'],['distance','xc-distribution','km']]){
      const host=$(id),rows=model.distributions[kind],max=Math.max(1,...rows.map(r=>r.count));host.replaceChildren();
      for(const row of rows){const line=node('div','','distribution-row'),label=Number.isFinite(row.to)?`${row.from}–<${row.to} ${unit}`:`${row.from}+ ${unit}`,track=node('span','','distribution-track'),fill=node('i');fill.style.width=`${row.count/max*100}%`;track.append(fill);line.append(node('span',label),track,node('strong',String(row.count)));host.append(line);}
    }
    $('advanced-coverage').textContent=`Distance plots include ${model.summary.coverage.known} of ${model.summary.count} flights. ${coverageText(model.summary)}.`;
    const host=$('xc-scatter');host.replaceChildren();
    const svg=svgNode('svg',{viewBox:'0 0 640 280',role:'group','aria-label':'Recorded airtime versus Open XC distance; points open flights'});
    const maxX=Math.max(1,...model.scatter.map(p=>p.minutes)),maxY=Math.max(1,...model.scatter.map(p=>p.distanceKm));
    svg.append(svgNode('line',{x1:70,x2:620,y1:220,y2:220,class:'plot-grid'}),svgNode('line',{x1:70,x2:70,y1:20,y2:220,class:'plot-grid'}));
    for(let i=0;i<=4;i++){
      const x=svgNode('text',{x:70+i/4*550,y:240,'text-anchor':'middle',class:'plot-label'});x.textContent=number(maxX*i/4);svg.append(x);
      const y=svgNode('text',{x:60,y:225-i/4*200,'text-anchor':'end',class:'plot-label'});y.textContent=number(maxY*i/4);svg.append(y);
    }
    const xlabel=svgNode('text',{x:345,y:270,'text-anchor':'middle',class:'plot-label'});xlabel.textContent='Recorded airtime (minutes)';svg.append(xlabel);
    const ylabel=svgNode('text',{x:10,y:15,class:'plot-label'});ylabel.textContent='Open XC (km)';svg.append(ylabel);
    for(const point of model.scatter){
      const title=`${point.flight.date||'Undated'} · ${point.flight.site||'Unnamed site'}: ${timeText(point.flight.durationSeconds)}, ${point.approximate?'≈ ':''}${number(point.distanceKm)} km · ${sourceText(point.flight)}`;
      const circle=svgNode('circle',{cx:70+point.minutes/maxX*550,cy:220-point.distanceKm/maxY*200,r:5,class:`scatter-point ${point.source}`,tabindex:0,role:'button','aria-label':title,'data-focus-key':`scatter-${point.flight.key||point.flight.path}`});const tip=svgNode('title');tip.textContent=title;circle.append(tip);
      circle.addEventListener('click',()=>inspect(point.flight));circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspect(point.flight);}});circle.addEventListener('focus',()=>$('scatter-tooltip').textContent=title);circle.addEventListener('pointerenter',()=>$('scatter-tooltip').textContent=title);svg.append(circle);
    }
    host.append(svg);
  }
  function render(){
    const focusKey=document.activeElement?.dataset?.focusKey;
    model=buildDashboard(getFlights(),filters);
    for(const [id,key]of Object.entries(inputMap))if(document.activeElement!==$(id))$(id).value=filters[key]??'';
    $('hide-short').checked=filters.hideShort;$('flight-sort').value=filters.sort;
    const year=$('stats-year'), choices=[...model.years].reverse();if(filters.year&&!model.years.includes(filters.year))choices.push(filters.year);
    if([...year.options].map(o=>o.value).join('|')!==['',...choices].join('|')){year.replaceChildren(new Option('All recorded years',''));choices.forEach(y=>year.add(new Option(String(y),String(y))));}year.value=filters.year??'';
    const month=$('stats-month');if(month.options.length===1)MONTHS.forEach((name,i)=>month.add(new Option(name,String(i+1))));month.value=filters.month??'';month.disabled=!filters.year;
    if(document.activeElement!==$('date-from'))$('date-from').value=filters.from;if(document.activeElement!==$('date-to'))$('date-to').value=filters.to;$('custom-dates').hidden=filters.mode!=='custom';
    $('period-prev').disabled=!filters.year;$('period-next').disabled=!filters.year;
    $('stats-period').textContent=dateTitle();$('library-period').textContent=dateTitle();
    for(const button of document.querySelectorAll('[data-preset]'))button.setAttribute('aria-pressed',String(button.dataset.preset===filters.mode));
    $('filter-summary').textContent=filters.error||`${model.summary.count} of ${getFlights().length} flights match · shared across both views and maps`;
    $('filter-summary').classList.toggle('filter-error',!!filters.error);
    renderChips();renderSummary();renderActivity();renderCalendars();renderProgress();renderRecords();
    if($('advanced-statistics').open)renderAdvanced();
    if(focusKey){const element=[...document.querySelectorAll('[data-focus-key]')].find(el=>el.dataset.focusKey===focusKey);if(element&&!element.disabled)element.focus({preventScroll:true});}
  }
  $('advanced-statistics').addEventListener('toggle',()=>{if($('advanced-statistics').open)renderAdvanced();});
  render();chooseView(view);
  return {refresh:()=>render(),reset:()=>set({...DEFAULT_FILTERS}),inspect,chooseView,get filters(){return {...filters};},get model(){return model;},get visible(){return model.selected;},get view(){return view;}};
}
