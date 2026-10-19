export const XC_RULES_VERSION='shv-ccc-2026-v1';
export const XC_ALGORITHM_VERSION='igc-xc-score-1.8.0-geometry-v2';
export const XC_CATEGORIES={open:{label:'Open route',multiplier:1},straight:{label:'Straight distance',multiplier:1.2},triangle:{label:'Flat triangle',multiplier:1.2},fai:{label:'FAI triangle',multiplier:1.4}};
export function scoreCandidates(candidates){
  const known=Object.entries(XC_CATEGORIES).flatMap(([type,rule])=>{
    const candidate=candidates?.[type];
    if(!Number.isFinite(candidate?.distanceKm)||candidate.distanceKm<0)return [];
    return [{...candidate,type,label:rule.label,points:Math.round((candidate.distanceKm*rule.multiplier+Number.EPSILON)*100)/100,multiplier:rule.multiplier}];
  });
  const winner=known.sort((a,b)=>b.points-a.points||b.distanceKm-a.distanceKm||a.type.localeCompare(b.type))[0];
  if(!winner)return null;
  return {...winner,optimal:Object.keys(XC_CATEGORIES).every(key=>candidates?.[key]?.optimal),eligibleDistance:winner.distanceKm>=10,rulesVersion:XC_RULES_VERSION};
}
export function scoredXC(flight){
  if(flight?.type==='manual')return Number.isFinite(flight.openXcDistanceKm)&&flight.openXcDistanceKm>=0?{distanceKm:flight.openXcDistanceKm,source:'manual',type:'open',label:'Manual open route',points:null,approximate:false}:null;
  // Candidates are persisted; the winner is always rescored with the current multipliers.
  const value=scoreCandidates(flight?.xc);
  return value?{...value,source:'calculated',approximate:!value.optimal}:null;
}
export function mergeCandidates(old={},next={}){
  return Object.fromEntries(Object.keys(XC_CATEGORIES).map(key=>[key,old[key]&&(old[key].optimal||(old[key].distanceKm??-1)>(next[key]?.distanceKm??-1))?old[key]:next[key]||old[key]]).filter(([,value])=>value));
}
