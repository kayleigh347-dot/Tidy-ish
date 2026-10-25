/* Tidy-ish Schedule Maker view. No direct local board writes or Supabase calls. */
(function(root,factory){const C=typeof module==='object'&&module.exports?require('./schedule-maker-v2.js'):root.TidyMakerV2;
 const api=factory(C);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyMakerUIV2=api;
})(typeof globalThis==='object'?globalThis:this,function(C){
 'use strict';let bridge=null,draft=null,step='start',weeks=0;
 const key='tidyish-maker-95-draft-2026',clone=v=>JSON.parse(JSON.stringify(v));
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const btn=(title,action,id='',variant='')=>`<button type="button" class="maker-v2-btn ${variant}" data-action="v2-${action}" data-id="${escape(id)}">${escape(title)}</button>`;
 const weeklyDays=[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0]];
 const current=()=>bridge.board(), rooms=()=>current().rooms.filter(r=>!r.archived&&r.id!=='laundry');
 function init(api){bridge=api;}
 function repaint(){bridge.render();if(typeof window!=='undefined'&&typeof window.scrollTo==='function')window.scrollTo(0,0);}
 function save(){try{bridge.storage.setItem(key,JSON.stringify(draft));bridge.notice('Schedule draft saved on this device.');}catch(e){bridge.notice('Draft storage failed: '+e.message);}}
 function load(){try{const s=JSON.parse(bridge.storage.getItem(key)||'null');if(s?.version!==2||!C.validateDraft(current(),s))return false;draft=s;return true;}catch{return false;}}
 function start(fromExisting=false){draft=C.newDraft(current(),bridge.date());if(fromExisting&&current().features.schedulePlan?.version===2){const p=current().features.schedulePlan;
   draft.selected=p.selection.filter(k=>C.catalogue(current()).some(x=>x.key===k));draft.restDays=p.restDays;draft.targetMinutes=p.targetMinutes;draft.maxMinutes=p.maxMinutes;}
  step='settings';repaint();}
 function settings(){return `<div class="maker-v2-fields"><label>Schedule starts from<input type="date" data-maker-v2="from" value="${escape(draft.from)}"></label><label>Target time per day<input type="number" min="15" max="720" step="15" data-maker-v2="targetMinutes" value="${draft.targetMinutes}"></label><label>Maximum time on a busy day<input type="number" min="15" max="1440" step="15" data-maker-v2="maxMinutes" value="${draft.maxMinutes}"></label></div>
   <fieldset class="maker-v2-rest"><legend>Rest days · no automatic Quests</legend><div>${weeklyDays.map(([name,id])=>`<label><input type="checkbox" data-maker-v2="restDay" data-day="${id}" ${draft.restDays.includes(id)?'checked':''}>${name}</label>`).join('')}</div></fieldset><p class="small">Flexible only. The plan starts as though every selected Quest has just been completed, but no completion or points are recorded. Room grouping takes priority over exact due dates. Target time is a guide; Maximum is a firm planning cap.</p>`;}
 function selection(){const source=C.catalogue(current()),groups=new Map(),wanted=new Set(draft.selected);
  for(const item of source){const group=item.room||'general';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(item);}
  return `<div class="row spread"><h3>Only tasks from your base sheet</h3><strong>${wanted.size} selected</strong></div><p class="small">All 95 base entries are available. “All Rooms” entries have separate checkboxes for each selected room. No additional cleaning presets are added.</p>
   <div class="maker-v2-control-row">${btn('Select all','all','','ghost')}${btn('Select none','none','','ghost')}</div>
   ${[...groups].map(([room,items])=>{const label=room==='general'?'General · Whole House':rooms().find(r=>r.id===room)?.name||room;
    return `<details class="maker-v2-group" ${room==='general'?'open':''}><summary><strong>${escape(label)}</strong><span>${items.filter(t=>wanted.has(t.key)).length}/${items.length}</span></summary><div class="maker-v2-control-row">${btn('Select room','room-all',room,'ghost')}${btn('Clear room','room-none',room,'ghost')}</div><div class="maker-v2-rows">${items.map((t,i)=>`<label class="maker-v2-task shade-${i%4}"><input type="checkbox" data-maker-v2="task" value="${escape(t.key)}" ${wanted.has(t.key)?'checked':''}><span>${escape(t.title)}</span></label>`).join('')}</div></details>`;}).join('')}`;}
 function review(){let plan;try{plan=C.preview(current(),draft,90);}catch(e){return `<p class="error">${escape(e.message)}</p>${btn('Back to settings','settings','','ghost')}`;}
  const begin=C.addDays(draft.from,weeks*28+1),gridDays=28,byDay=new Map(plan.days.map(x=>[x.date,x]));
  const cells=Array.from({length:gridDays},(_,i)=>{const date=C.addDays(begin,i),row=byDay.get(date),items=row?.items||[],rest=draft.restDays.includes(new Date(date+'T12:00:00Z').getUTCDay());
   return `<div class="maker-v2-date ${rest?'rest':''}" title="${escape(date)}"><strong>${escape(date.slice(8))}</strong><span>${rest?'Rest':items.length?items.length+' Quests':'·'}</span><small>${row?.minutes||0} min</small>${items.slice(0,2).map(t=>`<span class="maker-v2-date-quest">${escape(t.title)}</span>`).join('')}${items.length>2?`<span class="maker-v2-date-quest">+${items.length-2} more</span>`:''}</div>`;}).join('');
  const enough=plan.unplaced.length===0&&plan.sourceTasks>0;
  return `<div class="maker-v2-summary"><strong>${plan.sourceTasks} Quests selected</strong><span>${plan.placed.length} planned occurrences in 90 days</span><span>${plan.unplaced.length} cannot fit this preview</span></div><p class="small">Setup creates future due dates, not fictional completions. Changes to real completion dates will shift future Quests in flexible mode.</p>
   <div class="maker-v2-control-row">${btn('‹ Previous weeks','prev','','ghost')}${btn('Next weeks ›','next','','ghost')}</div><div class="maker-v2-calendar-head">${weeklyDays.map(([name])=>`<span>${name}</span>`).join('')}</div><div class="maker-v2-grid">${cells}</div>
   ${plan.unplaced.length?'<p class="error">Some Quests cannot fit. Adjust time limits or rest days before applying the schedule.</p>':''}
   ${current().features.browserSync?.house?'<p class="error">Connected household: applying is temporarily disabled until the new schedule fields are proven safe for syncing. Your local draft and existing tasks remain unchanged.</p>':''}
   <div class="maker-v2-control-row">${btn('Edit choices','tasks','','ghost')}${btn('Edit time','settings','','ghost')}${btn('Apply Schedule','apply','',enough?'primary':'disabled')}</div><p class="small">Apply requires one explicit confirmation and leaves historical completions, points, laundry, sidequests and ordinary Quests intact.</p>`;
 }
 function content(b){if(!bridge)return '<p>Schedule Maker unavailable.</p>';
  const summary=b.features.schedulePlan?.version===2?`<p class="small">Current plan started ${escape(b.features.schedulePlan.startDate)}. It changes when Quests are completed.</p>`:'<p class="small">No flexible base-sheet plan installed yet.</p>';
  if(step==='start')return `<section class="maker-v2"><div class="maker-v2-hero"><h2>Schedule Maker</h2><p>Flexible mode only · 95 base-sheet tasks · one room a day wherever possible.</p>${summary}</div><div class="maker-v2-control-row">${btn('Plan for me','start','','primary')}${b.features.schedulePlan?.version===2?btn('Edit current plan','edit','','ghost'):''}${btn('Resume draft','resume','','ghost')}${b.features.schedulePlanUndo?btn('Undo last Apply','undo','','ghost'):''}</div><p class="small">A fresh schedule begins with future due dates. Scheduled Quests stay separate from active room lists until you tick them to add.</p></section>`;
  const steps={settings:'1 · Time & Rest Days',tasks:'2 · Choose Base Quests',review:'3 · Calendar Preview & Confirm'};
  return `<section class="maker-v2"><header class="maker-v2-hero"><h2>${steps[step]}</h2><p>Flexible schedule · the original CSV is the only preset source.</p></header>${step==='settings'?settings():step==='tasks'?selection():review()}<div class="maker-v2-control-row maker-v2-footer">${step!=='settings'?btn('Back','back','','ghost'):btn('Exit','exit','','ghost')}${step!=='review'?btn('Next','advance','','primary'):''}${btn('Save Draft','save','','ghost')}</div></section>`;}
 function scheduleSection(b,roomId,today){if(!C.scheduleSettings && !b.features?.schedulePlan)return '';const list=C.due(b,roomId,today);if(!list.length)return `<details class="maker-v2-due"><summary>Schedule <small>0 due</small></summary><p class="small">No scheduled Quests due here yet.</p></details>`;
  const rows=list.map((t,i)=>`<label class="maker-v2-task shade-${i%4}"><input type="checkbox" data-maker-v2="duePick" value="${escape(t.id)}"><span>${escape(t.title)}</span><small>Priority ${t.priority} · ${escape(t.nextDue)}</small></label>`).join('');
  return `<details class="maker-v2-due"><summary>Schedule <small>${list.length} due</small></summary><p class="small">Scheduled Quests aren't automatically added to the active list.</p><div class="maker-v2-rows">${rows}</div>${btn('Add Selected Quests to Active Tasks','activate',roomId,'primary')}</details>`;}
 function handle(el){if(!bridge||!el?.dataset?.action?.startsWith('v2-'))return false;
  const act=el.dataset.action.slice(3),id=el.dataset.id,b=bridge.board();
  try{switch(act){case 'start':start(false);break;case 'edit':start(true);break;
   case 'resume':if(!load())bridge.notice('There is no compatible saved draft.');else{step='settings';repaint();}break;
   case 'exit':step='start';repaint();break;case 'save':save();break;
   case 'all':draft.selected=C.catalogue(b).map(x=>x.key);repaint();break;
   case 'none':draft.selected=[];repaint();break;
   case 'room-all':case 'room-none':{const rows=C.catalogue(b).filter(t=>(t.room||'general')===id),keys=new Set(rows.map(x=>x.key)),selected=new Set(draft.selected);for(const k of keys)act==='room-all'?selected.add(k):selected.delete(k);draft.selected=[...selected];repaint();break;}
   case 'back':step=step==='review'?'tasks':'settings';repaint();break;
   case 'advance':C.validateDraft(b,draft);step=step==='settings'?'tasks':'review';weeks=0;repaint();break;
   case 'settings':step='settings';repaint();break;case 'tasks':step='tasks';repaint();break;
   case 'prev':weeks=Math.max(0,weeks-1);repaint();break;case 'next':weeks=Math.min(2,weeks+1);repaint();break;
   case 'apply':{const plan=C.preview(b,draft,90);if(!plan.sourceTasks||plan.unplaced.length)throw Error('Adjust your selection/capacity before applying.');
    if(b.features?.browserSync?.house)throw Error('New schedule metadata needs safe Supabase support before an account-connected Apply.');
    bridge.confirmDialog('Apply new flexible schedule',`${plan.sourceTasks} selected Quests will be scheduled from ${draft.from}. Only previous unused base-sheet schedule Quests will be replaced. No historical completions or other Quests will be deleted.`,()=>{
     const okay=bridge.change(next=>Object.assign(next,C.apply(next,draft,bridge.model)));if(okay){step='start';repaint();bridge.notice('Flexible schedule applied. Future Quests are on the calendar.');}return okay;},'Apply Schedule');break;}
   case 'undo':bridge.confirmDialog('Undo last Schedule Maker Apply','Only the most recent unused scheduled plan can be safely undone. No completed Quests or points will be removed.',()=>bridge.change(next=>Object.assign(next,C.undo(next))),'Undo Schedule');break;
   case 'activate':{const ids=[...document.querySelectorAll('[data-maker-v2="duePick"]:checked')].map(x=>x.value);if(!ids.length)throw Error('Tick at least one scheduled Quest.');const ok=bridge.change(next=>Object.assign(next,C.activate(next,id,ids,bridge.date())));if(ok)bridge.notice(ids.length+' scheduled Quest(s) added to this room’s active tasks.');break;}
   default:return false;
  }}catch(e){bridge.notice(e.message);}return true;}
 function changed(ev){if(!bridge||!draft)return false;const el=ev.target,k=el?.dataset?.makerV2;if(!k)return false;
  try{if(k==='task'){const set=new Set(draft.selected);el.checked?set.add(el.value):set.delete(el.value);draft.selected=[...set];return true;}
   if(k==='duePick')return true;
   if(k==='from'){if(!C.addDays(el.value,1))throw Error('Choose a real date.');draft.from=el.value;}
   if(k==='restDay'){const n=Number(el.dataset.day),set=new Set(draft.restDays);el.checked?set.add(n):set.delete(n);draft.restDays=[...set];}
   if(k==='targetMinutes'||k==='maxMinutes'){const n=Number(el.value);if(!Number.isInteger(n)||n<15||n>1440)throw Error('Use 15–1440 minutes.');draft[k]=n;}
   C.validateDraft(bridge.board(),draft);
  }catch(e){bridge.notice(e.message);return true;}return true;}
 return {init,content,handle,change:changed,scheduleSection,reset:()=>{draft=null;step='start';}};
});
