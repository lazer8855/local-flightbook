import {XC_ALGORITHM_VERSION,XC_RULES_VERSION,XC_CATEGORIES,scoreCandidates,mergeCandidates} from './xc-scoring.mjs';
export const XC_DATABASE_FILE='flightbook-xc.json';
export const xcHash=flight=>flight.contentHash||flight.key;
export const emptyXCDatabase=()=>({format:'local-flightbook-xc',version:1,entries:{}});
export function parseXCDatabase(text){
  const db=JSON.parse(text);
  if(db?.format!=='local-flightbook-xc'||db.version!==1||!db.entries||Array.isArray(db.entries)||typeof db.entries!=='object')throw new Error('Invalid XC database format/version');
  for(const [hash,entry]of Object.entries(db.entries)){
    if(!/^[a-f0-9]{64}$/.test(hash)||!entry||typeof entry.algorithmVersion!=='string'||!entry.candidates||typeof entry.candidates!=='object')throw new Error('Invalid XC database entry');
    if(entry.algorithmVersion===XC_ALGORITHM_VERSION&&Object.keys(XC_CATEGORIES).some(key=>!entry.candidates[key]))throw new Error('Incomplete XC candidate set');
    for(const [type,value]of Object.entries(entry.candidates)){
      if(!XC_CATEGORIES[type]||!value||typeof value.optimal!=='boolean'||value.distanceKm!==null&&(!Number.isFinite(value.distanceKm)||value.distanceKm<0))throw new Error('Invalid XC candidate');
      for(const key of ['gapKm','perimeterKm'])if(value[key]!=null&&(!Number.isFinite(value[key])||value[key]<0))throw new Error(`Invalid ${key}`);
      if(!Array.isArray(value.legsKm)||value.legsKm.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid XC legs');
      for(const key of ['routePoints','turnpoints','closingPoints']){
        if(!Array.isArray(value[key])||value[key].some(p=>!p||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||p.index!==undefined&&(!Number.isInteger(p.index)||p.index<0)))throw new Error('Invalid XC route');
      }
    }
  }
  return db;
}
export function cachedXC(db,flight){const entry=db.entries[xcHash(flight)];return entry?.algorithmVersion===XC_ALGORITHM_VERSION?entry.candidates:null;}
export function storeXC(db,flight,result,budgetMs){
  const hash=xcHash(flight),candidates=mergeCandidates(cachedXC(db,flight)||{},result);
  db.entries[hash]={algorithmVersion:XC_ALGORITHM_VERSION,rulesVersion:XC_RULES_VERSION,calculatedAt:new Date().toISOString(),budgetMs,candidates,winner:scoreCandidates(candidates)};
  return candidates;
}
export function attachXC(db,flights){for(const f of flights)if(f.type==='igc'){const candidates=cachedXC(db,f);if(candidates)f.xc=candidates;}}
export function missingXC(db,flights){
  const seen=new Set();return flights.filter(f=>{const hash=xcHash(f);if(f.type!=='igc'||f.points.length<5||cachedXC(db,f)||seen.has(hash))return false;seen.add(hash);return true;});
}
export function createXCDatabaseStore(){
  let directory=null,db=emptyXCDatabase(),originalText=null,dirty=false,blocked=false;
  async function read(root){try{const handle=await root.getFileHandle(XC_DATABASE_FILE);return {handle,text:await(await handle.getFile()).text()};}catch(error){if(error.name==='NotFoundError')return {handle:null,text:null};throw error;}}
  return {
    get db(){return db;},get dirty(){return dirty;},get blocked(){return blocked;},
    async load(root){
      if(root!==directory){directory=root;db=emptyXCDatabase();originalText=null;dirty=false;blocked=false;}
      if(dirty)return;
      try{const saved=root.getFileHandle?await read(root):{text:null};db=saved.text===null?emptyXCDatabase():parseXCDatabase(saved.text);originalText=saved.text;blocked=false;
        for(const entry of Object.values(db.entries))if(entry.algorithmVersion===XC_ALGORITHM_VERSION&&entry.rulesVersion!==XC_RULES_VERSION){entry.rulesVersion=XC_RULES_VERSION;entry.winner=scoreCandidates(entry.candidates);dirty=true;}
      }
      catch(error){blocked=true;throw error;}
    },
    async permission(){if(!directory||blocked)throw new Error('Reconnect a folder with a valid XC database first');if(directory.requestPermission&&await directory.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Write permission not granted. No calculation started.');},
    record(flight,result,budget){dirty=true;return storeXC(db,flight,result,budget);},
    async save(){
      if(!dirty)return;if(blocked)throw new Error('Invalid XC database will not be overwritten');
      const root=directory,current=await read(root);
      if(current.text!==originalText)throw new Error('XC database changed outside this dashboard. Completed results are kept in memory; reconnect to reload before continuing.');
      const handle=current.handle||await root.getFileHandle(XC_DATABASE_FILE,{create:true});
      if(!current.handle){if(await(await handle.getFile()).text()!=='')throw new Error('XC database created by another writer');originalText='';}
      const text=JSON.stringify(db,null,2)+'\n',writable=await handle.createWritable();
      try{await writable.write(text);await writable.close();}catch(error){await writable.abort().catch(()=>{});throw error;}
      originalText=text;dirty=false;
    },
    reset(){directory=null;db=emptyXCDatabase();originalText=null;dirty=false;blocked=false;}
  };
}
