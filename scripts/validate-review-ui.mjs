import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [label,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
  const browser=await chromium.launch({executablePath,chromiumSandbox:true});
  try{
    const context=await browser.newContext({offline:true,timezoneId:'Europe/Zurich',viewport:{width:1400,height:1000}});
    await context.addInitScript(()=>{
      const storageKey='flightbook-review-test-files';
      const track=(time,end,header='')=>`AXXX\nHFDTE010626\n${header}\nB${time}4700000N00800000EA0050000600\nB${end}4700000N00800000EA0050000600\n`;
      const initial={'Flüge ü/a.igc':track('100000','101000'),'Flüge ü/copy.IGC':track('100000','101000'),'elsewhere/similar.igc':track('100100','101100','HFSITSITE:Device two'),'short.igc':track('110000','110030'),'manual.json':JSON.stringify({format:'local-flightbook',version:1,id:'manual',date:'2026-06-01',startTime:'12:00',startTimeUtc:'2026-06-01T10:00:00.000Z',durationSeconds:600,openXcDistanceKm:6,notes:'Retain these notes'}),'bad.json':'{'};
      const files=new Map(Object.entries(JSON.parse(localStorage.getItem(storageKey)||JSON.stringify(initial))));
      const persist=()=>localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(files)));
      window.testOriginals=()=>Object.fromEntries([...files].filter(([key])=>key!=='flightbook-review.json'));
      window.testRead=name=>files.get(name);window.testWrite=(name,text)=>{files.set(name,text);persist();};
      const handles=new Map();
      function handle(path){if(handles.has(path))return handles.get(path);const result={kind:'file',name:path.split('/').at(-1),getFile:async()=>new File([files.get(path)||''],path.split('/').at(-1)),isSameEntry:async other=>other===result,createWritable:async()=>{
        if(window.testFailure==='create')throw new Error('Simulated create denial');
        let text;return {write:async value=>{if(window.testFailure==='write')throw new Error('Simulated write failure');text=value;},close:async()=>{files.set(path,text);persist();},abort:async()=>{}};
      }};handles.set(path,result);return result;}
      function directory(prefix=''){return {kind:'directory',name:prefix||'Test review archive',requestPermission:async()=>window.testDeny?'denied':'granted',getFileHandle:async(name,options={})=>{
        const path=prefix+name;if(!files.has(path)){if(!options.create)throw new DOMException('Missing','NotFoundError');files.set(path,'');persist();}return handle(path);
      },async *entries(){const children=new Set();for(const path of files.keys()){if(!path.startsWith(prefix))continue;const relative=path.slice(prefix.length),name=relative.split('/')[0];if(children.has(name))continue;children.add(name);yield [name,relative.includes('/')?directory(prefix+name+'/'):handle(path)];}}};}
      window.showDirectoryPicker=async()=>directory();
      window.showSaveFilePicker=async options=>handle(window.testSaveName||options.suggestedName);
    });
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    await page.goto(pathToFileURL(resolve('dashboard.html')).href);
    await page.locator('#folder').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===5);
    const originals=await page.evaluate(()=>window.testOriginals());
    const diagnostics=()=>page.evaluate(()=>window.flightbookDiagnostics);
    assert.equal((await diagnostics()).statisticsSummary.count,5);
    await page.locator('#search').fill('2026');
    await page.locator('#tab-review').click();
    await page.locator('.review-finding[data-category=exact]').waitFor();
    assert.equal(await page.locator('.review-finding[data-category=exact]').count(),1);
    assert.equal(await page.locator('.review-finding[data-category=recording-match]').count(),2);
    assert.equal(await page.locator('.review-finding[data-category=manual-match]').count(),3);
    assert.equal(await page.locator('.review-finding[data-category=short]').count(),1);
    assert.equal(await page.locator('.review-finding[data-category=import]').count(),1);
    await page.locator('#review-category').selectOption('exact');
    await page.locator('.review-file').first().getByRole('button',{name:'Count only this entry',exact:true}).click();
    assert.equal((await diagnostics()).reviewExcluded,1);assert.equal((await diagnostics()).statisticsSummary.count,4);
    await page.locator('#tab-flightbook').click();
    await page.locator('#map-file').setInputFiles(resolve('europe.pmtiles'));
    await page.waitForFunction(()=>window.flightbookDiagnostics.mapLoaded);
    await page.locator('#map-mode').selectOption('tracks');
    await page.waitForFunction(()=>window.flightbookDiagnostics.mapTrackCount===3);
    assert.equal((await diagnostics()).overviewFlights,3);
    await page.locator('#map-mode').selectOption('heat');assert.equal((await diagnostics()).overviewFlights,3);
    await page.locator('#tab-review').click();
    await page.locator('.review-file').nth(1).getByRole('button',{name:'Open flight',exact:true}).click();
    assert.equal((await diagnostics()).dashboardView,'flightbook');assert.match(await page.locator('#flight-detail').textContent(),/Excluded flight/);
    assert.equal(await page.locator('#search').inputValue(),'2026');
    await page.locator('#tab-review').click();
    await page.getByRole('button',{name:'Ignore warning',exact:true}).click();assert.equal(await page.locator('.review-finding').count(),0);
    assert.equal((await diagnostics()).statisticsSummary.count,4);
    await page.locator('#review-show-ignored').check();assert.match(await page.locator('.review-finding').textContent(),/Ignored/);
    await page.evaluate(()=>{window.testDeny=true;});await page.locator('#save-review').click();
    await page.waitForFunction(()=>document.getElementById('review-save-status').textContent.includes('not granted'));assert.equal((await diagnostics()).reviewDirty,true);
    await page.evaluate(()=>{window.testDeny=false;window.testFailure='create';});await page.locator('#save-review').click();
    await page.waitForFunction(()=>document.getElementById('review-save-status').textContent.includes('create denial'));
    await page.evaluate(()=>{window.testFailure='write';});await page.locator('#save-review').click();await page.waitForFunction(()=>document.getElementById('review-save-status').textContent.includes('write failure'));
    await page.evaluate(()=>{window.testFailure=null;});await page.locator('#save-review').click();
    await page.waitForFunction(()=>!window.flightbookDiagnostics.reviewDirty);
    const saved=JSON.parse(await page.evaluate(()=>window.testRead('flightbook-review.json')));
    assert.equal(saved.excluded.length,1);assert.equal(saved.ignored.length,1);
    assert.deepEqual(await page.evaluate(()=>window.testOriginals()),originals);
    await page.reload();await page.locator('#folder').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===5);
    assert.equal((await diagnostics()).reviewExcluded,1);assert.equal((await diagnostics()).statisticsSummary.count,4);
    await page.locator('#tab-review').click();await page.locator('#review-category').selectOption('exact');assert.equal(await page.locator('.review-finding').count(),0);
    await page.locator('#review-show-ignored').check();await page.getByRole('button',{name:'Restore warning',exact:true}).click();
    await page.locator('.review-file').nth(1).getByRole('button',{name:'Include flight',exact:true}).click();assert.equal((await diagnostics()).statisticsSummary.count,5);
    await page.locator('#review-short-minutes').fill('20');await page.locator('#review-short-minutes').press('Tab');
    await page.locator('#review-category').selectOption('short');assert.equal(await page.locator('.review-finding').count(),5);
    await page.locator('#save-review').click();await page.waitForFunction(()=>!window.flightbookDiagnostics.reviewDirty);
    await page.locator('.review-file').first().getByRole('button',{name:'Exclude flight',exact:true}).click();
    await page.evaluate(()=>window.testWrite('flightbook-review.json',JSON.stringify({format:'local-flightbook-review',version:1,excluded:[],ignored:[],settings:{shortSeconds:120,toleranceMinutes:1}})));
    await page.locator('#save-review').click();await page.waitForFunction(()=>document.getElementById('review-save-status').textContent.includes('changed outside'));assert.equal((await diagnostics()).reviewDirty,true);
    // Explicit reconnect discards pending changes after confirmation and reloads external decisions.
    page.once('dialog',dialog=>dialog.accept());await page.locator('#folder').click();await page.waitForFunction(()=>!window.flightbookDiagnostics.reviewDirty);
    assert.equal((await diagnostics()).reviewExcluded,0);
    await page.evaluate(()=>window.testWrite('flightbook-review.json','{"format":"wrong"}'));await page.locator('#rescan').click();
    await page.waitForFunction(()=>document.getElementById('review-save-status').textContent.includes('will not be overwritten'));
    assert.equal(await page.locator('#save-review').isDisabled(),true);
    await page.evaluate(()=>window.testWrite('flightbook-review.json',JSON.stringify({format:'local-flightbook-review',version:1,excluded:[],ignored:[],settings:{shortSeconds:60,toleranceMinutes:5}})));
    await page.locator('#rescan').click();await page.locator('#tab-flightbook').click();
    await page.locator('.flight-item').filter({hasText:'Manual'}).click();await page.locator('#edit-manual').click();
    assert.equal(await page.locator('[name=startTime]').inputValue(),'12:00');
    await page.locator('[name=startTime]').fill('12:03');await page.evaluate(()=>{window.testSaveName='manual.json';});await page.locator('#save-manual').click();
    await page.waitForFunction(()=>document.getElementById('save-status').textContent.startsWith('Saved and loaded'));
    const edited=JSON.parse(await page.evaluate(()=>window.testRead('manual.json')));assert.equal(edited.startTimeUtc,'2026-06-01T10:03:00.000Z');assert.equal(edited.id,'manual');
    await page.locator('#close-manual').click();await page.locator('#tab-review').click();
    await page.screenshot({path:`validation/artifacts/${label}-review.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#theme').click();await page.screenshot({path:`validation/artifacts/${label}-review-mobile-dark.png`,fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    const report={browser:await browser.version(),reviewCategories:true,exclusions:true,localMapAndHeatmapExclusions:true,ignoreRestore:true,permissionDeniedRetry:true,createAndWriteFailureRetry:true,originalFilesUnchanged:true,reopen:true,externalConflictProtected:true,invalidReviewProtected:true,manualStartUTC:true,responsive:true,offlineNoHTTP:true,errors};
    await writeFile(`validation/${label}-review.json`,JSON.stringify(report,null,2)+'\n');console.log(label,JSON.stringify(report));
  }finally{await browser.close();}
}
