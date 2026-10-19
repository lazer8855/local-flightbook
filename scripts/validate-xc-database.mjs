import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [label,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
 const browser=await chromium.launch({executablePath,chromiumSandbox:true});
 try{
  const context=await browser.newContext({offline:true,viewport:{width:1400,height:1100}});
  await context.addInitScript(()=>{
   const storage='xc-database-fixtures',files=new Map(Object.entries(JSON.parse(localStorage.getItem(storage)||'null')||{}));
   function coord(n,lat){const d=Math.floor(n);return String(d).padStart(lat?2:3,'0')+String(Math.round((n-d)*60000)).padStart(5,'0')+(lat?'N':'E');}
   function igc(points){return 'AXXX\nHFDTE010624\n'+points.map(([lon,lat],i)=>`B1200${String(i*10).padStart(2,'0')}${coord(lat,true)}${coord(lon,false)}A0100001100`).join('\n');}
   const straight=igc([[8,47],[8.01,47],[8.02,47],[8.03,47],[8.04,47],[8.05,47]]);
   if(!files.size){files.set('a.igc',straight);files.set('copy.igc',straight);files.set('triangle.igc',igc([[8,47],[8.1,47],[8.05,47.06],[8,47],[8,47]]));files.set('manual.json',JSON.stringify({format:'local-flightbook',version:1,id:'manual',date:'2024-06-02',durationSeconds:600,openXcDistanceKm:7}));}
   const persist=()=>localStorage.setItem(storage,JSON.stringify(Object.fromEntries(files)));
   window.testRead=name=>files.get(name);window.testSet=(name,text)=>{files.set(name,text);persist();};
   window.testRename=()=>{files.delete('a.igc');files.delete('copy.igc');files.set('moved/renamed.IGC',straight);persist();};
   window.xcJobs=0;window.testDelay=800;window.testWrites=0;
   const OriginalWorker=window.Worker;
   window.Worker=class extends OriginalWorker{postMessage(data,...args){if(data.points&&data.key){window.xcJobs++;this.jobTimer=setTimeout(()=>super.postMessage(data,...args),window.testDelay);}else super.postMessage(data,...args);}terminate(){clearTimeout(this.jobTimer);super.terminate();}};
   const handles=new Map();
   function file(path){if(handles.has(path))return handles.get(path);const h={kind:'file',name:path.split('/').at(-1),getFile:async()=>new File([files.get(path)||''],path),createWritable:async()=>{
    if(window.testFailure==='create')throw Error('Simulated create failure');let value;return{write:async text=>{if(window.testFailure==='write')throw Error('Simulated write failure');value=text;},close:async()=>{files.set(path,value);persist();window.testWrites++;},abort:async()=>{}};
   }};handles.set(path,h);return h;}
   function directory(prefix=''){return {kind:'directory',name:prefix||'XC fixtures',requestPermission:async()=>window.testDenied?'denied':'granted',getFileHandle:async(name,options={})=>{
    const path=prefix+name;if(!files.has(path)){if(!options.create)throw new DOMException('Missing','NotFoundError');files.set(path,'');persist();}return file(path);
   },async *entries(){const seen=new Set();for(const path of files.keys()){if(!path.startsWith(prefix))continue;const relative=path.slice(prefix.length),name=relative.split('/')[0];if(seen.has(name))continue;seen.add(name);yield[name,relative.includes('/')?directory(prefix+name+'/'):file(path)];}}};}
   window.showDirectoryPicker=async()=>directory();
  });
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const d=()=>page.evaluate(()=>window.flightbookDiagnostics);
  await page.goto(pathToFileURL(resolve('dashboard.html')).href);await page.locator('#folder').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===4);
  assert.equal(await page.evaluate(()=>window.xcJobs),0);assert.equal((await d()).xcProcessed,0);assert.equal((await d()).statisticsSummary.openXcKm,7);assert.match(await page.locator('#calculate-xc').textContent(),/\(2\)/);
  await page.evaluate(()=>{window.testDenied=true;});await page.locator('#calculate-xc').click();await page.waitForFunction(()=>document.getElementById('xc-status').textContent.includes('not granted'));assert.equal(await page.evaluate(()=>window.xcJobs),0);
  await page.evaluate(()=>{window.testDenied=false;window.testFailure='write';});await page.locator('#calculate-xc').click();
  await page.waitForFunction(()=>window.flightbookDiagnostics.xcProcessed>=1);
  await page.locator('#cancel-xc').click();await page.waitForFunction(()=>document.getElementById('xc-status').textContent.includes('Save failed'));
  assert.equal((await d()).xcDatabaseDirty,true);assert.equal((await d()).xcDatabaseEntries,1);
  await page.evaluate(()=>{window.testFailure=null;});await page.locator('#save-xc').click();await page.waitForFunction(()=>!window.flightbookDiagnostics.xcDatabaseDirty);
  const one=JSON.parse(await page.evaluate(()=>window.testRead('flightbook-xc.json')));assert.equal(Object.keys(one.entries).length,1);
  await page.evaluate(()=>window.testRename());await page.reload();await page.locator('#folder').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===3);
  assert.equal(await page.evaluate(()=>window.xcJobs),0);assert.equal((await d()).xcProcessed,1);assert.match(await page.locator('#calculate-xc').textContent(),/\(1\)/);
  await page.locator('#calculate-xc').click();await page.waitForFunction(()=>window.flightbookDiagnostics.xcDatabaseEntries===2&&!window.flightbookDiagnostics.xcDatabaseDirty&&!window.flightbookDiagnostics.xcPending);
  await page.locator('.flight-item').filter({hasText:'triangle.igc'}).click();
  assert.equal((await d()).selectedScoredXC.type,'fai');assert.match(await page.locator('#xc-detail').textContent(),/FAI triangle/);
  assert.equal(await page.locator('#xc-detail .detail-grid').count(),1);assert.equal((await d()).openRouteFeatures,7);
  const saved=JSON.parse(await page.evaluate(()=>window.testRead('flightbook-xc.json')));assert.equal(Object.keys(saved.entries).length,2);
  assert.ok(Object.values(saved.entries).every(e=>e.winner&&e.algorithmVersion&&e.rulesVersion&&e.calculatedAt));
  // A changed byte in an existing path is a new identity; temporarily missing hashes are retained.
  await page.evaluate(()=>window.testSet('moved/renamed.IGC',window.testRead('moved/renamed.IGC').replace('AXXX','AXXXNEW')));await page.locator('#rescan').click();await page.waitForFunction(()=>document.getElementById('calculate-xc').textContent.includes('(1)'));
  const before=await page.evaluate(()=>window.xcJobs);assert.equal(before,1);
  await page.locator('#calculate-xc').click();await page.waitForFunction(()=>window.flightbookDiagnostics.xcDatabaseEntries===3&&!window.flightbookDiagnostics.xcDatabaseDirty);
  assert.equal(await page.evaluate(()=>window.xcJobs),before+1);
  await page.screenshot({path:`validation/artifacts/${label}-xc-database.png`,fullPage:true});
  // External modification is detected before a new completed result can overwrite it.
  await page.evaluate(()=>window.testSet('new.igc',window.testRead('triangle.igc').replace('AXXX','AXXXOTHER')));await page.locator('#rescan').click();await page.waitForFunction(()=>document.getElementById('calculate-xc').textContent.includes('(1)'));
  await page.locator('#calculate-xc').click();await page.evaluate(()=>window.testSet('flightbook-xc.json','{"format":"local-flightbook-xc","version":1,"entries":{}}'));
  await page.waitForFunction(()=>document.getElementById('xc-status').textContent.includes('changed outside'));assert.equal((await d()).xcDatabaseDirty,true);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#folder').click();await page.waitForFunction(()=>!window.flightbookDiagnostics.xcDatabaseDirty);
  await page.evaluate(()=>window.testSet('flightbook-xc.json','{"format":"broken"}'));await page.locator('#rescan').click();await page.waitForFunction(()=>document.getElementById('xc-status').textContent.includes('will not be overwritten'));
  assert.equal(await page.locator('#calculate-xc').isDisabled(),true);assert.equal(await page.evaluate(()=>window.testRead('flightbook-xc.json')),'{"format":"broken"}');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const report={browser:await browser.version(),noAutomaticCalculations:true,contentHashDeduplication:true,permissionDenialRetry:true,cancelRetainsCompleted:true,writeFailureRetry:true,reopenWithoutRecalculation:true,renameReusesResults:true,onlyChangedFilesCalculated:true,orphanResultsRetained:true,winningTriangleAndOverlay:true,externalConflictProtected:true,invalidDatabaseProtected:true,noHTTP:true,errors};
  await writeFile(`validation/${label}-xc-database.json`,JSON.stringify(report,null,2)+'\n');console.log(label,JSON.stringify(report));
 }finally{await browser.close();}
}
