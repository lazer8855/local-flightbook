import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [label,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
 const browser=await chromium.launch({executablePath,chromiumSandbox:true});
 try{
  const context=await browser.newContext({offline:true,timezoneId:'Europe/Zurich',viewport:{width:1440,height:1200}});
  await context.addInitScript(()=>{
   function coord(n,lat){const absolute=Math.abs(n),d=Math.floor(absolute),minutes=Math.round((absolute-d)*60000);return String(d).padStart(lat?2:3,'0')+String(minutes).padStart(5,'0')+(lat?(n>=0?'N':'S'):(n>=0?'E':'W'));}
   function track(lon){return 'AXXX\nHFDTE010624\nHFPLTPILOTINCHARGE:Analysis Pilot\nHFGIDGLIDERID:CH-TEST\nHFGTYGLIDERTYPE:Test Wing\n'+Array.from({length:12},(_,i)=>{
    const t=(86340+i*20)%86400,clock=[Math.floor(t/3600),Math.floor(t%3600/60),t%60].map(n=>String(n).padStart(2,'0')).join('');
    return `B${clock}${coord(46.72+i*.001,true)}${coord(lon+i*.003,false)}A${String(1600+i*10).padStart(5,'0')}${String(1650+i*11).padStart(5,'0')}`;
   }).join('\n');}
   const files=new Map([['inside.igc',track(7.7)],['outside.igc',track(80)],['manual.json',JSON.stringify({format:'local-flightbook',version:1,id:'manual',date:'2024-05-01',durationSeconds:600})]]);
   const handle=name=>({kind:'file',name,getFile:async()=>new File([files.get(name)||''],name),createWritable:async()=>{let value;return{write:async text=>{value=text;},close:async()=>files.set(name,value),abort:async()=>{}};}});
   window.showDirectoryPicker=async()=>({name:'Flight analysis fixtures',requestPermission:async()=> 'granted',getFileHandle:async(name,options={})=>{if(!files.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');files.set(name,'');}return handle(name);},async *entries(){for(const [name]of files)yield [name,handle(name)];}});
  });
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(pathToFileURL(resolve('dashboard.html')).href);await page.locator('#folder').click();
  await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===3);
  assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.xcProcessed),0);
  await page.locator('#calculate-xc').click();
  await page.waitForFunction(()=>window.flightbookDiagnostics.selectedXC?.open?.routePoints?.length>0);
  assert.match(await page.locator('#flight-detail').textContent(),/Analysis Pilot/);assert.match(await page.locator('#flight-detail').textContent(),/CH-TEST/);
  assert.match(await page.locator('#flight-detail').textContent(),/2024-06-02 00:02:40 UTC/);
  assert.equal(await page.locator('#flight-profile .profile-gps').count(),1);assert.equal(await page.locator('#flight-profile .profile-baro').count(),1);
  assert.equal(await page.locator('#moment-ground').textContent(),'Unavailable');assert.equal(await page.locator('#show-xc-route').isEnabled(),true);
  assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.openRouteFeatures),3);
  await page.locator('#show-xc-route').uncheck();assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.openRouteFeatures),0);await page.locator('#show-xc-route').check();
  await page.locator('#flight-timeline').focus();await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.analysisIndex),11);assert.match(await page.locator('#moment-time').textContent(),/2024-06-02 00:02:40 UTC/);
  const cursor=await page.evaluate(()=>window.flightbookDiagnostics);assert.deepEqual(cursor.analysisMapCursor,[cursor.analysisCursor.lon,cursor.analysisCursor.lat]);
  assert.match(await page.locator('#moment-speed').textContent(),/km\/h/);
  await page.locator('#flight-timeline').press('Home');assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.analysisIndex),0);
  const box=await page.locator('#flight-profile').boundingBox();await page.mouse.move(box.x+box.width*.7,box.y+60);
  assert.ok(await page.evaluate(()=>window.flightbookDiagnostics.analysisIndex)>0);
  await page.locator('#map-file').setInputFiles(resolve('europe.pmtiles'));await page.waitForFunction(()=>window.flightbookDiagnostics.mapLoaded);
  await page.locator('#flight-timeline').focus();await page.keyboard.press('End');
  const mapBox=await page.locator('#map').boundingBox();await page.locator('#map').click({position:{x:mapBox.width/2,y:mapBox.height/2}});
  assert.ok(await page.evaluate(()=>window.flightbookDiagnostics.analysisIndex)<11);
  await page.locator('#terrain-file').setInputFiles(resolve('terrain-alps.pmtiles'));
  await page.waitForFunction(()=>document.getElementById('profile-terrain-status').textContent.includes('samples available'),null,{timeout:90000});
  await page.waitForFunction(()=>document.getElementById('moment-ground').textContent!=='Unavailable');
  assert.equal(await page.locator('#flight-profile .profile-ground').count(),1);assert.doesNotMatch(await page.locator('#moment-agl').textContent(),/Unavailable/);
  const readings=await page.evaluate(()=>({gps:parseFloat(document.getElementById('moment-gps').textContent),ground:parseFloat(document.getElementById('moment-ground').textContent),agl:parseFloat(document.getElementById('moment-agl').textContent)}));
  assert.ok(Math.abs(readings.gps-readings.ground-readings.agl)<=1);
  await page.locator('#map-expand').click();assert.equal(await page.locator('#flight-profile').isVisible(),true);
  await page.locator('#flight-timeline').focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.analysisIndex),11);
  await page.screenshot({path:`validation/artifacts/${label}-flight-analysis-expanded.png`});await page.keyboard.press('Escape');
  await page.locator('#map-3d').click();await page.waitForFunction(()=>window.flightbookDiagnostics.terrainActive);assert.equal(await page.locator('#flight-profile').isVisible(),true);
  await page.locator('#map-mode').selectOption('tracks');assert.equal(await page.locator('#flight-analysis').isVisible(),false);assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.openRouteFeatures),0);
  await page.locator('#map-mode').selectOption('single');
  await page.locator('.flight-item').filter({hasText:'outside.igc'}).click();
  await page.waitForFunction(()=>document.getElementById('profile-terrain-status').textContent.includes('0/12 samples'));
  assert.equal(await page.locator('#moment-ground').textContent(),'Unavailable');assert.equal(await page.locator('#moment-agl').textContent(),'Unavailable');
  await page.locator('.flight-item').filter({hasText:'manual.json'}).click();assert.equal(await page.locator('#flight-analysis-empty').isVisible(),true);assert.equal(await page.locator('#flight-analysis-data').isVisible(),false);assert.equal(await page.locator('#show-xc-route').isEnabled(),false);
  await page.locator('.flight-item').filter({hasText:'inside.igc'}).click();
  await page.waitForFunction(()=>document.getElementById('moment-ground').textContent!=='Unavailable');
  await page.locator('#terrain-file').setInputFiles(resolve('terrain-world.pmtiles'));
  await page.waitForFunction(()=>document.getElementById('profile-terrain-status').textContent.includes('zoom 8')&&document.getElementById('profile-terrain-status').textContent.includes('samples available'),null,{timeout:90000});
  assert.doesNotMatch(await page.locator('#moment-agl').textContent(),/Unavailable/);
  await page.setViewportSize({width:390,height:844});await page.locator('#theme').click();await page.screenshot({path:`validation/artifacts/${label}-flight-analysis-mobile.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#search').fill('no flight matches');assert.equal(await page.locator('#flight-analysis-data').isVisible(),false);assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.analysisCursor),null);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const report={browser:await browser.version(),profileAndSlider:true,linkedMapCursor:true,mapClickToProfile:true,utcMidnight:true,metadata:true,openRouteEndpointsAndLegs:true,localTerrainProfile:true,worldTerrainReplacement:true,aglApproximation:true,outsideCoverageUnknown:true,manualUnavailable:true,fullWindowAnd3D:true,responsiveDark:true,noHTTP:true,errors};
  await writeFile(`validation/${label}-flight-analysis.json`,JSON.stringify(report,null,2)+'\n');console.log(label,JSON.stringify(report));
 }finally{await browser.close();}
}
