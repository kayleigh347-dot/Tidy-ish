/* Tidy-ish read-only scheduling engine.
 * Reads saved repeating tasks; NEVER creates, edits, replaces or imports tasks.
 * User-created task names and cadence only. No preset task catalogue.
 * Calendar dates use UTC noon to avoid DST shifts in day arithmetic. */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TidySchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  function parseDay(date) {
    if (typeof date !== 'string' || !DATE.test(date)) return null;
    const [y,m,d] = date.split('-').map(Number);
    const value = new Date(Date.UTC(y,m-1,d,12));
    return value.getUTCFullYear() === y && value.getUTCMonth() === m-1 && value.getUTCDate() === d ? value : null;
  }
  function iso(date) { return date.toISOString().slice(0,10); }
  function addDays(date, count) {
    const d = parseDay(date); if (!d || !Number.isInteger(count)) return '';
    d.setUTCDate(d.getUTCDate()+count);return iso(d);
  }
  function addMonths(date, count) {
    const d = parseDay(date);if (!d || !Number.isInteger(count)) return '';
    const day = d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+count);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0,12)).getUTCDate();
    d.setUTCDate(Math.min(day,last));return iso(d);
  }
  const weekday = date => { const d=parseDay(date);return d?d.getUTCDay():null; }; // Sun=0
  const mondayWeekday = date => { const day=weekday(date);return day === null ? null : day || 7; }; // Mon=1, Sun=7
  function isRepeat(t) {return Number(t?.repeatDays)>0||Number(t?.repeatMonths)>0;}
  function nextInterval(t,date) {
    if(Number(t.repeatMonths)>0)return addMonths(date,Math.max(1,Number(t.repeatMonths)));
    return addDays(date,Math.max(1,Number(t.repeatDays)));
  }
  function repeatAllowed(t,date) {
    const day=mondayWeekday(date);
    return day!==null && (!Array.isArray(t.repeatWeekdays)||!t.repeatWeekdays.length||t.repeatWeekdays.some(x=>Number(x)===day)) &&
      (!Array.isArray(t.repeatRestDays)||!t.repeatRestDays.some(x=>Number(x)===day));
  }
  function initialDate(t,from) {
    if(parseDay(t.nextDue))return t.nextDue;
    if(parseDay(t.dueDate))return t.dueDate;
    // No due date: propose first occurrence one repeat interval after the chosen start.
    // The preview is never written into task data.
    return nextInterval(t,from);
  }
  function occurrenceDates(t,from,days=35) {
    if(!isRepeat(t)||!parseDay(from)||!Number.isInteger(days)||days<1||days>366)return [];
    const end=addDays(from,days-1),result=[];
    let due=initialDate(t,from);if(!due)return [];
    // Fast-forward old recurring tasks; don't silently drop series older than 520 days.
    if(due<from) {
      if(Number(t.repeatDays)>0 && !Number(t.repeatMonths)) {
        const interval=Math.max(1,Number(t.repeatDays));
        const lag=Math.floor((parseDay(from)-parseDay(due))/86400000);
        due=addDays(due,Math.max(0,Math.floor(lag/interval)-1)*interval);
      } else if(Number(t.repeatMonths)>0) {
        const first=parseDay(due),target=parseDay(from),months=(target.getUTCFullYear()-first.getUTCFullYear())*12+target.getUTCMonth()-first.getUTCMonth();
        const step=Math.max(1,Number(t.repeatMonths));
        due=addMonths(due,Math.max(0,Math.floor(months/step)-1)*step);
      }
    }
    for(let i=0;i<520 && due<=end;i++) {
      // Match the task model's policy: move restricted days forward, don't drop the task.
      let aligned=due;
      for(let hops=0;hops<370 && !repeatAllowed(t,aligned);hops++) aligned=addDays(aligned,1);
      if(!repeatAllowed(t,aligned))break;
      if(aligned>=from&&aligned<=end&&!(t.skippedDates||[]).includes(aligned))result.push(aligned);
      const next=nextInterval(t,aligned);
      if(!next||next<=aligned)break;
      due=next;
    }
    return [...new Set(result)];
  }
  function minutesFor(t,multiplier=1) {
    const entered=Number(t.estimate);
    if(Number.isFinite(entered)&&entered>0)return {minutes:entered,measuredOrUser:true};
    const preset=Number(t.presetMinutes);
    return Number.isFinite(preset)&&preset>0?{minutes:preset*Math.max(1,multiplier),measuredOrUser:false}:{minutes:null,measuredOrUser:false};
  }
  function preview(board, options={}) {
    const from=options.from,days=options.days??35;
    if(!parseDay(from)||!Number.isInteger(days)||days<1||days>366)throw Error('A valid start date and 1–366 preview days are required.');
    const rest=new Set((options.restDays||[]).map(Number)); // Sunday=0, Saturday=6
    const cap=Number(options.dailyCapMinutes)>0?Number(options.dailyCapMinutes):Infinity;
    const multiplier=Number(options.presetMultiplier)>0?Number(options.presetMultiplier):1;
    const oneRoom=!!options.oneRoomPerDay;
    const tasks=(board?.tasks||[]).filter(t=>isRepeat(t)&&!t.side&&!t.paused&&!t.archived);
    const candidates=[];
    for(const task of tasks) for(const due of occurrenceDates(task,from,days)) {
      candidates.push({taskId:task.id,title:task.title,room:task.room,due,priority:Number(task.priority)||3,
        ...minutesFor(task,multiplier)});
    }
    candidates.sort((a,b)=>a.due.localeCompare(b.due)||a.priority-b.priority||a.title.localeCompare(b.title));
    const byDay=new Map(),unplaced=[];
    const last=addDays(from,days-1);
    for(const event of candidates) {
      let chosen='';
      for(let day=event.due;day&&day<=last;day=addDays(day,1)) {
        if(rest.has(weekday(day)))continue;
        const list=byDay.get(day)||[];
        const total=list.reduce((sum,item)=>sum+(item.minutes||0),0);
        if(total+(event.minutes||0)>cap)continue;
        if(oneRoom&&list.length&&list[0].room!==event.room)continue;
        chosen=day;break;
      }
      if(!chosen){unplaced.push({...event,reason:'No available day in preview window'});continue;}
      const placed={...event,date:chosen,moved:chosen!==event.due};
      if(!byDay.has(chosen))byDay.set(chosen,[]);
      byDay.get(chosen).push(placed);
    }
    return {days:[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,items,minutes:items.reduce((n,x)=>n+(x.minutes||0),0)})),
      unplaced,sourceTaskCount:tasks.length,sourceCount:candidates.length,from,through:last};
  }
  return {parseDay,addDays,addMonths,weekday,mondayWeekday,isRepeat,occurrenceDates,minutesFor,preview};
});
