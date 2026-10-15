import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseIGC,createManualFlight,parseManualFlight} from '../src/flights.mjs';
import {buildReview,emptyReview,parseReview,applyReview,reviewIdentity,flightStart} from '../src/review.mjs';
import {buildDashboard} from '../src/dashboard-model.mjs';
import {buildMapOverview} from '../src/map-overview.mjs';

const igc=(path='a.igc',hash='a',time='100000',end='101000',latitude='4700000N')=>({...parseIGC(`HFDTE010626\nB${time}${latitude}00800000EA0050000600\nB${end}${latitude}00800000EA0050000600\n`,path),key:hash,contentHash:hash});
const manual=(path='manual.json',start='2026-06-01T10:00:00.000Z')=>({...parseManualFlight(JSON.stringify({format:'local-flightbook',version:1,id:path,date:'2026-06-01',durationSeconds:600,openXcDistanceKm:5,...(start?{startTime:'12:00',startTimeUtc:start}:{})}),path),key:path,contentHash:path});

test('exact copies and changed manual files sharing IDs are review groups, without automatic exclusion',()=>{
  const a=igc(),b=igc('copy.igc','a'),m=manual(),copy={...manual('copy.json'),id:m.id};
  const findings=buildReview([a,b,m,copy]);
  assert.equal(findings.filter(f=>f.category==='exact').length,1);
  assert.equal(findings.filter(f=>f.category==='manual-id').length,1);
  assert.equal(a.reviewExcluded,undefined);
  assert.notEqual(reviewIdentity(a),reviewIdentity(b));
});
test('manual matching compares UTC instants, has inclusive configurable tolerance and lower-confidence fallback',()=>{
  const a=igc(),m=manual(),outside=manual('outside.json','2026-06-01T10:05:01.000Z');
  assert.equal(flightStart(a),flightStart(m));
  assert.equal(buildReview([a,m]).find(f=>f.category==='manual-match').confidence,'Likely');
  assert.equal(buildReview([a,outside]).filter(f=>f.category==='manual-match').length,0);
  const edge=manual('edge.json','2026-06-01T10:05:00.000Z');
  assert.equal(buildReview([a,edge]).filter(f=>f.category==='manual-match').length,1);
  const decisions=emptyReview();decisions.settings.toleranceMinutes=0;
  assert.equal(buildReview([a,edge],[],decisions).length,0);
  assert.equal(buildReview([a,manual('unknown.json',null)]).find(f=>f.category==='manual-match').confidence,'Possible');
  assert.equal(buildReview([a,{...manual('other-day.json',null),date:'2026-06-03'}]).length,0);
});
test('UTC/local date boundaries match timed manual flights across midnight',()=>{
  const a=igc('late.igc','late','235000','235900');
  const m={...manual('next-local-day.json','2026-06-01T23:50:00.000Z'),date:'2026-06-02',startTime:'01:50'};
  assert.equal(buildReview([a,m]).filter(f=>f.category==='manual-match').length,1);
});
test('similar IGC recordings require track proximity and temporal overlap',()=>{
  const a=igc(),b=igc('second.igc','b','100100','101100');
  assert.equal(buildReview([a,b]).filter(f=>f.category==='recording-match').length,1);
  assert.equal(buildReview([a,igc('far.igc','far','100100','101100','4800000N')]).length,0);
  assert.equal(buildReview([a,igc('later.igc','later','100500','101500')]).length,0);
});
test('short and suspicious findings remain distinct, with malformed timestamps, GPS jumps and gaps explained',()=>{
  const short=igc('short.igc','short','100000','100030');
  assert.deepEqual(buildReview([short]).map(f=>f.category),['short']);
  const broken={...parseIGC('HFDTE010626\nB1000004700000N00800000EA0050000600\nB0959004700000N00800000EA0050000600\nB1000014800000N00800000EA0050000600\nB1015004800000N00800000EA0050000600\nBxxx','broken.igc'),key:'broken'};
  const finding=buildReview([broken]).find(f=>f.category==='suspicious');
  assert.match(finding.reasons.join(' '),/out-of-order/);assert.match(finding.reasons.join(' '),/malformed/);
  assert.match(finding.reasons.join(' '),/200 km\/h/);assert.match(finding.reasons.join(' '),/10 minutes/);
  assert.ok(buildReview([parseIGC('AXXX','empty.igc')]).some(f=>f.category==='suspicious'));
  assert.equal(buildReview([], [{path:'bad.json',message:'Invalid JSON'}])[0].category,'import');
});
test('review schema rejects invalid files and decisions exclude consistently, survive manual edits and restore',()=>{
  const a=igc(),m=manual(),decisions=emptyReview();decisions.excluded=[reviewIdentity(a),reviewIdentity(m)];
  const restored=parseReview(JSON.stringify(decisions));applyReview([a,m],restored);
  const dashboard=buildDashboard([a,m]);
  assert.equal(dashboard.summary.count,0);assert.equal(dashboard.scatter.length,0);assert.equal(dashboard.best.duration,null);
  assert.equal(buildMapOverview([a,m].filter(f=>!f.reviewExcluded)).flightCount,0);
  const edited={...m,contentHash:'changed',durationSeconds:1200};applyReview([edited],restored);assert.equal(edited.reviewExcluded,true);
  applyReview([a,m],emptyReview());assert.equal(buildDashboard([a,m]).summary.count,2);
  const finding=buildReview([igc('short','s','100000','100020')])[0];decisions.ignored=[finding.id];
  assert.equal(buildReview(finding.flights,[],decisions)[0].ignored,true);
  for(const invalid of ['{}',JSON.stringify({...emptyReview(),version:2}),JSON.stringify({...emptyReview(),excluded:[3]}),JSON.stringify({...emptyReview(),settings:{toleranceMinutes:-1}})])assert.throws(()=>parseReview(invalid));
});
test('manual start times are optional, validated, UTC-backed and backward compatible',()=>{
  const old=createManualFlight({date:'2026-06-01',durationMinutes:10});assert.equal(old.startTime,undefined);
  const timed=createManualFlight({date:'2026-06-01',durationMinutes:10,startTime:'12:34'});
  assert.equal(timed.startTime,'12:34');assert.equal(timed.startTimeUtc,new Date('2026-06-01T12:34:00').toISOString());
  assert.equal(parseManualFlight(JSON.stringify(timed)).startTimeUtc,timed.startTimeUtc);
  assert.throws(()=>createManualFlight({date:'2026-06-01',durationMinutes:10,startTime:'25:01'}));
  assert.throws(()=>parseManualFlight(JSON.stringify({...timed,startTimeUtc:'yesterday'})));
});
