/* Tidy-ish Quest Focus v2. Isolated from Doing Now. */
(function(root,factory){const api=factory(root.TidyQuestFocus);if(typeof module==='object'&&module.exports)module.exports=api;else root.TidyQuestUI=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Q){'use strict';
if(!Q)throw Error('Quest Focus selector module is missing.');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,id='',cls='')=>`<button type="button" class="quest-btn ${cls}" data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
let api=null,room='',session=null,personal=[],last='',key='',error='',pending='',query='',chosenRoutine='',opened=new Set(['mine','important','waiting','later']);
const storage=()=>api.storage||window.localStorage;
const user=()=>String(api.memberId?.()||'browser-local');
function load(board,id,force=false){const target='tidyish-html-v023-quest-focus-v2:'+encodeURIComponent(user())+':'+encodeURIComponent(id);if(!force&&room===id&&key===target&&session)return;
 room=id;key=target;session=null;personal=[];error='';query='';chosenRoutine='';opened=new Set(['mine','important','waiting','later']);last='';
 try{last=storage().getItem(key)||'';if(last){const saved=JSON.parse(last);session=Q.sanitize(saved.session,board,id);personal=Array.isArray(saved.personal)?saved.personal.filter(r=>r.scope==='personal'&&r.owner===user()&&r.room===id):[];}}
 catch{error='Your personal Focus session cannot be opened. No saved board was overwritten.';}
}
function persist(next,nextPersonal=personal){if(error)throw Error(error);if((storage().getItem(key)||'')!==last)throw Error('Another tab changed Focus. Reload before saving to protect the session.');const value=JSON.stringify({version:2,session:next,personal:nextPersonal});storage().setItem(key,value);last=value;session=next;personal=nextPersonal;}
function set(patch,others=personal){try{persist({...session,...patch},others);api.render();return true;}catch(e){api.notice(e.message);return false;}}
function enter(board,id){if(!api)throw Error('Quest Focus not initialised.');load(board,id);if(!session){const fresh=Q.session(id);set(fresh);}else api.render();}
function all(board){return Q.routines(board,room,personal);}
function currentRoutine(board){return all(board).find(r=>r.id===(chosenRoutine||session?.routineId))||Q.standard(room);}
function layout(body,mode){const prepared=mode==='clear-choose'||mode==='clear-active',active=mode==='clear-active'||mode==='active';
 const left=btn('Not now','quest-exit','','quest-no'),right=mode==='active'?'':btn(prepared?(active?'Skip Clear the Way':'Let’s go'):'Let’s go',prepared?(active?'quest-skip':'quest-begin-clear'):'quest-go','','quest-yes');
 const corners=`<nav class="quest-corners" aria-label="Focus controls">${left}${right}</nav>`;
 const r=api.board().rooms.find(x=>x.id===room);
 return `<div class="quest-focus">${corners}<h2 class="quest-title">${prepared?'Clear the Way':active?'My Focus Quests':'I Need a Plan'}</h2><p class="quest-room">${esc(r?.name||room)} · ${prepared?'Preparation Quests':'Focus Mode'}</p>${body}<h2 class="quest-footer-title">Let’s Get It Done</h2>${corners}<div class="quest-reload">${btn('Reload this room’s last Focus','quest-reload','','quest-no')}</div></div>`;
}
const stepRow=(s,i,selected)=>`<label class="quest-choice-row quest-alt-${i%4}"><input type="checkbox" data-quest-clear-pick="${esc(s)}" ${selected?'checked':''}><span class="quest-line-title">${esc(s)}</span></label>`;
function clearChoose(board){const source=currentRoutine(board);const selected=new Set(session.steps);const sourceSteps=Q.cleanSteps(source.steps);const extras=session.steps.filter(s=>!sourceSteps.includes(s));const options=all(board);
 const body=`<section class="quest-sheet quest-clear-setup"><h3>Choose Your Clear the Way Quests</h3><p class="quest-help">Pick the preparation Quests you need before choosing the main Quests. Your saved custom routines and in-progress Quests are not replaced automatically.</p><div class="quest-actions">${btn('Use Updated Standard (6 steps)','quest-standard','','quest-yes')}${btn('Customise','quest-customise','','quest-no')}${btn('Add Task','quest-add-clear','','quest-no')}</div><label class="quest-source">Clear the Way routine<select id="quest-routine">${options.map(o=>`<option value="${esc(o.id)}" ${o.id===source.id?'selected':''}>${esc(o.name)}${o.scope==='personal'?' (personal)':''}</option>`).join('')}</select></label><div class="quest-clear-picks" id="quest-clear-picks">${(sourceSteps.length?sourceSteps:Q.standard(room).steps).map((s,i)=>stepRow(s,i,selected.has(s))).join('')}${extras.map((s,i)=>stepRow(s,i+sourceSteps.length,true)).join('')}</div><p class="quest-counter">${session.steps.length} preparation Quests selected</p><div class="quest-actions">${btn('Start Clear the Way','quest-begin-clear','','quest-yes')}${btn('Skip Clear the Way','quest-skip','','quest-no')}</div></section>`;
 return layout(body,'clear-choose');}
function clearActive(board){const state=Q.clearState(board,session);
 const items=session.clearQuests.map((e,i)=>{const win=Q.clearWins(board,e)[0];return `<article class="quest-active-card quest-alt-${i%4} ${win?'quest-finished':''}"><div class="quest-active-title"><strong>${esc(e.title)}</strong>${win?'<span class="quest-done-mark">✓ Completed · 1 point</span>':''}</div>${win?btn('Undo','quest-undo-clear',e.id,'quest-no'):btn('✓ I did a thing!','quest-finish-clear',e.id,'quest-yes')}</article>`;}).join('');
 const body=`<section class="quest-sheet"><div class="quest-progress">Clear the Way <span>${state.completed} / ${state.total} · ${state.completed} points</span></div><div class="quest-active-list">${items}</div><p class="quest-help">Each finished Quest earns one recorded point. No Quests were added to Doing Now.</p><div class="quest-actions">${state.completed===state.total&&state.total?btn('Continue to Next Quests','quest-clear-done','','quest-yes'):''}${btn('Skip remaining','quest-skip','','quest-no')}</div></section>`;
 return layout(body,'clear-active');}
function choiceRow(t,i,selected){const show=!query||(t.title+' '+(t.notes||'')+' '+(t.children||[]).map(c=>c.title).join(' ')).toLowerCase().includes(query);const meta=[Q.estimate(t)?`${Q.estimate(t)} min`:'No estimate',t.nextDue&&`Due ${t.nextDue}`].filter(Boolean).join(' · ');
 return `<label class="quest-choice-row quest-alt-${i%4}" data-quest-row="${esc(t.id)}" ${show?'':'hidden'} data-search-text="${esc((t.title+' '+(t.notes||'')+' '+(t.children||[]).map(c=>c.title).join(' ')).toLowerCase())}"><input type="checkbox" data-quest-select="${esc(t.id)}" ${selected.has(t.id)?'checked':''}><span class="quest-line-title">${esc(t.title)}</span><span class="quest-inline-meta" title="Priority ${Number(t.priority)||3} · ${esc(meta)}">${esc(meta)}</span></label>`;}
function picking(board){const groups=Q.eligible(board,room,api.date()),selected=new Set(session.questIds),metrics=Q.metrics(board,session.questIds),method=session.addMethod||'manual';
 const defs=[['mine','My Questlist','Unscheduled personal Quests'],['important','Important Quests','Priority 1–2, due now'],['waiting','Due but Can Wait','Other scheduled Quests due now'],['later','Not Due Yet','Quests you can complete early']];
 const sections=defs.map(([id,title,hint])=>{const list=groups[id];return `<details class="quest-category" data-quest-section="${id}" ${opened.has(id)||query?'open':''}><summary>${title} <small>${list.length}</small></summary><span class="quest-category-hint">${hint}</span><div class="quest-compact-list">${list.map((t,i)=>choiceRow(t,i,selected)).join('')||'<p class="quest-empty">No Quests in this section.</p>'}</div></details>`;}).join('');
 const methodControls=`<div class="quest-plan-actions" aria-label="How to add Quests">${btn('Add by Amount','quest-pick-method','amount',method==='amount'?'quest-yes':'quest-no')}${btn('Add by Time','quest-pick-method','time',method==='time'?'quest-yes':'quest-no')}${btn('Pick Tasks','quest-pick-method','manual',method==='manual'?'quest-yes':'quest-no')}</div>`;
 const numberControl=method==='amount'?`<label class="quest-limit">How many Quests?<select id="quest-count">${Array.from({length:30},(_,i)=>i+1).map(n=>`<option value="${n}" ${session.limitCount===n?'selected':''}>${n} ${n===1?'Quest':'Quests'}</option>`).join('')}</select></label>`:'';
 const timeControl=method==='time'?`<label class="quest-limit">How much time?<select id="quest-time">${[5,10,15,20,30,45,60,90,120,180,240].map(n=>`<option value="${n}" ${session.limitMinutes===n?'selected':''}>${n} minutes</option>`).join('')}</select></label>`:'';
 const body=`<section class="quest-sheet quest-selection"><h3>Add Quests to your Focus</h3>${methodControls}<div class="quest-fields">${numberControl}${timeControl}</div>${method==='manual'?'<p class="quest-help">Choose your own Quests from the room lists below.</p>':'<p class="quest-help">Choose the amount or time, then Find Quests. Review the suggestions before starting.</p>'}<div class="quest-actions">${method!=='manual'?btn('Find Quests','quest-plan','','quest-yes'):''}${btn('Start Selected Quests','quest-go','','quest-yes')}</div><label class="quest-search-label" for="quest-search">Search Quests in this room</label><div class="quest-search-wrap"><input type="search" id="quest-search" value="${esc(query)}" placeholder="Find a Quest…" autocomplete="off"><button type="button" class="quest-search-clear" data-action="quest-clear-search" aria-label="Clear search">×</button></div><p class="quest-counter">${metrics.count} selected · ${metrics.minutes} estimated min${metrics.unknown?' · '+metrics.unknown+' without estimates':''}</p><div id="quest-categories">${sections}</div><p id="quest-search-empty" class="quest-empty" ${query&&!Object.values(groups).flat().some(t=>(t.title+' '+(t.notes||'')+' '+(t.children||[]).map(c=>c.title).join(' ')).toLowerCase().includes(query))?'':'hidden'}>No matching Quests in this room.</p></section>`;
 return layout(body,session.phase);}
function readyToAdd(board){return (session.clearSkipped||Q.clearState(board,session).remaining.length===0)&&session.startedIds.every(id=>board.tasks.find(t=>t.id===id&&t.room===room)?.done);}
function active(board){
 const state=Q.clearState(board,session),clearRows=session.clearQuests.map((entry,i)=>{
  const win=Q.clearWins(board,entry)[0],skipped=session.clearSkipped&&!win;
  return `<article class="quest-active-card quest-alt-${i%4} ${win?'quest-finished':''}"><div class="quest-compact-main"><strong>${esc(entry.title)}</strong>${win?btn('Undo','quest-undo-clear',entry.id,'quest-no'):skipped?'<span class="quest-done-mark">Skipped</span>':btn('✓ Done!','quest-finish-clear',entry.id,'quest-yes')}</div></article>`;
 }).join('');
 const clearSection=session.clearQuests.length?`<h3>Clear the Way <span class="quest-small-progress">${state.completed}/${state.total} done</span></h3><div class="quest-active-list">${clearRows}</div>`:'';
 const items=session.startedIds.map(id=>board.tasks.find(t=>t.id===id&&t.room===room)).filter(Boolean);
 const html=items.map((t,i)=>`<article class="quest-active-card quest-alt-${i%4} ${t.done?'quest-finished':''}"><div class="quest-compact-main"><strong>${esc(t.title)}</strong>${t.done?'<span class="quest-done-mark">✓ Done</span>':btn(t.children?.length?'✓ Done All':'✓ Done!','quest-complete',t.id,'quest-yes')}</div>${!t.done&&t.children?.length?`<div class="quest-children">${t.children.map(c=>`<div><span>${esc(c.title)}</span>${c.done?'✓':btn('Done it!','quest-child-done',t.id,'quest-no').replace('data-id="'+esc(t.id)+'"','data-id="'+esc(t.id)+'" data-child="'+esc(c.id)+'"')}</div>`).join('')}</div>`:''}</article>`).join('');
 const ready=readyToAdd(board);
 const chooser=ready?`<div class="quest-add-choices" aria-label="Choose how to add Quests"><h3>Add More Quests</h3><div class="quest-plan-actions">${btn('Add by Amount','quest-pick-method','amount','quest-yes')}${btn('Add by Time','quest-pick-method','time','quest-yes')}${btn('Pick Tasks','quest-pick-method','manual','quest-no')}</div></div>`:'<p class="quest-help">Finish your current Focus Quests before adding more. You can leave and come back later.</p>';
 return layout(`<section class="quest-sheet quest-focused-list">${clearSection}<h3>Focused Task List</h3><div class="quest-active-list">${html||'<p class="quest-empty">Your focused Quests will appear here once you add them.</p>'}</div>${chooser}</section>`,'active');
}
function content(board){if(!session)return '<p class="quest-empty">Choose a room to start Focus Mode.</p>';switch(session.phase){case 'clear-choose':return clearChoose(board);case 'clear-active':return clearActive(board);case 'pick':case 'plan':return picking(board);case 'active':return active(board);default:return '<p>Focus session unavailable.</p>';}}
function modal(title,body){api.dialog(title,body);}
function praisePopup(skipped){const i=(session.praiseIndex+1)%Q.praise.length;if(!set({phase:'active',clearSkipped:!!skipped,praiseIndex:i}))return;modal(skipped?'Clear the Way skipped':'Clear the Way complete',`<p class="quest-praise">${esc(Q.praise[i])}</p><p>Your focused list is ready. You can add more Quests after finishing your current ones.</p><div class="quest-actions">${btn('View My Focus','quest-praise-next','','quest-yes')}</div>`);}
function startPrompt(){const ids=session.questIds.filter(id=>api.board().tasks.some(t=>t.id===id&&t.room===room&&!t.done));if(!ids.length){api.notice('Choose at least one Quest.');return;}const m=Q.metrics(api.board(),ids);modal('Start Quest?',`<p><strong>${m.count} Quests</strong> · ${m.minutes} estimated minutes</p><p>This is your separate Focus session, not Doing Now.</p><div class="quest-actions">${btn('Re-pick','quest-repick','','quest-no')}${btn('Quest Accepted','quest-accepted','','quest-yes')}</div>`);}
function beginClear(){if(!session.steps.length){api.notice('Choose a Clear the Way Quest, or press Skip Clear the Way.');return;}
 const src=currentRoutine(api.board()),selected=session.steps.slice();let nextRoutine=src,nextPersonal=personal;
 if(JSON.stringify(Q.cleanSteps(src.steps))!==JSON.stringify(selected)){
  const same=personal.find(p=>p.room===room&&p.owner===user()&&p.baseRoutineId===src.id&&JSON.stringify(p.steps)===JSON.stringify(selected));
  if(same)nextRoutine=same;else{nextRoutine=Q.personalVariation(src,selected,user(),api.makeId);nextPersonal=[...personal,nextRoutine];}
 }
 const clearQuests=selected.map(title=>({id:api.makeId(),title,followup:String(src.followups?.[title]||'')}));
 if(set({phase:'clear-active',routineId:nextRoutine.id,steps:selected,clearQuests},nextPersonal))api.notice('Clear the Way Quests ready. Earn points as you complete them.');
}
function handle(el){if(!api||!el?.dataset?.action?.startsWith('quest-'))return false;const action=el.dataset.action,id=el.dataset.id;const board=api.board();if(!session&&action!=='quest-exit')return true;
 switch(action){
 case 'quest-exit':api.leave();break;
 case 'quest-reload':load(board,api.room(),true);api.render();break;
 case 'quest-standard':chosenRoutine=Q.standard(room).id;set({routineId:chosenRoutine,routineSourceId:chosenRoutine,steps:Q.standard(room).steps.slice()});break;
 case 'quest-customise':{const steps=Q.cleanSteps(session.steps);if(!steps.length){api.notice('Choose the Clear the Way Quests you want with the checkboxes, or use Add Task.');break;}api.notice('Tick the Quests you need; untick the rest. Changes are saved as your personal version when you start.');document.querySelector('#quest-clear-picks')?.scrollIntoView({block:'nearest'});break;}
 case 'quest-add-clear':modal('Add a Clear the Way Quest',`<label class="field">Quest name<input type="text" id="quest-new-title" maxlength="150" placeholder="What needs clearing?" required></label><div class="quest-actions">${btn('Add Task','quest-save-clear','','quest-yes')}${btn('Cancel','quest-close','','quest-no')}</div>`);break;
 case 'quest-save-clear':{const text=api.editor().querySelector('#quest-new-title')?.value?.trim();if(!text||text.length>150){api.notice('Enter a Quest name, up to 150 characters.');break;}if(session.steps.length>=40){api.notice('Clear the Way is limited to 40 Quests.');break;}api.closeDialog(true);set({steps:Q.cleanSteps([...session.steps,text])});break;}
 case 'quest-begin-clear':if(session.phase==='clear-choose')beginClear();break;
 case 'quest-skip':if(['clear-choose','clear-active'].includes(session.phase))praisePopup(true);break;
 case 'quest-clear-done':if(session.phase==='clear-active'&&Q.clearState(board,session).remaining.length===0)praisePopup(false);break;
 case 'quest-undo-clear':{if(['clear-active','active'].includes(session.phase)){const entry=session.clearQuests.find(x=>x.id===id);if(entry&&api.undoClear(entry))api.render();}break;}
 case 'quest-finish-clear':{if(!['clear-active','active'].includes(session.phase))break;const entry=session.clearQuests.find(x=>x.id===id);if(!entry)break;
  if(api.completeClear(entry)){const state=Q.clearState(api.board(),session);if(session.phase==='clear-active'&&state.total&&state.completed===state.total)praisePopup(false);else api.render();}break;}
 case 'quest-praise-next':api.closeDialog(true);api.render();break;
 case 'quest-plan':{const result=Q.recommend(board,room,api.date(),{count:session.addMethod==='amount'?session.limitCount:null,minutes:session.addMethod==='time'?session.limitMinutes:null});if(!result.length){api.notice('No scheduled Quests fit. Increase the limits or choose manually.');break;}set({phase:'plan',questIds:result});break;}
 case 'quest-manual':set({phase:'pick',addMethod:'manual'});break;
 case 'quest-go':if(session.phase==='pick'||session.phase==='plan')startPrompt();break;
 case 'quest-repick':api.closeDialog(true);set({phase:'pick'});break;
 case 'quest-accepted':{const actual=session.questIds.filter(x=>board.tasks.some(t=>t.id===x&&t.room===room&&!t.done));api.closeDialog(true);set({phase:'active',startedIds:Q.uniqueIds([...session.startedIds,...actual]),questIds:[]});break;}
 case 'quest-add-more':if(!readyToAdd(board)){api.notice('Complete the current Focus Quests before adding more.');break;}set({phase:'pick',addMethod:'manual',questIds:[],limitMinutes:null,limitCount:null});break;
 case 'quest-pick-method':{if(session.phase==='active'&&!readyToAdd(board)){api.notice('Finish your current Focus Quests before adding more.');break;}const method=['amount','time','manual'].includes(id)?id:'manual';set({phase:'pick',addMethod:method,questIds:[],limitCount:method==='amount'?(session.limitCount||3):null,limitMinutes:method==='time'?(session.limitMinutes||15):null});break;}
 case 'quest-complete':api.complete(id);break;
 case 'quest-child-done':api.completeChild(id,el.dataset.child);break;
 case 'quest-over-add':{const id=pending;pending='';api.closeDialog(true);if(set({questIds:Q.uniqueIds([...session.questIds,id])}))startPrompt();break;}
 case 'quest-over-leave':pending='';api.closeDialog(true);api.render();break;
 case 'quest-clear-search':query='';api.render();break;
 case 'quest-close':api.closeDialog(true);break;
 default:return false;
 }return true;}
function change(event){if(!api||!session)return false;const t=event.target;
 if(t.id==='quest-routine'&&session.phase==='clear-choose'){const r=all(api.board()).find(x=>x.id===t.value);if(r){chosenRoutine=r.id;set({routineId:r.id,routineSourceId:r.id,steps:r.steps.slice()});}return true;}
 if(t.dataset?.questClearPick&&session.phase==='clear-choose'){const s=t.dataset.questClearPick;set({steps:t.checked?Q.cleanSteps([...session.steps,s]):session.steps.filter(x=>x!==s)});return true;}
 if(t.id==='quest-time'||t.id==='quest-count'){const n=t.value?Number(t.value):null;set(t.id==='quest-time'?{limitMinutes:n}:{limitCount:n});return true;}
 if(t.dataset?.questSelect&&['pick','plan'].includes(session.phase)){const id=t.dataset.questSelect,valid=Q.eligible(api.board(),room,api.date()),allowed=Object.values(valid).flat().some(x=>x.id===id);if(!allowed)return true;
 const selected=session.questIds.includes(id),next=selected?session.questIds.filter(x=>x!==id):Q.uniqueIds([...session.questIds,id]);
 if(!selected&&session.limitCount!==null&&next.length>session.limitCount){api.notice('Your Total Quests limit is reached. Increase it to choose more.');api.render();return true;}
 if(!selected&&session.limitMinutes!==null){const m=Q.metrics(api.board(),next);if(m.minutes>session.limitMinutes||m.unknown){pending=id;modal('Quest Time Exceeded',`<p>This Quest takes the selected total over your ${session.limitMinutes}-minute limit${m.unknown?' or has no time estimate':''}.</p><div class="quest-actions">${btn('Leave It','quest-over-leave','','quest-no')}${btn('Add to Quest','quest-over-add','','quest-yes')}</div>`);return true;}}
 set({questIds:next});return true;}
 return false;}
function input(event){if(!api||!session||event.target.id!=='quest-search')return false;query=String(event.target.value||'').toLowerCase().trim();const body=document.querySelector('#quest-categories');if(!body)return true;let count=0;body.querySelectorAll('[data-quest-row]').forEach(row=>{const show=!query||row.dataset.searchText.includes(query);row.hidden=!show;if(show)count++;});body.querySelectorAll('details[data-quest-section]').forEach(details=>{if(query)details.open=true;else details.open=opened.has(details.dataset.questSection);});const message=document.querySelector('#quest-search-empty');if(message)message.hidden=!!count||!query;return true;}
function sectionToggle(event){const el=event.target;if(!el?.dataset?.questSection||!document.contains(el))return false;if(!query){if(el.open)opened.add(el.dataset.questSection);else opened.delete(el.dataset.questSection);}return true;}
function init(callbacks){api=callbacks;}
return Object.freeze({init,enter,load,content,handle,change,input,sectionToggle,get:()=>session});
});
