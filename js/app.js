/* Tidy-ish 0.23 HTML: shared renderers for Home, room tasks, Doing Now and laundry. */
(function(){
'use strict';
const SW=window.TidySeasonalWorkflow;
const M=window.TidyModel, S=window.TidySchedule, OCAL=window.TidyOwnerCalendar, B=window.TidyBackup, D=window.TidyDrag, W=window.TidyScheduleWizard, Q=window.TidyQuestUI, CQ=window.TidyQuestFocus, TIME=window.TidyQuestTime, FTOOLS=window.TidyFocusTools, L=window.TidyQuestLibrary, MEM=window.TidyQuestMemory, REC=window.TidyQuestRecommendations, CARE=window.TidyCare, CW=window.TidyCustomWarnings, OCC=window.TidyOccasional, Z=window.TidyMakerUIV2, V=window.TidyMakerV2, LOC=window.TidyLocationBook, TSC=window.TidyStorageCodec, KEY='tidyish-html-v023-board-v1'+(new URLSearchParams(location.search).get('qa')==='1'?'-qa':''), $=s=>document.querySelector(s), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Green feedback is a transient presentation state, never the undo record itself.
const quickFeedback=new Map();let lastCustomLaundryAttention='';
let grindSection='cat',calendarOffset=0,dataPeriod='30',dataRoom='all',dataVisible=12,dataView='day',dataDay=M.date(),dataTaskId='',calendarView='plan',giftView='christmas',giftPersonTab='all',giftStatusTab='needs-wrap',scheduleWeek=0;
let christmasGiftId='',christmasPerson='all';
let activityLoadPromise=null,activityLoadAttempted=false,activityLoadError='',pendingActivityDate='';
let libraryQuery='',libraryRoom='all',libraryKind='all',libraryPriority='all',libraryTag='',libraryTab='saved';
let dataMeterView='clean',daybookDate='',dailyLogViewState=null,dailyLogPageInstance=null,dailyLogLaundryInstances=[];
const dailyLogSnapshotListeners=new WeakMap();
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
let board,storageError='',storageWarning='',lastSaved='',route='home',roomId='kitchen',tab='tasks',doingTab='doing',sideTab='all',search='',locationSearch='',detailed=false,deleted=null,openTasks=new Set(),collapsed=new Set(),sideCollapsed=new Set(),dialogDirty=false,dialogSave=null,dialogCleanup=null,pendingExternal=null,noticeTimer,music=null,christmasJingle=null,christmasJinglePending=false,lastLaundryAttention='',lastCareAttention='',lastCustomAttention='',locationTabId='household',soundVolume=.12;
let taskTitleSuggestionState=null,taskTitleSuggestionTimer=null;
const SOUND_VOLUME_KEY=KEY+'-focus-volume';
try{const savedVolume=Number(localStorage.getItem(SOUND_VOLUME_KEY));if(Number.isFinite(savedVolume)&&savedVolume>=0&&savedVolume<=.3)soundVolume=savedVolume;}catch{}
// Doing Now is a personal display preference, not a household task or sync mutation.
const DOING_VIEW_KEY=KEY+'-doing-view';
let doingDetailed=false,nextCompletionExpiry=0;
let homeUtilityView='sorting';
try{doingDetailed=localStorage.getItem(DOING_VIEW_KEY)==='detailed'}catch{}
const app=$('#app'),editor=$('#editor');
const seasonalTheme=window.TidySeasonalTheme;
let seasonalDisplay={decorations:true,animation:true},seasonalThemeSignature='',lastSeasonalDisplayDate='';
try{if(seasonalTheme)seasonalDisplay=seasonalTheme.preferences(localStorage,KEY);}catch{}
function applySeasonalTheme(){
 lastSeasonalDisplayDate=M.date();
 const theme=seasonalTheme?.resolve(board,M.date(),seasonalDisplay);
 if(theme)document.body.dataset.seasonalTheme=theme.key;else delete document.body.dataset.seasonalTheme;
 const motion=seasonalDisplay.animation&&!F().reduceMotion,signature=JSON.stringify([theme?.key||'',motion,route==='home']);
 if(signature!==seasonalThemeSignature){const layer=$('#seasonal-snow-layer');if(layer)layer.innerHTML=seasonalTheme?.particles(theme,motion,route==='home')||'';seasonalThemeSignature=signature;}
 document.body.classList.toggle('seasonal-page-hidden',document.hidden);
}
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('seasonal-page-hidden',document.hidden));
window.addEventListener('storage',e=>{if(e.key===KEY+'-seasonal-display-v1'&&seasonalTheme){seasonalDisplay=seasonalTheme.preferences(localStorage,KEY);if(!editor.open)render();}});
try{lastSaved=localStorage.getItem(KEY)||'';const original=lastSaved?TSC.decode(lastSaved):null;board=original?M.normalize(original):M.board();if(!lastSaved)board.features.tools=['Magic Erasers','Microfibre cloths'];const defaultsResult=OCC?.seed(board,M,new Date())||{added:0};M.refresh(board);if(!lastSaved||defaultsResult.added||Number(original?.features?.occasionalScheduleDefaultsVersion)!==1||Number(original?.features?.laundryCycleVersion)!==1||original.rooms?.some(r=>r.id==='upstairs'||r.id==='cats'&&r.name==='Cat Tray Area')){const migrated=JSON.stringify(board);if(migrated!==lastSaved)try{localStorage.setItem(KEY,migrated);lastSaved=migrated;}catch(e){storageWarning='Your saved board is still intact, but this browser has little storage space. Download a backup, then remove older Task Data if needed.';}}}catch(e){storageError=e.message;board=M.board();}
let maintenanceDate=M.date();
const room=id=>board.rooms.find(r=>r.id===id),task=id=>board.tasks.find(t=>t.id===id),rooms=()=>board.rooms.filter(r=>!r.archived),F=()=>board.features;
// Runtime artwork stays under assets/; local music and timer audio live under sounds/.
const asset=p=>{
 const x=String(p||'');
 if(x.startsWith('audio/'))return 'sounds/'+x.slice(6).split('/').map(encodeURIComponent).join('/');
 const routed=x.startsWith('room-art/')?'rooms/'+x.slice(9):
  x.startsWith('app-icons/')?'icons/'+x.slice(10):
  ['laundry-rail.svg','laundry-dryer.svg'].includes(x)?'laundry/'+x:
  /^(?:house(?:-map-plaques)?\.png|room-[^/]+\.(?:png|jpe?g))$/i.test(x)?'rooms/'+x:
  /(?:-background\.png$|-spotless\.(?:png|jpg)$)/i.test(x)?'backgrounds/'+x:x;
 const optimized=routed.replace(/\.(?:png|jpe?g)$/i,'.webp');
 return 'assets/'+optimized.split('/').map(encodeURIComponent).join('/');
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
const addSubtaskArtwork='<svg class="add-subtask-art" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="14" height="18" rx="3" fill="#394c6d" stroke="#b9dbe1" stroke-width="1.5"/><path d="M6 8h8M6 12h5M6 16h4" stroke="#e5f2f4" stroke-width="1.5" stroke-linecap="round"/><circle cx="17.5" cy="16.5" r="5.5" fill="#34836c" stroke="#a6e3c3" stroke-width="1.25"/><path d="M17.5 13.5v6m-3-3h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
function notice(text){$('#notice').textContent=text;$('#notice').style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').style.display='none',6500);}
function persist(next){if(storageError)throw Error('Browser storage is unavailable. The original saved data has been preserved. '+storageError);const current=localStorage.getItem(KEY)||'';if(current!==lastSaved)throw Error('This board changed in another tab. Close this form and reload before saving. Your form is still open.');const serialized=TSC.encode(next);try{localStorage.setItem(KEY,serialized);}catch(e){if(e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014)throw Error('This browser is out of storage space. Your current saved board is intact; this change was not saved. Download a backup, then remove older Task Data if needed.');throw e;}lastSaved=serialized;board=next;}
function stampTaskEdits(next){const previous=new Map((board?.tasks||[]).map(t=>[t.id,t])),now=new Date().toISOString();for(const t of next.tasks){const old=previous.get(t.id),clean=x=>{const v=M.clone(x);delete v.syncUpdatedAt;for(const c of v.children||[])delete c.syncUpdatedAt;return JSON.stringify(v);};if(!old||clean(t)!==clean(old)){t.syncUpdatedAt=now;const oldChildren=new Map((old?.children||[]).map(c=>[c.id,c]));for(const c of t.children){const before=oldChildren.get(c.id),cc=M.clone(c);delete cc.syncUpdatedAt;const bc=before&&M.clone(before);if(bc)delete bc.syncUpdatedAt;if(!before||JSON.stringify(cc)!==JSON.stringify(bc))c.syncUpdatedAt=now;}}}}
function isChristmasActive(){return !!(SW&&board&&(board.features.occasionOccurrences||[]).some(o=>{const context=SW.christmasContext(board,o.id,M.date());return !!context?.active&&!context.readOnly;}));}
function playChristmasJingle(){if(!F().sound||!isChristmasActive()||document.hidden||christmasJinglePending||christmasJingle&&!christmasJingle.paused)return false;let audio;const finish=()=>{if(christmasJingle===audio)christmasJingle=null;christmasJinglePending=false;};try{audio=new Audio(asset('audio/christmas-jingle.wav'));audio.preload='auto';audio.volume=soundVolume;christmasJingle=audio;christmasJinglePending=true;audio.addEventListener('ended',finish,{once:true});audio.addEventListener('error',finish,{once:true});const playing=audio.play();if(playing?.catch)playing.catch(finish);else christmasJinglePending=false;return true;}catch{finish();return false;}}
function stopChristmasJingle(){const audio=christmasJingle;christmasJingle=null;christmasJinglePending=false;if(audio){try{audio.pause();audio.currentTime=0;}catch{}}}
function christmasCompletionAnimation(){if(!isChristmasActive()||!seasonalDisplay.decorations||!seasonalDisplay.animation||F().reduceMotion)return;document.body.classList.remove('christmas-completion-pop');void document.body.offsetWidth;document.body.classList.add('christmas-completion-pop');setTimeout(()=>document.body.classList.remove('christmas-completion-pop'),1300);}
function change(edit,{redraw=true,sync=true}={}){try{const next=M.clone(board),beforeWins=new Set((board?.features?.wins||[]).map(w=>w.id));edit(next);const recordedCompletion=(next?.features?.wins||[]).some(w=>!beforeWins.has(w.id))&&(typeof route!=='string'||!['backup','data','settings','calendar'].includes(route));stampTaskEdits(next);if(window.TidySharing?.transition)window.TidySharing.transition(board,next);persist(next);if(redraw)render();if(recordedCompletion&&typeof SW!=='undefined'&&typeof playChristmasJingle==='function'){playChristmasJingle();christmasCompletionAnimation();}if(sync)window.TidySharing?.queue();return true;}catch(e){showDialogSaveError(e?.message||'Could not save.');notice(e?.message||'Could not save.');return false;}}
function dailyLogState(){const core=window.TidyDailyLogCore;if(!core)throw Error('The Daily Log is still loading.');return core.normalizeState({schemaVersion:1,records:M.clone(F().dailyLogRecords||[]),rewashes:M.clone(F().dailyLogRewashes||[])});}
function saveDailyLogState(value){const core=window.TidyDailyLogCore;if(!core)throw Error('The Daily Log is still loading.');const state=core.normalizeState(value),records=M.clone(state.records),rewashes=M.clone(state.rewashes);if(!change(b=>{b.features.dailyLogRecords=records;b.features.dailyLogRewashes=rewashes;},{redraw:false}))throw Error('The Daily Log could not be saved. Your existing records are unchanged.');}

function dailyLogHistoryBoard() {
  const core = window.TidyDailyLogCore;
  if (!core?.projectCompletionDates) return board;
  try { return core.projectCompletionDates(board, dailyLogState()); }
  catch (error) {
    console.warn('Daily Log date projection unavailable; stored wins are unchanged.', error);
    return board;
  }
}
function dailyLogCompletionLabel(win) {
  if (win?._dailyLogCorrectedDate) {
    return new Date(win._dailyLogCorrectedDate + 'T12:00:00.000Z').toLocaleDateString('en-GB', {
      timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric'
    }) + ' (corrected)';
  }
  return win?.at && Number.isFinite(Date.parse(win.at)) ? dateLabel(win.at) : 'Date not recorded';
}

function dailyLogCompletionIds(taskRow){if(!taskRow)return [];const children=Array.isArray(taskRow.children)?taskRow.children:[],parentIds=new Set(children.map(child=>child.parentId).filter(Boolean)),leaves=children.filter(child=>!parentIds.has(child.id));return leaves.length?leaves.map(child=>child.id):[taskRow.id];}
function dailyLogBoardSnapshot(date) {
  const completions = (F().wins || []).map(win => {
    const roomRow = room(win.room || win.roomId);
    return {
      id: String(win.id || ''), title: String(win.title || win.taskTitle || 'Completed task'), at: win.at || '',
      taskId: String(win.taskId || ''), rootId: String(win.rootId || ''), roomId: String(win.room || win.roomId || ''),
      roomName: roomRow?.name || win.room || win.roomId || 'General', completedBy: String(win.person || win.completedBy || ''),
      minutes: Number.isInteger(win.minutes) && win.minutes > 0 && win.minutes <= 1440 ? win.minutes : null
    };
  }).filter(row => row.id);
  const calendarRows = [];
  try {
    const day = OCAL?.preview(board, date, 1)?.days?.find(item => item.date === date);
    for (const item of day?.items || []) {
      const taskRow = board.tasks.find(task => task.id === item.taskId);
      const estimate = Number(item.minutes ?? taskRow?.estimate);
      const minutes = Number.isInteger(estimate) && estimate > 0 && estimate <= 1440 ? estimate : null;
      calendarRows.push({
        date, taskId: String(item.taskId || ''), title: String(item.title || taskRow?.title || 'Planned task'),
        roomId: String(item.room || taskRow?.room || ''), room: room(item.room || taskRow?.room)?.name || 'General',
        source: 'Calendar', completionTaskIds: dailyLogCompletionIds(taskRow), minutes
      });
    }
  } catch (error) { console.warn('Calendar plan could not be read for Daily Snapshot.', error); }
  const today = window.TidyActivityData?.today() || M.date();
  const doingRows = date === today ? M.doing(board).filter(task => !task.archived && !task.side).map(task => {
    const estimate = Number(task.estimate);
    return {
      date, taskId: task.id, title: task.title, roomId: task.room || '', room: room(task.room)?.name || 'General',
      source: 'Doing Now', completionTaskIds: dailyLogCompletionIds(task),
      minutes: Number.isInteger(estimate) && estimate > 0 && estimate <= 1440 ? estimate : null
    };
  }) : [];
  const core = window.TidyDailyLogCore;
  const planned = core?.combinePlannedTasks ? core.combinePlannedTasks(date, calendarRows, doingRows, today) : calendarRows;
  return { completions, planned, rooms: board.rooms.map(item => ({ id: item.id, name: item.name })) };
}
function renderCalendarDailyLogSnapshot(root,date){if(!root)return;const core=window.TidyDailyLogCore,mount=window.TidyDailyLogMount;if(!core||!mount){root.textContent=window.TidyDailyLogError?'Daily Log is unavailable. Your saved data was not changed.':'Loading Daily Log…';return;}try{mount.renderDailySnapshot(root,dailyLogState(),date,dailyLogBoardSnapshot(date));if(!dailyLogSnapshotListeners.has(root)){const onClick=event=>{const button=event.target.closest('[data-action="resolve"]');if(!button||!root.contains(button))return;event.preventDefault();event.stopPropagation();try{saveDailyLogState(core.resolveRecord(dailyLogState(),button.dataset.recordId,button.dataset.revisionId));renderCalendarDailyLogSnapshot(root,date);}catch(error){notice(error.message);}};root.addEventListener('click',onClick);dailyLogSnapshotListeners.set(root,onClick);}}catch(error){root.textContent='Daily Log is unavailable. Your saved data was not changed.';}}
function unmountDailyLogViews(){if(dailyLogPageInstance){dailyLogViewState=dailyLogPageInstance.getViewState();daybookDate=dailyLogViewState.selectedDate||daybookDate;dailyLogPageInstance.unmount();dailyLogPageInstance=null;}for(const instance of dailyLogLaundryInstances)instance.unmount();dailyLogLaundryInstances=[];}
function mountDailyLogViews(){const mount=window.TidyDailyLogMount,logRoot=$('#tidyish-daily-log');if(logRoot){if(!mount){if(window.TidyDailyLogError)logRoot.textContent='Daily Log could not be loaded. Your saved data is unchanged.';return;}try{dailyLogPageInstance=mount.mountTaskDataAddon(logRoot,{getBoardSnapshot:date=>dailyLogBoardSnapshot(date),loadState:dailyLogState,saveState:saveDailyLogState,initialDate:daybookDate,viewState:dailyLogViewState||undefined});}catch(error){logRoot.textContent='Daily Log could not be opened. Your saved data was not changed.';}}
 if((route==='laundry'||route==='doing'&&doingTab==='laundry')&&mount){for(const host of app.querySelectorAll('[data-daily-log-rewash]')){const slot=Number(host.dataset.dailyLogRewash),load=F().laundry.find(item=>item.slot===slot);if(!load||slot<1)continue;try{dailyLogLaundryInstances.push(mount.mountLaundryRewashButton(host,slot,{label:host.dataset.label||`Load ${slot}`,loadId:host.dataset.loadId||`${slot}:${load.startedAt||load.revision||0}`,loadState:dailyLogState,saveState:saveDailyLogState}));}catch{host.textContent='Re-wash record unavailable.';}}}}
/* TIDYISH-BACK-NAV-V1: browser history and in-app Back navigation */
const backRouteNames=new Set(['home','room','doing','calendar','data','side','more','settings','help','backup','manage','schedule','laundry','laundry-settings','focus-hub','focus','clearway','doing-focus','grind','library','locations','gifts','christmas-gifts','christmas-wrap','seasonal']);
const settingsTabs=[['backup','Backup'],['household','Household & profile'],['preferences','Preferences'],['rooms','Rooms & tools'],['schedule','Schedule'],['about','About']];
let settingsTab='backup';
const validSettingsTab=id=>settingsTabs.some(([key])=>key===id);
function backState(depth){return {route,roomId,tab,doingTab,sideTab,grindSection,libraryTab,settingsTab,...(['christmas-gifts','christmas-wrap'].includes(route)?{christmasGiftId,christmasPerson}:{}),dataView:typeof dataView==='string'?dataView:undefined,depth};}
function rememberBackState(){
 try{
  const saved=window.history.state||{},depth=Number.isInteger(saved.tidyishBack?.depth)?Math.max(0,saved.tidyishBack.depth):0;
  window.history.replaceState({...saved,tidyishBack:backState(depth)},'',window.location.href);
  return depth;
 }catch{return 0;}
}
function navigate(next,id,view){
 if(next==='manage')next='settings';
 if(next==='backup'){next='settings';view='backup';}
 if(editor.open||!backRouteNames.has(next))return;
 const nextSettings=next==='settings'?(validSettingsTab(view)?view:'backup'):null;
 const christmasRoute=['christmas-gifts','christmas-wrap'].includes(next);
 if(route===next&&(!id||id===(christmasRoute?christmasGiftId:roomId))&&(nextSettings?nextSettings===settingsTab:!view||view===libraryTab))return;
 const depth=rememberBackState();
 if(nextSettings)settingsTab=nextSettings;
 if(next==='library'&&['saved','custom','occasional','seasonal'].includes(view))libraryTab=view;
 route=next;if(christmasRoute){if(id&&id!==christmasGiftId)christmasPerson='all';christmasGiftId=id||christmasGiftId;}else if(id)roomId=id;search='';tab='tasks';openTasks.clear();
 try{window.history.pushState({tidyishBack:backState(depth+1)},'',window.location.href);}catch{}
 render();window.scrollTo(0,0);if(['seasonal','christmas-gifts','christmas-wrap'].includes(route))playChristmasJingle();
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
 route=['manage','backup'].includes(previous.route)?'settings':previous.route;roomId=previous.roomId||roomId;
 if(['christmas-gifts','christmas-wrap'].includes(route)){christmasGiftId=previous.christmasGiftId||'';christmasPerson=previous.christmasPerson||'all';}
 settingsTab=previous.route==='backup'?'backup':validSettingsTab(previous.settingsTab)?previous.settingsTab:'backup';
 tab=previous.tab||'tasks';doingTab=previous.doingTab||'doing';sideTab=previous.sideTab||'all';grindSection=previous.grindSection||'cat';if(['saved','custom','occasional','seasonal'].includes(previous.libraryTab))libraryTab=previous.libraryTab;
 if(typeof dataView==='string'&&['overview','day','rooms','quests','focus','occasional','daybook'].includes(previous.dataView))dataView=previous.dataView;
 search='';openTasks.clear();render();window.scrollTo(0,0);
});
const savedBack=window.history.state?.tidyishBack;
if(savedBack&&backRouteNames.has(savedBack.route)){
 route=['manage','backup'].includes(savedBack.route)?'settings':savedBack.route;roomId=savedBack.roomId||roomId;
 if(['christmas-gifts','christmas-wrap'].includes(route)){christmasGiftId=savedBack.christmasGiftId||'';christmasPerson=savedBack.christmasPerson||'all';}
 settingsTab=savedBack.route==='backup'?'backup':validSettingsTab(savedBack.settingsTab)?savedBack.settingsTab:'backup';
 tab=savedBack.tab||tab;doingTab=savedBack.doingTab||doingTab;sideTab=savedBack.sideTab||sideTab;grindSection=savedBack.grindSection||'cat';if(['saved','custom','occasional','seasonal'].includes(savedBack.libraryTab))libraryTab=savedBack.libraryTab;
 if(typeof dataView==='string'&&['overview','day','rooms','quests','focus','occasional','daybook'].includes(savedBack.dataView))dataView=savedBack.dataView;
}
rememberBackState();
function tabs(entries,chosen,action,cls=''){return `<div class="tabs ${cls}" role="tablist">${entries.map(([id,label])=>button(esc(label),action,id,id===chosen?'active':'',`role="tab" aria-selected="${id===chosen}"`)).join('')}</div>`;}
const CARE_TASK_ICON=Object.freeze({cat:'🐈','fish-topup':'🐟','fish-outside':'🧽','fish-inside':'🐠',isopods:'🪲',plants:'🪴'}),CARE_STATE_ICON=Object.freeze({green:'✓',blue:'●',orange:'▲',red:'!',flashing:'‼'}),CARE_STATE_ORDER={green:0,blue:1,orange:2,red:3,flashing:4};
function careWarnings(){return (CARE?.rules(board)||[]).map(rule=>({rule,state:CARE.status(board,rule.id)})).filter(item=>item.state.state!=='green').sort((a,b)=>(CARE_STATE_ORDER[b.state.state]||0)-(CARE_STATE_ORDER[a.state.state]||0));}
function customWarnings(){return CW?.list(board,M.date())||[];}
function careAttentionSignature(){return careWarnings().map(({rule,state})=>`${rule.id}:${state.state}:${state.label}`).join('|');}
function customAttentionSignature(){return customWarnings().filter(item=>item.state.state!=='green').map(({task,state})=>`${task.id}:${state.state}:${state.label}`).join('|');}
function carePill(state){return `<span class="tidy-care-pill ${esc(state.state)}"><span aria-hidden="true">${CARE_STATE_ICON[state.state]||'•'}</span> ${esc(state.label)}</span>`;}
function globals(home=false){const care=careWarnings().filter(({rule})=>rule.id==='cat'||rule.id==='plants'||rule.group==='custom').map(({rule,state})=>button(`<span class="warning-task-icon" aria-hidden="true">${CARE_TASK_ICON[rule.id]||'●'}</span><span class="warning-urgency-mark ${esc(state.state)}" aria-hidden="true">${CARE_STATE_ICON[state.state]||'•'}</span>`,'open-grind',rule.group==='custom'?'care':rule.group,`warning-task ${esc(state.state)}`,`aria-label="${esc(rule.title)}: ${esc(state.label)}" title="${esc(rule.title)}: ${esc(state.label)}"`)).join(''),custom=customWarnings().filter(item=>item.state.state!=='green'&&['🐈','🪴'].includes(item.icon)).map(({task,state,icon})=>button(`<span class="warning-task-icon" aria-hidden="true">${icon}</span><span class="warning-urgency-mark ${esc(state.state)}" aria-hidden="true">${CARE_STATE_ICON[state.state]||'•'}</span>`,'open-warning-task',task.id,`warning-task ${esc(state.state)}`,`aria-label="${esc(task.title)}: ${esc(state.label)}" title="${esc(task.title)}: ${esc(state.label)}"`)).join(''),laundry=(F().laundry?.some(l=>M.laundryNeedsAttention(l))||F().customLaundryLoads.some(l=>M.customLaundryNeedsAttention(l)))?button(`<img src="${asset('activity-calendar/laundry.svg')}" alt=""><span class="warning-urgency-mark flashing" aria-hidden="true">!</span>`,'navigate','laundry','laundry-ready-alert warning-task','aria-label="Laundry ready for transfer" title="Laundry ready for transfer"'):'';const warnings=laundry||care||custom?`<div class="global-warning-strip" role="group" aria-label="Tasks needing attention">${laundry}${care}${custom}</div>`:'';return `<div class="global ${home?'home-global':''}">${warnings}${button('⚙︎','navigate','settings','','aria-label="Settings"')}${button('?','navigate','help','','aria-label="Help"')}</div>`;}
// The six real controls sit over the user-approved navigation artwork.
const destinations=[['home','Home'],['doing','Doing Now'],['focus-hub','Focus'],['calendar','Calendar'],['data','Data'],['more','More']];
function footer(){
 const focusRoutes=['focus-hub','focus','clearway','doing-focus'],moreRoutes=['side','settings','help','backup','laundry','laundry-settings','manage','schedule','library','locations','gifts','christmas-gifts','christmas-wrap','grind','seasonal'];
 const activeFor=id=>id==='home'?route==='home'||route==='room':id==='focus-hub'?focusRoutes.includes(route):id==='more'?route==='more'||moreRoutes.includes(route):id===route;
 const image=asset('navigation/navigation-six-tabs-focus.webp');
 return `<nav class="footer illustrated-nav" aria-label="Main navigation"><img class="nav-illustration" src="${image}" alt="" decoding="async" onerror="this.closest('nav').classList.add('nav-image-missing')"><div class="nav-hotspots">${destinations.map(([id,label])=>button(`<span class="nav-fallback-label">${esc(label)}</span>`,'navigate',id,activeFor(id)?'active':'',`aria-label="${esc(label)}" ${activeFor(id)?'aria-current="page"':''}`)).join('')}</div></nav>`;
}
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
 return `<section class="tidy-utility-tile"> <div class="row spread"><h2>${homeUtilityView==='sorting'?'Collected items to sort':'Floors'}</h2><div class="row">${button('‹','switch-home-utility','','ghost','aria-label="Switch home tile"')}${button('›','switch-home-utility','','ghost','aria-label="Switch home tile"')}</div></div><div class="tidy-utility-scroll">${homeUtilityView==='sorting'?(sortRows||'<p class="small">No collected items are waiting to be put away.</p>'):(floorRows||'<p class="small">No floor Tasks yet. Add a repeatable floor Task if you want a quick counter.</p>')}</div>${homeUtilityView==='floors'?button('＋ Add repeatable floor Task','floor-add','','ghost'):''}<p class="small">${homeUtilityView==='sorting'?'Return and sorting tasks stay active until genuinely completed.':'Use this any time. Floors are never automatically added to Focus.'}</p></section>`;
}
function careHomeRows(group){return (CARE?.rules(board)||[]).filter(rule=>rule.group===group||group==='aquatic'&&rule.group==='custom').map(rule=>{const state=CARE.status(board,rule.id);return `<span class="care-home-row"><span class="care-home-task"><span aria-hidden="true">${CARE_TASK_ICON[rule.id]||'●'}</span><span>${esc(rule.title)}</span></span>${carePill(state)}</span>`;}).join('');}
function customWarningHomeIcons(){const items=customWarnings();if(!items.length)return '';return `<section class="custom-warning-home" aria-label="Custom task warnings"><div class="custom-warning-home-list">${items.map(({task,state,icon})=>button(`<span class="custom-warning-home-icon" aria-hidden="true">${icon}</span><strong>${esc(task.title)}</strong>${carePill(state)}`,'open-warning-task',task.id,`custom-warning-home-item ${esc(state.state)}`,`aria-label="${esc(task.title)}: ${esc(state.label)}" title="${esc(task.title)}: ${esc(state.label)}"`)).join('')}</div></section>`;}
function dailyGrindTiles(){return `<section class="tidy-daily-grind"><div class="new-grind-grid">${[['laundry','Laundry','<small>Laundry cycles</small>'],['cat','Cat Tray',`<span class="care-home-status-list">${careHomeRows('cat')}</span>`],['aquatic','Fish · Isopods · Plants',`<span class="care-home-status-list">${careHomeRows('aquatic')}</span>`],['often','Little & Often','<small>Quick repeat counters</small>']].map(([key,name,content])=>button(`<strong>${esc(name)}</strong>${content}`,key==='laundry'?'navigate':'open-grind',key,'new-grind-tile new-grind-'+key)).join('')}</div></section>`;}
function quickFeedbackFor(t){const feedback=quickFeedback.get(t.id);return feedback&&feedback.until>Date.now()&&CARE.littleWins(board,t.id).some(w=>w.id===feedback.winId)?feedback:null;}
function quickGrid(){const items=board.tasks.filter(t=>t.littleOften&&!t.side&&!t.archived);return `<div class="little-often-grid">${items.map(t=>{const all=CARE.littleWins(board,t.id),feedback=quickFeedbackFor(t);return `<article class="little-often-cell">${button(`<strong>${esc(t.title)}</strong><small>${all.length} recorded · ${feedback?'✓ Tap to undo':'Tap to complete'}</small>`,'quick-tile',t.id,`little-often-tile ${feedback?'recorded':''}`,`data-completion-id="${esc(feedback?.winId||'')}" aria-label="${esc(t.title)}: ${feedback?'undo recorded completion':'record a completion'}"`)}<div class="little-often-options">${all.length?button('Undo last','quick-undo',t.id,'ghost',`data-completion-id="${esc(all[0].id)}" aria-label="Undo last completion of ${esc(t.title)}"`):''}${button('Edit','edit-task',t.id,'ghost',`aria-label="Edit ${esc(t.title)}"`)}</div></article>`;}).join('')||'<p>Make your first quick task below.</p>'}</div>`;}
function quickTile(el){const id=el.dataset.id,undoId=el.dataset.completionId;if(undoId){if(change(b=>{if(!CARE.littleUndo(b,id,undoId))throw Error('That completion is no longer available. No other completion was removed.');},{redraw:false})){if(quickFeedback.get(id)?.winId===undoId)quickFeedback.delete(id);render();}return;}
 let recorded;if(!change(b=>{recorded=CARE.littleOften(b,id,M.uid);},{redraw:false}))return;const entry={winId:recorded.id,until:Date.now()+1800};quickFeedback.set(id,entry);render();setTimeout(()=>{if(quickFeedback.get(id)!==entry)return;quickFeedback.delete(id);if(route==='grind'&&grindSection==='often'){const tile=[...app.querySelectorAll('[data-action="quick-tile"]')].find(b=>b.dataset.id===id&&b.dataset.completionId===entry.winId);if(tile){tile.dataset.completionId='';tile.classList.remove('recorded');tile.setAttribute('aria-label',`${task(id)?.title||'Task'}: record a completion`);const small=tile.querySelector('small');if(small)small.textContent=small.textContent.replace('✓ Tap to undo','Tap to complete');}}},1800);}
function careEditor(id=''){const r=id?CARE.rule(id,board):null;if(id&&!r)throw Error('Care task no longer exists.');const options=[['daily','Daily'],['weekly','Weekly'],['every-two','Weekly · overdue stages every 2 days'],['monthly','Monthly'],['plants','Plants · every 6 days'],['interval','Custom interval (days)']];dialog(r?'Edit care task':'Add custom care task',`<p class="small">Care definitions and reminder preferences are stored in this browser. Completion history can sync with your household.</p>${field('Task name','title',r?.title||'','text','required maxlength="140"')}${select('Reminder interval','type',options,r?.type||'interval')}${field('Days (custom interval only)','intervalDays',r?.intervalDays||7,'number','min="1" max="365" step="1"')}${field('Optional reminder message','warning',r?.warning||'','text','maxlength="200"')}`,fd=>{if(change(b=>CARE.saveRule(b,id,Object.fromEntries(fd),M.uid),{sync:false}))closeDialog(true);},{saveLabel:r?'Save changes':'Add care task'});}
function dailyGrindPage(){
 const nav=tabs([['care','Pet & plant care'],['often','Little & Often']],grindSection==='often'?'often':'care','open-grind');
 if(grindSection==='often')return `<section class="new-grind-page"><h2>Little & Often</h2>${nav}<p class="small">Tap a task to record it. Tap again while it is green to undo that completion. You can also use Undo last later, or edit the record in Task Data.</p>${quickGrid()}${button('＋ Add Little & Often','quick-add','','primary')}${button('Back to home','navigate','home','ghost')}</section>`;
 const rows=(CARE?.rules(board)||[]).filter(r=>grindSection==='care'||r.group===grindSection||grindSection==='aquatic'&&r.group==='custom');
 return `<section class="new-grind-page"><h2>${grindSection==='cat'?'Cat Tray':grindSection==='aquatic'?'Fish · Isopods · Plants':'Pet & plant care'}</h2>${nav}<p class="small">Edit care tasks or add your own reminders. Settings are saved in this browser; completion history can sync.</p><div class="tidy-care-list compact-care-list">${rows.map(r=>{const state=CARE.status(board,r.id),previous=CARE.wins(board,r.id);return `<article class="tidy-care-card compact-care-card"><div class="row spread"><strong>${esc(r.title)}</strong>${carePill(state)}</div><div class="small">${state.days===null?'No completion recorded':state.days+' day'+(state.days===1?'':'s')+' since last done'} · ${previous.length} completion${previous.length===1?'':'s'}</div>${state.warning&&state.state!=='green'?`<p>${esc(state.warning)}</p>`:''}<div class="row">${button('I did a thing!','care-done',r.id,'complete')}${previous.length?button('Undo last','care-undo',r.id,'ghost',`data-completion-id="${esc(previous[0].id)}"`):''}${button('Edit','care-edit',r.id,'ghost')}</div></article>`;}).join('')}</div>${button('＋ Add custom care task','care-add','','primary')}${button('Back to home','navigate','home','ghost')}</section>`;
}
function voiceCapture(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 dialog('Speak a side task',`<p class="small">${Recognition?'Tap Start listening and speak naturally.':'Speech recognition is unavailable in this browser. You can type instead.'} Review the words before saving.</p><div class="row">${Recognition?button('🎙 Start listening','voice-listen','','primary'):''}<span id="voice-status" role="status" aria-live="polite"></span></div>${field('Side task or homeless item','voiceTitle','','text','required maxlength="180" placeholder="Find a home for spare cables"')}${select('Save as','voiceType',[['side','Side task'],['homeless','Homeless item']],'side')}`,fd=>{
 const title=String(fd.get('voiceTitle')||'').trim().replace(/^add (?:a )?(?:sidequest|side task)\s*[:,-]?\s*/i,'').replace(/^these?\s+/i,'');if(!title)throw Error('Say or type what you want to capture.');const isHomeless=fd.get('voiceType')==='homeless';
 if(change(b=>{if(isHomeless)b.features.items.unshift({id:M.uid(),kind:'homeless',text:title,location:route==='room'?roomId:''});else M.add(b,M.task({room:route==='room'?roomId:'',title,side:true,sideKind:'organisation',doing:false}));})){closeDialog(true);notice('Saved '+(isHomeless?'homeless item':'Side task')+'. You can carry on cleaning.');}
 },{saveLabel:'Save and return'});
}
function beginVoiceListening(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){notice('Speech recognition is unavailable. Type the Side task instead.');return;}try{const rec=new Recognition();rec.lang='en-GB';rec.interimResults=false;rec.maxAlternatives=1;const label=editor.querySelector('#voice-status');if(label)label.textContent='Listening…';rec.onresult=e=>{const value=String(e.results[0][0].transcript||'');const input=editor.querySelector('[name="voiceTitle"]');if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}if(label)label.textContent='Heard. Check the words before saving.';};rec.onerror=e=>{if(label)label.textContent='Microphone: '+e.error+'. Try typing.';};rec.onend=()=>{if(label&&label.textContent==='Listening…')label.textContent='Stopped listening.';};rec.start();dialogCleanup=()=>rec.abort();}catch(e){notice('Microphone is not available: '+e.message);}}
function home(){const body=`<div class="house"><div class="house-canvas"><img src="${asset('house.png')}" alt="Tidy-ish illustrated house with named rooms" fetchpriority="high">${rooms().map(r=>{const p=positions[houseKey(r)];if(!p)return '';const m=M.mess(board,r);return button(`<span class="home-meter"><span class="home-meter-fill" style="width:${M.cleanPercent(m)}%"></span><span class="phrase">${esc(M.phrase(m))}</span></span>`,'room',r.id,'house-hit',`style="left:${p[0]}%;top:${p[1]}%;width:${p[2]}%;height:${p[3]}%" aria-label="Open ${esc(r.name)}. Cleanliness ${Math.round(M.cleanPercent(m))} percent"`)}).join('')}</div></div>`;
return body+`<div class="padded"><div class="meter-label">${esc(M.phrase(M.householdMess(board)))}</div><div class="home-links">${button('Extra rooms','extra')}${button('All rooms','all-rooms')}</div>${seasonalHomeSection()}${whatDoIReadOnly()}${dailyGrindTiles()}${customWarningHomeIcons()}${homeSortingOrFloors()}${button(`Doing Now · ${M.doing(board).filter(t=>!t.done).length}`,'navigate','doing','wide')}${card(`${totalPoints()} points · ${F().wins.length+(F().taskDataArchives||[]).filter(a=>a.kind==='completion').reduce((n,a)=>n+(Number(a.count)||0),0)} completed`,'small')}</div>`;}
function totalPoints(){return F().wins.reduce((n,w)=>n+(w.points??1),0)+F().completionSummaries.reduce((n,w)=>n+w.count,0)+(F().taskDataArchives||[]).filter(a=>a.kind==='completion').reduce((n,a)=>n+(Number(a.points)||0),0);}
function roomScene(r){const m=M.mess(board,r),state=m>=100?3:m>=5/14*100?2:m>0?1:0,key=houseKey(r)==='storage'?'craft':houseKey(r),suffix=['spotless','clean','messy','disaster'][state];const known=['craft','cats','print','penny','hall','bathroom','master','living','kitchen','entrance'].includes(key);const catArt={spotless:'tidyish-catroom-spotless-open-trays.png',clean:'tidyish-catroom-clean-open-trays.png',messy:'tidyish-catroom-messy-open-trays.png',disaster:'tidyish-catroom-disaster-open-trays.png'};const file=key==='cats'?`room-art/${catArt[suffix]}`:known?`room-art/room-${key==='hall'?'main-landing':key}-${suffix}.${key==='penny'&&state===0?'jpg':'png'}`:r.art;const staticLiving=key==='living',guardianArt=staticLiving?asset(`sprites/living-room/still-${suffix}.png`):asset(`sprites/${key}-states.webp`),christmas=typeof seasonalTheme!=='undefined'&&seasonalTheme?.resolve(board,M.date(),seasonalDisplay)?.key==='christmas',tree=christmas&&['living','master','penny','bathroom'].includes(key)?`<img class="seasonal-room-tree seasonal-room-tree-${key}" src="${asset('seasonal/christmas/tree.webp')}" alt="" aria-hidden="true" loading="lazy">`:'';return `<div class="room-scene"><img src="${asset(file)}" alt="${esc(r.name)} · ${esc(M.phrase(m))}" loading="lazy">${tree}${known?button('<span class="guardian-speech" aria-hidden="true"></span>','creature-react',r.id,`guardian guardian-tap${staticLiving?' guardian-static':''}${christmas?' christmas-costume':''}`,`data-state="${state}" style="background-image:url('${guardianArt}')" aria-label="Tap ${esc(r.name)} creature for a reaction to the room's mess level"`):''}</div>${meter(r)}`;}
function taskToolbar(){return `<div class="toolbar">${button(detailed?'Detailed view ✓':'Compact view ✓','view')}${button('⌕','search','','search-icon','aria-label="Search tasks"')}${button('＋ Add task','add-task')}${button('▧ Photo list','photo-task-import','','ghost photo-task-import','aria-label="Add tasks from a photo"')}${button('Task Library','library-room',route==='room'?roomId:'all','ghost')}${route==='doing'?button('Choose tasks','choose'):''}${route==='doing'?button('Tools','tools'):''}${deleted&&deleted.page===pageKey()?button('Undo deleted','undo-delete'):''}</div>${search!==null&&uiSearch?`<label class="field">Search ${route==='room'?'this room':'tasks'}<input id="task-search" value="${esc(search)}" placeholder="Search tasks"></label>`:''}`;}
let uiSearch=false;
function visibleTasks(){const today=M.date(),upcomingOccasional=t=>t.occasionKind==='occasional'&&!!t.nextDue&&t.nextDue>today;let list=route==='doing'?(doingTab==='attention'?board.tasks.filter(t=>t.attention&&!M.paused(t)):M.doing(board)):route==='room'?board.tasks.filter(t=>t.room===roomId&&!M.paused(t)&&(tab==='side'?t.side:tab==='homeless'?false:!t.side)):board.tasks.filter(t=>t.side&&!M.paused(t)&&(sideTab==='all'||t.sideKind===sideTab));
if(route==='room'&&tab==='tasks')list=list.filter(t=>!upcomingOccasional(t)&&(!V?.isManaged(t)||t.scheduleActive));if(route==='doing'){const seasonal=new Set((SW?.activeGroups(board,today)||[]).flatMap(g=>g.tasks.map(t=>t.id)));list=list.filter(t=>!upcomingOccasional(t)||seasonal.has(t.id));}if(route==='room'&&tab==='side'&&sideTab!=='all')list=list.filter(t=>t.sideKind===sideTab);if(search)list=list.filter(t=>(t.title+' '+t.notes+' '+t.children.map(c=>c.title).join(' ')).toLowerCase().includes(search.toLowerCase()));return M.orderTaskList(board,list,Date.now());}
function taskList(list,offset=0){if(!list.length)return '<p class="empty">No tasks to show</p>';return list.map((t,i)=>taskCard(t,offset+i)).join('');}
function taskCard(t,pos=0){if(route==='doing')return doingTaskCard(t,pos);const expanded=openTasks.has(t.id);return `<article class="task compact-task-card position-colour-${D.palette(pos)} ${t.children.length?'has-subtasks':''} ${t.done?'done':''}" data-task-id="${esc(t.id)}"><div class="row room-task-main">${button(t.doing?'Not on it':"I’m on it!",'select-task',t.id,'select-task',`aria-pressed="${t.doing}" aria-label="${t.doing?'Remove from':'Add to'} Doing Now: ${esc(t.title)}"`)}<div class="compact-task-center">${button(`${esc(t.title)}${t.children.length?` <span class="small room-subtask-count">${t.children.filter(c=>c.done).length}/${t.children.length}</span> <span class="room-expand-indicator" aria-hidden="true">${expanded?'▾':'▸'}</span>`:''}`,'expand',t.id,'ghost grow task-title',`aria-expanded="${expanded}"`)}<div class="actions compact-task-actions ${t.done?'compact-three-actions':''}">${button(addSubtaskArtwork,'add-child',t.id,'ghost add-subtask','aria-label="Add subtask to '+esc(t.title)+'"')}${!t.done?button('First','first',t.id,'first')+button('Last','last',t.id,'last'):''}${seasonalGiftButton(t,'icon-button')||button(stopwatch,'timer',t.id,'icon-button',`aria-label="Stopwatch for ${esc(t.title)}"`)}${button('🔧','task-menu',t.id,'room-task-menu',`aria-label="Edit and actions for ${esc(t.title)}"`)}</div></div>${button(t.done?'Undo':t.children.length?'Done em all':'✓ I did a thing!','complete',t.id,'complete room-complete')}</div>${detailed?`<div class="task-meta">${esc(room(t.room)?.name||'Homeless')} · Priority ${t.priority}${t.estimate?' · '+t.estimate+' min':''}${t.assigned?' · '+esc(t.assigned):''}${t.dueDate?' · '+esc(t.dueDate):''}</div>`:''}${expanded?childrenHtml(t):''}</article>`;}
function focusTaskCard(t,pos=0){const expanded=openTasks.has(t.id),count=t.children.filter(c=>c.done).length;return `<article class="task focus-active-card compact-task-card position-colour-${D.palette(pos)} ${t.children.length?'has-subtasks':''} ${t.done?'done':''}" data-focus-task-id="${esc(t.id)}"><div class="row room-task-main ${t.done?'compact-focus-done':''}">${t.done?'':`<button type="button" class="quest-focus-grip" data-focus-reorder="${esc(t.id)}" aria-label="Drag to reorder ${esc(t.title)}; hold and use Alt plus arrow keys">⠿</button>`}<div class="compact-task-center">${button(`${esc(t.title)}${t.children.length?` <span class="small room-subtask-count">${count}/${t.children.length}</span> <span class="room-expand-indicator" aria-hidden="true">${expanded?'▾':'▸'}</span>`:''}`,'expand',t.id,'ghost grow task-title',`aria-expanded="${expanded}"`)}<div class="actions compact-task-actions">${button(addSubtaskArtwork,'add-child',t.id,'ghost add-subtask','aria-label="Add subtask to '+esc(t.title)+'"')}${seasonalGiftButton(t,'icon-button')||button(stopwatch,'timer',t.id,'icon-button',`aria-label="Stopwatch for ${esc(t.title)}"`)}${button('🔧','task-menu',t.id,'room-task-menu',`aria-label="Edit and actions for ${esc(t.title)}"`)}${button('Remove','quest-remove-focus',t.id,'ghost focus-remove',`aria-label="Remove ${esc(t.title)} from Focus"`)}</div></div>${button(t.done?'Undo':t.children.length?'Done em all':'✓ I did a thing!','complete',t.id,'complete room-complete')}</div>${detailed?`<div class="task-meta">${esc(room(t.room)?.name||'Homeless')} · Priority ${t.priority}${t.estimate?' · '+t.estimate+' min':''}${t.assigned?' · '+esc(t.assigned):''}${t.dueDate?' · '+esc(t.dueDate):''}</div>`:''}${expanded?childrenHtml(t,'',0,true):''}</article>`;}
function safeImage(src){return /^(data:image\/(png|jpeg|webp|gif);base64,|blob:)/.test(src)?esc(src):'';}
function childrenHtml(t,parent='',depth=0,compactFocus=false){
 return M.orderChildList(board,t,parent,Date.now()).map(c=>{
  const hasChildren=t.children.some(x=>x.parentId===c.id);
  const actions=compactFocus
   ?button('⋯','child-menu',t.id,'icon-button',`data-child="${esc(c.id)}" aria-label="More actions for ${esc(c.title)}"`)
   :detail('Options',`<div class="row">${button('First','child-first',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Last','child-last',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Task Data','data-open-task',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Edit','edit-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('+ Subtask','add-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}</div>`);
  return `<div class="child room-child ${depth?'nested-child':''}" data-child-id="${esc(c.id)}" data-root-id="${esc(t.id)}" data-parent-id="${esc(parent)}"><div class="row"><button type="button" class="child-grip" aria-label="Drag ${esc(c.title)} out or reorder" title="Drag out to main tasks or rearrange subtasks; Alt + arrow keys to reorder">⠿</button><span class="grow ${c.done?'muted':''}">${c.done?'✓ ':''}${esc(c.title)}</span>${button(stopwatch,'timer',t.id,'icon-button subtask-timer',`data-child="${esc(c.id)}" aria-label="Stopwatch for ${esc(c.title)}"`)}${button(c.done?'Undo':hasChildren?'Done em all':'Done it!','child-complete',t.id,'ghost',`data-child="${esc(c.id)}"`)}${actions}</div>${childrenHtml(t,c.id,depth+1,compactFocus)}</div>`;
 }).join('');
}
function roomPage(){const r=room(roomId);if(!r)return '<p class="empty">Choose a room from House.</p>';return `${r.id==='bathroom'?'<section class="room-preview-bathroom">':''}<div class="row spread"><h1>${esc(r.name)}</h1>${button('◎ Focus!','focus',r.id)}</div>${roomScene(r)}${whatDoIReadOnly(r.id)}${button('Clear the Way','clearway',r.id,'ghost clear-way-entry')}${tabs([['tasks','Tasks'],['side','Side tasks'],['homeless','Homeless']],tab,'room-tab','nested')}${tab==='side'?tabs(sideChoices(),sideTab,'side-tab','nested'):''}${tab==='homeless'?homelessPage(r):`${taskToolbar()}${taskList(visibleTasks())}`}${detail('Room options',button('Adjust mess level','calibrate',r.id)+button('Occasional jobs','navigate','schedule','ghost'))}${r.id==='bathroom'?'</section>':''}`;}
function sideChoices(){return [['all','All'],...M.sideTabs.map(t=>[t.id,t.name]),...F().sideTabs.map(t=>[t.id,t.name])];}
function dateLabel(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';}
function creatorLabel(t){const from=t.createdByName||t.addedByName||t.creatorName||t.createdBy?.name||t.createdBy||t.androidTask?.createdByName||t.androidTask?.addedByName;return typeof from==='string'&&from.trim()?from:'Not recorded';}
// Position colours: preserve the first six approved muted tones, then generate
// distinct muted hues for additional Tasks. Colours follow list position.
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
 <div class="doing-task-center">
 <div class="doing-task-title-row">
 ${button(esc(t.title)+(t.children.length?` <span class="expand-indicator" aria-hidden="true">${expanded?'▾':'▸'}</span>`:''),'expand',t.id,'ghost doing-task-title',`aria-expanded="${expanded}"`)}
 ${t.children.length?`<span class="doing-subtask-count" aria-label="${count} of ${t.children.length} subtasks complete">${count}/${t.children.length}</span>`:''}
 </div>
 <div class="doing-task-actions">
 ${button(addSubtaskArtwork,'add-child',t.id,'ghost add-subtask','aria-label="Add subtask to '+esc(t.title)+'"')}
 ${button('First','first',t.id,'first doing-order')}${button('Last','last',t.id,'last doing-order')}
 ${button('🔧','task-menu',t.id,'doing-more',`aria-label="Edit and actions for ${esc(t.title)}"`)}
 ${seasonalGiftButton(t,'doing-timer')||button(phoneClock,'timer',t.id,'doing-timer',`aria-label="Set phone alarm timer for ${esc(t.title)}"`)}
 </div>
 </div>
 ${button(t.children.length?'Done em all':'✓ I did a thing!','complete',t.id,'complete doing-complete')}
 </div>
 ${doingDetailed?`<div class="doing-meta"><span>Added: ${esc(dateLabel(t.createdAt))}</span><span>By: ${esc(creatorLabel(t))}</span><span>Assigned: ${esc(t.assigned||'Anyone')}</span></div>`:''}
 ${expanded?doingChildren(t):''}
 </article>`;
}
function doingChildren(t,parent='',depth=0){
 return M.orderChildList(board,t,parent,Date.now()).map(c=>`
 <div class="child doing-child ${c.done?'child-finished':''} ${depth?'nested-child':''}" data-child-id="${esc(c.id)}" data-root-id="${esc(t.id)}" data-parent-id="${esc(parent)}">
 <button type="button" class="child-grip" draggable="false" aria-label="Drag to reorder ${esc(c.title)}" title="Drag to reorder; Alt + arrow keys also work">⠿</button>
 <span class="doing-child-title ${c.done?'muted':''}">${c.done?'✓ ':''}${esc(c.title)}</span>
 ${button(stopwatch,'timer',t.id,'icon-button subtask-timer',`data-child="${esc(c.id)}" aria-label="Stopwatch for ${esc(c.title)}"`)}
 ${button(c.done?'Undo':t.children.some(x=>x.parentId===c.id)?'Done em all':'✓ Done it!','child-complete',t.id,c.done?'child-undo':'child-done',`data-child="${esc(c.id)}"`)}
 </div>${doingChildren(t,c.id,depth+1)}`).join('');
}
function completedDoingList(tasks){
 if(!tasks.length)return '';
 return `<section class="doing-finished" aria-label="Recently completed tasks"><h2>Completed</h2><div class="doing-finished-rows">${tasks.map(t=>`<div class="doing-finished-row"><span>✓ ${esc(t.title)}</span>${button('Undo','complete',t.id,'doing-undo')}</div>`).join('')}</div></section>`;
}
function doingPage(){
 const nav=tabs([['doing','Doing Now'],['laundry','Laundry'],['attention','Needs Done']],doingTab,'doing-tab','nested');
 if(doingTab==='laundry')return `<div class="doing-board">${nav}${laundryPage(false)}</div>`;
 const list=visibleTasks(),active=list.filter(t=>!t.done),now=Date.now();
 const seasonal=doingTab==='doing'?(SW?.activeGroups(board,M.date())||[]):[],seasonalIds=new Set(seasonal.flatMap(g=>g.tasks.map(t=>t.id))),ordinary=active.filter(t=>!seasonalIds.has(t.id));
 const seasonalHtml=seasonal.map(g=>{const tasks=active.filter(t=>g.tasks.some(x=>x.id===t.id));return tasks.length?`<section class="seasonal-doing-section room-task-section"><div class="room-heading">${button(esc(g.name),'seasonal-open',g.id,'wide ghost')}</div>${taskList(tasks)}</section>`:'';}).join('');
 const recent=list.filter(t=>t.done&&M.isTaskCompletionVisible(board,t,now)).sort((a,z)=>M.taskCompletionTime(board,z)-M.taskCompletionTime(board,a));
 const view=`<div class="doing-view" role="group" aria-label="Task view">${button('Compact','set-doing-view','compact',doingDetailed?'':'selected',`aria-pressed="${!doingDetailed}"`)}${button('Detailed','set-doing-view','detailed',doingDetailed?'selected':'',`aria-pressed="${doingDetailed}"`)}</div>`;
 return `<div class="doing-board">${nav}<div class="doing-toolbar">${view}${button('＋ Add a task','add-task','','add-task-button')}${button('▧ Photo list','photo-task-import','','ghost photo-task-import','aria-label="Add tasks from a photo"')}${button('Doing Now Focus','doing-focus','','doing-focus-entry')}</div>${seasonalHtml}${ordinary.length?groupedTasks(ordinary):!seasonalHtml?'<p class="empty">No active tasks to show</p>':''}${completedDoingList(recent)}${deleted&&deleted.page===pageKey()?button('Undo deleted','undo-delete','','ghost'):''}</div>`;
}
function guardianThumb(id){
 const r=room(id);if(!r)return '';
 // Use the same full-image room portrait as Activity Calendar.
 const art=window.TidyActivityData?.artForRoom?.(r.id);
 return art?`<span class="guardian-thumb guardian-thumb-calendar" style="background-image:url('${asset(`activity-calendar/${art}`)}')" role="img" aria-label="${esc(r.name)} character"></span>`:'<span class="guardian-thumb simple-room" aria-hidden="true">⌂</span>';
}
function groupedTasks(list){if(!list.length)return '<p class="empty">No tasks to show</p>';const side=route==='side',groups=[...new Set(list.map(t=>t.room??''))],state=side?sideCollapsed:collapsed;return groups.map(id=>{const key=side?JSON.stringify([sideTab,id]):id,isClosed=state.has(key);const group=list.filter(t=>(t.room??'')===id);const offset=groups.slice(0,groups.indexOf(id)).reduce((sum,prev)=>sum+list.filter(t=>(t.room??'')===prev).length,0);return `<section class="room-task-section room-tone-${Math.max(0,rooms().findIndex(r=>r.id===id))%12}"><div class="room-heading"><div class="room-heading-identity">${guardianThumb(id)}${button(`${isClosed?'▸':'▾'} ${esc(room(id)?.name||'Homeless')}`,'collapse',id,'ghost grow room-name',`aria-expanded="${!isClosed}"`)}</div>${side?'':`<div class="room-heading-controls">${room(id)?button('Focus','focus',id,'room-focus'):''}${button('Tools','tools',id,'room-tools')}</div>`}</div>${isClosed?'':taskList(group,offset)}</section>`;}).join('');}

function sidePage(){return `${tabs(sideChoices(),sideTab,'side-tab','nested')}${button('＋ New tab','new-side-tab','', 'ghost')}${taskToolbar()}<div class="side-task-board">${groupedTasks(visibleTasks())}</div>`;}
function laundryRewashHost(load){
 const slot=Number(load?.slot),eligible=slot>0&&(Number(load.step)>0||!!load.complete||!!load.manual&&Number(load.revision)>=3);
 if(!eligible)return '';
 const label=load.uniformWeek?'Uniform · load '+slot:'Load '+slot,loadId=slot+':'+(Number(load.startedAt)||Number(load.revision)||0);
 return '<span class="tidyish-daily-log-snapshot" data-daily-log-rewash="'+slot+'" data-load-id="'+esc(loadId)+'" data-label="'+esc(label)+'"></span>';
}
function laundryLoad(l,compact){const ready=M.laundryNeedsAttention(l),title=l.uniformWeek?'Uniform · put away':l.step===0?'Washing load':l.step===1?'Ready to dry':l.route==='dryer'?'Washing & dryer':'Washing & rail',art=l.step<=1?'activity-calendar/laundry.svg':l.route==='dryer'?'laundry-dryer.svg':'laundry-rail.svg',alt=l.step===0?'Washing machine':l.step===1?'Load ready to dry':l.route==='dryer'?'Tumble dryer':'Clothes hanging on a rail',progress=`<div class="laundry-progress" role="img" aria-label="Step ${l.step+1} of 3">${[0,1,2].map(i=>`<span class="${i<l.step?'complete':i===l.step?'current':''}"></span>`).join('')}<small>${l.uniformWeek?'Uniform · ':`Load ${l.slot} · `}Step ${l.step+1} of 3</small></div>`;return `<section class="${compact?'':'card'}"><div class="laundry-card"><img src="${asset(art)}" alt="${alt}"><div class="grow"><h3>${title}</h3>${progress}${l.step===1?'<p class="small">Choose where to dry this load.</p>':l.step===2?`<p class="small">${esc(M.laundryText(F(),l))}</p>`:''}${ready?'<p class="gold small">Laundry has been ready for two hours.</p>':''}<div class="row">${l.step===1?button('Put out on rail','laundry-step',l.slot,'','data-route="rail"')+button('Put in dryer','laundry-step',l.slot,'','data-route="dryer"'):button(l.step===0?esc(F().wash):'Done it!','laundry-step',l.slot)}${laundryRewashHost(l)}${l._undo?button('Undo last step','laundry-undo',l.slot,'ghost'):''}</div></div></div></section>`;}
function uniformContent(compact){const f=F();if(f.uniformIndex<0||f.uniformPaused)return '';const text=f.uniformSteps[f.uniformIndex]||'Uniform',first=f.uniformIndex===1&&f.uniformSteps.length===7;return `<section class="${compact?'':'card'}"><div class="row spread"><h3>Wash uniform · Saturday</h3>${button('Pause uniform','uniform-pause','','ghost')}</div><div class="laundry-card"><img src="${asset('laundry/uniform.png')}" alt="School uniform"><div class="grow"><div class="small">Step ${f.uniformIndex+1} of ${f.uniformSteps.length}</div><p>${first?'Choose the first wash':esc(text)}</p>${f.uniformStartedAt&&Date.now()-f.uniformStartedAt>=7200000?'<p class="gold small">Laundry has been ready for two hours.</p>':''}<div class="row">${first?button('Wash darks','uniform-step','darks')+button('Wash whites','uniform-step','whites'):button('Done it!','uniform-step')}${f._uniformUndo?button('Undo uniform step','uniform-undo','','ghost'):''}</div>${/Hang/i.test(text)?'<p class="small">Remember to stretch out on the rail.</p>':''}</div></div></section>`;}
function finishedExtraLoad(l){return !!l.manual&&(!!l.complete||l.step===0&&Number(l.revision)>=3);}
function displayLoads(){const all=F().laundry,loads=all.filter(l=>!finishedExtraLoad(l)&&(!l.uniformWeek||l.step!==0)),active=loads.filter(l=>l.step!==0),extras=loads.filter(l=>l.step===0&&l.manual),list=[...active,...extras],primary=loads.find(l=>l.step===0&&!l.manual&&!l.uniformWeek),hasDefault=loads.some(l=>!l.manual&&!l.uniformWeek);if(primary&&!list.includes(primary))list.push(primary);if(!hasDefault)list.push({slot:0,route:'',step:0,selected:false});return list.sort((a,b)=>(a.step===1?0:1)-(b.step===1?0:1)||(a.step===1?a.startedAt-b.startedAt:0)||a.slot-b.slot);}
function editCustomCycle(id=''){const existing=id?F().customLaundryCycles.find(x=>x.id===id):null;if(id&&!existing)throw Error('Cycle no longer exists.');dialog(existing?'Edit custom cycle':'Add custom cycle',`<p class="small">Custom cycle definitions and load progress are stored in this browser only for now. Existing standard and uniform loads are unchanged. Completion history can sync.</p>${field('Cycle name','name',existing?.name||'','text','required maxlength="80"')}${area('Steps in order — one per line','steps',existing?.steps.join('\n')||'')}${check('Show a reminder two hours after completing the first step','reminder',existing?.reminderAfterFirst??true)}`,fd=>{if(change(b=>M.saveCustomCycle(b,id,{name:fd.get('name'),steps:String(fd.get('steps')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),reminderAfterFirst:fd.has('reminder')}),{sync:false}))closeDialog(true);},{saveLabel:existing?'Save cycle':'Add cycle'});}
function customCycleSettings(){return card(`<h2>Custom cycles</h2><p class="small">Saved on this browser. Editing or removing a definition does not change loads already started.</p>${F().customLaundryCycles.map(c=>`<div class="row spread custom-cycle-definition"><div class="grow"><strong>${esc(c.name)}</strong><small class="small"> · ${c.steps.length} steps</small></div>${button('Edit','custom-cycle-edit',c.id,'ghost')}${button('Remove','custom-cycle-remove',c.id,'ghost')}</div>`).join('')||'<p class="small">No custom cycles yet.</p>'}${button('＋ Add custom cycle','custom-cycle-add','','primary')}`);}
function customLaundryLoad(l,compact){const complete=l.step>=l.steps.length,ready=M.customLaundryNeedsAttention(l);return `<section class="${compact?'custom-laundry-load':'card custom-laundry-load'}"><div class="laundry-card"><img src="${asset('activity-calendar/laundry.svg')}" alt=""><div class="grow"><h3>${esc(l.name)}</h3><div class="laundry-progress"><small>${complete?'Finished':`Step ${l.step+1} of ${l.steps.length}`} · On this browser</small></div>${ready?'<p class="gold small">Laundry has been ready for two hours.</p>':''}<div class="row">${complete?'':button(esc(l.steps[l.step]),'custom-load-step',l.id,'complete')}${l.undo&&F().wins.some(w=>w.id===l.undo.winId)?button('Undo last step','custom-load-undo',l.id,'ghost',`data-completion-id="${esc(l.undo.winId)}"`):''}</div></div></div></section>`;}
function customLaundryContent(compact){const loads=F().customLaundryLoads,active=loads.filter(l=>l.step<l.steps.length),done=loads.filter(l=>l.step>=l.steps.length&&l.undo&&F().wins.some(w=>w.id===l.undo.winId));return active.map(l=>customLaundryLoad(l,compact)).join('')+(done.length?detail('Finished custom loads',done.map(l=>customLaundryLoad(l,compact)).join('')):'')+(F().customLaundryCycles.length?detail('Start a custom cycle',F().customLaundryCycles.map(c=>button(esc(c.name),'custom-load-start',c.id,'ghost wide')).join('')):'');}
function laundryContent(compact){return uniformContent(compact)+displayLoads().map(l=>laundryLoad(l,compact)).join('')+customLaundryContent(compact);}
function laundryPage(configure=false){if(configure){return `<form id="laundry-config">${card(field('Washing step','wash',F().wash)+field('Hanging rail transfer','railTransfer',F().railTransfer)+field('Dryer transfer','dryerTransfer',F().dryerTransfer)+field('Hanging rail finish','railFinish',F().railFinish)+field('Dryer finish','dryerFinish',F().dryerFinish)+detail('Uniform cycle',area('Uniform steps — one per line','uniformSteps',F().uniformSteps.join('\n')))+`<button type="submit">Save cycle</button>`)}</form>${customCycleSettings()}`;}
const finishedLoads=F().laundry.filter(l=>finishedExtraLoad(l)).sort((a,b)=>b.slot-a.slot),finishedRows=finishedLoads.map(load=>'<div class="row spread"><strong>Load '+esc(load.slot)+'</strong>'+laundryRewashHost(load)+'</div>').join('');const finished=[...F().laundry].filter(l=>finishedExtraLoad(l)&&l._undo).sort((a,b)=>b.slot-a.slot)[0];return `<div class="laundry-compact-page">${laundryContent(true)}${finishedRows?detail('Finished loads',finishedRows):''}<div class="row laundry-tools">${F().uniformPaused||F().uniformIndex<0?button(F().uniformPaused?'Resume uniform':'Pause uniform',F().uniformPaused?'uniform-resume':'uniform-pause'):''}${button('Laundry setup & editing','navigate','laundry-settings','ghost')}${button('Add another load','new-load','', 'ghost')}${finished?button('Undo finished load','laundry-undo',finished.slot,'ghost'):''}</div>${F().uniformIndex<0&&!F().uniformPaused?'<p class="small">Uniform returns next Saturday</p>':''}${F()._uniformUndo&&F().uniformIndex<0?button('Undo uniform step','uniform-undo','','ghost'):''}${detail('One-off laundry task',`<form id="oneoff-form">${field('Laundry task','title','','text','required')}<button>Add task</button></form>${F().items.filter(i=>i.kind==='laundry').map(i=>check(i.text,'',i.done,`data-action="laundry-oneoff" data-id="${esc(i.id)}"`)).join('')}`)}${detail('Laundry reminders',`<p class="small">The ready message appears after two hours. While this browser page is open, optional browser notifications can remind you every half hour until transfer. If Android Automate already sends laundry alerts, leave browser notifications disabled to avoid duplicate alerts. Browser notifications cannot guarantee Android-style reminders when this page is closed.</p>${button('Enable browser reminders','notifications')}`)}</div>`;}
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
function roomSettings(){return detail('Rooms & task areas',`${card(`<form id="add-room">${field('New room name','name','','text','required')}<button>Add room</button></form>`)}${rooms().map(r=>card(`<h2>${esc(r.name)}</h2><div class="row">${button('Open','room',r.id)}${button('Rename','rename-room',r.id,'ghost')}${button('First','room-first',r.id,'ghost')}${button('Archive','archive-room',r.id,'ghost')}${button('Areas','areas',r.id,'ghost')}</div>`)).join('')}${detail('Archived rooms',board.rooms.filter(r=>r.archived).map(r=>card(`${esc(r.name)} ${button('Restore','archive-room',r.id)}`)).join(''))}`)+`${detail('Common tools',`<form id="tools-form">${area('Tools — one per line','tools',F().tools.join('\n'))}<button>Save tools</button></form>`)}`; }
function settingsPage(){
 let body;
 switch(settingsTab){
  case 'household':body=`${window.TidySharing?.panel()||''}${card(`<form id="name-form">${field('Display name','name',F().displayName,'text','required')}<button>Save name</button></form>`)}`;break;
  case 'preferences':body=card(check('Sounds','sound',F().sound,'data-action="setting" data-id="sound"')+check('Reduce character motion','reduceMotion',F().reduceMotion,'data-action="setting" data-id="reduceMotion"')+check('Pause wandering','pauseWandering',F().pauseWandering,'data-action="setting" data-id="pauseWandering"'))+(typeof seasonalTheme!=='undefined'&&seasonalTheme?card('<h2>Seasonal decorations</h2><p class="small">Display preferences for this device. Tasks and countdowns are unchanged.</p>'+check('Show Seasonal decorations','seasonalDecorations',seasonalDisplay.decorations,'data-action="seasonal-display" data-id="decorations"')+check('Animate Seasonal decorations','seasonalAnimation',seasonalDisplay.animation,'data-action="seasonal-display" data-id="animation"')+'<p class="small">Device reduced-motion settings also stop animation.</p>'):'');break;
  case 'rooms':body=roomSettings();break;
  case 'schedule':body=card(button('Occasional & seasonal schedule','navigate','schedule','ghost wide'));break;
  case 'about':body=detail('About this version','<p class="small">Tidy-ish stores tasks locally and can connect to household sync from Settings. Connection and cross-device delivery must be verified on your devices. Back up before importing another household. Occasional jobs are editable; the old full schedule wizard is not used.</p>',true);break;
  default:body=backupPage();break;
 }
 const tabButtons=settingsTabs.map(([id,label])=>button(esc(label),'settings-tab',id,id===settingsTab?'active':'',`id="settings-tab-${id}" role="tab" aria-selected="${id===settingsTab}" aria-controls="settings-panel" tabindex="${id===settingsTab?0:-1}"`)).join('');
 return `<section class="settings-page"><div class="tabs settings-tabs" role="tablist" aria-label="Settings sections">${tabButtons}</div><section id="settings-panel" class="settings-panel" role="tabpanel" aria-labelledby="settings-tab-${settingsTab}" tabindex="0">${body}</section></section>`;
}
function selectSettingsTab(id){if(route!=='settings'||editor.open||!validSettingsTab(id))return;settingsTab=id;rememberBackState();render();$('#settings-tab-'+id)?.focus();}
function settingsTabKey(event){const target=event.target.closest?.('[data-action="settings-tab"]');if(route!=='settings'||!target||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const ids=settingsTabs.map(([id])=>id),index=ids.indexOf(target.dataset.id);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?ids.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+ids.length)%ids.length;selectSettingsTab(ids[next]);}
function helpPage(){return [
['Tasks & Doing Now','Add tasks in a room or Doing Now. New tasks go first. Tick selection adds a task to Doing Now; unticking it keeps the task in its room and awards no points. Compact view keeps the essential controls together. Search filters the current list. First and Last change order. Drag a card to another card to place it before that task.'],
['Subtasks, completion & Undo','Tap a task name to show subtasks. + adds subtasks; enter one per line. Each subtask has its own timer and Edit controls. Completing a parent asks “Done em all”. Leaf subtasks award one point each; the parent awards no extra point. Undo reverses the completion and its points. Delete requires confirmation; Undo deleted restores it during this visit.'],
['Room mess meters','Room meters show cleanliness: full means spotless. Phrases come from the supplied mess-phrase.js. Task impact and unfinished leaf subtasks affect mess. Adjust mess level calibrates the room without completing or changing any tasks. Room names are already part of the Home artwork.'],
['Focus','Room Focus offers Clear the Way first or Skip to choose tasks from one room. Doing Now Focus shows tasks already in Doing Now across all rooms. Resume shows the saved task list and lets you change it. Removing a task from Focus keeps it in its room and Doing Now lists. Focus never automatically adds tasks to Doing Now.'],
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
  const today=calendarToday(),history=activityReady()?window.TidyActivityHost.monthSummary(dailyLogHistoryBoard(),from.slice(0,7)):{};
  const leading=(new Date(from+'T12:00:00').getDay()+6)%7;
  const cells=Array.from({length:leading},()=>'<span class="calendar-spacer" aria-hidden="true"></span>').join('')+
  Array.from({length:days},(_,i)=>{
   const day=S.addDays(from,i),past=day<today,activity=day<=today?history[day]:null;
   const entry=lookup.get(day),total=past?0:(entry?.items.length||0),kinds=new Set((entry?.items||[]).map(row=>{const task=board.tasks.find(t=>t.id===row.taskId);return !task?'':task.seasonMonth?'seasonal':task.occasionKind==='occasional'?'occasional':'';}));
   const birthdays=[...birthdayGifts.filter(g=>g.eventDate.slice(5)===day.slice(5)),...(SW?.birthdayMarks(board)||[]).filter(g=>g.date===day).map(g=>({recipient:g.name}))],birthdaySymbol=birthdays.length?`<span class="calendar-kind-symbol birthday" aria-label="Birthday: ${esc(birthdays.map(g=>g.recipient).join(', '))}" title="Birthday: ${esc(birthdays.map(g=>g.recipient).join(', '))}">🎂</span>`:'';
   const taskSymbols=`${kinds.has('occasional')?'<span class="calendar-kind-symbol" aria-label="Occasional task" title="Occasional task">✦</span>':''}${kinds.has('seasonal')?'<span class="calendar-kind-symbol seasonal" aria-label="Seasonal task" title="Seasonal task">🍂</span>':''}${birthdaySymbol}`;
   const symbol=activity?.symbol?`<span class="calendar-activity-symbol" aria-hidden="true">${esc(activity.symbol)}</span>`:'';
   const art=activity?.count&&!symbol?`<span class="calendar-activity-portrait ring-${esc(activity.ring)}"><img src="${asset('activity-calendar/'+activity.art)}" alt="" loading="lazy"></span>`:'';
   const mark=past&&!activity?.marked?'<span class="calendar-empty-mark" aria-hidden="true">＋</span>':'';
   const description=(day===today?'Today':past?(activity?.count?`${activity.count} completed tasks`:(activity?.occasion||'Blank day; choose a personal symbol')):`${total} selected calendar tasks`)+(birthdays.length?`; birthday: ${birthdays.map(g=>g.recipient).join(', ')}`:'');
   return button(`<strong>${i+1}</strong>${symbol||art||mark}${taskSymbols}${activity?.count?`<span class="activity-count">${activity.count} done</span>`:''}${total?`<span class="count">${total} planned</span>`:''}`,'calendar-day',day,'calendar-day'+(day===today?' today':'')+(past?' calendar-past':''),`aria-label="${esc(dayHeading(day))}: ${esc(description)}"`);
  }).join('');
  const message=activityLoadError?`<p class="error">Activity portraits couldn't load: ${esc(activityLoadError)} ${button('Try again','activity-retry','','ghost')}</p>`:!activityReady()?'<p class="calendar-footnote">Loading past activity symbols…</p>':'';
  // Show the next year of due dates, grouped into compact month accordions.
  const occasionalJobs=(OCC?.tasks(board)||[]).filter(t=>t.calendarEnabled===true),monthGroups=new Map();
  for(const t of occasionalJobs){
   const setting=OCAL.settings(t),dates=OCAL.dates(t,today,366),visibleDates=dates.length?dates:(setting.firstDue>=today?[setting.firstDue]:[]);
   for(const due of visibleDates){const month=due.slice(0,7);if(!monthGroups.has(month))monthGroups.set(month,[]);monthGroups.get(month).push({task:t,due});}
  }
  const orderedMonths=[...monthGroups.entries()].sort(([a],[b])=>a.localeCompare(b));
  const monthList=orderedMonths.map(([key,rows],index)=>`<details class="calendar-occasion-month" ${index===0?'open':''}><summary>${esc(new Date(`${key}-15T12:00:00`).toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}<span class="small">${rows.length}</span></summary>${rows.sort((a,b)=>a.due.localeCompare(b.due)||a.task.title.localeCompare(b.task.title)).map(({task:t,due})=>`<div class="calendar-occasion-row"><time datetime="${esc(due)}">${esc(new Date(`${due}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',weekday:'short'}))}</time><strong>${esc(t.title)}</strong><span class="small">${esc(room(t.room)?.name||'Whole house')}${t.seasonMonth?' · Seasonal':''}</span></div>`).join('')}</details>`).join('');
  const upcoming=card(`<div class="row spread"><h3>Occasional &amp; seasonal (${occasionalJobs.length})</h3><div class="row">${button('View / edit all','navigate','schedule','ghost')}</div></div>${monthList||'<p class="small">No occasional or seasonal tasks are on the calendar.</p>'}`);
  return `<section class="calendar-view">${views}<div class="calendar-month-head">${button('‹','calendar-month-prev','','ghost','aria-label="Previous month"')}<h2>${esc(month.toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}</h2>${button('›','calendar-month-next','','ghost','aria-label="Next month"')}</div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(s=>`<strong class="calendar-heading">${s}</strong>`).join('')}${cells}</div><p class="calendar-footnote"><span>✦ Occasional</span> · <span>🍂 Seasonal</span> · <span>🎂 Birthday</span> · Select a past day to add an activity symbol.</p>${message}${upcoming}${button('🎁 Gift tracker','navigate','gifts','ghost wide')}</section>`;
}
function calendarChoose(){essentialsSetup();}
function calendarDay(iso){
  if(iso<calendarToday()){
   dialog(dayHeading(iso),`<div class="calendar-daybook" data-daily-log-calendar-snapshot data-date="${esc(iso)}"></div><div class="row">${button('Activity symbols and notes','calendar-view-activity',iso,'ghost')}${button('Open Daily Log','daily-log-open',iso,'ghost')}</div>`);
   renderCalendarDailyLogSnapshot(editor.querySelector('[data-daily-log-calendar-snapshot]'),iso);return;
  }
  const entry=plannedMonth().plan.days.find(d=>d.date===iso);
  const rows=entry?.items.map(t=>`<div class="calendar-detail-row"><div class="grow"><strong>${esc(t.title)}</strong><div class="small">${esc(room(t.room)?.name||'General')}${t.minutes!=null?' · '+esc(t.minutes)+' min':''}</div></div>${button('Skip this time','skip-date',t.taskId,'ghost',`data-date="${esc(t.due)}"`)}</div>`).join('')||'<p>No selected tasks planned on this date.</p>';
  const todayButton=iso===calendarToday()?`<div class="row">${button('View today’s completed activity','calendar-view-activity',iso,'ghost')}</div>`:'';
  dialog(dayHeading(iso),rows+todayButton+`<div class="calendar-daybook" data-daily-log-calendar-snapshot data-date="${esc(iso)}"></div><div class="row">${button('Open Daily Log','daily-log-open',iso,'ghost')}</div>`);
  renderCalendarDailyLogSnapshot(editor.querySelector('[data-daily-log-calendar-snapshot]'),iso);
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
function managementRoomGroups(items,renderItem,roomIdOf=t=>t.room){
 const groups=new Map();for(const item of items){const id=roomIdOf(item)||'';if(!groups.has(id))groups.set(id,[]);groups.get(id).push(item);}
 return [...groups].map(([id,rows])=>`<details open class="room-task-section management-room-group"><summary><span class="management-room-heading">${guardianThumb(id)}<strong>${esc(room(id)?.name||(id?'Unknown room':'General'))}</strong><small>${rows.length}</small></span></summary><div class="management-room-rows">${rows.map(renderItem).join('')}</div></details>`).join('');
}
function schedulePage(){
 const rows=OCC?.tasks(board)||[];
 const renderRow=t=>`<article class="management-row occasional-row"><div class="management-copy"><strong>${esc(t.title)}</strong><div class="small">${t.calendarEnabled===true?'On calendar':'Not on calendar'} · Next: ${esc(OCAL.settings(t).firstDue||'Date not set')} · ${esc(OCAL.settings(t).unit==='once'?'Once':`Every ${OCAL.settings(t).every} ${OCAL.settings(t).unit}`)}${t.seasonMonth?' · UK calendar month '+t.seasonMonth:''}</div></div><div class="management-actions">${button('I did a thing!','occasional-done',t.id,'complete')}${t._occasionalUndo?button('Undo last','occasional-undo',t.id,'ghost'):''}${button(t.calendarEnabled===true?'Remove from calendar':'Add to calendar','occasional-toggle-calendar',t.id,'ghost')}${button('Edit','occasional-edit',t.id,'ghost')}${button('Delete','occasional-delete',t.id,'ghost')}</div></article>`;
 return `<section class="schedule-paused management-page"><h2>Manage Occasional &amp; Seasonal Tasks (${rows.length})</h2>${card(`<div class="row">${button('Due checks','library-occasional','','ghost')}${button('＋ Add missing list jobs','essentials-setup','','ghost')}${button('＋ Add my own','occasional-add','','ghost')}</div><p class="small">Review dates, repeat intervals and rooms before adding tasks to the calendar.</p><p class="small">The supplied list marks the tumble-dryer internal-filter clean as high priority every 3 months. Follow your appliance manual.</p>`)}${managementRoomGroups(rows,renderRow)||'<p>No Occasional Essentials saved yet.</p>'}</section>`;
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
function dataCompletionRow(w,withPoints=false){
 const title=String(w.title||'Completed task');
 const details=`${esc(dailyLogCompletionLabel(w))} · ${esc(w.person||'Unattributed')}${withPoints?` · ${Number(w.points)||0} point(s)`:''}`;
 return `<div class="data-completion data-completion-record"><div class="data-completion-line"><strong>${esc(title)}</strong><span class="data-completion-meta"> · ${details}</span></div>${button('<span aria-hidden="true">🔧</span>','data-edit-completion',w.id,'ghost data-completion-edit',`aria-label="Edit completion: ${esc(title)}" title="Edit completion"`)}</div>`;
}
function editDataCompletion(id){
 const win=(F().wins||[]).find(w=>w?.id===id),core=window.TidyDailyLogCore,TD=window.TidyTaskData;
 if(!win||!core?.completionDate||!TD?.editCompletion){notice('Completion editing is unavailable. No changes were saved.');return;}
 let effective;
 try{effective=core.completionDate(dailyLogState(),win);}catch(error){notice(error.message);return;}
 if(effective.conflict){notice('Resolve this completion date conflict in Daily Log before editing.');return;}
 const day=effective.date||TD.completionDay(win);
 if(!day){notice('This completion has no valid date to correct.');return;}
 const content=`<p class="small">This edits the historical record only. The Task, original time, points and timers stay unchanged.</p>`+(win._kind==='little-often'?button('Remove this completion','data-remove-quick-completion',win.id,'ghost',`aria-label="Remove completion: ${esc(win.title)}"`):'')+field('Completed task title','title',win.title||'','text','required maxlength="140"')+field('Completed by (display name)','person',win.person||'Unattributed','text','required maxlength="100"')+field('Completion date','date',day,'date','required');
 dialog('Edit completed task',content,fd=>{
  const values={title:fd.get('title'),person:fd.get('person'),date:fd.get('date')};
  if(change(b=>TD.editCompletion(b,id,values,core))){
   closeDialog(true);
   if(route==='data'&&dataView==='day'&&dataDay!==String(values.date)){dataDay=String(values.date);render();}
   notice('Completion corrected. Original time, points and timers were kept.');
  }
 },{saveLabel:'Save correction'});
}
function dataTaskPanel(){
 const rootTask=task(dataTaskId),child=rootTask?.children.find(c=>c.id===dataTaskId),t=child||rootTask;if(!t)return `<p>Task unavailable.</p>${button('Back to Task Data','data-task-back','','ghost')}`;
 const historyBoard=dailyLogHistoryBoard(),d=window.TidyTaskData?.perQuest(historyBoard,t.id,TIME.ownerOf(board));if(!d)return '<p>History unavailable.</p>';
 const when=at=>at&&Number.isFinite(Date.parse(at))?dateLabel(at):'Date not recorded';
 const time=ms=>ms===null?'Unknown':TIME.format(ms);
 const grouped=(rows,type)=>rows.map(row=>`<div class="data-completion"><strong>${esc(row.period)} · ${row.count} ${type==='completion'?'completion':'attempt'}${row.count===1?'':'s'}${type==='completion'?` · ${row.points} point(s)`:''}</strong><span>${type==='attempt'?Object.entries(row.kinds).map(([kind,count])=>`${count} ${kind}`).join(' · ')+(row.excludedCount?` · ${row.excludedCount} excluded`:'')+(row.notedCount?` · ${row.notedCount} noted`:''):''}</span></div>`).join('');
 const cutoffDate=new Date();cutoffDate.setFullYear(cutoffDate.getFullYear()-1);const before=[cutoffDate.getFullYear(),String(cutoffDate.getMonth()+1).padStart(2,'0'),String(cutoffDate.getDate()).padStart(2,'0')].join('-');
 const memory=MEM?.status?.(historyBoard,t),days=memory?.daysSince;
 const checkDays=Number(t.checkDays)||0;
 const percent=memory?.lastDone?(checkDays>0&&days!==null?Math.max(0,Math.min(100,Math.round((1-days/checkDays)*100))):100):0;
 const perTaskMeter=`<section class="quest-memory-meter" aria-label="Task completion and inspection status"><div class="row spread"><strong>Task memory</strong><div class="row">${button('Clean Meter','data-meter-view','clean',dataMeterView==='clean'?'selected':'ghost')}${button('Since last done','data-meter-view','elapsed',dataMeterView==='elapsed'?'selected':'ghost')}</div></div>${dataMeterView==='clean'?`<div class="fancy-meter ${percent>=90?'clean':percent>=60?'lived':percent>=20?'messy':'chaos'}" role="meter" aria-label="Recorded completion freshness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span class="meter-fill" style="width:${percent}%"></span></div><p class="small">${!memory?.lastDone?'No completion has been recorded.':checkDays>0?'Based on the optional check interval, not a measurement of real cleanliness.':'Shows the last recorded completion only. This as-needed Task has no automatic cleanliness estimate.'}</p>`:`<p><strong>${days===null?'Never recorded':days===0?'Completed today':days+' calendar day'+(days===1?'':'s')+' since last completion'}</strong></p><p class="small">${memory?.mode==='condition'?'Check the actual condition before deciding to clean.':esc(memory?.label||'As needed')}</p>`}</section>`;
 const completions=card(`<h3>Completions</h3>${d.wins.slice(0,12).map(w=>dataCompletionRow(w,true)).join('')||'<p>No recorded completions yet.</p>'}${d.olderWinPeriods.length?`<h4>Older completion summaries</h4>${grouped(d.olderWinPeriods,'completion')}`:''}`);
 const modeToggle=button(t.oneOff?'One-off · make repeatable':'Mark as one-off','data-one-off-toggle',t.id,t.oneOff?'selected':'ghost');
 if(t.oneOff)return `<section class="task-data-page">${button('‹ Task Data','data-task-back','','ghost')}<div class="row spread"><h2>${esc(t.title)}</h2>${modeToggle}</div><div class="data-metrics">${card(`<strong>${d.count}</strong><span>Completions</span>`)}${card(`<strong>${d.points}</strong><span>Points</span>`)}</div>${completions}${button('Export this Task history','data-export-quest',t.id,'ghost')}</section>`;
 return `<section class="task-data-page">${button('‹ Task Data','data-task-back','','ghost')}<div class="row spread"><h2>${esc(t.title)}</h2><div class="row">${modeToggle}${button('Export this Task history','data-export-quest',t.id,'ghost')}</div></div>${perTaskMeter}<div class="data-metrics">${card(`<strong>${d.count}</strong><span>Completions</span>`)}${card(`<strong>${d.lastDone?esc(dailyLogCompletionLabel(d.wins[0])):'Unknown'}</strong><span>Most recent completion</span>`)}${card(`<strong>${time(d.fastestMs)}</strong><span>Fastest valid time (mine)</span>`)}${card(`<strong>${time(d.slowestMs)}</strong><span>Slowest valid time (mine)</span>`)}${card(`<strong>${time(d.averageMs)}</strong><span>Recent-weighted average (mine)</span>`)}</div>${completions}${card(`<h3>Timed attempts · all household members</h3>${(d.visibleAttempts||[]).map(r=>`<div class="data-completion"><strong>${esc(time(r.durationMs))} elapsed · ${esc(r.kind)}${r.kind==='distracted'&&r.distractionMinutes!==undefined?` · ${esc(String(r.distractionMinutes))} min distracted · ${esc(time(TIME.learningDuration(r)??0))} work`:''}${r.excludedFromLearning?' · Excluded from estimate':''}</strong><span>${esc(when(r.at))} · ${esc(r.owner||'Unattributed')}</span>${r.note?`<p>${esc(r.note)}</p>`:''}${TIME.valid(r)?button('Exclude from estimate','data-exclude-time',r.id,'ghost'):''}</div>`).join('')||'<p>No timed attempts recorded.</p>'}${d.olderAttemptPeriods.length?`<h4>Older attempt summaries</h4>${grouped(d.olderAttemptPeriods,'attempt')}`:''}</div>`)}${card(`<h3>History storage</h3><p>Export older detail before removing it. The newest eight valid times per member and Task, fastest and slowest valid times, noted attempts, latest completion, completion totals and points stay in the household record.</p><label class="field">Remove detail recorded before<input type="date" name="historyBeforeDate" value="${before}"></label>${button('Export old detail & review removal','data-archive-quest-history',t.id,'ghost')}`)}</section>`;
}
function dataPage(){
 if(dataTaskId)return dataTaskPanel();
 const viewTabs=tabs([['overview','Overview'],['day','Day'],['rooms','Rooms'],['quests','Tasks'],['focus','Focus & timers'],['occasional','Occasional/seasonal'],['daybook','Daily Log']],dataView,'data-view','nested');
 if(dataView==='daybook')return `<section class="task-data-page daily-log-page">${viewTabs}<div id="tidyish-daily-log">Loading Daily Log…</div></section>`;
 if(!window.TidyTaskData)return card('Task Data summaries are unavailable. Saved completions have not been changed.');
 const historyBoard=dailyLogHistoryBoard(),d=window.TidyTaskData.summarize(historyBoard,{period:dataPeriod,roomId:dataRoom});
 const roomChoices=[['all','All rooms'],['general','General / No room'],['laundry','Laundry'],...rooms().map(r=>[r.id,r.name])];
 const chosen=roomChoices.some(([id])=>id===dataRoom)?dataRoom:'all';
 const roomSelect=`<label class="field task-data-filter">Room<select id="data-room-filter" aria-label="Filter Task Data by room">${roomChoices.map(([id,label])=>`<option value="${esc(id)}" ${id===chosen?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
  if(dataView==='day'){
   const one=window.TidyTaskData.summarizeDay(historyBoard,{day:dataDay,roomId:dataRoom});
   const readableDay=new Date(`${dataDay}T12:00:00Z`).toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'});
   const navigation=`<div class="task-data-day-nav" role="group" aria-label="Daily Task Data date navigation">${button('‹ Previous day','data-day-prev','','ghost task-data-day-prev')}<label class="field task-data-filter task-data-day-date">Choose date<input id="data-day-picker" type="date" aria-label="Task Data date" value="${esc(dataDay)}"></label>${button('Next day ›','data-day-next','','ghost task-data-day-next')}${button('Today','data-day-today','','ghost task-data-day-today')}</div>`;
   const numbers=`<div class="data-metrics">${card(`<strong>${one.count}</strong><span>Completions</span>`)}${card(`<strong>${one.points}</strong><span>Points</span>`)}${card(`<strong>${one.minutes}</strong><span>Minutes</span>`)}</div>`;
   const rows=one.wins.map(w=>dataCompletionRow(w,true)).join('')||'<p>No recorded completions on this day.</p>';
   return `<section class="task-data-page task-data-daily-view">${viewTabs}<header class="task-data-daily-heading"><h2>Daily view</h2><p class="small">Choose a day to review completed tasks. Use the spanner to correct a record.</p></header>${navigation}${roomSelect}${numbers}${card(`<h3>Completed on ${esc(readableDay)}</h3>${rows}`)}<p class="small">Archived summaries are not assigned to individual days and cannot be edited.</p></section>`;
  }
 const barMax=Math.max(...d.entries.map(x=>x.count),1);
 const byRoom=d.entries.length?d.entries.map(x=>`<div class="bar-row"><span>${esc(room(x.id)?.name||({'general':'General','laundry':'Laundry'}[x.id]||x.id))}</span><div class="bar-track"><span class="bar" style="width:${Math.round(x.count/barMax*100)}%"></span><small>${x.count}</small></div></div>`).join(''):'<p>No recorded completions in these filters.</p>';
 const trendMax=Math.max(...d.trend.map(x=>x.count),1);
 const trend=`<div class="data-trend" role="img" aria-label="Completions by day for the last seven days: ${d.trend.map(x=>`${x.day}: ${x.count}`).join('; ')}">${d.trend.map(x=>`<div class="data-trend-day"><span class="data-trend-count">${x.count||''}</span><span class="data-trend-track"><span style="height:${x.count?Math.max(8,Math.round(x.count/trendMax*100)):0}%"></span></span><span class="data-trend-label">${esc(x.day.slice(5))}</span></div>`).join('')}</div>`;
 const history=d.wins.slice(0,dataVisible).map(w=>dataCompletionRow(w)).join('')||'<p>No recorded completions in these filters.</p>';
 const metrics=`<div class="data-metrics">${card(`<strong>${d.count}</strong><span>Completions</span>`)}${card(`<strong>${d.points}</strong><span>Points</span>`)}${card(`<strong>${d.minutes}</strong><span>Minutes</span>`)}</div>`;
 const periodTabs=tabs([['7','7 days'],['30','30 days'],['90','90 days'],['all','All']],dataPeriod,'data-period','nested');
 const common=`${viewTabs}${periodTabs}`;
 if(dataView==='quests'){
  const roots=board.tasks.filter(t=>!t.side),regular=roots.filter(t=>!t.oneOff).map(t=>({item:t,root:t,d:window.TidyTaskData.perQuest(historyBoard,t.id,TIME.ownerOf(board))})).filter(x=>x.d).sort((a,b)=>b.d.count-a.d.count);
  const oneOffs=roots.flatMap(root=>root.oneOff?[{item:root,root}]:root.children.filter(c=>c.oneOff).map(item=>({item,root}))).map(x=>({...x,d:window.TidyTaskData.perQuest(historyBoard,x.item.id,TIME.ownerOf(board))})).filter(x=>x.d).sort((a,b)=>b.d.count-a.d.count);
  const rows=regular.map(({item,root,d})=>`<article class="data-completion"><strong>${esc(item.title)}</strong><span>${esc(room(root.room)?.name||'Whole house')} · ${d.count} completions · ${d.points} points · fastest ${d.fastestMs==null?'—':TIME.format(d.fastestMs)} · slowest ${d.slowestMs==null?'—':TIME.format(d.slowestMs)}</span>${button('Details','data-open-task',root.id,'ghost')}</article>`).join('')||'<p>No repeatable Tasks.</p>';
  const oneOffRows=oneOffs.map(({item,root,d})=>`<article class="data-completion"><strong>${item.id!==root.id?`<small>${esc(root.title)} · </small>`:''}${esc(item.title)}</strong><span>${esc(room(root.room)?.name||'Whole house')} · ${d.count} completions · ${d.points} points</span>${button('Details','data-open-task',root.id,'ghost',item.id!==root.id?`data-child="${esc(item.id)}"`:'')}</article>`).join('')||'<p>No one-off tasks.</p>';
  return `<section class="task-data-page">${common}${metrics}${card(`<h2>Task statistics</h2>${rows}`)}${card(`<details class="task-data-oneoffs"><summary>One-offs · ${oneOffs.length}</summary>${oneOffRows}</details>`)}</section>`;
 }
 if(dataView==='focus'){
  const attempts=board.features.questTimings||[],valid=attempts.filter(x=>TIME.valid(x)),noted=attempts.filter(x=>String(x.note||'').trim()),avg=valid.length?Math.round(valid.reduce((n,x)=>n+Number(x.durationMs),0)/valid.length):0;
  const rows=[...attempts].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))).slice(0,30).map(x=>`<div class="data-completion"><strong>${TIME.format(Number(x.durationMs)||0)} · ${esc(x.kind||'Focus')}</strong><span>${esc(window.TidyTaskData.attemptTitle(board,x))} · ${esc(x.person||String(x.owner||'Household').split('|member:').at(-1))} · ${x.excludedFromLearning?'Excluded from estimates':x.kind==='valid'?'Included in estimates':'Not used for estimates'}${x.note?` · “${esc(x.note)}”`:''}</span></div>`).join('')||'<p>No Focus attempts recorded.</p>';
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
function giftPeopleWithLegacy(){
 const people=(board.features.giftPeople||[]).map(p=>({...p,tracker:p.tracker!==false})),known=new Set(people.map(p=>p.name.toLocaleLowerCase()));
 for(const name of [...new Set((board.features.gifts||[]).map(g=>String(g.recipient||'').trim()).filter(Boolean))])if(!known.has(name.toLocaleLowerCase()))people.push({id:'legacy:'+encodeURIComponent(name),name,tracker:true,legacy:true});
 return people;
}
function giftForPerson(g,p){return g.recipientId===p.id||g.recipient?.toLocaleLowerCase()===p.name.toLocaleLowerCase();}
function giftTrackerPage(){
 const gifts=(board.features.gifts||[]).filter(g=>!christmasLinked(g.id)),people=giftPeopleWithLegacy(),trackers=people.filter(p=>p.tracker!==false),personTabs=[['all','All People'],...trackers.map(p=>[p.id,p.name])];
 if(!personTabs.some(([id])=>id===giftPersonTab))giftPersonTab='all';
 const person=trackers.find(p=>p.id===giftPersonTab),checkoffPeople=people.filter(p=>p.tracker===false);
 const checkoffRow=p=>{const check=occasion=>{const active=!!p.checkoffs?.[occasion];return button(`${active?'✓':'○'} ${occasion==='christmas'?'Christmas':'Birthday'}`,'gift-checkoff-toggle',p.id+'|'+occasion,'gift-checkoff',`aria-pressed="${active}"`)};return `<div class="gift-person-checkoff"><strong>${esc(p.name)}</strong><div class="row">${giftView==='all'?`${check('christmas')}${check('birthday')}`:check(giftView)}</div></div>`};
 const trackerRow=p=>`<div class="gift-person-checkoff"><strong>${esc(p.name)}</strong>${button('Tracker ›','gift-person-view',p.id,'ghost')}</div>`;
 if(!person){const rows=[...trackers.map(trackerRow),...checkoffPeople.map(checkoffRow)].join('')||'<p>No people added yet.</p>';return `<section class="task-data-page gift-tracker">${tabs(personTabs,'all','gift-person-view','nested')}${tabs([['christmas','Christmas'],['birthday','Birthdays'],['all','All occasions']],giftView,'gift-occasion','nested')}<div class="row spread"><h2>All people</h2><div class="row">${button('＋ Add people','gift-checkoff-people-add','','ghost')}${button('＋ Add person with tracker','gift-person-add','','primary')}</div></div>${card(rows)}${christmasGiftLinks()}</section>`;}
 const eventGifts=gifts.filter(g=>(giftView==='all'||g.occasion===giftView)&&giftForPerson(g,person));
 const waiting=g=>g.status==='bought'&&g.receiptStatus==='ordered',noWrap=g=>g.status==='bought'&&g.noWrapping===true&&!waiting(g),needs=g=>g.status==='bought'&&!waiting(g)&&!noWrap(g);
 const giftTabs=[['needs-wrap','Needs wrapped'],['wrapped','Wrapped'],...(eventGifts.some(waiting)?[['awaiting-receipt','Awaiting receipt']]:[]),...(eventGifts.some(noWrap)?[['no-wrapping','No wrapping needed']]:[])];
 if(!giftTabs.some(([id])=>id===giftStatusTab))giftStatusTab='needs-wrap';
 const shown=eventGifts.filter(g=>giftStatusTab==='wrapped'?g.status==='wrapped':giftStatusTab==='awaiting-receipt'?waiting(g):giftStatusTab==='no-wrapping'?noWrap(g):needs(g));
 const rows=shown.map(g=>{const price=Number(g.price??g.spent??g.budget)||0,wrapped=g.status==='wrapped';return `<article class="data-completion gift-row"><strong>${esc(g.title)}</strong><span>£${price.toFixed(2)}</span><div class="row">${waiting(g)?button('Mark received','gift-receive',g.id,'ghost'):noWrap(g)?'':button(wrapped?'Needs wrapping':'Mark wrapped','gift-wrap-toggle',g.id,'ghost')}${button('Edit','gift-edit',g.id,'ghost')}${button('Delete','gift-delete',g.id,'ghost')}</div></article>`}).join('')||`<p class="small">${giftStatusTab==='wrapped'?'No wrapped gifts yet.':giftStatusTab==='awaiting-receipt'?'No gifts awaiting receipt.':giftStatusTab==='no-wrapping'?'No gifts in this category.':'No gifts need wrapping.'}</p>`;
 const oldIdeas=gifts.filter(g=>g.status==='idea'&&giftForPerson(g,person)),ideaCount=(person.ideas||[]).length+oldIdeas.length;
 return `<section class="task-data-page gift-tracker">${tabs(personTabs,giftPersonTab,'gift-person-view','nested')}${tabs([['christmas','Christmas'],['birthday','Birthdays'],['all','All occasions']],giftView,'gift-occasion','nested')}<div class="row spread"><h2>${esc(person.name)}</h2><div class="row">${button('Ideas','gift-ideas',person.id,'ghost')}${button('＋ Add gift','gift-add',(giftView==='birthday'?'birthday':'christmas')+'|'+person.id,'primary')}</div></div>${tabs(giftTabs,giftStatusTab,'gift-status-tab','nested')}${card(rows)}${ideaCount?`<div class="gift-ideas-summary"><strong>${ideaCount} ideas</strong>${button('Open ideas','gift-ideas',person.id,'ghost')}</div>`:''}${button('Occasional & seasonal calendar','navigate','calendar','ghost wide')}</section>`;
}
function christmasLinked(id){return (board.features.occasionOccurrences||[]).some(o=>(o.giftIds||[]).includes(id)&&SW?.christmasContext?.(board,o.id));}
function christmasGiftLinks(){return (board.features.occasionOccurrences||[]).filter(o=>SW?.christmasContext?.(board,o.id)).map(o=>button('Christmas · '+esc(dateLabel(o.eventDate)),'christmas-gift-open',o.id,'wide ghost')).join('');}
function christmasGiftPage(){
 const ctx=SW?.christmasContext?.(board,christmasGiftId);if(!ctx)return card('Christmas occasion not available. No saved gifts changed.');
 if(ctx.readOnly&&typeof seasonalGiftArchiveHtml==='function')return `<section class="task-data-page gift-tracker christmas-gifts"><h2>Christmas · ${dateLabel(ctx.o.eventDate)}</h2><p class="small">Ended occasion · read only</p>${seasonalGiftArchiveHtml(ctx.o.id)}${button('Open occasion history','seasonal-open',ctx.o.id,'wide ghost')}</section>`;
 const {o,gifts,available,readOnly}=ctx,wrap=route==='christmas-wrap',people=giftPeopleWithLegacy(),trackers=people.filter(p=>p.tracker!==false),tabsList=[['all','All People'],...trackers.map(p=>[p.id,p.name])];
 if(!tabsList.some(([id])=>id===christmasPerson))christmasPerson='all';
 const person=trackers.find(p=>p.id===christmasPerson),own=person?SW.christmasOwn(gifts,person):gifts;
 const row=g=>`<article class="data-completion gift-row"><strong>${esc(g.title)}</strong><span>£${(Number(g.price??g.spent??g.budget)||0).toFixed(2)}</span><span class="small">${g.status==='idea'?'Idea':g.status==='wrapped'?'Wrapped':!SW.received(g)?'Ordered · awaiting receipt':g.noWrapping?'Received · no wrapping needed':'Received · needs wrapping'}${g.stage?' · '+esc(g.stage):''}</span>${!wrap&&(g.link||g.notes)?`<details class="christmas-gift-details"><summary>Link & notes</summary>${g.link?`<p class="small">${/^https?:\/\/[^\s]+$/i.test(g.link)?`<a href="${esc(g.link)}" target="_blank" rel="noopener noreferrer">Open gift link</a>`:esc(g.link)}</p>`:''}${g.notes?`<p class="small">${esc(g.notes)}</p>`:''}</details>`:''}${readOnly?'':`<div class="row">${g.status==='idea'?button('Buy gift','christmas-idea-buy',g.id,'primary'):g.status==='bought'&&g.receiptStatus==='ordered'?button('Mark received','christmas-receive',g.id,'ghost'):''}${SW.needsWrap(g)||g.status==='wrapped'&&!g.noWrapping?button(g.status==='wrapped'?'Needs wrapping':'Mark wrapped','christmas-wrap-toggle',g.id,'ghost'):''}${wrap?'':button('Edit','christmas-gift-edit',g.id,'ghost')+button('Delete','christmas-gift-delete',g.id,'ghost')}</div>`}</article>`;
 const section=(label,rows,empty)=>`<h3>${label}</h3>${rows.map(row).join('')||'<p class="small">'+empty+'</p>'}`;
 const wrapRows=own.filter(g=>SW.needsWrap(g)||g.status==='wrapped'&&!g.noWrapping);
 const wrapList=rows=>person?rows.map(row).join(''):Array.from(new Set(rows.map(g=>g.recipient))).map(name=>`<h4>${esc(name)}</h4>${rows.filter(g=>g.recipient===name).map(row).join('')}`).join('');
 const checkoff=p=>{const state=SW.christmasPersonSettings(p,o.id);return `<div class="gift-person-checkoff">${button((state.checked?'✓ ':'○ ')+esc(p.name),'christmas-person-check',p.id,'christmas-name-check',`role="checkbox" aria-checked="${state.checked}" ${readOnly||p.legacy?'disabled':''}`)}${!readOnly&&!p.legacy&&p.tracker===false?button('Enable tracker','christmas-person-tracker',p.id,'ghost'):''}${!readOnly&&p.legacy?button('Save person','christmas-person-save-legacy',p.id,'ghost'):''}</div>`;};
 const totals=person?SW.christmasTotals(gifts,person,o.id):null;
 const budget=person?`<div class="christmas-budget"><div><span>Budget</span><strong>${totals.budget===null?'Not set':'£'+totals.budget.toFixed(2)}</strong></div><div><span>Spent</span><strong>£${totals.spent.toFixed(2)}</strong></div><div><span>Remaining</span><strong class="${totals.remaining!==null&&totals.remaining<0?'christmas-over-budget':''}">${totals.remaining===null?'—':'£'+totals.remaining.toFixed(2)}</strong></div>${readOnly||person.legacy?'':button('Edit budget','christmas-budget',person.id,'ghost')}</div>`:'';
 const list=wrap?`<h3>Needs wrapped</h3>${wrapList(wrapRows.filter(SW.needsWrap))||'<p>No received gifts need wrapping.</p>'}<h3>Wrapped</h3>${wrapList(wrapRows.filter(g=>g.status==='wrapped'))||'<p>No wrapped gifts yet.</p>'}`:person?`${budget}${section('Needs wrapped',own.filter(SW.needsWrap),'No received gifts need wrapping.')}${section('Awaiting receipt',own.filter(g=>g.status==='bought'&&g.receiptStatus==='ordered'),'No orders waiting.')}${section('Wrapped',own.filter(g=>g.status==='wrapped'),'No wrapped gifts yet.')}${section('No wrapping needed',own.filter(g=>g.status==='bought'&&SW.received(g)&&g.noWrapping),'None.')}${section('Ideas',own.filter(g=>g.status==='idea'),'No ideas yet.')}${!readOnly&&!person.legacy?button('＋ Add idea','christmas-idea-add','','wide ghost'):''}${person.legacy&&!readOnly?button('Save this person to add gifts','christmas-person-save-legacy',person.id,'wide ghost'):''}`:people.map(checkoff).join('')||'<p>No people added yet.</p>';
 const linkable=readOnly||wrap||!person?[]:SW.christmasOwn(available,person),unassigned=gifts.filter(g=>!trackers.some(p=>SW.christmasOwn([g],p).length));
 const pending=gifts.filter(SW.needsWrap),waiting=gifts.some(g=>g.status==='bought'&&!SW.received(g)&&!g.noWrapping),relevant=gifts.filter(g=>g.status!=='idea'&&!g.noWrapping),suggest=wrap&&relevant.length>0&&!pending.length&&!waiting&&!readOnly?'All listed gifts requiring wrapping are wrapped. If finished, complete Wrap gifts yourself.':!wrap&&gifts.length>0&&gifts.every(g=>g.status!=='idea')&&!readOnly?'All listed gifts are purchased. If finished buying, complete Buy gifts yourself.':'';
 return `<section class="task-data-page gift-tracker christmas-gifts"><h2>Christmas · ${dateLabel(o.eventDate)}</h2><div class="row">${button('Gift Tracker','christmas-gift-open',o.id,wrap?'ghost':'primary')}${button('Wrapping','christmas-wrap-open',o.id,wrap?'primary':'ghost')}</div>${readOnly?'<p class="small">Ended occasion · read only</p>':''}${ctx.conflicts?'<p class="small" role="status">Some gifts are linked to multiple occasions and are excluded from changes. Their records are preserved.</p>':''}${board.features.browserSync&&!SW.shareReady(board)?'<p class="small">Automatic Seasonal changes are paused until household sharing is ready.</p>':''}${tabs(tabsList,christmasPerson,'christmas-person','nested')}${!readOnly&&!wrap?`<div class="row">${person&&!person.legacy?button('＋ Add gift','christmas-gift-add','','primary'):button('＋ Add person','christmas-person-add','','primary')}${button('Manage people','navigate','gifts','ghost')}</div>`:''}${card(list)}${!wrap&&!person&&(available.length||unassigned.length)?button('Review unlinked or unassigned gifts','christmas-review-gifts','','wide ghost'):''}${suggest?`<p role="status">${esc(suggest)}</p>`:''}${linkable.length?card(`<h3>Existing unlinked gifts for this date</h3><p class="small">Choose only gifts that belong to this Christmas. No gifts are moved automatically.</p>${linkable.map(g=>`<div class="gift-row"><strong>${esc(g.title)} · ${esc(g.recipient)}</strong>${button('Link to this Christmas','christmas-gift-link',g.id,'ghost')}</div>`).join('')}`):''}</section>`;
}
function christmasApply(action,data){const oid=christmasGiftId;return change(b=>Object.assign(b,SW.christmasGiftChange(b,oid,action,data,M.date())));}
function christmasGiftEditor(g=null,mode='bought'){
 const ctx=SW?.christmasContext?.(board,christmasGiftId);if(!ctx||ctx.readOnly)return notice('Christmas occasion is read only.');
 const people=(board.features.giftPeople||[]).filter(p=>p.tracker!==false),person=people.find(p=>p.id===g?.recipientId)||people.find(p=>p.name.toLocaleLowerCase()===g?.recipient?.toLocaleLowerCase()),selected=person?.id||(christmasPerson==='all'?'':christmasPerson),idea=mode==='idea';
 if(!people.length)return notice('Add a person with a tracker first.');
 const stageOptions=[['','No custom stage'],...Array.from(new Set([...ctx.stages,...(g?.stage?[g.stage]:[])])).map(x=>[x,x])];
 const body=select('Recipient','recipientId',[['','Choose person'],...people.map(p=>[p.id,p.name])],selected)+field(idea?'Idea':'Gift name','title',g?.title||'','text','required maxlength="160"')+(idea?'':field('Price (£)','price',g?.price??g?.spent??0,'number','min="0" step="0.01" required'))+`<details ${g?'open':''}><summary>Gift options</summary>${idea?'':select('Purchase status','receiptStatus',[['received','Bought and received'],['ordered','Ordered, awaiting delivery']],g?.status==='wrapped'?'received':g?.receiptStatus||'received')+check('Does not need wrapping','noWrapping',!!g?.noWrapping)}${stageOptions.length>1?select('Custom stage','stage',stageOptions,g?.stage||''):''}${field('Link (optional)','link',g?.link||'','url','maxlength="2000"')}${area('Notes (optional)','notes',g?.notes||'')}</details>`;
 dialog(idea?(g?'Edit idea':'Add idea'):g?'Edit Christmas gift':'Add Christmas gift',body,fd=>{if(g&&JSON.stringify(SW.christmasContext(board,christmasGiftId)?.gifts.find(x=>x.id===g.id))!==JSON.stringify(g))throw Error('This gift changed. Close and reopen before saving.');if(christmasApply(idea?'idea':'save',{id:g?.id,recipientId:fd.get('recipientId'),title:fd.get('title'),price:idea?g?.price??g?.spent??g?.budget??0:fd.get('price'),receiptStatus:idea?undefined:fd.get('receiptStatus'),noWrapping:fd.has('noWrapping'),stage:fd.get('stage')??undefined,link:fd.get('link')??undefined,notes:fd.get('notes')??undefined})){christmasPerson=fd.get('recipientId');closeDialog(true);render();}},{saveLabel:idea?'Save idea':g?'Save gift':'Add bought gift'});
}
function christmasReviewGifts(){const ctx=SW.christmasContext(board,christmasGiftId);if(!ctx)return;const people=giftPeopleWithLegacy().filter(p=>p.tracker!==false),unassigned=ctx.gifts.filter(g=>!people.some(p=>SW.christmasOwn([g],p).length));const line=(g,action,label)=>`<div class="gift-row"><strong>${esc(g.title)} · ${esc(g.recipient)}</strong>${ctx.readOnly?'':button(label,action,g.id,'ghost')}</div>`;dialog('Review gifts',`<p class="small">Existing gifts are kept unchanged unless you explicitly link or edit them.</p><h3>Unlinked for this date</h3>${ctx.available.map(g=>line(g,'christmas-gift-link','Link to this Christmas')).join('')||'<p>None.</p>'}<h3>Unassigned in this Christmas</h3>${unassigned.map(g=>line(g,'christmas-gift-edit','Edit recipient')).join('')||'<p>None.</p>'}`);}
function christmasPersonEditor(name='',tracker=false){dialog('Add Christmas person',field('Name','name',name,'text','required maxlength="100"')+check('Give this person a gift tracker','tracker',tracker),fd=>{if(christmasApply('person-add',{name:fd.get('name'),tracker:fd.has('tracker')}))closeDialog(true);},{saveLabel:'Add person'});}
function christmasBudgetEditor(id){const person=board.features.giftPeople.find(p=>p.id===id);if(!person)return;const oid=christmasGiftId,previous=SW.christmasPersonSettings(person,oid);dialog('Budget · '+person.name,field('Budget (£) — blank for no limit','budget',previous.budget??'','number','min="0" step="0.01"'),fd=>{const current=board.features.giftPeople.find(p=>p.id===id);if(!current||SW.christmasPersonSettings(current,oid).budget!==previous.budget)throw Error('This budget changed. Close and reopen before saving.');const raw=fd.get('budget');if(christmasApply('budget',{recipientId:id,budget:raw===''?null:Number(raw)}))closeDialog(true);});}
function christmasStageEditor(oid){const ctx=SW.christmasContext(board,oid);if(!ctx||ctx.readOnly)return;dialog('Christmas template · gift stages',`<p class="small">One custom stage per line. Applies to this Christmas template in every year. Stages are labels only; they do not mark gifts purchased, received or wrapped. Removed labels on existing gifts are retained.</p>${area('Stage names','stages',ctx.stages.join('\n'))}`,fd=>{const current=SW.christmasContext(board,oid);if(!current||JSON.stringify(current.stages)!==JSON.stringify(ctx.stages))throw Error('Gift stages changed. Close and reopen before saving.');const stages=String(fd.get('stages')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(change(b=>Object.assign(b,SW.christmasGiftChange(b,oid,'stages',{stages},M.date()))))closeDialog(true);});}
// One due gift at a time while the app is open. No background delivery or
// notification permission needed. Not yet persists until the next local day.
let christmasReceiptSeen=new Set(),christmasReceiptSeenDay='';
function christmasReceiptReminder(){if(!SW||storageError||editor.open||document.hidden)return;const today=M.date();if(christmasReceiptSeenDay!==today){christmasReceiptSeenDay=today;christmasReceiptSeen.clear();}const due=SW.christmasReceiptDue(board,today).find(r=>!christmasReceiptSeen.has(r.id));if(!due)return;christmasReceiptSeen.add(due.id);dialog('Has this gift arrived?',`<p>${esc(due.title)} · ${esc(due.recipient)}</p><p class="small">Ordered ${dateLabel(due.orderedAt)}.</p>${button('Not yet — ask tomorrow','christmas-receipt-later',due.id,'wide ghost',`data-occurrence="${esc(due.occurrenceId)}"`)}`,()=>{const current=SW.christmasReceiptDue(board,M.date()).find(r=>r.occurrenceId===due.occurrenceId&&r.id===due.id&&r.orderedAt===due.orderedAt);if(!current)throw Error('This order has changed. Close the reminder and review the gift.');if(change(b=>Object.assign(b,SW.christmasGiftChange(b,due.occurrenceId,'receive',{id:due.id},M.date()))))closeDialog(true);},{saveLabel:'Yes, mark received'});}
function openGiftEditor(existing=null,occasion='christmas',personId=''){
 if(existing&&christmasLinked(existing.id))return notice('Open this gift in its Christmas occasion.');
 const selected=giftPeopleWithLegacy().find(p=>p.id===personId),recipient=existing?.recipient||selected?.name||'';
 const g=existing||{occasion,recipient,title:'',price:0};
 const body=field('Gift name','title',g.title,'text','required maxlength="160"')+field('Price (£)','price',g.price??g.spent??g.budget??0,'number','min="0" step="0.01" required');
 dialog(existing?'Edit gift':'Add gift',body,fd=>{const title=String(fd.get('title')||'').trim(),price=Number(fd.get('price'));if(!title||!Number.isFinite(price)||price<0)throw Error('Enter a gift name and valid price.');const now=new Date().toISOString(),row={...existing,id:existing?.id||M.uid(),occasion:existing?.occasion||occasion,recipient,title,price,budget:price,spent:price,status:existing?.status==='wrapped'?'wrapped':'bought',eventDate:existing?.eventDate||(occasion==='christmas'?`${new Date().getFullYear()}-12-25`:''),updatedAt:now,createdAt:existing?.createdAt||now};const priorTab=giftStatusTab;giftStatusTab=row.status==='wrapped'?'wrapped':'needs-wrap';if(row.status==='bought'&&row.receiptStatus==='ordered')giftStatusTab='awaiting-receipt';else if(row.status==='bought'&&row.noWrapping)giftStatusTab='no-wrapping';if(change(b=>{let saved=b.features.giftPeople.find(p=>p.id===selected?.id)||b.features.giftPeople.find(p=>p.name.toLocaleLowerCase()===recipient.toLocaleLowerCase());if(existing){const i=b.features.gifts.findIndex(x=>x.id===existing.id);if(i<0)throw Error('Gift no longer exists.');b.features.gifts[i]=row;}else b.features.gifts.push(row);if(!saved){saved={id:M.uid(),name:recipient,tracker:true,ideas:[],checkoffs:{}};b.features.giftPeople.push(saved);}else saved.tracker=true;row.recipientId=saved.id;}))closeDialog(true);else giftStatusTab=priorTab;},{saveLabel:existing?'Save gift':'Add bought gift'});
}
function giftCheckoffPeopleDialog(){
 dialog('Add people',area('One person per line','names',''),fd=>{const names=[...new Set(String(fd.get('names')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];if(!names.length)throw Error('Enter at least one name.');if(names.some(n=>n.length>100))throw Error('Each name must be 100 characters or fewer.');let added=0;if(change(b=>{const seen=new Set([...b.features.giftPeople.map(p=>p.name),...b.features.gifts.map(g=>g.recipient)].filter(Boolean).map(name=>name.toLocaleLowerCase()));for(const name of names){const key=name.toLocaleLowerCase();if(seen.has(key))continue;seen.add(key);b.features.giftPeople.push({id:M.uid(),name,tracker:false,checkoffs:{}});added++;}})){closeDialog(true);notice(added?`${added} person${added===1?'':'s'} added.`:'Those names are already listed.');}},{saveLabel:'Add people'});
}
function giftIdeasDialog(personId){
 const person=giftPeopleWithLegacy().find(p=>p.id===personId);if(!person)return;
 const oldIdeas=(board.features.gifts||[]).filter(g=>!christmasLinked(g.id)&&g.status==='idea'&&giftForPerson(g,person)).map(g=>`<div class="gift-row"><strong>${esc(g.title)}</strong>${button('Add to bought gifts','gift-idea-buy',g.id,'ghost')}</div>`).join('');
 dialog(`Ideas · ${person.name}`,`${area('One idea per line','ideas',(person.ideas||[]).join('\n'))}${oldIdeas?`<h3>Earlier saved ideas</h3>${oldIdeas}`:''}`,fd=>{const ideas=[...new Set(String(fd.get('ideas')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];if(ideas.length>100)throw Error('Keep up to 100 ideas per person.');if(ideas.some(x=>x.length>160))throw Error('Each idea must be 160 characters or fewer.');if(change(b=>{let saved=b.features.giftPeople.find(p=>p.id===person.id)||b.features.giftPeople.find(p=>p.name.toLocaleLowerCase()===person.name.toLocaleLowerCase());if(!saved){saved={id:M.uid(),name:person.name,tracker:true};b.features.giftPeople.push(saved);}saved.tracker=true;saved.ideas=ideas;}))closeDialog(true);},{saveLabel:'Save ideas'});
}
function giftPersonEditor(existing=null){
 dialog(existing?'Rename tracker person':'Add person with tracker',field('Name','name',existing?.name||'','text','required maxlength="100"'),fd=>{const name=String(fd.get('name')||'').trim();if(!name)throw Error('Enter a name.');if(giftPeopleWithLegacy().some(p=>p.id!==existing?.id&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('That person is already listed.');const id=existing?.id||M.uid(),priorTab=giftPersonTab;giftPersonTab=id;if(change(b=>{const row=b.features.giftPeople.find(p=>p.id===existing?.id);if(existing&&row){row.name=name;row.tracker=true;}else if(!existing)b.features.giftPeople.push({id,name,tracker:true,ideas:[],checkoffs:{}});for(const gift of b.features.gifts)if(gift.recipientId===existing?.id)gift.recipient=name;}))closeDialog(true);else giftPersonTab=priorTab;},{saveLabel:existing?'Save name':'Add tracker'});
}
function morePage(){return [['side','Side Tasks'],['locations','Where Does This Live?'],['gifts','Gift tracker'],['seasonal','Seasonal'],['library','Task Library'],['occasional','Occasional Essentials'],['laundry','Laundry'],['laundry-settings','Laundry setup & editing'],['care','Pet & plant care'],['backup','Backup & custom tasks'],['settings','Settings & household'],['help','Help']].map(([id,label])=>card(button(esc(label)+' ›',id==='care'?'open-grind':id==='occasional'?'library-occasional':'navigate',id,'wide ghost'))).join('');}
function focusHubPage(){return `<section class="focus-hub" aria-label="Choose Focus area"><div class="focus-hub-grid">${button('Doing Now','focus-hub-doing','','wide focus-hub-doing')}${rooms().map(r=>button(esc(r.name),'focus-hub-room',r.id,'wide')).join('')}</div></section>`;}
function seasonalEditEditor(id){
 const o=board.features.occasionOccurrences.find(x=>x.id===id);
 if(!o)return notice('That occasion is no longer available.');
 const t=board.features.occasionTemplates.find(x=>x.id===o.templateId);
 if(!t)return notice('That occasion template is no longer available.');
 const shared=board.features.occasionOccurrences.some(x=>x.id!==id&&x.templateId===t.id);
 const snapshot=JSON.stringify([o,t,shared]),links=o.taskLinks||[],defs=t.taskDefinitions||[];
 const selected=new Set(links.map(l=>l.taskId)),linkedDefs=new Set(links.map(l=>l.definitionId));
 const groups=(OCC?.seasonalGroups(board)||[]).map(g=>({label:g.label,tasks:g.tasks.filter(task=>!task.archived)})).filter(g=>g.tasks.length);
 const available=new Set(groups.flatMap(g=>g.tasks.map(task=>task.id)));
 const unavailable=links.filter(l=>!available.has(l.taskId)).map(l=>({id:l.taskId,title:(defs.find(d=>d.id===l.definitionId)?.title||'Saved task')+' (unavailable)'}));
 if(unavailable.length)groups.push({label:'Existing unavailable links',tasks:unavailable});
 const taskChoices=groups.map(g=>`<fieldset class="seasonal-task-choice"><legend>${esc(g.label)}</legend>${g.tasks.map(task=>`<label><input type="checkbox" name="taskIds" value="${esc(task.id)}"${selected.has(task.id)?' checked':''}><span>${esc(task.title)}</span></label>`).join('')}</fieldset>`).join('');
 const dates=field('Event date','eventDate',o.eventDate,'date','required')+field('Start preparing','preparationStartDate',o.preparationStartDate,'date','required')+field('End date','endDate',o.endDate,'date','required');
 const templateFields=field('Occasion name','name',t.name,'text','required maxlength="100"')+select('Repeats','recurrence',[['annual','Every year'],['one-off','One-off']],t.recurrence);
 const taskFields=`<h3>Choose existing Seasonal tasks</h3><p class="small">Unticking removes the link from this occasion only. It does not delete the original task or its history. Keep unavailable links ticked to preserve them.</p>${taskChoices||'<p class="small">No existing Seasonal tasks available.</p>'}<h3>Optional tasks</h3><p class="small">Ideas only, one name per line. They will not create or activate tasks.</p>${area('Optional task names','optionalTitles',defs.filter(d=>!linkedDefs.has(d.id)).map(d=>d.title).join('\n'))}`;
 dialog('Edit occasion',`<div class="seasonal-create-form">${shared?'<p class="small">This template has other occurrences. Only these dates can be edited for now.</p>':templateFields}${dates}${shared?'':taskFields}<p class="small">Saved on this device. Existing task dates, completion and points stay unchanged.</p></div>`,fd=>{
  const current=board.features.occasionOccurrences.find(x=>x.id===id),template=board.features.occasionTemplates.find(x=>x.id===current?.templateId);
  const nowShared=board.features.occasionOccurrences.some(x=>x.id!==id&&x.templateId===template?.id);
  if(JSON.stringify([current,template,nowShared])!==snapshot)throw Error('This occasion changed. Close and reopen the form before saving.');
  const draft={eventDate:fd.get('eventDate'),preparationStartDate:fd.get('preparationStartDate'),endDate:fd.get('endDate')};
  if(!shared){
   const allowed=new Set([...(OCC?.seasonalGroups(board)||[]).flatMap(g=>g.tasks.filter(task=>!task.archived).map(task=>task.id)),...selected]);
   const taskIds=fd.getAll('taskIds');if(taskIds.some(id=>!allowed.has(id)))throw Error('A selected Seasonal task is no longer available.');
   Object.assign(draft,{name:fd.get('name'),recurrence:fd.get('recurrence'),taskIds,optionalTitles:String(fd.get('optionalTitles')||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean)});
  }
  const next=M.editOccasion(board,id,draft);
  persist(next);closeDialog(true);render();notice('Occasion updated. No tasks were started.');
 },{saveLabel:'Save changes'});
}
function seasonalOccasionEditor(){
 const groups=OCC?.seasonalGroups(board)||[];
 const options=groups.map(g=>({label:g.label,tasks:g.tasks.filter(t=>!t.archived)})).filter(g=>g.tasks.length);
 const taskChoices=options.map(g=>`<fieldset class="seasonal-task-choice"><legend>${esc(g.label)}</legend>${g.tasks.map(t=>`<label><input type="checkbox" name="taskIds" value="${esc(t.id)}"><span>${esc(t.title)}</span></label>`).join('')}</fieldset>`).join('');
 dialog('Create occasion',`<div class="seasonal-create-form">${field('Occasion name','name','','text','required maxlength="100"')}${select('Repeats','recurrence',[['','Choose…'],['annual','Every year'],['one-off','One-off']],'')}${field('Event date','eventDate','','date','required')}${field('Start preparing','preparationStartDate','','date','required')}${field('End date','endDate','','date','required')}<h3>Choose existing Seasonal tasks</h3><p class="small">Tick tasks to link. They stay where they are; no task starts or changes dates.</p>${taskChoices||'<p class="small">No existing Seasonal tasks available.</p>'}<h3>Optional tasks</h3><p class="small">Ideas only, one name per line. They will not create or activate tasks.</p>${area('Optional task names','optionalTitles')}<p class="small">Saved on this device. An annual choice records this occurrence only for now.</p></div>`,fd=>{
  const allowed=new Set((OCC?.seasonalGroups(board)||[]).flatMap(g=>g.tasks.filter(t=>!t.archived).map(t=>t.id)));
  const taskIds=fd.getAll('taskIds');if(taskIds.some(id=>!allowed.has(id)))throw Error('A selected Seasonal task is no longer available.');
  const next=M.createOccasion(board,{name:fd.get('name'),recurrence:fd.get('recurrence'),eventDate:fd.get('eventDate'),preparationStartDate:fd.get('preparationStartDate'),endDate:fd.get('endDate'),taskIds,optionalTitles:String(fd.get('optionalTitles')||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean)});
  // Local-only operation: standard guarded persistence, no sharing transition or queue.
  persist(next);closeDialog(true);render();notice('Occasion saved. No tasks were started.');
 },{saveLabel:'Create occasion'});
}
let seasonalOpenId='',seasonalWarnings=[];
function seasonalMaintain(){
 if(!SW||storageError||editor.open||!SW.hasPlans(board))return false;
 try{const r=SW.reconcile(board,M.date());seasonalWarnings=r.warnings;if(!r.changed)return false;stampTaskEdits(r.board);persist(r.board);window.TidySharing?.queue();return true;}
 catch(e){seasonalWarnings=[e.message||'Seasonal dates could not be updated. Saved work is unchanged.'];return false;}
}
function seasonalGiftButton(t,cls){const role=SW?.giftRole(board,t.id);return role?button('🎁','seasonal-gift-shortcut',t.id,cls,`aria-label="${role.role==='wrap'?'Open wrapping':'Open Gift Tracker'} for ${esc(t.title)}"`):'';}
function seasonalReminders(){if(!SW||storageError||editor.open||!('Notification'in window)||Notification.permission!=='granted')return;const rows=SW.dueReminders(board,M.date());if(!rows.length)return;try{const next=SW.markReminders(board,rows,M.date());persist(next);window.TidySharing?.queue();for(const r of rows)try{new Notification('Tidy-ish · '+r.name,{body:r.title,tag:'tidyish-seasonal-'+r.occurrenceId+'-'+r.definitionId,icon:'assets/icons/tidyish-icon.svg'});}catch(e){notice(r.name+': '+r.title);}}catch(e){notice(e.message);}}
function seasonalHomeSection(){
 if(!SW)return '';const today=M.date(),groups=SW.activeGroups(board,today);if(!groups.length)return '';
 const theme=window.TidySeasonalTheme,selectedTheme=theme?.resolve(board,today,typeof seasonalDisplay!=='undefined'?seasonalDisplay:{});
 const renderEvent=g=>{
  const days=window.TidySeasonal.daysBetween(today,g.eventDate),pending=g.tasks.filter(t=>!t.done);
  const christmas=!!SW.christmasContext?.(board,g.id),festive=christmas&&(theme?selectedTheme?.id===g.id&&selectedTheme?.key==='christmas':today<=g.eventDate.slice(0,4)+'-12-30'&&SW.inspect(board,g.id)?.settings?.decorationsEnabled!==false);
  if(!christmas)return `<div class="seasonal-home-event">${button(esc(g.name),'seasonal-open',g.id,'wide ghost')}${g.countdown?`<p class="small">${days>0?`${days} days to go`:days===0?'Today!':'Celebration passed'}</p>`:''}${pending.map(t=>`<p class="small">${esc(t.title)}</p>`).join('')||'<p class="small">No pending Seasonal tasks today.</p>'}</div>`;
  const countdown=days>0?`<p class="seasonal-christmas-countdown" aria-label="${days} ${days===1?'day':'days'} until Christmas"><strong class="seasonal-christmas-number">${days}</strong><span class="seasonal-christmas-unit">${days===1?'day to go':'days to go'}</span></p>`:days===0?'<p class="seasonal-christmas-celebration">It’s Christmas!</p>':'<p class="seasonal-christmas-after">Christmas has passed</p>';
  const tasks=pending.length?`<ul class="seasonal-christmas-tasks">${pending.map(t=>`<li>${esc(t.title)}</li>`).join('')}</ul>`:'<p class="seasonal-christmas-empty">No pending Christmas tasks today.</p>';
  return `<div class="seasonal-home-event seasonal-home-christmas${festive?' is-decorated':''}"><div class="seasonal-christmas-header">${festive?'<span class="seasonal-christmas-icon" aria-hidden="true"></span>':''}<div class="seasonal-christmas-heading"><p class="seasonal-christmas-eyebrow">${days>=0?'Christmas countdown':'Christmas plans'}</p>${button(esc(g.name),'seasonal-open',g.id,'seasonal-christmas-open',`aria-label="Open ${esc(g.name)} occasion"`)}</div>${festive?'<span class="seasonal-christmas-tree" aria-hidden="true"></span>':''}</div>${g.countdown?countdown:''}<div class="seasonal-christmas-agenda"><h3>Christmas to-dos</h3>${tasks}</div></div>`;
 };
 return `<section class="card seasonal-home" aria-label="Active occasions"><h2>Seasonal</h2>${groups.map(renderEvent).join('')}</section>`;
}
function seasonalWorkflowChooser(){
 if(!SW)return notice('Seasonal workflow is unavailable. Existing records are unchanged.');
 dialog('Create occasion',`<div class="seasonal-create-form">${select('Occasion','preset',Object.entries(SW.PRESETS).map(([key,p])=>[key,p.name]),'custom')}${field('Event date / year','eventDate',M.date(),'date','required')}${select('Repeats','recurrence',[['annual','Every year'],['one-off','One-off']],'annual')}<p class="small">Fixed holidays use their usual date in the chosen year. Standard preset tasks within the occasion window start checked. Optional suggestions start unchecked, but you can tick them yourself. Review choices before saving.</p></div>`,fd=>{
  const key=fd.get('preset'),p=SW.PRESETS[key];if(!p)throw Error('Choose an occasion.');const date=fd.get('eventDate'),y=Number(date.slice(0,4)),rule=p.rule||'fixed';
  const eventDate=p.month?`${y}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`:p.rule?SW.eventFor(rule,y,date,'reject'):date;
  const draft={...SW.preset(key,eventDate),preset:key,recurrence:fd.get('recurrence'),dateRule:rule,leapPolicy:'reject',annualEnabled:true,tasksEnabled:true,decorationsEnabled:true,celebrated:false};
  // Preserve the preset's selected/optional defaults. Even an optional
  // suggestion within the window stays unchecked until the user ticks it.
  draft.items=draft.items.map(item=>({...item,selected:!!item.selected&&item.startDate>=draft.preparationStartDate&&item.startDate<=draft.endDate}));
  closeDialog(true);seasonalWorkflowEditor('',draft);
 },{saveLabel:'Choose tasks and dates'});
}
function seasonalWorkflowEditor(id,draft=null){
 if(!SW)return notice('Seasonal workflow is unavailable.');
 const saved=id?SW.editable(board,id):null,base=saved||draft;if(!base)return;
 const snapshot=id?JSON.stringify(board.features.occasionTemplates.find(t=>t.id===saved.templateId))+JSON.stringify(board.features.occasionOccurrences.find(o=>o.id===id))+JSON.stringify(board.features.occasionPlans):'';
 const existing=(OCC?.seasonalGroups(board)||[]).flatMap(g=>g.tasks.filter(t=>!t.archived));
 const choices=[['','Create a new task if selected'],...existing.map(t=>[t.id,t.title])];
 const original=base.items.slice();
 // Show explicit existing-task choices in each row; don't infer identity by title.
 const rows=original.map((r,i)=>`<div class="seasonal-task-choice seasonal-plan-row" role="group" aria-label="${esc(r.title)}"><div class="seasonal-task-heading"><label class="seasonal-task-selector"><input type="checkbox" name="selected-${i}" ${r.selected?'checked':''}><span data-seasonal-task-label="${i}">${esc(r.title)}</span></label><button type="button" class="ghost seasonal-task-edit" data-seasonal-options-toggle="${i}" aria-controls="seasonal-task-options-${i}" aria-expanded="false" aria-label="Edit options for ${esc(r.title)}">Edit</button></div><div class="seasonal-task-options" id="seasonal-task-options-${i}" hidden>${field('Task name',`title-${i}`,r.title,'text',r.taskId?'readonly':'required maxlength="160"')}${r.taskId?`<p class="small">${existing.some(t=>t.id===r.taskId)?'Linked task name is shared across occasions. Rename it using the task’s usual Edit action.':'Linked task unavailable (link retained).'}</p>`:select('Use an existing task or create new',`link-${i}`,choices,'')}${field('Start date',`start-${i}`,r.startDate,'date','required data-seasonal-start')}${field('Reminder date (blank for none)',`reminder-${i}`,r.reminderDate??r.startDate,'date','data-seasonal-start')}${check('Repeat every year',`repeat-${i}`,r.repeat)}${!r.taskId?area('Subtasks (one per line)',`children-${i}`,(r.children||[]).join('\n')):''}${r.role==='wrap'?`<p class="small">${base.preset==='christmas'?'Starts when a received gift needs wrapping, within the occasion window. The date field is retained for the template.':'Gift-triggered activation for this occasion is not available yet.'}</p>`:''}${r.role==='teardown'?'<p class="small">Only activates if Christmas was marked celebrated.</p>':''}</div></div>`).join('');
 const html=`<div class="seasonal-create-form">${field('Occasion name','name',base.name,'text','required maxlength="100"')}${id?select('Apply changes to','scope',[['this','This year only'],['every','Every year']],board.features.occasionPlans?.templates.some(t=>t.id===base.templateId)&&base.recurrence==='annual'?'this':'every')+select('Repeats','recurrence',[['annual','Every year'],['one-off','One-off']],base.recurrence):''}${field('Event date','eventDate',base.eventDate,'date','required')}${field('Start preparing','preparationStartDate',base.preparationStartDate,'date','required')}${field('End date','endDate',base.endDate,'date','required')}${base.recurrence==='annual'?select('Annual date rule','dateRule',[['fixed','Same day and month'],['easter','Gregorian Easter Sunday'],['uk-mothers-day','UK Mother’s Day'],['uk-fathers-day','UK Father’s Day']],base.dateRule)+select('February 29 in other years','leapPolicy',[['reject','Ask before substituting'],['feb28','28 February'],['mar1','1 March']],base.leapPolicy)+check('Keep repeating annually','annualEnabled',base.annualEnabled):''}${check('Enable tasks this year','tasksEnabled',base.tasksEnabled)}${check('Show countdown','countdown',base.countdown)}${['christmas','newyear'].includes(base.preset)?check('Enable decorations this year','decorationsEnabled',base.decorationsEnabled):''}${base.preset==='christmas'?check('Christmas was celebrated','celebrated',base.celebrated):''}<h3>Tasks</h3>${base.preset==='easter'?'<p class="small">Egg hunt is not scheduled by default. Add it with a date you choose.</p>':''}<p class="small">Tick the tasks you want. Tap Edit for individual dates, reminders and subtasks. Existing saved choices are kept. Optional suggestions stay unchecked until you tick them, even if their dates fit the occasion window.</p>${rows}<h3>Add tasks</h3>${area('New selected tasks (one per line)','newTasks')}${area('New optional suggestions (one per line)','newOptional')}${select('Or add an existing Seasonal task','existingId',[['','None'],...existing.filter(t=>!original.some(r=>r.taskId===t.id)).map(t=>[t.id,t.title])],'')}${field('Start date for added tasks','newStart',base.preparationStartDate,'date','required data-seasonal-start')}${check('Repeat added tasks every year','newRepeat',false)}<p class="small">Changes are saved on this device and synced to the connected household when sharing is ready.</p></div>`;
 dialog(id?'Edit occasion':'Create occasion',html,fd=>{
  if(id){const o=F().occasionOccurrences.find(o=>o.id===id),t=F().occasionTemplates.find(t=>t.id===o?.templateId);if(JSON.stringify(t)+JSON.stringify(o)+JSON.stringify(F().occasionPlans)!==snapshot)throw Error('This occasion changed. Close and reopen before saving.');}
  const items=original.map((r,i)=>({...r,title:r.taskId?r.title:String(fd.get(`title-${i}`)||'').trim(),taskId:r.taskId||String(fd.get(`link-${i}`)||''),selected:fd.has(`selected-${i}`),startDate:fd.get(`start-${i}`),reminderDate:fd.get(`reminder-${i}`),repeat:fd.has(`repeat-${i}`),children:r.taskId?r.children:String(fd.get(`children-${i}`)||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}));
  const newStart=fd.get('newStart'),repeat=fd.has('newRepeat');
  for(const [key,selected] of [['newTasks',true],['newOptional',false]])for(const title of String(fd.get(key)||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean))items.push({title,selected,startDate:newStart,repeat,role:'normal',children:[]});
  const existingId=fd.get('existingId');if(existingId){const t=existing.find(t=>t.id===existingId);if(!t)throw Error('That existing task is unavailable.');items.push({title:t.title,taskId:t.id,selected:true,startDate:newStart,repeat,role:'normal',children:[]});}
  const recurrence=fd.get('recurrence')||base.recurrence,d={...base,recurrence,name:fd.get('name'),eventDate:fd.get('eventDate'),preparationStartDate:fd.get('preparationStartDate'),endDate:fd.get('endDate'),dateRule:fd.get('dateRule')||'fixed',leapPolicy:fd.get('leapPolicy')||'reject',annualEnabled:recurrence==='annual'&&(base.recurrence==='one-off'||fd.has('annualEnabled')),tasksEnabled:fd.has('tasksEnabled'),decorationsEnabled:['christmas','newyear'].includes(base.preset)?fd.has('decorationsEnabled'):base.decorationsEnabled,countdown:fd.has('countdown'),celebrated:fd.has('celebrated'),items};
  const next=id?SW.configure(board,id,d,fd.get('scope')||'every'):SW.create(board,d);stampTaskEdits(next);persist(next);closeDialog(true);render();window.TidySharing?.queue();notice('Occasion saved.');
 },{saveLabel:id?'Save changes':'Create occasion'});
 // Shift the current window and all suggested starts together when the event
 // date changes. The user can then adjust any date explicitly.
 const dateField=editor.querySelector('[name="eventDate"]');let previous=base.eventDate;
 const shift=()=>{const value=dateField.value;if(!value||value===previous)return;try{const delta=window.TidySeasonal.daysBetween(previous,value);for(const f of editor.querySelectorAll('[name="preparationStartDate"],[name="endDate"],[data-seasonal-start]'))if(f.value)f.value=window.TidySeasonal.shiftDays(f.value,delta);previous=value;}catch(e){showDialogSaveError(e.message);}};
 // Each task starts as one compact checklist row; its settings remain in the
 // same form so Save, Cancel and year-scoped edits keep their existing semantics.
 const toggleOptions=e=>{const trigger=e.target.closest?.('[data-seasonal-options-toggle]');if(!trigger)return;const panel=editor.querySelector('#'+trigger.getAttribute('aria-controls'));if(!panel)return;panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));trigger.textContent=panel.hidden?'Edit':'Close';};
 const updateTaskLabel=e=>{const input=e.target.closest?.('[name^="title-"]');if(!input||input.readOnly)return;const i=input.name.slice(6),label=editor.querySelector(`[data-seasonal-task-label="${i}"]`);if(label)label.textContent=input.value||'Untitled task';};
 const revealInvalid=e=>{const panel=e.target.closest?.('.seasonal-task-options');if(!panel?.hidden)return;const trigger=editor.querySelector(`[aria-controls="${panel.id}"]`);panel.hidden=false;if(trigger){trigger.setAttribute('aria-expanded','true');trigger.textContent='Close';}};
 dateField.addEventListener('change',shift);
 editor.addEventListener('click',toggleOptions);
 editor.addEventListener('input',updateTaskLabel);
 editor.addEventListener('invalid',revealInvalid,true);
 dialogCleanup=()=>{dateField.removeEventListener('change',shift);editor.removeEventListener('click',toggleOptions);editor.removeEventListener('input',updateTaskLabel);editor.removeEventListener('invalid',revealInvalid,true);};
}
function seasonalGiftArchiveHtml(oid){
 // All content is escaped; only validated HTTP(S) links and raster data URLs
 // are rendered. Photos are resized before writing to the existing board.
 const ctx=SW.notesContext(board,oid),archive=ctx?.history;
 if(!archive)return '<p class="small">No frozen gift history was recorded for this occasion. Original gift records are retained.</p>';
 return `<section class="seasonal-gift-history"><h3>Gift history</h3><p class="small">Purchased gifts for personal-tracker recipients only.</p>${archive.people.map(p=>`<details class="seasonal-history-person"><summary><strong>${esc(p.name)}</strong> · £${p.total.toFixed(2)}</summary><ul>${p.gifts.map(g=>`<li>${esc(g.title)} · £${g.price.toFixed(2)}</li>`).join('')}</ul></details>`).join('')||'<p class="small">No personal-tracker purchases recorded.</p>'}</section>`;
}
function seasonalNotesSection(oid){
 const ctx=SW.notesContext(board,oid);if(!ctx)return '';
 const attr=`data-occurrence-id="${esc(oid)}"`;
 const rows=ctx.notes.map(r=>`<article class="seasonal-note-card"><strong>${esc(r.title)}</strong><span class="small">${({note:'Note',checklist:'Checklist',link:'Link',photo:'Photo'})[r.kind]}</span>${r.body?`<p class="seasonal-note-text">${esc(r.body)}</p>`:''}${r.kind==='checklist'?`<div class="seasonal-note-checks">${r.items.map(i=>button((i.checked?'✓ ':'○ ')+esc(i.text),'seasonal-note-toggle',r.id,'ghost seasonal-note-check',`${attr} data-item-id="${esc(i.id)}" role="checkbox" aria-checked="${i.checked}" ${ctx.readOnly?'disabled':''}`)).join('')}</div>`:''}${r.kind==='link'?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open saved link</a>`:''}${r.kind==='photo'?`<img class="seasonal-note-photo" src="${esc(r.photo)}" alt="${esc(r.title)}" loading="lazy">`:''}${ctx.readOnly?'':`<div class="row">${button('Edit','seasonal-note-edit',r.id,'ghost',attr)}${button('Delete','seasonal-note-delete',r.id,'ghost',attr)}</div>`}</article>`).join('');
 return `<details class="seasonal-notes-section" ${ctx.readOnly?'':'open'}><summary><strong>Notes &amp; Ideas</strong> · ${ctx.notes.length}</summary>${ctx.readOnly?'<p class="small">Archived · read only</p>':`<div class="seasonal-note-add">${[['note','Note'],['checklist','Checklist'],['link','Link'],['photo','Photo']].map(([kind,label])=>button('＋ '+label,'seasonal-note-add',kind,'ghost',attr)).join('')}</div>`}${rows||'<p class="small">No notes or ideas saved.</p>'}</details>`;
}
async function seasonalPhoto(file){
 if(!file||!file.size)return '';
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Choose a JPEG, PNG or WebP image under 12 MB.');
 const url=URL.createObjectURL(file);try{
  const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw Error('Could not open this photo.');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo resizing is unavailable.');
  for(const size of [1000,800,600,400,280]){
   const scale=Math.min(1,size/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   for(const quality of [.82,.65,.48]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=80000&&data.startsWith('data:image/jpeg;base64,'))return data;}
  }throw Error('This photo is too large after resizing. Use a smaller photo or save a link.');
 }finally{URL.revokeObjectURL(url);}
}
function seasonalNoteEditor(oid,kind,nid=''){
 const ctx=SW.notesContext(board,oid),old=ctx?.notes.find(r=>r.id===nid);if(!ctx||ctx.readOnly||nid&&!old)return;seasonalOpenId=oid;kind=old?.kind||kind;
 let body=field('Title','title',old?.title||'','text','required maxlength="160"')+area(kind==='note'?'Note':'Optional notes','body',old?.body||'');
 if(kind==='checklist')body+=area('Checklist (one item per line)','lines',(old?.items||[]).map(i=>i.text).join('\n'));
 if(kind==='link')body+=field('Website link','url',old?.url||'','url','required maxlength="2000"');
 if(kind==='photo')body+=`<label class="field">${old?'Replace photo (optional)':'Photo'}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${old?'':'required'}></label><p class="small">Photos are resized and stored in the board, including household backups and sync. Space is limited; you can also save a link.</p>`;
 dialog(old?'Edit '+kind:'Add '+kind,body,async(fd,form)=>{
  const data={id:old?.id,kind,title:fd.get('title'),body:fd.get('body'),lines:fd.get('lines'),url:fd.get('url')};if(kind==='photo')data.photo=await seasonalPhoto(fd.get('photo'));
  if(!editor.open||editor.querySelector('#modal-form')!==form)return;
  if(old&&JSON.stringify(SW.notesContext(board,oid)?.notes.find(r=>r.id===old.id))!==JSON.stringify(old))throw Error('This note changed. Close and reopen before saving.');
  if(change(b=>Object.assign(b,SW.noteChange(b,oid,'save',data,M.date()))))closeDialog(true);
 });
}
function seasonalNoteDelete(oid,id){const old=SW.notesContext(board,oid)?.notes.find(r=>r.id===id);if(!old)return;seasonalOpenId=oid;dialog('Delete note?',`<p>Delete ${esc(old.title)} from this occasion?</p>`,()=>{if(JSON.stringify(SW.notesContext(board,oid)?.notes.find(r=>r.id===id))!==JSON.stringify(old))throw Error('This note changed. Close and reopen before deleting.');if(change(b=>Object.assign(b,SW.noteChange(b,oid,'delete',{id},M.date()))))closeDialog(true);},{saveLabel:'Delete'});}
function seasonalHubPage(){
 const f=board.features,templates=new Map((f.occasionTemplates||[]).map(t=>[t.id,t]));
 const occurrences=[...(f.occasionOccurrences||[])].sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.id.localeCompare(b.id));
 const dateLabel=value=>esc(value.split('-').reverse().join('/'));
 const taskRow=(definition,link,workflow,o)=>{
  const item=workflow?.items.find(r=>r.definitionId===definition.id);
  const target=board.tasks.find(t=>t.id===(link?.status==='linked'?link.taskId:item?.taskId));
  const historical=workflow?.closed?workflow.history.find(h=>h.definitionId===definition.id):null;const label=workflow?.closed?(historical?.done?'Completed in this occurrence':historical?'Unfinished history retained':item?.selected?'Not activated':'Not selected · optional'):item&&!item.selected?'Not selected · optional':target?(target.done?'Completed':'Linked task'):link?'Linked task missing':'Not linked · optional';
  return `<li><strong>${esc(workflow?.closed?definition.title:target?.title||definition.title)}</strong><span class="small"> · ${label}${item?.selected&&!workflow.closed?(item.role==='wrap'&&SW?.christmasContext?.(board,o.id)?' · Starts when a gift needs wrapping':' · Starts '+dateLabel(window.TidySeasonal.shiftDays(o.eventDate,item.offset))):''}</span></li>`;
 };
 const renderOccurrence=o=>{
  const t=templates.get(o.templateId),refs=M.occasionLinkStatus(board,o),workflow=typeof SW!=='undefined'?SW?.inspect(board,o.id):null,defs=workflow?workflow.items.map(r=>({id:r.definitionId,title:r.title})):t?.taskDefinitions||[];
  const unresolved=[...refs.tasks,...refs.gifts,...refs.recipients].filter(r=>r.status!=='linked').length;
  const tasks=defs.map(d=>taskRow(d,refs.tasks.find(l=>l.definitionId===d.id),workflow,o)).join('');
  return `<details class="card seasonal-occasion-preview" ${typeof seasonalOpenId!=='undefined'&&seasonalOpenId===o.id?'open':''}><summary><strong>${esc(workflow?.name||t?.name||'Saved occasion')}</strong> <span class="small">${dateLabel(o.eventDate)}</span></summary><p class="small">Preparation ${dateLabel(o.preparationStartDate)} · Ends ${dateLabel(o.endDate)}</p>${workflow?`<p class="small">${workflow.closed?'Ended · history retained':SW.phase(o,M.date())}${workflow.settings.tasksEnabled?'':' · Tasks disabled'}</p>`:'<p class="small">Edit to configure task start dates and recurrence.</p>'}<h3>Tasks</h3>${tasks?`<ul class="seasonal-preview-list">${tasks}</ul>`:'<p class="small">No task definitions saved for this occasion.</p>'}<h3>Gift tracker</h3>${typeof SW!=='undefined'&&SW?.christmasContext?.(board,o.id)?button('Open Christmas Gift Tracker','christmas-gift-open',o.id,'wide ghost')+button('Open wrapping','christmas-wrap-open',o.id,'wide ghost')+(!SW.christmasContext(board,o.id).readOnly?button('Edit template gift stages','christmas-stages',o.id,'wide ghost'):''):''}<p class="small">${refs.gifts.filter(l=>l.status==='linked').length} linked gifts · ${refs.recipients.filter(l=>l.status==='linked').length} linked recipients</p>${unresolved?`<p class="small" role="status">${unresolved} missing or conflicting link(s). Existing records are unchanged.</p>`:''}${typeof seasonalNotesSection==='function'&&workflow?seasonalNotesSection(o.id):''}${workflow?.closed?`<p class="small">${workflow.history.length} task records retained.</p>${typeof seasonalGiftArchiveHtml==='function'&&SW?.christmasContext?.(board,o.id)?seasonalGiftArchiveHtml(o.id):''}`:button('Edit occasion','seasonal-edit',o.id,'wide ghost seasonal-edit')}</details>`;
 };
 const ended=o=>typeof SW!=='undefined'&&SW?.inspect(board,o.id)?.closed;
 const saved=occurrences.filter(o=>!ended(o)).map(renderOccurrence).join(''),history=occurrences.filter(ended).reverse().map(renderOccurrence).join('');
 const legacy=OCC?.seasonalGroups(board)||[];
 const existing=legacy.map(g=>`<details class="card seasonal-occasion-preview"><summary><strong>${esc(g.label)}</strong> <span class="small">${g.tasks.length} saved tasks</span></summary><ul class="seasonal-preview-list">${g.tasks.map(t=>`<li>${esc(t.title)}</li>`).join('')}</ul></details>`).join('');
 return `<section class="seasonal-hub" aria-label="Seasonal occasions"><h2>Saved occasions</h2><p class="small">Create or edit occasions, select tasks, and set their start dates.</p>${button('＋ Create occasion','seasonal-create','','wide primary seasonal-create')}${typeof seasonalWarnings!=='undefined'?seasonalWarnings.map(w=>`<p class="small" role="status">${esc(w)}</p>`).join(''):''}${saved||'<p class="empty">No saved occasions yet.</p>'}${history?`<h2>Seasonal History</h2>${history}`:''}<h2>Existing seasonal tasks</h2><p class="small">Your existing seasonal task groups remain in Task Library. These are not new occasion records.</p>${existing||'<p class="empty">No existing seasonal tasks.</p>'}${card(button('Open Seasonal Task Library','library-seasonal','','wide ghost')+button('Open Gift Tracker','navigate','gifts','wide ghost'),'seasonal-hub-shortcuts')}</section>`;
}
function questLibraryPage(){
 if(!L)return card('Task Library cannot load. Existing tasks and history have not changed.');
 const libraryTabs=tabs([['saved','Saved Reusable Tasks'],['custom','Custom Tasks'],['occasional','Occasional Essentials'],['seasonal','Seasonal']],libraryTab,'library-tab','library-tabs');
 if(libraryTab==='occasional')return `<section class="quest-library management-page occasional-library">${card(libraryTabs)}${occasionalLibraryContent()}</section>`;
 if(libraryTab==='seasonal')return `<section class="quest-library management-page seasonal-library">${card(libraryTabs)}${seasonalLibraryContent()}</section>`;
 const opts={query:libraryQuery,room:libraryRoom,priority:libraryPriority,tag:libraryTag};
 const rows=L.libraryRows(board,opts),tags=L.availableTags(board),selected=rows[libraryTab],custom=libraryTab==='custom';
 const display=t=>`<article class="management-row"><div class="management-copy"><strong>${esc(t.title)}</strong><div class="small">Priority ${Number(t.priority)||3}${t.checkDays?` · Review after ${Number(t.checkDays)} days`:''}${t.done?' · Completed':''}${t.hidden?' · Hidden':''}</div>${t.tags?.length?`<p class="quest-lib-tags">${t.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</p>`:''}</div><div class="management-actions">${custom?(t.done&&!t.side?button('Do again','library-reactivate',t.id,'ghost'):'')+button('Edit','library-edit-task',t.id,'ghost')+button('Add to library','library-save-custom',t.id,'primary')+button('Remove','library-hide-custom',t.id,'ghost'):(t.hidden?button('Restore','restore-template',t.id,'ghost'):button('Use','activate-template',t.id,'primary')+button('Edit','edit-template',t.id,'ghost')+button('Hide','hide-template',t.id,'ghost'))+button('Remove','library-remove-saved',t.id,'ghost')}</div></article>`;
 return `<section class="quest-library management-page">${card(`${libraryTabs}<label class="field">Search tasks<input id="quest-library-query" type="search" autocomplete="off" placeholder="Try toilet, loo, hoover…" value="${esc(libraryQuery)}"></label><div class="quest-lib-filters">${select('Room','libraryRoom',[['all','All rooms'],['','General'],...rooms().map(r=>[r.id,r.name])],libraryRoom)}${select('Priority','libraryPriority',[['all','All priorities'],...[1,2,3,4,5].map(x=>[String(x),String(x)])],libraryPriority)}${select('Tag','libraryTag',[['','All tags'],...tags.map(t=>[t,t])],libraryTag)}</div><div class="row">${button('Optional ideas','library-ideas','','ghost')}${button('Find existing task','library-find-existing','','ghost')}</div><p class="small">${custom?'Unsaved custom entries stop appearing after 30 days. Remove hides an entry on this browser, without deleting the actual task or its history.':'Saved reusable tasks can be used again. Removing a saved template does not delete existing tasks or their history.'}</p>`)}<p class="small" role="status">${selected.length} matching task${selected.length===1?'':'s'}</p>${managementRoomGroups(selected,display)||'<p class="empty">No matching tasks.</p>'}</section>`;
}
function libraryIdeas(){const ideas=L.catalogue(board,{query:libraryQuery,room:libraryRoom,priority:libraryPriority,tag:libraryTag,kind:'suggestion'});dialog('Optional task ideas',`<p class="small">Ideas are never added automatically.</p>${managementRoomGroups(ideas,t=>`<article class="management-row"><strong>${esc(t.title)}</strong>${button('Add task','library-add-suggestion',t.id,'primary')}</article>`)||'<p class="empty">No matching ideas.</p>'}`);}

function occasionalLibraryContent(){
 if(!OCC)return card('Occasional Essentials cannot load. Your saved jobs are unchanged.');
 const now=new Date(),rows=OCC.dueTasks(board,now),checks=OCC.staleChecks(board,now);
 const renderRow=t=>`<article class="management-row occasional-row"><div class="management-copy"><strong>${esc(t.title)}</strong><div class="small">Due ${esc(t.nextDue)}${t.seasonMonth?' · Seasonal':''}</div></div><div class="management-actions">${button('I did a thing!','occasional-done',t.id,'complete')}${button('Edit','occasional-edit',t.id,'ghost')}</div></article>`;
 const checkRow=x=>`<article class="management-row"><div class="management-copy"><strong>${esc(x.task.title)}</strong><div class="small">Last completed ${x.days} days ago · Check interval ${Number(x.task.checkDays)} days</div></div><div class="management-actions">${button('Review task','library-edit-task',x.task.id,'ghost')}</div></article>`;
 return `<section class="occasional-library-section" aria-label="Occasional Essentials"><h2>Occasional Essentials (${rows.length})</h2><p class="small">Only saved jobs due today or earlier. Manage all jobs to edit dates, add jobs or undo a completion.</p><div class="occasional-manage">${button('Manage all jobs / Undo','navigate','schedule','ghost')}</div>${managementRoomGroups(rows,renderRow)||'<p class="empty">No occasional jobs due.</p>'}</section><section class="occasional-library-section" aria-label="Recommended checks"><h2>Recommended checks (${checks.length})</h2><p class="small">Other tasks with a saved check interval since their last full completion. These suggestions do not add anything to the calendar.</p>${managementRoomGroups(checks,checkRow,x=>x.task.room)||'<p class="empty">No checks due with a confirmed full completion and check interval.</p>'}</section>`;
}

function seasonalLibraryContent(){
 if(!OCC?.seasonalGroups)return card('Seasonal jobs cannot load. Your saved jobs are unchanged.');
 const today=M.date(),groups=OCC.seasonalGroups(board,new Date());
 const renderRow=t=>{
  const date=OCC.seasonalDate(t),status=t.done?'Completed':!date?'Date not set':date<today?'Overdue':date===today?'Due today':'Upcoming',
   state=`${t.archived?'Archived · ':''}${t.paused?'Paused · ':''}${status}`,occasional=t.occasionKind==='occasional';
  return `<article class="management-row seasonal-row" data-seasonal-task-id="${esc(t.id)}"><div class="management-copy"><strong>${esc(t.title)}</strong><div class="small">${esc(state)} · ${date?'Date '+esc(date):'No saved date'} · ${esc(room(t.room)?.name||'Whole house')}${occasional?' · '+(t.calendarEnabled===true?'On calendar':'Not on calendar'):''}</div></div><div class="management-actions">${occasional?button('I did a thing!','occasional-done',t.id,'complete')+(t._occasionalUndo?button('Undo last','occasional-undo',t.id,'ghost'):'')+button('Edit','occasional-edit',t.id,'ghost'):button(t.done?'Undo':'I did a thing!','complete',t.id,t.done?'ghost':'complete')+button('Edit','edit-task',t.id,'ghost')}</div></article>`;
 };
 return `<section class="seasonal-library-section" aria-label="Seasonal saved jobs"><h2>Seasonal tasks</h2><p class="small">All saved seasonal jobs, including upcoming ones. Dates and existing calendar settings are unchanged.</p><div class="occasional-manage">${button('Manage all jobs / Undo','navigate','schedule','ghost')}</div>${groups.map(g=>`<section class="seasonal-event-group" aria-label="${esc(g.label)}"><h3>${esc(g.label)} (${g.tasks.length})</h3><div class="seasonal-event-rows">${g.tasks.map(renderRow).join('')}</div></section>`).join('')||'<p class="empty">No saved seasonal tasks yet.</p>'}</section>`;
}

function libraryFindExisting(){dialog('Find an existing task',`<p class="small">Search your actual tasks, including older ones no longer shown in the custom library. Their completion history is kept.</p>${field('Task name or keyword','lookup',libraryQuery,'search','required')}`,fd=>{const query=String(fd.get('lookup')||'').trim();if(!query)throw Error('Enter a word to find a task.');const matches=L.catalogue(board,{query,room:libraryRoom,kind:'task'});dialog('Matching existing tasks',managementRoomGroups(matches,t=>`<article class="management-row"><div class="management-copy"><strong>${esc(t.title)}</strong>${t.done?'<small>Completed</small>':''}</div><div class="management-actions">${t.done?button('Do again','library-reactivate',t.id,'ghost'):''}${button('Edit','library-edit-task',t.id,'ghost')}${button('Save reusable','save-template',t.id,'ghost')}</div></article>`)||'<p>No matching tasks.</p>');},{saveLabel:'Find tasks'});}

const headerBounds={'Tidy-ish.png':[126,425],'cat-trays-header.png':[44,505],'entrance-header.png':[126,448],'living-header(1).png':[29,598],'bathroom-header.png':[109,437],'storage-header.png':[26,609],'bedroom-cat-header.png':[63,529],'bedroom-bigfoot-header.png':[7,641],'3d-printer-header.png':[75,507],'kitchen-header.png':[88,480]};
function compactHeader(path,label){const key=path.split('/').at(-1),[top,height]=headerBounds[key]||[0,656];return `<svg class="brand-logo" viewBox="0 ${top} 1280 ${height}" role="img" aria-label="${esc(label)}" style="width:${1280/height*44}px"><image href="${asset(path)}${key==='bedroom-bigfoot-header.png'?'?v=20261120-masterportrait2':''}" width="1280" height="656"/></svg>`;}
// Keep the library's create action in the page header, with its tab-specific behaviour.
function pageHeading(title){
 const library=route==='library'&&!!L,custom=libraryTab==='custom',showAdd=library&&!['occasional','seasonal'].includes(libraryTab);
 return `<div class="top-page-line${library?' library-page-line':''}">${button('‹ Back','nav-back','','page-back', 'aria-label="Go back"')}${title?`<h1>${title}</h1>`:''}${showAdd?button(custom?'＋ Make new task':'＋ Add reusable task',custom?'add-task':'new-template','','primary library-header-add'):''}</div>`;
}
function render(){seasonalMaintain();applySeasonalTheme();const y=window.scrollY;unmountDailyLogViews();window.TidyActivityHost?.unmount();document.body.classList.toggle('reduce-motion',F().reduceMotion);document.body.classList.toggle('kayleigh-writing-active',route!=='settings');const title={gifts:'Gift tracker','christmas-gifts':'Gift tracker','christmas-wrap':'Wrapping',seasonal:'Seasonal',doing:'Doing Now',side:'Side tasks',laundry:'Laundry','laundry-settings':'Laundry setup & editing',manage:'Settings',schedule:'Manage occasional jobs','focus-hub':'Focus',focus:'Room Focus',clearway:'Clear the Way','doing-focus':'Doing Now Focus',library:'Task Library',locations:'Where Does This Live?',data:'Data',calendar:'Calendar',settings:'Settings',help:'Help',backup:'Backup & custom tasks',more:'More'}[route]||'';const r=['room','focus','clearway'].includes(route)?room(roomId):null;const header=r?.header?`headers/${r.header}`:'headers/Tidy-ish.png';let content=route==='gifts'?giftTrackerPage():['christmas-gifts','christmas-wrap'].includes(route)?christmasGiftPage():route==='seasonal'?seasonalHubPage():route==='home'?home():route==='room'?roomPage():route==='doing'?doingPage():route==='side'?sidePage():route==='calendar'?calendarPage():route==='data'?dataPage():route==='schedule'?schedulePage():route==='grind'?dailyGrindPage():route==='focus-hub'?focusHubPage():route==='focus'||route==='clearway'||route==='doing-focus'?(Q?Q.content(board):'<p>Task Focus unavailable</p>'):route==='laundry'?laundryPage():route==='laundry-settings'?laundryPage(true):route==='locations'?locationBookPage():route==='library'?questLibraryPage():route==='settings'?settingsPage():route==='help'?helpPage():route==='more'?morePage():morePage();app.innerHTML=`${route==='home'?globals(true):`<header class="top${r?.id==='master'?' master-bedroom-header':''}"><div class="brand">${compactHeader(header,r?'Tidy-ish · '+r.name:'Tidy-ish')}${globals()}</div>${pageHeading(title)}</header>`}<main class="${route==='home'?'home-main':''}">${storageError?`<p class="error">Saved data could not be opened. It has been preserved: ${esc(storageError)}</p>`:''}${content}</main>${footer()}`;// If the optional picture is unavailable, keep six visible, usable text tabs.
// Simplified SVG icons require no image-loading fallback.
if(route==='calendar'&&calendarView==='activity'&&!storageError)window.TidyActivityHost?.mount(document.getElementById('tidyish-activity-calendar'),dailyLogHistoryBoard(),activityDiary=>change(b=>{b.features.activityDiary=activityDiary;}));mountDailyLogViews();const dailyLogSnapshot=editor.querySelector('[data-daily-log-calendar-snapshot]');if(dailyLogSnapshot)renderCalendarDailyLogSnapshot(dailyLogSnapshot,dailyLogSnapshot.dataset.date);window.scrollTo(0,y);lastLaundryAttention=F().laundry.filter(l=>M.laundryNeedsAttention(l)).map(l=>l.slot).sort((a,b)=>a-b).join(',');lastCustomLaundryAttention=customLaundryAttentionSignature();lastCareAttention=careAttentionSignature();lastCustomAttention=customAttentionSignature();updateClocks();}
function showDialogSaveError(message){const box=editor.querySelector('[data-dialog-save-error]');if(!box)return;box.textContent=String(message||'Could not save.');box.hidden=false;}
function dialog(title,body,onSave=null,{saveLabel='Save',dirty=false,afterSave=''}={}){if(editor.open)closeDialog(true);dialogSave=onSave;dialogDirty=dirty;editor.innerHTML=`<form id="modal-form"><header>${onSave?'<button type="submit" aria-label="Confirm changes">✓</button>':''}<h2 id="dialog-title">${esc(title)}</h2>${button('Close','close-dialog','','ghost')}</header><div class="dialog-body">${body}${afterSave}<p class="error" role="alert" data-dialog-save-error hidden></p>${onSave?`<div class="dialog-footer"><button type="submit">${esc(saveLabel)}</button>${button('Cancel','close-dialog','','ghost')}</div>`:''}</div></form>`;editor.showModal();editor.querySelector('input:not([type=checkbox]),textarea,select')?.focus({preventScroll:true});}
function closeDialog(force=false){if(!force&&dialogDirty&&!confirm('Discard changes? Choose Cancel to keep editing.'))return false;if(dialogCleanup)dialogCleanup();dialogCleanup=null;editor.close();dialogDirty=false;dialogSave=null;taskTitleSuggestionState=null;clearTimeout(taskTitleSuggestionTimer);if(pendingExternal){board=pendingExternal;pendingExternal=null;lastSaved=localStorage.getItem(KEY)||'';render();}return true;}
editor.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});editor.addEventListener('input',e=>{if(e.target.id==='focus-sound-volume'||editor.querySelector('.phone-timer-panel')&&(e.target.closest('.phone-timer-panel')||e.target.name==='minutes'))return;dialogDirty=true;});editor.addEventListener('submit',async e=>{ e.preventDefault(); const box=editor.querySelector('[data-dialog-save-error]'); if(box){box.hidden=true;box.textContent='';} try { if(dialogSave)await dialogSave(new FormData(e.target),e.target); } catch(err) { showDialogSaveError(err?.message||'Could not save.'); notice(err?.message||'Could not save.'); } }); editor.addEventListener('invalid',e=>{ if(!e.target.closest('#modal-form'))return; let details=e.target.closest('details'); while(details){ details.open=true; details=details.parentElement?.closest('details')||null; } showDialogSaveError('Please check the highlighted field before saving.'); },true);
function confirmDialog(title,text,action,label='Confirm'){dialog(title,`<p>${esc(text)}</p>`,()=>{if(action()!==false)closeDialog(true);},{saveLabel:label});}
function taskEditorTabs(selected){
 const entries=[['task','Add Task'],['saved','Add Saved Task'],['scheduled','Add Scheduled Task']];
 return `<div class="tabs add-task-tabs" role="tablist" aria-label="Choose how to add a task">${entries.map(([id,label])=>button(esc(label),'task-editor-tab',id,id===selected?'active':'',`role="tab" aria-selected="${id===selected}"`)).join('')}</div>`;
}
let photoImportState=null;
function openPhotoTaskImport(){
 const defaultRoom=['room','focus','clearway','doing-focus'].includes(route)?roomId:rooms()[0]?.id||'';
 const side=route==='side'||route==='room'&&tab==='side';
 const state={file:null,read:false,url:''};photoImportState=state;
 const roomOptions=[['','No room'],...rooms().map(r=>[r.id,r.name])];
 const body=`<div class="photo-task-import"><p class="small">Choose a clear photo of your list. Text is read on this device; the photo is not uploaded. The OCR reader and English data download on first use.</p><label class="field">Take or choose a photo<input id="photo-task-file" type="file" accept="image/*" capture="environment"></label><img id="photo-task-preview" class="photo-task-preview" alt="Selected task list photo" hidden><div class="row">${button('Read text from photo','photo-task-read','','ghost')}</div><p id="photo-task-status" class="small" role="status" aria-live="polite">Choose a photo, then read the text.</p>${area('Detected tasks — one per line','taskLines','')}<div class="columns">${select('Room','importRoom',roomOptions,defaultRoom)}</div>${check('Add to Doing Now','importDoing',route==='doing')}${check('Add to Side tasks','importSide',side)}<p class="small">Review and correct every line before adding. Each line becomes one new task.</p></div>`;
 dialog('Add tasks from a photo',body,fd=>{
  if(!state.read)throw Error('Read the text from your photo before adding tasks.');
  const titles=String(fd.get('taskLines')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!titles.length)throw Error('No task names to add. Check the detected text first.');
  const targetRoom=String(fd.get('importRoom')||''),doing=fd.has('importDoing'),isSide=fd.has('importSide');
  if(targetRoom&&!board.rooms.some(r=>r.id===targetRoom&&!r.archived))throw Error('Choose an available room.');
  let added=0,skipped=0;
  const saved=change(b=>{for(const title of titles){const duplicate=b.tasks.some(t=>!t.archived&&t.room===targetRoom&&!!t.side===isSide&&String(t.title||'').trim().toLocaleLowerCase()===title.toLocaleLowerCase());if(duplicate){skipped++;continue;}M.add(b,M.task({title,room:targetRoom,doing:doing&&!isSide,side:isSide,sideKind:sideTab==='all'?'organisation':sideTab}));added++;}});
  if(!saved)return false;
  closeDialog(true);photoImportState=null;notice(`${added} task${added===1?'':'s'} added${skipped?`; ${skipped} duplicate${skipped===1?' was':'s were'} skipped`:''}.`);
 },{saveLabel:'Add tasks'});
 dialogCleanup=()=>{if(state.url)URL.revokeObjectURL(state.url);if(photoImportState===state)photoImportState=null;};
 editor.querySelector('#photo-task-file')?.addEventListener('change',e=>{const file=e.target.files?.[0],preview=editor.querySelector('#photo-task-preview'),taskLines=editor.querySelector('[name="taskLines"]');state.read=false;state.file=file||null;if(state.url)URL.revokeObjectURL(state.url);state.url='';if(taskLines)taskLines.value='';if(preview){preview.hidden=!file;preview.removeAttribute('src');if(file){state.url=URL.createObjectURL(file);preview.src=state.url;}}const status=editor.querySelector('#photo-task-status');if(status)status.textContent=file?'Photo ready. Select “Read text from photo”.':'Choose a photo, then read the text.';});
}
async function readPhotoTaskList(){
 const state=photoImportState,input=editor.querySelector('#photo-task-file'),status=editor.querySelector('#photo-task-status'),areaField=editor.querySelector('[name="taskLines"]'),buttonEl=editor.querySelector('[data-action="photo-task-read"]');
 const say=text=>{if(status)status.textContent=text};
 if(!state)return;
 const file=input?.files?.[0];if(!file){say('Take a photo or choose an image first.');return;}
 if(!/^image\/(?:jpeg|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.type||'')){say('Choose a photo in JPEG, PNG, WebP or HEIC format.');return;}
 if(file.size>15*1024*1024){say('Choose a photo smaller than 15 MB.');return;}
 if(!window.TidyPhotoTaskOCR){say('The on-device text reader is unavailable.');return;}
 state.file=file;state.read=false;if(buttonEl)buttonEl.disabled=true;
 try{
  say('Loading the on-device text reader…');
  const text=await window.TidyPhotoTaskOCR.read(file,msg=>say(msg));
  const lines=String(text||'').replace(/\r/g,'').split('\n').map(line=>line.trim().replace(/^\s*(?:(?:[-*•●▪◦‣])\s*|\d{1,3}[.)]\s*|\[\s*[xX ]?\s*\]\s*)/, '').trim()).filter(Boolean);
  if(!lines.length)throw Error('No text was detected. Try a clearer, brighter photo.');
  if(areaField)areaField.value=lines.join('\n');state.read=true;say(`${lines.length} line${lines.length===1?'':'s'} read. Check and edit them before adding.`);
 }catch(error){const fileMode=location.protocol==='file:';say(fileMode?'Photo reading needs the app opened from localhost or its HTTPS address; this file:// copy blocks the OCR worker.':(error.message||'Could not read this photo. Try another image.'));}
 finally{if(buttonEl)buttonEl.disabled=false;}
}
// Suggestions are plain tappable rows immediately below the title input.
// Matching and choosing reusable drafts are read-only; an explicit Do Later selection adds its existing ID to Doing Now.
function hideTaskTitleSuggestions({dismiss=false}={}){
 const state=taskTitleSuggestionState;
 if(!state)return;
 const input=editor.querySelector('#modal-form [name="title"]');
 if(dismiss&&input)state.dismissedTitle=String(input.value||'').trim();
 state.matches=[];
 const host=editor.querySelector('[data-task-title-suggestion]');
 if(host)host.innerHTML='';
 if(input)input.setAttribute('aria-expanded','false');
 clearTimeout(taskTitleSuggestionTimer);
}
function renderTaskTitleSuggestion(){
 const state=taskTitleSuggestionState;if(!state||!editor.open||state.applying)return;
 const input=editor.querySelector('#modal-form [name="title"]'),host=editor.querySelector('[data-task-title-suggestion]');
 if(!input||!host)return;
 const value=String(input.value||'').trim();
 if(!value||state.dismissedTitle===value||state.appliedTitle===value){hideTaskTitleSuggestions();return;}
 const selectedRoom=editor.querySelector('#modal-form [name="room"]')?.value||'';
 const isSide=editor.querySelector('#modal-form [name="side"]')?.checked;
 const matches=L?.autocompleteSavedTasks?.(board,value,selectedRoom,6,isSide?null:M)||[];
 state.matches=matches;
 input.setAttribute('aria-expanded',matches.length?'true':'false');
 if(!matches.length){host.innerHTML='';return;}
 host.innerHTML=`<ul class="task-autocomplete-list" aria-label="Matching task names">${matches.map(item=>`<li>${button(`<span class="task-autocomplete-name">${esc(item.title)}</span><span class="task-autocomplete-room">${esc(item.roomName)} · ${item.sourceType==='do-later'?'Do Later · Add to Doing Now':item.sourceType==='template'?'Saved reusable task':'Existing task'}</span>`,'task-title-suggestion-use',item.id,'task-autocomplete-choice',`data-source-type="${esc(item.sourceType)}" aria-label="${item.sourceType==='do-later'?'Add to Doing Now:':'Use'} ${esc(item.title)} from ${esc(item.roomName)}"`)}</li>`).join('')}</ul>`;
}
function focusTaskTitleInput(){editor.querySelector('#modal-form [name="title"]')?.focus({preventScroll:true});}
// Copy reusable values into existing controls only. Never open More options
// or Add subtask automatically; Kayleigh can expand either to review them.
function copyReusableTaskSettingsToForm(draft){
 const values={title:draft.title,children:draft.children.map(child=>child.title).join('\n'),tools:draft.tools,notes:draft.notes,estimate:String(draft.estimate),priority:String(draft.priority),effort:draft.effort,messImpact:draft.messImpact,tags:draft.tags.join(', '),taskType:draft.taskType};
 for(const [name,value] of Object.entries(values)){
  const field=editor.querySelector(`#modal-form [name="${name}"]`);
  if(field)field.value=value;
 }
}
function useTaskTitleSuggestion(el){
 const state=taskTitleSuggestionState;
 const match=state?.matches?.find(row=>row.id===el?.dataset?.id&&row.sourceType===el?.dataset?.sourceType);
 if(!match)return;
 if(match.sourceType==='do-later'){
  if(editor.querySelector('#modal-form [name="side"]')?.checked)return;
  if(change(b=>L.selectDoLaterTask(b,match.id,M))){closeDialog(true);notice('Added to Doing Now');}
  return;
 }
 const draft=L?.draftFromSavedTask?.(match);if(!draft)return;
 state.applying=true;
 copyReusableTaskSettingsToForm(draft);
 state.appliedTitle=draft.title;
 state.dismissedTitle='';
 hideTaskTitleSuggestions();
 const title=editor.querySelector('#modal-form [name="title"]');
 if(title)title.dispatchEvent(new Event('input',{bubbles:true}));
 state.applying=false;
 focusTaskTitleInput();
}
function dismissTaskTitleSuggestion(){hideTaskTitleSuggestions({dismiss:true});focusTaskTitleInput();}
function taskEditor(original=null,template=false,mode='task'){
 const creating=!original&&!template,newReusable=template&&!original;
 const suggestSavedTasks=creating&&mode==='task';
 const t=M.clone(original||M.task({room:['room','focus','clearway','doing-focus'].includes(route)?roomId:rooms()[0]?.id||'',doing:route==='doing',side:route==='side'||route==='room'&&tab==='side',sideKind:sideTab==='all'?'organisation':sideTab}));
 const heading=template?(t.title?'Edit reusable task':'Add reusable task'):(t.title?'Edit task':'Add task');
 const tabBar=creating?taskEditorTabs(mode):'';
 if(creating&&mode==='saved'){
  const available=F().templates.filter(saved=>!F().hiddenTemplates.includes(saved.id));
  const savedList=available.length?available.map(saved=>card(`<div class="row spread"><strong>${esc(saved.title)}</strong>${button('Choose','activate-template',saved.id,'ghost',`aria-label="Choose ${esc(saved.title)}"`)}</div>`)).join(''):'<p class="empty">No saved tasks yet. Create one under More → Task Library.</p>';
  dialog('Add task',tabBar+savedList);
  return;
 }
 const selectedTools=t.tools.split('\n').map(x=>x.trim()).filter(Boolean);
 const scheduled=creating&&mode==='scheduled';
 const scheduleFields=scheduled||newReusable?`<div class="schedule-entry"><div class="columns">${field(newReusable?'Repeat every (optional)':'Repeat every','repeatValue',newReusable?'':1,'number',`${scheduled?'required ':''}min="1" max="3650" step="1"`)}${select('Unit','repeatUnit',[['days','Days'],['weeks','Weeks'],['months','Months']],'weeks')}</div>${scheduled?field('First due date (optional)','firstDue','','date')+'<p class="small">Without a first due date, the calendar preview starts after the first interval.</p>':'<p class="small">Leave the interval blank for no repeat. Saving creates a reusable template only; using it adds the task.</p>'}</div>`:'';
 const titleField=field('Task name','title',t.title,'text',suggestSavedTasks?'required maxlength="500" autocomplete="off" aria-expanded="false" aria-controls="task-title-autocomplete-list"':'required maxlength="500"');
 const core=tabBar+(suggestSavedTasks?`<div class="task-title-autocomplete">${titleField}<div id="task-title-autocomplete-list" data-task-title-suggestion></div></div>`:titleField)+select('Room','room',[['','No room (Homeless)'],...rooms().map(r=>[r.id,r.name])],t.room)+`<div class="add-task-options" role="group" aria-label="Task location and priority">${check('Add to Doing Now','doing',t.doing)}${check('Needs attention','attention',t.attention)}${check('Side task','side',t.side)}</div>`+detail('Add subtask',area('Subtasks — one per line','children',t.children.map(c=>c.title).join('\n')))+scheduleFields;
 const commonTools=F().tools.map(tool=>check(tool,'tool',selectedTools.includes(tool),`value="${esc(tool)}"`)).join('');
 const warningSettings=detail('Warning indicator · optional',`${check('Show a warning for this task','warningEnabled',t.warningEnabled)}<p class="small">Green stays on Home only. Due warnings also appear in the top bar and follow the task through household sync.</p><div class="columns">${field('First due date','warningFirstDue',t.warningFirstDue,'date')}${field('Repeat after completion (days; 0 = do not repeat)','warningRepeatDays',Number(t.warningRepeatDays)||0,'number','min="0" max="3650" step="1"')}</div><p class="small">Completion clears the warning. Set a repeat interval to make it due again after that many days; 0 leaves it clear until you set a new due date.</p><div class="warning-stage-fields"><strong>Escalate after due · days overdue</strong><div class="columns">${field('Amber','warningAmberDays',Number(t.warningAmberDays)||1,'number','min="1" max="3650" step="1"')}${field('Red','warningRedDays',Number(t.warningRedDays)||2,'number','min="2" max="3650" step="1"')}${field('Flashing red','warningFlashingDays',Number(t.warningFlashingDays)||3,'number','min="3" max="3650" step="1"')}</div></div>`);
 const more=detail('More options',area('Tools — one per line','tools',t.tools)+field('Custom tool (optional)','customTool','')+check('Add to Tools List','saveCustomTool')+(commonTools?detail('Common Tools',`<div class="compact-tools">${commonTools}</div>`):'')+area('Notes','notes',t.notes)+`<div class="columns">${field('Estimate (minutes)','estimate',t.estimate,'number','min="0" max="100000"')}${field('Priority (1 highest, 5 lowest)','priority',t.priority,'number','min="1" max="5"')}</div>`+field('Physical effort','effort',t.effort)+field('Check interval (days; 0 = as needed)','checkDays',Number(t.checkDays)||0,'number','min="0" max="3650" step="1"')+select('How to suggest','conditionMode', [['as-needed','As needed'],['check','Reminder to check'],['condition','Inspect condition before doing']],t.conditionMode||'as-needed')+`<div class="memory-suggestion-setting">${check('Show in “What should I do?” suggestions','showInSuggestions',t.showInSuggestions!==false)}<p class="small">Shared with everyone in this household.</p></div><div class="columns">${field('Priority ranking weight','rankPriorityWeight',t.rankPriorityWeight??1,'number','min="0" max="10" step="0.25"')}${field('Last-done ranking weight','rankRecencyWeight',t.rankRecencyWeight??1,'number','min="0" max="10" step="0.25"')}${field('Mess ranking weight','rankMessWeight',t.rankMessWeight??1,'number','min="0" max="10" step="0.25"')}</div>`+warningSettings+area('Search tags (comma or line separated)','tags',(Array.isArray(t.tags)?t.tags:[]).join(', '))+select('Task type','taskType',[['cleaning','Cleaning'],['organising','Organising'],['maintenance','Maintenance'],['other','Other'],...(!['cleaning','organising','maintenance','other'].includes(t.taskType)?[[t.taskType,t.taskType]]:[])],t.taskType||'cleaning')+field('Due date (optional)','dueDate',t.dueDate,'date')+select('Mess impact','messImpact',['none','tiny','small','normal','big'].map(x=>[x,x]),t.messImpact)+assigneeField(t)+field('Area','area',t.area)+select('Side task tab','sideKind',sideChoices().filter(([id])=>id!=='all'),t.sideKind)+`<label class="field">Attach image<input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></label>${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Current attachment">${check('Remove image','removeImage')}`:''}${M.repeat(t)?'<p class="small">Existing repeat rules are preserved. Schedule editing will follow later.</p>':''}`);
 dialog(heading,core,async(fd)=>{
  const names=String(fd.get('children')||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const updated=M.reconcileChildren(t.children,names);
  const ids=new Set(updated.map(c=>c.id));updated.forEach(c=>{if(c.parentId&&!ids.has(c.parentId))c.parentId=''});
  let image=fd.get('removeImage')?'':t.image;const file=fd.get('image');
  if(file?.size){if(file.size>2*1024*1024)throw Error('Choose an image smaller than 2 MB.');if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP or GIF image.');image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Image could not be read.'));reader.readAsDataURL(file);});}
  const assignedUserId=String(fd.get('assignedUserId')||''),assigned=window.TidySharing?.people()?.find(p=>p.id===assignedUserId)?.name||(fd.has('assigned')?String(fd.get('assigned')||''):assignedUserId===t.assignedUserId?t.assigned:'');
  const customTool=String(fd.get('customTool')||'').trim();
  if(fd.has('saveCustomTool')&&!customTool)throw Error('Enter a custom tool before adding it to your Tools List.');
  const checkDays=Number(fd.get('checkDays')||0);if(!Number.isInteger(checkDays)||checkDays<0||checkDays>3650)throw Error('Check interval must be a whole number from 0 to 3650.');
  const warningEnabled=fd.has('warningEnabled'),warningFirstDue=String(fd.get('warningFirstDue')||''),warningRepeatDays=Number(fd.get('warningRepeatDays')||0),warningAmberDays=Number(fd.get('warningAmberDays')||1),warningRedDays=Number(fd.get('warningRedDays')||2),warningFlashingDays=Number(fd.get('warningFlashingDays')||3);
  if(warningEnabled){if(!CW?.validDay(warningFirstDue))throw Error('Choose a valid first due date for the warning.');if(!Number.isInteger(warningRepeatDays)||warningRepeatDays<0||warningRepeatDays>3650)throw Error('Warning repeat interval must be 0 to 3650 whole days.');if(!Number.isInteger(warningAmberDays)||!Number.isInteger(warningRedDays)||!Number.isInteger(warningFlashingDays)||warningAmberDays<1||warningRedDays<=warningAmberDays||warningFlashingDays<=warningRedDays||warningFlashingDays>3650)throw Error('Warning stages must be in order: Amber, Red, then Flashing Red.');}
  const tags=[...new Set(String(fd.get('tags')||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean))].slice(0,30);
  const weights=['rankPriorityWeight','rankRecencyWeight','rankMessWeight'].map(k=>Number(fd.get(k)??1));if(weights.some(w=>!Number.isFinite(w)||w<0||w>10))throw Error('Ranking weights must be from 0 to 10.');
  const saved={...t,checkDays,conditionMode:String(fd.get('conditionMode')||'as-needed'),showInSuggestions:fd.has('showInSuggestions'),rankPriorityWeight:weights[0],rankRecencyWeight:weights[1],rankMessWeight:weights[2],tags,taskType:String(fd.get('taskType')||'cleaning'),title:String(fd.get('title')||'').trim(),room:String(fd.get('room')||''),doing:fd.has('doing'),attention:fd.has('attention'),side:fd.has('side'),children:updated,tools:[...new Set([...String(fd.get('tools')||'').split('\n'),...fd.getAll('tool'),customTool].map(x=>x.trim()).filter(Boolean))].join('\n'),notes:String(fd.get('notes')||''),estimate:Number(fd.get('estimate')),priority:Number(fd.get('priority')),effort:String(fd.get('effort')||''),dueDate:String(fd.get('dueDate')||''),messImpact:String(fd.get('messImpact')||''),assigned,assignedUserId,area:String(fd.get('area')||''),sideKind:String(fd.get('sideKind')||''),image,touched:t.touched||!!t.generatedFrom,wasParent:t.wasParent||updated.length>0};
  saved.warningEnabled=warningEnabled;saved.warningFirstDue=warningFirstDue;saved.warningRepeatDays=warningRepeatDays;saved.warningAmberDays=warningAmberDays;saved.warningRedDays=warningRedDays;saved.warningFlashingDays=warningFlashingDays;
  if(warningFirstDue!==String(t.warningFirstDue||'')){saved.warningLastCompletedAt='';saved.warningNextDue='';}
  else if(Number(t.warningRepeatDays)!==warningRepeatDays&&t.warningLastCompletedAt){saved.warningNextDue=warningRepeatDays?CW.addDays(String(t.warningLastCompletedAt).slice(0,10),warningRepeatDays):'';}
  if(scheduled||(newReusable&&String(fd.get('repeatValue')||'').trim()!=='')){
   const raw=String(fd.get('repeatValue')||''),value=Number(raw),unit=String(fd.get('repeatUnit')||'');
   if(!/^\d+$/.test(raw)||!Number.isInteger(value)||value<1||value>3650||!['days','weeks','months'].includes(unit))throw Error('Choose a valid repeat interval.');
   const firstDue=scheduled?String(fd.get('firstDue')||''):'';
   if(firstDue&&(!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)||!Number.isFinite(Date.parse(firstDue+'T12:00:00Z'))||new Date(firstDue+'T12:00:00Z').toISOString().slice(0,10)!==firstDue))throw Error('Enter a valid first due date.');
   saved.repeatDays=unit==='months'?0:value*(unit==='weeks'?7:1);
   saved.repeatMonths=unit==='months'?value:0;
   saved.nextDue=firstDue;saved.calendarEnabled=true;
  }
  if(!saved.title)throw Error('Enter a task name.');
  if(board.features.browserSync&&original&&t.side!==saved.side)throw Error('Moving a shared task between Tasks and Side tasks is for a later stage. Keep its category to preserve the shared identity.');
   if(change(b=>{
   if(creating&&!template){const duplicate=L?.findDuplicateTask?.(b,saved.title,saved.room,saved.side);if(duplicate)throw Error(duplicate.done?'This completed task already exists in this room. Use “Do again” on the existing task or edit that task instead.':'An active task with this title already exists in this room. Edit it or choose another room or title.');}
   if(template){const at=b.features.templates.findIndex(x=>x.id===t.id);if(at>=0)b.features.templates[at]=saved;else b.features.templates.unshift(saved);}
   else{const at=b.tasks.findIndex(x=>x.id===t.id);if(at<0)M.add(b,saved);else b.tasks[at]=saved;const order=b.doingOrder.filter(x=>x!==saved.id);b.doingOrder=saved.doing?(t.doing&&at>=0?b.doingOrder:[saved.id,...order]):order;}
   if(fd.has('saveCustomTool')&&!b.features.tools.some(tool=>tool.toLowerCase()===customTool.toLowerCase()))b.features.tools.push(customTool);
  })){closeDialog(true);notice('Task saved');}
  },{saveLabel:creating?'Add task':'Save',afterSave:more});
 if(suggestSavedTasks)taskTitleSuggestionState={matches:[],dismissedTitle:'',appliedTitle:'',applying:false};
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
 const controls=item.done?'<p>This Task is complete. Its timing history is preserved.</p>':started
  ?`${button(item.startedAt?'Pause':'Continue','task-clock-toggle',t.id,'',`data-child="${esc(cid)}"`)}${button('Finished?','task-clock-finish',t.id,'complete',`data-child="${esc(cid)}"`)}${button('Stop without saving','task-clock-stop',t.id,'ghost',`data-child="${esc(cid)}"`)}`
  :button('Start timer','task-clock-start',t.id,'complete',`data-child="${esc(cid)}"`);
 dialog('Task Timer · '+item.title,`<section class="quest-time-panel" data-quest-timer-task="${esc(t.id)}" data-quest-timer-child="${esc(cid)}"><span class="small" data-quest-timer-label>${state?.overdue?'Extra time':started?'Time remaining':'Personal estimated task time'}</span><div class="timer-value" data-clock-task="${esc(t.id)}" data-clock-child="${esc(cid)}">${started?(state.overdue?'+':'')+TIME.format(state.shownMs):TIME.format(estimateMs)}</div><p class="small">Estimate: ${TIME.format(estimateMs)} · alarm after 5 minutes overtime.</p><div class="row">${controls}</div><div class="row" data-task-alarm-actions ${!state?.alarmDue?'hidden':''}>${button('Acknowledge alarm','task-alarm-ack',t.id,'ghost',`data-child="${esc(cid)}"`)}${button('Snooze 5 minutes','task-alarm-more',t.id,'ghost',`data-child="${esc(cid)}"`)}</div></section>`);
 if(window.TidyPhoneTimer?.addPhoneTimer)window.TidyPhoneTimer.addPhoneTimer(editor,editor.querySelector('#modal-form'));
 updateClocks();
}
function finishTimed(id,cid='',priorNote=''){
 const t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!t||!item||item.done)return;
 const elapsed=M.time(item);if(!hasTimedAttempt(item)){const done=()=>change(b=>cid?M.completeChild(b,id,cid,true):M.finish(b,id,true));if(!cid&&t.children.some(c=>!c.done))confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,done,'Done em all');else done();return;}
 const record=button('Yes, record this time','task-clock-commit',id,'complete',`data-child="${esc(cid)}" data-mode="valid"${elapsed>0?'':' disabled'}`);
 dialog('Finish Task?',`<p>Did this timed attempt reflect how long you worked on <strong>${esc(item.title)}</strong>?</p><p class="timer-value">${TIME.format(elapsed)}</p>${elapsed>0?'':'<p class="small">No time has elapsed yet. Continue working, or complete without recording time.</p>'}<label class="field">Optional note<textarea id="quest-timer-note" rows="2" placeholder="Why was this attempt different?">${esc(priorNote)}</textarea></label><div class="quest-timer-choices">${record}${button('I got distracted','task-clock-commit',id,'ghost',`data-child="${esc(cid)}" data-mode="distracted"`)}${button('Complete without using this time','task-clock-commit',id,'ghost',`data-child="${esc(cid)}" data-mode="no-time"`)}${button('Continue Working','task-clock-continue',id,'ghost',`data-child="${esc(cid)}"`)}</div><p class="small">If distracted, you can enter minutes lost so only working time informs the estimate. Leave minutes blank to exclude the attempt. Original time and note stay in history.</p>`);
}
function distractionTimed(id,cid='',note=''){
 const t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!t||!item||item.done)return;
 const elapsed=M.time(item);
 dialog('I got distracted',`<p>Original timed duration: <strong>${TIME.format(elapsed)}</strong>.</p><p class="small">How many minutes were you distracted? Leave blank if you cannot estimate. A known duration is subtracted from the working time used to learn your estimate.</p><label class="field">Minutes distracted (optional)<input id="quest-distraction-minutes" type="number" inputmode="decimal" min="0" step="0.1" placeholder="Leave blank if unsure"></label><label class="field">Optional note<textarea id="quest-timer-note" rows="2">${esc(note)}</textarea></label><div class="quest-timer-choices">${button('Confirm completion','task-clock-commit',id,'complete',`data-child="${esc(cid)}" data-mode="distracted" data-final="1"`)}${button('Back to choices','task-clock-distraction-back',id,'ghost',`data-child="${esc(cid)}"`) }${button('Continue Working','task-clock-continue',id,'ghost',`data-child="${esc(cid)}"`)}</div><p class="small">The full elapsed time and your note remain in Task Data history.</p>`);
}
function commitTimed(id,cid,kind,note,distractionRaw=null){
 const current=task(id),item=cid?current?.children.find(c=>c.id===cid):current;if(!current||!item||!['valid','distracted','no-time'].includes(kind))return false;const elapsed=M.time(item);if(kind==='valid'&&!elapsed)return false;const adjustment=kind==='distracted'?TIME.distraction(elapsed,distractionRaw):null;
 return change(b=>{const t=b.tasks.find(x=>x.id===id),target=cid?t.children.find(x=>x.id===cid):t,at=new Date().toISOString(),record={id:M.uid(),taskId:target.id,taskTitle:target.title,owner:TIME.ownerOf(b),kind,durationMs:elapsed,at,room:t.room,note:String(note||'').slice(0,500)},beforeWins=new Set(b.features.wins.map(w=>w.id));if(adjustment&&adjustment.distractionMinutes!==null){record.distractionMinutes=adjustment.distractionMinutes;record.workDurationMs=adjustment.workDurationMs;}b.features.questTimings.push(record);target.elapsed=elapsed;target.startedAt=0;target.timerEstimateMs=0;target.alarmNextAtMs=0;target.alarmDismissed=true;if(cid)M.completeChild(b,id,cid,true);else M.finish(b,id,true);record.completionWinIds=b.features.wins.filter(w=>!beforeWins.has(w.id)).map(w=>w.id);});
}
const alarmSignals=new Set();
function updateClocks(){
 const now=Date.now(),expiryPassed=nextCompletionExpiry>0&&now>=nextCompletionExpiry;nextCompletionExpiry=M.nextTaskCompletionExpiry(board,now);if(expiryPassed){render();return;}
 document.querySelectorAll('[data-quest-timer-task]').forEach(panel=>{const id=panel.dataset.questTimerTask,cid=panel.dataset.questTimerChild||'',t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!item)return;const estimateMs=Number(item.timerEstimateMs)||questEstimateMs(item),started=!!item.startedAt||!!item.elapsed,status=TIME.status(started?M.time(item):0,estimateMs,item.alarmNextAtMs,item.alarmDismissed),face=panel.querySelector('[data-clock-task]'),label=panel.querySelector('[data-quest-timer-label]'),actions=panel.querySelector('[data-task-alarm-actions]');if(face)face.textContent=(started&&status.overdue?'+':'')+TIME.format(started?status.shownMs:estimateMs);if(label)label.textContent=!started?'Personal estimated task time':status.overdue?'Extra time':'Time remaining';if(actions)actions.hidden=!status.alarmDue;});
 for(const t of board.tasks)for(const item of [t,...t.children]){if(!item.startedAt||!item.timerEstimateMs||item.alarmDismissed)continue;const status=TIME.status(M.time(item),item.timerEstimateMs,item.alarmNextAtMs,item.alarmDismissed);if(!status.alarmDue){alarmSignals.delete(item.id);continue;}if(alarmSignals.has(item.id))continue;alarmSignals.add(item.id);setTimeout(()=>alarmSignals.delete(item.id),TIME.REPEAT_MS);if(F().sound)playTimerAlert();if(!editor.open||!editor.querySelector(`[data-quest-timer-task="${CSS.escape(t.id)}"]`))notice(`Timer finished: ${item.title}. Open its timer to acknowledge or snooze.`);}
 const cd=$('[data-countdown]');if(cd){const left=Math.max(0,Math.ceil(((F().countdownEndsAt||0)-Date.now())/1000));cd.textContent=F().countdownEndsAt?`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Ready';if(F().countdownEndsAt&&left===0){change(b=>b.features.countdownEndsAt=0,{redraw:false});notice('Focus countdown finished');if(F().sound)playTimerAlert();}}
}
function playTimerAlert(){try{const alert=new Audio(asset('audio/soft-double-tap.wav'));alert.volume=soundVolume;alert.play().catch(()=>{});}catch{}}
function focusTimer(){
 dialog('Focus timer & music',`${field('Minutes','minutes',10,'number','min="1" max="1440" step="1" required')}${detail('In-browser countdown (only while open)',`<div class="timer-value" data-countdown>Ready</div><div class="row">${button('Start countdown','countdown-start')}${button('Cancel countdown','countdown-stop','','ghost')}</div><p class="small">Browser suspension may delay this countdown. For an actual alarm use the phone timer above.</p>`)}${detail('Music',`${select('Track','track',[['forest-ambience','Forest ambience'],['subtle-bass','Subtle bass']],'forest-ambience')}<div class="row">${button('Play music','music-play')}${button('Stop music','music-stop','','ghost')}</div>`)}<label class="field" for="focus-sound-volume">Music and alarm volume <span class="row"><input id="focus-sound-volume" type="range" min="0" max="30" step="1" value="${Math.round(soundVolume*100)}" aria-label="Music and alarm volume"><output id="focus-sound-output">${Math.round(soundVolume*100)}%</output></span></label><div class="row">${button('Preview soft timer sound','sound-preview','','ghost')}</div>`);
 if(window.TidyPhoneTimer?.addPhoneTimer)window.TidyPhoneTimer.addPhoneTimer(editor,editor.querySelector('#modal-form'));
 updateClocks();
}
function focusToolsDialog(ids=[]){
 const selected=ids.map(id=>task(id)).filter(Boolean),owner=TIME.ownerOf(board),preferences=FTOOLS?.read(localStorage,owner)||{},sources=FTOOLS?.sources(selected)||[],rows=FTOOLS?.groups(selected,preferences)||[];
 const list=rows.map((x,i)=>`<label class="check quest-tool-item"><input type="checkbox" aria-label="Have ${esc(x.name)} ready"><span><strong>${esc(x.name)}</strong><small>For ${esc(x.quests.join(', '))}</small></span></label>`).join('');
 const edits=sources.map((x,i)=>`<details class="quest-tool-preference"><summary>Change ${esc(x.name)} for me</summary><label class="field">My preferred alternative<input type="text" maxlength="100" name="focusToolPreference${i}" value="${esc(preferences[x.key]||'')}" placeholder="Keep the saved supply"></label></details>`).join('');
 const save=sources.length&&FTOOLS?fd=>{const next=FTOOLS.update(preferences,sources,i=>fd.get('focusToolPreference'+i));FTOOLS.write(localStorage,owner,next);closeDialog(true);}:null;
 dialog('What I Need · optional',`<section class="quest-focus-tools">${list||'<p class="small">No supplies are listed for these tasks.</p>'}${edits}<div class="row">${button('Skip · continue Focus','close-dialog','','ghost')}</div></section>`,save,{saveLabel:'Save my preferences'});
}
function toolsDialog(id=''){const ts=route==='doing'?M.doing(board):visibleTasks(),tools=[...new Set(ts.filter(t=>!id||t.room===id).filter(t=>!t.done).flatMap(t=>[t.tools,...t.children.filter(c=>!c.done).map(c=>c.tools)]).flatMap(s=>s.split(/[\n,]/)).map(x=>x.trim()).filter(Boolean))];dialog(id?'Tools · '+(room(id)?.name||'Homeless'):'Tools needed',tools.length?tools.map(x=>check(x,'tool')).join(''):'<p>No tools listed for the selected tasks.</p>');}
/* Room Focus and Doing Now Focus are separate. Clear the Way is independent. */
function openQuestFocus(id=''){
 if(!Q){notice('Task Focus has not loaded. Your tasks are unchanged.');return;}
 if(!id){dialog('Choose a room for Focus',rooms().map(r=>button(esc(r.name),'focus-room-choice',r.id,'wide')).join(''));return;}
 if(!room(id)){notice('Choose an existing room.');return;}
 navigate('focus',id);Q.enter(board,id,'focus');
}
function startRoomFocus(id=''){
 if(!Q){notice('Task Focus has not loaded. Your tasks are unchanged.');return;}
 if(!id){dialog('Choose a room for Focus',rooms().map(r=>button(esc(r.name),'focus-room-choice',r.id,'wide')).join(''));return;}
 if(!room(id)){notice('Choose an existing room.');return;}
 Q.load(board,id,false,false,'room');
 if(Q.hasPreviousFocus()){navigate('focus',id);Q.enter(board,id,'focus');return;}
 dialog('Room Focus',`<p>Start with Clear the Way, or skip to choose tasks?</p><div class="quest-actions">${button('Clear the Way','focus-start-clearway',id,'primary')}${button('Skip','focus-skip-clearway',id,'ghost')}</div>`);
}
function clearUnfinished(roomId,allRooms=false){return CQ?.collectedTasks(board,roomId,allRooms)||board.tasks.filter(t=>(allRooms||t.room===roomId)&&!t.done&&!t.archived&&String(t.generatedFrom||'').startsWith('clear-way-session:'));}
function leaveCurrentFocus(){
 const current=Q?.get(),destination=current?.scope==='doing'?'doing':'room',found=current?.room||roomId,allRooms=current?.scope==='doing',remaining=clearUnfinished(found,allRooms),target=allRooms&&remaining[0]?.room||found,unfinished=current?.phase==='active'&&(current.startedIds||[]).some(id=>{const t=task(id);return t&&!t.done;});
 if(!remaining.length){if(unfinished){confirmDialog('Leave unfinished Focus?',`Your unfinished Focus will be saved so you can continue later.`,()=>navigate(destination,found),'Leave Focus');return;}navigate(destination,found);return;}
 const preview=remaining.slice(0,6).map(t=>`<li>${allRooms?`<strong>${esc(room(t.room)?.name||'Other room')}:</strong> `:''}${esc(t.title)}</li>`).join('');
 dialog(unfinished?'Leave Focus?':'Collected items to return',`${unfinished?'<p>Your unfinished Focus will be saved so you can continue later.</p>':''}<p>${remaining.length} active return or sorting task${remaining.length===1?'':'s'} remain outside Focus.</p><ul>${preview}</ul>${remaining.length>6?'<p>More remain on the Home sorting tile.</p>':''}<div class="row">${button('Return Now','clear-return-now',target,'primary')}${button('Return Later','clear-return-later',target,'ghost')}</div>`);
}
function openClearWay(id=''){
 if(!Q||!CQ){notice('Clear the Way is unavailable. Your Tasks are unchanged.');return;}
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
function doingFocusAnchor(){
 const identity=String(F().browserSync?.account||'local')+'|member:'+String(F().displayName||'Me'),prefix='tidyish-html-v023-quest-focus-v2:'+encodeURIComponent(identity)+':doing:';
 for(const r of rooms())try{const saved=JSON.parse(localStorage.getItem(prefix+encodeURIComponent(r.id))||'null'),s=saved?.session;if(s?.version===2&&s.scope==='doing'&&s.room===r.id&&(s.startedIds?.length||s.questIds?.length))return r.id;}catch{}
 return room('kitchen')?'kitchen':rooms()[0]?.id;
}
function openDoingFocus(){if(!Q){notice('Focus is unavailable. Your tasks are unchanged.');return;}const anchor=doingFocusAnchor();if(!anchor){notice('Add a room before starting Focus.');return;}navigate('doing-focus',anchor);Q.enter(board,anchor,'focus','doing');}
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportBoard(){const copy=M.clone(board);delete copy.features.browserSync;delete copy.features.householdSync;delete copy.features.connectedHouse;delete copy.features.seasonalSharedHouse;delete copy.sharedSnapshot;download(`Tidy-ish-HTML-${M.date()}.json`,JSON.stringify(copy,null,2));}
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
 'open-grind':el=>{grindSection=el.dataset.id;if(route==='grind'){rememberBackState();render();}else navigate('grind');},
 'open-warning-task':el=>{const t=task(el.dataset.id);if(!t)return;if(t.side){sideTab=t.sideKind||'organisation';navigate('side');return;}if(t.room){navigate('room',t.room);openTasks.add(t.id);tab='tasks';render();return;}dialog('Task reminder',`<p><strong>${esc(t.title)}</strong></p><p>${esc(CW.status(t,M.date())?.label||'Not due')}</p>${button('Edit task','edit-task',t.id,'ghost')}`);},
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
 'clear-categories':el=>{const t=task(el.dataset.id);if(!t||!String(t.generatedFrom||'').startsWith('clear-way-session:'))return;dialog('Name items placed near their homes',`<p class="small">One category per line. These appear as subtasks of the active room Task.</p>${area('Categories','categories','')}`,fd=>{const names=[...new Set(String(fd.get('categories')||'').split('\n').map(x=>x.trim()).filter(Boolean))];if(!names.length)throw Error('Enter at least one category.');if(change(b=>{const selected=b.tasks.find(x=>x.id===t.id);for(const name of names){const title='Put away: '+name.slice(0,120);if(!selected.children.some(x=>x.title.toLowerCase()===title.toLowerCase()))selected.children.push(M.child({title}));}}))closeDialog(true);},{saveLabel:'Add categories'});},
 'floor-add':()=>dialog('Add repeatable floor Task',field('Task name','title','Hoover floor','text','required maxlength="150"')+select('Room','room',rooms().map(r=>[r.id,r.name]),'living'),fd=>{const title=String(fd.get('title')||'').trim(),roomId=String(fd.get('room')||'');if(!title||!room(roomId))throw Error('Choose a room and task name.');if(change(b=>M.add(b,M.task({title,room:roomId,littleOften:true,taskType:'little-often',messImpact:'none'}))))closeDialog(true);},{saveLabel:'Add floor Task'}),
 'clear-return-now':el=>{closeDialog(true);navigate('room',el.dataset.id);notice('Your collected-item Tasks are active in this room.');},
 'clear-return-later':el=>{closeDialog(true);navigate('room',el.dataset.id);notice('Return and sorting Tasks remain active for later.');},
 'nav-back':()=>back(),
 navigate:el=>navigate(el.dataset.id),room:el=>navigate('room',el.dataset.id),later:()=>notice('This feature will follow later.'),
 'calendar-month-prev':()=>{calendarOffset--;render()},'calendar-month-next':()=>{calendarOffset++;render()},
 'calendar-day':el=>calendarDay(el.dataset.id),'daily-log-open':el=>{daybookDate=el.dataset.id;dailyLogViewState={...(dailyLogViewState||{}),selectedDate:daybookDate};route='data';dataView='daybook';dataTaskId='';closeDialog(true);render();window.scrollTo(0,0)},
 'christmas-gift-open':el=>navigate('christmas-gifts',el.dataset.id),
 'christmas-wrap-open':el=>navigate('christmas-wrap',el.dataset.id),
 'christmas-person':el=>{christmasPerson=el.dataset.id;rememberBackState();render()},
 'christmas-gift-add':()=>christmasGiftEditor(),
 'christmas-idea-add':()=>christmasGiftEditor(null,'idea'),
 'christmas-idea-buy':el=>{const g=SW.christmasContext(board,christmasGiftId)?.gifts.find(g=>g.id===el.dataset.id&&g.status==='idea');if(g)christmasGiftEditor(g,'bought')},
 'christmas-person-add':()=>christmasPersonEditor(),
 'christmas-person-save-legacy':el=>{const person=giftPeopleWithLegacy().find(p=>p.id===el.dataset.id&&p.legacy);if(person)christmasPersonEditor(person.name,true)},
 'christmas-person-tracker':el=>christmasApply('person-tracker',{recipientId:el.dataset.id}),
 'christmas-person-check':el=>{const p=board.features.giftPeople.find(p=>p.id===el.dataset.id);if(p)christmasApply('person-check',{recipientId:p.id,checked:!SW.christmasPersonSettings(p,christmasGiftId).checked})},
 'christmas-budget':el=>christmasBudgetEditor(el.dataset.id),
 'christmas-stages':el=>christmasStageEditor(el.dataset.id),
 'christmas-receipt-later':el=>{if(change(b=>Object.assign(b,SW.christmasGiftChange(b,el.dataset.occurrence,'receipt-later',{id:el.dataset.id},M.date()))))closeDialog(true)},
 'christmas-gift-edit':el=>{const g=SW.christmasContext(board,christmasGiftId)?.gifts.find(g=>g.id===el.dataset.id);if(g)christmasGiftEditor(g,g.status==='idea'?'idea':'bought')},
 'christmas-gift-delete':el=>{const g=SW.christmasContext(board,christmasGiftId)?.gifts.find(g=>g.id===el.dataset.id);if(g)confirmDialog('Delete gift?',`Remove ${g.title} for ${g.recipient}?`,()=>christmasApply('delete',{id:g.id}),'Delete')},
 'christmas-review-gifts':()=>christmasReviewGifts(),
 'christmas-gift-link':el=>{if(christmasApply('link',{id:el.dataset.id})&&editor.open)closeDialog(true)},
 'christmas-receive':el=>christmasApply('receive',{id:el.dataset.id}),
 'christmas-wrap-toggle':el=>christmasApply('wrap',{id:el.dataset.id}),
 'gift-person-view':el=>{giftPersonTab=el.dataset.id;render()},
 'gift-occasion':el=>{if(!['christmas','birthday','all'].includes(el.dataset.id))return;giftView=el.dataset.id;render()},
 'gift-status-tab':el=>{if(!['needs-wrap','wrapped','awaiting-receipt','no-wrapping'].includes(el.dataset.id))return;giftStatusTab=el.dataset.id;render()},
 'gift-checkoff-people-add':giftCheckoffPeopleDialog,'gift-people-manage':giftCheckoffPeopleDialog,'gift-person-add':()=>giftPersonEditor(),
 'gift-person-edit':el=>giftPersonEditor((board.features.giftPeople||[]).find(p=>p.id===el.dataset.id)),
 'gift-ideas':el=>giftIdeasDialog(el.dataset.id),'gift-idea-buy':el=>{const g=(board.features.gifts||[]).find(x=>x.id===el.dataset.id);if(g)openGiftEditor(g)},
 'gift-add':el=>{const [occasion='christmas',personId='']=el.dataset.id.split('|');openGiftEditor(null,occasion,personId)},
 'gift-edit':el=>openGiftEditor((board.features.gifts||[]).find(g=>g.id===el.dataset.id)),
 'gift-receive':el=>{const gift=(board.features.gifts||[]).find(g=>g.id===el.dataset.id);if(!gift||christmasLinked(gift.id)||gift.status!=='bought'||gift.receiptStatus!=='ordered')return;change(b=>{const target=b.features.gifts.find(g=>g.id===gift.id);target.receiptStatus='received';delete target.orderedAt;target.updatedAt=new Date().toISOString();});},
 'gift-wrap-toggle':el=>{const gift=(board.features.gifts||[]).find(g=>g.id===el.dataset.id);if(gift&&!christmasLinked(gift.id)&&(gift.status==='wrapped'||gift.status==='bought'&&gift.receiptStatus!=='ordered'&&!gift.noWrapping)){const prior=giftStatusTab;giftStatusTab=gift.status==='wrapped'?'needs-wrap':'wrapped';if(!change(b=>{const target=b.features.gifts.find(g=>g.id===gift.id);target.status=target.status==='wrapped'?'bought':'wrapped';if(target.receiptStatus){target.receiptStatus='received';delete target.orderedAt;}target.updatedAt=new Date().toISOString()}))giftStatusTab=prior;}},
 'gift-checkoff-toggle':el=>{const [id,occasion]=el.dataset.id.split('|'),person=(board.features.giftPeople||[]).find(p=>p.id===id);if(!person||!['christmas','birthday'].includes(occasion))return;change(b=>{const target=b.features.giftPeople.find(p=>p.id===id);target.tracker=false;target.checkoffs={...(target.checkoffs||{}),[occasion]:!target.checkoffs?.[occasion]};})},
 'gift-delete':el=>{const gift=(board.features.gifts||[]).find(g=>g.id===el.dataset.id);if(gift&&!christmasLinked(gift.id))confirmDialog('Delete gift?',`Remove ${gift.title} for ${gift.recipient}?`,()=>change(b=>b.features.gifts=b.features.gifts.filter(x=>x.id!==gift.id)),'Delete')},
 'gift-person-delete':el=>{const person=(board.features.giftPeople||[]).find(p=>p.id===el.dataset.id);if(person)confirmDialog('Remove person?',`Remove ${person.name} from the household name list? Existing gift records remain.`,()=>change(b=>b.features.giftPeople=b.features.giftPeople.filter(p=>p.id!==person.id)),'Remove')},
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
 'data-view':el=>{if(!['overview','day','rooms','quests','focus','occasional','daybook'].includes(el.dataset.id))return;dataView=el.dataset.id;render()},'calendar-view':el=>{if(!['plan','activity'].includes(el.dataset.id))return;calendarView=el.dataset.id;render()},'data-meter-view':el=>{if(!['clean','elapsed'].includes(el.dataset.id))return;dataMeterView=el.dataset.id;render()},
 'data-period':el=>{dataPeriod=el.dataset.id;dataVisible=12;render()},'data-day-prev':()=>{dataDay=M.plus(dataDay,-1);render()},
 'data-day-next':()=>{dataDay=M.plus(dataDay,1);render()},
 'data-day-today':()=>{dataDay=M.date();render()},

 'data-more':()=>{dataVisible+=12;render()},
 extra:()=>dialog('Extra rooms',rooms().filter(r=>!positions[houseKey(r)]).map(r=>button(esc(r.name),'dialog-room',r.id,'wide')).join('')||'<p>No extra rooms</p>'),
 'all-rooms':()=>dialog('All rooms',rooms().map(r=>button(esc(r.name),'dialog-room',r.id,'wide')).join('')),
 'dialog-room':el=>{closeDialog(true);navigate('room',el.dataset.id)},'room-tab':el=>{tab=el.dataset.id;search='';render()},'doing-tab':el=>{doingTab=el.dataset.id;search='';render()},'side-tab':el=>{sideTab=el.dataset.id;render()},
 view:()=>{detailed=!detailed;render()},'set-doing-view':el=>{doingDetailed=el.dataset.id==='detailed';try{localStorage.setItem(DOING_VIEW_KEY,doingDetailed?'detailed':'compact')}catch{}render()},'task-menu':el=>{const t=task(el.dataset.id);if(!t)return;dialog('Task actions · '+t.title,`<div class="doing-menu-grid">${button('✎ Edit task','edit-task',t.id)}${!t.side?button('Move to Side Task','move-side-quest',t.id,'ghost'):''}${button('＋ Add subtask','add-child',t.id)}${button(stopwatch+' Timer','timer',t.id)}${button('Task Data','data-open-task',t.id)}${button('Save reusable','save-template',t.id)}${t.done&&!t.side&&!t.scheduleMakerManaged&&!t.tidyScheduleV3?button('Do again','library-reactivate',t.id,'ghost'):''}${button(t.paused?'Resume task':'Pause task','pause-task',t.id)}${button('Delete task','delete-task',t.id)}</div>${t.notes?`<p>${esc(t.notes).replace(/\n/g,'<br>')}</p>`:''}${t.tools?`<p class="small">Tools: ${esc(t.tools).replace(/\n/g,', ')}</p>`:''}${t.image?`<img class="attachment" src="${safeImage(t.image)}" alt="Task attachment">`:''}`)},search:()=>{uiSearch=!uiSearch;if(!uiSearch)search='';render();$('#task-search')?.focus()},
 'add-task':()=>taskEditor(),'task-title-suggestion-use':el=>useTaskTitleSuggestion(el),'task-title-suggestion-dismiss':()=>dismissTaskTitleSuggestion(),'photo-task-import':()=>openPhotoTaskImport(),'photo-task-read':()=>readPhotoTaskList(),'edit-task':el=>taskEditor(task(el.dataset.id)),'move-side-quest':el=>{const t=task(el.dataset.id);if(!t||t.side)return;confirmDialog('Move to Side Task?',`Move “${t.title}” out of room tasks and into Side Tasks? Its room, subtasks and history stay attached.`,()=>{const ok=change(b=>{const moved=b.tasks.find(x=>x.id===el.dataset.id);if(moved){moved.side=true;moved.sideKind='organisation';}});if(ok)notice('Moved to Side Tasks');return ok;},'Move')},expand:el=>{const id=el.dataset.id;openTasks.has(id)?openTasks.delete(id):openTasks.add(id);render()},
 'select-task':el=>change(b=>M.select(b,el.dataset.id,el.type==='checkbox'?el.checked:!task(el.dataset.id).doing)),
 complete:el=>{const t=task(el.dataset.id);if(!t)return;if(!t.done&&hasTimedAttempt(t)){finishTimed(t.id);return;}const complete=()=>change(b=>M.finish(b,t.id,!t.done));if(!t.done&&t.children.some(c=>!c.done)){openTasks.add(t.id);confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,complete,'Done em all');}else complete()},
 'child-complete':el=>{const t=task(el.dataset.id),c=t?.children.find(c=>c.id===el.dataset.child);if(!t||!c)return;if(!c.done&&hasTimedAttempt(c)){finishTimed(t.id,c.id);return;}const run=()=>change(b=>M.completeChild(b,t.id,c.id,!c.done));if(!c.done&&t.children.some(x=>x.parentId===c.id))confirmDialog('Done em all',`Complete all subtasks in ${c.title}?`,run,'Done em all');else run()},
 'child-menu':el=>{const t=task(el.dataset.id),c=t?.children.find(x=>x.id===el.dataset.child);if(!t||!c)return;dialog('Subtask actions · '+c.title,`<div class="doing-menu-grid">${button('First','focus-child-first',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Last','focus-child-last',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button(stopwatch+' Timer','timer',t.id,'',`data-child="${esc(c.id)}"`)}${button('Task Data','data-open-task',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('Edit','edit-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}${button('+ Subtask','add-child',t.id,'ghost',`data-child="${esc(c.id)}"`)}</div>`)},'focus-child-first':el=>{closeDialog(true);childMove(el,true)},'focus-child-last':el=>{closeDialog(true);childMove(el,false)},
 'add-child':el=>childEditor(task(el.dataset.id),null,el.dataset.child||''),'edit-child':el=>{const t=task(el.dataset.id);childEditor(t,t.children.find(c=>c.id===el.dataset.child))},
 first:el=>change(b=>M.move(b,el.dataset.id,'first',route==='doing'&&doingTab==='doing')),last:el=>change(b=>M.move(b,el.dataset.id,'last',route==='doing'&&doingTab==='doing')),
 'child-first':el=>childMove(el,true),'child-last':el=>childMove(el,false),
 'delete-task':el=>{const t=task(el.dataset.id);confirmDialog('Delete task?',`Remove “${t.title}” and its subtasks from this browser’s active list? Completion history is kept.`,()=>{const snapshot={task:M.clone(t),index:board.tasks.indexOf(t),order:M.clone(board.doingOrder),page:pageKey()};if(change(b=>{b.tasks=b.tasks.filter(x=>x.id!==t.id);b.doingOrder=b.doingOrder.filter(x=>x!==t.id)})){deleted=snapshot;render();return true;}return false;},'Delete')},
 'undo-delete':()=>{if(!deleted)return;const d=deleted;if(change(b=>{if(!b.tasks.some(t=>t.id===d.task.id)){b.tasks.splice(Math.min(d.index,b.tasks.length),0,d.task);if(d.task.doing)b.doingOrder=[...d.order.filter(id=>id===d.task.id||b.doingOrder.includes(id)),...b.doingOrder.filter(id=>!d.order.includes(id))];}})){deleted=null;render();}},
 choose:()=>dialog('Choose tasks',board.tasks.filter(t=>!t.done&&!M.paused(t)).map(t=>check(t.title,'task',t.doing,`value="${esc(t.id)}"`)).join('')||'<p>Add a task in a room or Doing Now first.</p>',fd=>{const ids=new Set(fd.getAll('task'));if(change(b=>b.tasks.filter(t=>!t.done).forEach(t=>M.select(b,t.id,ids.has(t.id)))))closeDialog(true)},{saveLabel:'Done'}),
 collapse:el=>{const id=el.dataset.id,state=route==='side'?sideCollapsed:collapsed,key=route==='side'?JSON.stringify([sideTab,id]):id;state.has(key)?state.delete(key):state.add(key);render()},tools:el=>toolsDialog(el.dataset.id),focus:el=>startRoomFocus(el.dataset.id),'focus-room-choice':el=>startRoomFocus(el.dataset.id),'focus-start-clearway':el=>{closeDialog(true);openClearWay(el.dataset.id)},'focus-skip-clearway':el=>{closeDialog(true);openQuestFocus(el.dataset.id)},'focus-hub-room':el=>startRoomFocus(el.dataset.id),'focus-hub-doing':openDoingFocus,clearway:el=>openClearWay(el.dataset.id),'clearway-room-choice':el=>{closeDialog(true);openClearWay(el.dataset.id)},'doing-focus':openDoingFocus,'focus-timer':focusTimer,
 timer:el=>timerDialog(task(el.dataset.id),el.dataset.child),
 'task-clock-start':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);if(!item)return;alarmSignals.delete(item.id);timerChange(el,t=>{t.elapsed=0;t.timerEstimateMs=questEstimateMs(t);t.startedAt=Date.now();t.alarmDismissed=false;t.alarmNextAtMs=0;});timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-clock-toggle':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);if(!item)return;timerChange(el,t=>{if(t.startedAt){t.elapsed=M.time(t);t.startedAt=0;}else t.startedAt=Date.now();});timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-clock-stop':el=>confirmDialog('Stop and discard this attempt?','The Task remains unfinished and this timer attempt will not affect its estimate.',()=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);if(!item)return false;alarmSignals.delete(item.id);const ok=timerChange(el,t=>{t.startedAt=0;t.elapsed=0;t.timerEstimateMs=0;t.alarmNextAtMs=0;t.alarmDismissed=true;});if(ok){closeDialog(true);notice('Timer discarded. Task remains unfinished.');}return ok;},'Discard timer'),
 'task-clock-finish':el=>finishTimed(el.dataset.id,el.dataset.child||''),
 'task-clock-distraction-back':el=>finishTimed(el.dataset.id,el.dataset.child||'',editor.querySelector('#quest-timer-note')?.value||''),
 'task-clock-continue':el=>{closeDialog(true);timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-alarm-ack':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);timerChange(el,t=>{t.alarmDismissed=true;});if(item)alarmSignals.delete(item.id);timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-alarm-more':el=>{const item=el.dataset.child?task(el.dataset.id)?.children.find(c=>c.id===el.dataset.child):task(el.dataset.id);timerChange(el,t=>{t.alarmNextAtMs=M.time(t)+5*60000;t.alarmDismissed=false;});if(item)alarmSignals.delete(item.id);timerDialog(task(el.dataset.id),el.dataset.child||'');},
 'task-clock-commit':el=>{const id=el.dataset.id,cid=el.dataset.child||'',kind=el.dataset.mode,note=editor.querySelector('#quest-timer-note')?.value||'',t=task(id),item=cid?t?.children.find(c=>c.id===cid):t;if(!t||!item)return;if(kind==='distracted'&&el.dataset.final!=='1'){distractionTimed(id,cid,note);return;}const distractionRaw=kind==='distracted'?editor.querySelector('#quest-distraction-minutes')?.value:null;if(kind==='distracted')TIME.distraction(M.time(item),distractionRaw);const save=()=>commitTimed(id,cid,kind,note,distractionRaw);if(!cid&&t.children.some(c=>!c.done)){confirmDialog('Done em all',`Complete all subtasks in ${t.title}? The timer outcome will be saved.`,save,'Done em all');}else if(save())closeDialog(true);},
 'countdown-start':()=>{const n=Number(editor.querySelector('[name=minutes]').value);if(!(n>=1&&n<=1440))throw Error('Choose 1 to 1440 minutes.');change(b=>b.features.countdownEndsAt=Date.now()+n*60000,{redraw:false,sync:false});updateClocks()},
 'countdown-stop':()=>{change(b=>b.features.countdownEndsAt=0,{redraw:false,sync:false});updateClocks()},
 'music-play':async()=>{if(!F().sound)throw Error('Enable Sounds in Settings first.');music?.pause();const track=editor.querySelector('[name=track]').value;music=new Audio(asset('audio/'+track+'.mp3'));music.loop=true;music.volume=soundVolume;await music.play()},'music-stop':()=>{music?.pause();music=null},'sound-preview':()=>{if(!F().sound)throw Error('Enable Sounds in Settings first.');playTimerAlert()},
 'custom-cycle-add':()=>editCustomCycle(),
 'custom-cycle-edit':el=>editCustomCycle(el.dataset.id),
 'custom-cycle-remove':el=>confirmDialog('Remove cycle definition?','Loads already started and completion history are kept.',()=>change(b=>M.removeCustomCycle(b,el.dataset.id),{sync:false}),'Remove cycle'),
 'custom-load-start':el=>change(b=>M.startCustomLoad(b,el.dataset.id),{sync:false}),
 'custom-load-step':el=>change(b=>M.completeCustomStep(b,el.dataset.id)),
 'custom-load-undo':el=>change(b=>M.undoCustomStep(b,el.dataset.id,el.dataset.completionId)),
 'laundry-step':el=>change(b=>{const slot=Number(el.dataset.id);let l=b.features.laundry.find(l=>l.slot===slot);if(!l){l=M.clone(displayLoads().find(l=>l.slot===slot));b.features.laundry.push(l)}const oldRoute=l.route;if(el.dataset.route)l.route=el.dataset.route;M.laundry(b,slot);if(l._undo)l._undo.load.route=oldRoute;}),
 'laundry-undo':el=>change(b=>M.undoLaundry(b,Number(el.dataset.id))),
 'uniform-step':el=>change(b=>{const f=b.features;if(f.uniformIndex===1&&['darks','whites'].includes(el.dataset.id)&&!f.uniformSteps[1].includes(el.dataset.id))f.uniformSteps=f.uniformSteps.map(s=>s.replace(/darks/g,'{first}').replace(/whites/g,'darks').replace(/\{first\}/g,'whites'));M.uniform(b)}),
 'uniform-undo':()=>change(M.undoUniform),'uniform-pause':()=>dialog('Pause uniform',field('Days to pause (leave blank until resumed)','days','','number','min="1" max="3650"'),fd=>{const raw=String(fd.get('days'));if(raw&&Number(raw)<1)throw Error('Enter one or more days.');if(change(b=>{b.features.uniformPaused=true;b.features.uniformPauseUntil=raw?M.plus(M.date(),Number(raw)):''}))closeDialog(true)},{saveLabel:'Pause uniform'}),
 'uniform-resume':()=>change(b=>{b.features.uniformPaused=false;b.features.uniformPauseUntil='';M.refresh(b)}),
 'new-load':()=>confirmDialog('Add another wash load','Add a separate wash load? Choose rail or dryer when it is ready to dry.',()=>change(b=>{b.features.laundry.push({slot:Math.max(0,...b.features.laundry.map(l=>l.slot))+1,route:'',step:0,selected:false,manual:true,complete:false,revision:0});}),'Add wash load'),
 'laundry-oneoff':el=>change(b=>{const item=b.features.items.find(i=>i.id===el.dataset.id);item.done=el.checked;if(item.done){const record={id:M.uid(),taskId:item.id,title:item.text,room:'laundry',at:new Date().toISOString(),points:1,person:b.features.displayName,minutes:0,measured:false};item._win=record.id;b.features.wins.push(record)}else b.features.wins=b.features.wins.filter(w=>w.id!==item._win)}),
 notifications:async()=>{if(!('Notification'in window))throw Error('This browser does not support notifications.');const permission=await Notification.requestPermission();notice(permission==='granted'?'Browser reminders enabled while this page is open.':'Notifications were not enabled.')},
 calibrate:el=>{const r=room(el.dataset.id),mess=Math.round(M.mess(board,r)),detail=M.messBreakdown(board,r),rows=detail.items.map(x=>`<li><span>${x.parentTitle?`<small>${esc(x.parentTitle)} · </small>`:''}${esc(x.title)}</span><strong>+${x.contribution.toFixed(1)}%</strong></li>`).join(''),base=detail.adjustment?`<li><span>Calibration baseline</span><strong>+${detail.adjustment.toFixed(1)}%</strong></li>`:'',note=detail.capped?'Task values are before the overall score is capped at 100%.':'Current task contributions, before saving any slider change.',details=`<details class="mess-breakdown"><summary>More details · ${detail.items.length} task${detail.items.length===1?'':'s'}</summary><div class="mess-breakdown-content"><p class="small">${note}</p><ul>${rows}${base||''}${rows||base?'':'<li>No active tasks currently add to this room’s mess level.</li>'}</ul></div></details>`;dialog('Adjust mess level',`<p>${esc(r.name)}</p><label class="field">Mess level (0% spotless, 100% chaos)<input type="range" name="mess" min="0" max="100" value="${mess}"><output>${mess}% · ${esc(M.phrase(mess))}</output></label>${details}`,fd=>{const value=Number(fd.get('mess'));if(change(b=>M.calibrate(b,r.id,value)))closeDialog(true)});editor.querySelector('[name=mess]').oninput=e=>{const value=Number(e.target.value);editor.querySelector('output').textContent=`${value}% · ${M.phrase(value)}`}},
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
 'settings-tab':el=>selectSettingsTab(el.dataset.id),
 'seasonal-display':el=>{try{seasonalDisplay=seasonalTheme.savePreference(localStorage,KEY,el.dataset.id,el.checked);render();}catch(e){el.checked=seasonalDisplay[el.dataset.id];notice('Could not save Seasonal display preference. '+e.message);}},
 setting:el=>{if(!['sound','reduceMotion','pauseWandering'].includes(el.dataset.id))return;const disableSound=el.dataset.id==='sound'&&!el.checked;if(change(b=>b.features[el.dataset.id]=el.checked)&&disableSound){music?.pause();music=null;stopChristmasJingle();}},
 'rename-room':el=>{const r=room(el.dataset.id);dialog('Rename room',field('Room name','name',r.name,'text','required'),fd=>{const name=String(fd.get('name')).trim();if(!name||board.rooms.some(x=>x.id!==r.id&&x.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a unique room name.');if(change(b=>b.rooms.find(x=>x.id===r.id).name=name))closeDialog(true)})},
 'archive-room':el=>change(b=>{const r=b.rooms.find(r=>r.id===el.dataset.id);r.archived=!r.archived}),
 'room-first':el=>change(b=>{const r=b.rooms.find(r=>r.id===el.dataset.id);b.rooms=[r,...b.rooms.filter(x=>x.id!==r.id)]}),
 areas:el=>{const id=el.dataset.id;dialog('Areas · '+room(id).name,area('Area names — one per line','areas',(F().areas[id]||[]).join('\n')),fd=>{const names=[...new Set(String(fd.get('areas')).split('\n').map(x=>x.trim()).filter(Boolean))];if(change(b=>b.features.areas[id]=names))closeDialog(true)})},
 'library-room':el=>{libraryRoom=el.dataset.id||'all';libraryQuery='';libraryKind='all';libraryPriority='all';libraryTag='';navigate('library',null,'saved');},
 'library-tab':el=>{if(['saved','custom','occasional','seasonal'].includes(el.dataset.id)){libraryTab=el.dataset.id;rememberBackState();render();}},
 'library-occasional':()=>navigate('library',null,'occasional'),
 'library-seasonal':()=>navigate('library',null,'seasonal'),
 'seasonal-create':()=>seasonalWorkflowChooser(),
 'seasonal-edit':el=>seasonalWorkflowEditor(el.dataset.id),
 'seasonal-gift-shortcut':el=>{const r=SW?.giftRole(board,el.dataset.id);if(!r)return;if(r.preset==='christmas')return navigate(r.role==='wrap'?'christmas-wrap':'christmas-gifts',r.occurrenceId);giftView=['christmas','birthday'].includes(r.preset)?r.preset:'all';giftPersonTab='all';giftStatusTab='needs-wrap';navigate('gifts');},
 'seasonal-note-add':el=>seasonalNoteEditor(el.dataset.occurrenceId,el.dataset.id),
 'seasonal-note-edit':el=>seasonalNoteEditor(el.dataset.occurrenceId,'',el.dataset.id),
 'seasonal-note-toggle':el=>{seasonalOpenId=el.dataset.occurrenceId;change(b=>Object.assign(b,SW.noteChange(b,el.dataset.occurrenceId,'toggle',{id:el.dataset.id,itemId:el.dataset.itemId},M.date())));},
 'seasonal-note-delete':el=>seasonalNoteDelete(el.dataset.occurrenceId,el.dataset.id),
 'seasonal-open':el=>{seasonalOpenId=el.dataset.id;if(route==='seasonal')render();else navigate('seasonal');},
 'library-ideas':libraryIdeas,
 'library-find-existing':libraryFindExisting,
 'library-save-custom':el=>{if(change(b=>L.saveCustom(b,el.dataset.id,M)))notice('Saved to reusable tasks.');},
 'library-hide-custom':el=>confirmDialog('Remove custom entry?','This hides the library entry on this browser. Your task and history are kept.',()=>change(b=>L.hideCustom(b,el.dataset.id),{sync:false}),'Remove'),
 'library-remove-saved':el=>confirmDialog('Remove saved reusable task?','The template is removed. Existing tasks and all completions are kept.',()=>change(b=>L.removeSaved(b,el.dataset.id)),'Remove'),
 'data-open-task':el=>{dataTaskId=el.dataset.child||el.dataset.id;dataView='quests';if(editor.open)closeDialog(true);if(route==='data')render();else navigate('data');},
 'data-one-off-toggle':el=>{const id=el.dataset.id,existing=board.tasks.find(t=>t.id===id||t.children.some(c=>c.id===id)),current=existing?.id===id?existing:existing?.children.find(c=>c.id===id);if(!current)throw Error('Task no longer exists.');const nextStatus=!current.oneOff;if(change(b=>{const parent=b.tasks.find(t=>t.id===id||t.children.some(c=>c.id===id)),target=parent?.id===id?parent:parent?.children.find(c=>c.id===id);if(!target)throw Error('Task no longer exists.');target.oneOff=nextStatus;}))notice(nextStatus?'Marked one-off. Existing records are kept.':'One-off status removed.');},
 'data-task-back':()=>{dataTaskId='';render()},
 'data-edit-completion':el=>editDataCompletion(el.dataset.id),
 'data-remove-quick-completion':el=>{const id=el.dataset.id,win=F().wins.find(w=>w.id===id&&w._kind==='little-often');if(!win)return;confirmDialog('Remove this Little & Often completion?','This removes only the selected historical completion and its points. The task and other completions are kept.',()=>{if(!change(b=>{if(!CARE.littleUndo(b,win.taskId,id))throw Error('That completion is no longer available.');},{redraw:false}))return false;if(quickFeedback.get(win.taskId)?.winId===id)quickFeedback.delete(win.taskId);render();return true;},'Remove completion');},
 'data-export-quest':el=>{const id=el.dataset.id,rootTask=task(id)||board.tasks.find(x=>x.children.some(c=>c.id===id)),found=rootTask?.id===id?rootTask:rootTask?.children.find(c=>c.id===id);if(!rootTask||!found)throw Error('Task no longer available. No export was created.');const rows=window.TidyTaskData?.perQuest(board,id,TIME.ownerOf(board));if(!rows)throw Error('Task Data is unavailable.');const safeTitle=String(found.title||'Task').replace(/[^a-z0-9_-]+/gi,'-').slice(0,48).replace(/^-+|-+$/g,'')||'Task';const backup={format:'tidyish-quest-history-v2',exportedAt:new Date().toISOString(),task:{id:found.id,room:rootTask.room,title:found.title},completed:rows.wins,attempts:rows.attempts,olderSummaries:rows.archives};download(`Tidyish-${safeTitle}-${M.date()}.json`,JSON.stringify(backup,null,2));},
 'data-pick-task':()=>dialog('Open Task Data',board.tasks.map(t=>button(esc(t.title),'data-open-task',t.id,'wide ghost')).join('')||'<p>No tasks available.</p>'),
 'data-exclude-time':el=>confirmDialog('Exclude this time from learning?', 'Its completion, points, original time and note will remain visible to every household member.',()=>change(b=>{const row=b.features.questTimings.find(r=>r.id===el.dataset.id);if(!row)throw Error('Attempt not found.');row.excludedFromLearning=true;}),'Exclude time'),
 'data-archive-quest-history':el=>{const id=el.dataset.id,cutoff=document.querySelector('[name="historyBeforeDate"]')?.value,TD=window.TidyTaskData;if(!TD)throw Error('Task Data is unavailable.');const plan=TD.planArchive(board,id,cutoff);if(!plan.removedWins.length&&!plan.removedAttempts.length){notice('No removable history exists before that date.');return;}const rootTask=task(id)||board.tasks.find(x=>x.children.some(c=>c.id===id)),subject=rootTask?.id===id?rootTask:rootTask?.children.find(c=>c.id===id),safeTitle=String(subject?.title||'Task').replace(/[^a-z0-9_-]+/gi,'-').slice(0,48)||'Task',backup={format:'tidyish-old-task-history-v1',exportedAt:new Date().toISOString(),task:{id,title:subject?.title||'',room:rootTask?.room||''},beforeDate:cutoff,completionRecords:plan.removedWins,attemptRecords:plan.removedAttempts};download(`Tidyish-${safeTitle}-history-before-${cutoff}.json`,JSON.stringify(backup,null,2));confirmDialog('Export started — remove old detail?',`${plan.removedWins.length} completion records and ${plan.removedAttempts.length} attempt records are in the export. Keep that file before continuing. The latest completion, newest eight valid times per member and Task, fastest valid time, noted attempts, points and completion totals are preserved.`,()=>{let result;if(!change(b=>{result=TD.applyArchive(b,TD.planArchive(b,id,cutoff));}))return false;notice(`Old detail removed. ${result.winsRemoved} completions and ${result.attemptsRemoved} attempts were summarized; points and estimate basis were preserved.`);return true;},'Remove old detail');},
 'library-open-room':el=>navigate('room',el.dataset.id),
 'library-edit-task':el=>{const t=task(el.dataset.id);if(t)taskEditor(t);},
 'library-reactivate':el=>{const id=el.dataset.id,t=task(id);if(!t||!t.done)return;confirmDialog('Do this Task again?',`Restart ${t.title}? Your previous completions and points will stay in Task Data.`,()=>change(b=>M.reactivate(b,id)),'Do again');},
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
 'care-undo':el=>{const id=el.dataset.id,winId=el.dataset.completionId;if(!winId)return;confirmDialog('Undo last care completion?','This removes only the selected completion and its point.',()=>change(b=>{if(!CARE.undo(b,id,winId))throw Error('That completion is no longer available.');}),'Undo last');},
 'care-add':()=>careEditor(),
 'care-edit':el=>careEditor(el.dataset.id),
 'quick-tile':el=>quickTile(el),
 'quick-done':el=>change(b=>CARE.littleOften(b,el.dataset.id,M.uid)),
 'quick-undo':el=>{const id=el.dataset.id,winId=el.dataset.completionId;if(!winId)return;confirmDialog('Undo last quick completion?','Only the selected completion and its point will be removed.',()=>{if(!change(b=>{if(!CARE.littleUndo(b,id,winId))throw Error('That completion is no longer available. No other completion was removed.');},{redraw:false}))return false;if(quickFeedback.get(id)?.winId===winId)quickFeedback.delete(id);render();return true;},'Undo last');},
 'quick-add':()=>dialog('Add Little & Often',field('Task name','title','','text','required maxlength="150"')+select('Room','room',[['','General'],...rooms().map(r=>[r.id,r.name])],''),fd=>{const title=String(fd.get('title')||'').trim();if(!title)throw Error('Enter a title.');if(change(b=>M.add(b,M.task({title,room:String(fd.get('room')||''),littleOften:true,taskType:'little-often',messImpact:'none'}))))closeDialog(true)},{saveLabel:'Add quick task'}),
 'recommend-focus':el=>{const t=task(el.dataset.id);if(!t||!REC.eligible(t,'',M.date(),board))return;if(t.done&&!change(b=>M.reactivate(b,t.id)))return;const target=t.room||rooms()[0]?.id;if(editor.open)closeDialog(true);openQuestFocus(target);const session=Q?.get?.();if(session?.phase==='pick'&&!session.startedIds?.length&&!session.questIds?.length)Q.pick?.(t.id);},
 'what-next-open':el=>openWhatNext(el.dataset.id||''),
 'recommend-doing':el=>change(b=>{const t=b.tasks.find(x=>x.id===el.dataset.id);if(!REC.eligible(t,'',M.date(),b))throw Error('Task is not currently due.');if(t.done)M.reactivate(b,t.id);M.select(b,t.id,true)}),
 'recommend-options':el=>{const r=el.dataset.id;dialog('Suggested Task limits',field('Time available (minutes; 0 for any)','minutes',30,'number','min="0" max="1440"')+field('Number of Tasks (0 for any)','count',3,'number','min="0" max="100"'),fd=>{const rows=REC?.rank(board,{room:r,maxMinutes:Number(fd.get('minutes')),maxTasks:Number(fd.get('count'))})||[];closeDialog(true);dialog('Your suggested Tasks',rows.map(row=>`<div class="new-next-row"><strong>${esc(row.task.title)}</strong><div class="row">${button('Focus','recommend-focus',row.id,'ghost')}${button('Doing Now','recommend-doing',row.id,'ghost')}</div></div>`).join('')||'<p>None fit this limit.</p>');},{saveLabel:'Show suggestions'});},
 'library-add-suggestion':el=>{const item=L?.suggestion(el.dataset.id);if(!item)return;confirmDialog('Add suggested Task?',`Add ${item.title} to ${room(item.room)?.name||'this room'}? Suggestions are never imported without your confirmation.`,()=>change(b=>L.addSuggestion(b,item.id,M)),'Add Task');},
 'save-template':el=>{if(change(b=>L.saveFromTask(b,el.dataset.id,M)))notice('Reusable task saved')},
 'task-editor-tab':el=>{if(dialogDirty&&!confirm('Discard unsaved changes and switch tabs?'))return;taskEditor(null,false,el.dataset.id)},
 'new-template':()=>taskEditor(null,true),'edit-template':el=>taskEditor(F().templates.find(t=>t.id===el.dataset.id),true),
 'hide-template':el=>change(b=>b.features.hiddenTemplates.push(el.dataset.id)),'restore-template':el=>change(b=>b.features.hiddenTemplates=b.features.hiddenTemplates.filter(id=>id!==el.dataset.id)),
 'activate-template':el=>{const t=F().templates.find(t=>t.id===el.dataset.id);if(!t)return;dialog('Add '+t.title,rooms().map(r=>check(r.name,'room',r.id===t.room,`value="${esc(r.id)}"`)).join('')+check('Add to Doing Now','doing'),fd=>{const rs=fd.getAll('room');if(!rs.length)throw Error('Choose a room.');if(change(b=>L.activateSaved(b,t.id,rs,fd.has('doing'),M)))closeDialog(true)},{saveLabel:'Add to selected rooms'})},
 'pause-task':el=>{const t=task(el.dataset.id);if(t.paused){change(b=>b.tasks.find(x=>x.id===t.id).paused=false);return;}dialog('Pause task',field('Days to pause (blank until resumed)','days','','number','min="1" max="3650"'),fd=>{const n=String(fd.get('days'));if(change(b=>{const t=b.tasks.find(x=>x.id===el.dataset.id);t.paused=true;t.pauseUntil=n?M.plus(M.date(),Number(n)):''}))closeDialog(true)},{saveLabel:'Pause'})},
 'new-side-tab':()=>dialog('New side task tab',field('Tab name','name','','text','required'),fd=>{const name=String(fd.get('name')).trim();if(!name)throw Error('Enter a name.');if(change(b=>b.features.sideTabs.push({id:M.uid(),name})))closeDialog(true)}),
 'homeless-remove':el=>confirmDialog('Remove item?','Remove this item from the room’s homeless list?',()=>change(b=>b.features.items=b.features.items.filter(i=>i.id!==el.dataset.id)),'Remove'),
 export:exportBoard,'csv-template':()=>download('Tidy-ish-custom-tasks.csv','title,room,sidequest,tools,notes\n"Example task","Kitchen",false,"Cloth",""\n','text/csv'),
 'close-dialog':()=>closeDialog()
};
function childMove(el,first){change(b=>{const t=b.tasks.find(t=>t.id===el.dataset.id),c=t.children.find(c=>c.id===el.dataset.child),family=new Set([c.id]);for(let i=0;i<t.children.length;i++)t.children.forEach(x=>{if(family.has(x.parentId))family.add(x.id)});const block=t.children.filter(x=>family.has(x.id)),rest=t.children.filter(x=>!family.has(x.id));let target=first?rest.findIndex(x=>x.parentId===c.parentId):rest.findLastIndex(x=>x.parentId===c.parentId)+1;if(target<0)target=rest.length;rest.splice(target,0,...block);t.children=rest;});}
function timerChange(el,edit){const result=change(b=>{const t=b.tasks.find(t=>t.id===el.dataset.id),item=el.dataset.child?t.children.find(c=>c.id===el.dataset.child):t;edit(item)},{redraw:false});updateClocks();return result;}
document.addEventListener('keydown',settingsTabKey);
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
 document.addEventListener('input',e=>{if(e.target.name!=='title'||!taskTitleSuggestionState||!editor.contains(e.target))return;const state=taskTitleSuggestionState;if(state.applying)return;const value=String(e.target.value||'').trim(),host=editor.querySelector('[data-task-title-suggestion]');if(state.appliedTitle&&value!==state.appliedTitle){state.appliedTitle='';state.appliedFrom='';}if(state.dismissedTitle&&value!==state.dismissedTitle)state.dismissedTitle='';hideTaskTitleSuggestions();if(value)taskTitleSuggestionTimer=setTimeout(renderTaskTitleSuggestion,130);});
 document.addEventListener('change',e=>{if(!['room','side'].includes(e.target.name)||!taskTitleSuggestionState||!editor.contains(e.target))return;taskTitleSuggestionState.dismissedTitle='';hideTaskTitleSuggestions();renderTaskTitleSuggestion();});
 // Arrow keys, Enter and Escape are available alongside touch/click and Tab.
 document.addEventListener('keydown',e=>{
  if(!taskTitleSuggestionState||!editor.open)return;
  const title=editor.querySelector('#modal-form [name="title"]');
  const options=[...editor.querySelectorAll('.task-autocomplete-choice')];
  const index=options.indexOf(document.activeElement),atTitle=document.activeElement===title;
  if(e.key==='Escape'&&(atTitle||index>=0)&&options.length){e.preventDefault();dismissTaskTitleSuggestion();return;}
  if(atTitle&&options.length&&e.key==='ArrowDown'){e.preventDefault();options[0].focus();return;}
  if(atTitle&&options.length&&e.key==='Enter'){e.preventDefault();options[0].click();return;}
  if(index>=0&&(e.key==='ArrowDown'||e.key==='ArrowUp')){
   e.preventDefault();
   const next=e.key==='ArrowDown'?options[(index+1)%options.length]:index===0?null:options[index-1];
   if(next)next.focus();else title?.focus();
  }
 });
 // Clicking elsewhere closes the list without changing the manual title.
 document.addEventListener('click',e=>{
  if(!taskTitleSuggestionState||!editor.open||e.target.closest('.task-title-autocomplete'))return;
  hideTaskTitleSuggestions({dismiss:true});
 });
 let librarySearchTimer;document.addEventListener('input',e=>{if(e.target.id==='quest-library-query'){libraryQuery=e.target.value;const cursor=e.target.selectionStart;clearTimeout(librarySearchTimer);librarySearchTimer=setTimeout(()=>{if(route!=='library')return;render();const input=$('#quest-library-query');input?.focus();try{input?.setSelectionRange(cursor,cursor)}catch{}},180);}});
document.addEventListener('input',e=>{if(e.target.id!=='focus-sound-volume')return;soundVolume=Math.min(.3,Math.max(0,Number(e.target.value)/100||0));const output=$('#focus-sound-output');if(output)output.value=Math.round(soundVolume*100)+'%';if(music)music.volume=soundVolume;if(christmasJingle)christmasJingle.volume=soundVolume;});
document.addEventListener('change',e=>{if(e.target.id!=='focus-sound-volume')return;try{localStorage.setItem(SOUND_VOLUME_KEY,String(soundVolume));}catch{notice('Sound level will reset when this tab closes.');}});
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
let childGesture=null,childHover=null,childPendingTimer=0,childScrollTimer=0;
function clearChildOver(){document.querySelectorAll('.child.drag-over').forEach(x=>x.classList.remove('drag-over','child-drop-before','child-drop-after'));}
function resetChildGesture(){
 clearTimeout(childPendingTimer);childPendingTimer=0;clearInterval(childScrollTimer);childScrollTimer=0;
 const g=childGesture;childGesture=null;
 g?.ghost?.remove();g?.row?.classList.remove('child-lifted');
 if(g?.armed)document.body.classList.remove('task-dragging');
 childHover=null;clearChildOver();hideRootInsertionLine();
}
function childTargetAt(g,x,y){
 const underneath=document.elementFromPoint(x,y);
 const row=underneath?.closest?.('[data-child-id]');
 if(row&&row.dataset.rootId===g.root&&row.dataset.parentId===g.parent&&row.dataset.childId!==g.child){
  const rect=row.getBoundingClientRect();
  return {kind:'sibling',id:row.dataset.childId,after:y>=rect.top+rect.height/2};
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
 if(next?.kind==='sibling')document.querySelector(`[data-child-id="${CSS.escape(next.id)}"]`)?.classList.add('drag-over',next.after?'child-drop-after':'child-drop-before');
 if(next?.kind==='root')setRootInsertionLine(next.card,next.after?'after':'before');
 if(g.ghost){g.ghost.style.left=Math.max(8,Math.min(innerWidth-200,x+12))+'px';g.ghost.style.top=Math.max(5,Math.min(innerHeight-45,y-32))+'px';}
}
// Continue scrolling while a held subtask reaches a viewport edge, even without pointer movement.
function childAutoscroll(){
 const g=childGesture;if(!g?.armed)return;
 const edge=65,height=window.innerHeight||document.documentElement.clientHeight;
 const direction=g.y<edge?-1:g.y>height-edge?1:0;
 if(direction){window.scrollBy(0,direction*14);moveChildPreview(g,g.x,g.y);}
}
function armChildDrag(g){
 if(childGesture!==g||g.armed)return;
 g.armed=true;g.row.classList.add('child-lifted');document.body.classList.add('task-dragging');
 g.ghost=document.createElement('div');g.ghost.className='task-drag-ghost';g.ghost.textContent=g.title;
 document.body.appendChild(g.ghost);moveChildPreview(g,g.x,g.y);
 childScrollTimer=setInterval(childAutoscroll,65);
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
 if(destination.kind==='sibling')reorderChild(g.root,g.child,destination.id,destination.after);
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
document.addEventListener('change',e=>{if(e.target.id!=='data-day-picker')return;if(!window.TidyTaskData?.validDay(e.target.value)){notice('Choose a valid date.');e.target.value=dataDay;return;}dataDay=e.target.value;render();});
document.addEventListener('change',e=>{if(e.target.id!=='schedule-preview-minutes')return;const raw=e.target.value.trim();if(raw!==''&&(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>1440)){notice('Choose 1–1440 planning minutes or leave blank for no limit.');e.target.value=schedulePreviewMinutes;return;}schedulePreviewMinutes=raw;render();});
document.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file||!['backup-file','csv-file'].includes(e.target.id))return;try{if(file.size>15*1024*1024)throw Error('Choose a backup smaller than 15 MB.');const text=await file.text();if(e.target.id==='backup-file'){reviewBackup(text);}else{const rows=parseCSV(text),header=rows.shift()||[];if(!header.includes('title')||!header.includes('room'))throw Error('CSV needs title and room columns.');const added=rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||'']))).map(r=>{const found=board.rooms.find(x=>x.id===r.room||x.name.toLowerCase()===r.room.toLowerCase());if(r.room&&!found)throw Error('Unknown room: '+r.room);if(!r.title.trim())throw Error('Every task needs a title.');if(r.sidequest&&!['true','false'].includes(r.sidequest.toLowerCase()))throw Error('sidequest must be true or false.');return M.task({title:r.title.trim(),room:found?.id||'',side:r.sidequest.toLowerCase()==='true',tools:r.tools||'',notes:r.notes||''})}).filter(t=>!board.tasks.some(x=>x.title===t.title&&x.room===t.room));confirmDialog('Preview task upload',`${added.length} new tasks. Existing tasks are kept and matching title/room pairs are skipped.`,()=>change(b=>added.reverse().forEach(t=>M.add(b,t))),'Add these tasks');}}catch(err){notice(err.message)}finally{e.target.value=''}});
function parseCSV(text){const rows=[];let row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';}else value+=c;}if(quoted)throw Error('CSV contains an unclosed quote.');if(value||row.length){row.push(value);rows.push(row)}return rows;}
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue||e.newValue===lastSaved)return;try{const incoming=M.normalize(TSC.decode(e.newValue));if(editor.open){pendingExternal=incoming;notice('Another tab saved changes. Your open form is kept; close and reopen it before saving.');}else{lastSaved=e.newValue;board=incoming;render();}}catch{notice('Another tab supplied invalid data. The open board has been preserved.')}});
function customLaundryAttentionSignature(){return F().customLaundryLoads.filter(l=>M.customLaundryNeedsAttention(l)).map(l=>l.id).sort().join(',');}
function customLaundryReminders(){for(const l of F().customLaundryLoads){if(!M.customLaundryReminderDue(l))continue;if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Tidy-ish · laundry',{body:l.name+' has been ready for two hours.',tag:'tidyish-html-custom-laundry-'+l.id,icon:'assets/icons/tidyish-icon.svg'});change(b=>{const load=b.features.customLaundryLoads.find(x=>x.id===l.id);if(load)load.lastReminderAt=Date.now();},{redraw:false,sync:false});}catch{}}}}
function reminders(){const f=F();for(const l of f.laundry){if(!M.laundryReminderDue(l))continue;if('Notification'in window&&Notification.permission==='granted'){try{new Notification('Tidy-ish · laundry',{body:'Laundry has been ready for two hours.',tag:'tidyish-html-laundry-'+l.slot,icon:'assets/icons/tidyish-icon.svg'});change(b=>b.features.laundry.find(x=>x.slot===l.slot).lastReminderAt=Date.now(),{redraw:false,sync:false});}catch{}}}}
if(Z)Z.init({board:()=>board,model:M,change,render,notice,confirmDialog,date:()=>M.date(),storage:localStorage});
window.TidyUI={getBoard:()=>board,change,render,notice,dialog,closeDialog,confirmDialog,button,field,area,check,select,card,detail,esc,navigate,exportBoard,storageKey:KEY,editing:()=>editor.open,acceptSync(next){persist(next);if(!editor.open)render();},onSyncStatus(){if(route==='settings'&&settingsTab==='household'&&!editor.open)render();}};
if(Q)Q.init({board:()=>board,room:()=>roomId,date:()=>M.date(),notice,render,storage:localStorage,isTaskCompletionVisible:t=>M.isTaskCompletionVisible(board,t,Date.now()),taskCompletionTime:t=>M.taskCompletionTime(board,t),renderFocusTask:(t,pos)=>focusTaskCard(t,pos),legacyDoingFocus:()=>{loadDoingFocus();return {phase:doingFocusState.phase,ids:[...doingFocusState.ids]};},
 memberId:()=>String(F().browserSync?.account||'local')+'|member:'+String(F().displayName||'Me'),makeId:M.uid,openFocus:()=>openQuestFocus(roomId),openTimer:(id,childId='')=>timerDialog(task(id),childId),addTask:()=>taskEditor(),editTask:id=>taskEditor(task(id)),editChild:(id,childId)=>{const t=task(id);if(t)childEditor(t,t.children.find(c=>c.id===childId));},
 editor:()=>editor,dialog,closeDialog,leave:leaveCurrentFocus,leaveForLater:()=>{const current=Q?.get();navigate(current?.scope==='doing'?'doing':'room',current?.room||roomId);},showTools:focusToolsDialog,completeFloor:(id)=>change(b=>CARE.littleOften(b,id,M.uid)),openFloorRoom:(id)=>navigate('room',id),returnTasks:()=>clearUnfinished(Q?.get()?.room||roomId,Q?.get()?.scope==='doing'),completeReturn:(id)=>change(b=>{const t=b.tasks.find(x=>x.id===id);if(!t||t.done||!String(t.generatedFrom||'').startsWith('clear-way-session:'))return false;M.finish(b,id,true);}),
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
  if(t.done){confirmDialog('Undo this Task?',`Return ${t.title} to your active list and reverse its completion record?`,()=>change(b=>M.finish(b,id,false)),'Undo');return;}
  if(hasTimedAttempt(t)){finishTimed(id);return;}
  const done=()=>change(b=>M.finish(b,id,true));
  if(t.children.some(c=>!c.done))confirmDialog('Done em all',`Complete all subtasks in ${t.title}?`,done,'Done em all');else confirmDialog('Complete Focus Task?',`Mark ${t.title} complete and record it in your normal task history?`,done,'Complete');
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
render();if(isChristmasActive())playChristmasJingle();window.TidyDailyLogReady?.then(()=>{if(route==='data'||route==='calendar'||route==='laundry'||route==='doing'&&doingTab==='laundry')render();const snapshot=editor.querySelector('[data-daily-log-calendar-snapshot]');if(snapshot)renderCalendarDailyLogSnapshot(snapshot,snapshot.dataset.date);});if(storageWarning)notice(storageWarning);window.addEventListener('tidy-sharing-ready',()=>{if(board.features.browserSync&&Number(board.features.occasionalScheduleDefaultsVersion)===1)window.TidySharing?.queue();},{once:true});setTimeout(christmasReceiptReminder,1000);setInterval(updateClocks,1000);setInterval(()=>{if(editor.open)return;let refreshChanged=seasonalMaintain();const today=M.date();if(today!==maintenanceDate){const next=M.clone(board);M.refresh(next,today);const hasChanges=JSON.stringify(next)!==JSON.stringify(board);if(hasChanges){const savedRefresh=change(b=>Object.assign(b,next),{redraw:false});refreshChanged=refreshChanged||savedRefresh;if(savedRefresh)maintenanceDate=today;}else maintenanceDate=today;}seasonalReminders();reminders();customLaundryReminders();christmasReceiptReminder();const readyLaundry=F().laundry.filter(l=>M.laundryNeedsAttention(l)).map(l=>l.slot).sort((a,b)=>a-b).join(',');const alertChanged=readyLaundry!==lastLaundryAttention;lastLaundryAttention=readyLaundry;const customLaundryAttention=customLaundryAttentionSignature(),customLaundryChanged=customLaundryAttention!==lastCustomLaundryAttention;lastCustomLaundryAttention=customLaundryAttention;const careChanged=careAttentionSignature()!==lastCareAttention;lastCareAttention=careAttentionSignature();const customChanged=customAttentionSignature()!==lastCustomAttention;lastCustomAttention=customAttentionSignature();if(refreshChanged||alertChanged||customLaundryChanged||careChanged||customChanged||today!==lastSeasonalDisplayDate)render();},30000);
if(location.hash.includes('access_token=')||new URLSearchParams(location.search).has('code')){route='settings';settingsTab='household';rememberBackState();render();window.addEventListener('tidy-sharing-ready',()=>window.TidySharing.init().catch(e=>notice(e.message)),{once:true});}
})();
