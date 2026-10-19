// Move the live card into a native modal so controls, charts and selection keep working.
export function setupStatisticsCards(onResize){
  const dialog=document.createElement('dialog');dialog.id='statistics-full-window';
  dialog.setAttribute('aria-labelledby','statistics-full-window-title');
  const heading=document.createElement('div');heading.className='statistics-window-heading';
  const title=document.createElement('h2');title.id='statistics-full-window-title';
  const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='Close (Esc)';
  const content=document.createElement('div');content.className='statistics-window-content';heading.append(title,close);dialog.append(heading,content);document.body.append(dialog);
  let active=null;
  function restore(){
    if(!active)return;
    const {card,placeholder,button,wasOpen,scrolls}=active;active=null;
    placeholder.replaceWith(card);
    if(wasOpen!==undefined)card.open=wasOpen;
    document.body.classList.remove('statistics-window-open');
    button.setAttribute('aria-expanded','false');
    requestAnimationFrame(()=>{onResize();for(const [el,left]of scrolls)if(el.isConnected)el.scrollLeft=left;if(button.isConnected)button.focus({preventScroll:true});});
  }
  function dismiss(){if(dialog.open)dialog.close();restore();}
  close.addEventListener('click',dismiss);
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button,select,input,a[href],summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  dialog.addEventListener('close',()=>{if(!dialog.open)restore();});
  function refresh(){
    if(active)title.textContent=active.card.querySelector(':scope > h2, :scope > h3, :scope > small, :scope > summary, :scope > .chart-heading h2')?.textContent.replace('⤢','').trim()||'Statistics';
    const cards=document.querySelectorAll('#statistics-view .summary-cell, #statistics-view .chart-panel, #statistics-view [data-stat-card]');
    for(const card of cards){
      if(card.querySelector(':scope > .stat-expand-button, :scope > summary > .stat-expand-button'))continue;
      card.classList.add('stat-expandable');
      const label=card.querySelector(':scope > h2, :scope > h3, :scope > small, :scope > summary, :scope > .chart-heading h2')?.textContent||'Statistics';
      const button=document.createElement('button');button.type='button';button.className='stat-expand-button secondary';button.textContent='⤢';
      button.title=`Expand ${label}`;button.setAttribute('aria-label',`Expand ${label}`);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',dialog.id);
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();if(active)return;
        const placeholder=document.createComment('Expanded statistics card');card.before(placeholder);
        active={card,placeholder,button,wasOpen:card.tagName==='DETAILS'?card.open:undefined,scrolls:[...card.querySelectorAll('.activity-bars')].map(el=>[el,el.scrollLeft])};
        title.textContent=card.querySelector(':scope > h2, :scope > h3, :scope > small, :scope > summary, :scope > .chart-heading h2')?.textContent.replace('⤢','').trim()||label;
        if(card.tagName==='DETAILS')card.open=true;
        content.append(card);document.body.classList.add('statistics-window-open');button.setAttribute('aria-expanded','true');dialog.showModal();close.focus();requestAnimationFrame(onResize);
      });
      if(card.tagName==='DETAILS')card.querySelector(':scope > summary').append(button);else card.append(button);
    }
  }
  return {refresh,close:dismiss};
}
