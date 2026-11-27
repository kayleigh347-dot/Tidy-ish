/* Tidy-ish Quest Timer learning core. Pure, deterministic calculations; no global storage writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyQuestTime=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const BUFFER_MS=5*60000, REPEAT_MS=60000, SNOOZE_MS=5*60000, RECENT_LIMIT=8, DECAY=.78;
 // Raw elapsed time is never overwritten. A quantified interruption contributes only worked time.
 function distraction(elapsedMs, rawMinutes){
  const elapsed=Number(elapsedMs);
  if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid recorded time. No changes saved.');
  if(rawMinutes===null||rawMinutes===undefined||String(rawMinutes).trim()==='')return {distractionMinutes:null,workDurationMs:null};
  const raw=String(rawMinutes).trim();
  if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error('Enter a valid number of distraction minutes.');
  const minutes=Number(raw),deducted=Math.round(minutes*60000);
  if(!Number.isFinite(minutes)||!Number.isFinite(deducted)||deducted>elapsed)throw Error('Distraction cannot exceed elapsed time. No changes saved.');
  return {distractionMinutes:minutes,workDurationMs:Math.max(0,elapsed-deducted)};
 }
 function elapsedMinutesToMs(raw){
  const value=String(raw??'').trim();if(!value)return 0;
  if(!/^\d+(?:\.\d+)?$/.test(value))throw Error('Enter elapsed time in minutes as a non-negative number.');
  const minutes=Number(value),milliseconds=Math.round(minutes*60000);
  if(!Number.isFinite(minutes)||!Number.isSafeInteger(milliseconds))throw Error('Enter elapsed time in minutes as a non-negative number.');
  return milliseconds;
 }
 function learningDuration(r){
  if(!r||r.excludedFromLearning)return null;
  const elapsed=Number(r.durationMs);
  if(!Number.isFinite(elapsed)||elapsed<=0)return null;
  if(r.kind==='valid')return elapsed;
  if(r.kind!=='distracted'||typeof r.distractionMinutes!=='number'||!Number.isFinite(r.distractionMinutes)||r.distractionMinutes<0)return null;
  const deducted=Math.round(r.distractionMinutes*60000);
  if(!Number.isFinite(deducted)||deducted>elapsed)return null;
  const worked=elapsed-deducted;
  return worked>0?worked:null;
 }
 function valid(r){return learningDuration(r)!==null&&Number.isFinite(Date.parse(r.at||''));}
 function average(records,id,owner){
  const rows=(Array.isArray(records)?records:[]).filter(r=>r.taskId===id&&r.owner===owner&&valid(r)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,RECENT_LIMIT);
  if(!rows.length)return null;
  let weighted=0,weights=0;rows.forEach((r,i)=>{const w=DECAY**i;weighted+=learningDuration(r)*w;weights+=w;});
  return Math.max(1,Math.round(weighted/weights/60000*10)/10);
 }
 function ownerOf(board){const f=board?.features||{};return String(f.browserSync?.account||'local')+'|member:'+String(f.displayName||'Me');}
 function suggested(board,item){const learned=average(board?.features?.questTimings,item?.id,ownerOf(board));const starting=Number(item?.estimate);return learned??(Number.isFinite(starting)&&starting>0?starting:15);}
 function hasAttempt(item){return !!item?.startedAt||Number(item?.elapsed)>0;}
 function focusQuestCompletionId(before,after,route,session){
  if(!['focus','doing-focus'].includes(route)||session?.phase!=='active')return '';
  for(const id of session.startedIds||[]){const prior=before?.tasks?.find(t=>t.id===id),current=after?.tasks?.find(t=>t.id===id);if(prior&&!prior.done&&current?.done)return id;}
  return '';
 }
 function focusQuestCompleted(before,after,route,session){return !!focusQuestCompletionId(before,after,route,session);}
 function status(elapsedMs,estimateMs,alarmNextAtMs=0,alarmDismissed=false){
  const elapsed=Math.max(0,Number(elapsedMs)||0),budget=Math.max(0,Number(estimateMs)||0);
  const remaining=budget-elapsed,threshold=Math.max(budget+BUFFER_MS,Number(alarmNextAtMs)||0);
  return {phase:remaining>0?'countdown':'overtime',shownMs:Math.abs(remaining),overdue:remaining<=0,alarmDue:remaining<=0&&!alarmDismissed&&elapsed>=threshold};
 }
 function format(ms){const seconds=Math.floor(Math.max(0,ms)/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
 return Object.freeze({BUFFER_MS,REPEAT_MS,SNOOZE_MS,RECENT_LIMIT,DECAY,average,ownerOf,suggested,hasAttempt,focusQuestCompleted,focusQuestCompletionId,status,format,valid,distraction,elapsedMinutesToMs,learningDuration});
});
