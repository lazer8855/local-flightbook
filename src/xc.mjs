import { solver, scoringRules } from 'igc-xc-score';
import { XC_TYPES } from './xc-types.mjs';

// Distances, not contest points. Use the 20% triangle rule and unit multipliers
// to optimize each distance independently, including the closing-gap deduction.
const rules = ['od', 'tri', 'fai'].map(code => ({ ...scoringRules.XContest.find(rule => rule.code === code), multiplier: 1 }));

export function calculateXC(points, budgetMs = 75) {
  if (points.length < 5) return null;
  const fixes = points.map(p => ({ longitude: p.lon, latitude: p.lat, timestamp: p.time * 1000, valid: true, gpsAltitude: p.gpsAltitude, pressureAltitude: p.pressureAltitude }));
  const result = {};
  for (const [i, key] of Object.keys(XC_TYPES).entries()) {
    const iterator = solver({ fixes: fixes.map(p => ({ ...p })) }, [rules[i]], { maxcycle: budgetMs, trim: false, hp: true });
    const solution = iterator.next().value;
    iterator.return();
    const info = solution?.scoreInfo;
    result[key] = {
      distanceKm: solution?.score > 0 || solution?.optimal ? Math.max(0, solution?.score || 0) : null,
      optimal: !!solution?.optimal,
      gapKm: info?.cp?.d ?? null,
      perimeterKm: info?.distance ?? null,
      legsKm: info?.legs?.map(leg => leg.d) || [],
      turnpoints: info?.tp?.map(p => ({ lon: p.x, lat: p.y, index: p.r })) || []
    };
  }
  return result;
}
