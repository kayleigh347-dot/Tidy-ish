/* Tidy-ish 0.23 HTML: shared renderers for Home, room tasks, Doing Now and laundry. */
(function(){
'use strict';
const M=window.TidyModel, S=window.TidySchedule, B=window.TidyBackup, KEY='tidyish-html-v023-board-v1'+(new URLSearchParams(location.search).get('qa')==='1'?'-qa':''), $=s=>document.querySelector(s), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let calendarOffset=0,dataPeriod='30',dataRoom='all',dataVisible=12,scheduleWeek=0;
let board,storageError='',lastSaved='',route='home',roomId='kitchen',tab='tasks',doingTab='doing',sideTab='all',search='',detailed=false,deleted=null,openTasks=new Set(),collapsed=new Set(),dialogDirty=false,dialogSave=null,dialogCleanup=null,pendingExternal=null,noticeTimer,music=null;
// Doing Now is a personal display preference, not a household task or sync mutation.
const DOING_VIEW_KEY=KEY+'-doing-view';
let doingDetailed=false,nextDoingExpiry=0;
try{doingDetailed=localStorage.getItem(DOING_VIEW_KEY)==='detailed'}catch{}
const app=$('#app'),editor=$('#editor');
try{lastSaved=localStorage.getItem(KEY)||'';board=lastSaved?M.normalize(JSON.parse(lastSaved)):M.board();M.refresh(board);if(!lastSaved){localStorage.setItem(KEY,JSON.stringify(board));lastSaved=JSON.stringify(board);}}catch(e){storageError=e.message;board=M.board();}
const room=id=>board.rooms.find(r=>r.id===id),task=id=>board.tasks.find(t=>t.id===id),rooms=()=>board.rooms.filter(r=>!r.archived),F=()=>board.features;
// One asset directory, with no old part-* or rejected navigation-strip dependencies.
const asset=p=>{
 const x=String(p||'');
 const routed=x.startsWith('room-art/')?'rooms/'+x.slice(9):
  x.startsWith('audio/')?'sounds/'+x.slice(6):
  x.startsWith('app-icons/')?'icons/'+x.slice(10):
  ['laundry-rail.svg','laundry-dryer.svg'].includes(x)?'laundry/'+x:
  /^(?:house(?:-map-plaques)?\.png|room-[^/]+\.(?:png|jpe?g))$/i.test(x)?'rooms/'+x:
  /(?:-background\.png$|-spotless\.(?:png|jpg)$)/i.test(x)?'backgrounds/'+x:x;
 return 'assets/'+routed.split('/').map(encodeURIComponent).join('/');
};
const button=(text,action,id='',cls='',extra='')=>`<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}" ${extra}>${text}</button>`;
const field=(label,name,value='',type='text',extra='')=>`<label class="field">${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`;
const area=(label,name,value='')=>`<label class="field">${esc(label)}<textarea name="${name}">${esc(value)}</textarea></label>`;
const check=(label,name,on=false,extra='')=>`<label class="check"><input type="checkbox" name="${name}" ${on?'checked':''} ${extra}>${esc(label)}</label>`;
const select=(label,name,values,value)=>`<label class="field">${esc(label)}<select name="${name}">${values.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
const detail=(title,body,open=false)=>`<details ${open?'open':''}><summary>${esc(title)}</summary>${body}</details>`;
const card=(body,cls='')=>`<section class="card ${cls}">${body}</section>`;
const stopwatch=`<svg class="stopwatch" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="7.5"/><path d="M9 2h6m-3 0v4M5 7 3 5m16 2 2-2m-9 5v4l4 1"/></svg>`;
const phoneClock=`<svg class="phone-clock" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M5 2 2 5m14-3 3 3"/></svg>`;
function notice(text){$('#notice').textContent=text;$('#notice').style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').style.display='none',6500);}
function persist(next){if(storageError)throw Error('Browser storage is unavailable. The original saved data has been preserved. '+storageError);const current=localStorage.getItem(KEY)||'';if(current!==lastSaved)throw Error('This board changed in another tab. Close this form and reload before saving. Your form is still open.');const serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);lastSaved=serialized;board=next;}
function change(edit,{redraw=true,sync=true}={}){try{const next=M.clone(board);edit(next);if(window.TidySharing?.transition)window.TidySharing.transition(board,next);persist(next);if(redraw)render();if(sync)window.TidySharing?.queue();return true;}catch(e){notice(e.message);return false;}}
function navigate(next,id){if(editor.open)return;route=next;if(id)roomId=id;search='';tab='tasks';openTasks.clear();render();window.scrollTo(0,0);}
function tabs(entries,chosen,action,cls=''){return `<div class="tabs ${cls}" role="tablist">${entries.map(([id,label])=>button(esc(label),action,id,id===chosen?'active':'',`role="tab" aria-selected="${id===chosen}"`)).join('')}</div>`;}
function globals(home=false){return `<div class="global ${home?'home-global':''}">${button('⚙︎','navigate','settings','','aria-label="Settings"')}${button('?','navigate','help','','aria-label="Help"')}</div>`;}
// Six compact hand-drawn icons replace the previous oversized illustrated strip.
// Routes and their accessible names stay unchanged; the old image remains in assets as a reference.
const destinations=[['home','Home'],['doing','Doing Now'],['calendar','Calendar'],['data','Data'],['side','Sidequests'],['more','More']];
const navIcons={
 home:'<path d="M3.5 11 12 4l8.5 7M6 10v10h12V10M10 20v-6h4v6"/>',
 doing:'<rect x="5" y="4" width="14" height="17" rx="2.8"/><path d="M9 4.5h6M8.5 11.8l2.2 2.2 4.7-5M8.5 17h7"/>',
 calendar:'<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M7.7 3.5v4M16.3 3.5v4M3.5 10h17M8 14.1h2M13.8 14.1h2M8 17.7h2"/>',
 data:'<path d="M4 20h16M6 17v-4M10 17V9M14 17v-7M18 17V5"/><path d="M5.4 9.4 9.7 6.5 13.5 8l5.2-5.1"/>',
 side:'<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9Z"/>',
 more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
};
function footer(){return `<nav class="footer simple-nav" aria-label="Main navigation"><div class="nav-items">${destinations.map(([id,label])=>{const active=id===route||id==='home'&&route==='room'||id==='more'&&['settings','help','backup','laundry','laundry-settings','manage','schedule'].includes(route);return button(`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${navIcons[id]}</svg><span class="nav-label">${esc(label)}</span>`,'navigate',id,active?'active':'',`aria-label="${esc(label)}" ${active?'aria-current="page"':''}`)}).join('')}</div></nav>`;}
function meter(r){const m=M.mess(board,r),clean=M.cleanPercent(m),state=clean>=90?'clean':clean>=60?'lived':clean>=20?'messy':'chaos';return `<div class="fancy-meter ${state}" role="meter" aria-label="${esc(r.name)} cleanliness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${clean}"><span class="meter-fill" style="width:${clean}%"></span><span class="meter-phrase">${esc(M.phrase(m))}</span><span class="meter-leaf" aria-hidden="true">✦</span></div>`;}

const positions={storage:[5,17.3,33,13.4],cats:[40,15.3,21,15.4],print:[63,17.3,32,13.4],penny:[5,32.4,32,17.1],hall:[40,32.4,25,17.1],bathroom:[67,32.4,29,17.1],master:[5,51,49,17.1],living:[56,51,40,17.1],kitchen:[5,69.1,48,14.2],entrance:[56,69.1,40,14.2]};
function houseKey(r){return /(?:room-)?penny-/.test(r.art)?'penny':/(?:room-)?master-/.test(r.art)?'master':r.id.replace(/^room-/,'');}
function home(){let body='';if(!F().simple){body=`<div class="house"><div class="house-canvas"><img src="assets/rooms/house.png" alt="Tidy-ish illustrated house with named rooms" fetchpriority="high">${rooms().map(r=>{const p=positions[houseKey(r)];if(!p)return '';const m=M.mess(board,r);return button(`<span class="home-meter"><span class="home-meter-fill" style="width:${M.cleanPercent(m)}%"></span><span class="phrase">${esc(M.phrase(m))}</span></span>`,'room',r.id,'house-hit',`style="left:${p[0]}%;top:${p[1]}%;width:${p[2]}%;height:${p[3]}%" aria-label="Open ${esc(r.name)}. Cleanliness ${Math.round(M.cleanPercent(m))} percent"`)}).join('')}</div></div>`;}else body=`<h1>Your house</h1><div class="padded">${rooms().map(r=>card(button(esc(r.name)+' ›','room',r.id,'wide')+meter(r))).join('')}</div>`;
return body+`<div class="padded"><div class="meter-label">${esc(M.phrase(rooms().reduce((n,r)=>n+M.mess(board,r),0)/(rooms().length||1)))}</div><div class="home-links">${button('Extra rooms','extra')}${button('All rooms','all-rooms')}${button('Manage home','navigate','manage')}</div>${card(`<div class="row spread"><h2>Laundry</h2>${button('Open','navigate','laundry','ghost')}</div>${laundryContent(true)}`)}${button(`Doing Now · ${board.tasks.filter(t=>t.doing&&!t.done).length}`,'navigate','doing','wide')}${card(`${totalPoints()} points · ${F().wins.length} completed`,'small')}</div>`;}
function totalPoints(){return F().wins.reduce((n,w)=>n+(w.points??1),0)+F().completionSummaries.reduce((n,w)=>n+w.count,0);}
function roomScene(r){if(F().simple)return meter(r);const m=M.mess(board,r),state=m>=100?3:m>=5/14*100?2:m>0?1:0,key=houseKey(r)==='storage'?'craft':houseKey(r),suffix=['spotless','clean','messy','disaster'][state];const known=['craft','cats','print','penny','hall','bathroom','master','living','kitchen','entrance'].includes(key);const file=known?`room-art/room-${key}-${suffix}.${key==='penny'&&state===0?'jpg':'png'}`:r.art;return `<div class="room-scene"><img src="${asset(file)}" alt="${esc(r.name)} · ${esc(M.phrase(m))}" loading="lazy">${known?button('<span class="guardian-speech" aria-hidden="true"></span>','creature-react',r.id,'guardian guardian-tap',`data-state="${state}" style="background-image:url('${asset(`sprites/${key}-states.webp`)}')" aria-label="Tap ${esc(r.name)} creature for a reaction to the room's mess level"`):''}</div>${meter(r)}`;}
function taskToolbar(){return `<div class="toolbar">${button(detailed?'Detailed view ✓':'Compact view ✓','view')}${button('⌕','search','','search-icon','aria-label="Search tasks"')}${button('＋ Add task','add-task')}${route==='doing'?button('Choose tasks','choose'):''}${route==='doing'?button('Tools','tools'):''}${deleted&&deleted.page===pageKey()?button('Undo deleted','undo-delete'):''}</div>${search!==null&&uiSearch?`<label class="field">Search ${route==='room'?'this room':'tasks'}<input id="task-search" value="${esc(search)}" placeholder="Search tasks"></label>`:''}`;}
let uiSearch=false;
function visibleTasks(){let list=route==='doing'?(doingTab==='attention'?board.tasks.filter(t=>t.attention&&!M.paused(t)):M.doing(board)):route==='room'?board.tasks.filter(t=>t.room===roomId&&!M.paused(t)&&(tab==='side'?t.side:tab==='homeless'?false:!t.side)):board.tasks.filter(t=>t.side&&!M.paused(t)&&(sideTab==='all'||t.sideKind===sideTab));
if(route==='room'&&tab==='side'&&sideTab!=='all')list=list.filter(t=>t.sideKind===sideTab);if(search)list=list.filter(t=>(t.title+' '+t.notes+' '+t.children.map(c=>c.title).join(' ')).toLowerCase().includes(search.toLowerCase()));return [...list.filter(t=>!t.done),...list.filter(t=>t.done)];}
function taskList(list){if(!list.length)return '<p class="empty">No tasks to show</p>';return list.map(t=>taskCard(t)).join('');}
function taskCard(t){if(route==='doing')return doingTaskCard(t);const expanded=openTasks.has(t.id);return `<article class="task ${t.done?'done':''}" data-task-id="${esc(t.id)}" draggable="${!t.done}"><div class="row">${button(t.doing?'Not on it':"I’m on it!",'select-task',t.id,'select-task',`aria-pressed="${t.doing}" aria-label="${t.doing?'Remove from':'Add to'} Doing Now: ${esc(t.title)}"`)}${button(`${esc(t.title)}${t.children.length?` <span class="small">${t.children.filter(c=>c.done).length}/${t.children.length} ${expanded?'▾':'▸'}</span>`:''}`,'expand',t.id,'ghost grow task-title',`aria-expanded="${expanded}"`)}${button('+','add-child',t.id,'ghost','aria-label="Add subtask to '+esc(t.title)+'"')}</div>${detailed?`<div class="task-meta">${esc(room(t.room)?.name||'Homeless')} · Priority ${t.priority}${t.estimate?' · '+t.estimate+' min':''}${t.assigned?' · '+esc(t.assigned):''}${t.dueDate?' · '+esc(t.dueDate):''}</div>`:''}${expanded?childrenHtml(t):''}<div class="actions">${!t.done?button('First','first',t.id,'first')+button('Last','last',t.id,'last'):''}${button(stopwatch,'timer',t.id,'icon-button',`aria-label="Stopwatch for ${esc(t.title)}"`)}${button('✎','edit-task',t.id,'edit-icon',`aria-label="Edit ${esc(t.title)}"`)}${button('⌫','delete-task',t.id,'delete-icon',`aria-label="Delete ${esc(t.title)}"`)}${button(t.done?'Undo':route==='doing'?'✓ Done It':'✓ I did a thing!','complete',t.id,'complete')}</div>${detail('Details & options',`${t.notes?`<p>${esc(t.notes).replace(/\n/g,'<br>')}</p>`:''}${t.tools?`<p class="small">Tools: ${esc(t.tools).replace(/\n/g,', ')}</p>`:''}${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Task attachment">`:''}<div class="row">${button('Save reusable','save-template',t.id,'ghost')}${button(t.paused?'Resume task':'Pause task','pause-task',t.id,'ghost')}</div>`)}</article>`;}
function safeImage(src){return /^(data:image\/(png|jpeg|webp|gif);base64,|blob:)/.test(src)?esc(src):'';}
function childrenHtml(t,parent='',depth=0){return t.children.filter(c=>(c.parentId||'')===parent).map(c=>`<div class="child ${depth?'nested-child':''}"><div class="row"><span class="grow ${c.done?'muted':''}">${c.done?'✓ ':''}${esc(c.title)}</span>${button(c.done?'Undo':'I did a thing','child-complete',t.id,'ghost',`data-child="${esc(c.id)}"`)}</div>${detail('Options',`<div class="row">${button('First','child-first',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Last','child-last',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button(stopwatch,'timer',t.id,'icon-button',`data-child="${esc(c.id)}" aria-label="Stopwatch for ${esc(c.title)}"`)}${button('Edit','edit-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('+ Subtask','add-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}</div>`)}${childrenHtml(t,c.id,depth+1)}</div>`).join('');}
function roomPage(){const r=room(roomId);if(!r)return '<p class="empty">Choose a room from House.</p>';return `<div class="row spread"><h1>${esc(r.name)}</h1>${button('◎ Focus!','focus',r.id)}</div>${roomScene(r)}${tabs([['tasks','Tasks'],['side','Side quests'],['homeless','Homeless']],tab,'room-tab','nested')}${tab==='side'?tabs(sideChoices(),sideTab,'side-tab','nested'):''}${tab==='homeless'?homelessPage(r):`${taskToolbar()}${taskList(visibleTasks())}`}${detail('Room options',button('Adjust mess level','calibrate',r.id)+button('Schedule · later','later','schedule','ghost'))}`;}
function sideChoices(){return [['all','All'],...M.sideTabs.map(t=>[t.id,t.name]),...F().sideTabs.map(t=>[t.id,t.name])];}
// Use locally rendered clock time for the daily clear-down. A Monday completion stays
// visible throughout Tuesday and leaves Doing Now at 03:00 on Wednesday. The saved task,
// completion wins, rewards, and future Task Data inputs are never deleted here.
function completionTime(t){
 const candidates=[t.completedAt,t._cycle?.at,t.doneAt,...F().wins.filter(w=>w.taskId===t.id||w.rootId===t.id||t.children.some(c=>c.id===w.taskId)).map(w=>w.at)];
 const times=candidates.map(x=>x?Date.parse(x):NaN).filter(Number.isFinite);
 return times.length?Math.max(...times):0;
}
function completedDeadline(t){
 const time=completionTime(t);if(!time)return 0;
 const date=new Date(time);
 return new Date(date.getFullYear(),date.getMonth(),date.getDate()+2,3,0,0).getTime();
}
function dateLabel(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';}
function creatorLabel(t){const from=t.createdByName||t.addedByName||t.creatorName||t.createdBy?.name||t.createdBy||t.androidTask?.createdByName||t.androidTask?.addedByName;return typeof from==='string'&&from.trim()?from:'Not recorded';}
function doingTaskCard(t){
 const expanded=openTasks.has(t.id),count=t.children.filter(c=>c.done).length;
 return `<article class="task doing-task" data-task-id="${esc(t.id)}" draggable="true">
 <div class="doing-task-main">
 ${button(t.doing?'Not on it':"I'm on it!",'select-task',t.id,'select-task doing-select',`aria-pressed="${t.doing}" aria-label="${t.doing?'Remove from':'Add to'} Doing Now: ${esc(t.title)}"`)}
 ${button(esc(t.title)+(t.children.length?` <span class="expand-indicator" aria-hidden="true">${expanded?'▾':'▸'}</span>`:''),'expand',t.id,'ghost doing-task-title',`aria-expanded="${expanded}"`)}
 ${t.children.length?`<span class="doing-subtask-count" aria-label="${count} of ${t.children.length} subtasks complete">${count}/${t.children.length}</span>`:''}
 </div>
 ${doingDetailed?`<div class="doing-meta"><span>Added: ${esc(dateLabel(t.createdAt))}</span><span>By: ${esc(creatorLabel(t))}</span><span>Assigned: ${esc(t.assigned||'Anyone')}</span></div>`:''}
 ${expanded?doingChildren(t):''}
 <div class="doing-task-actions">
 ${button('First','first',t.id,'first doing-order')}${button('Last','last',t.id,'last doing-order')}
 ${button('⋯','task-menu',t.id,'doing-more',`aria-label="More actions for ${esc(t.title)}"`)}
 ${button(phoneClock,'timer',t.id,'doing-timer',`aria-label="Set phone alarm timer for ${esc(t.title)}"`)}
 ${button('✓ I did a thing!','complete',t.id,'complete doing-complete')}
 </div></article>`;
}
function doingChildren(t,parent='',depth=0){
 return t.children.filter(c=>(c.parentId||'')===parent).sort((a,b)=>Number(a.done)-Number(b.done)).map(c=>`
 <div class="child doing-child ${c.done?'child-finished':''} ${depth?'nested-child':''}" data-child-id="${esc(c.id)}" data-root-id="${esc(t.id)}" data-parent-id="${esc(parent)}">
 <button type="button" class="child-grip" draggable="true" aria-label="Drag to reorder ${esc(c.title)}" title="Drag to reorder; Alt + arrow keys also work">⠿</button>
 <span class="doing-child-title ${c.done?'muted':''}">${c.done?'✓ ':''}${esc(c.title)}</span>
 ${button(c.done?'Undo':'✓ I did a thing!','child-complete',t.id,c.done?'child-undo':'child-done',`data-child="${esc(c.id)}"`)}
 </div>${doingChildren(t,c.id,depth+1)}`).join('');
}
function completedDoingList(tasks){
 if(!tasks.length)return '';
 return `<section class="doing-finished" aria-label="Recently completed tasks"><h2>Completed</h2><div class="doing-finished-rows">${tasks.map(t=>`<div class="doing-finished-row"><span>✓ ${esc(t.title)}</span>${button('Undo','complete',t.id,'doing-undo')}</div>`).join('')}</div></section>`;
}
function doingPage(){
 const nav=tabs([['doing','Doing Now'],['laundry','Laundry'],['attention','Needs Done']],doingTab,'doing-tab','nested');
 if(doingTab==='laundry'){nextDoingExpiry=0;return `<div class="doing-board">${nav}${laundryPage(false)}</div>`;}
 const list=visibleTasks(),active=list.filter(t=>!t.done),now=Date.now();
 const recent=list.filter(t=>t.done&&completedDeadline(t)>now);
 nextDoingExpiry=recent.length?Math.min(...recent.map(completedDeadline)):0;
 const view=`<div class="doing-view" role="group" aria-label="Task view">${button('Compact','set-doing-view','compact',doingDetailed?'':'selected',`aria-pressed="${!doingDetailed}"`)}${button('Detailed','set-doing-view','detailed',doingDetailed?'selected':'',`aria-pressed="${doingDetailed}"`)}</div>`;
 return `<div class="doing-board">${nav}<div class="doing-toolbar">${view}${button('＋ Add a task','add-task','','add-task-button')}</div>${active.length?groupedTasks(active):'<p class="empty">No active tasks to show</p>'}${completedDoingList(recent)}${deleted&&deleted.page===pageKey()?button('Undo deleted','undo-delete','','ghost'):''}</div>`;
}
function guardianThumb(id){const r=room(id);if(!r)return '';const key=houseKey(r)==='storage'?'craft':houseKey(r),known=['craft','cats','print','penny','hall','bathroom','master','living','kitchen','entrance'].includes(key);return known?`<span class="guardian-thumb" style="background-image:url('${asset(`sprites/${key}-states.webp`)}')" role="img" aria-label="${esc(r.name)} character"></span>`:'<span class="guardian-thumb simple-room" aria-hidden="true">⌂</span>';}
function groupedTasks(list){if(!list.length)return '<p class="empty">No tasks to show</p>';const groups=[...new Set(list.map(t=>t.room))];return groups.map(id=>`<section class="room-task-section"><div class="room-heading"><div class="room-heading-identity">${guardianThumb(id)}${button(`${collapsed.has(id)?'▸':'▾'} ${esc(room(id)?.name||'Homeless')}`,'collapse',id,'ghost grow room-name',`aria-expanded="${!collapsed.has(id)}"`)}</div><div class="room-heading-controls">${room(id)?button('Focus','focus',id,'room-focus'):''}${button('Tools','tools',id,'room-tools')}</div></div>${collapsed.has(id)?'':taskList(list.filter(t=>t.room===id))}</section>`).join('');}

function sidePage(){return `${tabs(sideChoices(),sideTab,'side-tab','nested')}${button('＋ New tab','new-side-tab','', 'ghost')}${taskToolbar()}${taskList(visibleTasks())}`;}
function laundryLoad(l,compact){const ready=l.step===1&&l.startedAt&&Date.now()-l.startedAt>=7200000,title=l.uniformWeek?'Uniform · put away':l.route==='dryer'?'Washing & dryer':'Washing & rail';return `<section class="${compact?'':'card'}"><div class="laundry-card"><img src="${asset(l.route==='dryer'?'laundry-dryer.svg':'laundry-rail.svg')}" alt="${l.route==='dryer'?'Tumble dryer':'Clothes hanging on a rail'}"><div class="grow"><h3>${title}</h3>${!compact?`<div class="small">Load ${l.slot} · Step ${l.step+1} of 3</div>`:''}${l.step!==0?`<p class="small">${esc(M.laundryText(F(),l))}</p>`:''}${ready?'<p class="gold small">load is ready, rewash = money down the drain</p>':''}<div class="row">${l.step===1?button('Put out','laundry-step',l.slot,'', 'data-route="rail"')+button('Dryer','laundry-step',l.slot,'','data-route="dryer"'):button(l.step===0?esc(F().wash):'Done it!','laundry-step',l.slot)}${l._undo?button('Undo last step','laundry-undo',l.slot,'ghost'):''}</div></div></div></section>`;}
function uniformContent(compact){const f=F();if(f.uniformIndex<0||f.uniformPaused)return '';const text=f.uniformSteps[f.uniformIndex]||'Uniform',first=f.uniformIndex===1&&f.uniformSteps.length===7;return `<section class="${compact?'':'card'}"><div class="row spread"><h3>Wash uniform · Saturday</h3>${button('Pause uniform','uniform-pause','','ghost')}</div><div class="laundry-card"><img src="assets/laundry/uniform.png" alt="School uniform"><div class="grow"><div class="small">Step ${f.uniformIndex+1} of ${f.uniformSteps.length}</div><p>${first?'Choose the first wash':esc(text)}</p>${f.uniformStartedAt&&Date.now()-f.uniformStartedAt>=7200000?'<p class="gold small">load is ready, rewash = money down the drain</p>':''}<div class="row">${first?button('Wash darks','uniform-step','darks')+button('Wash whites','uniform-step','whites'):button('Done it!','uniform-step')}${f._uniformUndo?button('Undo uniform step','uniform-undo','','ghost'):''}</div>${/Hang/i.test(text)?'<p class="small">Remember to stretch out on the rail.</p>':''}</div></div></section>`;}
function displayLoads(){const list=F().laundry.filter(l=>!l.uniformWeek||l.step!==0).sort((a,b)=>(a.step===1?0:1)-(b.step===1?0:1)||(a.step===1?a.startedAt-b.startedAt:0)||a.slot-b.slot);let slot=Math.max(0,...F().laundry.map(l=>l.slot));for(const route of ['rail','dryer'])if(!list.some(l=>!l.uniformWeek&&l.route===route))list.push({slot:++slot,route,step:0,selected:false});return list;}
function laundryContent(compact){return uniformContent(compact)+displayLoads().map(l=>laundryLoad(l,compact)).join('');}
function laundryPage(configure=false){if(configure){return `<form id="laundry-config">${card(field('Washing step','wash',F().wash)+field('Hanging rail transfer','railTransfer',F().railTransfer)+field('Dryer transfer','dryerTransfer',F().dryerTransfer)+field('Hanging rail finish','railFinish',F().railFinish)+field('Dryer finish','dryerFinish',F().dryerFinish)+detail('Uniform cycle',area('Uniform steps — one per line','uniformSteps',F().uniformSteps.join('\n')))+`<button type="submit">Save cycle</button>`)}</form>`;}
return `${laundryContent(false)}<div class="row">${F().uniformPaused||F().uniformIndex<0?button(F().uniformPaused?'Resume uniform':'Pause uniform',F().uniformPaused?'uniform-resume':'uniform-pause'):''}${button('Laundry setup & editing','navigate','laundry-settings','ghost')}${button('Add another load','new-load','', 'ghost')}</div>${F().uniformIndex<0&&!F().uniformPaused?'<p class="small">Uniform returns next Saturday</p>':''}${F()._uniformUndo&&F().uniformIndex<0?button('Undo uniform step','uniform-undo','','ghost'):''}${detail('One-off laundry task',`<form id="oneoff-form">${field('Laundry task','title','','text','required')}<button>Add task</button></form>${F().items.filter(i=>i.kind==='laundry').map(i=>check(i.text,'',i.done,`data-action="laundry-oneoff" data-id="${esc(i.id)}"`)).join('')}`)}${detail('Laundry reminders',`<p class="small">The ready message appears after two hours. While this browser page is open, optional browser notifications can remind you every half hour until transfer. Browser notifications cannot guarantee Android-style reminders when the page is closed.</p>${button('Enable browser reminders','notifications')}`)}`;}
function homelessPage(r){return `<form id="homeless-form">${field('Item without a home','title','','text','required')}<button>Add item</button></form>${F().items.filter(i=>i.kind==='homeless'&&i.location===r.id).map(i=>card(`<div class="row"><span class="grow">${esc(i.text)}</span>${button('Remove','homeless-remove',i.id,'ghost')}</div>`)).join('')}${taskList(board.tasks.filter(t=>!t.room))}`;}
function managePage(){return `${card(`<form id="add-room">${field('New room name','name','','text','required')}<button>Add room</button></form>`)}${rooms().map(r=>card(`<h2>${esc(r.name)}</h2><div class="row">${button('Open','room',r.id)}${button('Rename','rename-room',r.id,'ghost')}${button('First','room-first',r.id,'ghost')}${button('Archive','archive-room',r.id,'ghost')}${button('Areas','areas',r.id,'ghost')}</div>`)).join('')}${detail('Archived rooms',board.rooms.filter(r=>r.archived).map(r=>card(`${esc(r.name)} ${button('Restore','archive-room',r.id)}`)).join(''))}${detail('Reusable tasks',button('Add reusable task','new-template')+F().templates.filter(t=>!F().hiddenTemplates.includes(t.id)).map(t=>card(`<h3>${esc(t.title)}</h3><div class="row">${button('Add task','activate-template',t.id)}${button('Edit','edit-template',t.id,'ghost')}${button('Hide','hide-template',t.id,'ghost')}</div>`)).join('')+detail('Hidden saved tasks',F().templates.filter(t=>F().hiddenTemplates.includes(t.id)).map(t=>card(`${esc(t.title)} ${button('Restore','restore-template',t.id)}`)).join('')))}${detail('Common tools',`<form id="tools-form">${area('Tools — one per line','tools',F().tools.join('\n'))}<button>Save tools</button></form>`)}`;}
function settingsPage(){return `${window.TidySharing?.panel()||''}${card(`<form id="name-form">${field('Display name','name',F().displayName,'text','required')}<button>Save name</button></form>`)}${card(check('Sounds','sound',F().sound,'data-action="setting" data-id="sound"')+check('Simplified view','simple',F().simple,'data-action="setting" data-id="simple"')+check('Reduce character motion','reduceMotion',F().reduceMotion,'data-action="setting" data-id="reduceMotion"')+check('Pause wandering','pauseWandering',F().pauseWandering,'data-action="setting" data-id="pauseWandering"'))}${button('Backup & custom tasks','navigate','backup')}${detail('About this version','<p class="small">New Tidyish core build. Household sync is not connected yet. Room tasks, Doing Now and laundry use local browser storage. Scheduling previews do not add any cleaning tasks. Artwork migration and account compatibility remain to be checked.</p>')}`;}
function helpPage(){return [
['Tasks & Doing Now','Add tasks in a room or Doing Now. New tasks go first. Tick selection adds a task to Doing Now; unticking it keeps the task in its room and awards no points. Compact view keeps the essential controls together. Search filters the current list. First and Last change order. Drag a card to another card to place it before that task.'],
['Subtasks, completion & Undo','Tap a task name to show subtasks. + adds subtasks; enter one per line. Each subtask has its own timer and Edit controls. Completing a parent asks “Done em all”. Leaf subtasks award one point each; the parent awards no extra point. Undo reverses the completion and its points. Delete requires confirmation; Undo deleted restores it during this visit.'],
['Room mess meters','Room meters show cleanliness: full means spotless. Phrases come from the supplied mess-phrase.js. Task impact and unfinished leaf subtasks affect mess. Adjust mess level calibrates the room without completing or changing any tasks. Room names are already part of the Home artwork.'],
['Focus','Choose a room, select Clear the Way steps and other tasks, then confirm Start in Doing Now. Reset work comes first. The other selected tasks appear once reset work is complete. Cancelling adds nothing; skipping a reset preserves previous work.'],
['Timers & music','Set minutes inside Tidy-ish and start a phone Clock alarm using your existing Automate connection on Android (or a configured Shortcut on iPhone). Connection values are local to this browser. A web request cannot confirm the alarm started, so verify it on your phone. The stopwatch remains available for measured task times. Browser countdown and music may stop if the browser sleeps.'],
['Laundry','Home, Laundry and Doing Now show the same saved loads. Put a load on starts washing. Put out or Dryer selects the transfer route. Done it! completes putting away. Undo last step affects only that load. Uniform starts weekly on Saturday. Choose darks or whites first; after both washes the second putting-away stage moves to normal laundry. Pausing preserves progress.'],
['Household sharing','Household syncing is temporarily disconnected in this new core-only Tidyish build while the replacement data model is tested. Your local tasks stay on this browser and are not shared with other devices yet. Please export a backup before importing or testing account connections.'],
['Backups & storage','Download backup exports the browser board without authentication tokens. Import previews a merge; existing matching identities are kept. Nothing is imported automatically. Use the same localhost address/port for the same browser storage. File-open mode supports local features, but sign-in needs an HTTP or HTTPS origin.'],
['Current stage','Calendar and Task Data have read-only views of your saved tasks and completions. Schedule preview reads existing repeats only and never imports preset tasks. Full Schedule Maker, appointments, errands, and native wandering are still unfinished.']].map(([title,text])=>card(detail(title,`<p>${esc(text)}</p>`))).join('');}
function backupPage(){return `${card(`<h2>Board backup</h2>${button('Download backup','export')}<label class="field">Preview Tidyish v1 backup (older formats need review)<input id="backup-file" type="file" accept="application/json,.json"></label><p class="small">Imports merge new identities only. Existing matching tasks, rooms and history stay as they are. Authentication is never exported.</p>`)}${card(`<h2>Custom tasks</h2>${button('Download CSV template','csv-template')}<label class="field">Preview CSV upload<input id="csv-file" type="file" accept="text/csv,.csv"></label>${detail('CSV instructions','<p class="small">Use title,room,sidequest,tools,notes columns. Match room name or ID; leave room blank for Homeless. Quote commas and newlines inside a value. Duplicates by title and room are skipped.</p>')}`)}`;}

// Read-only calendar and scheduling pages: the user's current saved tasks are the ONLY source.
// No generated agent presets, automatic board edits or hidden task imports.
function dayHeading(iso){return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
function plannedMonth(){
 const now=new Date(),month=new Date(now.getFullYear(),now.getMonth()+calendarOffset,1),from=[month.getFullYear(),String(month.getMonth()+1).padStart(2,'0'),'01'].join('-');
 const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 return {month,from,days,plan:S.preview(board,{from,days})};
}
function calendarPage(){
 if(!S)return card('Scheduling module unavailable. Current saved tasks are unchanged.');
 const {month,from,days,plan}=plannedMonth(),lookup=new Map(plan.days.map(d=>[d.date,d]));
 const leading=(new Date(from+'T12:00:00').getDay()+6)%7;
 const cells=Array.from({length:leading},()=>'<span class="calendar-spacer" aria-hidden="true"></span>').join('')+
 Array.from({length:days},(_,i)=>{const day=S.addDays(from,i),entry=lookup.get(day),total=entry?.items.length||0;
 const today=new Date().toLocaleDateString('en-CA');
 return button(`<strong>${i+1}</strong>${total?`<span class="count">${total} planned</span>`:''}`,'calendar-day',day,'calendar-day'+(day===today?' today':''),`aria-label="${esc(dayHeading(day))}: ${total} recurring tasks"`);}).join('');
 return `<section class="calendar-view"><div class="calendar-month-head">${button('‹','calendar-month-prev','','ghost','aria-label="Previous month"')}<h2>${esc(month.toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}</h2>${button('›','calendar-month-next','','ghost','aria-label="Next month"')}</div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(s=>`<strong class="calendar-heading">${s}</strong>`).join('')}${cells}</div>${plan.sourceTaskCount?`<p class="calendar-footnote">${plan.sourceTaskCount} saved repeating task${plan.sourceTaskCount===1?'':'s'} · tap a date to view tasks.</p>`:'<p class="empty">No repeating tasks are saved yet. When you add your own recurring tasks, they will appear here.</p>'}</section>`;
}
function calendarDay(iso){
 const entry=plannedMonth().plan.days.find(d=>d.date===iso);
 const rows=entry?.items.map(t=>`<div class="calendar-detail-row"><div class="grow"><strong>${esc(t.title)}</strong><div class="small">${esc(room(t.room)?.name||'General')}${t.minutes!=null?' · '+esc(t.minutes)+' min':''}</div></div>${button('Skip this time','skip-date',t.taskId,'ghost',`data-date="${esc(t.due)}"`)}</div>`).join('')||'<p>No repeating tasks planned on this date.</p>';
 dialog(dayHeading(iso),rows);
}
function schedulePage(){
 if(!S)return card('Scheduling module unavailable. No tasks have been modified.');
 const date=new Date();date.setDate(date.getDate()-((date.getDay()+6)%7)+scheduleWeek*7);
 const from=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const plan=S.preview(board,{from,days:7});
 return `<section class="schedule-view">${card(`<div class="row spread"><h2>Recurring task preview</h2><div class="row">${button('‹ Week','schedule-prev','','ghost')}${button('Week ›','schedule-next','','ghost')}</div></div><p class="small">${esc(dayHeading(from))} · Read-only. Only tasks you have saved are shown. No preset tasks are added.</p>`)}${plan.days.map(d=>card(`<div class="row spread"><strong>${esc(dayHeading(d.date))}</strong><span class="small">${d.minutes?esc(d.minutes)+' min':'No time estimate'}</span></div>${d.items.map(t=>`<div class="schedule-line">${esc(t.title)}<span>${esc(room(t.room)?.name||'General')}</span></div>`).join('')}`)).join('')||'<p class="empty">No repeating work planned for this week. Scheduling functions are ready for tasks you create later.</p>'}<p class="small">Preview only. Daily caps, rest days and one-room-per-day options are supported in the scheduling engine but are not applied or saved here.</p></section>`;
}
function dataPage(){
 if(!window.TidyTaskData)return card('Task Data summaries are unavailable. Saved completions have not been changed.');
 const d=window.TidyTaskData.summarize(board,{period:dataPeriod,roomId:dataRoom});
 const roomChoices=[['all','All rooms'],['general','General / No room'],['laundry','Laundry'],...rooms().map(r=>[r.id,r.name])];
 const chosen=roomChoices.some(([id])=>id===dataRoom)?dataRoom:'all';
 const roomSelect=`<label class="field task-data-filter">Room<select id="data-room-filter" aria-label="Filter Task Data by room">${roomChoices.map(([id,label])=>`<option value="${esc(id)}" ${id===chosen?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
 const barMax=Math.max(...d.entries.map(x=>x.count),1);
 const byRoom=d.entries.length?d.entries.map(x=>`<div class="bar-row"><span>${esc(room(x.id)?.name||({'general':'General','laundry':'Laundry'}[x.id]||x.id))}</span><div class="bar-track"><span class="bar" style="width:${Math.round(x.count/barMax*100)}%"></span><small>${x.count}</small></div></div>`).join(''):'<p>No recorded completions in these filters.</p>';
 const trendMax=Math.max(...d.trend.map(x=>x.count),1);
 const trend=`<div class="data-trend" role="img" aria-label="Completions by day for the last seven days: ${d.trend.map(x=>`${x.day}: ${x.count}`).join('; ')}">${d.trend.map(x=>`<div class="data-trend-day"><span class="data-trend-count">${x.count||''}</span><span class="data-trend-track"><span style="height:${x.count?Math.max(8,Math.round(x.count/trendMax*100)):0}%"></span></span><span class="data-trend-label">${esc(x.day.slice(5))}</span></div>`).join('')}</div>`;
 const history=d.wins.slice(0,dataVisible).map(w=>`<div class="data-completion"><strong>${esc(w.title||'Completed task')}</strong><span>${esc(w.at&&Number.isFinite(Date.parse(w.at))?dateLabel(w.at):'Date not recorded')} · ${esc(w.person||'Unattributed')}</span></div>`).join('')||'<p>No recorded completions in these filters.</p>';
 return `<section class="task-data-page">${tabs([['7','7 Days'],['30','30 Days'],['90','90 Days'],['all','All']],dataPeriod,'data-period','nested')}${roomSelect}<div class="data-metrics">${card(`<strong>${d.count}</strong><span>Recorded completions</span>`)}${card(`<strong>${d.points}</strong><span>Recorded points</span>`)}${card(`<strong>${d.minutes}</strong><span>Recorded minutes</span>`)}</div>${card(`<h2>Last 7 days</h2>${trend}`)}${card(`<h2>By room</h2>${byRoom}`)}${card(`<h2>Completion history</h2>${history}${d.wins.length>dataVisible?button('Show 12 more','data-more','','ghost'):''}${d.undated?`<p class="small">${d.undated} record${d.undated===1?'':'s'} without a usable date appear only in All history, not time charts.</p>`:''}${d.archiveCount?`<p class="small">${d.archiveCount} archived completion${d.archiveCount===1?'':'s'} are preserved in summaries but excluded from these dated metrics because individual dates/rooms may not be available.</p>`:''}`)}</section>`;
}
function morePage(){return [['manage','Manage home'],['schedule','Schedule preview'],['laundry','Laundry'],['laundry-settings','Laundry setup & editing'],['backup','Backup & custom tasks'],['settings','Settings & household'],['help','Help']].map(([id,label])=>card(button(esc(label)+' ›','navigate',id,'wide ghost'))).join('');}
const headerBounds={'Tidy-ish.png':[126,425],'cat-trays-header.png':[44,505],'entrance-header.png':[126,448],'living-header(1).png':[29,598],'bathroom-header.png':[109,437],'storage-header.png':[26,609],'bedroom-cat-header.png':[63,529],'bedroom-bigfoot-header.png':[7,641],'3d-printer-header.png':[75,507],'kitchen-header.png':[88,480]};
function compactHeader(path,label){const key=path.split('/').at(-1),[top,height]=headerBounds[key]||[0,656];return `<svg class="brand-logo" viewBox="0 ${top} 1280 ${height}" role="img" aria-label="${esc(label)}" style="width:${1280/height*44}px"><image href="${asset(path)}" width="1280" height="656"/></svg>`;}
function render(){const y=window.scrollY;document.body.classList.toggle('reduce-motion',F().reduceMotion);const title={doing:'Doing Now',side:'Side quests',laundry:'Laundry','laundry-settings':'Laundry setup & editing',manage:'Manage home',schedule:'Schedule preview',data:'Task Data',calendar:'Calendar',settings:'Settings',help:'Help',backup:'Backup & custom tasks',more:'More'}[route]||'';const r=route==='room'?room(roomId):null;const header=r?.header?`headers/${r.header}`:'headers/Tidy-ish.png';let content=route==='home'?home():route==='room'?roomPage():route==='doing'?doingPage():route==='side'?sidePage():route==='calendar'?calendarPage():route==='data'?dataPage():route==='schedule'?schedulePage():route==='laundry'?laundryPage():route==='laundry-settings'?laundryPage(true):route==='manage'?managePage():route==='settings'?settingsPage():route==='help'?helpPage():route==='backup'?backupPage():morePage();app.innerHTML=`${route==='home'?globals(true):`<header class="top"><div class="brand">${compactHeader(header,r?'Tidy-ish · '+r.name:'Tidy-ish')}${globals()}</div>${title?`<h1>${title}</h1>`:''}</header>`}<main class="${route==='home'?'home-main':''}">${storageError?`<p class="error">Saved data could not be opened. It has been preserved: ${esc(storageError)}</p>`:''}${content}</main>${footer()}`;// If the optional picture is unavailable, keep six visible, usable text tabs.
// Simplified SVG icons require no image-loading fallback.
window.scrollTo(0,y);updateClocks();}
function dialog(title,body,onSave=null,{saveLabel='Save',dirty=false,afterSave=''}={}){if(editor.open)closeDialog(true);dialogSave=onSave;dialogDirty=dirty;editor.innerHTML=`<form id="modal-form"><header>${onSave?'<button type="submit" aria-label="Confirm changes">✓</button>':''}<h2>${esc(title)}</h2>${button('Close','close-dialog','','ghost')}</header><div class="dialog-body">${body}${onSave?`<div class="dialog-footer"><button type="submit">${esc(saveLabel)}</button>${button('Cancel','close-dialog','','ghost')}</div>`:''}${afterSave}</div></form>`;editor.showModal();editor.querySelector('input:not([type=checkbox]),textarea,select')?.focus({preventScroll:true});}
function closeDialog(force=false){if(!force&&dialogDirty&&!confirm('Discard changes? Choose Cancel to keep editing.'))return false;if(dialogCleanup)dialogCleanup();dialogCleanup=null;editor.close();dialogDirty=false;dialogSave=null;if(pendingExternal){board=pendingExternal;pendingExternal=null;lastSaved=localStorage.getItem(KEY)||'';render();}return true;}
editor.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});editor.addEventListener('input',e=>{if(editor.querySelector('.phone-timer-panel')&&(e.target.closest('.phone-timer-panel')||e.target.name==='minutes'))return;dialogDirty=true;});editor.addEventListener('submit',async e=>{e.preventDefault();try{if(dialogSave)await dialogSave(new FormData(e.target),e.target);}catch(err){notice(err.message)}});
function confirmDialog(title,text,action,label='Confirm'){dialog(title,`<p>${esc(text)}</p>`,()=>{if(action()!==false)closeDialog(true);},{saveLabel:label});}
function taskEditorTabs(selected){
 const entries=[['task','Add Task'],['saved','Add Saved Task'],['scheduled','Add Scheduled Task']];
 return `<div class="tabs add-task-tabs" role="tablist" aria-label="Choose how to add a task">${entries.map(([id,label])=>button(esc(label),'task-editor-tab',id,id===selected?'active':'',`role="tab" aria-selected="${id===selected}"`)).join('')}</div>`;
}
function taskEditor(original=null,template=false,mode='task'){
 const creating=!original&&!template;
 const t=M.clone(original||M.task({room:route==='room'?roomId:rooms()[0]?.id||'',doing:route==='doing',side:route==='side'||route==='room'&&tab==='side',sideKind:sideTab==='all'?'organisation':sideTab}));
 const heading=template?(t.title?'Edit reusable task':'Add reusable task'):(t.title?'Edit task':'Add task');
 const tabBar=creating?taskEditorTabs(mode):'';
 if(creating&&mode==='saved'){
  const available=F().templates.filter(saved=>!F().hiddenTemplates.includes(saved.id));
  const savedList=available.length?available.map(saved=>card(`<div class="row spread"><strong>${esc(saved.title)}</strong>${button('Choose','activate-template',saved.id,'ghost',`aria-label="Choose ${esc(saved.title)}"`)}</div>`)).join(''):'<p class="empty">No saved tasks yet. Create one under More → Manage home → Reusable tasks.</p>';
  dialog('Add task',tabBar+savedList);
  return;
 }
 const selectedTools=t.tools.split('\n').map(x=>x.trim()).filter(Boolean);
 const scheduleFields=creating&&mode==='scheduled'?`<div class="schedule-entry"><div class="columns">${field('Repeat every','repeatValue',1,'number','required min="1" max="3650" step="1"')}${select('Unit','repeatUnit',[['days','Days'],['weeks','Weeks'],['months','Months']],'weeks')}</div>${field('First due date (optional)','firstDue','','date')}<p class="small">Without a first due date, the calendar preview starts after the first interval.</p></div>`:'';
 const core=tabBar+field('Task name','title',t.title,'text','required maxlength="500"')+select('Room','room',[['','No room (Homeless)'],...rooms().map(r=>[r.id,r.name])],t.room)+`<div class="add-task-options" role="group" aria-label="Task location and priority">${check('Add to Doing Now','doing',t.doing)}${check('Needs attention','attention',t.attention)}${check('Sidequest','side',t.side)}</div>`+detail('Add subtask',area('Subtasks — one per line','children',t.children.map(c=>c.title).join('\n')))+scheduleFields;
 const commonTools=F().tools.map(tool=>check(tool,'tool',selectedTools.includes(tool),`value="${esc(tool)}"`)).join('');
 const more=detail('More options',area('Tools — one per line','tools',t.tools)+field('Custom tool (optional)','customTool','')+check('Add to Tools List','saveCustomTool')+(commonTools?detail('Common Tools',`<div class="compact-tools">${commonTools}</div>`):'')+area('Notes','notes',t.notes)+`<div class="columns">${field('Estimate (minutes)','estimate',t.estimate,'number','min="0" max="100000"')}${field('Priority (1 highest, 5 lowest)','priority',t.priority,'number','min="1" max="5"')}</div>`+field('Physical effort','effort',t.effort)+field('Due date (optional)','dueDate',t.dueDate,'date')+select('Mess impact','messImpact',['none','tiny','small','normal','big'].map(x=>[x,x]),t.messImpact)+assigneeField(t)+field('Area','area',t.area)+select('Sidequest tab','sideKind',sideChoices().filter(([id])=>id!=='all'),t.sideKind)+`<label class="field">Attach image<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label>${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Current attachment">${check('Remove image','removeImage')}`:''}${M.repeat(t)?'<p class="small">Existing repeat rules are preserved. Schedule editing will follow later.</p>':''}`);
 dialog(heading,core,async(fd)=>{
  const names=String(fd.get('children')||'').split('\n').map(x=>x.trim()).filter(Boolean),remaining=[...t.children];
  const updated=names.map((name,i)=>{const old=remaining.find(c=>c.title===name)||t.children[i]&&remaining.includes(t.children[i])&&!names.includes(t.children[i].title)&&t.children[i];if(old)remaining.splice(remaining.indexOf(old),1);return old?{...old,title:name}:M.child({title:name});});
  const ids=new Set(updated.map(c=>c.id));updated.forEach(c=>{if(c.parentId&&!ids.has(c.parentId))c.parentId=''});
  let image=fd.get('removeImage')?'':t.image;const file=fd.get('image');
  if(file?.size){if(file.size>2*1024*1024)throw Error('Choose an image smaller than 2 MB.');if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP or GIF image.');image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Image could not be read.'));reader.readAsDataURL(file);});}
  const assignedUserId=String(fd.get('assignedUserId')||''),assigned=window.TidySharing?.people()?.find(p=>p.id===assignedUserId)?.name||(fd.has('assigned')?String(fd.get('assigned')||''):assignedUserId===t.assignedUserId?t.assigned:'');
  const customTool=String(fd.get('customTool')||'').trim();
  if(fd.has('saveCustomTool')&&!customTool)throw Error('Enter a custom tool before adding it to your Tools List.');
  const saved={...t,title:String(fd.get('title')||'').trim(),room:String(fd.get('room')||''),doing:fd.has('doing'),attention:fd.has('attention'),side:fd.has('side'),children:updated,tools:[...new Set([...String(fd.get('tools')||'').split('\n'),...fd.getAll('tool'),customTool].map(x=>x.trim()).filter(Boolean))].join('\n'),notes:String(fd.get('notes')||''),estimate:Number(fd.get('estimate')),priority:Number(fd.get('priority')),effort:String(fd.get('effort')||''),dueDate:String(fd.get('dueDate')||''),messImpact:String(fd.get('messImpact')||''),assigned,assignedUserId,area:String(fd.get('area')||''),sideKind:String(fd.get('sideKind')||''),image,touched:t.touched||!!t.generatedFrom,wasParent:t.wasParent||updated.length>0};
  if(creating&&mode==='scheduled'){
   const raw=String(fd.get('repeatValue')||''),value=Number(raw),unit=String(fd.get('repeatUnit')||'');
   if(!/^\d+$/.test(raw)||!Number.isInteger(value)||value<1||value>3650||!['days','weeks','months'].includes(unit))throw Error('Choose a valid repeat interval.');
   const firstDue=String(fd.get('firstDue')||'');
   if(firstDue&&(!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)||!Number.isFinite(Date.parse(firstDue+'T12:00:00Z'))||new Date(firstDue+'T12:00:00Z').toISOString().slice(0,10)!==firstDue))throw Error('Enter a valid first due date.');
   saved.repeatDays=unit==='months'?0:value*(unit==='weeks'?7:1);
   saved.repeatMonths=unit==='months'?value:0;
   saved.nextDue=firstDue;
  }
  if(!saved.title)throw Error('Enter a task name.');
  if(board.features.browserSync&&original&&t.side!==saved.side)throw Error('Moving a shared task between Tasks and Sidequests is for a later stage. Keep its category to preserve the shared identity.');
  if(change(b=>{
   if(template){const at=b.features.templates.findIndex(x=>x.id===t.id);if(at>=0)b.features.templates[at]=saved;else b.features.templates.unshift(saved);}
   else{const at=b.tasks.findIndex(x=>x.id===t.id);if(at<0)M.add(b,saved);else b.tasks[at]=saved;const order=b.doingOrder.filter(x=>x!==saved.id);b.doingOrder=saved.doing?(t.doing&&at>=0?b.doingOrder:[saved.id,...order]):order;}
   if(fd.has('saveCustomTool')&&!b.features.tools.some(tool=>tool.toLowerCase()===customTool.toLowerCase()))b.features.tools.push(customTool);
  })){closeDialog(true);notice('Task saved');}
 },{saveLabel:creating?'Add task':'Save',afterSave:more});
}

function assigneeField(t){const people=window.TidySharing?.people()||[];return people.length?select('Assigned to','assignedUserId',[['','Anyone'],...people.map(p=>[p.id,p.name]),...(t.assignedUserId&&!people.some(p=>p.id===t.assignedUserId)?[[t.assignedUserId,t.assigned||'Current assignment']]:[])],t.assignedUserId):field('Assigned to','assigned',t.assigned);}
function childEditor(t,c=null,parent=''){const original=c?M.clone(c):M.child({parentId:parent});dialog(c?'Edit subtask':'Add subtasks',area(c?'Subtask name':'Subtask names — one per line','title',original.title)+area('Tools','tools',original.tools)+area('Notes','notes',original.notes)+field('Estimate (minutes)','estimate',original.estimate,'number','min="0"')+field('Sorting follow-up (optional)','followupTitle',original.followupTitle),fd=>{const names=String(fd.get('title')).split('\n').map(x=>x.trim()).filter(Boolean);if(!names.length)throw Error('Enter a subtask name.');if(change(b=>{const root=b.tasks.find(x=>x.id===t.id);if(c){Object.assign(root.children.find(x=>x.id===c.id),{title:names[0],tools:String(fd.get('tools')),notes:String(fd.get('notes')),estimate:Number(fd.get('estimate')),followupTitle:String(fd.get('followupTitle'))});}else root.children.push(...names.map(title=>M.child({title,parentId:parent,tools:String(fd.get('tools')),notes:String(fd.get('notes')),estimate:Number(fd.get('estimate')),followupTitle:String(fd.get('followupTitle'))})));root.wasParent=true;})){openTasks.add(t.id);closeDialog(true);render();}});}
function pageKey(){return `${route}:${roomId}:${tab}:${doingTab}`;}
function timerDialog(t,cid){
 const item=cid?t.children.find(c=>c.id===cid):t;
 const measured=`<div class="timer-value" data-clock-task="${esc(t.id)}" data-clock-child="${esc(cid||'')}">00:00</div><div class="row">${button('Start stopwatch','timer-start',t.id,'',`data-child="${esc(cid||'')}"`)}${button('Pause','timer-pause',t.id,'',`data-child="${esc(cid||'')}"`)}${button('Reset','timer-reset',t.id,'ghost',`data-child="${esc(cid||'')}"`)}${button('Stop and save measured time','timer-save',t.id,'',`data-child="${esc(cid||'')}"`)}</div><p class="small">Saved measurements are independent from the phone alarm.</p>`;
 dialog(item.title,`${field('Minutes','minutes',15,'number','min="1" max="1440" step="1" required')}${detail('Record task time with stopwatch',measured)}`);
 if(window.TidyPhoneTimer?.addPhoneTimer)window.TidyPhoneTimer.addPhoneTimer(editor,editor.querySelector('#modal-form'));
 else notice('Phone timer component is unavailable. The task stopwatch still works.');
 updateClocks();
}
function updateClocks(){document.querySelectorAll('[data-clock-task]').forEach(el=>{const t=task(el.dataset.clockTask),item=el.dataset.clockChild?t?.children.find(c=>c.id===el.dataset.clockChild):t;if(item){const sec=Math.floor(M.time(item)/1000);el.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}});const cd=$('[data-countdown]');if(cd){const left=Math.max(0,Math.ceil(((F().countdownEndsAt||0)-Date.now())/1000));cd.textContent=F().countdownEndsAt?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Ready';if(F().countdownEndsAt&&left===0){change(b=>b.features.countdownEndsAt=0,{redraw:false});notice('Focus countdown finished');if(F().sound)beep();}}}
function beep(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);gain.gain.value=.08;osc.frequency.value=660;osc.start();osc.stop(ctx.currentTime+.5);osc.onended=()=>ctx.close();}catch{}}
function focusTimer(){
 dialog('Focus timer & music',`${field('Minutes','minutes',10,'number','min="1" max="1440" step="1" required')}${detail('In-browser countdown (only while open)',`<div class="timer-value" data-countdown>Ready</div><div class="row">${button('Start countdown','countdown-start')}${button('Cancel countdown','countdown-stop','','ghost')}</div><p class="small">Browser suspension may delay this countdown. For an actual alarm use the phone timer above.</p>`)}${detail('Music',`${select('Track','track',['calm','dubstep','morning','steps','waltz'].map(x=>[x,x]),'calm')}<div class="row">${button('Play music','music-play')}${button('Stop music','music-stop','','ghost')}</div>`)}`);
 if(window.TidyPhoneTimer?.addPhoneTimer)window.TidyPhoneTimer.addPhoneTimer(editor,editor.querySelector('#modal-form'));
 updateClocks();
}
function toolsDialog(id=''){const ts=route==='doing'?M.doing(board):visibleTasks(),tools=[...new Set(ts.filter(t=>!id||t.room===id).filter(t=>!t.done).flatMap(t=>[t.tools,...t.children.filter(c=>!c.done).map(c=>c.tools)]).flatMap(s=>s.split(/[\n,]/)).map(x=>x.trim()).filter(Boolean))];dialog(id?'Tools · '+(room(id)?.name||'Homeless'):'Tools needed',tools.length?tools.map(x=>check(x,'tool')).join(''):'<p>No tools listed for the selected tasks.</p>');}
function focusDialog(id=''){if(!id){dialog('Focus on a room',rooms().map(r=>button(esc(r.name),'focus-room-choice',r.id,'wide')).join(''));return;}const standard={id:'standard:'+id,room:id,name:'Clear the Way',steps:['Collect items belonging to other rooms','Protect important items','Collect obvious rubbish','Clear loose floor clutter'],followups:{'Collect items belonging to other rooms':'Sort items for other rooms','Protect important items':'Sort important items','Clear loose floor clutter':'Sort collected floor items'}},routines=[standard,...F().routines.filter(r=>r.room===id&&!r.hidden)];const chosen=routines[0];let resets=new Set(chosen.steps);function first(routine=chosen){dialog('Focus · '+room(id).name,`<h3>Clear the Way</h3>${select('Choose routine','routine',routines.map(r=>[r.id,r.name]),routine.id)}${routine.steps.map(s=>check(s,'reset',resets.has(s),`value="${esc(s)}"`)).join('')}<div class="row">${button('Skip reset','focus-skip')}${button('Next','focus-next')}</div>`);editor.querySelector('[name=routine]').onchange=e=>{const r=routines.find(r=>r.id===e.target.value);resets=new Set(r.steps);first(r);};editor.querySelector('[data-action=focus-next]').onclick=()=>{resets=new Set([...editor.querySelectorAll('[name=reset]:checked')].map(x=>x.value));second(routine)};editor.querySelector('[data-action=focus-skip]').onclick=()=>{resets.clear();second(routine)};}
function second(routine){const resetIds=F().focusSessions.flatMap(s=>s.resetIds);dialog('Focus · '+room(id).name,`<h3>Other tasks</h3>${board.tasks.filter(t=>t.room===id&&!t.done&&!M.paused(t)&&!resetIds.includes(t.id)).map(t=>check(t.title,'task',false,`value="${esc(t.id)}"`)).join('')}<h3>Reset preview · ${esc(routine.name)}</h3>${[...resets].map(s=>`<p class="small">• ${esc(s)}</p>`).join('')}${button('Back','focus-back','','ghost')}`,fd=>{const selected=fd.getAll('task');if(!resets.size&&!selected.length)throw Error('Select a reset step or task.');if(change(b=>M.focus(b,id,routine,[...resets],selected))){closeDialog(true);route='doing';doingTab='doing';render();}},{saveLabel:'Start in Doing Now'});editor.querySelector('[data-action=focus-back]').onclick=()=>first(routine);}
first();}
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportBoard(){const copy=M.clone(board);delete copy.features.browserSync;delete copy.features.householdSync;delete copy.features.connectedHouse;if(board.features.browserSync?.base)copy.sharedSnapshot=M.clone(board.features.browserSync.base);download(`Tidy-ish-HTML-${M.date()}.json`,JSON.stringify(copy,null,2));}
const actions={
 navigate:el=>navigate(el.dataset.id),room:el=>navigate('room',el.dataset.id),later:()=>notice('This feature will follow later.'),
 'calendar-month-prev':()=>{calendarOffset--;render()},'calendar-month-next':()=>{calendarOffset++;render()},
 'calendar-day':el=>calendarDay(el.dataset.id),
 'skip-date':el=>{const date=el.dataset.date,id=el.dataset.id;if(!id||!date)return;const ok=change(b=>{const t=b.tasks.find(t=>t.id===id);if(t){t.skippedDates=[...new Set([...(t.skippedDates||[]),date])];}});if(ok){closeDialog(true);notice('Skipped only this date; the recurring task and history remain.');}},
 'schedule-prev':()=>{scheduleWeek--;render()},'schedule-next':()=>{scheduleWeek++;render()},
 'data-period':el=>{dataPeriod=el.dataset.id;dataVisible=12;render()},
 'data-more':()=>{dataVisible+=12;render()},
 extra:()=>dialog('Extra rooms',rooms().filter(r=>!positions[houseKey(r)]).map(r=>button(esc(r.name),'dialog-room',r.id,'wide')).join('')||'<p>No extra rooms</p>'),
 'all-rooms':()=>dialog('All rooms',rooms().map(r=>button(esc(r.name),'dialog-room',r.id,'wide')).join('')),
 'dialog-room':el=>{closeDialog(true);navigate('room',el.dataset.id)},'room-tab':el=>{tab=el.dataset.id;search='';render()},'doing-tab':el=>{doingTab=el.dataset.id;search='';render()},'side-tab':el=>{sideTab=el.dataset.id;render()},
 view:()=>{detailed=!detailed;render()},'set-doing-view':el=>{doingDetailed=el.dataset.id==='detailed';try{localStorage.setItem(DOING_VIEW_KEY,doingDetailed?'detailed':'compact')}catch{}render()},'task-menu':el=>{const t=task(el.dataset.id);if(!t)return;dialog('Task actions · '+t.title,`<div class="doing-menu-grid">${button('✎ Edit task','edit-task',t.id)}${button('＋ Add subtask','add-child',t.id)}${button(stopwatch+' Timer','timer',t.id)}${button('Save reusable','save-template',t.id)}${button(t.paused?'Resume task':'Pause task','pause-task',t.id)}${button('Delete task','delete-task',t.id)}</div>${t.notes?`<p>${esc(t.notes).replace(/\n/g,'<br>')}</p>`:''}${t.tools?`<p class="small">Tools: ${esc(t.tools).replace(/\n/g,', ')}</p>`:''}${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Task attachment">`:''}`)},search:()=>{uiSearch=!uiSearch;if(!uiSearch)search='';render();$('#task-search')?.focus()},
 'add-task':()=>taskEditor(),'edit-task':el=>taskEditor(task(el.dataset.id)),expand:el=>{const id=el.dataset.id;openTasks.has(id)?openTasks.delete(id):openTasks.add(id);render()},
 'select-task':el=>change(b=>M.select(b,el.dataset.id,el.type==='checkbox'?el.checked:!task(el.dataset.id).doing)),
 complete:el=>{const t=task(el.dataset.id);const complete=()=>change(b=>M.finish(b,t.id,!t.done));if(!t.done&&t.children.some(c=>!c.done)){openTasks.add(t.id);confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,complete,'Done em all');}else complete()},
 'child-complete':el=>{const t=task(el.dataset.id),c=t.children.find(c=>c.id===el.dataset.child);const run=()=>change(b=>M.completeChild(b,t.id,c.id,!c.done));if(!c.done&&t.children.some(x=>x.parentId===c.id))confirmDialog('Done em all',`Complete all subtasks in ${c.title}?`,run,'Done em all');else run()},
 'add-child':el=>childEditor(task(el.dataset.id),null,el.dataset.child||''),'edit-child':el=>{const t=task(el.dataset.id);childEditor(t,t.children.find(c=>c.id===el.dataset.child))},
 first:el=>change(b=>M.move(b,el.dataset.id,'first',route==='doing'&&doingTab==='doing')),last:el=>change(b=>M.move(b,el.dataset.id,'last',route==='doing'&&doingTab==='doing')),
 'child-first':el=>childMove(el,true),'child-last':el=>childMove(el,false),
 'delete-task':el=>{const t=task(el.dataset.id);confirmDialog('Delete task?',`Remove “${t.title}” and its subtasks from this browser’s active list? Completion history is kept.`,()=>{const snapshot={task:M.clone(t),index:board.tasks.indexOf(t),order:M.clone(board.doingOrder),page:pageKey()};if(change(b=>{b.tasks=b.tasks.filter(x=>x.id!==t.id);b.doingOrder=b.doingOrder.filter(x=>x!==t.id)})){deleted=snapshot;render();return true;}return false;},'Delete')},
 'undo-delete':()=>{if(!deleted)return;const d=deleted;if(change(b=>{if(!b.tasks.some(t=>t.id===d.task.id)){b.tasks.splice(Math.min(d.index,b.tasks.length),0,d.task);if(d.task.doing)b.doingOrder=[...d.order.filter(id=>id===d.task.id||b.doingOrder.includes(id)),...b.doingOrder.filter(id=>!d.order.includes(id))];}})){deleted=null;render();}},
 choose:()=>dialog('Choose tasks',board.tasks.filter(t=>!t.done&&!M.paused(t)).map(t=>check(t.title,'task',t.doing,`value="${esc(t.id)}"`)).join('')||'<p>Add a task in a room or Doing Now first.</p>',fd=>{const ids=new Set(fd.getAll('task'));if(change(b=>b.tasks.filter(t=>!t.done).forEach(t=>M.select(b,t.id,ids.has(t.id)))))closeDialog(true)},{saveLabel:'Done'}),
 collapse:el=>{const id=el.dataset.id;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);render()},tools:el=>toolsDialog(el.dataset.id),focus:el=>focusDialog(el.dataset.id),'focus-room-choice':el=>focusDialog(el.dataset.id),'focus-timer':focusTimer,
 timer:el=>timerDialog(task(el.dataset.id),el.dataset.child),
 'timer-start':el=>timerChange(el,t=>{if(!t.startedAt)t.startedAt=Date.now()}),'timer-pause':el=>timerChange(el,t=>{t.elapsed=M.time(t);t.startedAt=0}),
 'timer-reset':el=>confirmDialog('Reset stopwatch?','This resets only the elapsed time for this task.',()=>timerChange(el,t=>{t.elapsed=0;t.startedAt=0}), 'Reset'),
 'timer-save':el=>{const id=el.dataset.id,cid=el.dataset.child;timerChange(el,t=>{t.elapsed=M.time(t);t.startedAt=0});const t=task(id),item=cid?t.children.find(c=>c.id===cid):t,minutes=Math.round(M.time(item)/60000);if(minutes<1){notice('Record at least one minute before saving a measurement.');return;}if(change(b=>b.features.items.unshift({id:M.uid(),kind:'measurement',text:item.title,date:M.date(),start:String(minutes),location:cid||id}))){dialog('Measurement saved',`<p>${esc(item.title)} · ${minutes} min</p>${button('Use as estimate','timer-estimate',id,'',`data-child="${esc(cid||'')}" data-minutes="${minutes}"`)}`);}},
 'timer-estimate':el=>{if(timerChange(el,t=>{t.estimate=Number(el.dataset.minutes);t.presetMinutes=0})){closeDialog(true);notice('Estimate updated')}},
 'countdown-start':()=>{const n=Number(editor.querySelector('[name=minutes]').value);if(!(n>=1&&n<=1440))throw Error('Choose 1 to 1440 minutes.');change(b=>b.features.countdownEndsAt=Date.now()+n*60000,{redraw:false,sync:false});updateClocks()},
 'countdown-stop':()=>{change(b=>b.features.countdownEndsAt=0,{redraw:false,sync:false});updateClocks()},
 'music-play':async()=>{if(!F().sound)throw Error('Enable Sounds in Settings first.');music?.pause();music=new Audio(asset('audio/'+editor.querySelector('[name=track]').value+'.wav'));music.loop=true;await music.play()},'music-stop':()=>{music?.pause();music=null},
 'laundry-step':el=>change(b=>{const slot=Number(el.dataset.id);let l=b.features.laundry.find(l=>l.slot===slot);if(!l){l=M.clone(displayLoads().find(l=>l.slot===slot));b.features.laundry.push(l)}const oldRoute=l.route;if(el.dataset.route)l.route=el.dataset.route;M.laundry(b,slot);if(l._undo)l._undo.load.route=oldRoute;}),
 'laundry-undo':el=>change(b=>M.undoLaundry(b,Number(el.dataset.id))),
 'uniform-step':el=>change(b=>{const f=b.features;if(f.uniformIndex===1&&['darks','whites'].includes(el.dataset.id)&&!f.uniformSteps[1].includes(el.dataset.id))f.uniformSteps=f.uniformSteps.map(s=>s.replace(/darks/g,'{first}').replace(/whites/g,'darks').replace(/\{first\}/g,'whites'));M.uniform(b)}),
 'uniform-undo':()=>change(M.undoUniform),'uniform-pause':()=>dialog('Pause uniform',field('Days to pause (leave blank until resumed)','days','','number','min="1" max="3650"'),fd=>{const raw=String(fd.get('days'));if(raw&&Number(raw)<1)throw Error('Enter one or more days.');if(change(b=>{b.features.uniformPaused=true;b.features.uniformPauseUntil=raw?M.plus(M.date(),Number(raw)):''}))closeDialog(true)},{saveLabel:'Pause uniform'}),
 'uniform-resume':()=>change(b=>{b.features.uniformPaused=false;b.features.uniformPauseUntil='';M.refresh(b)}),
 'new-load':()=>dialog('Add another load',select('Drying route','route',[['rail','Washing & rail'],['dryer','Washing & dryer']],'rail'),fd=>{if(change(b=>b.features.laundry.push({slot:Math.max(...b.features.laundry.map(l=>l.slot),0)+1,route:fd.get('route'),step:0,selected:false})))closeDialog(true)},{saveLabel:'Add load'}),
 'laundry-oneoff':el=>change(b=>{const item=b.features.items.find(i=>i.id===el.dataset.id);item.done=el.checked;if(item.done){const record={id:M.uid(),taskId:item.id,title:item.text,room:'laundry',at:new Date().toISOString(),points:1,person:b.features.displayName,minutes:0,measured:false};item._win=record.id;b.features.wins.push(record)}else b.features.wins=b.features.wins.filter(w=>w.id!==item._win)}),
 notifications:async()=>{if(!('Notification'in window))throw Error('This browser does not support notifications.');const permission=await Notification.requestPermission();notice(permission==='granted'?'Browser reminders enabled while this page is open.':'Notifications were not enabled.')},
 calibrate:el=>{const r=room(el.dataset.id),clean=Math.round(M.cleanPercent(M.mess(board,r)));dialog('Adjust cleanliness',`<p>${esc(r.name)}</p><label class="field">Cleanliness (0% Chaos, 100% Spotless)<input type="range" name="cleanliness" min="0" max="100" value="${clean}"><output>${clean}%</output></label>`,fd=>{const clean=Number(fd.get('cleanliness'));if(change(b=>M.calibrate(b,r.id,100-clean)))closeDialog(true)});editor.querySelector('[name=cleanliness]').oninput=e=>editor.querySelector('output').textContent=e.target.value+'%'},
 // Creature taps are local, non-persistent interactions: never add tasks or alter mess level.
 'creature-react':el=>{
  const r=room(el.dataset.id);if(!r)return;
  const m=M.mess(board,r),state=m>=100?3:m>=5/14*100?2:m>0?1:0;
  const lines=['Looking lovely in here!','A little tidy-up would be nice.','One small task at a time.','We can tackle the chaos together!'];
  const phrase=lines[state],bubble=el.querySelector('.guardian-speech');
  if(bubble)bubble.textContent=phrase;
  el.classList.remove('is-reacting');void el.offsetWidth;
  el.classList.add('is-reacting');
  clearTimeout(el._reactionTimer);
  el._reactionTimer=setTimeout(()=>el.classList.remove('is-reacting'),2500);
  notice(phrase);
 },
 setting:el=>change(b=>b.features[el.dataset.id]=el.checked),
 'rename-room':el=>{const r=room(el.dataset.id);dialog('Rename room',field('Room name','name',r.name,'text','required'),fd=>{const name=String(fd.get('name')).trim();if(!name||board.rooms.some(x=>x.id!==r.id&&x.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a unique room name.');if(change(b=>b.rooms.find(x=>x.id===r.id).name=name))closeDialog(true)})},
 'archive-room':el=>change(b=>{const r=b.rooms.find(r=>r.id===el.dataset.id);r.archived=!r.archived}),
 'room-first':el=>change(b=>{const r=b.rooms.find(r=>r.id===el.dataset.id);b.rooms=[r,...b.rooms.filter(x=>x.id!==r.id)]}),
 areas:el=>{const id=el.dataset.id;dialog('Areas · '+room(id).name,area('Area names — one per line','areas',(F().areas[id]||[]).join('\n')),fd=>{const names=[...new Set(String(fd.get('areas')).split('\n').map(x=>x.trim()).filter(Boolean))];if(change(b=>b.features.areas[id]=names))closeDialog(true)})},
 'save-template':el=>{const t=task(el.dataset.id);change(b=>{const saved=M.templateCopy(t,t.room);saved.templateId='';b.features.templates.unshift(saved)});notice('Reusable task saved')},
 'task-editor-tab':el=>{if(dialogDirty&&!confirm('Discard unsaved changes and switch tabs?'))return;taskEditor(null,false,el.dataset.id)},
 'new-template':()=>taskEditor(null,true),'edit-template':el=>taskEditor(F().templates.find(t=>t.id===el.dataset.id),true),
 'hide-template':el=>change(b=>b.features.hiddenTemplates.push(el.dataset.id)),'restore-template':el=>change(b=>b.features.hiddenTemplates=b.features.hiddenTemplates.filter(id=>id!==el.dataset.id)),
 'activate-template':el=>{const t=F().templates.find(t=>t.id===el.dataset.id);dialog('Add '+t.title,rooms().map(r=>check(r.name,'room',r.id===t.room,`value="${esc(r.id)}"`)).join('')+check('Add to Doing Now','doing'),fd=>{const rs=fd.getAll('room');if(!rs.length)throw Error('Choose a room.');if(change(b=>rs.forEach(id=>{const active=b.tasks.find(x=>x.templateId===t.id&&x.room===id&&!x.done);if(active){if(fd.has('doing'))M.select(b,active.id,true)}else M.add(b,M.templateCopy(t,id,fd.has('doing')))})))closeDialog(true)},{saveLabel:'Add to selected rooms'})},
 'pause-task':el=>{const t=task(el.dataset.id);if(t.paused){change(b=>b.tasks.find(x=>x.id===t.id).paused=false);return;}dialog('Pause task',field('Days to pause (blank until resumed)','days','','number','min="1" max="3650"'),fd=>{const n=String(fd.get('days'));if(change(b=>{const t=b.tasks.find(x=>x.id===el.dataset.id);t.paused=true;t.pauseUntil=n?M.plus(M.date(),Number(n)):''}))closeDialog(true)},{saveLabel:'Pause'})},
 'new-side-tab':()=>dialog('New sidequest tab',field('Tab name','name','','text','required'),fd=>{const name=String(fd.get('name')).trim();if(!name)throw Error('Enter a name.');if(change(b=>b.features.sideTabs.push({id:M.uid(),name})))closeDialog(true)}),
 'homeless-remove':el=>confirmDialog('Remove item?','Remove this item from the room’s homeless list?',()=>change(b=>b.features.items=b.features.items.filter(i=>i.id!==el.dataset.id)),'Remove'),
 export:exportBoard,'csv-template':()=>download('Tidy-ish-custom-tasks.csv','title,room,sidequest,tools,notes\n"Example task","Kitchen",false,"Cloth",""\n','text/csv'),
 'close-dialog':()=>closeDialog()
};
function childMove(el,first){change(b=>{const t=b.tasks.find(t=>t.id===el.dataset.id),c=t.children.find(c=>c.id===el.dataset.child),family=new Set([c.id]);for(let i=0;i<t.children.length;i++)t.children.forEach(x=>{if(family.has(x.parentId))family.add(x.id)});const block=t.children.filter(x=>family.has(x.id)),rest=t.children.filter(x=>!family.has(x.id));let target=first?rest.findIndex(x=>x.parentId===c.parentId):rest.findLastIndex(x=>x.parentId===c.parentId)+1;if(target<0)target=rest.length;rest.splice(target,0,...block);t.children=rest;});}
function timerChange(el,edit){const result=change(b=>{const t=b.tasks.find(t=>t.id===el.dataset.id),item=el.dataset.child?t.children.find(c=>c.id===el.dataset.child):t;edit(item)},{redraw:false});updateClocks();return result;}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;const action=actions[el.dataset.action]||window.TidySharing?.actions?.[el.dataset.action];if(!action)return;try{await action(el);}catch(err){notice(err.message)}});
document.addEventListener('submit',async e=>{if(e.target.id==='modal-form')return;e.preventDefault();const fd=new FormData(e.target);try{switch(e.target.id){case 'laundry-config':{const values=Object.fromEntries(fd);if(['wash','railTransfer','dryerTransfer','railFinish','dryerFinish'].some(k=>!values[k].trim()))throw Error('Enter a name for every step.');const steps=values.uniformSteps.split('\n').map(s=>s.trim()).filter(Boolean);if(!steps.length)throw Error('Keep at least one uniform step.');change(b=>{const f=b.features,current=f.uniformSteps[f.uniformIndex];Object.assign(f,values,{uniformSteps:steps});if(f.uniformIndex>=0)f.uniformIndex=Math.max(0,steps.indexOf(current))});notice('Cycle saved; load progress kept');break;}
case 'oneoff-form':if(fd.get('title').trim())change(b=>b.features.items.unshift({id:M.uid(),kind:'laundry',text:fd.get('title').trim(),done:false}));break;
case 'homeless-form':if(fd.get('title').trim())change(b=>b.features.items.unshift({id:M.uid(),kind:'homeless',text:fd.get('title').trim(),location:roomId}));break;
case 'add-room':{const name=String(fd.get('name')).trim();if(!name||board.rooms.some(r=>r.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a unique room name.');change(b=>b.rooms.push({id:M.uid(),name,art:'hall-background.png',header:null,mess:0,capacity:14,calibration:'',archived:false}));break;}
case 'name-form':change(b=>b.features.displayName=String(fd.get('name')).trim());notice('Name saved');break;
case 'tools-form':change(b=>b.features.tools=[...new Set(String(fd.get('tools')).split('\n').map(s=>s.trim()).filter(Boolean))]);notice('Tools saved');break;
default:await window.TidySharing?.submit?.(e.target,fd);}}catch(err){notice(err.message)}});
let searchTimer;document.addEventListener('input',e=>{if(e.target.id==='task-search'){search=e.target.value;const start=e.target.selectionStart;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{render();$('#task-search')?.focus();$('#task-search')?.setSelectionRange(start,start)},180)}});
// Reordering never creates/deletes tasks, changes completion, or touches history.
function reorderChild(rootId,from,to,after=false){
 if(from===to)return;
 const t=task(rootId),source=t?.children.find(c=>c.id===from),dest=t?.children.find(c=>c.id===to);
 if(!source||!dest||(source.parentId||'')!==(dest.parentId||'')){notice('Move subtasks within the same parent.');return;}
 change(b=>{
  const root=b.tasks.find(t=>t.id===rootId),family=new Set([from]);
  for(let i=0;i<root.children.length;i++)root.children.forEach(c=>{if(family.has(c.parentId))family.add(c.id)});
  const moving=root.children.filter(c=>family.has(c.id));
  const remaining=root.children.filter(c=>!family.has(c.id)),index=remaining.findIndex(c=>c.id===to);
  if(index<0)return;
  remaining.splice(index+(after?1:0),0,...moving);root.children=remaining;
 });
}
let dragged=null,draggedChild=null,touchChildDrag=null;
function clearChildOver(){document.querySelectorAll('.doing-child.drag-over').forEach(x=>x.classList.remove('drag-over'));}
function eligibleChildTarget(el,info){const target=el?.closest?.('[data-child-id]');return target&&target.dataset.rootId===info.root&&target.dataset.parentId===info.parent&&target.dataset.childId!==info.child?target:null;}
document.addEventListener('dragstart',e=>{
 const handle=e.target.closest('.child-grip');
 if(handle){const row=handle.closest('[data-child-id]');draggedChild={root:row.dataset.rootId,child:row.dataset.childId,parent:row.dataset.parentId};dragged=null;e.stopPropagation();e.dataTransfer?.setData('text/plain',row.dataset.childId);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';return;}
 if(e.target.closest('.doing-child')){e.preventDefault();return;}
 const card=e.target.closest('[data-task-id]');if(card){dragged=card.dataset.taskId;e.dataTransfer?.setData('text/plain',dragged);if(e.dataTransfer)e.dataTransfer.effectAllowed='move';}
});
document.addEventListener('dragover',e=>{
 if(draggedChild){const hit=eligibleChildTarget(e.target,draggedChild);if(hit){e.preventDefault();clearChildOver();hit.classList.add('drag-over');}return;}
 if(dragged&&e.target.closest('[data-task-id]'))e.preventDefault();
});
document.addEventListener('drop',e=>{
 if(draggedChild){const hit=eligibleChildTarget(e.target,draggedChild),info=draggedChild;draggedChild=null;clearChildOver();if(hit){e.preventDefault();e.stopPropagation();reorderChild(info.root,info.child,hit.dataset.childId);}return;}
 const target=e.target.closest('[data-task-id]');if(!dragged||!target)return;
 e.preventDefault();const to=target.dataset.taskId,from=dragged;dragged=null;const a=task(from),b=task(to);
 if(a&&b&&a.room===b.room&&a.side===b.side&&!a.done&&!b.done)change(b=>M.move(b,from,to,route==='doing'&&doingTab==='doing'));
 else notice('Move tasks within the same room and task section.');
});
document.addEventListener('dragend',()=>{dragged=null;draggedChild=null;clearChildOver()});
// Native HTML drag is unreliable on touch browsers: pointer events on the grip supply it.
document.addEventListener('pointerdown',e=>{
 if(e.pointerType==='mouse')return;
 const handle=e.target.closest('.child-grip');if(!handle)return;
 const row=handle.closest('[data-child-id]');if(!row)return;
 e.preventDefault();touchChildDrag={pointer:e.pointerId,root:row.dataset.rootId,child:row.dataset.childId,parent:row.dataset.parentId,fromX:e.clientX,fromY:e.clientY,over:null};
 handle.setPointerCapture?.(e.pointerId);
});
document.addEventListener('pointermove',e=>{
 const move=touchChildDrag;if(!move||move.pointer!==e.pointerId)return;
 if(Math.hypot(e.clientX-move.fromX,e.clientY-move.fromY)<6)return;
 const hit=eligibleChildTarget(document.elementFromPoint(e.clientX,e.clientY),move);
 clearChildOver();if(hit){hit.classList.add('drag-over');move.over=hit.dataset.childId;}else move.over=null;
});
document.addEventListener('pointerup',e=>{
 const move=touchChildDrag;if(!move||move.pointer!==e.pointerId)return;
 touchChildDrag=null;clearChildOver();if(move.over)reorderChild(move.root,move.child,move.over);
});
document.addEventListener('pointercancel',()=>{touchChildDrag=null;clearChildOver()});
// Accessible alternative without extra visible options on subtasks.
document.addEventListener('keydown',e=>{
 const grip=e.target.closest?.('.child-grip');if(!grip||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
 const row=grip.closest('[data-child-id]'),siblings=[...document.querySelectorAll('.doing-child')].filter(x=>x.dataset.rootId===row.dataset.rootId&&x.dataset.parentId===row.dataset.parentId&&!x.classList.contains('child-finished')===!row.classList.contains('child-finished'));
 const idx=siblings.indexOf(row),next=siblings[idx+(e.key==='ArrowUp'?-1:1)];if(!next)return;
 e.preventDefault();reorderChild(row.dataset.rootId,row.dataset.childId,next.dataset.childId,e.key==='ArrowDown');
});
document.addEventListener('change',e=>{if(e.target.id==='data-room-filter'){dataRoom=e.target.value;dataVisible=12;render();}});
document.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file||!['backup-file','csv-file'].includes(e.target.id))return;try{if(file.size>15*1024*1024)throw Error('Choose a backup smaller than 15 MB.');const text=await file.text();if(e.target.id==='backup-file'){if(!B)throw Error('Backup safety checker unavailable. Nothing was imported.');const preview=B.prepare(board,text,M);confirmDialog('Preview backup import',B.describe(preview.summary),()=>change(b=>Object.assign(b,B.apply(b,preview,M))),'Import and merge');}else{const rows=parseCSV(text),header=rows.shift()||[];if(!header.includes('title')||!header.includes('room'))throw Error('CSV needs title and room columns.');const added=rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||'']))).map(r=>{const found=board.rooms.find(x=>x.id===r.room||x.name.toLowerCase()===r.room.toLowerCase());if(r.room&&!found)throw Error('Unknown room: '+r.room);if(!r.title.trim())throw Error('Every task needs a title.');if(r.sidequest&&!['true','false'].includes(r.sidequest.toLowerCase()))throw Error('sidequest must be true or false.');return M.task({title:r.title.trim(),room:found?.id||'',side:r.sidequest.toLowerCase()==='true',tools:r.tools||'',notes:r.notes||''})}).filter(t=>!board.tasks.some(x=>x.title===t.title&&x.room===t.room));confirmDialog('Preview task upload',`${added.length} new tasks. Existing tasks are kept and matching title/room pairs are skipped.`,()=>change(b=>added.reverse().forEach(t=>M.add(b,t))),'Add these tasks');}}catch(err){notice(err.message)}finally{e.target.value=''}});
function parseCSV(text){const rows=[];let row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw Error('CSV contains an unclosed quote.');if(value||row.length){row.push(value);rows.push(row)}return rows;}
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue||e.newValue===lastSaved)return;try{const incoming=M.normalize(JSON.parse(e.newValue));if(editor.open){pendingExternal=incoming;notice('Another tab saved changes. Your open form is kept; close and reopen it before saving.');}else{lastSaved=e.newValue;board=incoming;render();}}catch{notice('Another tab supplied invalid data. The open board has been preserved.')}});
function reminders(){const f=F();for(const l of f.laundry){if(l.step!==1||!l.startedAt||Date.now()-l.startedAt<7200000||Date.now()-(l.lastReminderAt||0)<1800000)continue;if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Tidy-ish · laundry',{body:'load is ready, rewash = money down the drain',tag:'tidyish-html-laundry-'+l.slot,icon:'assets/icons/icon-192.png'});change(b=>b.features.laundry.find(x=>x.slot===l.slot).lastReminderAt=Date.now(),{redraw:false,sync:false});}catch{}}}}
window.TidyUI={getBoard:()=>board,change,render,notice,dialog,closeDialog,confirmDialog,button,field,area,check,select,card,detail,esc,navigate,exportBoard,storageKey:KEY,editing:()=>editor.open,acceptSync(next){persist(next);if(!editor.open)render();},onSyncStatus(){if(route==='settings'&&!editor.open)render();}};
render();setInterval(updateClocks,1000);setInterval(()=>{if(!editor.open){const next=M.clone(board);M.refresh(next);if(JSON.stringify(next)!==JSON.stringify(board))change(b=>Object.assign(b,next));reminders();if(route==='laundry'||route==='home'||route==='doing'&&doingTab==='laundry'||route==='doing'&&nextDoingExpiry&&Date.now()>=nextDoingExpiry)render();}},30000);
if(location.hash.includes('access_token=')||new URLSearchParams(location.search).has('code')){route='settings';render();window.addEventListener('tidy-sharing-ready',()=>window.TidySharing.init().catch(e=>notice(e.message)),{once:true});}
})();
