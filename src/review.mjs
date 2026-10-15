import { haversine, validDate } from './flights.mjs';

export const REVIEW_FILENAME = 'flightbook-review.json';
export const DEFAULT_REVIEW_SETTINGS = { shortSeconds: 60, toleranceMinutes: 5, maxInvalidFixes: 15 };
export const emptyReview = () => ({ format:'local-flightbook-review', version:1, excluded:[], ignored:[], settings:{...DEFAULT_REVIEW_SETTINGS} });
// A path distinguishes physical copies. Manual IDs survive edits to the same file.
export const reviewIdentity = f => JSON.stringify([f.path, f.type === 'manual' ? f.id : f.contentHash || f.key]);
export function parseReview(text) {
  const value=JSON.parse(text);
  if(value?.format!=='local-flightbook-review'||value.version!==1)throw new Error('Unsupported review file format or version');
  for(const key of ['excluded','ignored'])if(!Array.isArray(value[key])||value[key].some(v=>typeof v!=='string'))throw new Error(`Invalid review ${key}`);
  const settings={...DEFAULT_REVIEW_SETTINGS,...value.settings};
  if(!Number.isFinite(settings.shortSeconds)||settings.shortSeconds<0||settings.shortSeconds>86400||!Number.isFinite(settings.toleranceMinutes)||settings.toleranceMinutes<0||settings.toleranceMinutes>120)throw new Error('Invalid review thresholds');
  if(!Number.isSafeInteger(settings.maxInvalidFixes)||settings.maxInvalidFixes<0)throw new Error('Allowed invalid GPS fixes must be a non-negative whole number');
  return {...emptyReview(),excluded:[...new Set(value.excluded)],ignored:[...new Set(value.ignored)],settings};
}
export function applyReview(flights, decisions) {
  const excluded=new Set(decisions.excluded);
  for(const f of flights){f.reviewExcluded=excluded.has(reviewIdentity(f));f.reviewWarnings=reviewWarnings(f,decisions.settings);}
}
export function reviewWarnings(flight,settings={}){
  const allowed=settings.maxInvalidFixes??DEFAULT_REVIEW_SETTINGS.maxInvalidFixes;
  return flight.warnings.filter(reason=>{
    const match=reason.match(/^(\d+) invalid GPS fixes skipped$/);
    return !match||Number(match[1])>allowed;
  });
}
export function flightStart(f) {
  if(f.type==='igc')return validDate(f.date)&&f.points.length?Date.parse(`${f.date}T00:00:00Z`)+f.points[0].time*1000:null;
  if(f.startTimeUtc)return Date.parse(f.startTimeUtc);
  if(validDate(f.date)&&/^\d{2}:\d{2}$/.test(f.startTime||''))return new Date(`${f.date}T${f.startTime}:00`).getTime();
  return null;
}
export function buildReview(flights,issues=[],decisions=emptyReview()) {
  const findings=[],ignored=new Set(decisions.ignored),settings=decisions.settings;
  const add=(category,members,reasons,confidence='Warning',extra={})=>{
    const id=JSON.stringify([category,...members.map(reviewIdentity).sort(),extra.path||'']);
    findings.push({id,category,flights:members,reasons,confidence,ignored:ignored.has(id),...extra});
  };
  const byHash=new Map(),byID=new Map();
  for(const f of flights){
    if(f.contentHash){if(!byHash.has(f.contentHash))byHash.set(f.contentHash,[]);byHash.get(f.contentHash).push(f);}
    if(f.type==='manual'){if(!byID.has(f.id))byID.set(f.id,[]);byID.get(f.id).push(f);}
    if(f.durationSeconds<settings.shortSeconds)add('short',[f],[`Recorded duration ${Math.round(f.durationSeconds)} sec is under ${settings.shortSeconds/60} min. Short does not necessarily mean broken.`]);
    if(f.type!=='igc')continue;
    const reasons=reviewWarnings(f,settings).filter(w=>!w.startsWith('Short recording')).map(reason=>/^\d+ invalid GPS fixes skipped$/.test(reason)?`${reason} (allowed: ${settings.maxInvalidFixes??DEFAULT_REVIEW_SETTINGS.maxInvalidFixes})`:reason);
    let gaps=0;
    for(let i=1;i<f.points.length;i++){
      const seconds=f.points[i].time-f.points[i-1].time;
      if(seconds>600)gaps++;
    }
    if(gaps)reasons.push(`${gaps} gaps longer than 10 minutes; recorded airtime includes gaps.`);
    if(reasons.length)add('suspicious',[f],reasons);
  }
  for(const group of byHash.values())if(group.length>1)add('exact',group,['Identical file bytes (SHA-256), regardless of filename.'],'Exact');
  for(const group of byID.values())if(group.length>1&&new Set(group.map(f=>f.contentHash)).size>1)add('manual-id',group,['Different manual JSON files share the same flight ID.'],'High');
  const starts=new Map(flights.map(f=>[f,flightStart(f)]));
  const tolerance=settings.toleranceMinutes*60000;
  for(let i=0;i<flights.length;i++)for(let j=i+1;j<flights.length;j++){
    const a=flights[i],b=flights[j];
    if(a.contentHash&&a.contentHash===b.contentHash)continue;
    if(a.type==='manual'&&b.type==='manual')continue;
    const ta=starts.get(a),tb=starts.get(b),timed=Number.isFinite(ta)&&Number.isFinite(tb);
    if(a.type!==b.type){
      if(timed&&Math.abs(ta-tb)<=tolerance)add('manual-match',[a,b],[`Start times within ${Math.round(Math.abs(ta-tb)/60000*10)/10} min (compared as UTC instants).`,`Durations: ${Math.round(a.durationSeconds/60)} and ${Math.round(b.durationSeconds/60)} min. Check before excluding either entry.`],'Likely');
      else if(!timed){
        const manual=a.type==='manual'?a:b,recorded=a.type==='igc'?a:b;
        const localDate=Number.isFinite(starts.get(recorded))?new Date(starts.get(recorded)).toLocaleDateString('en-CA'):recorded.date;
        const ratio=Math.min(a.durationSeconds,b.durationSeconds)/Math.max(a.durationSeconds,b.durationSeconds);
        if(manual.date===localDate&&ratio>=.5)add('manual-match',[a,b],['Manual entry has no comparable start time. Same local date and durations within a factor of two; this may be a different flight.'],'Possible');
      }
      continue;
    }
    if(!timed||Math.abs(ta-tb)>tolerance||a.points.length<2||b.points.length<2)continue;
    const endA=ta+a.durationSeconds*1000,endB=tb+b.durationSeconds*1000;
    const overlap=Math.max(0,Math.min(endA,endB)-Math.max(ta,tb));
    if(overlap<.7*Math.min(a.durationSeconds,b.durationSeconds)*1000||haversine(a.points[0],b.points[0])>1)continue;
    // Compare positions at shared timestamps; start proximity alone can match different pilots.
    let near=0,total=0,k=0;
    for(let s=0;s<5;s++){
      const t=Math.max(ta,tb)+(Math.min(endA,endB)-Math.max(ta,tb))*s/4;
      const p=a.points.reduce((best,p)=>Math.abs(ta+(p.time-a.points[0].time)*1000-t)<Math.abs(ta+(best.time-a.points[0].time)*1000-t)?p:best,a.points[0]);
      while(k+1<b.points.length&&Math.abs(tb+(b.points[k+1].time-b.points[0].time)*1000-t)<Math.abs(tb+(b.points[k].time-b.points[0].time)*1000-t))k++;
      total++;if(haversine(p,b.points[k])<=.3)near++;
    }
    if(near>=4)add('recording-match',[a,b],[`Start times within ${settings.toleranceMinutes} min; at least 70% of the shorter recording overlaps.`,`${near}/${total} sampled positions are within 300 m. Two nearby pilots can still produce similar tracks.`],'Likely');
  }
  for(const issue of issues)add('import',[],[issue.message],'Unreadable',{path:issue.path});
  return findings;
}
