import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [label,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
 const tag=`xc-native-${label}`,root=resolve('.cache',`${tag}-${Date.now()}`),nested=join(root,'Flüge ü','Track copies');await mkdir(nested,{recursive:true});
 const text='AXXX\nHFDTE010624\n'+Array.from({length:6},(_,i)=>`B1200${String(i*10).padStart(2,'0')}4700000N008${String(i*100).padStart(5,'0')}EA0100001100`).join('\n');
 await writeFile(join(nested,'a.igc'),text);await writeFile(join(nested,'copy.IGC'),text);
 const browser=await chromium.launch({executablePath,headless:false,chromiumSandbox:true,args:['--force-renderer-accessibility',`--flightbook-validation=${tag}`]});
 try{
  const context=await browser.newContext({offline:true,viewport:{width:1400,height:1100}});await context.addInitScript(()=>{window.xcJobs=0;const OriginalWorker=window.Worker;window.Worker=class extends OriginalWorker{postMessage(data,...args){if(data.points&&data.key)window.xcJobs++;super.postMessage(data,...args);}};});
  const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  function native(action,path=''){console.log(execFileSync('powershell',['-NoProfile','-File','scripts/native-dialog.ps1','-Action',action,'-Path',path,'-OwnerTag',tag],{encoding:'utf8',timeout:15000}).trim());}
  async function connect(){await page.locator('#folder').click();await page.waitForTimeout(700);native('choose',root);await page.waitForTimeout(700);native('allow');await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===2);}
  await page.goto(pathToFileURL(resolve('dashboard.html')).href);await connect();assert.equal(await page.evaluate(()=>window.xcJobs),0);
  await page.locator('#calculate-xc').click();await page.waitForTimeout(1000);
  native('allow');
  await page.waitForFunction(()=>window.flightbookDiagnostics.xcDatabaseEntries===1&&!window.flightbookDiagnostics.xcDatabaseDirty&&!window.flightbookDiagnostics.xcPending);
  const db=JSON.parse(await readFile(join(root,'flightbook-xc.json'),'utf8'));assert.equal(Object.keys(db.entries).length,1);assert.equal(await page.evaluate(()=>window.xcJobs),1);
  assert.equal(await readFile(join(nested,'a.igc'),'utf8'),text);assert.equal(await readFile(join(nested,'copy.IGC'),'utf8'),text);
  await page.reload();await connect();assert.equal(await page.evaluate(()=>window.xcJobs),0);assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.xcProcessed),2);assert.equal(await page.locator('#calculate-xc').isDisabled(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const report={browser:await browser.version(),nativeFolderAndWritePermission:true,rootDatabaseSaved:true,duplicateCalculatedOnce:true,reopenNoWorkerJobs:true,originalIGCUnchanged:true,noHTTP:true,errors};await writeFile(`validation/${tag}.json`,JSON.stringify(report,null,2)+'\n');console.log(tag,JSON.stringify(report));
 }catch(error){for(const context of browser.contexts())for(const page of context.pages()){console.log(await page.evaluate(()=>({status:document.getElementById('xc-status')?.textContent,diagnostics:window.flightbookDiagnostics})));await page.screenshot({path:`validation/artifacts/${tag}-failure.png`,fullPage:true});}throw error;}finally{await browser.close();}
}
