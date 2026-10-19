import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreCandidates,scoredXC,mergeCandidates,XC_ALGORITHM_VERSION} from '../src/xc-scoring.mjs';
import {emptyXCDatabase,parseXCDatabase,storeXC,missingXC,attachXC,createXCDatabaseStore} from '../src/xc-database.mjs';
import {buildDashboard} from '../src/dashboard-model.mjs';
import {filterFlights} from '../src/flight-filters.mjs';
import {openRoute} from '../src/flight-analysis.mjs';
import {calculateXC} from '../src/xc.mjs';
const candidate=(distanceKm,optimal=true)=>({distanceKm,optimal,gapKm:null,perimeterKm:distanceKm,legsKm:[],turnpoints:[],routePoints:[],closingPoints:[]});
const candidates=()=>({open:candidate(100),straight:candidate(70),triangle:candidate(80),fai:candidate(80)});
const flight=(hash='a'.repeat(64))=>({type:'igc',key:hash,contentHash:hash,path:'2024/a.igc',date:'2024-01-01',durationSeconds:3600,points:Array.from({length:5},()=>({lon:8,lat:47,time:0}))});
test('highest points select a shorter triangle; all dashboard/filter distances use that route',()=>{
 const f={...flight(),xc:candidates()};const result=scoredXC(f);assert.equal(result.type,'fai');assert.equal(result.distanceKm,80);assert.equal(result.points,112);assert.equal(result.approximate,false);
 assert.equal(buildDashboard([f]).summary.openXcKm,80);assert.equal(buildDashboard([f]).best.distance,f);assert.equal(buildDashboard([f]).scatter[0].distanceKm,80);
 assert.equal(filterFlights([f],{minKm:90}).length,0);assert.equal(filterFlights([f],{minKm:80,maxKm:80}).length,1);
 f.xc.triangle.optimal=false;assert.equal(scoredXC(f).approximate,true);
 assert.equal(scoredXC({type:'manual',openXcDistanceKm:0}).points,null);assert.equal(scoredXC({type:'manual'}),null);
});
test('straight distance is optimized over two fixes and Swiss multipliers select it for a straight track',()=>{
 const points=Array.from({length:10},(_,i)=>({lon:8+i*.01,lat:47,time:i*10,gpsAltitude:1000,pressureAltitude:1000}));
 const result=calculateXC(points,1000);assert.equal(scoreCandidates(result).type,'straight');assert.equal(result.straight.optimal,true);assert.equal(result.straight.routePoints.length,2);
 assert.equal(result.straight.routePoints[0].index,0);assert.equal(result.straight.routePoints[1].index,9);
});
test('database identity follows content through renames, deduplicates copies and invalidates changed algorithms',()=>{
 const db=emptyXCDatabase(),f=flight(),copy={...f,path:'renamed.IGC',key:'copy-key'};
 assert.equal(missingXC(db,[f,copy]).length,1);storeXC(db,f,candidates(),1000);
 assert.equal(missingXC(db,[copy]).length,0);attachXC(db,[copy]);assert.equal(scoredXC(copy).points,112);
 const restored=parseXCDatabase(JSON.stringify(db));restored.entries[f.key].winner={points:999999,distanceKm:999999};attachXC(restored,[copy]);assert.equal(scoredXC(copy).points,112);
 restored.entries[f.key].rulesVersion='old-multipliers';assert.equal(missingXC(restored,[copy]).length,0);
 restored.entries[f.key].algorithmVersion='older-geometry';assert.equal(missingXC(restored,[copy]).length,1);
 assert.equal(missingXC(db,[flight('b'.repeat(64))]).length,1);assert.equal(Object.keys(db.entries).length,1);
});
test('refinement never replaces better candidates with worse estimates and triangle overlay includes the closing gap',()=>{
 const old=candidates(),next=candidates();old.fai.optimal=false;next.fai={...candidate(60,false)};assert.equal(mergeCandidates(old,next).fai.distanceKm,80);
 const f={...flight(),xc:candidates()};f.xc.fai={...f.xc.fai,routePoints:[{lon:8,lat:47,index:0},{lon:8.2,lat:47,index:1},{lon:8.1,lat:47.1,index:2}],legsKm:[30,30,30],gapKm:10,closingPoints:[{lon:8,lat:47,index:0},{lon:8.01,lat:47,index:4}]};
 const route=openRoute(f);assert.equal(route.features.filter(f=>f.geometry.type==='LineString').length,4);assert.match(route.features.at(-1).properties.label,/Closing gap/);
 const invalid=emptyXCDatabase();invalid.entries['a'.repeat(64)]={algorithmVersion:XC_ALGORITHM_VERSION,candidates:{}};assert.throws(()=>parseXCDatabase(JSON.stringify(invalid)));
 assert.throws(()=>parseXCDatabase('{}'));
});
function memoryRoot(){const files=new Map();const root={name:'Memory root',denied:false,failure:false,requestPermission:async()=>root.denied?'denied':'granted',getFileHandle:async(name,options={})=>{
 if(!files.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');files.set(name,'');}
 return {getFile:async()=>new File([files.get(name)],name),createWritable:async()=>{let text;return {write:async value=>{if(root.failure)throw Error('Write failed');text=value;},close:async()=>files.set(name,text),abort:async()=>{}};}};
 }};return {root,files};}
test('database loading is read-only, save/reload works, failures retain results and external changes are protected',async()=>{
 const {root,files}=memoryRoot(),store=createXCDatabaseStore();await store.load(root);assert.equal(files.size,0);
 root.denied=true;await assert.rejects(store.permission(),/permission/);assert.equal(files.size,0);root.denied=false;await store.permission();
 store.record(flight(),candidates(),1000);root.failure=true;await assert.rejects(store.save(),/Write failed/);assert.equal(store.dirty,true);
 root.failure=false;await store.save();assert.equal(store.dirty,false);
 const reopened=createXCDatabaseStore();await reopened.load(root);assert.equal(missingXC(reopened.db,[flight()]).length,0);
 store.record(flight('b'.repeat(64)),candidates(),1000);files.set('flightbook-xc.json','external change');await assert.rejects(store.save(),/changed outside/);assert.equal(store.dirty,true);
 const invalid=createXCDatabaseStore();await assert.rejects(invalid.load(root));assert.equal(invalid.blocked,true);await assert.rejects(invalid.permission());assert.equal(files.get('flightbook-xc.json'),'external change');
});
