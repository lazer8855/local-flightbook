import {haversine} from './flights.mjs';
import {trackRates} from './track-rate.mjs';
import {scoredXC} from './xc-scoring.mjs';

export function nearestTime(points,time){
  if(!points.length)return -1;
  let low=0,high=points.length-1;
  while(low<high){const mid=(low+high)>>1;if(points[mid].time<time)low=mid+1;else high=mid;}
  return low>0&&Math.abs(points[low-1].time-time)<=Math.abs(points[low].time-time)?low-1:low;
}
export function analyseFlight(flight){
  let segment=0;
  const points=flight?.points||[],rates=trackRates(points),rows=points.map((point,index)=>{
    const previous=points[index-1],dt=previous?point.time-previous.time:0;
    const rate=rates.data.features[Math.min(index,points.length-2)]?.properties.rate;
    if(index&&dt>30)segment++;
    return {...point,index,segment,groundSpeedKmh:dt>0&&dt<=30?haversine(previous,point)/dt*3600:null,verticalSpeed:Number.isFinite(rate)?rate:null};
  });
  return {rows,rateSource:rates.source,averageGroundSpeedKmh:points.length>1&&flight.durationSeconds>0?flight.distanceKm/flight.durationSeconds*3600:null};
}
export function fixTime(flight,point){
  if(!point)return 'Unavailable';
  if(flight.date)return new Date(Date.parse(`${flight.date}T00:00:00Z`)+point.time*1000).toISOString().replace('T',' ').replace('.000Z',' UTC');
  return `${new Date(point.time*1000).toISOString().slice(11,19)} UTC (date unknown${point.time>=86400?'; next day':''})`;
}
export function sampleIndices(length,limit=256){
  if(length<=limit)return Array.from({length},(_,i)=>i);
  return Array.from({length:limit},(_,i)=>Math.round(i*(length-1)/(limit-1)));
}
export function openRoute(flight){
  const xc=scoredXC(flight);
  if(!xc||!Number.isFinite(xc.distanceKm)||xc.distanceKm<=0||!xc.routePoints?.length)return {type:'FeatureCollection',features:[]};
  const route=xc.routePoints.filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat));
  if(route.length<2)return {type:'FeatureCollection',features:[]};
  const features=[];
  const triangle=['triangle','fai'].includes(xc.type);
  const line=triangle?[...route,route[0]]:route;
  for(let i=1;i<line.length;i++)features.push({type:'Feature',properties:{label:`${i}: ${(xc.legsKm[i-1]??haversine(line[i-1],line[i])).toFixed(2)} km`},geometry:{type:'LineString',coordinates:[[line[i-1].lon,line[i-1].lat],[line[i].lon,line[i].lat]]}});
  route.forEach((p,i)=>features.push({type:'Feature',properties:{label:triangle?String(i+1):i===0?'S':i===route.length-1?'F':String(i),index:p.index??-1},geometry:{type:'Point',coordinates:[p.lon,p.lat]}}));
  if(triangle&&xc.closingPoints?.length===2)features.push({type:'Feature',properties:{label:`Closing gap: ${(xc.gapKm||0).toFixed(2)} km (subtracted)`,gap:true},geometry:{type:'LineString',coordinates:xc.closingPoints.map(p=>[p.lon,p.lat])}});
  return {type:'FeatureCollection',features};
}
