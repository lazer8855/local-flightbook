import { REVIEW_FILENAME, emptyReview, parseReview, reviewIdentity, buildReview, applyReview, flightStart } from './review.mjs';
import { timeText } from './dashboard-ui.mjs';

const $=id=>document.getElementById(id);
const node=(tag,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;el.className=className;return el;};
const labels={exact:'Exact duplicates','manual-id':'Repeated manual IDs','recording-match':'Similar IGC recordings','manual-match':'Manual / IGC matches',short:'Short recordings',suspicious:'Suspicious recordings',import:'Import failures'};
export function setupReview(getFlights,getIssues,getDirectory,onChange,onInspect){
  let decisions=emptyReview(),directory=null,dirty=false,blocked=false,saving=false,originalText=null,findings=[];
  function apply(){applyReview(getFlights(),decisions);onChange();render();}
  function change(action){action();dirty=true;apply();}
  async function readFile(root){
    try{const handle=await root.getFileHandle(REVIEW_FILENAME);return {handle,text:await (await handle.getFile()).text()};}
    catch(error){if(error.name==='NotFoundError')return {handle:null,text:null};throw error;}
  }
  async function load(){
    const next=getDirectory();
    if(next!==directory){directory=next;decisions=emptyReview();dirty=false;blocked=false;originalText=null;}
    if(!directory){render();return;}
    if(!dirty){
      try{
        const saved=directory.getFileHandle?await readFile(directory):{text:null};
        decisions=saved.text===null?emptyReview():parseReview(saved.text);originalText=saved.text;blocked=false;
        $('review-save-status').textContent=saved.text===null?'No saved decisions yet. Save decisions creates flightbook-review.json in this flight folder.':'Loaded decisions from flightbook-review.json.';
      }catch(error){blocked=true;$('review-save-status').textContent=`Could not load review decisions: ${error.message}. Existing file will not be overwritten. Fix the file, then rescan to retry.`;}
    }
    apply();
  }
  async function save(){
    if(!directory||saving||blocked)return;
    saving=true;render();const root=directory,snapshot=JSON.stringify(decisions,null,2)+'\n';
    try{
      if(root.requestPermission&&await root.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Write permission was not granted. Your decisions are kept; click Save decisions to retry.');
      const current=await readFile(root);
      if(current.text!==originalText)throw new Error('Review file changed outside this dashboard. Reconnect the folder to reload it before saving; pending decisions have been kept.');
      const handle=current.handle||await root.getFileHandle(REVIEW_FILENAME,{create:true});
      if(!current.handle){
        const createdText=await (await handle.getFile()).text();
        if(createdText!=='')throw new Error('Review file was created by another writer. Reconnect the folder before saving.');
        if(root===directory)originalText=''; // A failed first write may leave our new, empty file; allow retry.
      }
      const writable=await handle.createWritable();
      try{await writable.write(snapshot);await writable.close();}catch(error){await writable.abort().catch(()=>{});throw error;}
      if(root===directory){originalText=snapshot;dirty=JSON.stringify(decisions,null,2)+'\n'!==snapshot;$('review-save-status').textContent=`Saved ${REVIEW_FILENAME} in ${root.name}.${dirty?' Newer changes still need saving.':''}`;}
    }catch(error){if(root===directory)$('review-save-status').textContent=`Could not save: ${error.message}`;}
    finally{saving=false;render();}
  }
  $('save-review').addEventListener('click',save);
  for(const id of ['review-category','review-show-ignored','review-search'])$(id).addEventListener('input',render);
  for(const [id,key,multiplier,max]of [['review-short-minutes','shortSeconds',60,1440],['review-tolerance','toleranceMinutes',1,120],['review-invalid-fixes','maxInvalidFixes',1,Number.MAX_SAFE_INTEGER]])$(id).addEventListener('change',()=>{
    const value=$(id).valueAsNumber;
    if(!Number.isFinite(value)||value<0||value>max){$('review-save-status').textContent=`Enter a value from 0 to ${max}.`;return;}
    if(key==='maxInvalidFixes'&&!Number.isSafeInteger(value)){$('review-save-status').textContent='Allowed invalid GPS fixes must be a non-negative whole number.';return;}
    change(()=>{decisions.settings[key]=value*multiplier;});
  });
  function exclude(flight,value){change(()=>{const key=reviewIdentity(flight);decisions.excluded=decisions.excluded.filter(id=>id!==key);if(value)decisions.excluded.push(key);});}
  function button(text,action){const el=node('button',text,'secondary');el.type='button';el.addEventListener('click',action);return el;}
  function render(){
    findings=buildReview(getFlights(),getIssues(),decisions);
    const excluded=getFlights().filter(f=>f.reviewExcluded).length;
    $('review-count').textContent=findings.filter(f=>!f.ignored).length;
    $('review-overview').textContent=`${findings.filter(f=>!f.ignored).length} active findings · ${excluded} excluded files · ${findings.filter(f=>f.ignored).length} ignored findings${dirty?' · Unsaved decisions':''}`;
    $('save-review').disabled=!directory||!dirty||saving||blocked;$('save-review').textContent=saving?'Saving…':'Save decisions';
    $('review-short-minutes').value=decisions.settings.shortSeconds/60;$('review-tolerance').value=decisions.settings.toleranceMinutes;
    $('review-invalid-fixes').value=decisions.settings.maxInvalidFixes;
    const category=$('review-category');if(category.options.length===1)for(const [key,label]of Object.entries(labels))category.add(new Option(label,key));
    $('review-category-counts').textContent=Object.entries(labels).map(([key,label])=>`${label}: ${findings.filter(f=>f.category===key&&!f.ignored).length}`).join(' · ');
    const search=$('review-search').value.trim().toLocaleLowerCase();
    const visible=findings.filter(f=>(!category.value||f.category===category.value)&&($('review-show-ignored').checked||!f.ignored)&&[...f.reasons,...f.flights.flatMap(f=>[f.path,f.site,f.date]),f.path].join(' ').toLocaleLowerCase().includes(search));
    const host=$('review-findings');host.replaceChildren();
    for(const finding of visible){
      const card=node('article','','panel review-finding');card.dataset.category=finding.category;
      card.append(node('h2',`${labels[finding.category]} · ${finding.confidence}${finding.ignored?' · Ignored':''}`));
      const reasons=node('ul');for(const reason of finding.reasons)reasons.append(node('li',reason));card.append(reasons);
      if(finding.path)card.append(node('p',finding.path,'path'));
      const group=node('div','','review-files');
      for(const flight of finding.flights){
        const file=node('section','','review-file');file.append(node('h3',flight.path,'path'));
        const start=flightStart(flight);
        file.append(node('p',`${flight.type==='manual'?'Manual':'IGC'} · ${flight.date||'No date'} · ${timeText(flight.durationSeconds)} · ${flight.site||'No site'}`));
        file.append(node('p',Number.isFinite(start)?`Start: ${new Date(start).toLocaleString()} local · ${new Date(start).toISOString()} UTC`:'Start time unavailable; only a low-confidence date/duration comparison is possible.','muted'));
        if(flight.notes)file.append(node('p',flight.notes));
        file.append(node('strong',flight.reviewExcluded?'Excluded from statistics and map overviews':'Included in statistics and maps',flight.reviewExcluded?'warning':''));
        const actions=node('div','','review-actions');actions.append(button('Open flight',()=>onInspect(flight)),button(flight.reviewExcluded?'Include flight':'Exclude flight',()=>exclude(flight,!flight.reviewExcluded)));
        if(finding.flights.length>1)actions.append(button('Count only this entry',()=>change(()=>{
          const members=new Set(finding.flights.map(reviewIdentity));decisions.excluded=decisions.excluded.filter(id=>!members.has(id));
          decisions.excluded.push(...finding.flights.filter(f=>f!==flight).map(reviewIdentity));
        })));
        file.append(actions);group.append(file);
      }
      card.append(group,button(finding.ignored?'Restore warning':'Ignore warning',()=>change(()=>{
        decisions.ignored=decisions.ignored.filter(id=>id!==finding.id);if(!finding.ignored)decisions.ignored.push(finding.id);
      })));host.append(card);
    }
    if(!visible.length)host.append(node('p',directory?'No findings match this review selection.':'Choose a flight folder to review its files.','panel empty'));
    // Excluded entries remain recoverable even when a matching file is removed or thresholds change.
    const excludedHost=$('review-excluded');excludedHost.replaceChildren();
    for(const flight of getFlights().filter(f=>f.reviewExcluded)){const row=node('p',flight.path,'path');row.append(button('Include flight',()=>exclude(flight,false)));excludedHost.append(row);}
    $('review-excluded-section').hidden=!excluded;
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  render();
  return {load,reconnect(){directory=null;dirty=false;},get dirty(){return dirty;},get findings(){return findings;},get excludedCount(){return getFlights().filter(f=>f.reviewExcluded).length;}};
}
