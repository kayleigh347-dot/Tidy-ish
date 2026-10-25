/* Tidy-ish flexible-only Schedule Maker v2. Base tasks come solely from user's CSV.
 * Deterministic, read-only previews; explicit apply; local-only until sync adapter
 * can round-trip schedulePlan and scheduled activation metadata safely. */
(function(root,factory){const P=typeof module==='object'&&module.exports?require('./base-schedule-95.js'):root.TidyBase95;
 const a=factory(P);if(typeof module==='object'&&module.exports)module.exports=a;if(root)root.TidyMakerV2=a;
})(typeof globalThis==='object'?globalThis:this,function(BASE){
 'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v));
 const dateRe=/^\d{4}-\d{2}-\d{2}$/;
 function day(s){if(typeof s!=='string'||!dateRe.test(s))return null;const[y,m,d]=s.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d,12));return t.getUTCFullYear()===y&&t.getUTCMonth()+1===m&&t.getUTCDate()===d?t:null;}
 const iso=t=>t.toISOString().slice(0,10);
 function addDays(s,n){const d=day(s);if(!d||!Number.isInteger(n))throw Error('Invalid calendar date. No changes saved.');d.setUTCDate(d.getUTCDate()+n);return iso(d);}
 function addMonths(s,n){const d=day(s);if(!d||!Number.isInteger(n))throw Error('Invalid calendar date. No changes saved.');const old=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const mx=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(old,mx));return iso(d);}
 const dow=s=>day(s).getUTCDay();
 const roomMatches={
  'Downstairs Entrance':['entrance'],
  'Downstairs Entrance/main landing':['entrance','hall'],
  'Main Landing/Cat tray landing (upstairs landing)':['hall','upstairs'],
  'Cat tray landing (upstairs landing)':['upstairs'],
  "Penny's Bedroom":['penny'],
  'Master Bedroom':['master'], 'Bathroom':['bathroom'], 'Living Room':['living'],
  'Kitchen':['kitchen'], 'Cat Tray Area':['cats'], 'Craft & Storage Room':['storage'],
  'General (whole house)':['']
 };
 function roomIds(b,cat){if(cat==='all rooms')return (b?.rooms||[]).filter(r=>!r.archived&&r.id!=='laundry').map(r=>r.id);
  const wanted=roomMatches[cat];if(!wanted)throw Error('Unrecognised CSV room category: '+cat);
  return wanted.filter(id=>!id||(b?.rooms||[]).some(r=>r.id===id&&!r.archived));}
 function catalogue(b){if(!Array.isArray(BASE)||BASE.length!==95)throw Error('The 95 base tasks are unavailable.');
  const results=[];for(const row of BASE)for(const room of roomIds(b,row.category)){
   results.push({...row,room,key:row.id+'|'+(room||'general'),roomLabel:room?(b.rooms.find(r=>r.id===room)?.name||room):'Whole house'});
  }return results;}
 function dueFrom(row,from){if(!day(from))throw Error('Choose a valid start date.');
  if(row.seasonMonth){const d=day(from);let y=d.getUTCFullYear();let result=`${y}-${String(row.seasonMonth).padStart(2,'0')}-01`;
   if(result<=from)result=`${y+1}-${String(row.seasonMonth).padStart(2,'0')}-01`;
   return result;}
  if(row.repeatMonths>0)return addMonths(from,row.repeatMonths);
  if(row.repeatDays>0)return addDays(from,row.repeatDays);
  throw Error('A base task has no supported recurrence.');}
 function next(row,from){return Number(row.repeatMonths)>0?addMonths(from,Number(row.repeatMonths)):addDays(from,Number(row.repeatDays));}
 function newDraft(board,from){return {version:2,from,selected:catalogue(board).map(t=>t.key),restDays:[],targetMinutes:30,maxMinutes:90,roomBias:true};}
 function validateDraft(b,d){if(!d||d.version!==2||!day(d.from))throw Error('Invalid Schedule Maker draft/start date.');
  const rows=catalogue(b),valid=new Set(rows.map(x=>x.key));if(!Array.isArray(d.selected)||d.selected.some(k=>!valid.has(k))||new Set(d.selected).size!==d.selected.length)throw Error('Unknown or duplicated task selection.');
  if(!Array.isArray(d.restDays)||d.restDays.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('Choose valid rest days.');
  if(!Number.isInteger(d.targetMinutes)||d.targetMinutes<1||d.targetMinutes>720||!Number.isInteger(d.maxMinutes)||d.maxMinutes<d.targetMinutes||d.maxMinutes>1440)throw Error('Invalid target or maximum minutes.');
  return rows.filter(x=>d.selected.includes(x.key));}
 function buildCandidates(rows,from,through,initial=false){const out=[];
  for(const r of rows){let d=initial?dueFrom(r,from):(r.nextDue||dueFrom(r,from));let previous='';let i=0;
   // Fast-forward candidates that are behind the displayed range, without changing anchor.
   if(d<addDays(from,-7)&&r.repeatDays>0){const ms=day(addDays(from,-7))-day(d);const jumps=Math.max(0,Math.floor(ms/(r.repeatDays*86400000))-1);d=addDays(d,jumps*r.repeatDays);}
   while(d<=through&&i++<1200){if(d>=addDays(from,-7)&&!(r.skippedDates||[]).includes(d))out.push({...r,minutes:Number(r.minutes??r.estimate??0),key:r.key||r.baseScheduleKey||r.id,taskId:r.scheduleMakerManaged?r.id:(r.key||r.id),due:d,fixed:!!(r.scheduleMakerManaged&&d===r.nextDue)});
    const upcoming=next(r,d);if(upcoming<=d||upcoming===previous)break;previous=d;d=upcoming;
   }
  }
  return out.sort((a,b)=>a.due.localeCompare(b.due)||a.priority-b.priority||a.room.localeCompare(b.room)||a.title.localeCompare(b.title));
 }
 function distribute(candidates,opts){const start=opts.from,through=opts.through,rest=new Set(opts.restDays||[]),max=opts.maxMinutes||1440,target=opts.targetMinutes||40;
  const by=new Map(),lastOf=new Map(),placed=[],unplaced=[];
  for(const e of candidates){const windowStart=(e.fixed||e.repeatDays===1)?e.due:(e.due>=start?addDays(e.due,-2):start);
   const windowEnd=(e.fixed||e.repeatDays===1)?e.due:addDays(e.due,e.repeatDays===1?1:e.repeatDays<=3?2:4);
   let winner='',score=Infinity;
   for(let d=windowStart;d<=windowEnd&&d<=through;d=addDays(d,1)){
    if(d<start||rest.has(dow(d)))continue;
    if(lastOf.has(e.key)&&d<=lastOf.get(e.key))continue;
    const list=by.get(d)||[],mins=list.reduce((s,x)=>s+x.minutes,0),existingRooms=new Set(list.map(x=>x.room).filter(Boolean));
    if(mins+e.minutes>max)continue;
    const roomPenalty=e.room&&existingRooms.size&&!existingRooms.has(e.room)?200:0;
    const drift=Math.abs((day(d)-day(e.due))/86400000),late=d>e.due?1:0;
    // Room cohesion dominates exact due-day alignment; spread load across the week.
    const workload=Math.abs(mins+e.minutes-target)*.38+Math.max(0,mins+e.minutes-target)*.9;
    const adjacent=by.get(addDays(d,-1))?.reduce((sum,v)=>sum+v.minutes,0)||0;
    const alternation=Math.max(0,mins+e.minutes-target)*Math.max(0,adjacent-target)/Math.max(1,target);
    const point=roomPenalty+drift*8+late*4+workload+alternation;
    if(point<score){winner=d;score=point;}
   }
   if(!winner){unplaced.push({...e,reason:'No available day within the planning window/capacity'});continue;}
   const item={...e,date:winner,moved:winner!==e.due};if(!by.has(winner))by.set(winner,[]);by.get(winner).push(item);placed.push(item);lastOf.set(e.key,winner);
  }
  return {days:[...by].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,items,minutes:items.reduce((s,x)=>s+x.minutes,0),rooms:[...new Set(items.map(x=>x.room).filter(Boolean))]})),placed,unplaced};
 }
 function preview(b,d,days=120){const chosen=validateDraft(b,d);if(!Number.isInteger(days)||days<7||days>366)throw Error('Preview must span 7–366 days.');
  const through=addDays(d.from,days-1),occ=buildCandidates(chosen,d.from,through,true);
  const distribution=distribute(occ,{...d,from:addDays(d.from,1),through});return {...distribution,sourceTasks:chosen.length,from:d.from,through};}
 function isManaged(t){return t?.scheduleMakerManaged===true&&!t.archived&&!t.side;}
 function scheduleSettings(b){return b?.features?.schedulePlan?.version===2?b.features.schedulePlan:null;}
 function calendar(b,from,days=35){if(!day(from)||!Number.isInteger(days)||days<1||days>366)throw Error('Invalid calendar range.');
  const state=scheduleSettings(b);if(!state)return {days:[],placed:[],unplaced:[]};
  const tasks=(b.tasks||[]).filter(t=>isManaged(t));
  // Start from this plan's stable initial anchor, not from the current displayed month.
  const base=state.startDate&&state.startDate<from?state.startDate:from;
  const through=addDays(from,days-1),candidates=buildCandidates(tasks,base,through,false);
  const dist=distribute(candidates,{from:addDays(base,1),through,restDays:state.restDays,targetMinutes:state.targetMinutes,maxMinutes:state.maxMinutes});
  return {...dist,days:dist.days.filter(x=>x.date>=from&&x.date<=through),placed:dist.placed.filter(x=>x.date>=from&&x.date<=through)};
 }
 function apply(b,d,M,{id,startAt}={}){if(b?.features?.browserSync?.house)throw Error('Connected household: safe schedule metadata synchronization is not yet verified. No changes saved.');
  const draft=copy(d),selected=validateDraft(b,draft),p=preview(b,draft,366);if(!selected.length)throw Error('Choose at least one base task.');
  if(p.unplaced.length)throw Error(`${p.unplaced.length} occurrences cannot fit the schedule. Increase capacity or adjust rest days before confirming.`);
  if(!M?.task||!M?.uid)throw Error('Task model unavailable.');
  const out=copy(b),previous=out.features.schedulePlan||null,priorManaged=out.tasks.filter(isManaged),snapshot=copy(priorManaged);
  // Do not delete or rewrite any task not created by THIS Schedule Maker.
  if(priorManaged.some(t=>t.done||t.doing||t.touched||t.children?.some(c=>c.done)))throw Error('A previous managed Quest has progress. Review it before replacing this schedule; no data changed.');
  const oldIds=new Set(priorManaged.map(t=>t.id)),nowIds=new Set(out.doingOrder||[]);
  out.tasks=out.tasks.filter(t=>!oldIds.has(t.id));out.doingOrder=out.doingOrder.filter(x=>!oldIds.has(x));
  const first=new Map();for(const item of p.placed)if(!first.has(item.key))first.set(item.key,item.date);
  for(const row of selected){const nextDue=first.get(row.key);if(!nextDue)throw Error('Task could not be placed.');
   const t=M.task({id:M.uid(),room:row.room,title:row.title,priority:row.priority,effort:row.effort,
    estimate:row.minutes,repeatDays:row.repeatDays,repeatMonths:row.repeatMonths,nextDue,
    scheduleMakerManaged:true,scheduleActive:false,baseScheduleKey:row.key,sourceFrequency:row.sourceFrequency,done:false,doing:false});
   out.tasks.push(t);
  }
  out.features.schedulePlan={version:2,id:id||M.uid(),startDate:d.from,createdAt:startAt||new Date().toISOString(),
   restDays:[...d.restDays],targetMinutes:d.targetMinutes,maxMinutes:d.maxMinutes,selection:[...draft.selected],
   priorPlan:previous?{id:previous.id,startDate:previous.startDate}:null};
  // Undo snapshot is local bookkeeping ONLY and must not contain access tokens.
  out.features.schedulePlanUndo={planId:out.features.schedulePlan.id,beforePlan:previous,beforeTasks:snapshot,addedIds:out.tasks.filter(isManaged).map(t=>t.id)};
  return out;
 }
 function undo(b){const state=b?.features?.schedulePlanUndo;if(!state||state.planId!==b.features.schedulePlan?.id)throw Error('No valid Schedule Maker Undo is available.');
  const currently=b.tasks.filter(isManaged),ids=new Set(state.addedIds);
  if(currently.length!==ids.size||currently.some(t=>!ids.has(t.id)||t.done||t.doing||t.touched||t.scheduleActive)||currently.some(t=>b.features.wins?.some(w=>w.taskId===t.id||w.rootId===t.id)))throw Error('Scheduled Quests have changed or been used. Cannot Undo safely.');
  const result=copy(b);result.tasks=result.tasks.filter(t=>!ids.has(t.id));result.tasks.push(...copy(state.beforeTasks||[]));if(state.beforePlan)result.features.schedulePlan=copy(state.beforePlan);else delete result.features.schedulePlan;delete result.features.schedulePlanUndo;return result;
 }
 function due(b,room,today){const state=scheduleSettings(b);if(!state||!day(today))return [];
  const start=addDays(today,-30),cal=calendar(b,start,61);
  return b.tasks.filter(t=>isManaged(t)&&(!room||t.room===room)&&!t.scheduleActive&&!!t.nextDue&&t.nextDue<=today)
   .filter(t=>!(t.skippedDates||[]).includes(t.nextDue))
   .filter(t=>{const scheduled=cal.placed.find(e=>e.taskId===t.id&&e.due===t.nextDue);return scheduled?scheduled.date<=today:t.nextDue<start;})
   .sort((a,b)=>a.priority-b.priority||a.nextDue.localeCompare(b.nextDue)||a.title.localeCompare(b.title));
 }
 function activate(b,room,ids,today){const wanted=new Set(ids),available=new Set(due(b,room,today).map(t=>t.id));
  if([...wanted].some(id=>!available.has(id)))throw Error('One or more selected scheduled Quests are unavailable. No changes saved.');
  const out=copy(b);for(const t of out.tasks)if(wanted.has(t.id)){t.scheduleActive=true;t.done=false;t.completedAt='';t._canUndoFamily=false;t._finishState=undefined;}
  return out;
 }
 return Object.freeze({BASE,catalogue,dueFrom,newDraft,validateDraft,preview,calendar,apply,undo,due,activate,isManaged,addDays,addMonths});
});
