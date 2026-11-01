/* Tidy-ish 0.23 HTML: shared renderers for Home, room tasks, Doing Now and laundry. */
(function(){
'use strict';
const M=window.TidyModel, S=window.TidySchedule, OCAL=window.TidyOwnerCalendar, B=window.TidyBackup, D=window.TidyDrag, W=window.TidyScheduleWizard, Q=window.TidyQuestUI, CQ=window.TidyQuestFocus, TIME=window.TidyQuestTime, FTOOLS=window.TidyFocusTools, L=window.TidyQuestLibrary, MEM=window.TidyQuestMemory, REC=window.TidyQuestRecommendations, CARE=window.TidyCare, OCC=window.TidyOccasional, Z=window.TidyMakerUIV2, V=window.TidyMakerV2, LOC=window.TidyLocationBook, TSC=window.TidyStorageCodec, KEY='tidyish-html-v023-board-v1'+(new URLSearchParams(location.search).get('qa')==='1'?'-qa':''), $=s=>document.querySelector(s), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let grindSection='cat',calendarOffset=0,dataPeriod='30',dataRoom='all',dataVisible=12,dataView='overview',dataTaskId='',calendarView='plan',giftView='christmas',giftPersonTab='all',scheduleWeek=0;
let activityLoadPromise=null,activityLoadAttempted=false,activityLoadError='',pendingActivityDate='';
let libraryQuery='',libraryRoom='all',libraryKind='all',libraryPriority='all',libraryTag='';
let dataMeterView='clean';
function activityReady(){return !!(window.TidyActivityData&&window.TidyActivityCalendar&&window.TidyActivityHost);}
function ensureActivity(){
 if(activityReady()||activityLoadPromise||activityLoadAttempted)return;
 activityLoadAttempted=true;
 activityLoadPromise=(async()=>{
  for(const [globalName,path] of [['TidyActivityData','activity-calendar-data.js'],['TidyActivityCalendar','activity-calendar.js'],['TidyActivityHost','activity-calendar-host.js']]){
   if(window[globalName])continue;
   await new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.async=false;
    script.src='js/'+path+'?v=20261101-calendar-data-gifts3';
    script.onload=()=>window[globalName]?resolve():reject(Error(path+' did not initialise'));
    script.onerror=()=>reject(Error('Could not load '+path+' from your local site'));
    document.head.appendChild(script);
   });
  }
  if(!activityReady())throw Error('The diary scripts did not initialise.');
  activityLoadError='';
  if(pendingActivityDate){window.TidyActivityHost.jumpTo(pendingActivityDate);pendingActivityDate='';}
  render();
 })().catch(error=>{activityLoadError=String(error.message||error);render();}).finally(()=>{activityLoadPromise=null;});
}
function openActivityDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
 calendarView='activity';route='calendar';
 if(activityReady())window.TidyActivityHost.jumpTo(date);
 else pendingActivityDate=date;
 render();window.scrollTo(0,0);
}

// Stage 10A: preview settings live only in memory. No board writes or storage changes.
let scheduleRestDays=new Set(),scheduleOneRoom=false,schedulePreviewMinutes='',scheduleSelected=null;
let wizardStep=-1,wizardDraft=null,wizardWeek=0;const WIZARD_KEY=KEY+'-maker-draft-v1';
let board,storageError='',storageWarning='',lastSaved='',route='home',roomId='kitchen',tab='tasks',doingTab='doing',sideTab='all',search='',locationSearch='',detailed=false,deleted=null,openTasks=new Set(),collapsed=new Set(),dialogDirty=false,dialogSave=null,dialogCleanup=null,pendingExternal=null,noticeTimer,music=null,lastLaundryAttention=false,locationTabId='household';
// Doing Now is a personal display preference, not a household task or sync mutation.
const DOING_VIEW_KEY=KEY+'-doing-view';
let doingDetailed=false,nextDoingExpiry=0;
let homeUtilityView='sorting';
try{doingDetailed=localStorage.getItem(DOING_VIEW_KEY)==='detailed'}catch{}
const app=$('#app'),editor=$('#editor');
try{lastSaved=localStorage.getItem(KEY)||'';const original=lastSaved?TSC.decode(lastSaved):null;board=original?M.normalize(original):M.board();if(!lastSaved)board.features.tools=['Magic Erasers','Microfibre cloths'];M.refresh(board);if(!lastSaved||!TSC.isPacked(lastSaved)||original.rooms?.some(r=>r.id==='upstairs'||r.id==='cats'&&r.name==='Cat Tray Area')){const migrated=TSC.encode(board);if(migrated!==lastSaved)try{localStorage.setItem(KEY,migrated);lastSaved=migrated;}catch(e){storageWarning='Your saved board is still intact, but this browser has little storage space. Download a backup, then remove older Task Data if needed.';}}}catch(e){storageError=e.message;board=M.board();}
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
function persist(next){if(storageError)throw Error('Browser storage is unavailable. The original saved data has been preserved. '+storageError);const current=localStorage.getItem(KEY)||'';if(current!==lastSaved)throw Error('This board changed in another tab. Close this form and reload before saving. Your form is still open.');const serialized=TSC.encode(next);try{localStorage.setItem(KEY,serialized);}catch(e){if(e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014)throw Error('This browser is out of storage space. Your current saved board is intact; this change was not saved. Download a backup, then remove older Task Data if needed.');throw e;}lastSaved=serialized;board=next;}
function change(edit,{redraw=true,sync=true}={}){try{const next=M.clone(board);edit(next);if(window.TidySharing?.transition)window.TidySharing.transition(board,next);persist(next);if(redraw)render();if(sync)window.TidySharing?.queue();return true;}catch(e){notice(e.message);return false;}}
/* TIDYISH-BACK-NAV-V1: browser history and in-app Back navigation */
const backRouteNames=new Set(['home','room','doing','calendar','data','side','more','settings','help','backup','manage','schedule','laundry','laundry-settings','focus','clearway','doing-focus','grind','library','locations','gifts']);
function backState(depth){return {route,roomId,tab,doingTab,sideTab,dataView:typeof dataView==='string'?dataView:undefined,depth};}
function rememberBackState(){
 try{
  const saved=window.history.state||{},depth=Number.isInteger(saved.tidyishBack?.depth)?Math.max(0,saved.tidyishBack.depth):0;
  window.history.replaceState({...saved,tidyishBack:backState(depth)},'',window.location.href);
  return depth;
 }catch{return 0;}
}
function navigate(next,id){
 if(editor.open||!backRouteNames.has(next))return;
 if(route===next&&(!id||id===roomId))return;
 const depth=rememberBackState();
 route=next;if(id)roomId=id;search='';tab='tasks';openTasks.clear();
 try{window.history.pushState({tidyishBack:backState(depth+1)},'',window.location.href);}catch{}
 render();window.scrollTo(0,0);
}
function back(){
 if(editor.open){closeDialog();return;}
 const depth=window.history.state?.tidyishBack?.depth;
 if(Number.isInteger(depth)&&depth>0){window.history.back();return;}
 if(route!=='home')navigate('home');
}
window.addEventListener('popstate',event=>{
 const previous=event.state?.tidyishBack;
 if(!previous||!backRouteNames.has(previous.route))return;
 if(editor.open&&!closeDialog()){
  // Keep the unsaved dialog open, restoring the current history entry.
  try{window.history.pushState({tidyishBack:backState((previous.depth||0)+1)},'',window.location.href);}catch{}
  return;
 }
 route=previous.route;roomId=previous.roomId||roomId;
 tab=previous.tab||'tasks';doingTab=previous.doingTab||'doing';sideTab=previous.sideTab||'all';
 if(typeof dataView==='string'&&['overview','rooms','quests','focus','occasional'].includes(previous.dataView))dataView=previous.dataView;
 search='';openTasks.clear();render();window.scrollTo(0,0);
});
const savedBack=window.history.state?.tidyishBack;
if(savedBack&&backRouteNames.has(savedBack.route)){
 route=savedBack.route;roomId=savedBack.roomId||roomId;
 tab=savedBack.tab||tab;doingTab=savedBack.doingTab||doingTab;sideTab=savedBack.sideTab||sideTab;
 if(typeof dataView==='string'&&['overview','rooms','quests','focus','occasional'].includes(savedBack.dataView))dataView=savedBack.dataView;
}
rememberBackState();
function tabs(entries,chosen,action,cls=''){return `<div class="tabs ${cls}" role="tablist">${entries.map(([id,label])=>button(esc(label),action,id,id===chosen?'active':'',`role="tab" aria-selected="${id===chosen}"`)).join('')}</div>`;}
function globals(home=false){const alert=F().laundry?.some(l=>M.laundryNeedsAttention(l));return `<div class="global ${home?'home-global':''}">${alert?button('🧺','navigate','laundry','laundry-ready-alert','aria-label="Laundry ready for transfer" title="Laundry ready for transfer"'):''}${button('⚙︎','navigate','settings','','aria-label="Settings"')}${button('?','navigate','help','','aria-label="Help"')}</div>`;}
// Six compact hand-drawn icons replace the previous oversized illustrated strip.
// Routes and their accessible names stay unchanged; the old image remains in assets as a reference.
const destinations=[['home','House'],['doing','Doing Now'],['side','Side Quests'],['data','Task Data'],['calendar','Calendar'],['more','More']];
const navIcons={
 home:'<path d="M3.5 11 12 4l8.5 7M6 10v10h12V10M10 20v-6h4v6"/>',
 doing:'<rect x="5" y="4" width="14" height="17" rx="2.8"/><path d="M9 4.5h6M8.5 11.8l2.2 2.2 4.7-5M8.5 17h7"/>',
 calendar:'<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M7.7 3.5v4M16.3 3.5v4M3.5 10h17M8 14.1h2M13.8 14.1h2M8 17.7h2"/>',
 data:'<path d="M4 20h16M6 17v-4M10 17V9M14 17v-7M18 17V5"/><path d="M5.4 9.4 9.7 6.5 13.5 8l5.2-5.1"/>',
 side:'<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9Z"/>',
 more:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
};
function footer(){return `<nav class="footer simple-nav" aria-label="Main navigation"><div class="nav-items">${destinations.map(([id,label])=>{const active=id===route||id==='home'&&route==='room'||id==='more'&&['settings','help','backup','laundry','laundry-settings','manage','schedule','library','gifts'].includes(route);return button(`<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${navIcons[id]}</svg><span class="nav-label">${esc(label)}</span>`,'navigate',id,active?'active':'',`aria-label="${esc(label)}" ${active?'aria-current="page"':''}`)}).join('')}</div></nav>`;}
function meter(r){const m=M.mess(board,r),clean=M.cleanPercent(m),state=clean>=90?'clean':clean>=60?'lived':clean>=20?'messy':'chaos';return `<div class="fancy-meter ${state}" role="meter" aria-label="${esc(r.name)} cleanliness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${clean}"><span class="meter-fill" style="width:${clean}%"></span><span class="meter-phrase">${esc(M.phrase(m))}</span><span class="meter-leaf" aria-hidden="true">✦</span></div>`;}

const positions={storage:[5,17.3,33,13.4],cats:[40,15.3,21,15.4],print:[63,17.3,32,13.4],penny:[5,32.4,32,17.1],hall:[40,32.4,25,17.1],bathroom:[67,32.4,29,17.1],master:[5,51,49,17.1],living:[56,51,40,17.1],kitchen:[5,69.1,48,14.2],entrance:[56,69.1,40,14.2]};
function houseKey(r){return /(?:room-)?penny-/.test(r.art)?'penny':/(?:room-)?master-/.test(r.art)?'master':r.id.replace(/^room-/,'');}
function whatDoIReadOnly(roomFilter=''){
 return button('What should I do?','what-next-open',roomFilter,'ghost what-next-trigger');
}
function openWhatNext(roomFilter=''){
 const items=REC?.rank(board,{room:roomFilter,limit:8})||[];
 const rows=items.map(row=>`<div class="new-next-row"><div class="grow"><strong>${esc(row.task.title)}</strong><div class="small">${esc(room(row.task.room)?.name||'General')} · ${esc(row.reason)} · about ${Math.round(row.estimated)} min</div></div>${button('Focus','recommend-focus',row.id,'ghost')}${button('Doing Now','recommend-doing',row.id,'ghost')}</div>`).join('');
 dialog('What should I do?',`${button('Choose time / amount','recommend-options',roomFilter,'ghost')}${rows||'<p class="small">No suggestions available right now.</p>'}`);
}

function homeSortingOrFloors(){
 const collected=CQ?.collectedTasks(board,'',true)||board.tasks.filter(t=>!t.done&&!t.archived&&String(t.generatedFrom||'').startsWith('clear-way-session:'));
 const floorTasks=board.tasks.filter(t=>!t.done&&!t.archived&&!t.side&&!t.occasionKind&&/\b(floor|hoover|vacuum|mop|sweep|stairs)\b/i.test(t.title));
 const floorRows=floorTasks.map(t=>`<div class="tidy-utility-row"><div class="grow"><strong>${esc(t.title)}</strong><p class="small">${esc(room(t.room)?.name||'General')} ${t.littleOften?' · repeatable':''}</p></div>${t.littleOften?button('I did a thing!','quick-done',t.id,'complete'):button('Open room','room',t.room||'living','ghost')}</div>`).join('');
 const sortRows=collected.map(t=>`<div class="tidy-utility-row"><div class="grow"><strong>${esc(t.title)}</strong><p class="small">${esc(room(t.room)?.name||'General')}</p></div>${t.title.toLowerCase().includes('near their homes')?button('Name categories','clear-categories',t.id,'ghost'):''}${button('Done','clear-finish-return',t.id,'complete')}</div>`).join('');
 return `<section class="tidy-utility-tile"> <div class="row spread"><h2>${homeUtilityView==='sorting'?'Collected items to sort':'Floors'}</h2><div class="row">${button('‹','switch-home-utility','','ghost','aria-label="Switch home tile"')}${button('›','switch-home-utility','','ghost','aria-label="Switch home tile"')}</div></div><div class="tidy-utility-scroll">${homeUtilityView==='sorting'?(sortRows||'<p class="small">No collected items are waiting to be put away.</p>'):(floorRows||'<p class="small">No floor Quests yet. Add a repeatable floor Quest if you want a quick counter.</p>')}</div>${homeUtilityView==='floors'?button('＋ Add repeatable floor Quest','floor-add','','ghost'):''}<p class="small">${homeUtilityView==='sorting'?'Return and sorting tasks stay active until genuinely completed.':'Use this any time. Floors are never automatically added to Focus.'}</p></section>`;
}
function careTileSubtitle(group){
 const ids=CARE?.RULES?.filter(r=>r.group===group)||[];
 const worst=ids.map(r=>CARE.status(board,r.id)).sort((a,b)=>['green','blue','orange','red','flashing'].indexOf(b.state)-['green','blue','orange','red','flashing'].indexOf(a.state))[0];
 return worst?.label||'Ready';
}
function dailyGrindTiles(){return `<section class="tidy-daily-grind"><div class="new-grind-grid">${[['laundry','Laundry','Laundry cycles'],['cat','Cat Tray',careTileSubtitle('cat')],['aquatic','Fish · Isopods · Plants',careTileSubtitle('aquatic')],['often','Little & Often','Quick repeat counters']].map(([key,name,sub])=>button(`<strong>${esc(name)}</strong><small>${esc(sub)}</small>`,key==='laundry'?'navigate':'open-grind',key,'new-grind-tile new-grind-'+key)).join('')}</div></section>`;}
function dailyGrindPage(){
 if(grindSection==='often'){
  const items=board.tasks.filter(t=>t.littleOften&&!t.archived);
  return `<section class="new-grind-page"><h2>Little & Often</h2><p>Every press records one real completion and one point, including repeat actions on the same day.</p><div class="tidy-care-list">${items.map(t=>{const all=F().wins.filter(w=>w.taskId===t.id);return `<article class="tidy-care-card"><strong>${esc(t.title)}</strong><div class="small">${all.length} recorded completions</div><div class="row">${button('I did a thing!','quick-done',t.id,'complete')}${all.length?button('Undo last','quick-undo',t.id,'ghost'):''}${button('Edit','edit-task',t.id,'ghost')}</div></article>`;}).join('')||'<p>Make your first quick task below.</p>'}</div>${button('＋ Add Little & Often','quick-add','','primary')}${button('Back to home','navigate','home','ghost')}</section>`;
 }
 const rows=CARE?.RULES?.filter(r=>r.group===grindSection)||[];
 return `<section class="new-grind-page"><h2>${grindSection==='cat'?'Cat Tray':'Fish · Isopods · Plants'}</h2><div class="tidy-care-list">${rows.map(r=>{const state=CARE.status(board,r.id);const previous=CARE.wins(board,r.id);return `<article class="tidy-care-card"><strong>${esc(r.title)}</strong><div><span class="tidy-care-pill ${esc(state.state)}">${esc(state.label)}</span></div><div class="small">${state.days===null?'No completion recorded':state.days+' day'+(state.days===1?'':'s')+' since last done'} · ${previous.length} completion${previous.length===1?'':'s'}</div>${state.warning&&['orange','red','flashing'].includes(state.state)?`<p>${esc(state.warning)}</p>`:''}<div class="row">${button('I did a thing!','care-done',r.id,'complete')}${previous.length?button('Undo last','care-undo',r.id,'ghost'):''}</div></article>`;}).join('')}</div>${button('Back to home','navigate','home','ghost')}</section>`;
}
function voiceCapture(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 dialog('Speak a Sidequest',`<p class="small">${Recognition?'Tap Start listening and speak naturally.':'Speech recognition is unavailable in this browser. You can type instead.'} Review the words before saving.</p><div class="row">${Recognition?button('🎙 Start listening','voice-listen','','primary'):''}<span id="voice-status" role="status" aria-live="polite"></span></div>${field('Sidequest or homeless item','voiceTitle','','text','required maxlength="180" placeholder="Find a home for spare cables"')}${select('Save as','voiceType',[['side','Sidequest'],['homeless','Homeless item']],'side')}`,fd=>{
 const title=String(fd.get('voiceTitle')||'').trim().replace(/^add (?:a )?sidequest\s*[:,-]?\s*/i,'').replace(/^these?\s+/i,'');if(!title)throw Error('Say or type what you want to capture.');const isHomeless=fd.get('voiceType')==='homeless';
 if(change(b=>{if(isHomeless)b.features.items.unshift({id:M.uid(),kind:'homeless',text:title,location:route==='room'?roomId:''});else M.add(b,M.task({room:route==='room'?roomId:'',title,side:true,sideKind:'organisation',doing:false}));})){closeDialog(true);notice('Saved '+(isHomeless?'homeless item':'Sidequest')+'. You can carry on cleaning.');}
 },{saveLabel:'Save and return'});
}
function beginVoiceListening(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){notice('Speech recognition is unavailable. Type the Sidequest instead.');return;}try{const rec=new Recognition();rec.lang='en-GB';rec.interimResults=false;rec.maxAlternatives=1;const label=editor.querySelector('#voice-status');if(label)label.textContent='Listening…';rec.onresult=e=>{const value=String(e.results[0][0].transcript||'');const input=editor.querySelector('[name="voiceTitle"]');if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}if(label)label.textContent='Heard. Check the words before saving.';};rec.onerror=e=>{if(label)label.textContent='Microphone: '+e.error+'. Try typing.';};rec.onend=()=>{if(label&&label.textContent==='Listening…')label.textContent='Stopped listening.';};rec.start();dialogCleanup=()=>rec.abort();}catch(e){notice('Microphone is not available: '+e.message);}}
function home(){let body='';if(!F().simple){body=`<div class="house"><div class="house-canvas"><img src="assets/rooms/house.png" alt="Tidy-ish illustrated house with named rooms" fetchpriority="high">${rooms().map(r=>{const p=positions[houseKey(r)];if(!p)return '';const m=M.mess(board,r);return button(`<span class="home-meter"><span class="home-meter-fill" style="width:${M.cleanPercent(m)}%"></span><span class="phrase">${esc(M.phrase(m))}</span></span>`,'room',r.id,'house-hit',`style="left:${p[0]}%;top:${p[1]}%;width:${p[2]}%;height:${p[3]}%" aria-label="Open ${esc(r.name)}. Cleanliness ${Math.round(M.cleanPercent(m))} percent"`)}).join('')}</div></div>`;}else body=`<h1>Your house</h1><div class="padded">${rooms().map(r=>card(button(esc(r.name)+' ›','room',r.id,'wide')+meter(r))).join('')}</div>`;
return body+`<div class="padded"><div class="meter-label">${esc(M.phrase(M.householdMess(board)))}</div><div class="home-links">${button('Extra rooms','extra')}${button('All rooms','all-rooms')}${button('Manage home','navigate','manage')}</div>${whatDoIReadOnly()}${dailyGrindTiles()}${homeSortingOrFloors()}${button(`Doing Now · ${board.tasks.filter(t=>t.doing&&!t.done).length}`,'navigate','doing','wide')}${card(`${totalPoints()} points · ${F().wins.length+(F().taskDataArchives||[]).filter(a=>a.kind==='completion').reduce((n,a)=>n+(Number(a.count)||0),0)} completed`,'small')}</div>`;}
function totalPoints(){return F().wins.reduce((n,w)=>n+(w.points??1),0)+F().completionSummaries.reduce((n,w)=>n+w.count,0)+(F().taskDataArchives||[]).filter(a=>a.kind==='completion').reduce((n,a)=>n+(Number(a.points)||0),0);}
function roomScene(r){if(F().simple)return meter(r);const m=M.mess(board,r),state=m>=100?3:m>=5/14*100?2:m>0?1:0,key=houseKey(r)==='storage'?'craft':houseKey(r),suffix=['spotless','clean','messy','disaster'][state];const known=['craft','cats','print','penny','hall','bathroom','master','living','kitchen','entrance'].includes(key);const catArt={spotless:'tidyish-catroom-spotless-open-trays.png',clean:'tidyish-catroom-clean-open-trays.png',messy:'tidyish-catroom-messy-open-trays.png',disaster:'tidyish-catroom-disaster-open-trays.png'};const file=key==='cats'?`room-art/${catArt[suffix]}`:known?`room-art/room-${key==='hall'?'main-landing':key}-${suffix}.${key==='penny'&&state===0?'jpg':'png'}`:r.art;return `<div class="room-scene"><img src="${asset(file)}" alt="${esc(r.name)} · ${esc(M.phrase(m))}" loading="lazy">${known?button('<span class="guardian-speech" aria-hidden="true"></span>','creature-react',r.id,'guardian guardian-tap',`data-state="${state}" style="background-image:url('${asset(`sprites/${key}-states.webp`)}')" aria-label="Tap ${esc(r.name)} creature for a reaction to the room's mess level"`):''}</div>${meter(r)}`;}
function taskToolbar(){return `<div class="toolbar">${button(detailed?'Detailed view ✓':'Compact view ✓','view')}${button('⌕','search','','search-icon','aria-label="Search tasks"')}${button('＋ Add task','add-task')}${button('Quest Library','library-room',route==='room'?roomId:'all','ghost')}${route==='doing'?button('Choose tasks','choose'):''}${route==='doing'?button('Tools','tools'):''}${deleted&&deleted.page===pageKey()?button('Undo deleted','undo-delete'):''}</div>${search!==null&&uiSearch?`<label class="field">Search ${route==='room'?'this room':'tasks'}<input id="task-search" value="${esc(search)}" placeholder="Search tasks"></label>`:''}`;}
let uiSearch=false;
function visibleTasks(){let list=route==='doing'?(doingTab==='attention'?board.tasks.filter(t=>t.attention&&!M.paused(t)):M.doing(board)):route==='room'?board.tasks.filter(t=>t.room===roomId&&!M.paused(t)&&(tab==='side'?t.side:tab==='homeless'?false:!t.side)):board.tasks.filter(t=>t.side&&!M.paused(t)&&(sideTab==='all'||t.sideKind===sideTab));
if(route==='room'&&tab==='tasks')list=list.filter(t=>!V?.isManaged(t)||t.scheduleActive);if(route==='room'&&tab==='side'&&sideTab!=='all')list=list.filter(t=>t.sideKind===sideTab);if(search)list=list.filter(t=>(t.title+' '+t.notes+' '+t.children.map(c=>c.title).join(' ')).toLowerCase().includes(search.toLowerCase()));return [...list.filter(t=>!t.done),...list.filter(t=>t.done)];}
function taskList(list,offset=0){if(!list.length)return '<p class="empty">No tasks to show</p>';return list.map((t,i)=>taskCard(t,offset+i)).join('');}
function taskCard(t,pos=0){if(route==='doing')return doingTaskCard(t,pos);const expanded=openTasks.has(t.id);return `<article class="task position-colour-${D.palette(pos)} ${t.done?'done':''}" data-task-id="${esc(t.id)}"><div class="row room-task-main">${button(t.doing?'Not on it':"I’m on it!",'select-task',t.id,'select-task',`aria-pressed="${t.doing}" aria-label="${t.doing?'Remove from':'Add to'} Doing Now: ${esc(t.title)}"`)}${button(`${esc(t.title)}${t.children.length?` <span class="small">${t.children.filter(c=>c.done).length}/${t.children.length} ${expanded?'▾':'▸'}</span>`:''}`,'expand',t.id,'ghost grow task-title',`aria-expanded="${expanded}"`)}${button('+','add-child',t.id,'ghost','aria-label="Add subtask to '+esc(t.title)+'"')}${button(t.done?'Undo':t.children.length?'✓ I did many things!':'✓ I did a thing!','complete',t.id,'complete room-complete')}</div>${detailed?`<div class="task-meta">${esc(room(t.room)?.name||'Homeless')} · Priority ${t.priority}${t.estimate?' · '+t.estimate+' min':''}${t.assigned?' · '+esc(t.assigned):''}${t.dueDate?' · '+esc(t.dueDate):''}</div>`:''}${expanded?childrenHtml(t):''}<div class="actions">${!t.done?button('First','first',t.id,'first')+button('Last','last',t.id,'last'):''}${button(stopwatch,'timer',t.id,'icon-button',`aria-label="Stopwatch for ${esc(t.title)}"`)}${button('🔧','task-menu',t.id,'room-task-menu',`aria-label="Edit and actions for ${esc(t.title)}"`)}</div></article>`;}
function focusTaskCard(t,pos=0){const expanded=openTasks.has(t.id),count=t.children.filter(c=>c.done).length;return `<article class="task focus-active-card position-colour-${D.palette(pos)} ${t.done?'done':''}" data-focus-task-id="${esc(t.id)}"><div class="row room-task-main">${t.done?'':`<button type="button" class="quest-focus-grip" data-focus-reorder="${esc(t.id)}" aria-label="Drag to reorder ${esc(t.title)}; hold and use Alt plus arrow keys">⠿</button>`}${button(`${esc(t.title)}${t.children.length?` <span class="small">${count}/${t.children.length} ${expanded?'▾':'▸'}</span>`:''}`,'expand',t.id,'ghost grow task-title',`aria-expanded="${expanded}"`)}${button('+','add-child',t.id,'ghost','aria-label="Add subtask to '+esc(t.title)+'"')}${button(t.done?'Undo':t.children.length?'✓ I did many things!':'✓ I did a thing!','complete',t.id,'complete room-complete')}</div>${detailed?`<div class="task-meta">${esc(room(t.room)?.name||'Homeless')} · Priority ${t.priority}${t.estimate?' · '+t.estimate+' min':''}${t.assigned?' · '+esc(t.assigned):''}${t.dueDate?' · '+esc(t.dueDate):''}</div>`:''}${expanded?childrenHtml(t):''}<div class="actions">${button(stopwatch,'timer',t.id,'icon-button',`aria-label="Stopwatch for ${esc(t.title)}"`)}${button('🔧','task-menu',t.id,'room-task-menu',`aria-label="Edit and actions for ${esc(t.title)}"`)}</div></article>`;}
function safeImage(src){return /^(data:image\/(png|jpeg|webp|gif);base64,|blob:)/.test(src)?esc(src):'';}
function childrenHtml(t,parent='',depth=0){return t.children.filter(c=>(c.parentId||'')===parent).map(c=>`<div class="child room-child ${depth?'nested-child':''}" data-child-id="${esc(c.id)}" data-root-id="${esc(t.id)}" data-parent-id="${esc(parent)}"><div class="row"><button type="button" class="child-grip" aria-label="Drag ${esc(c.title)} out or reorder" title="Drag out to main tasks or rearrange subtasks; Alt + arrow keys to reorder">⠿</button><span class="grow ${c.done?'muted':''}">${c.done?'✓ ':''}${esc(c.title)}</span>${button(c.done?'Undo':'Done it!','child-complete',t.id,'ghost',`data-child="${esc(c.id)}"`)}</div>${detail('Options',`<div class="row">${button('First','child-first',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Last','child-last',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button(stopwatch,'timer',t.id,'icon-button',`data-child="${esc(c.id)}" aria-label="Stopwatch for ${esc(c.title)}"`)}${button('Task Data','data-open-task',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Edit','edit-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('+ Subtask','add-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}</div>`)}${childrenHtml(t,c.id,depth+1)}</div>`).join('');}
function roomPage(){const r=room(roomId);if(!r)return '<p class="empty">Choose a room from House.</p>';return `${r.id==='bathroom'?'<section class="room-preview-bathroom">':''}<div class="row spread"><h1>${esc(r.name)}</h1>${button('◎ Focus!','focus',r.id)}</div>${roomScene(r)}${whatDoIReadOnly(r.id)}${button('Clear the Way','clearway',r.id,'ghost clear-way-entry')}${tabs([['tasks','Tasks'],['side','Side quests'],['homeless','Homeless']],tab,'room-tab','nested')}${tab==='side'?tabs(sideChoices(),sideTab,'side-tab','nested'):''}${tab==='homeless'?homelessPage(r):`${taskToolbar()}${taskList(visibleTasks())}`}${detail('Room options',button('Adjust mess level','calibrate',r.id)+button('Occasional jobs','navigate','schedule','ghost'))}${r.id==='bathroom'?'</section>':''}`;}
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
// Position colours: preserve the first six approved muted tones, then generate
// distinct muted hues for additional Quests. Colours follow list position.
function doingPositionStyle(pos){
 if(pos<6)return '';
 const hue=Math.round((pos*137.50776405003785+22)%360),sat=26+(pos%3)*3,light=27+(pos%4)*2;
 return ` style="--pos-card-bg:hsl(${hue} ${sat}% ${light}%);--pos-card-border:hsl(${hue} ${Math.min(65,sat+23)}% ${Math.min(70,light+32)}%)"`;
}
function doingTaskCard(t,pos=0){
 const expanded=openTasks.has(t.id),count=t.children.filter(c=>c.done).length;
 return `<article class="task doing-task position-colour-${D.palette(pos)} ${t.children.length?'has-subtasks':''}"${doingPositionStyle(pos)} data-task-id="${esc(t.id)}">
 <div class="doing-task-main ${t.children.length?'has-subtasks':''}">
 ${button(t.doing?'Not on it':"I'm on it!",'select-task',t.id,'select-task doing-select',`aria-pressed="${t.doing}" aria-label="${t.doing?'Remove from':'Add to'} Doing Now: ${esc(t.title)}"`)}
 ${button(esc(t.title)+(t.children.length?` <span class="expand-indicator" aria-hidden="true">${expanded?'▾':'▸'}</span>`:''),'expand',t.id,'ghost doing-task-title',`aria-expanded="${expanded}"`)}
 ${t.children.length?`<span class="doing-subtask-count" aria-label="${count} of ${t.children.length} subtasks complete">${count}/${t.children.length}</span>`:''}
 ${button(t.children.length?'✓ I did many things!':'✓ I did a thing!','complete',t.id,'complete doing-complete')}
 </div>
 ${doingDetailed?`<div class="doing-meta"><span>Added: ${esc(dateLabel(t.createdAt))}</span><span>By: ${esc(creatorLabel(t))}</span><span>Assigned: ${esc(t.assigned||'Anyone')}</span></div>`:''}
 ${expanded?doingChildren(t):''}
 <div class="doing-task-actions">
 ${button('First','first',t.id,'first doing-order')}${button('Last','last',t.id,'last doing-order')}
 ${button('🔧','task-menu',t.id,'doing-more',`aria-label="Edit and actions for ${esc(t.title)}"`)}
 ${button(phoneClock,'timer',t.id,'doing-timer',`aria-label="Set phone alarm timer for ${esc(t.title)}"`)}
 </div></article>`;
}
function doingChildren(t,parent='',depth=0){
 return t.children.filter(c=>(c.parentId||'')===parent).sort((a,b)=>Number(a.done)-Number(b.done)).map(c=>`
 <div class="child doing-child ${c.done?'child-finished':''} ${depth?'nested-child':''}" data-child-id="${esc(c.id)}" data-root-id="${esc(t.id)}" data-parent-id="${esc(parent)}">
 <button type="button" class="child-grip" draggable="false" aria-label="Drag to reorder ${esc(c.title)}" title="Drag to reorder; Alt + arrow keys also work">⠿</button>
 <span class="doing-child-title ${c.done?'muted':''}">${c.done?'✓ ':''}${esc(c.title)}</span>
 ${button(c.done?'Undo':'✓ Done it!','child-complete',t.id,c.done?'child-undo':'child-done',`data-child="${esc(c.id)}"`)}
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
 return `<div class="doing-board">${nav}<div class="doing-toolbar">${view}${button('＋ Add a task','add-task','','add-task-button')}${button('Doing Now Focus','doing-focus','','doing-focus-entry')}</div>${active.length?groupedTasks(active):'<p class="empty">No active tasks to show</p>'}${completedDoingList(recent)}${deleted&&deleted.page===pageKey()?button('Undo deleted','undo-delete','','ghost'):''}</div>`;
}
function guardianThumb(id){const r=room(id);if(!r)return '';const key=houseKey(r)==='storage'?'craft':houseKey(r),known=['craft','cats','print','penny','hall','bathroom','master','living','kitchen','entrance'].includes(key);return known?`<span class="guardian-thumb" style="background-image:url('${asset(`sprites/${key}-states.webp`)}')" role="img" aria-label="${esc(r.name)} character"></span>`:'<span class="guardian-thumb simple-room" aria-hidden="true">⌂</span>';}
function groupedTasks(list){if(!list.length)return '<p class="empty">No tasks to show</p>';const groups=[...new Set(list.map(t=>t.room))];return groups.map(id=>`<section class="room-task-section room-tone-${Math.max(0,rooms().findIndex(r=>r.id===id))%12}"><div class="room-heading"><div class="room-heading-identity">${guardianThumb(id)}${button(`${collapsed.has(id)?'▸':'▾'} ${esc(room(id)?.name||'Homeless')}`,'collapse',id,'ghost grow room-name',`aria-expanded="${!collapsed.has(id)}"`)}</div><div class="room-heading-controls">${room(id)?button('Focus','focus',id,'room-focus'):''}${button('Tools','tools',id,'room-tools')}</div></div>${collapsed.has(id)?'':taskList(list.filter(t=>t.room===id),groups.slice(0,groups.indexOf(id)).reduce((sum,prev)=>sum+list.filter(t=>t.room===prev).length,0))}</section>`).join('');}

function sidePage(){return `${tabs(sideChoices(),sideTab,'side-tab','nested')}${button('＋ New tab','new-side-tab','', 'ghost')}${taskToolbar()}${taskList(visibleTasks())}`;}
function laundryLoad(l,compact){const ready=M.laundryNeedsAttention(l),title=l.uniformWeek?'Uniform · put away':l.route==='dryer'?'Washing & dryer':'Washing & rail';return `<section class="${compact?'':'card'}"><div class="laundry-card"><img src="${asset(l.route==='dryer'?'laundry-dryer.svg':'laundry-rail.svg')}" alt="${l.route==='dryer'?'Tumble dryer':'Clothes hanging on a rail'}"><div class="grow"><h3>${title}</h3>${!compact?`<div class="small">Load ${l.slot} · Step ${l.step+1} of 3</div>`:''}${l.step!==0?`<p class="small">${esc(M.laundryText(F(),l))}</p>`:''}${ready?'<p class="gold small">load is ready, rewash = money down the drain</p>':''}<div class="row">${l.step===1?button('Put out','laundry-step',l.slot,'', 'data-route="rail"')+button('Dryer','laundry-step',l.slot,'','data-route="dryer"'):button(l.step===0?esc(F().wash):'Done it!','laundry-step',l.slot)}${l._undo?button('Undo last step','laundry-undo',l.slot,'ghost'):''}</div></div></div></section>`;}
function uniformContent(compact){const f=F();if(f.uniformIndex<0||f.uniformPaused)return '';const text=f.uniformSteps[f.uniformIndex]||'Uniform',first=f.uniformIndex===1&&f.uniformSteps.length===7;return `<section class="${compact?'':'card'}"><div class="row spread"><h3>Wash uniform · Saturday</h3>${button('Pause uniform','uniform-pause','','ghost')}</div><div class="laundry-card"><img src="assets/laundry/uniform.png" alt="School uniform"><div class="grow"><div class="small">Step ${f.uniformIndex+1} of ${f.uniformSteps.length}</div><p>${first?'Choose the first wash':esc(text)}</p>${f.uniformStartedAt&&Date.now()-f.uniformStartedAt>=7200000?'<p class="gold small">load is ready, rewash = money down the drain</p>':''}<div class="row">${first?button('Wash darks','uniform-step','darks')+button('Wash whites','uniform-step','whites'):button('Done it!','uniform-step')}${f._uniformUndo?button('Undo uniform step','uniform-undo','','ghost'):''}</div>${/Hang/i.test(text)?'<p class="small">Remember to stretch out on the rail.</p>':''}</div></div></section>`;}
function displayLoads(){const list=F().laundry.filter(l=>!l.uniformWeek||l.step!==0).sort((a,b)=>(a.step===1?0:1)-(b.step===1?0:1)||(a.step===1?a.startedAt-b.startedAt:0)||a.slot-b.slot);let slot=Math.max(0,...F().laundry.map(l=>l.slot));for(const route of ['rail','dryer'])if(!list.some(l=>!l.uniformWeek&&l.route===route))list.push({slot:++slot,route,step:0,selected:false});return list;}
function laundryContent(compact){return uniformContent(compact)+displayLoads().map(l=>laundryLoad(l,compact)).join('');}
function laundryPage(configure=false){if(configure){return `<form id="laundry-config">${card(field('Washing step','wash',F().wash)+field('Hanging rail transfer','railTransfer',F().railTransfer)+field('Dryer transfer','dryerTransfer',F().dryerTransfer)+field('Hanging rail finish','railFinish',F().railFinish)+field('Dryer finish','dryerFinish',F().dryerFinish)+detail('Uniform cycle',area('Uniform steps — one per line','uniformSteps',F().uniformSteps.join('\n')))+`<button type="submit">Save cycle</button>`)}</form>`;}
return `<div class="laundry-compact-page">${laundryContent(true)}<div class="row laundry-tools">${F().uniformPaused||F().uniformIndex<0?button(F().uniformPaused?'Resume uniform':'Pause uniform',F().uniformPaused?'uniform-resume':'uniform-pause'):''}${button('Laundry setup & editing','navigate','laundry-settings','ghost')}${button('Add another load','new-load','', 'ghost')}</div>${F().uniformIndex<0&&!F().uniformPaused?'<p class="small">Uniform returns next Saturday</p>':''}${F()._uniformUndo&&F().uniformIndex<0?button('Undo uniform step','uniform-undo','','ghost'):''}${detail('One-off laundry task',`<form id="oneoff-form">${field('Laundry task','title','','text','required')}<button>Add task</button></form>${F().items.filter(i=>i.kind==='laundry').map(i=>check(i.text,'',i.done,`data-action="laundry-oneoff" data-id="${esc(i.id)}"`)).join('')}`)}${detail('Laundry reminders',`<p class="small">The ready message appears after two hours. While this browser page is open, optional browser notifications can remind you every half hour until transfer. If Android Automate already sends laundry alerts, leave browser notifications disabled to avoid duplicate alerts. Browser notifications cannot guarantee Android-style reminders when this page is closed.</p>${button('Enable browser reminders','notifications')}`)}</div>`;}
function homelessPage(r){return `<form id="homeless-form">${field('Item without a home','title','','text','required')}<button>Add item</button></form>${F().items.filter(i=>i.kind==='homeless'&&i.location===r.id).map(i=>card(`<div class="row"><span class="grow">${esc(i.text)}</span>${button('Remove','homeless-remove',i.id,'ghost')}</div>`)).join('')}${taskList(board.tasks.filter(t=>!t.room))}`;}
function locationBookPage(){
 const f=F(),tabs=[...f.locationTabs].sort((a,b)=>(a.order||0)-(b.order||0));
 if(!tabs.some(t=>t.id===locationTabId))locationTabId=tabs[0]?.id||'household';
 const current=tabs.find(t=>t.id===locationTabId)||tabs[0],entries=f.locationEntries.filter(x=>x.tabId===current.id);
 const areasByRoom=id=>f.locationAreas.filter(a=>a.roomId===id).sort((a,b)=>(a.order||0)-(b.order||0));
 const areaLabel=id=>{const a=f.locationAreas.find(x=>x.id===id),r=a&&board.rooms.find(x=>x.id===a.roomId);return a?`${r?.name||'Room'} · ${a.name}`:'Unknown area'};
 const itemCard=item=>{const prev=LOC.previous(f,item),moves=LOC.history(f,item.id);return `<article class="place-item" data-place-entry="${esc(item.id)}"><div class="row place-item-title"><button type="button" class="place-drag" data-place-drag aria-label="Drag ${esc(item.name)} to another area" title="Drag to move; use Edit to choose a location">⠿</button><strong>${esc(item.name)}</strong></div>${prev?`<small class="place-previous">Previously: ${esc(prev.fromRoomName)} · ${esc(prev.fromAreaName)}</small><details class="place-history"><summary>Location history · ${moves.length}</summary>${moves.slice().reverse().map(m=>`<p>${esc(m.fromRoomName)} · ${esc(m.fromAreaName)} → ${esc(m.toRoomName)} · ${esc(m.toAreaName)} <small>${esc(new Date(m.at).toLocaleDateString('en-GB'))}</small></p>`).join('')}</details>`:''}<div class="row place-item-actions">${button('Edit','place-edit-item',item.id,'ghost')}${button('Bin','place-delete-item',item.id,'ghost')}</div></article>`;};
 const roomRows=board.rooms.map(r=>{const areas=areasByRoom(r.id),count=entries.filter(e=>areas.some(a=>a.id===e.areaId)).length,open=count>0||!areas.length;return `<details class="place-room" ${open?'open':''}><summary><span>${esc(r.name)}${r.archived?' · Archived':''}</span><small>${count}</small></summary><div class="place-room-content"><div class="row place-room-actions">${button('+ Area','place-add-area',r.id,'ghost')}</div>${areas.length?areas.map(a=>{const rows=entries.filter(e=>e.areaId===a.id).sort((x,y)=>(x.order||0)-(y.order||0));return `<section class="place-area" data-place-drop="${esc(a.id)}" aria-label="Drop items in ${esc(r.name)} · ${esc(a.name)}"><div class="row place-area-heading"><strong>${esc(a.name)}</strong>${button('Options','place-area-menu',a.id,'ghost')}</div><div class="place-area-items">${rows.map(itemCard).join('')||'<small class="place-drop-hint">Drop an item here</small>'}</div></section>`;}).join(''):'<p class="small place-no-area">Add a named area to record locations in this room.</p>'}</div></details>`;}).join('');
 const tabButtons=tabs.map(t=>button(esc(t.name),'place-tab-select',t.id,t.id===current.id?'active':'')).join('');
 const binCount=f.locationTrash.filter(x=>Date.parse(x.expiresAt)>Date.now()).length;
 const query=locationSearch.trim().toLocaleLowerCase();
 const currentPlace=item=>areaLabel(item.areaId);
 const searchResults=query?f.locationEntries.filter(item=>{
  const moves=LOC.history(f,item.id),tabName=tabs.find(t=>t.id===item.tabId)?.name||'';
  return [item.name,tabName,currentPlace(item),...moves.flatMap(m=>[m.fromRoomName,m.fromAreaName,m.toRoomName,m.toAreaName])].some(value=>String(value||'').toLocaleLowerCase().includes(query));
 }).sort((a,b)=>a.name.localeCompare(b.name)):[];
 const resultRows=searchResults.map(item=>`<div class="place-search-result"><small class="place-search-location">${esc(tabs.find(t=>t.id===item.tabId)?.name||'Tab')} · ${esc(currentPlace(item))}</small>${itemCard(item)}</div>`).join('');
 return `<section class="place-page"><div class="row place-tabs">${tabButtons}${button('+ Tab','place-add-tab','','ghost')}${button('Tab options','place-tab-menu',current.id,'ghost')}</div><label class="place-search-label" for="place-search">Find an item</label><input id="place-search" class="place-search" type="search" value="${esc(locationSearch)}" placeholder="Item, tab, room or area" autocomplete="off"><div class="row place-top-actions">${button('+ Item','place-add-item','','primary')}${button(`Bin${binCount?' · '+binCount:''}`,'place-open-bin','','ghost')}${query?`<small>${searchResults.length} result${searchResults.length===1?'':'s'}</small>`:entries.length?`<small>${entries.length} item${entries.length===1?'':'s'}</small>`:''}</div>${query?(resultRows||'<p class="small place-empty">No matching locations.</p>'):(entries.length?'':`<p class="small place-empty">No items in ${esc(current.name)} yet.</p>`)}${query?'':roomRows||'<p>No rooms are available.</p>'}</section>`;
}
function managePage(){return `${button('Where Does This Live?','navigate','locations','wide')}${card(`<form id="add-room">${field('New room name','name','','text','required')}<button>Add room</button></form>`)}${rooms().map(r=>card(`<h2>${esc(r.name)}</h2><div class="row">${button('Open','room',r.id)}${button('Rename','rename-room',r.id,'ghost')}${button('First','room-first',r.id,'ghost')}${button('Archive','archive-room',r.id,'ghost')}${button('Areas','areas',r.id,'ghost')}</div>`)).join('')}${detail('Archived rooms',board.rooms.filter(r=>r.archived).map(r=>card(`${esc(r.name)} ${button('Restore','archive-room',r.id)}`)).join(''))}${detail('Reusable tasks',button('Add reusable task','new-template')+F().templates.filter(t=>!F().hiddenTemplates.includes(t.id)).map(t=>card(`<h3>${esc(t.title)}</h3><div class="row">${button('Add task','activate-template',t.id)}${button('Edit','edit-template',t.id,'ghost')}${button('Hide','hide-template',t.id,'ghost')}</div>`)).join('')+detail('Hidden saved tasks',F().templates.filter(t=>F().hiddenTemplates.includes(t.id)).map(t=>card(`${esc(t.title)} ${button('Restore','restore-template',t.id)}`)).join('')))}${detail('Common tools',`<form id="tools-form">${area('Tools — one per line','tools',F().tools.join('\n'))}<button>Save tools</button></form>`)}`;}
function settingsPage(){return `${window.TidySharing?.panel()||''}${card(`<form id="name-form">${field('Display name','name',F().displayName,'text','required')}<button>Save name</button></form>`)}${card(check('Sounds','sound',F().sound,'data-action="setting" data-id="sound"')+check('Simplified view','simple',F().simple,'data-action="setting" data-id="simple"')+check('Reduce character motion','reduceMotion',F().reduceMotion,'data-action="setting" data-id="reduceMotion"')+check('Pause wandering','pauseWandering',F().pauseWandering,'data-action="setting" data-id="pauseWandering"'))}${button('Backup & custom tasks','navigate','backup')}${detail('About this version','<p class="small">Tidy-ish stores tasks locally and can connect to household sync from Settings. Connection and cross-device delivery must be verified on your devices. Back up before importing another household. Occasional jobs are editable; the old full schedule wizard is not used.</p>')}`;}
function helpPage(){return [
['Tasks & Doing Now','Add tasks in a room or Doing Now. New tasks go first. Tick selection adds a task to Doing Now; unticking it keeps the task in its room and awards no points. Compact view keeps the essential controls together. Search filters the current list. First and Last change order. Drag a card to another card to place it before that task.'],
['Subtasks, completion & Undo','Tap a task name to show subtasks. + adds subtasks; enter one per line. Each subtask has its own timer and Edit controls. Completing a parent asks “Done em all”. Leaf subtasks award one point each; the parent awards no extra point. Undo reverses the completion and its points. Delete requires confirmation; Undo deleted restores it during this visit.'],
['Room mess meters','Room meters show cleanliness: full means spotless. Phrases come from the supplied mess-phrase.js. Task impact and unfinished leaf subtasks affect mess. Adjust mess level calibrates the room without completing or changing any tasks. Room names are already part of the Home artwork.'],
['Focus','Room Focus offers Clear the Way first or Skip to choose Quests from one room. Doing Now Focus chooses Quests already in Doing Now from any room. Focus never automatically adds Quests to Doing Now.'],
['Timers & music','Set minutes inside Tidy-ish and start a phone Clock alarm using your existing Automate connection on Android (or a configured Shortcut on iPhone). Connection values are local to this browser. A web request cannot confirm the alarm started, so verify it on your phone. The stopwatch remains available for measured task times. Browser countdown and music may stop if the browser sleeps.'],
['Laundry','Home, Laundry and Doing Now show the same saved loads. Put a load on starts washing. Put out or Dryer selects the transfer route. Done it! completes putting away. Undo last step affects only that load. Uniform starts weekly on Saturday. Choose darks or whites first; after both washes the second putting-away stage moves to normal laundry. Pausing preserves progress.'],
['Household sharing','Household data can synchronise when your account and household are connected. This updated build has only been tested with offline sync-adapter round trips, not two real devices or a live account. Export a backup before testing household changes.'],
['Backups & storage','Download backup exports the browser board without authentication tokens. Import previews a merge; existing matching identities are kept. Nothing is imported automatically. Use the same localhost address/port for the same browser storage. File-open mode supports local features, but sign-in needs an HTTP or HTTPS origin.'],
['Current stage','Calendar and Task Data have read-only views of your saved tasks and completions. Schedule preview reads existing repeats only and never imports preset tasks. Full Schedule Maker, appointments, errands, and native wandering are still unfinished.']].map(([title,text])=>card(detail(title,`<p>${esc(text)}</p>`))).join('');}
function backupPage(){return `${card(`<h2>Board backup</h2>${button('Download backup','export')}<label class="field">Preview Tidyish v1 backup (older formats need review)<input id="backup-file" type="file" accept="application/json,.json"></label><p class="small">Choose merge to add missing records, or full restore to replace this browser’s local board after a second confirmation. Restore does not write to a live household. Authentication is never exported.</p>`)}${card(`<h2>Custom tasks</h2>${button('Download CSV template','csv-template')}<label class="field">Preview CSV upload<input id="csv-file" type="file" accept="text/csv,.csv"></label>${detail('CSV instructions','<p class="small">Use title,room,sidequest,tools,notes columns. Match room name or ID; leave room blank for Homeless. Quote commas and newlines inside a value. Duplicates by title and room are skipped.</p>')}`)}`;}
function reviewBackup(text){
 if(!B)throw Error('Backup safety checker unavailable. Nothing was imported.');
 const merge=B.prepare(board,text,M),restore=B.prepareRestore(board,text,M);
 const choices=`<p>${esc(B.describe(merge.summary))}</p><fieldset class="backup-mode"><legend>Choose what to do</legend><label class="check"><input type="radio" name="backupMode" value="merge" checked> Merge missing records and keep current matching data</label><label class="check"><input type="radio" name="backupMode" value="restore"> Full restore and replace this browser’s local board</label></fieldset>`;
 dialog('Preview backup',choices,fd=>{
  if(fd.get('backupMode')==='restore'){
   confirmDialog('Replace this local board?',B.describeRestore(restore.summary),()=>{
    const current=localStorage.getItem(KEY)||'';if(current!==lastSaved)throw Error('This board changed since the preview. Choose the backup again; nothing was replaced.');
    if(storageError)throw Error('Browser storage is unavailable. The current board has been kept. '+storageError);
    const next=B.applyRestore(board,restore,M),serialized=TSC.encode(next);localStorage.setItem(KEY,serialized);lastSaved=serialized;board=next;route='home';roomId=board.rooms[0]?.id||'kitchen';tab='tasks';render();notice('Full restore saved in this browser. No live household was changed.');return true;
   },'Replace local board');
  }else confirmDialog('Confirm backup merge',B.describe(merge.summary),()=>change(b=>Object.assign(b,B.apply(b,merge,M))),'Import and merge');
 },{saveLabel:'Continue'});
}


// Read-only calendar and scheduling pages: the user's current saved tasks are the ONLY source.
// No generated agent presets, automatic board edits or hidden task imports.
function dayHeading(iso){return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
function plannedMonth(){
 const now=new Date(),month=new Date(now.getFullYear(),now.getMonth()+calendarOffset,1),from=[month.getFullYear(),String(month.getMonth()+1).padStart(2,'0'),'01'].join('-');
 const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
 const plan=OCAL.preview(board,from,days);
 return {month,from,days,plan};
}
function calendarToday(){return window.TidyActivityData?.today()||new Date().toLocaleDateString('sv-SE');}
function calendarPage(){
  if(!S)return card('Scheduling module unavailable. Current saved tasks are unchanged.');
  if(!activityReady())ensureActivity();
  const views=tabs([['plan','Plan'],['activity','Activity']],calendarView,'calendar-view','nested');
  if(calendarView==='activity')return `<section class="calendar-view">${views}${activityReady()?'<div id="tidyish-activity-calendar" aria-label="Your task activity diary"></div>':`<p class="error">${activityLoadError?esc(activityLoadError):'Loading Activity Calendar…'} ${activityLoadError?button('Retry','activity-retry','','ghost'):''}</p>`}<p class="activity-local-note">Activity notes sync with the household when sync is connected.</p></section>`;
  const {month,from,days,plan}=plannedMonth(),lookup=new Map(plan.days.map(d=>[d.date,d])),birthdayGifts=(board.features.gifts||[]).filter(g=>g.occasion==='birthday'&&/^\d{4}-\d{2}-\d{2}$/.test(g.eventDate||''));
  const today=calendarToday(),history=activityReady()?window.TidyActivityHost.monthSummary(board,from.slice(0,7)):{};
  const leading=(new Date(from+'T12:00:00').getDay()+6)%7;
  const cells=Array.from({length:leading},()=>'<span class="calendar-spacer" aria-hidden="true"></span>').join('')+
  Array.from({length:days},(_,i)=>{
   const day=S.addDays(from,i),past=day<today,activity=day<=today?history[day]:null;
   const entry=lookup.get(day),total=past?0:(entry?.items.length||0),kinds=new Set((entry?.items||[]).map(row=>{const task=board.tasks.find(t=>t.id===row.taskId);return !task?'':task.seasonMonth?'seasonal':task.occasionKind==='occasional'?'occasional':'';}));
   const birthdays=birthdayGifts.filter(g=>g.eventDate.slice(5)===day.slice(5)),birthdaySymbol=birthdays.length?`<span class="calendar-kind-symbol birthday" aria-label="Birthday: ${esc(birthdays.map(g=>g.recipient).join(', '))}" title="Birthday: ${esc(birthdays.map(g=>g.recipient).join(', '))}">🎂</span>`:'';
   const taskSymbols=`${kinds.has('occasional')?'<span class="calendar-kind-symbol" aria-label="Occasional task" title="Occasional task">✦</span>':''}${kinds.has('seasonal')?'<span class="calendar-kind-symbol seasonal" aria-label="Seasonal task" title="Seasonal task">🍂</span>':''}${birthdaySymbol}`;
   const symbol=activity?.symbol?`<span class="calendar-activity-symbol" aria-hidden="true">${esc(activity.symbol)}</span>`:'';
   const art=activity?.count&&!symbol?`<span class="calendar-activity-portrait ring-${esc(activity.ring)}"><img src="assets/activity-calendar/${esc(activity.art)}" alt="" loading="lazy"></span>`:'';
   const mark=past&&!activity?.marked?'<span class="calendar-empty-mark" aria-hidden="true">＋</span>':'';
   const description=(day===today?'Today':past?(activity?.count?`${activity.count} completed tasks`:(activity?.occasion||'Blank day; choose a personal symbol')):`${total} selected calendar tasks`)+(birthdays.length?`; birthday: ${birthdays.map(g=>g.recipient).join(', ')}`:'');
   return button(`<strong>${i+1}</strong>${symbol||art||mark}${taskSymbols}${activity?.count?`<span class="activity-count">${activity.count} done</span>`:''}${total?`<span class="count">${total} planned</span>`:''}`,'calendar-day',day,'calendar-day'+(day===today?' today':'')+(past?' calendar-past':''),`aria-label="${esc(dayHeading(day))}: ${esc(description)}"`);
  }).join('');
  const message=activityLoadError?`<p class="error">Activity portraits couldn't load: ${esc(activityLoadError)} ${button('Try again','activity-retry','','ghost')}</p>`:!activityReady()?'<p class="calendar-footnote">Loading past activity symbols…</p>':'';
  // An empty *current* month does not mean the household has no long-interval jobs.
  const occasionalJobs=(OCC?.tasks(board)||[]).filter(t=>t.calendarEnabled===true),nextJobs=occasionalJobs.filter(t=>t.nextDue).slice(0,5);
  const nextList=nextJobs.map(t=>`<div class="calendar-detail-row"><div class="grow"><strong>${esc(t.title)}</strong><div class="small">${esc(t.nextDue)} · ${esc(room(t.room)?.name||'Whole house')}</div></div></div>`).join('');
  const upcoming=card(`<div class="row spread"><h3>Occasional Essentials on calendar (${occasionalJobs.length})</h3><div class="row">${button('Choose occasional tasks','calendar-choose','','ghost')}${button('View / edit all','navigate','schedule','ghost')}</div></div>${nextList||'<p class="small">No selected occasional jobs yet. Use Choose occasional tasks or add your own Occasional Essentials.</p>'}<p class="small">Only selected occasional and seasonal tasks appear here. Existing task history remains unchanged.</p>`);
  return `<section class="calendar-view">${views}<div class="calendar-month-head">${button('‹','calendar-month-prev','','ghost','aria-label="Previous month"')}<h2>${esc(month.toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}</h2>${button('›','calendar-month-next','','ghost','aria-label="Next month"')}</div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(s=>`<strong class="calendar-heading">${s}</strong>`).join('')}${cells}</div><p class="calendar-footnote"><span>✦ Occasional</span> · <span>🍂 Seasonal</span> · <span>🎂 Birthday</span> · Select a past day to add an activity symbol.</p>${message}${upcoming}${button('🎁 Gift tracker','navigate','gifts','ghost wide')}</section>`;
}
function calendarChoose(){essentialsSetup();}
function calendarDay(iso){
  if(iso<calendarToday()){openActivityDate(iso);return;}
  const entry=plannedMonth().plan.days.find(d=>d.date===iso);
  const rows=entry?.items.map(t=>`<div class="calendar-detail-row"><div class="grow"><strong>${esc(t.title)}</strong><div class="small">${esc(room(t.room)?.name||'General')}${t.minutes!=null?' · '+esc(t.minutes)+' min':''}</div></div>${button('Skip this time','skip-date',t.taskId,'ghost',`data-date="${esc(t.due)}"`)}</div>`).join('')||'<p>No selected tasks planned on this date.</p>';
  const todayButton=iso===calendarToday()?`<div class="row">${button('View today’s completed activity','calendar-view-activity',iso,'ghost')}</div>`:'';
  dialog(dayHeading(iso),rows+todayButton);
}
// Stage 10C · Draft-only guided Schedule Maker, recovered from the earlier calendar reference.
// All steps operate only on wizardDraft. No board save, task creation or Apply path exists.
function wizardSections(){return [{id:'general',title:'General · Whole house',room:''},...rooms().map(r=>({id:r.id,title:r.name,room:r.id})),{id:'settings',title:'Planning settings'},{id:'review',title:'Calendar preview'}];}
function wizardTaskRow(t){
 const opt=wizardDraft.taskOptions[t.id];if(!opt)return '';
 const isPreset=t.source==='preset',isCustom=t.source==='custom';
 const label=isPreset?'Suggested · '+(t.presetMinutes||0)+' min base':isCustom?'Your custom task':W.recurring(t)?'Saved recurring task':'Saved one-off task';
 return `<div class="wizard-task ${opt.selected?'wizard-selected':''}"><label class="wizard-task-select"><input type="checkbox" data-maker-field="task-selected" data-id="${esc(t.id)}" ${opt.selected?'checked':''}><span><strong>${esc(t.title)}</strong><small>${esc(label)}</small></span></label>${opt.selected?`<details class="wizard-task-settings"><summary>Edit repeat, tools & time</summary>${isCustom?`<label class="field">Task name<input type="text" maxlength="180" data-maker-field="task-title" data-id="${esc(t.id)}" value="${esc(t.title)}"></label>`:''}<div class="columns"><label class="field">Repeat every<input type="number" min="1" max="3650" data-maker-field="task-count" data-id="${esc(t.id)}" value="${esc(opt.count)}"></label><label class="field">Unit<select data-maker-field="task-unit" data-id="${esc(t.id)}">${[['days','Days'],['weeks','Weeks'],['months','Months']].map(([id,label])=>`<option value="${id}" ${opt.unit===id?'selected':''}>${label}</option>`).join('')}</select></label></div><label class="field">Time estimate (minutes, optional)<input type="number" min="0" max="100000" step="1" data-maker-field="task-minutes" data-id="${esc(t.id)}" value="${esc(opt.minutes)}"></label><label class="field">Tools needed (one per line)<textarea data-maker-field="task-tools" data-id="${esc(t.id)}">${esc(opt.tools)}</textarea></label></details>`:''}${isCustom?`<div class="wizard-task-actions">${button('Remove custom task','wizard-remove-custom',t.id,'ghost')}</div>`:''}</div>`;
}
function wizardTaskRows(section){
 const existing=W.candidates(board).filter(t=>(t.room||'')===section.room);
 const suggestions=W.suggestions(board,section.room),custom=W.customFor(wizardDraft,section.room);
 const selected=suggestions.filter(t=>wizardDraft.taskOptions[t.id]?.selected);
 const featured=[...selected,...suggestions.filter(t=>!selected.includes(t)).slice(0,5)];
 const overflow=suggestions.filter(t=>!featured.includes(t));
 const suggested=`<div class="row spread wizard-section-head"><h3>Suggested cleaning tasks</h3><small>${suggestions.length} suggestions</small></div><p class="small">From your cleaning-routine reference. A few starters are ticked for preview only. Uncheck anything you don't want.</p><div class="wizard-quick-actions">${button('Add all suggestions','wizard-select-room','','ghost')}${button('Clear suggestions','wizard-clear-room','','ghost')}</div>${featured.map(wizardTaskRow).join('')}${overflow.length?`<details class="wizard-more"><summary>More suggestions (${overflow.length})</summary>${overflow.map(wizardTaskRow).join('')}</details>`:''}`;
 return `<section class="wizard-tasks">${existing.length?`<h3>Already saved in Tidyish</h3>${existing.map(wizardTaskRow).join('')}`:''}${suggested}<div class="wizard-custom-section"><h3>My custom tasks ${custom.length?'('+custom.length+')':''}</h3>${custom.map(wizardTaskRow).join('')}<details class="wizard-add-custom"><summary>+ Add Custom Task</summary><div data-wizard-custom-form class="wizard-custom-fields"><label class="field">Task name<input type="text" data-custom="title" maxlength="180" placeholder="e.g. Wipe the bannister"></label><div class="columns"><label class="field">Repeat every<input data-custom="count" type="number" min="1" max="3650" value="1"></label><label class="field">Unit<select data-custom="unit"><option value="weeks">Weeks</option><option value="days">Days</option><option value="months">Months</option></select></label></div><label class="field">Minutes (your estimate)<input data-custom="minutes" type="number" min="0" max="100000" value="10"></label><label class="field">Tools (optional)<textarea data-custom="tools" placeholder="One per line"></textarea></label>${button('Add to this room','wizard-add-custom','','primary')}</div></details><p class="small">Suggestions and custom tasks are saved only in this Schedule Maker draft, never automatically in your household tasks.</p></div></section>`;
}
function wizardPlanningSettings(){const d=wizardDraft;
 const weekdays=[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0]].map(([day,n])=>`<label class="wizard-day">${esc(day)}<input type="checkbox" data-maker-field="rest-day" data-day="${n}" ${d.restDays.includes(n)?'checked':''}></label>`).join('');
 return `<div class="wizard-settings"><label class="field">Schedule start date<input type="date" data-maker-field="start-date" value="${esc(d.from)}"></label><fieldset><legend>Rest days</legend><div class="wizard-days">${weekdays}</div></fieldset><label class="check"> <input type="checkbox" data-maker-field="one-room" ${d.oneRoomPerDay?'checked':''}> One room per day</label><label class="field">Schedule Maker planning capacity (minutes per day, optional)<input type="number" min="0" max="1440" step="1" data-maker-field="maker-minutes" value="${esc(d.makerMinutes)}" placeholder="No limit"></label><label class="field">Multiplier for preset times only<select data-maker-field="preset-multiplier">${[1,2,3].map(n=>`<option value="${n}" ${d.presetMultiplier===n?'selected':''}>${n===1?'Standard (×1)':'×'+n}</option>`).join('')}</select></label><p class="small">Your daily task cap is separate from this planning setting. User-entered task estimates are never multiplied or padded.</p></div>`;
}
function wizardCalendar(){
 const d=wizardDraft,from=d.from||M.date();if(!S.parseDay(from))return `<p class="error">Choose a valid start date in Planning settings.</p>`;
 const displayStart=S.addDays(from,-((S.weekday(from)+6)%7)+7*wizardWeek);
 const through=S.addDays(displayStart,27),requestedDays=Math.round((S.parseDay(through)-S.parseDay(from))/86400000)+1;
 const plan=W.preview(board,d,S,{from,days:Math.min(366,Math.max(28,requestedDays))});
 const byDay=new Map(plan.days.map(item=>[item.date,item]));
 const cells=Array.from({length:28},(_,i)=>{
  const date=S.addDays(displayStart,i),entries=byDay.get(date)?.items||[],rest=d.restDays.includes(S.weekday(date));
  const total=entries.reduce((n,t)=>n+(t.minutes||0),0);
  return `<div class="wizard-calendar-date ${rest?'rest':''}" aria-label="${esc(dayHeading(date))}: ${rest?'Rest day':entries.length+' scheduled task(s)'}"><strong>${esc(date.slice(8))}</strong>${rest?'<span class="wizard-leaf">✿</span><small>Rest day</small>':entries.length?`<span class="wizard-count">${entries.length}</span>${entries.slice(0,2).map(t=>`<small class="wizard-occurrence">${esc(room(t.room)?.name||'Whole house')} · ${esc(t.title)}</small>`).join('')}${entries.length>2?`<small>+${entries.length-2} more</small>`:''}<small>${total} min</small>`:'<small>Free</small>'}</div>`;
 }).join('');
 const chosen=W.chosen(d);
 return `<div class="wizard-review"><div class="wizard-review-stats"><strong>${chosen.length} tasks selected</strong><span>${plan.unplaced.length} occurrence${plan.unplaced.length===1?'':'s'} not placed in the planned range</span></div><div class="row spread"><h3>Four-week view</h3><div class="row">${button('‹ Weeks','wizard-week-prev','','ghost',wizardWeek===0?'disabled':'')}${button('Weeks ›','wizard-week-next','','ghost',wizardWeek>=44?'disabled':'')}</div></div><div class="wizard-calendar"><div class="wizard-calendar-weekdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<span>${x}</span>`).join('')}</div><div class="wizard-calendar-grid">${cells}</div></div><p class="small">${esc(dayHeading(displayStart))} to ${esc(dayHeading(through))}. The plan starts with the first due date roughly one repeat interval after your chosen start date. Rest days and time capacity move previews later; nothing is saved to the household calendar.</p><div class="wizard-review-list">${W.allCandidates(board,wizardDraft).filter(t=>chosen.includes(t.id)).map(t=>`<div><strong>${esc(t.title)}</strong> <small>${esc(room(t.room)?.name||'Whole house')} · every ${wizardDraft.taskOptions[t.id].count} ${esc(wizardDraft.taskOptions[t.id].unit)}</small></div>`).join('')}</div><p class="error">Preview only. This stage cannot apply, replace or delete a recurring task. Final confirmation, backup and Undo will be built separately.</p></div>`;
}
function wizardPage(){const sections=wizardSections(),total=sections.length;
 if(wizardStep<0){let saved=false;try{saved=!!localStorage.getItem(WIZARD_KEY)}catch{}
  return `<section class="wizard-home">${card(`<h2>Schedule Maker</h2><p class="small">General tasks first, then your rooms, planning settings and a calendar preview. Keep all choices as a draft until you deliberately apply a schedule in a future stage.</p><div class="wizard-actions">${button('Start a new draft','wizard-start','','wide')}${button('Use current schedule','wizard-current','','wide ghost')}${saved?button('Resume saved draft','wizard-resume','','wide ghost'):''}</div>`)}${detail('Quick preview (Stage 10A)',schedulePageOld())}</section>`;
 }
 const current=sections[wizardStep],review=current.id==='review',settings=current.id==='settings';
 const middle=review?wizardCalendar():settings?wizardPlanningSettings():wizardTaskRows(current);
 const actions=`<div class="wizard-footer">${button('Back','wizard-back','','ghost',wizardStep===0?'disabled':'')}${!settings&&!review?button('Skip','wizard-next','','ghost'):''}${!review?button('Next','wizard-next','','primary'):''}${button('Save & finish later','wizard-save','','ghost')}${button('Cancel','wizard-cancel','','ghost')}</div>`;
 return `<section class="schedule-wizard"><div class="wizard-progress" aria-label="Step ${wizardStep+1} of ${total}"><span>${wizardStep+1} / ${total}</span><div style="--wizard-progress:${Math.round((wizardStep+1)/total*100)}%"></div></div>${card(`<h2>${esc(current.title)}</h2>${middle}${actions}`)}</section>`;
}
function schedulePageOld(){

 if(!S?.makerCandidates||!S?.makerPreview)return card('Schedule preview is unavailable. No tasks have been changed.');
 const monday=new Date();monday.setHours(12,0,0,0);
 monday.setDate(monday.getDate()-((monday.getDay()+6)%7)+scheduleWeek*7);
 const from=[monday.getFullYear(),String(monday.getMonth()+1).padStart(2,'0'),String(monday.getDate()).padStart(2,'0')].join('-');
 const existing=S.makerCandidates(board), ids=scheduleSelected===null?existing.map(t=>t.id):existing.filter(t=>scheduleSelected.has(t.id)).map(t=>t.id);
 const minutes=schedulePreviewMinutes===''?0:Number(schedulePreviewMinutes);
 const plan=S.makerPreview(board,ids,{from,days:7,restDays:[...scheduleRestDays],oneRoomPerDay:scheduleOneRoom,dailyCapMinutes:minutes});
 const lookup=new Map(plan.days.map(day=>[day.date,day]));
 const days=Array.from({length:7},(_,i)=>{
  const date=S.addDays(from,i),entries=lookup.get(date)?.items||[],rest=scheduleRestDays.has(S.weekday(date));
  const total=entries.reduce((n,t)=>n+(t.minutes||0),0),unknown=entries.some(t=>t.minutes===null);
  return `<section class="schedule-day ${rest?'schedule-rest-day':''}"><header><strong>${esc(dayHeading(date))}</strong><small>${rest?'Rest day':entries.length?`${total} min${unknown?' + untimed':''}`:'Free'}</small></header>${entries.map(t=>`<div class="schedule-item"><strong>${esc(t.title)}</strong><span>${esc(room(t.room)?.name||'General')}${t.moved?' · moved from '+esc(dayHeading(t.due)):''}</span></div>`).join('')||`<span class="small schedule-quiet">${rest?'No automatically planned cleaning':'No planned tasks'}</span>`}</section>`;
 }).join('');
 const toggles=[['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6],['Sun',0]].map(([name,id])=>button(esc(name),'schedule-rest',String(id),scheduleRestDays.has(id)?'active':'ghost',`aria-pressed="${scheduleRestDays.has(id)}"`)).join('');
 const choices=existing.length?existing.map(t=>button(`${ids.includes(t.id)?'✓ ':''}${esc(t.title)} <span class="small">${esc(room(t.room)?.name||'General')}</span>`,'schedule-pick',t.id,ids.includes(t.id)?'active':'ghost',`aria-pressed="${ids.includes(t.id)}"`)).join(''):'<p class="empty">No recurring cleaning tasks are saved yet. Use Add Scheduled Task to create your own tasks.</p>';
 const controls=card(`<div class="row spread"><h2>Schedule maker · preview</h2>${button('Add scheduled task','schedule-add-task','','ghost')}</div><div class="schedule-preview-controls"><div class="row spread"><strong>Rest days</strong>${button('Clear','schedule-clear-rest','','ghost')}</div><div class="schedule-weekdays">${toggles}</div><div class="row spread schedule-setting"><span>One room per day</span>${button(scheduleOneRoom?'On':'Off','schedule-room-toggle','',scheduleOneRoom?'active':'ghost',`aria-pressed="${scheduleOneRoom}"`)}</div><label class="field">Planning capacity (minutes per day, optional)<input id="schedule-preview-minutes" type="number" min="1" max="1440" step="1" value="${esc(schedulePreviewMinutes)}" placeholder="No limit"></label><span class="small">This preview-only limit is separate from your daily task cap and task estimates. No settings are saved.</span></div>${detail('Choose saved recurring tasks',`<div class="schedule-choices"><div class="row">${button('Select all','schedule-pick-all','','ghost')}${button('Select none','schedule-pick-none','','ghost')}</div>${choices}</div>`)}`);
 return `<section class="schedule-view schedule-maker-preview">${controls}${card(`<div class="row spread"><h2>Weekly plan</h2><div class="row">${button('‹ Week','schedule-prev','','ghost')}${button('Week ›','schedule-next','','ghost')}</div></div><span class="small">${esc(dayHeading(from))} to ${esc(dayHeading(S.addDays(from,6)))} · preview only</span><div class="schedule-week-grid">${days}</div>${plan.unplaced.length?`<p class="small">${plan.unplaced.length} occurrence${plan.unplaced.length===1?'':'s'} could not fit in this week. None were deleted.</p>`:''}`)}<p class="small">Preview only. Opening or adjusting this planner does not create, edit or replace any task or recurring schedule. The guided Schedule Maker and explicit Apply step come later.</p></section>`;
}
function schedulePage(){
 const rows=OCC?.tasks(board)||[];
 const baseOptions='';
 const restoreChoice='';
 return `<section class="schedule-paused"><div class="row spread"><h2>Occasional &amp; Seasonal Tasks (${rows.length})</h2></div>${card(`<strong>The easy-to-forget jobs that keep things working.</strong><p class="small">Choose the occasional and seasonal tasks you actually need from your supplied list. Nothing is added automatically. Repeat intervals, rooms and dates are editable later.</p><div class="row">${button('Choose from your task list','essentials-setup','','primary')}${button('＋ Add my own','occasional-add','','ghost')}${baseOptions}</div><p class="small">The supplied list marks the tumble-dryer internal-filter clean as high priority every 3 months. Follow your appliance manual.</p>`) }
 ${rows.length?rows.map(t=>`<article class="card"><div class="row spread"><strong>${esc(t.title)}</strong><small>${esc(room(t.room)?.name||'Whole house')}</small></div><div class="small">${t.calendarEnabled===true?'On calendar':'Not on calendar'} · Next: ${esc(OCAL.settings(t).firstDue||'Date not set')} · ${esc(OCAL.settings(t).unit==='once'?'Once':`Every ${OCAL.settings(t).every} ${OCAL.settings(t).unit}`)}${t.seasonMonth?' · UK calendar month '+t.seasonMonth:''}</div><div class="row">${button('I did a thing!','occasional-done',t.id,'complete')}${t._occasionalUndo?button('Undo last','occasional-undo',t.id,'ghost'):''}${button(t.calendarEnabled===true?'Remove from calendar':'Add to calendar','occasional-toggle-calendar',t.id,'ghost')}${button('Edit','occasional-edit',t.id,'ghost')}${button('Delete','occasional-delete',t.id,'ghost')}</div></article>`).join(''):'<p>No Occasional Essentials saved yet. Choose from the catalogue or create your own.</p>'}${restoreChoice}</section>`;
}
function essentialsSetup(){
 if(!OCC)return notice('The task list did not load. Your saved jobs are unchanged.');
 const availableBase=(OCC?.OWNER_ROWS||[]).filter(x=>['Occasional','Seasonal'].includes(x.section)&&!board.tasks.some(t=>(t.occasionSourceId===x.id||t.id==='tidy-occasional:'+x.id)&&t.calendarEnabled===true));
 const baseGroups=[...new Set(availableBase.map(x=>x.category))].map(category=>`<details class="essentials-group"><summary>Task list · ${esc(category)} · ${availableBase.filter(x=>x.category===category).length} ideas</summary>${availableBase.filter(x=>x.category===category).map(x=>`<div class="essentials-option"><label class="check"><input type="checkbox" name="baseEssential" value="${esc(x.id)}" checked><strong>${esc(x.title)}</strong></label><p class="small">Every ${esc(x.repeatMonths||12)} months · ${esc(x.sourceFrequency||'')}</p></div>`).join('')}</details>`).join('');
 dialog('Choose from your task list',`<p class="small">Only tasks from your supplied list are shown. All available occasional and seasonal jobs start selected. Uncheck any you do not want on the calendar. Existing tasks and completion history are preserved.</p>${baseGroups}<p class="small">First dates are spread across the year. You can adjust the dates afterwards.</p>`,fd=>{
  const baseIds=fd.getAll('baseEssential');
  if(!baseIds.length)throw Error('Tick at least one job to add, or close without saving.');
  const preview=OCC.previewSelected(board,M,baseIds);
  const rows=preview.map(x=>`<li><strong>${esc(x.title)}</strong> · ${esc(x.frequency)} · First date: ${esc(x.firstDue)}${x.seasonal?' · Seasonal':''}${x.existing?' · Saved task, calendar enabled':''}</li>`).join('');
  dialog('Review your calendar changes',`<p>The following ${preview.length} task${preview.length===1?'':'s'} will be on your calendar. Nothing has been saved yet.</p><ul class="calendar-import-preview">${rows}</ul><p class="small">Existing completions and task details will stay unchanged.</p>`,()=>{
   if(change(b=>{const result=OCC.addSelected(b,M,baseIds);if(!result.added)throw Error('All selected jobs are already saved.');notice(result.added+' chosen task'+(result.added===1?'':'s')+' added to your calendar.');}))closeDialog(true);
  },{saveLabel:'Add these tasks'});
 },{saveLabel:'Preview selected dates'});
}

function occasionalEditor(existing=null){
 const t=existing||M.task({title:'',room:'',repeatMonths:3,seasonMonth:0,nextDue:M.plus(M.date(),30),occasionKind:'occasional'});
 dialog(existing?'Edit occasional job':'Add occasional job',field('Job','title',t.title,'text','required maxlength="300"')+select('Room','room',[['','Whole house'],...rooms().map(r=>[r.id,r.name])],t.room)+field('Repeat every (months)','repeatMonths',t.repeatMonths||3,'number','min="1" max="120" step="1"')+select('Seasonal UK month (optional)','seasonMonth',[['0','Nonseasonal'],...Array.from({length:12},(_,i)=>[String(i+1),new Date(2026,i,15).toLocaleString('en-GB',{month:'long'})])],t.seasonMonth||0)+field('Next due date','nextDue',t.nextDue||'','date')+field('Estimated minutes','estimate',t.estimate||0,'number','min="0" max="10000"')+field('Priority (1 highest)','priority',t.priority||3,'number','min="1" max="5"')+area('Tools','tools',t.tools||''),fd=>{
  const details={title:String(fd.get('title')||'').trim(),room:String(fd.get('room')||''),repeatMonths:Number(fd.get('repeatMonths')),seasonMonth:Number(fd.get('seasonMonth')),nextDue:String(fd.get('nextDue')||''),estimate:Number(fd.get('estimate')||0),priority:Number(fd.get('priority')||3),tools:String(fd.get('tools')||'')};OCC.validate(details);
  if(change(b=>{if(existing){const task=b.tasks.find(x=>x.id===existing.id);const changedDue=task.nextDue!==details.nextDue||Number(task.repeatMonths)!==details.repeatMonths;Object.assign(task,details);if(changedDue&&task.calendarSchedule){task.calendarSchedule={firstDue:details.nextDue,unit:'months',every:details.repeatMonths};}}else M.add(b,M.task({...details,occasionKind:'occasional',calendarEnabled:true,messImpact:'small'}));}))closeDialog(true);
 },{saveLabel:existing?'Save changes':'Add job'});
}
function dataTaskPanel(){
 const rootTask=task(dataTaskId),child=rootTask?.children.find(c=>c.id===dataTaskId),t=child||rootTask;if(!t)return `<p>Task unavailable.</p>${button('Back to Task Data','data-task-back','','ghost')}`;
 const d=window.TidyTaskData?.perQuest(board,t.id,TIME.ownerOf(board));if(!d)return '<p>History unavailable.</p>';
 const when=at=>at&&Number.isFinite(Date.parse(at))?dateLabel(at):'Date not recorded';
 const time=ms=>ms===null?'Unknown':TIME.format(ms);
 const grouped=(rows,type)=>rows.map(row=>`<div class="data-completion"><strong>${esc(row.period)} · ${row.count} ${type==='completion'?'completion':'attempt'}${row.count===1?'':'s'}${type==='completion'?` · ${row.points} point(s)`:''}</strong><span>${type==='attempt'?Object.entries(row.kinds).map(([kind,count])=>`${count} ${kind}`).join(' · ')+(row.excludedCount?` · ${row.excludedCount} excluded`:'')+(row.notedCount?` · ${row.notedCount} noted`:''):''}</span></div>`).join('');
 const cutoffDate=new Date();cutoffDate.setFullYear(cutoffDate.getFullYear()-1);const before=[cutoffDate.getFullYear(),String(cutoffDate.getMonth()+1).padStart(2,'0'),String(cutoffDate.getDate()).padStart(2,'0')].join('-');
 const memory=MEM?.status?.(board,t),days=memory?.daysSince;
 const checkDays=Number(t.checkDays)||0;
 const percent=memory?.lastDone?(checkDays>0&&days!==null?Math.max(0,Math.min(100,Math.round((1-days/checkDays)*100))):100):0;
 const perTaskMeter=`<section class="quest-memory-meter" aria-label="Quest completion and inspection status"><div class="row spread"><strong>Quest memory</strong><div class="row">${button('Clean Meter','data-meter-view','clean',dataMeterView==='clean'?'selected':'ghost')}${button('Since last done','data-meter-view','elapsed',dataMeterView==='elapsed'?'selected':'ghost')}</div></div>${dataMeterView==='clean'?`<div class="fancy-meter ${percent>=90?'clean':percent>=60?'lived':percent>=20?'messy':'chaos'}" role="meter" aria-label="Recorded completion freshness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span class="meter-fill" style="width:${percent}%"></span></div><p class="small">${!memory?.lastDone?'No completion has been recorded.':checkDays>0?'Based on the optional check interval, not a measurement of real cleanliness.':'Shows the last recorded completion only. This as-needed Quest has no automatic cleanliness estimate.'}</p>`:`<p><strong>${days===null?'Never recorded':days===0?'Completed today':days+' calendar day'+(days===1?'':'s')+' since last completion'}</strong></p><p class="small">${memory?.mode==='condition'?'Check the actual condition before deciding to clean.':esc(memory?.label||'As needed')}</p>`}</section>`;
 return `<section class="task-data-page">${button('‹ Task Data','data-task-back','','ghost')}<div class="row spread"><h2>${esc(t.title)}</h2>${button('Export this Quest history','data-export-quest',t.id,'ghost')}</div>${perTaskMeter}<div class="data-metrics">${card(`<strong>${d.count}</strong><span>Completions</span>`)}${card(`<strong>${d.lastDone?esc(when(d.lastDone)):'Unknown'}</strong><span>Most recent completion</span>`)}${card(`<strong>${time(d.fastestMs)}</strong><span>Fastest valid time (mine)</span>`)}${card(`<strong>${time(d.slowestMs)}</strong><span>Slowest valid time (mine)</span>`)}${card(`<strong>${time(d.averageMs)}</strong><span>Recent-weighted average (mine)</span>`)}</div>${card(`<h3>Recent completions</h3>${d.wins.slice(0,12).map(w=>`<div class="data-completion"><strong>${esc(w.title)}</strong><span>${esc(when(w.at))} · ${esc(w.person||'Unattributed')} · ${w.points||0} point(s)</span></div>`).join('')||'<p>No recorded completions yet.</p>'}${d.olderWinPeriods.length?`<h4>Older completion summaries</h4>${grouped(d.olderWinPeriods,'completion')}`:''}`)}${card(`<h3>Timed attempts · all household members</h3>${(d.visibleAttempts||[]).map(r=>`<div class="data-completion"><strong>${esc(time(r.durationMs))} · ${esc(r.kind)}${r.excludedFromLearning?' · Excluded from estimate':''}</strong><span>${esc(when(r.at))} · ${esc(r.owner||'Unattributed')}</span>${r.note?`<p>${esc(r.note)}</p>`:''}${r.kind==='valid'&&!r.excludedFromLearning?button('Exclude from estimate','data-exclude-time',r.id,'ghost'):''}</div>`).join('')||'<p>No timed attempts recorded.</p>'}${d.olderAttemptPeriods.length?`<h4>Older attempt summaries</h4>${grouped(d.olderAttemptPeriods,'attempt')}`:''}</div>`)}${card(`<h3>History storage</h3><p>Export older detail before removing it. The newest eight valid times per member and Quest, fastest and slowest valid times, noted attempts, latest completion, completion totals and points stay in the household record.</p><label class="field">Remove detail recorded before<input type="date" name="historyBeforeDate" value="${before}"></label>${button('Export old detail & review removal','data-archive-quest-history',t.id,'ghost')}`)}</section>`;
}
function dataPage(){
 if(dataTaskId)return dataTaskPanel();
 const viewTabs=tabs([['overview','Overview'],['rooms','Rooms'],['quests','Quests'],['focus','Focus & timers'],['occasional','Occasional/seasonal']],dataView,'data-view','nested');
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
 const metrics=`<div class="data-metrics">${card(`<strong>${d.count}</strong><span>Completions</span>`)}${card(`<strong>${d.points}</strong><span>Points</span>`)}${card(`<strong>${d.minutes}</strong><span>Minutes</span>`)}</div>`;
 const periodTabs=tabs([['7','7 days'],['30','30 days'],['90','90 days'],['all','All']],dataPeriod,'data-period','nested');
 const common=`${viewTabs}${periodTabs}`;
 if(dataView==='quests'){
  const rows=board.tasks.filter(t=>!t.side).map(t=>({t,d:window.TidyTaskData.perQuest(board,t.id,TIME.ownerOf(board))})).filter(x=>x.d).sort((a,b)=>b.d.count-a.d.count).map(({t,d})=>`<article class="data-completion"><strong>${esc(t.title)}</strong><span>${esc(room(t.room)?.name||'Whole house')} · ${d.count} completions · ${d.points} points · fastest ${d.fastestMs==null?'—':TIME.format(d.fastestMs)} · slowest ${d.slowestMs==null?'—':TIME.format(d.slowestMs)}</span>${button('Details','data-open-task',t.id,'ghost')}</article>`).join('')||'<p>No Quests yet.</p>';
  return `<section class="task-data-page">${common}${metrics}${card(`<h2>Quest statistics</h2>${rows}`)}</section>`;
 }
 if(dataView==='focus'){
  const attempts=board.features.questTimings||[],valid=attempts.filter(x=>TIME.valid(x)),noted=attempts.filter(x=>String(x.note||'').trim()),avg=valid.length?Math.round(valid.reduce((n,x)=>n+Number(x.durationMs),0)/valid.length):0;
  const rows=[...attempts].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,30).map(x=>`<div class="data-completion"><strong>${TIME.format(Number(x.durationMs)||0)} · ${esc(x.kind||'Focus')}</strong><span>${esc(x.title||x.taskTitle||'Quest')} · ${esc(x.person||String(x.owner||'Household').split('|member:').at(-1))} · ${x.excludedFromLearning?'Excluded from estimates':x.kind==='valid'?'Included in estimates':'Not used for estimates'}${x.note?` · “${esc(x.note)}”`:''}</span></div>`).join('')||'<p>No Focus attempts recorded.</p>';
  return `<section class="task-data-page">${common}<div class="data-metrics">${card(`<strong>${valid.length}</strong><span>Valid timed attempts</span>`)}${card(`<strong>${noted.length}</strong><span>Attempts with notes</span>`)}${card(`<strong>${avg?TIME.format(avg):'—'}</strong><span>Average duration</span>`)}</div>${card(`<h2>Focus & timer history</h2>${rows}`)}</section>`;
 }
 if(dataView==='occasional'){
  const jobs=(OCC?.tasks(board)||[]),selected=jobs.filter(t=>t.calendarEnabled===true),seasonal=selected.filter(t=>Number(t.seasonMonth)>0||t.section==='Seasonal'),today=M.date(),due=selected.filter(t=>t.nextDue&&t.nextDue<=today);
  const rows=selected.map(t=>`<div class="data-completion"><strong>${t.seasonMonth?'🍂 ':t.occasionKind==='occasional'?'✦ ':''}${esc(t.title)}</strong><span>${esc(t.nextDue||'No date')} · ${esc(room(t.room)?.name||'Whole house')} · every ${Number(t.repeatMonths)||12} months</span>${button('Edit','edit-occasional',t.id,'ghost')}</div>`).join('')||'<p>No occasional or seasonal jobs selected.</p>';
  return `<section class="task-data-page">${common}<div class="data-metrics">${card(`<strong>${selected.length}</strong><span>On calendar</span>`)}${card(`<strong>${seasonal.length}</strong><span>Seasonal</span>`)}${card(`<strong>${due.length}</strong><span>Due now</span>`)}</div>${card(`<h2>Occasional & seasonal</h2>${button('Choose tasks','calendar-choose','','ghost')}${rows}`)}${button('🎁 Gift tracker','navigate','gifts','ghost wide')}</section>`;
 }
 const roomSection=`${roomSelect}${card(`<h2>By room</h2>${byRoom}`)}`;
 return `<section class="task-data-page">${common}${metrics}${dataView==='rooms'?roomSection:`${card(`<h2>Last 7 days</h2>${trend}`)}${roomSection}${card(`<h2>Completion history</h2>${history}${d.wins.length>dataVisible?button('Show 12 more','data-more','','ghost'):''}${d.undated?`<p class="small">${d.undated} records without usable dates.</p>`:''}${d.archivedCount&&dataPeriod!=='all'?`<p class="small">${d.archivedCount} older completions are summarized in All history.</p>`:''}${d.archiveCount?`<p class="small">${d.archiveCount} legacy archived completions are retained in summaries.</p>`:''}`)}`}</section>`;
}
function giftTrackerPage(){
 const allGifts=board.features.gifts||[],people=board.features.giftPeople||[];
 const names=[...people.map(p=>({id:p.id,name:p.name})),...allGifts.map(g=>g.recipient).filter(Boolean).filter(name=>!people.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase())).map(name=>({id:'legacy:'+name,name}))];
 const tabsForPeople=[['all','All People'],...names.map(p=>[p.id,p.name])];
 if(!tabsForPeople.some(([id])=>id===giftPersonTab))giftPersonTab='all';
 const occasionGifts=allGifts.filter(g=>giftView==='all'||g.occasion===giftView).sort((a,b)=>String(a.eventDate||'').localeCompare(String(b.eventDate||'')));
 const isForPerson=(g,p)=>g.recipientId===p.id||(!g.recipientId&&g.recipient.toLocaleLowerCase()===p.name.toLocaleLowerCase());
 const selectedPerson=names.find(p=>p.id===giftPersonTab),shown=selectedPerson?occasionGifts.filter(g=>isForPerson(g,selectedPerson)):occasionGifts;
 const budget=shown.reduce((n,g)=>n+(Number(g.budget)||0),0),spent=shown.reduce((n,g)=>n+(Number(g.spent)||0),0);
 const giftRow=g=>`<article class="data-completion gift-row"><strong>${g.status==='wrapped'?'🎁':g.status==='bought'?'✓':'✦'} ${esc(g.title)}</strong><span>${esc(g.eventDate?new Date(g.eventDate+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Date not set')} · £${(Number(g.spent)||0).toFixed(2)} spent / £${(Number(g.budget)||0).toFixed(2)} budget</span><div class="row">${button(g.status==='bought'||g.status==='wrapped'?'☑ Bought':'☐ Bought','gift-bought-toggle',g.id,'ghost gift-bought-check','role="checkbox" aria-checked="'+(g.status==='bought'||g.status==='wrapped')+'"')}${button('Edit','gift-edit',g.id,'ghost')}${button('Delete','gift-delete',g.id,'ghost')}</div></article>`;
 const peopleList=names.map(person=>{const rows=occasionGifts.filter(g=>isForPerson(g,person)).map(giftRow).join('')||'<p class="small">No gifts on this occasion list.</p>';return card(`<div class="row spread"><h3>${esc(person.name)}</h3>${button('Open tracker ›','gift-person-view',person.id,'ghost')}</div>${rows}`)}).join('')||card(`<p>No people added yet.</p>${button('＋ Add people','gift-person-add','','primary')}`);
 const personRows=shown.map(giftRow).join('')||'<p>No gifts for this person yet.</p>';
 const addOccasion=giftView==='birthday'?'birthday':'christmas',add=button(addOccasion==='birthday'?'＋ Add birthday gift':'＋ Add gift','gift-add',addOccasion+'|'+(selectedPerson?.id||''),'primary');
 return `<section class="task-data-page gift-tracker">${tabs(tabsForPeople,giftPersonTab,'gift-person-view','nested')}${tabs([['christmas','Christmas'],['birthday','Birthdays'],['all','All occasions']],giftView,'gift-occasion','nested')}<div class="data-metrics">${card(`<strong>£${budget.toFixed(2)}</strong><span>Budget</span>`)}${card(`<strong>£${spent.toFixed(2)}</strong><span>Spent</span>`)}${card(`<strong>${shown.length}</strong><span>Gifts</span>`)}</div><div class="row spread"><h2>${selectedPerson?esc(selectedPerson.name):'All people'}</h2><div class="row">${button('＋ Add person','gift-person-add','','ghost')}${button('Manage people','gift-people-manage','','ghost')}${add}</div></div>${selectedPerson?card(personRows):peopleList}${giftView==='birthday'?card(`<strong>Add a birthday</strong><p class="small">Add the date in a gift entry to show 🎂 on the Calendar each year. For an annual planning reminder, add “Birthday planning — Name” in More → Occasional Essentials and set it to repeat every 12 months.</p>`):card('<p class="small">Check Bought as you shop. Add one entry per gift idea; names, budgets, spend and status sync with the household.</p>')}${button('Occasional & seasonal calendar','navigate','calendar','ghost wide')}</section>`;
}
function openGiftEditor(existing=null,occasion='christmas',personId=''){
 const picked=(board.features.giftPeople||[]).find(p=>p.id===personId);
 const g=existing||{occasion,recipient:picked?.name||'',recipientId:picked?.id||'',title:'',eventDate:occasion==='christmas'?`${new Date().getFullYear()}-12-25`:'',budget:0,spent:0,status:'idea',notes:''};
 const known=(board.features.giftPeople||[]).map(p=>p.name),suggestions=[...new Set([...known,...(existing?.recipient?[existing.recipient]:[])])].map(name=>`<option value="${esc(name)}"></option>`).join('');
 const recipient=`<label class="field">Recipient<input name="recipient" list="gift-recipient-options" value="${esc(g.recipient)}" required maxlength="100" autocomplete="off"><datalist id="gift-recipient-options">${suggestions}</datalist></label>`;
 const body=select('Occasion','occasion',[['christmas','Christmas'],['birthday','Birthday']],g.occasion)+recipient+field('Gift or idea','title',g.title,'text','required maxlength="160"')+field('Date','eventDate',g.eventDate,'date','required')+field('Budget (£)','budget',g.budget,'number','min="0" step="0.01"')+field('Spent (£)','spent',g.spent,'number','min="0" step="0.01"')+select('Status','status',[['idea','Idea'],['bought','Bought'],['wrapped','Wrapped']],g.status)+area('Notes','notes',g.notes||'');
 dialog(existing?'Edit gift':'Add gift',body,fd=>{const row={id:existing?.id||M.uid(),occasion:String(fd.get('occasion')),recipient:String(fd.get('recipient')||'').trim(),title:String(fd.get('title')||'').trim(),eventDate:String(fd.get('eventDate')||''),budget:Number(fd.get('budget')||0),spent:Number(fd.get('spent')||0),status:String(fd.get('status')),notes:String(fd.get('notes')||'').trim(),updatedAt:new Date().toISOString(),createdAt:existing?.createdAt||new Date().toISOString()};if(!row.recipient||!row.title||!/^\d{4}-\d{2}-\d{2}$/.test(row.eventDate)||![row.budget,row.spent].every(n=>Number.isFinite(n)&&n>=0))throw Error('Enter a recipient, gift, date and valid amounts.');if(change(b=>{if(existing){const i=b.features.gifts.findIndex(x=>x.id===existing.id);if(i<0)throw Error('Gift no longer exists.');b.features.gifts[i]=row;}else b.features.gifts.push(row);let person=b.features.giftPeople.find(p=>p.id===g.recipientId&&p.name.toLocaleLowerCase()===row.recipient.toLocaleLowerCase())||b.features.giftPeople.find(p=>p.name.toLocaleLowerCase()===row.recipient.toLocaleLowerCase());if(!person){person={id:M.uid(),name:row.recipient};b.features.giftPeople.push(person)}row.recipientId=person.id;}))closeDialog(true);},{saveLabel:existing?'Save gift':'Add gift'});
}
function giftPeopleDialog(){
 const rows=(board.features.giftPeople||[]).map(p=>`<div class="data-completion"><strong>${esc(p.name)}</strong><div class="row">${button('Rename','gift-person-edit',p.id,'ghost')}</div></div>`).join('')||'<p>No people added yet.</p>';
 dialog('Gift tracker people',`${button('＋ Add person','gift-person-add','','primary')}${rows}<p class="small">Names sync with the household. Existing gifts stay in their person’s tracker when a name is changed.</p>`);
}
function giftPersonEditor(existing=null){
 dialog(existing?'Rename person':'Add person',field('Name','name',existing?.name||'','text','required maxlength="100"'),fd=>{const name=String(fd.get('name')||'').trim();if(!name)throw Error('Enter a name.');if((board.features.giftPeople||[]).some(p=>p.id!==existing?.id&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('That person is already in the list.');if(change(b=>{const row=b.features.giftPeople.find(p=>p.id===existing?.id);if(existing&&row){row.name=name;for(const gift of b.features.gifts)if(gift.recipientId===row.id)gift.recipient=name;}else if(!existing)b.features.giftPeople.push({id:M.uid(),name})}))closeDialog(true);},{saveLabel:existing?'Save name':'Add person'});
}
function morePage(){return [['gifts','Gift tracker'],['library','Quest Library'],['schedule','Occasional Essentials'],['manage','Manage home'],['laundry','Laundry'],['laundry-settings','Laundry setup & editing'],['backup','Backup & custom tasks'],['settings','Settings & household'],['help','Help']].map(([id,label])=>card(button(esc(label)+' ›','navigate',id,'wide ghost'))).join('');}
function questLibraryPage(){
 if(!L)return card('Quest Library cannot load. Existing Quests and their history have not changed.');
 const opts={query:libraryQuery,room:libraryRoom,kind:libraryKind,priority:libraryPriority,tag:libraryTag};
 const results=L.catalogue(board,opts),tags=L.availableTags(board),current=results.filter(x=>x.kind==='task'),saved=results.filter(x=>x.kind==='template'),offered=results.filter(x=>x.kind==='suggestion');
 const typeLabels={task:'Existing Quest',template:'Saved reusable Quest',suggestion:'Optional idea'};
 const questRow=t=>`<article class="quest-lib-row"><div class="quest-lib-copy"><strong>${esc(t.title)}</strong><div class="small">${esc(t.roomName)} · ${typeLabels[t.kind]} · Priority ${Number(t.priority)||3}${t.checkDays?` · Review after ${Number(t.checkDays)} days`:' · As needed'}${t.done?' · Completed':''}</div>${t.tags?.length?`<p class="quest-lib-tags">${t.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</p>`:''}</div><div class="quest-lib-actions">${t.kind==='task'?(t.done?button('Do again','library-reactivate',t.id,'primary'):button('Open room','library-open-room',t.room,'ghost'))+button('Settings','library-edit-task',t.id,'ghost'):t.kind==='template'?button('Add to room','activate-template',t.id,'primary')+button('Edit','edit-template',t.id,'ghost'):button('Add Quest','library-add-suggestion',t.id,'primary')}</div></article>`;
 const group=(label,items,isOpen)=>items.length?`<details class="quest-lib-group" ${isOpen?'open':''}><summary>${esc(label)} (${items.length})</summary><div class="quest-lib-list">${items.map(questRow).join('')}</div></details>`:'';
 return `<section class="quest-library">${card(`<h2>Quest Library</h2><p>Find your existing Quests, reuse saved tasks, or choose an optional idea. Suggestions are <strong>never added automatically</strong>.</p><label class="field">Search Quests<input id="quest-library-query" type="search" autocomplete="off" placeholder="Try toilet, loo, hoover…" value="${esc(libraryQuery)}"></label><div class="quest-lib-filters">${select('Room','libraryRoom',[['all','All rooms'],...rooms().map(r=>[r.id,r.name])],libraryRoom)}${select('Show','libraryKind',[['all','All types'],['task','Your Quests'],['template','Saved tasks'],['suggestion','Optional ideas']],libraryKind)}${select('Priority','libraryPriority',[['all','All priorities'],...[1,2,3,4,5].map(x=>[String(x),String(x)])],libraryPriority)}${select('Tag','libraryTag',[['','All tags'],...tags.map(t=>[t,t])],libraryTag)}</div><div class="row">${button('＋ Make new Quest','add-task','','primary')}${button('Manage reusable Quests','navigate','manage','ghost')}</div>`)}<p class="small" role="status">${results.length} matching Quest${results.length===1?'':'s'}</p>${results.length?group('Your Quests',current,true)+group('Saved reusable Quests',saved,!current.length)+group('Ideas to add (opt-in)',offered,!current.length&&!saved.length):'<p class="empty">No matching Quest. Try another word, tag, or room.</p>'}</section>`;
}
const headerBounds={'Tidy-ish.png':[126,425],'cat-trays-header.png':[44,505],'entrance-header.png':[126,448],'living-header(1).png':[29,598],'bathroom-header.png':[109,437],'storage-header.png':[26,609],'bedroom-cat-header.png':[63,529],'bedroom-bigfoot-header.png':[7,641],'3d-printer-header.png':[75,507],'kitchen-header.png':[88,480]};
function compactHeader(path,label){const key=path.split('/').at(-1),[top,height]=headerBounds[key]||[0,656];return `<svg class="brand-logo" viewBox="0 ${top} 1280 ${height}" role="img" aria-label="${esc(label)}" style="width:${1280/height*44}px"><image href="${asset(path)}" width="1280" height="656"/></svg>`;}
function render(){const y=window.scrollY;window.TidyActivityHost?.unmount();document.body.classList.toggle('reduce-motion',F().reduceMotion);const title={gifts:'Gift tracker',doing:'Doing Now',side:'Side quests',laundry:'Laundry','laundry-settings':'Laundry setup & editing',manage:'Manage home',schedule:'Occasional Essentials',focus:'Room Focus',clearway:'Clear the Way','doing-focus':'Doing Now Focus',library:'Quest Library',locations:'Where Does This Live?',data:'Task Data',calendar:'Calendar',settings:'Settings',help:'Help',backup:'Backup & custom tasks',more:'More'}[route]||'';const r=['room','focus','clearway'].includes(route)?room(roomId):null;const header=r?.header?`headers/${r.header}`:'headers/Tidy-ish.png';let content=route==='gifts'?giftTrackerPage():route==='home'?home():route==='room'?roomPage():route==='doing'?doingPage():route==='side'?sidePage():route==='calendar'?calendarPage():route==='data'?dataPage():route==='schedule'?schedulePage():route==='grind'?dailyGrindPage():route==='focus'||route==='clearway'||route==='doing-focus'?(Q?Q.content(board):'<p>Quest Focus unavailable</p>'):route==='laundry'?laundryPage():route==='laundry-settings'?laundryPage(true):route==='manage'?managePage():route==='locations'?locationBookPage():route==='library'?questLibraryPage():route==='settings'?settingsPage():route==='help'?helpPage():route==='backup'?backupPage():route==='more'?morePage():morePage();app.innerHTML=`${route==='home'?globals(true):`<header class="top"><div class="brand">${compactHeader(header,r?'Tidy-ish · '+r.name:'Tidy-ish')}${globals()}</div><div class="top-page-line">${button('‹ Back','nav-back','','page-back', 'aria-label="Go back"')}${title?`<h1>${title}</h1>`:''}</div></header>`}<main class="${route==='home'?'home-main':''}">${storageError?`<p class="error">Saved data could not be opened. It has been preserved: ${esc(storageError)}</p>`:''}${content}</main>${footer()}`;// If the optional picture is unavailable, keep six visible, usable text tabs.
// Simplified SVG icons require no image-loading fallback.
if(route==='calendar'&&calendarView==='activity'&&!storageError)window.TidyActivityHost?.mount(document.getElementById('tidyish-activity-calendar'),board,activityDiary=>change(b=>{b.features.activityDiary=activityDiary;}));window.scrollTo(0,y);lastLaundryAttention=F().laundry.some(l=>M.laundryNeedsAttention(l));updateClocks();}
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
 const t=M.clone(original||M.task({room:['room','focus','clearway','doing-focus'].includes(route)?roomId:rooms()[0]?.id||'',doing:route==='doing',side:route==='side'||route==='room'&&tab==='side',sideKind:sideTab==='all'?'organisation':sideTab}));
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
 const more=detail('More options',area('Tools — one per line','tools',t.tools)+field('Custom tool (optional)','customTool','')+check('Add to Tools List','saveCustomTool')+(commonTools?detail('Common Tools',`<div class="compact-tools">${commonTools}</div>`):'')+area('Notes','notes',t.notes)+`<div class="columns">${field('Estimate (minutes)','estimate',t.estimate,'number','min="0" max="100000"')}${field('Priority (1 highest, 5 lowest)','priority',t.priority,'number','min="1" max="5"')}</div>`+field('Physical effort','effort',t.effort)+field('Check interval (days; 0 = as needed)','checkDays',Number(t.checkDays)||0,'number','min="0" max="3650" step="1"')+select('How to suggest','conditionMode', [['as-needed','As needed'],['check','Reminder to check'],['condition','Inspect condition before doing']],t.conditionMode||'as-needed')+`<div class="memory-suggestion-setting">${check('Show in “What should I do?” suggestions','showInSuggestions',t.showInSuggestions!==false)}<p class="small">Shared with everyone in this household.</p></div><div class="columns">${field('Priority ranking weight','rankPriorityWeight',t.rankPriorityWeight??1,'number','min="0" max="10" step="0.25"')}${field('Last-done ranking weight','rankRecencyWeight',t.rankRecencyWeight??1,'number','min="0" max="10" step="0.25"')}${field('Mess ranking weight','rankMessWeight',t.rankMessWeight??1,'number','min="0" max="10" step="0.25"')}</div>`+area('Search tags (comma or line separated)','tags',(Array.isArray(t.tags)?t.tags:[]).join(', '))+select('Task type','taskType',[['cleaning','Cleaning'],['organising','Organising'],['maintenance','Maintenance'],['other','Other'],...(!['cleaning','organising','maintenance','other'].includes(t.taskType)?[[t.taskType,t.taskType]]:[])],t.taskType||'cleaning')+field('Due date (optional)','dueDate',t.dueDate,'date')+select('Mess impact','messImpact',['none','tiny','small','normal','big'].map(x=>[x,x]),t.messImpact)+assigneeField(t)+field('Area','area',t.area)+select('Sidequest tab','sideKind',sideChoices().filter(([id])=>id!=='all'),t.sideKind)+`<label class="field">Attach image<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label>${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Current attachment">${check('Remove image','removeImage')}`:''}${M.repeat(t)?'<p class="small">Existing repeat rules are preserved. Schedule editing will follow later.</p>':''}`);
 dialog(heading,core,async(fd)=>{
  const names=String(fd.get('children')||'').split('\n').map(x=>x.trim()).filter(Boolean),remaining=[...t.children];
  const updated=names.map((name,i)=>{const old=remaining.find(c=>c.title===name)||t.children[i]&&remaining.includes(t.children[i])&&!names.includes(t.children[i].title)&&t.children[i];if(old)remaining.splice(remaining.indexOf(old),1);return old?{...old,title:name}:M.child({title:name});});
  const ids=new Set(updated.map(c=>c.id));updated.forEach(c=>{if(c.parentId&&!ids.has(c.parentId))c.parentId=''});
  let image=fd.get('removeImage')?'':t.image;const file=fd.get('image');
  if(file?.size){if(file.size>2*1024*1024)throw Error('Choose an image smaller than 2 MB.');if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP or GIF image.');image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Image could not be read.'));reader.readAsDataURL(file);});}
  const assignedUserId=String(fd.get('assignedUserId')||''),assigned=window.TidySharing?.people()?.find(p=>p.id===assignedUserId)?.name||(fd.has('assigned')?String(fd.get('assigned')||''):assignedUserId===t.assignedUserId?t.assigned:'');
  const customTool=String(fd.get('customTool')||'').trim();
  if(fd.has('saveCustomTool')&&!customTool)throw Error('Enter a custom tool before adding it to your Tools List.');
  const checkDays=Number(fd.get('checkDays')||0);if(!Number.isInteger(checkDays)||checkDays<0||checkDays>3650)throw Error('Check interval must be a whole number from 0 to 3650.');
  const tags=[...new Set(String(fd.get('tags')||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean))].slice(0,30);
  const weights=['rankPriorityWeight','rankRecencyWeight','rankMessWeight'].map(k=>Number(fd.get(k)??1));if(weights.some(w=>!Number.isFinite(w)||w<0||w>10))throw Error('Ranking weights must be from 0 to 10.');
  const saved={...t,checkDays,conditionMode:String(fd.get('conditionMode')||'as-needed'),showInSuggestions:fd.has('showInSuggestions'),rankPriorityWeight:weights[0],rankRecencyWeight:weights[1],rankMessWeight:weights[2],tags,taskType:String(fd.get('taskType')||'cleaning'),title:String(fd.get('title')||'').trim(),room:String(fd.get('room')||''),doing:fd.has('doing'),attention:fd.has('attention'),side:fd.has('side'),children:updated,tools:[...new Set([...String(fd.get('tools')||'').split('\n'),...fd.getAll('tool'),customTool].map(x=>x.trim()).filter(Boolean))].join('\n'),notes:String(fd.get('notes')||''),estimate:Number(fd.get('estimate')),priority:Number(fd.get('priority')),effort:String(fd.get('effort')||''),dueDate:String(fd.get('dueDate')||''),messImpact:String(fd.get('messImpact')||''),assigned,assignedUserId,area:String(fd.get('area')||''),sideKind:String(fd.get('sideKind')||''),image,touched:t.touched||!!t.generatedFrom,wasParent:t.wasParent||updated.length>0};
  if(creating&&mode==='scheduled'){
   const raw=String(fd.get('repeatValue')||''),value=Number(raw),unit=String(fd.get('repeatUnit')||'');
   if(!/^\d+$/.test(raw)||!Number.isInteger(value)||value<1||value>3650||!['days','weeks','months'].includes(unit))throw Error('Choose a valid repeat interval.');
   const firstDue=String(fd.get('firstDue')||'');
   if(firstDue&&(!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)||!Number.isFinite(Date.parse(firstDue+'T12:00:00Z'))||new Date(firstDue+'T12:00:00Z').toISOString().slice(0,10)!==firstDue))throw Error('Enter a valid first due date.');
   saved.repeatDays=unit==='months'?0:value*(unit==='weeks'?7:1);
   saved.repeatMonths=unit==='months'?value:0;
   saved.nextDue=firstDue;saved.calendarEnabled=true;
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
function questEstimateMs(item){const minutes=Q?.estimate?.(item,board)??TIME.suggested(board,item);return Math.round(minutes*60000);}
function hasTimedAttempt(item){return TIME.hasAttempt(item);}
function timerDialog(t,cid=''){
 if(!t)return;const item=cid?t.children.find(c=>c.id===cid):t;if(!item)return;
 const estimateMs=Number(item.timerEstimateMs)||questEstimateMs(item),started=!!item.startedAt||!!item.elapsed;
 const state=started?TIME.status(M.time(item),estimateMs,item.alarmNextAtMs,item.alarmDismissed):null;
 const controls=item.done?'<p>This Quest is complete. Its timing history is preserved.</p>':started
  ?`${button(item.startedAt?'Pause':'Continue','task-clock-toggle',t.id,'',`data-child="${esc(cid)}"`)}${button('Finished?','task-clock-finish',t.id,'complete',`data-child="${esc(cid)}"`)}${button('Stop without saving','task-clock-stop',t.id,'ghost',`data-child="${esc(cid)}"`)}`
  :button('Start timer','task-clock-start',t.id,'complete',`data-child="${esc(cid)}"`);
 dialog('Quest Timer · '+item.title,`<section class="quest-time-panel" data-quest-timer-task="${esc(t.id)}" data-quest-timer-child="${esc(cid)}"><span class="small" data-quest-timer-label>${state?.overdue?'Extra time':started?'Time remaining':'Personal estimated task time'}</span><div class="timer-value" data-clock-task="${esc(t.id)}" data-clock-child="${esc(cid)}">${started?(state.overdue?'+':'')+TIME.format(state.shownMs):TIME.format(estimateMs)}</div><p class="small">Estimate: ${TIME.format(estimateMs)} · alarm after 5 minutes overtime.</p><div class="row">${controls}</div><div class="row" data-task-alarm-actions ${!state?.alarmDue?'hidden':''}>${button('Acknowledge alarm','task-alarm-ack',t.id,'ghost',`data-child="${esc(cid)}"`)}${button('Snooze 5 minutes','task-alarm-more',t.id,'ghost',`data-child="${esc(cid)}"`)}</div></section>`);
 if(window.TidyPhoneTimer?.addPhoneTimer)window.TidyPhoneTimer.addPhoneTimer(editor,editor.querySelector('#modal-form'));
 updateClocks();
}
function finishTimed(id,cid=''){
 const t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!t||!item||item.done)return;
 const elapsed=M.time(item);if(!hasTimedAttempt(item)){const done=()=>change(b=>cid?M.completeChild(b,id,cid,true):M.finish(b,id,true));if(!cid&&t.children.some(c=>!c.done))confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,done,'Done em all');else done();return;}
 const record=button('Yes, record this time','task-clock-commit',id,'complete',`data-child="${esc(cid)}" data-mode="valid"${elapsed>0?'':' disabled'}`);
 dialog('Finish Quest?',`<p>Did this timed attempt reflect how long you worked on <strong>${esc(item.title)}</strong>?</p><p class="timer-value">${TIME.format(elapsed)}</p>${elapsed>0?'':'<p class="small">No time has elapsed yet. Continue working, or complete without recording time.</p>'}<label class="field">Optional note<textarea id="quest-timer-note" rows="2" placeholder="Why was this attempt different?"></textarea></label><div class="quest-timer-choices">${record}${button('I got distracted','task-clock-commit',id,'ghost',`data-child="${esc(cid)}" data-mode="distracted"`)}${button('Complete without using this time','task-clock-commit',id,'ghost',`data-child="${esc(cid)}" data-mode="no-time"`)}${button('Continue Working','task-clock-continue',id,'ghost',`data-child="${esc(cid)}"`)}</div><p class="small">Only valid attempts update the personal estimate. Distracted and no-time attempts stay in history.</p>`);
}
function commitTimed(id,cid,kind,note){
 const current=task(id),item=cid?current?.children.find(c=>c.id===cid):current;if(!current||!item||!['valid','distracted','no-time'].includes(kind))return false;const elapsed=M.time(item);if(kind==='valid'&&!elapsed)return false;
 return change(b=>{const t=b.tasks.find(x=>x.id===id),target=cid?t.children.find(x=>x.id===cid):t,at=new Date().toISOString(),record={id:M.uid(),taskId:target.id,owner:TIME.ownerOf(b),kind,durationMs:elapsed,at,room:t.room,note:String(note||'').slice(0,500)},beforeWins=new Set(b.features.wins.map(w=>w.id));b.features.questTimings.push(record);target.elapsed=elapsed;target.startedAt=0;target.timerEstimateMs=0;target.alarmNextAtMs=0;target.alarmDismissed=true;if(cid)M.completeChild(b,id,cid,true);else M.finish(b,id,true);record.completionWinIds=b.features.wins.filter(w=>!beforeWins.has(w.id)).map(w=>w.id);});
}
const alarmSignals=new Set();
function updateClocks(){
 document.querySelectorAll('[data-quest-timer-task]').forEach(panel=>{const id=panel.dataset.questTimerTask,cid=panel.dataset.questTimerChild||'',t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!item)return;const estimateMs=Number(item.timerEstimateMs)||questEstimateMs(item),started=!!item.startedAt||!!item.elapsed,status=TIME.status(started?M.time(item):0,estimateMs,item.alarmNextAtMs,item.alarmDismissed),face=panel.querySelector('[data-clock-task]'),label=panel.querySelector('[data-quest-timer-label]'),actions=panel.querySelector('[data-task-alarm-actions]');if(face)face.textContent=(started&&status.overdue?'+':'')+TIME.format(started?status.shownMs:estimateMs);if(label)label.textContent=!started?'Personal estimated task time':status.overdue?'Extra time':'Time remaining';if(actions)actions.hidden=!status.alarmDue;});
 for(const t of board.tasks)for(const item of [t,...t.children]){if(!item.startedAt||!item.timerEstimateMs||item.alarmDismissed)continue;const status=TIME.status(M.time(item),item.timerEstimateMs,item.alarmNextAtMs,item.alarmDismissed);if(!status.alarmDue){alarmSignals.delete(item.id);continue;}if(alarmSignals.has(item.id))continue;alarmSignals.add(item.id);setTimeout(()=>alarmSignals.delete(item.id),TIME.REPEAT_MS);if(F().sound)beep();if(!editor.open||!editor.querySelector(`[data-quest-timer-task="${CSS.escape(t.id)}"]`))notice(`Timer finished: ${item.title}. Open its timer to acknowledge or snooze.`);}
 const cd=$('[data-countdown]');if(cd){const left=Math.max(0,Math.ceil(((F().countdownEndsAt||0)-Date.now())/1000));cd.textContent=F().countdownEndsAt?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Ready';if(F().countdownEndsAt&&left===0){change(b=>b.features.countdownEndsAt=0,{redraw:false});notice('Focus countdown finished');if(F().sound)beep();}}
}
function beep(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);gain.gain.value=.08;osc.frequency.value=660;osc.start();osc.stop(ctx.currentTime+.5);osc.onended=()=>ctx.close();}catch{}}
function focusTimer(){
 dialog('Focus timer & music',`${field('Minutes','minutes',10,'number','min="1" max="1440" step="1" required')}${detail('In-browser countdown (only while open)',`<div class="timer-value" data-countdown>Ready</div><div class="row">${button('Start countdown','countdown-start')}${button('Cancel countdown','countdown-stop','','ghost')}</div><p class="small">Browser suspension may delay this countdown. For an actual alarm use the phone timer above.</p>`)}${detail('Music',`${select('Track','track',['calm','dubstep','morning','steps','waltz'].map(x=>[x,x]),'calm')}<div class="row">${button('Play music','music-play')}${button('Stop music','music-stop','','ghost')}</div>`)}`);
 if(window.TidyPhoneTimer?.addPhoneTimer)window.TidyPhoneTimer.addPhoneTimer(editor,editor.querySelector('#modal-form'));
 updateClocks();
}
function focusToolsDialog(ids=[]){
 const selected=ids.map(id=>task(id)).filter(Boolean),owner=TIME.ownerOf(board),preferences=FTOOLS?.read(localStorage,owner)||{},sources=FTOOLS?.sources(selected)||[],rows=FTOOLS?.groups(selected,preferences)||[];
 const list=rows.map((x,i)=>`<label class="check quest-tool-item"><input type="checkbox" aria-label="Have ${esc(x.name)} ready"><span><strong>${esc(x.name)}</strong><small>For ${esc(x.quests.join(', '))}</small></span></label>`).join('');
 const edits=sources.map((x,i)=>`<details class="quest-tool-preference"><summary>Change ${esc(x.name)} for me</summary><label class="field">My preferred alternative<input type="text" maxlength="100" name="focusToolPreference${i}" value="${esc(preferences[x.key]||'')}" placeholder="Keep the saved supply"></label></details>`).join('');
 const save=sources.length&&FTOOLS?fd=>{const next=FTOOLS.update(preferences,sources,i=>fd.get('focusToolPreference'+i));FTOOLS.write(localStorage,owner,next);closeDialog(true);}:null;
 dialog('What I Need · optional',`<section class="quest-focus-tools">${list||'<p class="small">No supplies are listed for these Quests.</p>'}${edits}<div class="row">${button('Skip · continue Focus','close-dialog','','ghost')}</div></section>`,save,{saveLabel:'Save my preferences'});
}
function toolsDialog(id=''){const ts=route==='doing'?M.doing(board):visibleTasks(),tools=[...new Set(ts.filter(t=>!id||t.room===id).filter(t=>!t.done).flatMap(t=>[t.tools,...t.children.filter(c=>!c.done).map(c=>c.tools)]).flatMap(s=>s.split(/[\n,]/)).map(x=>x.trim()).filter(Boolean))];dialog(id?'Tools · '+(room(id)?.name||'Homeless'):'Tools needed',tools.length?tools.map(x=>check(x,'tool')).join(''):'<p>No tools listed for the selected tasks.</p>');}
/* Room Focus and Doing Now Focus are separate. Clear the Way is independent. */
function openQuestFocus(id=''){
 if(!Q){notice('Quest Focus has not loaded. Your tasks are unchanged.');return;}
 if(!id){dialog('Choose a room for Focus',rooms().map(r=>button(esc(r.name),'focus-room-choice',r.id,'wide')).join(''));return;}
 if(!room(id)){notice('Choose an existing room.');return;}
 navigate('focus',id);Q.enter(board,id,'focus');
}
function startRoomFocus(id=''){
 if(!Q){notice('Quest Focus has not loaded. Your tasks are unchanged.');return;}
 if(!id){dialog('Choose a room for Focus',rooms().map(r=>button(esc(r.name),'focus-room-choice',r.id,'wide')).join(''));return;}
 if(!room(id)){notice('Choose an existing room.');return;}
 dialog('Room Focus',`<p>Start with Clear the Way, or skip to choose Quests?</p><div class="quest-actions">${button('Clear the Way','focus-start-clearway',id,'primary')}${button('Skip','focus-skip-clearway',id,'ghost')}</div>`);
}
function clearUnfinished(roomId,allRooms=false){return CQ?.collectedTasks(board,roomId,allRooms)||board.tasks.filter(t=>(allRooms||t.room===roomId)&&!t.done&&!t.archived&&String(t.generatedFrom||'').startsWith('clear-way-session:'));}
function leaveCurrentFocus(){
 const current=Q?.get(),destination=current?.scope==='doing'?'doing':'room',found=current?.room||roomId,allRooms=current?.scope==='doing',remaining=clearUnfinished(found,allRooms),target=allRooms&&remaining[0]?.room||found,unfinished=current?.phase==='active'&&(current.startedIds||[]).some(id=>{const t=task(id);return t&&!t.done;});
 if(!remaining.length){if(unfinished){confirmDialog('Leave unfinished Focus?',`Your unfinished Focus will be saved so you can continue later.`,()=>navigate(destination,found),'Leave Focus');return;}navigate(destination,found);return;}
 const preview=remaining.slice(0,6).map(t=>`<li>${allRooms?`<strong>${esc(room(t.room)?.name||'Other room')}:</strong> `:''}${esc(t.title)}</li>`).join('');
 dialog(unfinished?'Leave Focus?':'Collected items to return',`${unfinished?'<p>Your unfinished Focus will be saved so you can continue later.</p>':''}<p>${remaining.length} active return or sorting Quest${remaining.length===1?'':'s'} remain outside Focus.</p><ul>${preview}</ul>${remaining.length>6?'<p>More remain on the Home sorting tile.</p>':''}<div class="row">${button('Return Now','clear-return-now',target,'primary')}${button('Return Later','clear-return-later',target,'ghost')}</div>`);
}
function openClearWay(id=''){
 if(!Q||!CQ){notice('Clear the Way is unavailable. Your Quests are unchanged.');return;}
 if(!id){dialog('Choose a room for Clear the Way',rooms().map(r=>button(esc(r.name),'clearway-room-choice',r.id,'wide')).join(''));return;}
 Q.enter(board,id,'clear');navigate('clearway',id);
}
const DOING_FOCUS_KEY=KEY+':doing-focus-v2:';
let doingFocusState={phase:'pick',ids:[]},doingFocusLoadedKey='';
// Same member identity rule as Room Focus, so users sharing one browser
// never inherit one another's Doing Now Focus selection.
function doingFocusKey(){
 return DOING_FOCUS_KEY+encodeURIComponent(String(F().browserSync?.account||'local')+'|member:'+String(F().displayName||'Me'));
}
function loadDoingFocus(){
 const nextKey=doingFocusKey();if(nextKey===doingFocusLoadedKey)return;
 let state={phase:'pick',ids:[]},saved='';
 try{saved=localStorage.getItem(nextKey)||'';
  if(saved){const entry=JSON.parse(saved);if(!entry||!Array.isArray(entry.ids)||!['pick','active'].includes(entry.phase))throw Error('Invalid saved Focus session');
   state={phase:entry.phase,ids:[...new Set(entry.ids.filter(id=>typeof id==='string'&&id.trim()))]};}
 }catch(e){notice('This member’s Doing Now Focus could not be restored. The saved session was preserved.');saved=null;}
 doingFocusLoadedKey=nextKey;doingFocusState=state;
}
function openDoingFocus(){if(!Q){notice('Focus is unavailable. Your tasks are unchanged.');return;}const anchor=room(roomId)?roomId:rooms()[0]?.id;if(!anchor){notice('Add a room before starting Focus.');return;}navigate('doing-focus',anchor);Q.enter(board,anchor,'focus','doing');}
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportBoard(){const copy=M.clone(board);delete copy.features.browserSync;delete copy.features.householdSync;delete copy.features.connectedHouse;delete copy.sharedSnapshot;download(`Tidy-ish-HTML-${M.date()}.json`,JSON.stringify(copy,null,2));}
function placeAreaOptions(){return F().locationAreas.map(a=>{const r=board.rooms.find(x=>x.id===a.roomId);return [a.id,`${r?.name||'Room'} · ${a.name}`]});}
function handlePlaceAction(el){
 const f=F(),id=el.dataset.id;
 switch(el.dataset.action){
 case 'place-tab-select':locationTabId=id;render();return true;
 case 'place-add-tab':dialog('Add tab',field('Tab name','name','','text','required maxlength="60"'),fd=>{const name=String(fd.get('name')||'').trim(),newId='place-tab-'+M.uid();if(change(b=>LOC.addTab(b.features,newId,name))){closeDialog(true);locationTabId=newId;render()}},{saveLabel:'Add tab'});return true;
 case 'place-tab-menu':{const t=f.locationTabs.find(x=>x.id===id);if(!t)return true;dialog('Tab options · '+t.name,button('Rename tab','place-rename-tab',id)+ (id==='household'?'':button('Delete tab','place-delete-tab',id,'ghost')));return true;}
 case 'place-rename-tab':{const t=f.locationTabs.find(x=>x.id===id);if(!t)return true;closeDialog(true);dialog('Rename tab',field('Tab name','name',t.name,'text','required maxlength="60"'),fd=>{const name=String(fd.get('name')||'').trim();if(change(b=>LOC.renameTab(b.features,id,name)))closeDialog(true)},{saveLabel:'Save name'});return true;}
 case 'place-delete-tab':{const count=f.locationEntries.filter(x=>x.tabId===id).length;confirmDialog('Delete tab?',count?`This sends ${count} item${count===1?'':'s'} to the Bin for 30 days, with location history preserved. The Household tab cannot be deleted.`:'The Household tab cannot be deleted.',()=>{const was=locationTabId;if(locationTabId===id)locationTabId='household';const ok=change(b=>LOC.removeTab(b.features,id,b.rooms));if(!ok)locationTabId=was;return ok;},'Delete tab');return true;}
 case 'place-add-area':{const r=board.rooms.find(x=>x.id===id);if(!r)return true;dialog('Add area · '+r.name,field('Area name','name','','text','required maxlength="60"'),fd=>{const name=String(fd.get('name')||'').trim();if(change(b=>LOC.addArea(b.features,b.rooms,'place-area-'+M.uid(),id,name)))closeDialog(true)},{saveLabel:'Add area'});return true;}
 case 'place-area-menu':{const a=f.locationAreas.find(x=>x.id===id);if(!a)return true;const r=board.rooms.find(x=>x.id===a.roomId);dialog('Area options · '+a.name,button('Rename area','place-rename-area',id)+button('Delete area','place-delete-area',id,'ghost')+`<p class="small">${esc(r?.name||'Room')}</p>`);return true;}
 case 'place-rename-area':{const a=f.locationAreas.find(x=>x.id===id);if(!a)return true;closeDialog(true);dialog('Rename area',field('Area name','name',a.name,'text','required maxlength="60"'),fd=>{const name=String(fd.get('name')||'').trim();if(change(b=>LOC.renameArea(b.features,id,name)))closeDialog(true)},{saveLabel:'Save name'});return true;}
 case 'place-delete-area':{const a=f.locationAreas.find(x=>x.id===id);if(!a)return true;const count=f.locationEntries.filter(x=>x.areaId===id).length;confirmDialog('Delete area?',count?`This sends ${count} item${count===1?'':'s'} to the Bin for 30 days. Their full location history is kept.`:'This area is empty.',()=>change(b=>LOC.removeArea(b.features,id,b.rooms)),'Delete area');return true;}
 case 'place-add-item':{const options=placeAreaOptions();if(!options.length){notice('Add a named area to a room first.');return true;}dialog('Add item',field('Item name','name','','text','required maxlength="180"')+select('Current location','areaId',options,options[0][0]),fd=>{const name=String(fd.get('name')||'').trim(),areaId=String(fd.get('areaId')||'');if(change(b=>LOC.addEntry(b.features,b.rooms,'place-item-'+M.uid(),{name,tabId:locationTabId,areaId})))closeDialog(true)},{saveLabel:'Save item'});return true;}
 case 'place-edit-item':{const item=f.locationEntries.find(x=>x.id===id);if(!item)return true;const areaOptions=placeAreaOptions(),tabOptions=f.locationTabs.map(t=>[t.id,t.name]);dialog('Edit item',field('Item name','name',item.name,'text','required maxlength="180"')+select('Tab','tabId',tabOptions,item.tabId)+select('Current location','areaId',areaOptions,item.areaId),fd=>{const values={name:String(fd.get('name')||'').trim(),tabId:String(fd.get('tabId')||''),areaId:String(fd.get('areaId')||'')};if(change(b=>LOC.editEntry(b.features,b.rooms,id,values,'place-move-'+M.uid())))closeDialog(true)},{saveLabel:'Save item'});return true;}
 case 'place-delete-item':{const item=f.locationEntries.find(x=>x.id===id);if(!item)return true;confirmDialog('Move item to Bin?',`This item and its location history can be restored for 30 days.`,()=>change(b=>LOC.trashEntry(b.features,b.rooms,id)),'Move to Bin');return true;}
 case 'place-open-bin':{const expired=LOC.expireTrash(M.clone(board).features,Date.now());if(expired)change(b=>LOC.expireTrash(b.features,Date.now()),{redraw:false});const rows=F().locationTrash.filter(x=>Date.parse(x.expiresAt)>Date.now()).map(x=>`<div class="row place-bin-row"><div class="grow"><strong>${esc(x.item.name)}</strong><small>From ${esc(x.fromRoomName)} · ${esc(x.fromAreaName)} · expires ${esc(new Date(x.expiresAt).toLocaleDateString('en-GB'))}</small></div>${button('Restore','place-restore-item',x.id,'ghost')}</div>`).join('');dialog('Bin · 30 days',rows||'<p class="small">No items in the Bin.</p>');return true;}
 case 'place-restore-item':{const removed=f.locationTrash.find(x=>x.id===id);if(!removed)return true;const areaOptions=placeAreaOptions();if(!areaOptions.length){notice('Add a named area before restoring this item.');return true;}const restoreTab=f.locationTabs.some(t=>t.id===removed.item.tabId)?removed.item.tabId:f.locationTabs[0]?.id;closeDialog(true);dialog('Restore '+removed.item.name,select('Tab','tabId',f.locationTabs.map(t=>[t.id,t.name]),restoreTab)+select('Restore to area','areaId',areaOptions,areaOptions[0][0]),fd=>{if(change(b=>LOC.restoreEntry(b.features,b.rooms,id,{tabId:String(fd.get('tabId')||''),areaId:String(fd.get('areaId')||'')},'place-restore-move-'+M.uid())))closeDialog(true)},{saveLabel:'Restore item'});return true;}
 default:return false;
 }
}
const actions={
 'open-grind':el=>{grindSection=el.dataset.id;navigate('grind');},
 'voice-capture':voiceCapture,
 'voice-listen':beginVoiceListening,
 'wizard-start':()=>{wizardDraft=W.defaultDraft(board,M.date());wizardStep=0;wizardWeek=0;render();},
 'wizard-current':()=>{wizardDraft=W.defaultDraft(board,M.date(),{starterSelected:false});for(const t of W.candidates(board))if(W.recurring(t))wizardDraft.taskOptions[t.id].selected=true;wizardStep=0;wizardWeek=0;render();},
 'wizard-resume':()=>{let data=null;try{data=JSON.parse(localStorage.getItem(WIZARD_KEY)||'null');}catch{}wizardDraft=W.loadDraft(data,board,M.date());wizardStep=0;wizardWeek=0;render();},
 'wizard-next':()=>{wizardStep=Math.min(wizardSections().length-1,wizardStep+1);wizardWeek=0;render();},
 'wizard-back':()=>{wizardStep=Math.max(0,wizardStep-1);wizardWeek=0;render();},
 'wizard-save':()=>{try{localStorage.setItem(WIZARD_KEY,JSON.stringify(wizardDraft));wizardStep=-1;render();notice('Draft saved on this device. Household tasks are unchanged.');}catch(e){notice('Could not save draft locally: '+e.message);}},
 'wizard-cancel':()=>{if(confirm('Exit this draft? Unsaved choices in this session will not be saved.')){wizardStep=-1;wizardDraft=null;render();}},
 'wizard-week-prev':()=>{wizardWeek=Math.max(0,wizardWeek-1);render()},
 'wizard-week-next':()=>{wizardWeek=Math.min(44,wizardWeek+1);render()},
 'wizard-select-room':()=>{const section=wizardSections()[wizardStep];if(!section?.room&&section?.id!=='general')return;for(const t of W.suggestions(board,section.room))wizardDraft.taskOptions[t.id].selected=true;render()},
 'wizard-clear-room':()=>{const section=wizardSections()[wizardStep];if(!section?.room&&section?.id!=='general')return;for(const t of W.suggestions(board,section.room))wizardDraft.taskOptions[t.id].selected=false;render()},
 'wizard-add-custom':()=>{const section=wizardSections()[wizardStep],form=document.querySelector('[data-wizard-custom-form]');if(!section||!form)return;const value=name=>form.querySelector('[data-custom="'+name+'"]')?.value||'';try{W.addCustom(wizardDraft,section.room,{title:value('title'),count:value('count'),unit:value('unit'),minutes:value('minutes'),tools:value('tools')});render();notice('Custom task added to your draft.');}catch(e){notice(e.message);}},
 'wizard-remove-custom':el=>{const task=wizardDraft?.customTasks.find(t=>t.id===el.dataset.id);if(task&&confirm('Remove "'+task.title+'" from this schedule draft?')){W.removeCustom(wizardDraft,task.id);render();}},

 'switch-home-utility':()=>{homeUtilityView=homeUtilityView==='sorting'?'floors':'sorting';render();},
 'clear-finish-return':el=>{const t=task(el.dataset.id);if(!t||!String(t.generatedFrom||'').startsWith('clear-way-session:'))return;confirmDialog('Put away collected items?',`Mark “${t.title}” complete? This records one genuine task completion.`,()=>change(b=>M.finish(b,t.id,true)),'Done');},
 'clear-categories':el=>{const t=task(el.dataset.id);if(!t||!String(t.generatedFrom||'').startsWith('clear-way-session:'))return;dialog('Name items placed near their homes',`<p class="small">One category per line. These appear as subtasks of the active room Quest.</p>${area('Categories','categories','')}`,fd=>{const names=[...new Set(String(fd.get('categories')||'').split('\n').map(x=>x.trim()).filter(Boolean))];if(!names.length)throw Error('Enter at least one category.');if(change(b=>{const selected=b.tasks.find(x=>x.id===t.id);for(const name of names){const title='Put away: '+name.slice(0,120);if(!selected.children.some(x=>x.title.toLowerCase()===title.toLowerCase()))selected.children.push(M.child({title}));}}))closeDialog(true);},{saveLabel:'Add categories'});},
 'floor-add':()=>dialog('Add repeatable floor Quest',field('Task name','title','Hoover floor','text','required maxlength="150"')+select('Room','room',rooms().map(r=>[r.id,r.name]),'living'),fd=>{const title=String(fd.get('title')||'').trim(),roomId=String(fd.get('room')||'');if(!title||!room(roomId))throw Error('Choose a room and task name.');if(change(b=>M.add(b,M.task({title,room:roomId,littleOften:true,taskType:'little-often',messImpact:'none'}))))closeDialog(true);},{saveLabel:'Add floor Quest'}),
 'clear-return-now':el=>{closeDialog(true);navigate('room',el.dataset.id);notice('Your collected-item Quests are active in this room.');},
 'clear-return-later':el=>{closeDialog(true);navigate('room',el.dataset.id);notice('Return and sorting Quests remain active for later.');},
 'nav-back':()=>back(),
 navigate:el=>navigate(el.dataset.id),room:el=>navigate('room',el.dataset.id),later:()=>notice('This feature will follow later.'),
 'calendar-month-prev':()=>{calendarOffset--;render()},'calendar-month-next':()=>{calendarOffset++;render()},
 'calendar-day':el=>calendarDay(el.dataset.id),'gift-person-view':el=>{giftPersonTab=el.dataset.id;render()},'gift-occasion':el=>{if(!['christmas','birthday','all'].includes(el.dataset.id))return;giftView=el.dataset.id;render()},'gift-bought-toggle':el=>{const gift=(board.features.gifts||[]).find(g=>g.id===el.dataset.id);if(gift)change(b=>{const target=b.features.gifts.find(g=>g.id===gift.id);target.status=target.status==='bought'?'idea':'bought';target.updatedAt=new Date().toISOString()})},'gift-add':el=>{const [occasion,personId='']=el.dataset.id.split('|');openGiftEditor(null,occasion,personId)},'gift-edit':el=>openGiftEditor((board.features.gifts||[]).find(g=>g.id===el.dataset.id)), 'gift-delete':el=>{const gift=(board.features.gifts||[]).find(g=>g.id===el.dataset.id);if(gift)confirmDialog('Delete gift?',`Remove ${gift.title} for ${gift.recipient}?`,()=>change(b=>b.features.gifts=b.features.gifts.filter(x=>x.id!==gift.id)),'Delete')},'gift-people-manage':giftPeopleDialog,'gift-person-add':()=>giftPersonEditor(),'gift-person-edit':el=>giftPersonEditor((board.features.giftPeople||[]).find(p=>p.id===el.dataset.id)),'gift-person-delete':el=>{const person=(board.features.giftPeople||[]).find(p=>p.id===el.dataset.id);if(person)confirmDialog('Remove person?',`Remove ${person.name} from the household name list? Existing gift records remain.`,()=>change(b=>b.features.giftPeople=b.features.giftPeople.filter(p=>p.id!==person.id)),'Remove')},
  'calendar-view-activity':el=>{closeDialog(true);openActivityDate(el.dataset.id)},
  'activity-retry':()=>{activityLoadAttempted=false;activityLoadError='';ensureActivity();render()},
 'skip-date':el=>{const date=el.dataset.date,id=el.dataset.id;if(!id||!date)return;const ok=change(b=>{const t=b.tasks.find(t=>t.id===id);if(t){t.skippedDates=[...new Set([...(t.skippedDates||[]),date])];}});if(ok){closeDialog(true);notice('Skipped only this date; the recurring task and history remain.');}},
 'schedule-prev':()=>{scheduleWeek--;render()},'schedule-next':()=>{scheduleWeek++;render()},
 'schedule-rest':el=>{const n=Number(el.dataset.id);if(scheduleRestDays.has(n))scheduleRestDays.delete(n);else scheduleRestDays.add(n);render()},
 'schedule-clear-rest':()=>{scheduleRestDays.clear();render()},
 'schedule-room-toggle':()=>{scheduleOneRoom=!scheduleOneRoom;render()},
 'schedule-pick':el=>{if(scheduleSelected===null)scheduleSelected=new Set(S.makerCandidates(board).map(t=>t.id));const id=el.dataset.id;if(scheduleSelected.has(id))scheduleSelected.delete(id);else scheduleSelected.add(id);render()},
 'schedule-pick-all':()=>{scheduleSelected=null;render()},
 'schedule-pick-none':()=>{scheduleSelected=new Set();render()},
 'schedule-add-task':()=>taskEditor(null,false,'scheduled'),
 'data-view':el=>{if(!['overview','rooms','quests','focus','occasional'].includes(el.dataset.id))return;dataView=el.dataset.id;render()},'calendar-view':el=>{if(!['plan','activity'].includes(el.dataset.id))return;calendarView=el.dataset.id;render()},'data-meter-view':el=>{if(!['clean','elapsed'].includes(el.dataset.id))return;dataMeterView=el.dataset.id;render()},
 'data-period':el=>{dataPeriod=el.dataset.id;dataVisible=12;render()},
 'data-more':()=>{dataVisible+=12;render()},
 extra:()=>dialog('Extra rooms',rooms().filter(r=>!positions[houseKey(r)]).map(r=>button(esc(r.name),'dialog-room',r.id,'wide')).join('')||'<p>No extra rooms</p>'),
 'all-rooms':()=>dialog('All rooms',rooms().map(r=>button(esc(r.name),'dialog-room',r.id,'wide')).join('')),
 'dialog-room':el=>{closeDialog(true);navigate('room',el.dataset.id)},'room-tab':el=>{tab=el.dataset.id;search='';render()},'doing-tab':el=>{doingTab=el.dataset.id;search='';render()},'side-tab':el=>{sideTab=el.dataset.id;render()},
 view:()=>{detailed=!detailed;render()},'set-doing-view':el=>{doingDetailed=el.dataset.id==='detailed';try{localStorage.setItem(DOING_VIEW_KEY,doingDetailed?'detailed':'compact')}catch{}render()},'task-menu':el=>{const t=task(el.dataset.id);if(!t)return;dialog('Task actions · '+t.title,`<div class="doing-menu-grid">${button('✎ Edit task','edit-task',t.id)}${button('＋ Add subtask','add-child',t.id)}${button(stopwatch+' Timer','timer',t.id)}${button('Task Data','data-open-task',t.id)}${button('Save reusable','save-template',t.id)}${button(t.paused?'Resume task':'Pause task','pause-task',t.id)}${button('Delete task','delete-task',t.id)}</div>${t.notes?`<p>${esc(t.notes).replace(/\n/g,'<br>')}</p>`:''}${t.tools?`<p class="small">Tools: ${esc(t.tools).replace(/\n/g,', ')}</p>`:''}${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Task attachment">`:''}`)},search:()=>{uiSearch=!uiSearch;if(!uiSearch)search='';render();$('#task-search')?.focus()},
 'add-task':()=>taskEditor(),'edit-task':el=>taskEditor(task(el.dataset.id)),expand:el=>{const id=el.dataset.id;openTasks.has(id)?openTasks.delete(id):openTasks.add(id);render()},
 'select-task':el=>change(b=>M.select(b,el.dataset.id,el.type==='checkbox'?el.checked:!task(el.dataset.id).doing)),
 complete:el=>{const t=task(el.dataset.id);if(!t)return;if(!t.done&&hasTimedAttempt(t)){finishTimed(t.id);return;}const complete=()=>change(b=>M.finish(b,t.id,!t.done));if(!t.done&&t.children.some(c=>!c.done)){openTasks.add(t.id);confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,complete,'Done em all');}else complete()},
 'child-complete':el=>{const t=task(el.dataset.id),c=t?.children.find(c=>c.id===el.dataset.child);if(!t||!c)return;if(!c.done&&hasTimedAttempt(c)){finishTimed(t.id,c.id);return;}const run=()=>change(b=>M.completeChild(b,t.id,c.id,!c.done));if(!c.done&&t.children.some(x=>x.parentId===c.id))confirmDialog('Done em all',`Complete all subtasks in ${c.title}?`,run,'Done em all');else run()},
 'add-child':el=>childEditor(task(el.dataset.id),null,el.dataset.child||''),'edit-child':el=>{const t=task(el.dataset.id);childEditor(t,t.children.find(c=>c.id===el.dataset.child))},
 first:el=>change(b=>M.move(b,el.dataset.id,'first',route==='doing'&&doingTab==='doing')),last:el=>change(b=>M.move(b,el.dataset.id,'last',route==='doing'&&doingTab==='doing')),
 'child-first':el=>childMove(el,true),'child-last':el=>childMove(el,false),
 'delete-task':el=>{const t=task(el.dataset.id);confirmDialog('Delete task?',`Remove “${t.title}” and its subtasks from this browser’s active list? Completion history is kept.`,()=>{const snapshot={task:M.clone(t),index:board.tasks.indexOf(t),order:M.clone(board.doingOrder),page:pageKey()};if(change(b=>{b.tasks=b.tasks.filter(x=>x.id!==t.id);b.doingOrder=b.doingOrder.filter(x=>x!==t.id)})){deleted=snapshot;render();return true;}return false;},'Delete')},
 'undo-delete':()=>{if(!deleted)return;const d=deleted;if(change(b=>{if(!b.tasks.some(t=>t.id===d.task.id)){b.tasks.splice(Math.min(d.index,b.tasks.length),0,d.task);if(d.task.doing)b.doingOrder=[...d.order.filter(id=>id===d.task.id||b.doingOrder.includes(id)),...b.doingOrder.filter(id=>!d.order.includes(id))];}})){deleted=null;render();}},
 choose:()=>dialog('Choose tasks',board.tasks.filter(t=>!t.done&&!M.paused(t)).map(t=>check(t.title,'task',t.doing,`value="${esc(t.id)}"`)).join('')||'<p>Add a task in a room or Doing Now first.</p>',fd=>{const ids=new Set(fd.getAll('task'));if(change(b=>b.tasks.filter(t=>!t.done).forEach(t=>M.select(b,t.id,ids.has(t.id)))))closeDialog(true)},{saveLabel:'Done'}),
 collapse:el=>{const id=el.dataset.id;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);render()},tools:el=>toolsDialog(el.dataset.id),focus:el=>startRoomFocus(el.dataset.id),'focus-room-choice':el=>startRoomFocus(el.dataset.id),'focus-start-clearway':el=>{closeDialog(true);openClearWay(el.dataset.id)},'focus-skip-clearway':el=>{closeDialog(true);openQuestFocus(el.dataset.id)},clearway:el=>openClearWay(el.dataset.id),'clearway-room-choice':el=>{closeDialog(true);openClearWay(el.dataset.id)},'doing-focus':openDoingFocus,'focus-timer':focusTimer,
 timer:el=>timerDialog(task(el.dataset.id),el.dataset.child),
 'task-clock-start':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);if(!item)return;alarmSignals.delete(item.id);timerChange(el,t=>{t.elapsed=0;t.timerEstimateMs=questEstimateMs(t);t.startedAt=Date.now();t.alarmDismissed=false;t.alarmNextAtMs=0;});timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-clock-toggle':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);if(!item)return;timerChange(el,t=>{if(t.startedAt){t.elapsed=M.time(t);t.startedAt=0;}else t.startedAt=Date.now();});timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-clock-stop':el=>confirmDialog('Stop and discard this attempt?','The Quest remains unfinished and this timer attempt will not affect its estimate.',()=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);if(!item)return false;alarmSignals.delete(item.id);const ok=timerChange(el,t=>{t.startedAt=0;t.elapsed=0;t.timerEstimateMs=0;t.alarmNextAtMs=0;t.alarmDismissed=true;});if(ok){closeDialog(true);notice('Timer discarded. Quest remains unfinished.');}return ok;},'Discard timer'),
 'task-clock-finish':el=>finishTimed(el.dataset.id,el.dataset.child||''),
 'task-clock-continue':el=>{closeDialog(true);timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-alarm-ack':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);timerChange(el,t=>{t.alarmDismissed=true;});if(item)alarmSignals.delete(item.id);timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-alarm-more':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);timerChange(el,t=>{t.alarmNextAtMs=M.time(t)+5*60000;t.alarmDismissed=false;});if(item)alarmSignals.delete(item.id);timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-clock-commit':el=>{const id=el.dataset.id,cid=el.dataset.child||'',kind=el.dataset.mode,note=editor.querySelector('#quest-timer-note')?.value||'',t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!t||!item)return;const save=()=>commitTimed(id,cid,kind,note);if(!cid&&t.children.some(c=>!c.done)){confirmDialog('Done em all',`Complete all subtasks in ${t.title}? The timer outcome will be saved.`,save,'Done em all');}else if(save())closeDialog(true);},
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
 'library-room':el=>{libraryRoom=el.dataset.id||'all';libraryQuery='';libraryKind='all';libraryPriority='all';libraryTag='';navigate('library');},
 'data-open-task':el=>{dataTaskId=el.dataset.child||el.dataset.id;dataView='quests';if(editor.open)closeDialog(true);if(route==='data')render();else navigate('data');},
 'data-task-back':()=>{dataTaskId='';render()},
 'data-export-quest':el=>{const id=el.dataset.id,rootTask=task(id)||board.tasks.find(x=>x.children.some(c=>c.id===id)),found=rootTask?.id===id?rootTask:rootTask?.children.find(c=>c.id===id);if(!rootTask||!found)throw Error('Quest no longer available. No export was created.');const rows=window.TidyTaskData?.perQuest(board,id,TIME.ownerOf(board));if(!rows)throw Error('Task Data is unavailable.');const safeTitle=String(found.title||'Quest').replace(/[^a-z0-9_-]+/gi,'-').slice(0,48).replace(/^-+|-+$/g,'')||'Quest';const backup={format:'tidyish-quest-history-v2',exportedAt:new Date().toISOString(),task:{id:found.id,room:rootTask.room,title:found.title},completed:rows.wins,attempts:rows.attempts,olderSummaries:rows.archives};download(`Tidyish-${safeTitle}-${M.date()}.json`,JSON.stringify(backup,null,2));},
 'data-pick-task':()=>dialog('Open Task Data',board.tasks.map(t=>button(esc(t.title),'data-open-task',t.id,'wide ghost')).join('')||'<p>No tasks available.</p>'),
 'data-exclude-time':el=>confirmDialog('Exclude this time from learning?', 'Its completion, points, original time and note will remain visible to every household member.',()=>change(b=>{const row=b.features.questTimings.find(r=>r.id===el.dataset.id);if(!row)throw Error('Attempt not found.');row.excludedFromLearning=true;}),'Exclude time'),
 'data-archive-quest-history':el=>{const id=el.dataset.id,cutoff=document.querySelector('[name="historyBeforeDate"]')?.value,TD=window.TidyTaskData;if(!TD)throw Error('Task Data is unavailable.');const plan=TD.planArchive(board,id,cutoff);if(!plan.removedWins.length&&!plan.removedAttempts.length){notice('No removable history exists before that date.');return;}const rootTask=task(id)||board.tasks.find(x=>x.children.some(c=>c.id===id)),subject=rootTask?.id===id?rootTask:rootTask?.children.find(c=>c.id===id),safeTitle=String(subject?.title||'Quest').replace(/[^a-z0-9_-]+/gi,'-').slice(0,48)||'Quest',backup={format:'tidyish-old-task-history-v1',exportedAt:new Date().toISOString(),task:{id,title:subject?.title||'',room:rootTask?.room||''},beforeDate:cutoff,completionRecords:plan.removedWins,attemptRecords:plan.removedAttempts};download(`Tidyish-${safeTitle}-history-before-${cutoff}.json`,JSON.stringify(backup,null,2));confirmDialog('Export started — remove old detail?',`${plan.removedWins.length} completion records and ${plan.removedAttempts.length} attempt records are in the export. Keep that file before continuing. The latest completion, newest eight valid times per member and Quest, fastest valid time, noted attempts, points and completion totals are preserved.`,()=>{let result;if(!change(b=>{result=TD.applyArchive(b,TD.planArchive(b,id,cutoff));}))return false;notice(`Old detail removed. ${result.winsRemoved} completions and ${result.attemptsRemoved} attempts were summarized; points and estimate basis were preserved.`);return true;},'Remove old detail');},
 'library-open-room':el=>navigate('room',el.dataset.id),
 'library-edit-task':el=>{const t=task(el.dataset.id);if(t)taskEditor(t);},
 'library-reactivate':el=>{const id=el.dataset.id,t=task(id);if(!t||!t.done)return;confirmDialog('Do this Quest again?',`Restart ${t.title}? Your previous completions and points will stay in Task Data.`,()=>change(b=>M.reactivate(b,id)),'Do again');},
 'calendar-choose':()=>calendarChoose(),
 'occasional-toggle-calendar':el=>change(b=>{const t=b.tasks.find(x=>x.id===el.dataset.id);if(t&&t.occasionKind==='occasional')t.calendarEnabled=t.calendarEnabled!==true;}),
 'occasional-seed':()=>confirmDialog('Add the default occasional jobs?', 'This adds missing longer-interval jobs from your Base Schedule to this household. Existing tasks and completion history stay intact. You can edit or delete any default. This will not re-add deleted defaults automatically.',()=>change(b=>{const result=OCC.seed(b,M,new Date(),true);notice(result.added+' occasional jobs added.')}),'Add defaults'),
 'occasional-restore':()=>confirmDialog('Restore missing Base Schedule jobs?', 'This WILL bring back default jobs you previously deleted if they are absent. It will not remove existing tasks or completion history. Continue only if you want those defaults restored.',()=>change(b=>{const result=OCC.seed(b,M,new Date(),true,true);notice(result.added+' missing default jobs restored.')}),'Restore defaults'),
 'essentials-setup':()=>essentialsSetup(),
 'occasional-add':()=>occasionalEditor(),
 'occasional-edit':el=>occasionalEditor(task(el.dataset.id)),
 'occasional-done':el=>confirmDialog('Complete this occasional job?', 'This records one point and starts the next interval from the real completion date.',()=>change(b=>OCC.complete(b,el.dataset.id,M)),'Complete'),
 'occasional-undo':el=>confirmDialog('Undo last occasional completion?', 'This removes only the most recent recorded win and restores the previous due date.',()=>change(b=>OCC.undo(b,el.dataset.id)),'Undo'),
 'occasional-delete':el=>confirmDialog('Delete occasional job?', 'The job will be removed, but its historical completion records and points remain.',()=>change(b=>{b.tasks=b.tasks.filter(t=>t.id!==el.dataset.id);b.doingOrder=b.doingOrder.filter(x=>x!==el.dataset.id)}),'Delete job'),
 'care-done':el=>change(b=>CARE.complete(b,el.dataset.id,M.uid)),
 'care-undo':el=>confirmDialog('Undo last care completion?','This removes only the most recent completion and its point.',()=>change(b=>CARE.undo(b,el.dataset.id)),'Undo last'),
 'quick-done':el=>change(b=>CARE.littleOften(b,el.dataset.id,M.uid)),
 'quick-undo':el=>confirmDialog('Undo last quick completion?','Only this task’s latest completion and point will be removed.',()=>change(b=>CARE.littleUndo(b,el.dataset.id)),'Undo last'),
 'quick-add':()=>dialog('Add Little & Often',field('Task name','title','','text','required maxlength="150"')+select('Room','room',[['','General'],...rooms().map(r=>[r.id,r.name])],''),fd=>{const title=String(fd.get('title')||'').trim();if(!title)throw Error('Enter a title.');if(change(b=>M.add(b,M.task({title,room:String(fd.get('room')||''),littleOften:true,taskType:'little-often',messImpact:'none'}))))closeDialog(true)},{saveLabel:'Add quick task'}),
 'recommend-focus':el=>{const t=task(el.dataset.id);if(!t||!REC.eligible(t,'',M.date(),board))return;if(t.done&&!change(b=>M.reactivate(b,t.id)))return;const target=t.room||rooms()[0]?.id;if(editor.open)closeDialog(true);openQuestFocus(target);const session=Q?.get?.();if(session?.phase==='pick'&&!session.startedIds?.length&&!session.questIds?.length)Q.pick?.(t.id);},
 'what-next-open':el=>openWhatNext(el.dataset.id||''),
 'recommend-doing':el=>change(b=>{const t=b.tasks.find(x=>x.id===el.dataset.id);if(!REC.eligible(t,'',M.date(),b))throw Error('Quest is not currently due.');if(t.done)M.reactivate(b,t.id);M.select(b,t.id,true)}),
 'recommend-options':el=>{const r=el.dataset.id;dialog('Suggested Quest limits',field('Time available (minutes; 0 for any)','minutes',30,'number','min="0" max="1440"')+field('Number of Quests (0 for any)','count',3,'number','min="0" max="100"'),fd=>{const rows=REC?.rank(board,{room:r,maxMinutes:Number(fd.get('minutes')),maxTasks:Number(fd.get('count'))})||[];closeDialog(true);dialog('Your suggested Quests',rows.map(row=>`<div class="new-next-row"><strong>${esc(row.task.title)}</strong><div class="row">${button('Focus','recommend-focus',row.id,'ghost')}${button('Doing Now','recommend-doing',row.id,'ghost')}</div></div>`).join('')||'<p>None fit this limit.</p>');},{saveLabel:'Show suggestions'});},
 'library-add-suggestion':el=>{const item=L?.suggestion(el.dataset.id);if(!item)return;confirmDialog('Add suggested Quest?',`Add ${item.title} to ${room(item.room)?.name||'this room'}? Suggestions are never imported without your confirmation.`,()=>change(b=>L.addSuggestion(b,item.id,M)),'Add Quest');},
 'save-template':el=>{const t=task(el.dataset.id);change(b=>{const saved=M.templateCopy(t,t.room);saved.templateId='';b.features.templates.unshift(saved)});notice('Reusable task saved')},
 'task-editor-tab':el=>{if(dialogDirty&&!confirm('Discard unsaved changes and switch tabs?'))return;taskEditor(null,false,el.dataset.id)},
 'new-template':()=>taskEditor(null,true),'edit-template':el=>taskEditor(F().templates.find(t=>t.id===el.dataset.id),true),
 'hide-template':el=>change(b=>b.features.hiddenTemplates.push(el.dataset.id)),'restore-template':el=>change(b=>b.features.hiddenTemplates=b.features.hiddenTemplates.filter(id=>id!==el.dataset.id)),
 'activate-template':el=>{const t=F().templates.find(t=>t.id===el.dataset.id);dialog('Add '+t.title,rooms().map(r=>check(r.name,'room',r.id===t.room,`value="${esc(r.id)}"`)).join('')+check('Add to Doing Now','doing'),fd=>{const rs=fd.getAll('room');if(!rs.length)throw Error('Choose a room.');if(change(b=>rs.forEach(id=>{const active=b.tasks.find(x=>x.templateId===t.id&&x.room===id);if(active){if(active.done)M.reactivate(b,active.id);if(fd.has('doing'))M.select(b,active.id,true)}else M.add(b,M.templateCopy(t,id,fd.has('doing')))})))closeDialog(true)},{saveLabel:'Add to selected rooms'})},
 'pause-task':el=>{const t=task(el.dataset.id);if(t.paused){change(b=>b.tasks.find(x=>x.id===t.id).paused=false);return;}dialog('Pause task',field('Days to pause (blank until resumed)','days','','number','min="1" max="3650"'),fd=>{const n=String(fd.get('days'));if(change(b=>{const t=b.tasks.find(x=>x.id===el.dataset.id);t.paused=true;t.pauseUntil=n?M.plus(M.date(),Number(n)):''}))closeDialog(true)},{saveLabel:'Pause'})},
 'new-side-tab':()=>dialog('New sidequest tab',field('Tab name','name','','text','required'),fd=>{const name=String(fd.get('name')).trim();if(!name)throw Error('Enter a name.');if(change(b=>b.features.sideTabs.push({id:M.uid(),name})))closeDialog(true)}),
 'homeless-remove':el=>confirmDialog('Remove item?','Remove this item from the room’s homeless list?',()=>change(b=>b.features.items=b.features.items.filter(i=>i.id!==el.dataset.id)),'Remove'),
 export:exportBoard,'csv-template':()=>download('Tidy-ish-custom-tasks.csv','title,room,sidequest,tools,notes\n"Example task","Kitchen",false,"Cloth",""\n','text/csv'),
 'close-dialog':()=>closeDialog()
};
function childMove(el,first){change(b=>{const t=b.tasks.find(t=>t.id===el.dataset.id),c=t.children.find(c=>c.id===el.dataset.child),family=new Set([c.id]);for(let i=0;i<t.children.length;i++)t.children.forEach(x=>{if(family.has(x.parentId))family.add(x.id)});const block=t.children.filter(x=>family.has(x.id)),rest=t.children.filter(x=>!family.has(x.id));let target=first?rest.findIndex(x=>x.parentId===c.parentId):rest.findLastIndex(x=>x.parentId===c.parentId)+1;if(target<0)target=rest.length;rest.splice(target,0,...block);t.children=rest;});}
function timerChange(el,edit){const result=change(b=>{const t=b.tasks.find(t=>t.id===el.dataset.id),item=el.dataset.child?t.children.find(c=>c.id===el.dataset.child):t;edit(item)},{redraw:false});updateClocks();return result;}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;if(el.dataset.action.startsWith('v2-')&&Z?.handle(el))return;if(el.dataset.action.startsWith('quest-')&&Q?.handle(el))return;if(el.dataset.action.startsWith('place-')&&handlePlaceAction(el))return;const action=actions[el.dataset.action]||window.TidySharing?.actions?.[el.dataset.action];if(!action)return;try{await action(el);}catch(err){notice(err.message)}});
let placeGesture=null;
document.addEventListener('pointerdown',e=>{const grip=e.target.closest('[data-place-drag]');if(route!=='locations'||!grip||e.button!==0)return;const card=grip.closest('[data-place-entry]');if(!card)return;const g={pointer:e.pointerId,id:card.dataset.placeEntry,grip,card,x:e.clientX,y:e.clientY,armed:false,drop:'',hold:null};placeGesture=g;if(e.pointerType==='touch'||e.pointerType==='pen')g.hold=setTimeout(()=>{if(placeGesture!==g)return;g.armed=true;g.card.classList.add('place-dragging');document.body.classList.add('place-dragging');try{g.grip.setPointerCapture(e.pointerId)}catch{}},260);});
document.addEventListener('pointermove',e=>{const g=placeGesture;if(!g||g.pointer!==e.pointerId)return;const distance=Math.hypot(e.clientX-g.x,e.clientY-g.y);if(!g.armed&&e.pointerType==='mouse'&&distance>6){g.armed=true;g.card.classList.add('place-dragging');document.body.classList.add('place-dragging')}else if(!g.armed&&distance>10){clearTimeout(g.hold);placeGesture=null;return;}if(!g.armed)return;e.preventDefault();document.querySelectorAll('.place-drop-target').forEach(x=>x.classList.remove('place-drop-target'));const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-place-drop]');if(target&&target.dataset.placeDrop!==fLocationArea(g.id)){g.drop=target.dataset.placeDrop;target.classList.add('place-drop-target')}else g.drop='';});
function fLocationArea(id){return F().locationEntries.find(x=>x.id===id)?.areaId||'';}
document.addEventListener('pointerup',e=>{const g=placeGesture;if(!g||g.pointer!==e.pointerId)return;clearTimeout(g.hold);const target=g.drop;g.card.classList.remove('place-dragging');document.body.classList.remove('place-dragging');document.querySelectorAll('.place-drop-target').forEach(x=>x.classList.remove('place-drop-target'));placeGesture=null;if(target)change(b=>LOC.moveEntry(b.features,b.rooms,g.id,target,'place-move-'+M.uid()));});
document.addEventListener('pointercancel',e=>{if(!placeGesture||placeGesture.pointer!==e.pointerId)return;clearTimeout(placeGesture.hold);placeGesture.card.classList.remove('place-dragging');document.body.classList.remove('place-dragging');document.querySelectorAll('.place-drop-target').forEach(x=>x.classList.remove('place-drop-target'));placeGesture=null;});
document.addEventListener('submit',async e=>{if(e.target.id==='modal-form'||e.target.closest('.tac'))return;e.preventDefault();const fd=new FormData(e.target);try{switch(e.target.id){case 'laundry-config':{const values=Object.fromEntries(fd);if(['wash','railTransfer','dryerTransfer','railFinish','dryerFinish'].some(k=>!values[k].trim()))throw Error('Enter a name for every step.');const steps=values.uniformSteps.split('\n').map(s=>s.trim()).filter(Boolean);if(!steps.length)throw Error('Keep at least one uniform step.');change(b=>{const f=b.features,current=f.uniformSteps[f.uniformIndex];Object.assign(f,values,{uniformSteps:steps});if(f.uniformIndex>=0)f.uniformIndex=Math.max(0,steps.indexOf(current))});notice('Cycle saved; load progress kept');break;}
case 'oneoff-form':if(fd.get('title').trim())change(b=>b.features.items.unshift({id:M.uid(),kind:'laundry',text:fd.get('title').trim(),done:false}));break;
case 'homeless-form':if(fd.get('title').trim())change(b=>b.features.items.unshift({id:M.uid(),kind:'homeless',text:fd.get('title').trim(),location:roomId}));break;
case 'add-room':{const name=String(fd.get('name')).trim();if(!name||board.rooms.some(r=>r.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a unique room name.');change(b=>b.rooms.push({id:M.uid(),name,art:'hall-background.png',header:null,mess:0,capacity:14,calibration:'',archived:false}));break;}
case 'name-form':change(b=>b.features.displayName=String(fd.get('name')).trim());notice('Name saved');break;
case 'tools-form':change(b=>b.features.tools=[...new Set(String(fd.get('tools')).split('\n').map(s=>s.trim()).filter(Boolean))]);notice('Tools saved');break;
default:await window.TidySharing?.submit?.(e.target,fd);}}catch(err){notice(err.message)}});
let librarySearchTimer;document.addEventListener('input',e=>{if(e.target.id==='quest-library-query'){libraryQuery=e.target.value;const cursor=e.target.selectionStart;clearTimeout(librarySearchTimer);librarySearchTimer=setTimeout(()=>{if(route!=='library')return;render();const input=$('#quest-library-query');input?.focus();try{input?.setSelectionRange(cursor,cursor)}catch{}},180);}});
let locationSearchTimer;document.addEventListener('input',e=>{if(e.target.id==='place-search'){locationSearch=e.target.value;const cursor=e.target.selectionStart;clearTimeout(locationSearchTimer);locationSearchTimer=setTimeout(()=>{if(route!=='locations')return;render();const input=$('#place-search');input?.focus();try{input?.setSelectionRange(cursor,cursor)}catch{}},160);}});
document.addEventListener('change',e=>{const key=e.target.name;if(route!=='library'||!['libraryRoom','libraryKind','libraryPriority','libraryTag'].includes(key))return;({libraryRoom:v=>libraryRoom=v,libraryKind:v=>libraryKind=v,libraryPriority:v=>libraryPriority=v,libraryTag:v=>libraryTag=v})[key](e.target.value);render();});
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
// Stage 10G: subtasks can be moved between siblings OR lifted back to a root task.
// A subtask's ID and all of its descendants survive. No changes to wins/history.
function liftChildToRoot(b,rootId,childId,targetId,after,view){
 const root=b.tasks.find(t=>t.id===rootId),target=b.tasks.find(t=>t.id===targetId);
 const child=root?.children?.find(c=>c.id===childId);
 if(!root||!target||!child||child.done||root.done||root.paused||target.done||target.paused||M.repeat(root)||M.repeat(target))throw Error('Only active, non-recurring subtasks can be moved out.');
 if(targetId!==rootId&&!D.canMove(b,rootId,targetId,view))throw Error('Keep subtasks in their current room and section.');
 const family=new Set([childId]);
 for(let i=0;i<root.children.length;i++)for(const c of root.children)if(family.has(c.parentId))family.add(c.id);
 const branch=root.children.filter(c=>family.has(c.id));
 const descendants=branch.filter(c=>c.id!==childId).map(c=>({...c,parentId:c.parentId===childId?'':c.parentId}));
 const promoted=M.task({...child,id:child.id,room:root.room,side:root.side,sideKind:root.sideKind,
  attention:root.attention,doing:root.doing,children:descendants,wasParent:descendants.length>0,
  repeatDays:0,repeatMonths:0,repeatWeekdays:[],repeatRestDays:[],nextDue:'',dueDate:'',paused:false});
 // Reject an ID collision before writing any part of the draft board.
 if(b.tasks.some(t=>t.id===promoted.id))throw Error('This subtask already exists as a task. Nothing moved.');
 const anchor=b.tasks.indexOf(target),insert=anchor+(after?1:0);
 if(anchor<0)throw Error('Destination no longer exists.');
 root.children=root.children.filter(c=>!family.has(c.id));
 root.wasParent=true;
 b.tasks.splice(insert,0,promoted);
 if(promoted.doing){
  b.doingOrder=b.doingOrder.filter(id=>id!==promoted.id);
  const prefer=b.doingOrder.indexOf(targetId),fallback=b.doingOrder.indexOf(rootId);
  const at=prefer>=0?prefer:fallback;
  b.doingOrder.splice(at<0?b.doingOrder.length:at+(after?1:0),0,promoted.id);
 }
 return promoted.id;
}
let childGesture=null,childHover=null,childPendingTimer=0;
function clearChildOver(){document.querySelectorAll('.child.drag-over').forEach(x=>x.classList.remove('drag-over'));}
function resetChildGesture(){
 clearTimeout(childPendingTimer);childPendingTimer=0;
 const g=childGesture;childGesture=null;
 g?.ghost?.remove();g?.row?.classList.remove('child-lifted');
 if(g?.armed)document.body.classList.remove('task-dragging');
 childHover=null;clearChildOver();hideRootInsertionLine();
}
function childTargetAt(g,x,y){
 const underneath=document.elementFromPoint(x,y);
 const row=underneath?.closest?.('[data-child-id]');
 if(row&&row.dataset.rootId===g.root&&row.dataset.parentId===g.parent&&row.dataset.childId!==g.child){
  return {kind:'sibling',id:row.dataset.childId};
 }
 // Only the edge of a card or the actual gap can lift a subtask to top-level.
 // Do not accidentally promote when dragging across sibling rows or task buttons.
 const cards=[...document.querySelectorAll('.task[data-task-id]')].filter(card=>{
  const id=card.dataset.taskId,rect=card.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0)return false;
  return (id===g.root||D.canMove(board,g.root,id,g.view))&&board.tasks.some(t=>t.id===id&&!t.done&&!t.paused&&!M.repeat(t));
 });
 const near=cards.map(card=>{
  const rect=card.getBoundingClientRect(),distance=Math.max(0,rect.top-y,y-rect.bottom);
  return {card,rect,distance};
 }).filter(o=>x>=o.rect.left-24&&x<=o.rect.right+24&&o.distance<=64)
 .sort((a,b)=>a.distance-b.distance)[0];
 if(!near)return null;
 const {card,rect}=near,edge=Math.min(26,rect.height*.2);
 if(y>rect.top+edge&&y<rect.bottom-edge)return null;
 return {kind:'root',id:card.dataset.taskId,after:y>=(rect.top+rect.bottom)/2,card};
}
function moveChildPreview(g,x,y){
 const next=childTargetAt(g,x,y);childHover=next;
 clearChildOver();hideRootInsertionLine();
 if(next?.kind==='sibling')document.querySelector(`[data-child-id="${CSS.escape(next.id)}"]`)?.classList.add('drag-over');
 if(next?.kind==='root')setRootInsertionLine(next.card,next.after?'after':'before');
 if(g.ghost){g.ghost.style.left=Math.max(8,Math.min(innerWidth-200,x+12))+'px';g.ghost.style.top=Math.max(5,Math.min(innerHeight-45,y-32))+'px';}
}
function armChildDrag(g){
 if(childGesture!==g||g.armed)return;
 g.armed=true;g.row.classList.add('child-lifted');document.body.classList.add('task-dragging');
 g.ghost=document.createElement('div');g.ghost.className='task-drag-ghost';g.ghost.textContent=g.title;
 document.body.appendChild(g.ghost);moveChildPreview(g,g.x,g.y);
}
document.addEventListener('dragstart',e=>{if(e.target.closest('.child,.child-grip,.task'))e.preventDefault();});
document.addEventListener('pointerdown',e=>{
 if(!rootDragPage()||editor.open||childGesture||e.button>0)return;
 const row=e.target.closest('[data-child-id]');if(!row)return;
 const grip=Boolean(e.target.closest('.child-grip'));
 if(!grip&&e.target.closest('button,a,input,textarea,select,details,summary,[contenteditable]'))return;
 const root=task(row.dataset.rootId),child=root?.children.find(c=>c.id===row.dataset.childId);
 if(!root||!child||root.done||child.done||root.paused||M.repeat(root))return;
 const g={pointer:e.pointerId,row,root:root.id,child:child.id,parent:child.parentId||'',title:child.title,view:rootDragView(),x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,armed:false,ghost:null};
 childGesture=g;
 if(grip){e.preventDefault();armChildDrag(g);row.setPointerCapture?.(e.pointerId);}
 else childPendingTimer=setTimeout(()=>armChildDrag(g),430);
},true);
document.addEventListener('pointermove',e=>{
 const g=childGesture;if(!g||g.pointer!==e.pointerId)return;
 g.x=e.clientX;g.y=e.clientY;
 if(!g.armed){if(Math.hypot(g.x-g.startX,g.y-g.startY)>11)resetChildGesture();return;}
 if(e.cancelable)e.preventDefault();moveChildPreview(g,g.x,g.y);
},{passive:false});
document.addEventListener('touchmove',e=>{if(childGesture?.armed&&e.cancelable)e.preventDefault();},{passive:false});
document.addEventListener('pointerup',e=>{
 const g=childGesture;if(!g||g.pointer!==e.pointerId)return;
 const destination=g.armed&&childHover?{...childHover}:null;
 if(g.armed)suppressDragClickUntil=Date.now()+550;
 resetChildGesture();
 if(!destination)return;
 if(destination.kind==='sibling')reorderChild(g.root,g.child,destination.id);
 else if(destination.kind==='root'){
  if(change(b=>liftChildToRoot(b,g.root,g.child,destination.id,destination.after,g.view))){notice('Subtask moved back to main tasks.');openTasks.add(g.root);}
 }
});
document.addEventListener('pointercancel',e=>{if(childGesture?.pointer===e.pointerId)resetChildGesture();});
// STAGE 10B · Long-press card movement (mouse, touch, pen).
// Arming after a hold allows ordinary taps and vertical page scrolling to remain normal.
let rootGesture=null,rootDrop=null,rootHoverTimer=0,rootScrollTimer=0,suppressDragClickUntil=0,rootInsertionLine=null;
// The insertion line lives on document.body, not inside a clipped task card.
// It therefore remains visible above the first item and in the gaps between cards.
function setRootInsertionLine(card,where){
 if(!rootInsertionLine){rootInsertionLine=document.createElement('div');rootInsertionLine.className='tidy-task-insertion-line';rootInsertionLine.setAttribute('aria-hidden','true');document.body.appendChild(rootInsertionLine);}
 const rect=card.getBoundingClientRect(),y=where==='before'?rect.top:rect.bottom;
 rootInsertionLine.style.left=Math.max(5,rect.left+4)+'px';
 rootInsertionLine.style.width=Math.max(20,rect.width-8)+'px';
 rootInsertionLine.style.top=y+'px';
 rootInsertionLine.hidden=false;
}
function hideRootInsertionLine(){if(rootInsertionLine)rootInsertionLine.hidden=true;}
const rootDragView=()=>route==='doing'?(doingTab==='attention'?'attention':'doing'):'room';
const rootDragPage=()=>route==='room'&&['tasks','side'].includes(tab)||route==='doing'&&['doing','attention'].includes(doingTab)||route==='side';
function clearRootDrop(){
 document.querySelectorAll('.task.drop-before,.task.drop-after,.task.drop-nest,.task.drop-hover').forEach(x=>x.classList.remove('drop-before','drop-after','drop-nest','drop-hover'));
 hideRootInsertionLine();rootDrop=null;clearTimeout(rootHoverTimer);rootHoverTimer=0;
}
function resetRootGesture(){
 const g=rootGesture;rootGesture=null;clearTimeout(g?.holdTimer);clearInterval(rootScrollTimer);rootScrollTimer=0;
 g?.card?.classList.remove('drag-lifted');g?.ghost?.remove();document.body.classList.remove('task-dragging');clearRootDrop();
}
function offerRootNesting(from,to,view){
 const target=task(to);
 if(D.isParent(target)){
  if(change(b=>D.nest(b,from,to,'',view,data=>M.task(data)))){openTasks.add(to);notice('Task added as a subtask.');}
  return;
 }
 const item=task(from);
 dialog('Group tasks',`<p class="small">Move <strong>${esc(item?.title)}</strong> onto <strong>${esc(target?.title)}</strong>.</p>${field('Parent name (optional)','parentName','','text','maxlength="500" placeholder="Leave blank to keep the target task as parent"')}<p class="small">A name makes a new parent containing both tasks. A blank name keeps ${esc(target?.title)} as parent. Cancel changes nothing.</p>`,fd=>{
  const name=String(fd.get('parentName')||'').trim();
  if(change(b=>D.nest(b,from,to,name,view,data=>M.task(data)))){closeDialog(true);notice('Tasks grouped.');}
 },{saveLabel:'Group tasks'});
}
function indicateRootDrop(x,y){
 const g=rootGesture;if(!g?.armed)return;
 const under=document.elementFromPoint(x,y)?.closest?.('.task[data-task-id]');
 // Moving within the dragged card itself is not a drop target.
 if(under?.dataset.taskId===g.id){clearRootDrop();return;}
 const cards=[...document.querySelectorAll('.task[data-task-id]')].filter(card=>{
  const id=card.dataset.taskId,rect=card.getBoundingClientRect();
  return id!==g.id&&rect.width>0&&rect.height>0&&D.canMove(board,g.id,id,g.view);
 });
 let hit=under&&cards.includes(under)?under:null;
 if(!hit){
  // elementFromPoint returns the page/background in a gap. Resolve that space
  // to the nearest *eligible* task instead of discarding the drop.
  const nearby=cards.map(card=>{
   const rect=card.getBoundingClientRect();
   const distance=Math.max(0,rect.top-y,y-rect.bottom);
   const withinX=x>=rect.left-24&&x<=rect.right+24;
   return {card,distance,withinX};
  }).filter(item=>item.withinX&&item.distance<=64).sort((a,b)=>a.distance-b.distance);
  hit=nearby[0]?.card||null;
 }
 if(!hit){clearRootDrop();return;}
 const target=hit.dataset.taskId,rect=hit.getBoundingClientRect();
 const ratio=(y-rect.top)/Math.max(1,rect.height);
 const middle=y>=rect.top&&y<=rect.bottom&&ratio>.28&&ratio<.72;
 const candidate=middle?'nest':'insert',kind=y<=rect.top||ratio<.5?'before':'after';
 if(!rootDrop||rootDrop.id!==target||rootDrop.candidate!==candidate){
  clearRootDrop();rootDrop={id:target,candidate,kind,since:Date.now()};
  if(middle)rootHoverTimer=setTimeout(()=>{
   if(!rootGesture?.armed||rootDrop?.id!==target||rootDrop.candidate!=='nest')return;
   rootDrop.kind='nest';hideRootInsertionLine();
   hit.classList.remove('drop-before','drop-after','drop-hover');hit.classList.add('drop-nest');
  },480);
 }
 if(rootDrop.kind==='nest'){
  hideRootInsertionLine();hit.classList.add('drop-nest');
 }else{
  rootDrop.kind=kind;
  hit.classList.remove('drop-before','drop-after','drop-hover','drop-nest');
  hit.classList.add(kind==='before'?'drop-before':'drop-after');
  setRootInsertionLine(hit,kind);
 }
}
function moveRootGhost(g){if(!g?.ghost)return;g.ghost.style.left=Math.max(8,Math.min(window.innerWidth-200,g.x+12))+'px';g.ghost.style.top=Math.max(5,Math.min(window.innerHeight-45,g.y-32))+'px';}
function rootAutoscroll(){
 const g=rootGesture;if(!g?.armed)return;
 const edge=65,height=window.innerHeight||document.documentElement.clientHeight;
 const direction=g.y<edge?-1:g.y>height-edge?1:0;
 if(direction){window.scrollBy(0,direction*14);indicateRootDrop(g.x,g.y);}
}
document.addEventListener('pointerdown',e=>{
 if(!rootDragPage()||editor.open||rootGesture||e.button>0||e.target.closest('.child,.child-grip,input,textarea,select,a,[contenteditable],details'))return;
 const card=e.target.closest('.task[data-task-id]');if(!card)return;
 const el=e.target.closest('button');if(el&&el.dataset.action!=='expand')return;
 const id=card.dataset.taskId,t=task(id);if(!t||t.done||M.repeat(t)||t.paused)return;
 const g={pointer:e.pointerId,id,view:rootDragView(),card,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,armed:false,holdTimer:null};
 g.holdTimer=setTimeout(()=>{if(rootGesture!==g)return;g.armed=true;card.classList.add('drag-lifted');document.body.classList.add('task-dragging');
  g.ghost=document.createElement('div');g.ghost.className='task-drag-ghost';g.ghost.textContent=t.title;document.body.appendChild(g.ghost);moveRootGhost(g);
  rootScrollTimer=setInterval(rootAutoscroll,65);},430);
 rootGesture=g;
},true);
document.addEventListener('pointermove',e=>{
 const g=rootGesture;if(!g||g.pointer!==e.pointerId)return;
 g.x=e.clientX;g.y=e.clientY;
 if(!g.armed){if(Math.hypot(g.x-g.startX,g.y-g.startY)>11)resetRootGesture();return;}
 if(e.cancelable)e.preventDefault();moveRootGhost(g);indicateRootDrop(g.x,g.y);
},{passive:false});
// Touch scrolling must be prevented only *after* the hold has armed the drag.
document.addEventListener('touchmove',e=>{if(rootGesture?.armed&&e.cancelable)e.preventDefault();},{passive:false});
document.addEventListener('pointerup',e=>{
 const g=rootGesture;if(!g||g.pointer!==e.pointerId)return;
 const done=g.armed&&rootDrop?{...rootDrop}:null;
 if(g.armed)suppressDragClickUntil=Date.now()+550;
 resetRootGesture();
 if(!done||done.id===g.id)return;
 if(done.kind==='nest')offerRootNesting(g.id,done.id,g.view);
 else if(change(b=>D.reorder(b,g.id,done.id,done.kind==='after',g.view)))notice('Task order saved.');
});
document.addEventListener('pointercancel',e=>{if(rootGesture?.pointer===e.pointerId)resetRootGesture();});
document.addEventListener('click',e=>{if(Date.now()<suppressDragClickUntil&&e.target.closest('.task')){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
// End Stage 10B.
// Focus-only reorder. This changes the saved Focus sequence, never the room or Doing Now order.
let focusReorderGesture=null;
function clearFocusDrop(){document.querySelectorAll('.focus-drop-target').forEach(x=>x.classList.remove('focus-drop-target'));if(focusReorderGesture)focusReorderGesture.drop='';}
function focusDropAt(x,y){const g=focusReorderGesture;if(!g?.armed)return;const hit=document.elementFromPoint(x,y)?.closest?.('.focus-active-card[data-focus-task-id]');clearFocusDrop();if(!hit||hit.dataset.focusTaskId===g.id)return;const from=task(g.id),to=task(hit.dataset.focusTaskId);if(!from||!to||!!from.done!==!!to.done)return;g.drop=hit.dataset.focusTaskId;g.after=y>hit.getBoundingClientRect().top+hit.getBoundingClientRect().height/2;hit.classList.add('focus-drop-target');}
document.addEventListener('pointerdown',e=>{
 if(route!=='focus'||editor.open||focusReorderGesture||e.button>0)return;const grip=e.target.closest('.quest-focus-grip[data-focus-reorder]');if(!grip)return;
 const card=grip.closest('.focus-active-card[data-focus-task-id]');if(!card)return;const g={pointer:e.pointerId,id:grip.dataset.focusReorder,card,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,armed:false,hold:null,drop:'',after:false};
 g.hold=setTimeout(()=>{if(focusReorderGesture!==g)return;g.armed=true;card.classList.add('focus-dragging');document.body.classList.add('task-dragging');},380);focusReorderGesture=g;
},true);
document.addEventListener('pointermove',e=>{const g=focusReorderGesture;if(!g||g.pointer!==e.pointerId)return;g.x=e.clientX;g.y=e.clientY;if(!g.armed){if(Math.hypot(g.x-g.startX,g.y-g.startY)>11){clearTimeout(g.hold);focusReorderGesture=null;}return;}if(e.cancelable)e.preventDefault();focusDropAt(g.x,g.y);},{passive:false});
document.addEventListener('touchmove',e=>{if(focusReorderGesture?.armed&&e.cancelable)e.preventDefault();},{passive:false});
document.addEventListener('pointerup',e=>{const g=focusReorderGesture;if(!g||g.pointer!==e.pointerId)return;clearTimeout(g.hold);const target=g.drop,after=g.after;g.card.classList.remove('focus-dragging');document.body.classList.remove('task-dragging');clearFocusDrop();focusReorderGesture=null;if(target)Q?.reorderFocus?.(g.id,target,after);});
document.addEventListener('pointercancel',e=>{const g=focusReorderGesture;if(!g||g.pointer!==e.pointerId)return;clearTimeout(g.hold);g.card.classList.remove('focus-dragging');document.body.classList.remove('task-dragging');focusReorderGesture=null;clearFocusDrop();});
document.addEventListener('keydown',e=>{const grip=e.target.closest?.('.quest-focus-grip[data-focus-reorder]');if(!grip||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(Q?.moveFocus?.(grip.dataset.focusReorder,e.key==='ArrowUp'?-1:1)){const id=grip.dataset.focusReorder;requestAnimationFrame(()=>document.querySelector(`.quest-focus-grip[data-focus-reorder="${CSS.escape(id)}"]`)?.focus());}});
// Accessible alternative without extra visible options on subtasks.
document.addEventListener('keydown',e=>{
 const grip=e.target.closest?.('.child-grip');if(!grip||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
 const row=grip.closest('[data-child-id]'),siblings=[...document.querySelectorAll('.doing-child')].filter(x=>x.dataset.rootId===row.dataset.rootId&&x.dataset.parentId===row.dataset.parentId&&!x.classList.contains('child-finished')===!row.classList.contains('child-finished'));
 const idx=siblings.indexOf(row),next=siblings[idx+(e.key==='ArrowUp'?-1:1)];if(!next)return;
 e.preventDefault();reorderChild(row.dataset.rootId,row.dataset.childId,next.dataset.childId,e.key==='ArrowDown');
});
document.addEventListener('change',e=>{
 const el=e.target,kind=el.dataset?.makerField;if(!kind||!wizardDraft||wizardStep<0)return;
 const d=wizardDraft,opt=d.taskOptions?.[el.dataset.id];
 if(kind==='task-selected'&&opt)opt.selected=el.checked;
 else if(kind==='task-title'&&opt){if(!W.renameCustom(wizardDraft,el.dataset.id,el.value)){notice('Enter a task name of up to 180 characters.');render();}}
 else if(kind==='task-count'&&opt){const n=Number(el.value);if(Number.isInteger(n)&&n>=1&&n<=3650)opt.count=n;else{notice('Use a repeat interval between 1 and 3650.');el.value=opt.count;}}
 else if(kind==='task-unit'&&opt&&['days','weeks','months'].includes(el.value))opt.unit=el.value;
 else if(kind==='task-minutes'&&opt){const n=Number(el.value);if(Number.isFinite(n)&&n>=0&&n<=100000){opt.minutes=n;opt.timeEdited=true;}else{notice('Enter a valid time estimate.');el.value=opt.minutes;}}
 else if(kind==='task-tools'&&opt)opt.tools=el.value.slice(0,1000);
 else if(kind==='start-date'){if(S.parseDay(el.value))d.from=el.value;else{notice('Choose a valid start date.');el.value=d.from;}}
 else if(kind==='one-room')d.oneRoomPerDay=el.checked;
 else if(kind==='rest-day'){const n=Number(el.dataset.day);d.restDays=[...new Set([...d.restDays.filter(x=>x!==n),...(el.checked?[n]:[])])];}
 else if(kind==='maker-minutes'){const n=Number(el.value);if(Number.isFinite(n)&&n>=0&&n<=1440)d.makerMinutes=n;else{notice('Planning capacity must be 0 to 1440 minutes.');el.value=d.makerMinutes;}}
 else if(kind==='preset-multiplier'&&[1,2,3].includes(Number(el.value)))d.presetMultiplier=Number(el.value);
 if(kind==='task-selected')render();
});
document.addEventListener('change',e=>{if(e.target?.dataset?.makerV2)Z?.change(e);});
document.addEventListener('input',e=>{if(route==='focus'||route==='clearway'||route==='doing-focus')Q?.input(e)});
document.addEventListener('toggle',e=>{if(route==='focus'||route==='clearway'||route==='doing-focus')Q?.sectionToggle(e);},true);
document.addEventListener('change',e=>{if(route==='focus'||route==='clearway'||route==='doing-focus')Q?.change(e);if(e.target.id==='data-room-filter'){dataRoom=e.target.value;dataVisible=12;render();}});
document.addEventListener('change',e=>{if(e.target.id!=='schedule-preview-minutes')return;const raw=e.target.value.trim();if(raw!==''&&(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>1440)){notice('Choose 1–1440 planning minutes or leave blank for no limit.');e.target.value=schedulePreviewMinutes;return;}schedulePreviewMinutes=raw;render();});
document.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file||!['backup-file','csv-file'].includes(e.target.id))return;try{if(file.size>15*1024*1024)throw Error('Choose a backup smaller than 15 MB.');const text=await file.text();if(e.target.id==='backup-file'){reviewBackup(text);}else{const rows=parseCSV(text),header=rows.shift()||[];if(!header.includes('title')||!header.includes('room'))throw Error('CSV needs title and room columns.');const added=rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||'']))).map(r=>{const found=board.rooms.find(x=>x.id===r.room||x.name.toLowerCase()===r.room.toLowerCase());if(r.room&&!found)throw Error('Unknown room: '+r.room);if(!r.title.trim())throw Error('Every task needs a title.');if(r.sidequest&&!['true','false'].includes(r.sidequest.toLowerCase()))throw Error('sidequest must be true or false.');return M.task({title:r.title.trim(),room:found?.id||'',side:r.sidequest.toLowerCase()==='true',tools:r.tools||'',notes:r.notes||''})}).filter(t=>!board.tasks.some(x=>x.title===t.title&&x.room===t.room));confirmDialog('Preview task upload',`${added.length} new tasks. Existing tasks are kept and matching title/room pairs are skipped.`,()=>change(b=>added.reverse().forEach(t=>M.add(b,t))),'Add these tasks');}}catch(err){notice(err.message)}finally{e.target.value=''}});
function parseCSV(text){const rows=[];let row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw Error('CSV contains an unclosed quote.');if(value||row.length){row.push(value);rows.push(row)}return rows;}
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue||e.newValue===lastSaved)return;try{const incoming=M.normalize(TSC.decode(e.newValue));if(editor.open){pendingExternal=incoming;notice('Another tab saved changes. Your open form is kept; close and reopen it before saving.');}else{lastSaved=e.newValue;board=incoming;render();}}catch{notice('Another tab supplied invalid data. The open board has been preserved.')}});
function reminders(){const f=F();for(const l of f.laundry){if(!M.laundryReminderDue(l))continue;if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Tidy-ish · laundry',{body:'load is ready, rewash = money down the drain',tag:'tidyish-html-laundry-'+l.slot,icon:'assets/icons/tidyish-icon.svg'});change(b=>b.features.laundry.find(x=>x.slot===l.slot).lastReminderAt=Date.now(),{redraw:false,sync:false});}catch{}}}}
if(Z)Z.init({board:()=>board,model:M,change,render,notice,confirmDialog,date:()=>M.date(),storage:localStorage});
window.TidyUI={getBoard:()=>board,change,render,notice,dialog,closeDialog,confirmDialog,button,field,area,check,select,card,detail,esc,navigate,exportBoard,storageKey:KEY,editing:()=>editor.open,acceptSync(next){persist(next);if(!editor.open)render();},onSyncStatus(){if(route==='settings'&&!editor.open)render();}};
if(Q)Q.init({board:()=>board,room:()=>roomId,date:()=>M.date(),notice,render,storage:localStorage,renderFocusTask:(t,pos)=>focusTaskCard(t,pos),legacyDoingFocus:()=>{loadDoingFocus();return {phase:doingFocusState.phase,ids:[...doingFocusState.ids]};},
 memberId:()=>String(F().browserSync?.account||'local')+'|member:'+String(F().displayName||'Me'),makeId:M.uid,openFocus:()=>openQuestFocus(roomId),openTimer:(id,childId='')=>timerDialog(task(id),childId),addTask:()=>taskEditor(),editTask:id=>taskEditor(task(id)),editChild:(id,childId)=>{const t=task(id);if(t)childEditor(t,t.children.find(c=>c.id===childId));},
 editor:()=>editor,dialog,closeDialog,leave:leaveCurrentFocus,showTools:focusToolsDialog,completeFloor:(id)=>change(b=>CARE.littleOften(b,id,M.uid)),openFloorRoom:(id)=>navigate('room',id),returnTasks:()=>clearUnfinished(Q?.get()?.room||roomId,Q?.get()?.scope==='doing'),completeReturn:(id)=>change(b=>{const t=b.tasks.find(x=>x.id===id);if(!t||t.done||!String(t.generatedFrom||'').startsWith('clear-way-session:'))return false;M.finish(b,id,true);}),
 addShared:routine=>change(b=>{
  if(!Array.isArray(b.features.routines))throw Error('Shared routines are unavailable.');
  if(b.features.routines.some(x=>x.id===routine.id))throw Error('Routine ID already exists.');
  b.features.routines.push(routine);
 }),
 completeClear:(entry)=>{
  const current=Q.get();
  if(route!=='clearway'||!current||current.phase!=='clear-active'||current.room!==roomId||!current.clearQuests.some(q=>q.id===entry.id))return false;
  return change(b=>{
   if(CQ.recordClearWin(b,{room:roomId,entry,now:new Date().toISOString(),id:M.uid(),person:b.features.displayName})){const followup=CQ.followupTitle(entry);if(followup)CQ.addFollowup(b,roomId,{...entry,followup},value=>M.task(value));}
  });
 },
 undoClear:(entry)=>{
  const current=Q.get();
  if(route!=='clearway'||!current||current.phase!=='clear-active'||current.room!==roomId||!current.clearQuests.some(q=>q.id===entry.id))return false;
  return change(b=>{
   const wins=CQ.clearWins(b,entry);
   if(wins.length!==1)throw Error('Clear the Way completion is missing or duplicated. No changes made.');
   b.features.wins=b.features.wins.filter(w=>w.id!==wins[0].id);
   // Preserve pre-existing followup tasks; only the matching completion record is undone.
  });
 },
 complete:(id)=>{
  const current=Q.get(),t=task(id);if(!current||current.phase!=='active'||!current.startedIds.includes(id)||!t||current.scope!=='doing'&&t.room!==current.room)return;
  if(t.done){confirmDialog('Undo this Quest?',`Return ${t.title} to your active list and reverse its completion record?`,()=>change(b=>M.finish(b,id,false)),'Undo');return;}
  if(hasTimedAttempt(t)){finishTimed(id);return;}
  const done=()=>change(b=>M.finish(b,id,true));
  if(t.children.some(c=>!c.done))confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,done,'Done em all');else confirmDialog('Complete Focus Quest?',`Mark ${t.title} complete and record it in your normal task history?`,done,'Complete');
 },
 completeChild:(id,childId)=>{
  const current=Q.get(),t=task(id),c=t?.children.find(c=>c.id===childId);
  if(!current||current.phase!=='active'||!current.startedIds.includes(id)||!t||current.scope!=='doing'&&t.room!==current.room||!c)return;
  if(c.done){confirmDialog('Undo this subtask?',`Return ${c.title} to the active list?`,()=>change(b=>M.completeChild(b,id,childId,false)),'Undo');return;}
  if(hasTimedAttempt(c)){finishTimed(id,childId);return;}
  const done=()=>change(b=>M.completeChild(b,id,childId,true));
  if(t.children.some(x=>x.parentId===childId))confirmDialog('Done em all',`Complete all subtasks in ${c.title}?`,done,'Done em all');else confirmDialog('Complete subtask?',`Mark ${c.title} complete?`,done,'Complete');
 }
});
render();if(storageWarning)notice(storageWarning);setInterval(updateClocks,1000);setInterval(()=>{if(!editor.open){const next=M.clone(board);M.refresh(next);if(JSON.stringify(next)!==JSON.stringify(board))change(b=>Object.assign(b,next));reminders();const alertChanged=F().laundry.some(l=>M.laundryNeedsAttention(l))!==lastLaundryAttention;if(route==='laundry'||route==='home'||route==='doing'&&doingTab==='laundry'||route==='doing'&&nextDoingExpiry&&Date.now()>=nextDoingExpiry||alertChanged)render();}},30000);
if(location.hash.includes('access_token=')||new URLSearchParams(location.search).has('code')){route='settings';render();window.addEventListener('tidy-sharing-ready',()=>window.TidySharing.init().catch(e=>notice(e.message)),{once:true});}
})();
