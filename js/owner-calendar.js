/* Owner-controlled calendar dates. No automatic imports or modifications to task history. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./schedule-core.js'):root.TidySchedule);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TidyOwnerCalendar=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(S){
 'use strict';
 const units=new Set(['once','days','months']);
 const eligible=t=>!!t&&!t.side&&!t.archived&&t.taskType!=='laundry';
 const iso=t=>S.parseDay(t)?t:'';
 function settings(t){
  const s=t.calendarSchedule;
  if(s&&typeof s==='object'&&units.has(s.unit))return {firstDue:s.firstDue||'',unit:s.unit,every:s.unit==='once'?1:Number(s.every)||1};
  return {firstDue:iso(t.nextDue)||iso(t.dueDate),unit:Number(t.repeatMonths)>0?'months':Number(t.repeatDays)>0?'days':'once',every:Number(t.repeatMonths)>0?Number(t.repeatMonths):Number(t.repeatDays)>0?Number(t.repeatDays):1};
 }
 function selection(tasks,selected){
  if(!Array.isArray(tasks)||!Array.isArray(selected))throw Error('Invalid calendar choices. No changes saved.');
  const candidates=new Map(tasks.filter(eligible).map(t=>[t.id,t]));
  if(new Set(selected.map(x=>x.id)).size!==selected.length)throw Error('Duplicate calendar choice. No changes saved.');
  const checked=new Map();
  for(const row of selected){
   if(!candidates.has(row.id))throw Error('Unknown calendar task. No changes saved.');
   if(!units.has(row.unit))throw Error('Choose Once, Days or Months. No changes saved.');
   if(!iso(row.firstDue))throw Error('Choose a valid first due date for '+candidates.get(row.id).title+'. No changes saved.');
   const every=Number(row.every);
   if(row.unit!=='once'&&(!Number.isInteger(every)||every<1||every>3650))throw Error('Choose a repeat interval from 1 to 3650 for '+candidates.get(row.id).title+'. No changes saved.');
   checked.set(row.id,{firstDue:row.firstDue,unit:row.unit,every:row.unit==='once'?1:every});
  }
  return checked;
 }
 function apply(tasks,selected){
  const checked=selection(tasks,selected); // Validate everything before a single mutation.
  for(const task of tasks){if(!eligible(task))continue;
   task.calendarEnabled=checked.has(task.id);
   if(checked.has(task.id))task.calendarSchedule=checked.get(task.id);
  }
  return checked.size;
 }
 function dates(t,from,days){
  const setting=settings(t);
  if(!iso(setting.firstDue))return [];
  if(setting.unit==='once')return setting.firstDue>=from&&setting.firstDue<=S.addDays(from,days-1)&&!(t.skippedDates||[]).includes(setting.firstDue)?[setting.firstDue]:[];
  const proxy={...t,nextDue:setting.firstDue,dueDate:'',repeatDays:setting.unit==='days'?setting.every:0,repeatMonths:setting.unit==='months'?setting.every:0,repeatWeekdays:[],repeatRestDays:[]};
  return S.occurrenceDates(proxy,from,days);
 }
 function preview(board,from,days){
  if(!iso(from)||!Number.isInteger(days)||days<1||days>366)throw Error('Invalid calendar month.');
  const by=new Map();let count=0;
  for(const t of board.tasks||[]){if(!eligible(t)||t.calendarEnabled!==true||t.paused)continue;count++;
   for(const due of dates(t,from,days)){
    const item={taskId:t.id,title:t.title,room:t.room,due,date:due,priority:Number(t.priority)||3,minutes:Number(t.estimate)>0?Number(t.estimate):null,moved:false};
    if(!by.has(due))by.set(due,{date:due,items:[],minutes:0});
    const row=by.get(due);row.items.push(item);row.minutes+=item.minutes||0;
   }
  }
  return {days:[...by.values()].sort((a,b)=>a.date.localeCompare(b.date)),sourceTaskCount:count,from,through:S.addDays(from,days-1)};
 }
 return Object.freeze({eligible,settings,selection,apply,dates,preview});
});
