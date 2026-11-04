/* Tidy-ish Quest Timer learning core. Pure, deterministic calculations; no global storage writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyQuestTime=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const BUFFER_MS=5*60000, REPEAT_MS=60000, SNOOZE_MS=5*60000, RECENT_LIMIT=8, DECAY=.78;
 function valid(r){return r&&!r.excludedFromLearning&&r.kind==='valid'&&Number.isFinite(Number(r.durationMs))&&Number(r.durationMs)>0&&Number.isFinite(Date.parse(r.at||''));}
 function average(records,id,owner){
  const rows=(Array.isArray(records)?records:[]).filter(r=>r.taskId===id&&r.owner===owner&&valid(r)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,RECENT_LIMIT);
  if(!rows.length)return null;
  let weighted=0,weights=0;rows.forEach((r,i)=>{const w=DECAY**i;weighted+=r.durationMs*w;weights+=w;});
  return Math.max(1,Math.round(weighted/weights/60000*10)/10);
 }
 function ownerOf(board){const f=board?.features||{};return String(f.browserSync?.account||'local')+'|member:'+String(f.displayName||'Me');}
 function suggested(board,item){const learned=average(board?.features?.questTimings,item?.id,ownerOf(board));const starting=Number(item?.estimate);return learned??(Number.isFinite(starting)&&starting>0?starting:15);}
 function hasAttempt(item){return !!item?.startedAt||Number(item?.elapsed)>0;}
 function status(elapsedMs,estimateMs,alarmNextAtMs=0,alarmDismissed=false){
  const elapsed=Math.max(0,Number(elapsedMs)||0),budget=Math.max(0,Number(estimateMs)||0);
  const remaining=budget-elapsed,threshold=Math.max(budget+BUFFER_MS,Number(alarmNextAtMs)||0);
  return {phase:remaining>0?'countdown':'overtime',shownMs:Math.abs(remaining),overdue:remaining<=0,alarmDue:remaining<=0&&!alarmDismissed&&elapsed>=threshold};
 }
 function format(ms){const seconds=Math.floor(Math.max(0,ms)/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
 return Object.freeze({BUFFER_MS,REPEAT_MS,SNOOZE_MS,RECENT_LIMIT,DECAY,average,ownerOf,suggested,hasAttempt,status,format,valid});
});
