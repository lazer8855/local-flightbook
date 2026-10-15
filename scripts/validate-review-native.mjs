import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [browserLabel,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
  const label=`review-native-${browserLabel}`,root=resolve('.cache',`${label}-${Date.now()}`),nested=join(root,'Flüge ü','Device copies');
  await mkdir(nested,{recursive:true});
  const track='AXXX\nHFDTE010626\nB1000004700000N00800000EA0050000600\nB1000304700000N00800000EA0050000600\n';
  await writeFile(join(nested,'a.igc'),track);await writeFile(join(nested,'copy.IGC'),track);
  const browser=await chromium.launch({executablePath,headless:false,chromiumSandbox:true,args:['--force-renderer-accessibility',`--flightbook-validation=${label}`]});
  try{
    const context=await browser.newContext({offline:true,viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[],network=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
    const wait=()=>page.waitForTimeout(700);
    function native(action,path=''){console.log(execFileSync('powershell',['-NoProfile','-File','scripts/native-dialog.ps1','-Action',action,'-Path',path,'-OwnerTag',label],{encoding:'utf8',timeout:15000}).trim());}
    async function connect(){await page.locator('#folder').click();await wait();native('choose',root);await wait();native('allow');await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===2);}
    await page.goto(pathToFileURL(resolve('dashboard.html')).href);await wait();await connect();
    await page.locator('#tab-review').click();await page.locator('#review-category').selectOption('exact');
    await page.locator('.review-file').first().getByRole('button',{name:'Count only this entry',exact:true}).click();
    await page.locator('#save-review').click();await wait();native('allow');
    await page.waitForFunction(()=>!window.flightbookDiagnostics.reviewDirty);
    const saved=JSON.parse(await readFile(join(root,'flightbook-review.json'),'utf8'));assert.equal(saved.excluded.length,1);
    assert.equal(await readFile(join(nested,'a.igc'),'utf8'),track);assert.equal(await readFile(join(nested,'copy.IGC'),'utf8'),track);
    await page.reload();await wait();await connect();
    assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.reviewExcluded),1);
    assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.statisticsSummary.count),1);
    await page.locator('#tab-review').click();await page.locator('#review-category').selectOption('exact');
    await page.locator('.review-file').nth(1).getByRole('button',{name:'Include flight',exact:true}).click();
    await page.locator('#save-review').click();await wait();native('allow');await page.waitForFunction(()=>!window.flightbookDiagnostics.reviewDirty);
    assert.equal(JSON.parse(await readFile(join(root,'flightbook-review.json'),'utf8')).excluded.length,0);
    assert.equal(await readFile(join(nested,'a.igc'),'utf8'),track);assert.equal(await readFile(join(nested,'copy.IGC'),'utf8'),track);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    const report={browser:await browser.version(),nativeFolderSelection:true,nativeReviewWritePermission:true,savedRootReviewFile:true,reopenPersistedExclusion:true,restore:true,originalIGCUnchanged:true,offlineNoHTTP:true,errors};
    await writeFile(`validation/${label}.json`,JSON.stringify(report,null,2)+'\n');console.log(label,JSON.stringify(report));
  }finally{await browser.close();}
}
