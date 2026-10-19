import {analyseFlight,fixTime,nearestTime,sampleIndices} from './flight-analysis.mjs';
const $=id=>document.getElementById(id),SVG='http://www.w3.org/2000/svg';
const svg=(tag,attrs={})=>{const node=document.createElementNS(SVG,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
const format=(value,unit,digits=0)=>Number.isFinite(value)?`${value.toFixed(digits)} ${unit}`:'Unavailable';
export function setupFlightAnalysis(onCursor,getTerrain){
  let flight=null,analysis={rows:[]},index=0,samples=[],elevations=new Map(),request=null,cursorRequest=null,timer=null,revision=0,terrainObject=null;
  const range=$('flight-timeline'),host=$('flight-profile');
  function readings(){
    const row=analysis.rows[index];if(!row)return;
    const ground=elevations.get(index),agl=Number.isFinite(ground)&&Number.isFinite(row.gpsAltitude)?row.gpsAltitude-ground:null;
    const values={'moment-time':fixTime(flight,row),'moment-gps':format(row.gpsAltitude,'m'),'moment-baro':format(row.pressureAltitude,'m'),'moment-ground':format(ground,'m'),'moment-agl':format(agl,'m'),'moment-climb':format(row.verticalSpeed,'m/s',1),'moment-speed':format(row.groundSpeedKmh,'km/h',1)};
    for(const [id,text]of Object.entries(values))$(id).textContent=text;
    $('moment-time').title=flight.date?new Date(Date.parse(`${flight.date}T00:00:00Z`)+row.time*1000).toLocaleString()+' local time':'';
    $('moment-climb-source').textContent=`10 s smoothed ${analysis.rateSource} vertical speed`;
    range.setAttribute('aria-valuetext',`${values['moment-time']}; GPS ${values['moment-gps']}; climb/sink ${values['moment-climb']}; ground speed ${values['moment-speed']}`);
    const first=analysis.rows[0].time,last=analysis.rows.at(-1).time,x=60+(row.time-first)/Math.max(1,last-first)*Math.max(1,(host.clientWidth||900)-80);
    host.querySelector('#profile-cursor')?.setAttribute('x1',x);host.querySelector('#profile-cursor')?.setAttribute('x2',x);
  }
  function select(value){
    if(!analysis.rows.length)return;
    index=Math.max(0,Math.min(analysis.rows.length-1,Math.round(value)));range.value=index;
    readings();onCursor(analysis.rows[index]);clearTimeout(timer);cursorRequest?.abort();
    const terrain=getTerrain();
    if(!terrain||elevations.has(index))return;
    const selected=index,current=revision;timer=setTimeout(async()=>{
      cursorRequest=new AbortController();
      try{const [height]=await terrain.sample([analysis.rows[selected]],cursorRequest.signal);if(current===revision&&terrain===getTerrain()){elevations.set(selected,height);if(index===selected)readings();}}
      catch(error){if(error.name!=='AbortError'&&current===revision)$('profile-terrain-status').textContent=`Terrain reading unavailable: ${error.message}`;}
    },90);
  }
  range.addEventListener('input',()=>select(Number(range.value)));
  function pointer(event){
    if(!analysis.rows.length||event.pointerType==='touch'&&event.type==='pointermove'&&!event.buttons)return;
    const rect=host.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(event.clientX-rect.left-60)/Math.max(1,rect.width-80)));
    select(nearestTime(analysis.rows,analysis.rows[0].time+fraction*(analysis.rows.at(-1).time-analysis.rows[0].time)));
  }
  host.addEventListener('pointermove',pointer);host.addEventListener('pointerdown',event=>{pointer(event);if(analysis.rows.length)host.setPointerCapture(event.pointerId);});
  function chart(){
    host.replaceChildren();if(!analysis.rows.length)return;
    const rows=analysis.rows;
    const meaningfulBaro=rows.some(p=>Number.isFinite(p.pressureAltitude)&&p.pressureAltitude!==0);
    const heights=[...rows.flatMap(p=>meaningfulBaro?[p.gpsAltitude,p.pressureAltitude]:[p.gpsAltitude]),...samples.map(p=>p.ground)].filter(Number.isFinite);
    const limits=heights.reduce((a,h)=>[Math.min(a[0],h),Math.max(a[1],h)],[Infinity,-Infinity]);
    const min=Number.isFinite(limits[0])?Math.floor(limits[0]/100)*100:0,max=Math.max(min+100,Number.isFinite(limits[1])?Math.ceil(limits[1]/100)*100:100);
    const width=host.clientWidth||900,height=host.clientHeight||190,bottom=height-40;
    const first=rows[0].time,last=rows.at(-1).time,x=t=>60+(t-first)/Math.max(1,last-first)*(width-80),y=h=>bottom-(h-min)/(max-min)*(height-60);
    const plot=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':'Altitude over recorded UTC time. Use the slider below to inspect each GPS fix.'});
    const title=svg('title');title.textContent='GPS altitude (blue), barometric altitude (orange), approximate terrain elevation (grey). Gaps over 30 seconds are not connected.';plot.append(title);
    for(let i=0;i<=4;i++){const altitude=min+(max-min)*i/4,py=y(altitude);plot.append(svg('line',{x1:60,x2:width-20,y1:py,y2:py,class:'plot-grid'}));const label=svg('text',{x:54,y:py+4,'text-anchor':'end',class:'plot-label'});label.textContent=`${Math.round(altitude)} m`;plot.append(label);}
    function path(points,key,cls,area=false){
      let data='',previous=null;
      for(const row of points){if(!Number.isFinite(row[key])){if(area&&previous)data+=`L${x(previous.time)},${bottom} Z `;previous=null;continue;}
        const start=!previous||row.segment!==previous.segment;
        if(start&&area&&previous)data+=`L${x(previous.time)},${bottom} Z `;
        data+=start?(area?`M${x(row.time)},${bottom} L`:'M'):`L`;data+=`${x(row.time)},${y(row[key])} `;previous=row;
      }
      if(area&&previous)data+=`L${x(previous.time)},${bottom} Z`;
      plot.append(svg('path',{d:data,class:cls}));
    }
    path(samples,'ground','profile-ground',true);
    // Keep the full altitude trace: no reduced-coordinate track replaces the source fixes.
    path(rows,'gpsAltitude','profile-gps');if(meaningfulBaro)path(rows,'pressureAltitude','profile-baro');
    const ticks=width<500?2:4;
    for(let i=0;i<=ticks;i++){const t=first+(last-first)*i/ticks,label=svg('text',{x:x(t),y:height-10,'text-anchor':i===0?'start':i===ticks?'end':'middle',class:'plot-label'});label.textContent=`${new Date(t*1000).toISOString().slice(11,19)}${t>=86400?` +${Math.floor(t/86400)}d`:''}`;plot.append(label);}
    plot.append(svg('line',{id:'profile-cursor',x1:60,x2:60,y1:16,y2:bottom+4,class:'profile-cursor'}));host.append(plot);readings();
  }
  async function terrainChanged(){
    request?.abort();cursorRequest?.abort();clearTimeout(timer);revision++;samples=[];elevations=new Map();terrainObject=getTerrain();chart();
    if(!analysis.rows.length)return;
    if(!terrainObject){$('profile-terrain-status').textContent='Choose a local terrain archive for an approximate ground profile and height above ground.';return;}
    const current=revision,terrain=terrainObject,indices=sampleIndices(analysis.rows.length,256);request=new AbortController();
    $('profile-terrain-status').textContent='Sampling the selected local terrain archive…';
    try{
      const heights=await terrain.sample(indices.map(i=>analysis.rows[i]),request.signal);
      if(current!==revision||terrain!==getTerrain())return;
      samples=indices.map((i,k)=>({...analysis.rows[i],ground:heights[k]}));indices.forEach((i,k)=>elevations.set(i,heights[k]));chart();select(index);
      const known=heights.filter(Number.isFinite).length;
      $('profile-terrain-status').textContent=`Approximate terrain, zoom ${Math.min(12,terrain.header.maxZoom)} · ${known}/${indices.length} samples available. Outside coverage or missing tiles stay unknown. AGL = GPS altitude − terrain; GPS/elevation datum errors can give negative values. Not a clearance measurement.`;
    }catch(error){if(error.name!=='AbortError'&&current===revision)$('profile-terrain-status').textContent=`Terrain profile unavailable: ${error.message}`;}
  }
  function setFlight(value){flight=value;analysis=analyseFlight(flight);index=0;range.min=0;range.max=Math.max(0,analysis.rows.length-1);range.value=0;range.disabled=!analysis.rows.length;
    $('flight-analysis-empty').hidden=!!analysis.rows.length;$('flight-analysis-data').hidden=!analysis.rows.length;
    chart();onCursor(analysis.rows[0]||null);terrainChanged();
  }
  function nearest(lngLat){
    if(!analysis.rows.length)return;
    let best=0,distance=Infinity;
    for(let i=0;i<analysis.rows.length;i++){const row=analysis.rows[i],d=(row.lon-lngLat.lng)**2*Math.cos(row.lat*Math.PI/180)**2+(row.lat-lngLat.lat)**2;if(d<distance){distance=d;best=i;}}
    select(best);
  }
  const observer=new ResizeObserver(()=>{if(analysis.rows.length)chart();});observer.observe(host);
  return {setFlight,terrainChanged,nearest,select,get index(){return index;},get rows(){return analysis.rows;}};
}
