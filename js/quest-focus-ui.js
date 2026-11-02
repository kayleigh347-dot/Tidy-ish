/* Tidy-ish Focus and Clear the Way screens. Sessions are private to one member. */
(function(root,factory){const api=factory(root.TidyQuestFocus);if(typeof module==='object'&&module.exports)module.exports=api;else root.TidyQuestUI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Q){'use strict';
if(!Q)throw Error('Quest Focus selector module is missing.');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,id='',cls='',attrs='')=>`<button type="button" class="quest-btn ${cls}" data-action="${action}" data-id="${esc(id)}" ${attrs}>${esc(label)}</button>`;
let api=null,room='',session=null,personal=[],last='',key='',error='',pending='',query='',chosenRoutine='',clearMode=false,scope='room',editing=null,questTab='main',previousFocusAvailable=false,opened=new Set(['mine','main','bonus','optional','future','side']);
const storage=()=>api.storage||window.localStorage,user=()=>String(api.memberId?.()||'browser-local');
const hasFocus=s=>!!s&&((s.startedIds||[]).length>0||(s.questIds||[]).length>0);
function storageKey(id,mode,forScope){const prefix=mode?'tidyish-html-v023-clear-way-v1:':'tidyish-html-v023-quest-focus-v2:';return prefix+encodeURIComponent(user())+':'+(forScope==='doing'&&!mode?'doing:':'')+encodeURIComponent(id);}
function load(board,id,force=false,mode=clearMode,forScope='room'){
 const target=storageKey(id,mode,forScope);if(!force&&room===id&&key===target&&session)return;
 clearMode=mode;scope=mode?'room':forScope;room=id;key=target;session=null;personal=[];previousFocusAvailable=false;error='';pending='';query='';chosenRoutine='';editing=null;questTab='main';opened=new Set(['mine','main','bonus','optional','future','side']);last='';
 try{last=storage().getItem(key)||'';if(last){const saved=JSON.parse(last),restored=Q.sanitize(saved.session,board,id);if(!restored)throw Error('Invalid saved Focus session');session=restored;personal=Array.isArray(saved.personal)?saved.personal.filter(r=>r.scope==='personal'&&r.owner===user()&&r.room===id):[];}}
 catch{error='Your personal Focus session cannot be opened. No saved board was overwritten.';}if(session?.questTab)questTab=session.questTab;previousFocusAvailable=!mode&&hasFocus(session);
}
function persist(next,nextPersonal=personal){if(error)throw Error(error);if((storage().getItem(key)||'')!==last)throw Error('Another tab changed Focus. Reload before saving to protect the session.');const value=JSON.stringify({version:2,session:next,personal:nextPersonal});storage().setItem(key,value);last=value;session=next;personal=nextPersonal;previousFocusAvailable=!clearMode&&hasFocus(next);}
function set(patch,others=personal){try{persist({...session,...patch},others);api.render();return true;}catch(e){api.notice(e.message);return false;}}
function enter(board,id,mode='focus',forScope='room'){
 if(!api)throw Error('Quest Focus not initialised.');const asClear=mode==='clear';load(board,id,false,asClear,asClear?'room':forScope);
 if(!session){
  let legacyClear=null,legacySession=null;if(asClear){try{const prev=JSON.parse(storage().getItem(storageKey(id,false,'room'))||'null');personal=Array.isArray(prev?.personal)?prev.personal.filter(r=>r.scope==='personal'&&r.owner===user()&&r.room===id):[];if(['clear-choose','clear-active'].includes(prev?.session?.phase))legacyClear=Q.sanitize(prev.session,board,id);}catch{}}else if(scope==='doing'){try{const old=api.legacyDoingFocus?.();if(old?.ids?.length){const active=old.phase==='active';legacySession=Q.sanitize({...Q.session(id,undefined,'doing'),phase:active?'active':'pick',startedIds:active?old.ids:[],questIds:active?[]:old.ids},board,id);}}catch{}}
  const fresh=legacyClear||legacySession||Q.session(id,undefined,scope);if(asClear){fresh.phase=legacyClear?.phase||'clear-choose';if(!legacyClear)fresh.steps=Q.standardSelection(board,id);}set(fresh);
 }else if(!asClear&&scope==='room'&&['clear-choose','clear-active'].includes(session.phase)){
  const clearKey=storageKey(id,true,'room');try{if(!storage().getItem(clearKey))storage().setItem(clearKey,JSON.stringify({version:2,session:{...session},personal:[...personal]}));}catch(e){api.notice('Could not preserve the unfinished preparation routine: '+e.message);return;}set({phase:'pick'});
 }else api.render();
 const recovery=!!session&&(['active','clear-active'].includes(session.phase)&&!!(session.startedIds?.length||session.clearQuests?.length)||session.questIds?.length>0);
 if(recovery){const where=scope==='doing'?'Doing Now across all rooms':board.rooms.find(r=>r.id===id)?.name||'this room';modal('Previous Focus found',`<p>You have an unfinished or saved Focus session for ${esc(where)}.</p><p><strong>Start new Focus replaces this saved Focus selection and progress.</strong> Task completions, room tasks and history remain untouched.</p><div class="quest-actions">${btn('Resume Focus','quest-fresh-load','','quest-yes')}${btn('Start new Focus','quest-fresh-overwrite','','quest-no')}</div>`);}
 // New Focus sessions go straight to the room entry choice or Quest picker.
}
function all(board){return Q.routines(board,room,personal);}
function currentRoutine(board){return all(board).find(r=>r.id===(chosenRoutine||session?.routineId))||Q.standard(room);}
function layout(body,mode){
 const active=mode==='clear-active'||mode==='active',title=mode==='routine-editor'?'Clear the Way routine':clearMode?'Clear the Way':active?'My Focus Quests':'Choose Focus Quests';
 if(mode==='routine-editor'){
  const nav=`<nav class="quest-corners quest-editor-header" aria-label="Routine editor controls">${btn('Exit','quest-editor-exit','','quest-no')}<input class="quest-editor-title" id="quest-routine-name" maxlength="60" value="${esc(editing?.name||'')}" placeholder="Tap To Rename" aria-label="Routine name">${btn('Save','quest-save-options','','quest-yes')}</nav>`;
  return `<div class="quest-focus">${nav}${body}</div>`;
 }
 if(!clearMode&&['pick','plan'].includes(mode)){
  const reload=previousFocusAvailable?btn('Reload','quest-reload','','quest-no'):'<span class="quest-header-gap" aria-hidden="true"></span>';
  const nav=`<nav class="quest-picker-header" aria-label="Focus selection controls">${btn('Not now','quest-exit','','quest-no')}${btn('Plan for me','quest-plan','','quest-no')}<strong class="quest-title">Add Quests</strong>${reload}${btn('Let’s go','quest-go','','quest-yes')}</nav>`;
  const bottom=`<div class="quest-picker-bottom">${btn('Not now','quest-exit','','quest-no')}${btn('Plan for me','quest-plan','','quest-no')}${previousFocusAvailable?btn('Reload','quest-reload','','quest-no'):''}${btn('Let’s go','quest-go','','quest-yes')}</div>`;
  const where=scope==='doing'?'Doing Now · all rooms':esc(api.board().rooms.find(x=>x.id===room)?.name||room);
  return `<div class="quest-focus">${nav}<p class="quest-room">${where}</p>${body}${bottom}</div>`;
 }
 const left=btn(mode==='active'||mode==='clear-active'||mode==='clear-choose'?'Exit':'Not now','quest-exit','','quest-no');
 const right=mode==='clear-choose'?`<div class="quest-corner-actions">${btn('+','quest-new-routine','','quest-no','aria-label="Add custom routine" title="Add custom routine"')}${btn('Load','quest-load-routine','','quest-no')}</div>`:clearMode&&mode==='clear-active'?btn('All Clear','quest-clear-all','','quest-yes quest-clear-all-top'):!clearMode&&mode==='active'?btn('+ Add Quests','quest-add-more','','quest-yes'):'';
 const nav=`<nav class="quest-corners" aria-label="${clearMode?'Clear the Way':'Focus'} controls">${left}<strong class="quest-title">${title}</strong>${right}</nav>`;
 const subtitle=scope==='doing'&&!clearMode?'Doing Now · all rooms':esc(api.board().rooms.find(x=>x.id===room)?.name||room);
 return `<div class="quest-focus">${nav}<p class="quest-room">${subtitle}</p>${body}${mode==='active'?`<div class="quest-active-bottom">${btn('Exit Focus','quest-exit','','quest-no')}${btn('What I Need','quest-tools','','quest-no')}${btn('+ Add Quests','quest-add-more','','quest-yes')}</div>`:''}${mode==='clear-active'?`<div class="quest-clear-bottom">${btn('+','quest-add-clear','','quest-no','aria-label="Add steps"')}${btn('All Clear','quest-clear-all','','quest-yes')}</div>`:''}</div>`;
}
const stepRow=(s,i,selected,attr='data-quest-clear-pick')=>`<label class="quest-choice-row quest-alt-${i%4}"><input type="checkbox" ${attr}="${esc(s)}" ${selected?'checked':''}><span class="quest-line-title">${esc(s)}</span></label>`;
function clearChoose(board){
 const source=currentRoutine(board),selected=new Set(session.steps),sourceSteps=Q.cleanSteps(source.steps),defaultOnly=source.id==='standard:'+room?sourceSteps:Q.standardSteps.filter(s=>!sourceSteps.includes(s)),otherRoutines=all(board).filter(r=>r.id!==source.id),used=new Set([...Q.standardSteps,...sourceSteps]),otherSteps=[];
 for(const r of otherRoutines)for(const s of Q.cleanSteps(r.steps))if(!used.has(s)){used.add(s);otherSteps.push(s);}
 const defaultsSelected=defaultOnly.filter(s=>selected.has(s)).length,allDefaults=defaultOnly.length>0&&defaultsSelected===defaultOnly.length;
 const defaults=`<details class="quest-category" ${source.id==='standard:'+room?'open':''}><summary>Default Clear the Way steps <small>${defaultOnly.length}</small></summary><div class="quest-category-actions">${btn(allDefaults?'None':'All','quest-toggle-clear-defaults','','quest-no')}</div><div class="quest-compact-list">${defaultOnly.map((s,i)=>stepRow(s,i,selected.has(s))).join('')||'<p class="quest-empty">Every default step already appears in this routine.</p>'}</div></details>`;
 const extras=`<details class="quest-category"><summary>Unique Quests from other routines <small>${otherSteps.length}</small></summary><div class="quest-compact-list">${otherSteps.map((s,i)=>stepRow(s,i,selected.has(s))).join('')||'<p class="quest-empty">No additional steps yet.</p>'}</div></details>`;
 const sourceRows=source.id==='standard:'+room?'':`<div class="quest-compact-list quest-routine-steps">${sourceSteps.map((s,i)=>stepRow(s,i,selected.has(s))).join('')}</div>`;
 const choices=`<div class="quest-source-row">${btn('Edit routine','quest-customise','','quest-no')}</div>`;
 const body=`<section class="quest-sheet quest-clear-setup">${choices}${sourceRows}${defaults}${extras}<div class="quest-clear-bottom">${btn('+','quest-add-clear','','quest-no','aria-label="Add steps"')}${btn('Start Clear the Way','quest-begin-clear','','quest-yes')}${btn('Skip Clear the Way','quest-skip','','quest-no')}</div></section>`;
 return layout(body,'clear-choose');
}
function clearActive(board){
 const state=Q.clearState(board,session),items=session.clearQuests.map((e,i)=>{const win=Q.clearWins(board,e)[0];return `<article class="quest-active-card quest-alt-${i%4} ${win?'quest-finished':''}"><strong class="quest-line-title">${esc(e.title)}</strong><span class="quest-row-action">${win?`<span class="quest-done-mark">✓ Cleared</span>${btn('Undo','quest-undo-clear',e.id,'quest-no')}`:btn('Cleared','quest-finish-clear',e.id,'quest-yes')}</span></article>`;}).join('');
 const body=`<section class="quest-sheet"><div class="quest-progress">${state.completed} of ${state.total}</div><div class="quest-active-list">${items||'<p class="quest-empty">No steps selected.</p>'}</div></section>`;return layout(body,'clear-active');
}
function returnSection(board){
 const returns=api.returnTasks?.()||[];if(!returns.length)return '';
 return `<section class="quest-sheet quest-return-section"><h3>Return &amp; sort collected items</h3><div class="quest-active-list">${returns.map((t,i)=>`<article class="quest-active-card quest-alt-${i%4}"><strong class="quest-line-title">${esc(t.title)}</strong>${btn('Done','quest-return-complete',t.id,'quest-yes')}</article>`).join('')}</div></section>`;
}
function taskLabel(t,board){const m=Q.estimate(t,board),due=t.nextDue||t.dueDate||'';return `${m} min${due?' · Due '+due:''}`;}
function choiceRow(t,i,selected,board,roomLabel=''){const searchText=(t.title+' '+(t.notes||'')+' '+(t.children||[]).map(c=>c.title).join(' ')+' '+roomLabel).toLowerCase(),show=!query||searchText.includes(query),meta=taskLabel(t,board);return `<label class="quest-choice-row quest-alt-${i%4}" data-quest-row="${esc(t.id)}" ${show?'':'hidden'} data-search-text="${esc(searchText)}"><input type="checkbox" data-quest-select="${esc(t.id)}" ${selected.has(t.id)?'checked':''}><span class="quest-line-title">${esc(t.title)}</span><span class="quest-inline-meta" title="Priority ${Number(t.priority)||3} · ${esc(meta)}">${esc(meta)}</span></label>`;}
const roomName=(board,id)=>board.rooms.find(r=>r.id===id)?.name||(id?'Other tasks':'No room');
function picking(board){
 const selected=new Set(session.questIds),metrics=Q.metrics(board,session.questIds),method=session.addMethod||'manual';let sections='',emptyText='No Quests in this section.';
 if(scope==='doing'){
  const groups=new Map();for(const t of Q.doingEligible(board,api.date())){const id=t.room||'';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(t);}
  sections=[...groups].map(([id,list])=>`<details class="quest-category" data-quest-section="room-${esc(id||'none')}" open><summary>${esc(roomName(board,id))} <small>${list.length}</small></summary><div class="quest-compact-list">${list.map((t,i)=>choiceRow(t,i,selected,board,roomName(board,id))).join('')}</div></details>`).join('');emptyText='No active Doing Now Quests across your rooms.';
 }else{
  const groups=Q.eligible(board,room,api.date()),defs=[['mine','My Quests','Your unscheduled room Quests'],['main','Main Quests','High-priority scheduled Quests'],['bonus','Bonus Quests','Standard-priority scheduled Quests'],['optional','Optional Quests','Lower-priority scheduled Quests'],['future','Future Quests','Not due yet'],['side','Side Quests','Your side-quest list']];
  const selectedGroups=questTab==='side'?defs.filter(x=>x[0]==='side'):defs.filter(x=>x[0]!=='side');
  sections=selectedGroups.map(([id,title])=>{const list=groups[id];return `<details class="quest-category" data-quest-section="${id}" ${opened.has(id)||query?'open':''}><summary>${title} <small>${list.length}</small></summary><div class="quest-compact-list">${list.map((t,i)=>choiceRow(t,i,selected,board)).join('')||'<p class="quest-empty">No Quests in this section.</p>'}</div></details>`;}).join('');
 }
 const defs=`<div class="quest-plan-actions" aria-label="Quest selection limits">${btn('Set Time','quest-pick-method','time',method==='time'?'quest-yes':'quest-no')}${btn('Set Amount','quest-pick-method','amount',method==='amount'?'quest-yes':'quest-no')}</div>`;
 const amount=method==='amount'?`<label class="quest-limit">Quest amount<select id="quest-count"><option value="" ${session.limitCount===null?'selected':''}>No limit</option>${Array.from({length:30},(_,i)=>i+1).map(n=>`<option value="${n}" ${session.limitCount===n?'selected':''}>${n}</option>`).join('')}</select></label>`:'';
 const time=method==='time'?`<label class="quest-limit">Quest time<select id="quest-time"><option value="" ${session.limitMinutes===null?'selected':''}>No limit</option>${[5,10,15,20,30,45,60,90,120,180,240].map(n=>`<option value="${n}" ${session.limitMinutes===n?'selected':''}>${n} minutes</option>`).join('')}</select></label>`:'';
 const tabs=scope==='doing'?'':`<div class="quest-plan-actions" role="tablist" aria-label="Quest type">${btn('Focus Quests','quest-tab','main',questTab==='main'?'quest-yes':'quest-no',`role="tab" aria-selected="${questTab==='main'}"`)}${btn('Side Quests','quest-tab','side',questTab==='side'?'quest-yes':'quest-no',`role="tab" aria-selected="${questTab==='side'}"`)}</div>`;
 const available=scope==='doing'?Q.doingEligible(board,api.date()):Object.values(Q.eligible(board,room,api.date())).flat().filter(t=>questTab==='side'?t.side:!t.side),noMatches=!!query&&!available.some(t=>(t.title+' '+(t.notes||'')+' '+(t.children||[]).map(c=>c.title).join(' ')+' '+(scope==='doing'?roomName(board,t.room):'')).toLowerCase().includes(query));
 const body=`<section class="quest-sheet quest-selection">${tabs}<div class="quest-plan-bar">${defs}<div class="quest-fields">${amount}${time}</div>${btn('+ Add a Quest','quest-add-task','','quest-no')}</div><div class="quest-search-wrap"><label class="quest-search-label" for="quest-search">Search</label><input type="search" id="quest-search" value="${esc(query)}" placeholder="Search Quests…" autocomplete="off"><button type="button" class="quest-search-clear" data-action="quest-clear-search" aria-label="Clear search">×</button>${btn('🎙','quest-search-voice','','quest-search-mic','aria-label="Search by voice"')}</div><p class="quest-counter">${metrics.count} selected · ${metrics.minutes} min</p><div id="quest-categories">${sections||`<p class="quest-empty">${emptyText}</p>`}</div><p id="quest-search-empty" class="quest-empty" ${noMatches?'':'hidden'}>No matching Quests.</p></section>`;
 return layout(body,session.phase);
}
function canUseTask(board,t){return !!t&&(!scope||scope==='doing'||t.room===room);}
function readyToAdd(board){return session.startedIds.every(id=>{const t=board.tasks.find(x=>x.id===id);return !t||t.done;});}
function finishRoomSection(board){
 const selected=session.startedIds.map(id=>board.tasks.find(t=>t.id===id)).filter(Boolean);
 if(!selected.length||selected.some(t=>!t.done))return '';
 const floors=board.tasks.filter(t=>t.room===room&&!t.done&&!t.side&&!t.archived&&/\b(hoover|vacuum|mop|sweep|floor|stairs)\b/i.test(t.title));
 return `<section class="quest-sheet quest-finish-room"><h3>Finish the Room? · optional</h3>${returnSection(board)}<h4>Floors</h4><div class="tidy-utility-scroll">${floors.map(t=>`<div class="quest-active-card"><strong>${esc(t.title)}</strong><div class="quest-row-action">${t.littleOften?btn('I did a thing!','quest-floor-done',t.id,'quest-yes'):btn('Open in room','quest-floor-open',t.room,'quest-no')}</div></div>`).join('')||'<p class="quest-empty">No floor Quests are waiting.</p>'}</div><div class="quest-actions">${btn('Finish for now','quest-exit','','quest-no')}${btn('+ Add Quests','quest-add-more','','quest-yes')}</div></section>`;
}
function active(board){const ordered=session.startedIds.map(id=>board.tasks.find(t=>t.id===id)).filter(t=>canUseTask(board,t));const open=ordered.filter(t=>!t.done),done=ordered.filter(t=>t.done),render=(rows,completed)=>rows.map((t,i)=>api.renderFocusTask?api.renderFocusTask(t,i,completed):activeRow(t,i)).join('');let body='';
 if(scope==='doing'){
  const roomGroups=rows=>{const map=new Map();rows.forEach(t=>{const id=t.room||'';if(!map.has(id))map.set(id,[]);map.get(id).push(t);});return [...map].map(([id,list])=>`<details class="quest-category" open><summary>${esc(roomName(board,id))} <small>${list.length}</small></summary>${render(list,list.every(t=>t.done))}</details>`).join('');};
  body=`${roomGroups(open)}${done.length?`<details class="quest-category quest-completed-section" open><summary>Completed <small>${done.length}</small></summary>${roomGroups(done)}</details>`:''}`;
 }else body=`${render(open,false)}${done.length?`<details class="quest-category quest-completed-section" open><summary>Completed <small>${done.length}</small></summary>${render(done,true)}</details>`:''}`;
 return layout(`<section class="quest-sheet quest-focused-list"><div class="quest-active-list">${body||'<p class="quest-empty">No Quests selected.</p>'}</div></section>${session.startedIds.length&&session.startedIds.every(id=>board.tasks.find(t=>t.id===id)?.done)?finishRoomSection(board):returnSection(board)}`,'active');
}
function activeRow(t,i){return `<article class="quest-active-card quest-alt-${i%4}"><strong>${esc(t.title)}</strong></article>`;}
function editorPage(board){
 const source=editing.sourceId?all(board).find(r=>r.id===editing.sourceId)||Q.standard(room):null,defaults=new Set(Q.standardSteps),defaultRows=Q.standardSteps.map((s,i)=>stepRow(s,i,editing.selectedDefaults.includes(s),'data-routine-default')).join('');
 const used=new Set([...defaults,...(source?.steps||[])]),other=[];for(const r of all(board))if(r.id!==(source?.id||''))for(const s of r.steps)if(!used.has(s)){used.add(s);other.push(s);}
 const extras=other.map((s,i)=>stepRow(s,i,editing.extraSteps.includes(s),'data-routine-extra')).join('');
 const scopeChoice=!source?`<label class="quest-source">Who can use this routine?<select id="quest-routine-scope"><option value="personal" ${editing.scope==='personal'?'selected':''}>Only me</option><option value="shared" ${editing.scope==='shared'?'selected':''}>Everyone in this household</option></select></label>`:'';
 const body=`<section class="quest-sheet quest-routine-editor">${scopeChoice}<details class="quest-category" open><summary>Default Clear the Way steps <small>${Q.standardSteps.length}</small></summary><div class="quest-compact-list">${defaultRows}</div></details><details class="quest-category"><summary>Unique steps from saved routines <small>${other.length}</small></summary><div class="quest-compact-list">${extras||'<p class="quest-empty">No additional routine steps.</p>'}</div></details><label class="field">My custom steps<textarea id="quest-routine-custom" rows="5" maxlength="6000" placeholder="Add one step per line">${esc(editing.customLines.join('\n'))}</textarea></label><div class="quest-routine-bottom">${btn('Exit','quest-editor-exit','','quest-no')}${btn('Save','quest-save-options','','quest-yes')}</div></section>`;
 return layout(body,'routine-editor');
}
function content(board){if(!session)return '<p class="quest-empty">Choose a room to start Focus Mode.</p>';if(editing)return editorPage(board);switch(session.phase){case 'clear-choose':return clearChoose(board);case 'clear-active':return clearActive(board);case 'pick':case 'plan':return picking(board);case 'active':return active(board);case 'clear-finished':return layout(`<section class="quest-sheet"><h3>Clear the Way finished</h3><div class="quest-actions">${btn("let's get Tidy-ish",'quest-praise-next','','quest-yes')}${btn('Review Clear the Way','quest-review-clear','','quest-no')}</div></section>`,'clear-finished');default:return '<p>Focus session unavailable.</p>';}}
function modal(title,body){api.dialog(title,body);}
function praisePopup(skipped){const i=(session.praiseIndex+1)%Q.praise.length;if(!set({phase:'clear-finished',clearSkipped:!!skipped,praiseIndex:i}))return;modal(skipped?'Clear the Way paused':'Clear the Way complete',`<p class="quest-praise">${esc(Q.praise[i])}</p><div class="quest-actions">${btn("let's get Tidy-ish",'quest-praise-next','','quest-yes')}</div>`);}
function startPrompt(){const board=api.board(),ids=session.questIds.filter(id=>{const t=board.tasks.find(x=>x.id===id);return canUseTask(board,t)&&!t.done&&!t.archived&&(!t.paused||t.pauseUntil&&t.pauseUntil<=api.date())&&(scope!=='doing'||t.doing);});if(!ids.length){api.notice('Choose at least one available Quest.');return;}const m=Q.metrics(board,ids);modal('Start Quest?',`<p><strong>${m.count} Quests</strong> · ${m.minutes} estimated minutes</p><div class="quest-actions">${btn('Re-pick','quest-repick','','quest-no')}${btn('Quest Accepted','quest-accepted','','quest-yes')}</div>`);}
function beginClear(){if(!session.steps.length){api.notice('Choose a Clear the Way step, or press Skip Clear the Way.');return;}const src=currentRoutine(api.board()),selected=session.steps.slice();let nextRoutine=src,nextPersonal=personal;if(JSON.stringify(Q.cleanSteps(src.steps))!==JSON.stringify(selected)){const same=personal.find(p=>p.room===room&&p.owner===user()&&p.baseRoutineId===src.id&&JSON.stringify(p.steps)===JSON.stringify(selected));if(same)nextRoutine=same;else{nextRoutine=Q.personalVariation(src,selected,user(),api.makeId);nextPersonal=[...personal,nextRoutine];}}const clearQuests=selected.map(title=>({id:api.makeId(),title,followup:String(src.followups?.[title]||'')}));if(set({phase:'clear-active',routineId:nextRoutine.id,steps:selected,clearQuests},nextPersonal))api.notice('Clear the Way is ready.');}
function saveRoutine(start){
 const form=document.querySelector('.quest-routine-editor')||api.editor(),name=String(document.querySelector('#quest-routine-name')?.value||'').trim(),custom=String(form.querySelector('#quest-routine-custom')?.value||'').split('\n').map(s=>s.trim()).filter(Boolean),defaults=[...form.querySelectorAll('[data-routine-default]:checked')].map(x=>x.getAttribute('data-routine-default')),extras=[...form.querySelectorAll('[data-routine-extra]:checked')].map(x=>x.getAttribute('data-routine-extra')),steps=Q.cleanSteps([...defaults,...extras,...custom]);
 if(!name||name.length>60)throw Error('Give this routine a name of up to 60 characters.');if(!steps.length)throw Error('Choose at least one step.');if(steps.length>40)throw Error('A routine can contain up to 40 steps.');
 const source=editing.sourceId?all(api.board()).find(r=>r.id===editing.sourceId)||Q.standard(room):null,selectedScope=source?(source.scope==='personal'?'personal':'personal'):String(form.querySelector('#quest-routine-scope')?.value||'personal');let routine,nextPersonal=personal;
 if(selectedScope==='shared'&&!source){routine={id:api.makeId(),room,name,scope:'shared',steps,followups:{}};if(!api.addShared(routine))throw Error('The shared routine could not be saved.');}
 else if(source?.scope==='personal'){routine={...source,name,steps,scope:'personal',owner:user()};nextPersonal=personal.map(p=>p.id===source.id?routine:p);}
 else if(source){routine=Q.personalVariation(source,steps,user(),api.makeId,name);nextPersonal=[...personal,routine];}
 else{routine={id:api.makeId(),room,name,scope:'personal',owner:user(),baseRoutineId:'',steps,followups:{}};nextPersonal=[...personal,routine];}
 editing=null;chosenRoutine=routine.id;const saved=set({phase:'clear-choose',routineId:routine.id,routineSourceId:source?.id||routine.id,steps:steps.slice()},nextPersonal);if(saved&&start)beginClear();else if(saved)api.notice('Routine saved for later.');
}
function handle(el){if(!api||!el?.dataset?.action?.startsWith('quest-'))return false;const action=el.dataset.action,id=el.dataset.id,board=api.board();if(!session&&action!=='quest-exit')return true;
 switch(action){
 case 'quest-exit':editing=null;api.leave();break;
 case 'quest-fresh-load':api.closeDialog(true);api.render();break;
 case 'quest-fresh-overwrite':{const fresh=Q.session(room,undefined,scope);if(clearMode){fresh.phase='clear-choose';fresh.steps=Q.standardSelection(board,room);}api.closeDialog(true);set(fresh);break;}
 case 'quest-intro-close':api.closeDialog(true);break;
 case 'quest-editor-exit':editing=null;api.render();break;
 case 'quest-reload':load(board,api.room(),true,clearMode,scope);api.render();break;
 case 'quest-load-routine':modal('Load Clear the Way',`<label class="quest-source">Saved routine<select id="quest-routine-load">${all(board).map(o=>`<option value="${esc(o.id)}" ${o.id===currentRoutine(board).id?'selected':''}>${esc(o.name)}${o.scope==='personal'?' · personal':''}</option>`).join('')}</select></label><div class="quest-actions">${btn('Cancel','quest-close','','quest-no')}${btn('Load','quest-use-routine','','quest-yes')}</div>`);break;
 case 'quest-use-routine':{const r=all(board).find(x=>x.id===api.editor().querySelector('#quest-routine-load')?.value);if(r){chosenRoutine=r.id;api.closeDialog(true);set({routineId:r.id,routineSourceId:r.id,steps:r.id==='standard:'+room?Q.standardSelection(board,room):r.steps.slice()});}break;}
 case 'quest-toggle-clear-defaults':{const source=currentRoutine(board),sourceSteps=Q.cleanSteps(source.steps),defaults=source.id==='standard:'+room?sourceSteps:Q.standardSteps.filter(s=>!sourceSteps.includes(s)),selected=new Set(session.steps),allSelected=defaults.length>0&&defaults.every(s=>selected.has(s));set({steps:allSelected?session.steps.filter(s=>!defaults.includes(s)):Q.cleanSteps([...session.steps,...defaults])});break;}
 case 'quest-standard':chosenRoutine=Q.standard(room).id;set({routineId:chosenRoutine,routineSourceId:chosenRoutine,steps:Q.standardSelection(board,room)});break;
 case 'quest-new-routine':editing={sourceId:'',name:'',scope:'personal',selectedDefaults:[],extraSteps:[],customLines:[]};api.render();break;
 case 'quest-customise':{const source=currentRoutine(board),defaults=new Set(Q.standardSteps);editing={sourceId:source.id,name:source.name,scope:'personal',selectedDefaults:session.steps.filter(s=>defaults.has(s)),extraSteps:session.steps.filter(s=>!defaults.has(s)),customLines:source.steps.filter(s=>!defaults.has(s))};api.render();break;}
 case 'quest-save-options':modal('Save routine',`<div class="quest-actions">${btn('Save for later','quest-save-routine','','quest-no')}${btn('Save and start','quest-save-start','','quest-yes')}</div>`);break;
 case 'quest-save-routine':api.closeDialog(true);try{saveRoutine(false);}catch(e){api.notice(e.message);}break;
 case 'quest-save-start':api.closeDialog(true);try{saveRoutine(true);}catch(e){api.notice(e.message);}break;
 case 'quest-add-clear':modal('Add Clear the Way steps',`<label class="field">One step per line<textarea id="quest-new-title" rows="4" maxlength="6000" placeholder="Add one step per line"></textarea></label><div class="quest-actions">${btn('Add steps','quest-save-clear','','quest-yes')}${btn('Cancel','quest-close','','quest-no')}</div>`);break;
 case 'quest-save-clear':{const lines=Q.cleanSteps(String(api.editor().querySelector('#quest-new-title')?.value||'').split('\n')),next=Q.cleanSteps([...session.steps,...lines]);if(!lines.length){api.notice('Enter one or more steps.');break;}if(next.length>40){api.notice('Clear the Way is limited to 40 steps.');break;}api.closeDialog(true);if(session.phase==='clear-active'){const known=new Set(session.clearQuests.map(x=>x.title)),additions=lines.filter(title=>!known.has(title)).map(title=>{known.add(title);return {id:api.makeId(),title,followup:''};});set({steps:next,clearQuests:[...session.clearQuests,...additions].slice(0,40)});}else set({steps:next});break;}
 case 'quest-begin-clear':if(session.phase==='clear-choose')beginClear();break;
 case 'quest-skip':if(clearMode&&['clear-choose','clear-active'].includes(session.phase))praisePopup(true);break;
 case 'quest-clear-all':{const state=Q.clearState(board,session);if(state.total&&state.completed===state.total)praisePopup(false);else modal('All Clear?',`<p>${state.remaining.length} steps remain. You can skip them and move on to Focus.</p><div class="quest-actions">${btn('Keep clearing','quest-close','','quest-no')}${btn('All Clear','quest-skip','','quest-yes')}</div>`);break;}
 case 'quest-clear-done':if(session.phase==='clear-active'&&Q.clearState(board,session).remaining.length===0)praisePopup(false);break;
 case 'quest-undo-clear':{if(session.phase==='clear-active'){const entry=session.clearQuests.find(x=>x.id===id);if(entry&&api.undoClear(entry))api.render();}break;}
 case 'quest-finish-clear':{if(session.phase!=='clear-active')break;const entry=session.clearQuests.find(x=>x.id===id);if(entry&&api.completeClear(entry)){const state=Q.clearState(api.board(),session);if(state.total&&state.completed===state.total)praisePopup(false);else api.render();}break;}
 case 'quest-praise-next':api.closeDialog(true);api.openFocus();break;
 case 'quest-review-clear':set({phase:'clear-choose',clearQuests:[],steps:[],clearSkipped:false});break;
 case 'quest-plan':{const result=Q.recommend(board,room,api.date(),{count:session.addMethod==='amount'?session.limitCount:null,minutes:session.addMethod==='time'?session.limitMinutes:null,scope,tab:questTab});if(!result.length){api.notice('No available Quests fit. Increase the limit or select Quests.');break;}set({phase:'plan',questIds:result});break;}
 case 'quest-manual':set({phase:'pick',addMethod:'manual'});break;
 case 'quest-go':if(['pick','plan'].includes(session.phase))startPrompt();break;
 case 'quest-repick':api.closeDialog(true);set({phase:'pick'});break;
 case 'quest-accepted':{const actual=session.questIds.filter(x=>{const t=board.tasks.find(y=>y.id===x);return canUseTask(board,t)&&!t.done&&!t.archived&&(!t.paused||t.pauseUntil&&t.pauseUntil<=api.date())&&(scope!=='doing'||t.doing);});api.closeDialog(true);set({phase:'active',startedIds:Q.uniqueIds([...session.startedIds,...actual]),questIds:[]});break;}
 case 'quest-floor-done':api.completeFloor?.(id);api.render();break;
 case 'quest-floor-open':api.openFloorRoom?.(id);break;
 case 'quest-tools':api.showTools?.(session.phase==='active'?session.startedIds:session.questIds);break;
 case 'quest-return-complete':if(session.phase==='active'){api.completeReturn?.(id);api.render();}break;
 case 'quest-remove-focus':if(session.phase==='active')set({startedIds:session.startedIds.filter(x=>x!==id)});break;
 case 'quest-move-focus':if(session.phase==='active')moveFocus(id,Number(el.dataset.direction)||0);break;
 case 'quest-add-more':set({phase:'pick',addMethod:'manual',questIds:[],limitMinutes:null,limitCount:null});break;
 case 'quest-pick-method':{const method=['amount','time','manual'].includes(id)?id:'manual';set({phase:'pick',addMethod:method,questIds:[],limitCount:method==='amount'?session.limitCount:null,limitMinutes:method==='time'?(session.limitMinutes||15):null});break;}
 case 'quest-tab':questTab=id==='side'?'side':'main';set({questTab});break;
 case 'quest-add-task':api.addTask?.();break;
 case 'quest-edit-task':api.editTask?.(id);break;
 case 'quest-child-edit':api.editChild?.(id,el.dataset.child);break;
 case 'quest-open-timer':api.openTimer?.(id);break;
 case 'quest-child-timer':api.openTimer?.(id,el.dataset.child);break;
 case 'quest-complete':api.complete(id);break;
 case 'quest-child-done':api.completeChild(id,el.dataset.child);break;
 case 'quest-over-add':{const taskId=pending;pending='';api.closeDialog(true);if(set({questIds:Q.uniqueIds([...session.questIds,taskId])}))startPrompt();break;}
 case 'quest-over-leave':pending='';api.closeDialog(true);api.render();break;
 case 'quest-clear-search':query='';api.render();break;
 case 'quest-search-voice':{const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){api.notice('Voice search is not available in this browser.');break;}const recognition=new Speech();recognition.lang=document.documentElement.lang||'en-GB';recognition.onresult=e=>{query=String(e.results?.[0]?.[0]?.transcript||'').trim().toLowerCase();api.render();document.querySelector('#quest-search')?.focus();};recognition.onerror=()=>api.notice('Voice search could not hear a Quest.');recognition.start();break;}
 case 'quest-close':api.closeDialog(true);break;
 default:return false;
 }return true;}
function moveFocus(id,direction){if(!session||session.phase!=='active'||![-1,1].includes(direction))return false;const board=api.board(),at=session.startedIds.indexOf(id);if(at<0)return false;const task=board.tasks.find(t=>t.id===id);let next=at+direction;while(next>=0&&next<session.startedIds.length){const other=board.tasks.find(t=>t.id===session.startedIds[next]);if(other&&!!other.done===!!task?.done)break;next+=direction;}if(next<0||next>=session.startedIds.length)return false;const ids=session.startedIds.slice();[ids[at],ids[next]]=[ids[next],ids[at]];return set({startedIds:ids});}
function reorderFocus(fromId,toId,after=false){if(!session||session.phase!=='active'||fromId===toId)return false;const board=api.board(),from=board.tasks.find(t=>t.id===fromId),to=board.tasks.find(t=>t.id===toId);if(!from||!to||!!from.done!==!!to.done)return false;const ids=session.startedIds.filter(id=>id!==fromId),target=ids.indexOf(toId);if(target<0)return false;ids.splice(target+(after?1:0),0,fromId);return set({startedIds:ids});}
function change(event){if(!api||!session)return false;const t=event.target;
 if(t.id==='quest-routine'&&session.phase==='clear-choose'){const r=all(api.board()).find(x=>x.id===t.value);if(r){chosenRoutine=r.id;set({routineId:r.id,routineSourceId:r.id,steps:r.id==='standard:'+room?Q.standardSelection(api.board(),room):r.steps.slice()});}return true;}
 if(t.dataset?.questClearPick&&session.phase==='clear-choose'){const s=t.dataset.questClearPick;set({steps:t.checked?Q.cleanSteps([...session.steps,s]):session.steps.filter(x=>x!==s)});return true;}
 if(t.dataset?.routineDefault&&editing){const s=t.dataset.routineDefault,next=editing.selectedDefaults.includes(s)?editing.selectedDefaults.filter(x=>x!==s):[...editing.selectedDefaults,s];editing.selectedDefaults=next;return true;}
 if(t.dataset?.routineExtra&&editing){const s=t.dataset.routineExtra,next=editing.extraSteps.includes(s)?editing.extraSteps.filter(x=>x!==s):[...editing.extraSteps,s];editing.extraSteps=next;return true;}
 if(t.id==='quest-routine-scope'&&editing){editing.scope=t.value==='shared'?'shared':'personal';return true;}
 if(t.id==='quest-time'||t.id==='quest-count'){const n=t.value?Number(t.value):null;set(t.id==='quest-time'?{limitMinutes:n}:{limitCount:n});return true;}
 if(t.dataset?.questSelect&&['pick','plan'].includes(session.phase)){const valid=scope==='doing'?Q.doingEligible(api.board(),api.date()):Object.values(Q.eligible(api.board(),room,api.date())).flat(),allowed=valid.some(x=>x.id===t.dataset.questSelect);if(!allowed)return true;const selected=session.questIds.includes(t.dataset.questSelect),next=selected?session.questIds.filter(x=>x!==t.dataset.questSelect):Q.uniqueIds([...session.questIds,t.dataset.questSelect]);if(!selected&&session.limitCount!==null&&next.length>session.limitCount){api.notice('Your Quest count limit is reached. Increase it to choose more.');api.render();return true;}if(!selected&&session.limitMinutes!==null){const m=Q.metrics(api.board(),next);if(m.minutes>session.limitMinutes||m.unknown){pending=t.dataset.questSelect;modal('Quest Time Exceeded',`<p>This Quest takes the selected list over your ${session.limitMinutes}-minute limit.</p><div class="quest-actions">${btn('Leave It','quest-over-leave','','quest-no')}${btn('Add to Quest','quest-over-add','','quest-yes')}</div>`);return true;}}set({questIds:next});return true;}
 return false;}
function input(event){if(!api||!session||event.target.id!=='quest-search')return false;query=String(event.target.value||'').toLowerCase().trim();const body=document.querySelector('#quest-categories');if(!body)return true;let count=0;body.querySelectorAll('[data-quest-row]').forEach(row=>{const show=!query||row.dataset.searchText.includes(query);row.hidden=!show;if(show)count++;});body.querySelectorAll('details[data-quest-section]').forEach(details=>{if(query)details.open=true;else details.open=opened.has(details.dataset.questSection);});const message=document.querySelector('#quest-search-empty');if(message)message.hidden=!!count||!query;return true;}
function sectionToggle(event){const el=event.target;if(!el?.dataset?.questSection||!document.contains(el))return false;if(!query){if(el.open)opened.add(el.dataset.questSection);else opened.delete(el.dataset.questSection);}return true;}
function pick(id){if(!session||!api)return false;const t=api.board().tasks.find(t=>t.id===id);if(!t||t.done||t.archived||(scope==='room'&&t.room!==room)||(scope==='doing'&&!t.doing))return false;return set({phase:'pick',questIds:Q.uniqueIds([...session.questIds,id]),addMethod:'manual'});}
function init(callbacks){api=callbacks;}
return Object.freeze({init,pick,enter,load,content,handle,change,input,sectionToggle,moveFocus,reorderFocus,get:()=>session,hasPreviousFocus:()=>previousFocusAvailable});
});
