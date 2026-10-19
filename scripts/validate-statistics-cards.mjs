import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('validation/artifacts',{recursive:true});
for(const [label,executablePath]of [['chrome','C:/Program Files/Google/Chrome/Application/chrome.exe'],['edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']]){
  const browser=await chromium.launch({executablePath,chromiumSandbox:true});
  try{
    const context=await browser.newContext({offline:true,viewport:{width:1400,height:1000}});
    await context.addInitScript(()=>{
      const files=new Map();
      for(let year=1995;year<=2026;year++)files.set(`${year}.json`,JSON.stringify({format:'local-flightbook',version:1,id:`year-${year}`,date:`${year}-06-01`,durationSeconds:year===1995?1:(year%5+1)*3600,openXcDistanceKm:year%8}));
      window.showDirectoryPicker=async()=>({name:'Thirty-two recorded years',async *entries(){for(const [name,text]of files)yield [name,{kind:'file',name,getFile:async()=>new File([text],name)}];}});
    });
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    await page.goto(pathToFileURL(resolve('dashboard.html')).href);await page.locator('#folder').click();await page.waitForFunction(()=>window.flightbookDiagnostics.flightCount===32);
    await page.locator('#tab-statistics').click();
    const dialog=page.locator('#statistics-full-window');
    async function fits(){
      for(const id of ['activity-chart-1','activity-chart-2']){
        assert.equal(await page.locator(`#${id} .activity-column`).count(),32);
        const geometry=await page.locator(`#${id} .activity-bars`).evaluate(el=>{const rect=el.getBoundingClientRect();return {width:el.clientWidth,scroll:el.scrollWidth,expanded:!!el.closest('#statistics-full-window'),visible:[...el.children].filter(child=>{const b=child.getBoundingClientRect();return b.right>rect.left+1&&b.left<rect.left+el.clientWidth-1;}).length,labels:[...el.querySelectorAll('.column-label')].map(l=>l.textContent)};});
        assert.ok(geometry.width>0);
        if(geometry.expanded)assert.ok(geometry.scroll<=geometry.width+1);else{assert.ok(geometry.scroll>geometry.width);assert.equal(geometry.visible,10);}
        assert.equal(geometry.labels[0],'1995');assert.equal(geometry.labels.at(-1),'2026');
      }
    }
    await fits();assert.equal(await page.locator('#statistics-view .stat-expand-button').count(),14);
    const normalBars=page.locator('#activity-chart-1 .activity-bars');
    const savedScroll=await normalBars.evaluate(el=>{el.scrollLeft=(el.scrollWidth-el.clientWidth)/2;return el.scrollLeft;});
    await page.locator('#activity-chart-1').locator('..').getByRole('button',{name:/Expand/}).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(expected=>Math.abs(document.querySelector('#activity-chart-1 .activity-bars').scrollLeft-expected)<2,savedScroll);
    await normalBars.evaluate(el=>{el.scrollLeft=0;});
    await page.locator('#advanced-statistics > summary').click();
    const names=await page.locator('#statistics-view .stat-expand-button').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label')));
    for(const name of names){
      const button=page.getByRole('button',{name,exact:true});await button.click();
      assert.equal(await dialog.isVisible(),true);
      const size=await dialog.boundingBox();assert.equal(Math.round(size.width),1400);assert.equal(Math.round(size.height),1000);assert.equal(Math.round(size.x),0);assert.equal(Math.round(size.y),0);
      await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.getElementById('statistics-full-window').contains(document.activeElement)),true);
      await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
      await page.waitForFunction(label=>document.activeElement?.getAttribute('aria-label')===label,name);
    }
    assert.equal(await page.locator('#advanced-statistics').evaluate(el=>el.open),true);
    // Updates keep an expanded summary card connected and restore its original position.
    await page.getByRole('button',{name:'Expand Recorded airtime',exact:true}).click();
    await page.evaluate(()=>{const input=document.getElementById('search');input.value='2020';input.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await dialog.locator('.summary-cell').count(),1);
    assert.equal(await dialog.locator('.summary-cell > strong').textContent(),'1 h 0 min');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#statistics-cards > .summary-cell').count(),4);await page.locator('#clear-filters').click();
    await page.locator('#advanced-statistics > summary').click();
    await page.getByRole('button',{name:'Expand Advanced statistics',exact:true}).click();
    assert.equal(await dialog.locator('#advanced-statistics').evaluate(el=>el.open),true);
    await dialog.getByRole('button',{name:'Close (Esc)',exact:true}).click();assert.equal(await page.locator('#advanced-statistics').evaluate(el=>el.open),false);
    // Expanded bars use the newly available width; metric changes keep the dialog live.
    await page.locator('#activity-chart-1').locator('..').getByRole('button',{name:/Expand/}).click();
    await fits();
    await page.locator('#activity-metric-1').selectOption('count');
    assert.match(await page.locator('#statistics-full-window-title').textContent(),/Flights by year/);
    await page.waitForFunction(()=>document.querySelector('#statistics-full-window .column-value.value-fits'));
    assert.ok(await dialog.locator('.column-fill > .column-value.value-fits').count()>0);
    assert.equal(await dialog.locator('.column-value.value-fits').first().evaluate(el=>getComputedStyle(el).writingMode),'vertical-rl');
    assert.equal(await dialog.locator('.column-value.value-fits').evaluateAll(values=>values.every(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;})),true);
    await page.screenshot({path:`validation/artifacts/${label}-statistics-expanded.png`});
    await dialog.locator('.activity-column').last().click();
    assert.equal(await dialog.isVisible(),true);assert.equal(await page.evaluate(()=>window.flightbookDiagnostics.statisticsPeriod.year),2026);
    assert.match(await dialog.textContent(),/2026|Jun/);
    await page.keyboard.press('Escape');await page.locator('#clear-filters').click();
    await page.locator('#activity-metric-1').selectOption('durationSeconds');
    await page.setViewportSize({width:390,height:844});await fits();
    await page.waitForFunction(()=>document.querySelector('#activity-chart-1 .activity-bars').classList.contains('scrolling-years'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const visibleValues=page.locator('#activity-chart-1 .column-value.value-fits');assert.ok(await visibleValues.count()>0);
    assert.equal(await visibleValues.first().evaluate(el=>getComputedStyle(el).writingMode),'vertical-rl');
    assert.equal(await page.locator('#activity-chart-1 .activity-column').first().locator('.value-fits').count(),0);
    const inside=await visibleValues.evaluateAll(values=>values.every(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;}));assert.equal(inside,true);
    await page.locator('#theme').click();await page.screenshot({path:`validation/artifacts/${label}-statistics-years-mobile.png`,fullPage:true});
    await page.locator('#activity-chart-1').locator('..').getByRole('button',{name:/Expand/}).click();
    await page.waitForFunction(()=>document.querySelector('#statistics-full-window .activity-bars').classList.contains('horizontal-years'));
    assert.equal(await dialog.locator('.column-value.value-fits').first().evaluate(el=>getComputedStyle(el).writingMode),'horizontal-tb');
    await fits();
    assert.equal(await dialog.locator('.activity-bars').evaluate(el=>{const rect=el.getBoundingClientRect();return rect.bottom<=innerHeight;}),true);
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await page.screenshot({path:`validation/artifacts/${label}-statistics-expanded-mobile.png`});
    await page.keyboard.press('Escape');
    // A shorter archive returns to vertical bars and keeps every year visible.
    await page.locator('[data-preset="custom"]').click();await page.locator('#date-from').fill('2020-01-01');await page.locator('#date-from').press('Tab');await page.locator('#date-to').fill('2026-12-31');await page.locator('#date-to').press('Tab');
    await page.setViewportSize({width:1800,height:1100});
    await page.waitForFunction(()=>!document.querySelector('#activity-chart-1 .activity-bars').classList.contains('horizontal-years'));
    assert.equal(await page.locator('#activity-chart-1 .activity-column').count(),7);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    const report={browser:await browser.version(),all14CardsExpand:true,escapeAndFocusReturn:true,advancedOpenStatePreserved:true,liveMetricAndDateFilters:true,normalViewShows10Years:true,expandedShowsAll32Years:true,adaptiveOrientation:true,valuesInsideBars:true,smallValuesAccessible:true,responsiveDark:true,noHTTP:true,errors};
    await writeFile(`validation/${label}-statistics-cards.json`,JSON.stringify(report,null,2)+'\n');console.log(label,JSON.stringify(report));
  }finally{await browser.close();}
}
