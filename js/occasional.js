/* Step 11: default long-interval jobs from the owner's Base Schedule, no weekly wizard. */
(function(root,factory){const api=factory(root.TidyBase95);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyOccasional=api;})(typeof globalThis!=='undefined'?globalThis:this,function(base){'use strict';
function effectiveMonths(row){
 const text=String(row?.sourceFrequency||'').trim().toLowerCase();
 // The owner's source has a handful of mistyped 6-monthly/2-monthly labels
 // which were previously converted to repeatMonths:1. Preserve the source,
 // repair only these explicit longer intervals in the occasional importer.
 const match=text.match(/^(\d+)\s*[- ]?\s*(?:monthly|onthly|montly)$/);
 if(match&&Number(match[1])>=2&&Number(match[1])<=120)return Number(match[1]);
 return Number(row?.repeatMonths)||0;
}
const OWNER_ROWS=(Array.isArray(base)?base:[]).map(row=>({...row,repeatMonths:effectiveMonths(row)})).filter(x=>Number(x.repeatMonths)>=2||Number(x.seasonMonth)>=1);
const CATEGORY_ROOM={"Downstairs Entrance":'entrance',"Cat tray landing (upstairs landing)":'cats',"Penny's Bedroom":'penny',"Master Bedroom":'master',"Bathroom":'bathroom',"Living Room":'living',"Kitchen":'kitchen',"Cat Tray Area":'cats',"Craft & Storage Room":'storage'};
const dayKey=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
function seasonNext(month,from=new Date(),seasonDay=15){
 const m=Number(month),wanted=Number(seasonDay);if(!Number.isInteger(m)||m<1||m>12||!Number.isInteger(wanted)||wanted<1||wanted>31)throw Error('Choose a valid UK seasonal date.');
 const dayIn=(year)=>Math.min(wanted,new Date(year,m,0).getDate()),today=dayKey(from),candidate=year=>dayKey(new Date(year,m-1,dayIn(year)));
 const year=from.getFullYear();return candidate(year)>today?candidate(year):candidate(year+1);
}
function hasTask(board,r){const norm=x=>String(x||'').trim().toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu,' ');return board.tasks.some(t=>t.occasionSourceId===r.id||t.id==='tidy-occasional:'+r.id||norm(t.title)===norm(r.title)&&(t.room===CATEGORY_ROOM[r.category]||!t.room&&!CATEGORY_ROOM[r.category]));}
function makeTask(row,Model,now,nextDue,calendarEnabled=true){const t=Model.task({id:'tidy-occasional:'+row.id,occasionKind:'occasional',calendarEnabled,occasionSourceId:row.id,room:CATEGORY_ROOM[row.category]||'',title:row.title,priority:Number(row.priority)||3,estimate:Number(row.minutes)||0,effort:row.effort||'',repeatMonths:Number(row.repeatMonths)||12,repeatDays:Number(row.repeatDays)||0,seasonMonth:Number(row.seasonMonth)||0,seasonDay:Number(row.seasonDay)||15,nextDue,messImpact:'small',taskType:row.taskType||'maintenance',checkDays:Number(row.checkDays)||0,conditionMode:row.conditionMode||'as-needed',subtasks:[],tools:row.tools||'',notes:row.notes||'',section:row.section||'',tags:row.tags||[],createdAt:now.toISOString()});t.children=(row.subtasks||[]).map(x=>Model.child({title:typeof x==='string'?x:x.title||'',followupTitle:typeof x==='string'?'':x.followupTitle||'',parentId:t.id}));return t;}
function seed(board,Model,now=new Date(),optIn=false,allowExplicitRestore=false){
 const available=OWNER_ROWS.filter(r=>!hasTask(board,r)),spaced=available.filter(r=>!r.seasonMonth),firstDay=dayKey(now);
 if((board.features?.occasionalDefaultsInitialised&&!allowExplicitRestore)||(board.tasks.length&&!optIn))return {added:0};
 // Initial seeding is one-time. A separate, explicitly confirmed restore action can re-add missing defaults; never do so on load or sync.
 available.forEach(r=>{const month=Number(r.seasonMonth)||0,index=spaced.findIndex(x=>x.id===r.id),initial=month?seasonNext(month,now,r.seasonDay):Model.plus(firstDay,Math.floor((index+1)*365/(spaced.length+1)));
 if(hasTask(board,r))return;
 Model.add(board,makeTask(r,Model,now,initial,false));
 });board.features.occasionalDefaultsInitialised=true;return {added:available.length};
}
function addSelected(board,Model,ids,now=new Date()){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Invalid or duplicate Base Schedule selections.');
 const selected=ids.map(id=>{const row=OWNER_ROWS.find(x=>x.id===id);if(!row)throw Error('Unknown Base Schedule item.');return row;});
 const first=dayKey(now),unseasonal=selected.filter(r=>!r.seasonMonth),pending=[],toEnable=[];
 for(const row of selected){const id='tidy-occasional:'+row.id;
  const existing=board.tasks.find(t=>t.id===id||t.occasionSourceId===row.id||String(t.title||'').trim().toLocaleLowerCase('en-GB')===String(row.title||'').trim().toLocaleLowerCase('en-GB')&&(t.room===CATEGORY_ROOM[row.category]||!t.room&&!CATEGORY_ROOM[row.category]));if(existing){if(existing.occasionKind==='occasional'&&existing.calendarEnabled!==true)toEnable.push(existing);continue;}
  const month=Number(row.seasonMonth)||0,index=unseasonal.findIndex(x=>x.id===row.id);
  const next=month?seasonNext(month,now,row.seasonDay):Model.plus(first,Math.floor((index+1)*365/(unseasonal.length+1)));
  pending.push(makeTask(row,Model,now,next));
 }
 for(const t of pending)Model.add(board,t);
 for(const t of toEnable)t.calendarEnabled=true;
 return {added:pending.length+toEnable.length,skipped:ids.length-pending.length-toEnable.length};
}
function previewSelected(board,Model,ids,now=new Date()){
 if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('Invalid or duplicate Base Schedule selections.');
 const selected=ids.map(id=>{const row=OWNER_ROWS.find(x=>x.id===id);if(!row)throw Error('Unknown Base Schedule item.');return row;});
 const unseasonal=selected.filter(r=>!r.seasonMonth),first=dayKey(now);
 return selected.map(row=>{
  const existing=board.tasks.find(t=>t.id==='tidy-occasional:'+row.id||t.occasionSourceId===row.id);
  const index=unseasonal.findIndex(x=>x.id===row.id),month=Number(row.seasonMonth)||0;
  const firstDue=existing?(existing.nextDue||''):month?seasonNext(month,now,row.seasonDay):Model.plus(first,Math.floor((index+1)*365/(unseasonal.length+1)));
  return {id:row.id,title:row.title,frequency:row.sourceFrequency||`${row.repeatMonths||12} months`,firstDue,existing:!!existing,seasonal:!!month};
 });
}
function tasks(board){return (board.tasks||[]).filter(t=>t.occasionKind==='occasional').sort((a,b)=>(a.nextDue||'').localeCompare(b.nextDue||'')||a.title.localeCompare(b.title));}
function complete(board,id,Model,now=new Date()){
 const t=board.tasks.find(x=>x.id===id&&x.occasionKind==='occasional');if(!t)throw Error('Occasional task not found.');
 const at=now.toISOString(),old=t.nextDue||'',win={id:Model.uid(),taskId:t.id,rootId:t.id,title:t.title,room:t.room,at,minutes:0,measured:false,points:1,person:board.features.displayName||'Me',_kind:'occasional'};
 board.features.wins.push(win);t._occasionalUndo={winId:win.id,nextDue:old,calendarFirstDue:t.calendarSchedule?.firstDue||null};t.nextDue=t.seasonMonth?seasonNext(t.seasonMonth,now,t.seasonDay):Model.months(dayKey(now),Math.max(1,Number(t.repeatMonths)||1));if(t.calendarSchedule?.unit!=='once'&&t.calendarSchedule)t.calendarSchedule.firstDue=t.nextDue;t.completedAt=at;t.done=false;return win;
}
function undo(board,id){const t=board.tasks.find(x=>x.id===id&&x.occasionKind==='occasional');if(!t?._occasionalUndo)return false;const {winId,nextDue}=t._occasionalUndo;if(!board.features.wins.some(w=>w.id===winId))throw Error('Previous completion missing; history unchanged.');board.features.wins=board.features.wins.filter(w=>w.id!==winId);t.nextDue=nextDue;if(t.calendarSchedule&&t._occasionalUndo.calendarFirstDue!==null&&t._occasionalUndo.calendarFirstDue!==undefined)t.calendarSchedule.firstDue=t._occasionalUndo.calendarFirstDue;const previous=board.features.wins.filter(w=>w.taskId===id).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];t.completedAt=previous?.at||'';delete t._occasionalUndo;return true;}
function validate(input){const months=Number(input.repeatMonths),season=Number(input.seasonMonth)||0;if(!Number.isInteger(months)||months<1||months>120)throw Error('Occasional tasks repeat every 1 to 120 months.');if(!Number.isInteger(season)||season<0||season>12)throw Error('Seasonal month must be January–December, or none.');if(!input.title?.trim())throw Error('Enter a task name.');if(input.nextDue&&!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDue))throw Error('Choose a valid date.');return {months,season};}
return Object.freeze({OWNER_ROWS,seed,addSelected,previewSelected,tasks,complete,undo,validate,seasonNext,dayKey});
});
