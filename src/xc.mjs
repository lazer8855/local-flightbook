import { solver, scoringRules } from 'igc-xc-score';
import { XC_TYPES } from './xc-types.mjs';
import {haversine} from './flights.mjs';

// Distances, not contest points. Use the 20% triangle rule and unit multipliers
// to optimize each distance independently, including the closing-gap deduction.
const rules = ['od', 'tri', 'fai'].map(code => ({ ...scoringRules.XContest.find(rule => rule.code === code), multiplier: 1 }));
const round2=value=>Math.round((value+Number.EPSILON)*100)/100;
// A conservative geodesic upper bound: centre separation plus latitude/longitude
// path-length bounds (6400 km exceeds the Earth's curvature radii).
const straightRule={name:'Swiss straight distance',code:'straight',multiplier:1,cardinality:2,rounding:round2,
  bound(ranges,boxes){const centres=boxes.map(b=>({lon:(b.x1+b.x2)/2,lat:(b.y1+b.y2)/2}));const radius=boxes.reduce((sum,b)=>sum+6400*Math.PI/180*(Math.abs(b.x2-b.x1)+Math.abs(b.y2-b.y1))/2,0);return Math.min(20040,haversine(centres[0],centres[1])*6400/6371.0088+radius);},
  score(tp){const distance=round2(tp[0].distanceEarth(tp[1]));return {score:distance,distance,tp:[],ep:{start:tp[0],finish:tp[1]},legs:[{d:distance}]};}};

export function calculateXC(points, budgetMs = 75, previous = {}) {
  if (points.length < 5) return null;
  const fixes = points.map(p => ({ longitude: p.lon, latitude: p.lat, timestamp: p.time * 1000, valid: true, gpsAltitude: p.gpsAltitude, pressureAltitude: p.pressureAltitude }));
  const result = {...previous};
  for (const [key,rule] of [...Object.keys(XC_TYPES).map((key,i)=>[key,rules[i]]),['straight',straightRule]]) {
    if(previous[key]?.optimal)continue;
    const iterator = solver({ fixes: fixes.map(p => ({ ...p })) }, [rule], { maxcycle: budgetMs, trim: false, hp: true });
    const solution = iterator.next().value;
    iterator.return();
    const info = solution?.scoreInfo;
    result[key] = {
      distanceKm: solution?.score > 0 || solution?.optimal ? Math.max(0, solution?.score || 0) : null,
      optimal: !!solution?.optimal,
      gapKm: info?.cp?.d ?? null,
      perimeterKm: info?.distance ?? null,
      legsKm: info?.legs?.map(leg => leg.d) || [],
      turnpoints: info?.tp?.map(p => ({ lon: p.x, lat: p.y, index: p.r })) || [],
      routePoints: info?.ep ? [info.ep.start,...info.tp,info.ep.finish].map(p=>({lon:p.x,lat:p.y,index:p.r})) : info?.tp?.map(p=>({lon:p.x,lat:p.y,index:p.r}))||[],
      closingPoints:info?.cp?.in&&info?.cp?.out?[info.cp.in,info.cp.out].map(p=>({lon:p.x,lat:p.y,index:p.r})):[]
    };
  }
  return result;
}
