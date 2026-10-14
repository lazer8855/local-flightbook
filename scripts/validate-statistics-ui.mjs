// Controlled data checks complement the native file-dialog integration suite.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [label,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
  const browser=await chromium.launch({executablePath,chromiumSandbox:true});
  try{
    const context=await browser.newContext({offline:true,viewport:{width:1400,height:1000}});
    await context.addInitScript(()=>{
      const files=new Map();
      const definitions=[['2020-06-01',60,10],['2021-06-01',120,20],['2022-06-01',.5,undefined],['2022-07-01',60,0],['2026-10-01',45,undefined],['2026-10-14',5,30]];
      for(const [i,[date,minutes,km]]of definitions.entries())files.set(`${i}.json`,JSON.stringify({format:'local-flightbook',version:1,id:`test-${i}`,date,durationSeconds:minutes*60,site:'Fixture site',...(km===undefined?{}:{openXcDistanceKm:km})}));
      window.fixtureWrites=0;
      const handles=new Map();
      function handle(name){if(handles.has(name))return handles.get(name);const result={kind:'file',name,getFile:async()=>new File([files.get(name)||''],name),isSameEntry:async other=>other.name===name,createWritable:async()=>{
        if(window.fixtureFailure==='create')throw new Error('Simulated denied write');
        let value;return {write:async text=>{if(window.fixtureFailure==='write')throw new Error('Simulated write failure');value=text;},close:async()=>{files.set(name,value);window.fixtureWrites++;},abort:async()=>{}};
      }};handles.set(name,result);return result;}
      window.showDirectoryPicker=async()=>({name:'Controlled flights',async *entries(){for(const name of files.keys())yield [name,handle(name)];}});
      window.showSaveFilePicker=async options=>{if(window.fixtureCancel)throw new DOMException('Cancelled','AbortError');return handle(window.fixtureSaveName||options.suggestedName);};
      window.fixtureRead=name=>JSON.parse(files.get(name));
    });
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    await page.goto(pathToFileURL(resolve('dashboard.html')).href);
    await page.locator('#folder').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===6);
    const diagnostics=()=>page.evaluate(()=>window.flightbookDiagnostics);
    assert.equal((await diagnostics()).statisticsSummary.openXcKm,60);
    assert.deepEqual((await diagnostics()).statisticsSummary.coverage,{total:6,known:4,calculated:0,manual:4,unavailable:2,approximate:0});
    const selected=(await diagnostics()).selectedPath;
    await page.locator('#tab-statistics').click();assert.equal((await diagnostics()).selectedPath,selected);
    assert.equal(await page.locator('.summary-cell').count(),4);assert.equal(await page.locator('.activity-pair .chart-panel').count(),2);
    await page.locator('#stats-year').selectOption('2021');
    assert.equal((await diagnostics()).statisticsSummary.count,1);assert.equal((await diagnostics()).statisticsGranularity,'month');
    assert.deepEqual((await diagnostics()).referenceYears,[2020,2022]);
    assert.equal(await page.locator('.activity-column').count(),24);
    await page.locator('#stats-month').selectOption('6');assert.equal((await diagnostics()).statisticsGranularity,'day');
    assert.equal(await page.locator('#activity-chart-1 .activity-column').count(),30);
    await page.locator('#period-next').click();assert.equal((await diagnostics()).statisticsSummary.count,0);
    assert.ok(await page.locator('#stats-year option[value="2020"]').count());
    await page.locator('#clear-filters').click();await page.locator('#filter-toggle').click();
    await page.locator('[data-minutes="60"]').click();assert.equal((await diagnostics()).statisticsSummary.count,3);
    assert.match(await page.locator('#filter-chips').textContent(),/Duration ≥ 60/);
    await page.locator('#duration-max').fill('30');assert.equal((await diagnostics()).statisticsSummary.count,0);
    assert.match(await page.locator('#filter-summary').textContent(),/Minimum duration/);
    await page.locator('#clear-filters').click();await page.locator('#hide-short').check();assert.equal((await diagnostics()).statisticsSummary.count,5);
    await page.locator('#clear-filters').click();await page.locator('#xc-min').fill('0');assert.equal((await diagnostics()).statisticsSummary.count,4);
    await page.locator('#tab-flightbook').click();assert.equal(await page.locator('.flight-item').count(),4);assert.match(await page.locator('#compact-coverage').textContent(),/4 manual/);
    await page.locator('#clear-filters').click();await page.locator('#tab-statistics').click();
    await page.locator('[data-focus-key="day-2026-10-14"]').click();
    assert.equal((await diagnostics()).statisticsSummary.count,1);assert.equal((await diagnostics()).statisticsPeriod.from,'2026-10-14');
    await page.locator('#clear-filters').click();await page.locator('[data-preset="custom"]').click();
    await page.locator('#date-from').fill('2022-06-01');await page.locator('#date-from').press('Tab');
    await page.locator('#date-to').fill('2022-07-01');await page.locator('#date-to').press('Tab');
    assert.equal((await diagnostics()).statisticsSummary.count,2);
    await page.locator('#clear-filters').click();
    await page.locator('#advanced-statistics summary').click();await page.locator('.scatter-point.manual').first().waitFor();assert.equal(await page.locator('.scatter-point.manual').count(),4);
    await page.screenshot({path:`validation/artifacts/${label}-statistics-redesign.png`,fullPage:true});
    await page.locator('.scatter-point.manual').first().focus();await page.keyboard.press('Enter');assert.equal((await diagnostics()).dashboardView,'flightbook');
    await page.locator('#tab-statistics').click();await page.locator('#personal-bests button').last().click();assert.equal((await diagnostics()).selectedManualId,'test-5');
    await page.locator('#edit-manual').click();assert.equal(await page.locator('[name=openXcDistanceKm]').inputValue(),'30');
    await page.locator('[name=openXcDistanceKm]').fill('35');await page.evaluate(()=>{window.fixtureCancel=true;});await page.locator('#save-manual').click();
    assert.match(await page.locator('#save-status').textContent(),/cancelled/);assert.equal(await page.locator('[name=openXcDistanceKm]').inputValue(),'35');
    await page.evaluate(()=>{window.fixtureCancel=false;window.fixtureFailure='write';});await page.locator('#save-manual').click();assert.match(await page.locator('#save-status').textContent(),/write failure/);
    assert.equal(await page.evaluate(()=>window.fixtureRead('5.json').openXcDistanceKm),30);
    await page.evaluate(()=>{window.fixtureFailure=null;});await page.locator('#save-manual').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved and loaded'));
    assert.equal(await page.evaluate(()=>window.fixtureRead('5.json').id),'test-5');assert.equal(await page.evaluate(()=>window.fixtureRead('5.json').openXcDistanceKm),35);assert.equal((await diagnostics()).flightCount,6);
    await page.locator('#close-manual').click();await page.locator('#edit-manual').click();await page.locator('[name=openXcDistanceKm]').fill('0');
    await page.evaluate(()=>{window.fixtureSaveName='copy.json';});await page.locator('#save-manual').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===7);
    assert.notEqual(await page.evaluate(()=>window.fixtureRead('copy.json').id),'test-5');assert.equal(await page.evaluate(()=>window.fixtureRead('copy.json').openXcDistanceKm),0);
    assert.equal(await page.evaluate(()=>window.fixtureRead('5.json').openXcDistanceKm),35);await page.locator('#close-manual').click();
    await page.locator('#add-manual').click();await page.locator('[name=durationMinutes]').fill('20');await page.locator('[name=openXcDistanceKm]').fill('12');
    await page.evaluate(()=>{window.fixtureSaveName='protected.igc';});const writes=await page.evaluate(()=>window.fixtureWrites);await page.locator('#save-manual').click();assert.match(await page.locator('#save-status').textContent(),/IGC files cannot be overwritten/);assert.equal(await page.evaluate(()=>window.fixtureWrites),writes);
    await page.locator('#close-manual').click();
    await page.setViewportSize({width:390,height:844});await page.locator('#tab-statistics').click();await page.screenshot({path:`validation/artifacts/${label}-statistics-mobile.png`,fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    await page.locator('#theme').click();await page.screenshot({path:`validation/artifacts/${label}-statistics-mobile-dark.png`,fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    const report={browser:await browser.version(),sharedFilters:true,manualEdit:true,manualCopy:true,cancelAndFailureKeepsForm:true,igcOverwriteBlocked:true,responsive:true,offlineNoHTTPRequests:true,errors};
    await writeFile(`validation/${label}-statistics-redesign.json`,JSON.stringify(report,null,2)+'\n');console.log(label,JSON.stringify(report));
  }finally{await browser.close();}
}
