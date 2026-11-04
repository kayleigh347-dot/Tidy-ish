/* Tidy-ish Schedule Maker v3: NEW engine. No dependency on retired 95-task scheduler.
   Read-only preview first. User data changes only in explicitly confirmed Apply. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyMakerV2=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const copy=v=>JSON.parse(JSON.stringify(v));
const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const [y,m,d]=s.split('-').map(Number),o=new Date(Date.UTC(y,m-1,d,12));return o.getUTCFullYear()===y&&o.getUTCMonth()===m-1&&o.getUTCDate()===d?o:null;};
const iso=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=parse(s);if(!d||!Number.isInteger(n))throw Error('Invalid date');d.setUTCDate(d.getUTCDate()+n);return iso(d);};
const weekday=s=>parse(s)?.getUTCDay();
const isManaged=t=>!!(t?.tidyScheduleV3||t?.scheduleMakerManaged);
function newDraft(board,from){return {version:3,from:parse(from)?from:iso(new Date()),targetMinutes:60,restDays:[],roomIds:board.rooms.filter(r=>!r.archived&&r.id!=='laundry').map(r=>r.id),selected:[],overrides:{},custom:[],mode:'choose'};}
function validateDraft(board,d,catalogue){if(!d||d.version!==3||!parse(d.from))throw Error('Start date is invalid.');if(!Number.isInteger(d.targetMinutes)||d.targetMinutes<15||d.targetMinutes>720)throw Error('Use a 15–720 minute planning target.');if(!Array.isArray(d.restDays)||d.restDays.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('Choose valid rest days.');if(d.restDays.length===7)throw Error('Keep at least one available day.');
 if(!Array.isArray(d.roomIds)||d.roomIds.some(id=>!board.rooms.some(r=>r.id===id&&!r.archived)))throw Error('One selected room no longer exists.');
 const ids=new Set([...catalogue.map(t=>t.id),...(d.custom||[]).map(t=>t.id)]);if(!Array.isArray(d.selected)||new Set(d.selected).size!==d.selected.length||d.selected.some(id=>!ids.has(id)))throw Error('A selected Quest is missing from the catalogue.');
 for(const c of d.custom||[]){if(!c.title?.trim()||!d.roomIds.includes(c.roomId)||!(c.minutes>0)||!(c.priority>=1&&c.priority<=5)||!(c.repeatDays>=1))throw Error('Custom Quests require a room, minutes, priority and repeat interval.');}
 return true;}
function chosen(board,d,catalogue){validateDraft(board,d,catalogue);const source=[...catalogue,...(d.custom||[])];return source.filter(t=>d.selected.includes(t.id)&&d.roomIds.includes(t.roomId)).map(t=>{const o=d.overrides[t.id]||{};const row={...t,...o};if(!row.title?.trim()||!Number.isInteger(Number(row.minutes))||Number(row.minutes)<1||!Number.isInteger(Number(row.priority))||Number(row.priority)<1||Number(row.priority)>5||!Number.isInteger(Number(row.repeatDays))||Number(row.repeatDays)<1)throw Error('Correct the name, minutes, priority or frequency for '+t.title);return {...row,minutes:Number(row.minutes),priority:Number(row.priority),repeatDays:Number(row.repeatDays)};});}
/* A progress-driven plan: one upcoming occurrence per Quest, never invented completions.
   Carry the current room forward on a partial day, rather than jumping to another room.
   A soft target may be exceeded to avoid splitting a single Quest or blocking a day. */
function arrange(entries,from,days,restDays=[],targetMinutes=60){if(!parse(from)||!Number.isInteger(days)||days<1||days>366)throw Error('Invalid calendar window.');const until=addDays(from,days-1),rest=new Set(restDays),remaining=entries.map(e=>({...e,minutes:Number(e.minutes)||0,priority:Number(e.priority)||3})).filter(e=>e.room&&e.due&&parse(e.due));
 const out=[],placed=[],max=targetMinutes||60;let carry='';
 for(let date=from;date<=until&&remaining.length;date=addDays(date,1)){
  if(rest.has(weekday(date)))continue;
  const ready=remaining.filter(e=>e.due<=date);if(!ready.length)continue;
  const byRoom=new Map();for(const r of ready){const list=byRoom.get(r.room)||[];list.push(r);byRoom.set(r.room,list);}
  let room=carry&&byRoom.has(carry)?carry:null;
  if(!room){room=[...byRoom].sort((a,b)=>{const aSorted=a[1].slice().sort((x,y)=>x.priority-y.priority||x.due.localeCompare(y.due)),bSorted=b[1].slice().sort((x,y)=>x.priority-y.priority||x.due.localeCompare(y.due));return aSorted[0].priority-bSorted[0].priority||aSorted[0].due.localeCompare(bSorted[0].due)||a[0].localeCompare(b[0]);})[0][0];}
  const list=byRoom.get(room).sort((a,b)=>a.priority-b.priority||a.due.localeCompare(b.due)||a.title.localeCompare(b.title));
  let count=0,total=0;const today=[];
  for(const e of list){if(count&&total+e.minutes>max)break;const item={...e,date,moved:e.due!==date,taskId:e.taskId||e.id};today.push(item);placed.push(item);total+=e.minutes;count++;}
  for(const item of today){const index=remaining.findIndex(e=>e.id===item.id);if(index>=0)remaining.splice(index,1);}
  carry=remaining.some(e=>e.room===room&&e.due<=date)?room:'';
  out.push({date,items:today,minutes:total,rooms:[room],carried:!!carry});
 }
 return {days:out,placed,unplaced:remaining.map(e=>({...e,reason:'Beyond the visible preview; no data lost'})),sourceTasks:entries.length,from,through:until};}
function preview(board,d,catalogue,days=35){const rows=chosen(board,d,catalogue);return arrange(rows.map(r=>({...r,key:r.id,room:r.roomId,due:d.from,taskId:r.id})),d.from,days,d.restDays,d.targetMinutes);}
function scheduleSettings(b){const p=b?.features?.schedulePlan;return p?.version===3?p:null;}
function calendar(board,from,days=35){const settings=scheduleSettings(board);if(!settings||!parse(from))return {days:[],placed:[],unplaced:[]};
 const active=(board.tasks||[]).filter(t=>t.tidyScheduleV3&&!t.archived&&!t.scheduleActive&&t.nextDue&&!(t.skippedDates||[]).includes(t.nextDue)).map(t=>({id:t.id,taskId:t.id,room:t.room,title:t.title,due:t.nextDue,minutes:Number(t.estimate)||0,priority:Number(t.priority)||3}));
 // Look ahead only. A missed Quest remains pending rather than multiplying overdue copies.
 return arrange(active,from,days,settings.restDays,settings.targetMinutes);}
function due(board,room,today){if(!parse(today))return [];return (board.tasks||[]).filter(t=>t.tidyScheduleV3&&!t.archived&&!t.scheduleActive&&(!room||t.room===room)&&t.nextDue&&t.nextDue<=today).sort((a,b)=>(a.priority||3)-(b.priority||3)||a.nextDue.localeCompare(b.nextDue));}
function apply(board,d,catalogue,M){if(board.features?.browserSync?.house)throw Error('Connected household Apply remains unfinished until complete sync, backup and rollback tests pass. No changes saved.');if(!M?.task||!M?.uid||!M?.child)throw Error('Task model unavailable.');const rows=chosen(board,d,catalogue);if(!rows.length)throw Error('Select at least one Quest before Apply.');const plan=preview(board,d,catalogue,366);if(plan.unplaced.length)throw Error('The preview does not fit within a year. Nothing has been changed.');
 const prior=(board.tasks||[]).filter(t=>isManaged(t)&&!t.archived);
 if(prior.some(t=>t.done||t.doing||t.touched||t.scheduleActive||t.children?.some(c=>c.done)||board.features?.wins?.some(w=>w.taskId===t.id||w.rootId===t.id)))throw Error('An earlier scheduled Quest has history or progress. Its data must be reconciled before replacing the plan. No changes saved.');
 const next=copy(board),planId=M.uid(),scheduled=new Map(plan.placed.map(e=>[e.id,e.date]));const archivedIds=[];
 for(const t of next.tasks){if(isManaged(t)&&!t.archived){t.archived=true;archivedIds.push(t.id);}}
 const addedIds=[];for(const row of rows){const t=M.task({id:M.uid(),room:row.roomId,title:row.title,estimate:row.minutes,priority:row.priority,repeatDays:row.repeatDays,repeatMonths:0,nextDue:scheduled.get(row.id)||d.from,children:(row.steps||[]).map(title=>M.child({title})),scheduleMakerManaged:true,tidyScheduleV3:true,scheduleActive:false,scheduleCatalogueId:row.id,done:false,doing:false,side:false});next.tasks.push(t);addedIds.push(t.id);}
 const priorPlan=copy(next.features.schedulePlan||null);next.features.schedulePlan={version:3,id:planId,startDate:d.from,targetMinutes:d.targetMinutes,restDays:d.restDays.slice(),selection:rows.map(x=>x.id),createdAt:new Date().toISOString(),engine:'room-progress-v1'};
 next.features.schedulePlanUndo={version:3,planId,addedIds,archivedIds,priorPlan};return next;}
function undo(board){const h=board.features?.schedulePlanUndo;if(h?.version!==3||h.planId!==board.features?.schedulePlan?.id)throw Error('No reversible Schedule Maker Apply is available.');if(board.features?.browserSync?.house)throw Error('Undo with household sync is not enabled.');
 const added=new Set(h.addedIds),items=board.tasks.filter(t=>added.has(t.id));if(items.length!==added.size||items.some(t=>t.done||t.doing||t.touched||t.scheduleActive||t.children?.some(c=>c.done)||board.features?.wins?.some(w=>w.taskId===t.id||w.rootId===t.id)))throw Error('Scheduled Quests have progress. Undo is blocked to preserve history.');
 const next=copy(board);next.tasks=next.tasks.filter(t=>!added.has(t.id));for(const t of next.tasks)if(h.archivedIds.includes(t.id))t.archived=false;
 if(h.priorPlan)next.features.schedulePlan=h.priorPlan;else delete next.features.schedulePlan;delete next.features.schedulePlanUndo;return next;}
function activate(board,room,ids,today){const available=new Set(due(board,room,today).map(t=>t.id));if(ids.some(id=>!available.has(id)))throw Error('One or more Quests are not currently due.');const next=copy(board);next.tasks.filter(t=>ids.includes(t.id)).forEach(t=>{if(t.done){t.done=false;t.completedAt='';t.children.forEach(c=>{c.done=false;delete c._winId;});t._canUndoFamily=false;delete t._finishState;delete t._completionIds;}t.scheduleActive=true;});return next;}
return Object.freeze({parse,addDays,newDraft,validateDraft,chosen,preview,arrange,calendar,due,apply,undo,activate,isManaged,scheduleSettings});
});
