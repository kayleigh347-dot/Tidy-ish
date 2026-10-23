/* Stage 10D: Wizard with reference presets and custom tasks, all draft-only. */
(function(root,factory){const lib=typeof module==='object'&&module.exports?require('./schedule-presets.js'):root?.TidySchedulePresets;
 const api=factory(lib);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyScheduleWizard=api;
})(typeof globalThis==='object'?globalThis:this,function(P){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const ISO=/^\d{4}-\d{2}-\d{2}$/;
 const recurring=t=>Number(t?.repeatDays)>0||Number(t?.repeatMonths)>0||!!t?.repeatWeekdays?.length;
 function candidates(board){
  const focus=new Set((board?.features?.focusSessions||[]).flatMap(x=>[...(x.resetIds||[]),...(x.taskIds||[])]));
  return (board?.tasks||[]).filter(t=>t&&t.id&&t.title&&!t.side&&(!t.done||recurring(t))&&!t.paused&&!t.archived&&!t.generatedFrom&&!focus.has(t.id)&&t.room!=='laundry');
 }
 function cadence(t){
  if(Number(t.repeatMonths)>0)return {count:Math.max(1,Number(t.repeatMonths)),unit:'months'};
  const days=Math.max(1,Number(t.repeatDays)||7);
  if(days%7===0)return {count:days/7,unit:'weeks'};
  return {count:days,unit:'days'};
 }
 function suggestions(board,roomId){
  const already=new Set(candidates(board).filter(t=>(t.room||'')===(roomId||'')).map(t=>t.title.trim().toLowerCase()));
  return P.forRoom(board?.rooms||[],roomId).filter(t=>!already.has(t.title.trim().toLowerCase()));
 }
 function customFor(draft,roomId){return (draft?.customTasks||[]).filter(t=>t.room===(roomId||''));}
 function catalogue(board){
  const list=[...suggestions(board,'')];
  for(const r of board?.rooms||[]) if(r.id!=='laundry'&&!r.archived)list.push(...suggestions(board,r.id));
  return list;
 }
 function optionFrom(t,selected=false){const c=cadence(t);return {selected,count:c.count,unit:c.unit,tools:typeof t.tools==='string'?t.tools:'',minutes:Number(t.estimate)||Number(t.presetMinutes)||0,timeEdited:false};}
 function defaultDraft(board,from,{starterSelected=true}={}){
  const options={};
  for(const t of candidates(board))options[t.id]=optionFrom(t);
  for(const t of catalogue(board))options[t.id]=optionFrom(t,starterSelected&&t.starter);
  return {version:2,from:ISO.test(from||'')?from:'',taskOptions:options,customTasks:[],restDays:[],oneRoomPerDay:false,makerMinutes:0,presetMultiplier:1};
 }
 function loadDraft(raw,board,from){
  const base=defaultDraft(board,from,{starterSelected:false}),obj=raw&&typeof raw==='object'&&!Array.isArray(raw)&&[1,2].includes(raw.version)?raw:null;
  if(!obj)return defaultDraft(board,from);
  const saved=Array.isArray(obj.customTasks)?obj.customTasks:[];
  const reserved=new Set([...Object.keys(base.taskOptions)]),rooms=new Set(['',...(board?.rooms||[]).map(r=>r.id)]);
  for(const x of saved.slice(0,250)){
   if(!x||typeof x.id!=='string'||!/^custom:[a-zA-Z0-9-]{6,70}$/.test(x.id)||reserved.has(x.id)||typeof x.title!=='string'||!x.title.trim()||x.title.length>180||!rooms.has(x.room))continue;
   reserved.add(x.id);const t={id:x.id,title:x.title.trim(),room:x.room,source:'custom'};
   base.customTasks.push(t);base.taskOptions[t.id]=optionFrom(t);
  }
  const source=obj.taskOptions&&typeof obj.taskOptions==='object'&&!Array.isArray(obj.taskOptions)?obj.taskOptions:{};
  for(const [id,original] of Object.entries(base.taskOptions)){
   const v=source[id];if(!v||typeof v!=='object'||Array.isArray(v))continue;
   const n=Number(v.count),mins=Number(v.minutes);
   base.taskOptions[id]={...original,selected:v.selected===true,
    count:Number.isInteger(n)&&n>=1&&n<=3650?n:original.count,
    unit:['days','weeks','months'].includes(v.unit)?v.unit:original.unit,
    tools:typeof v.tools==='string'?v.tools.slice(0,1000):original.tools,
    minutes:Number.isFinite(mins)&&mins>=0&&mins<=100000?mins:original.minutes,
    timeEdited:v.timeEdited===true};
  }
  if(typeof obj.from==='string'&&ISO.test(obj.from))base.from=obj.from;
  if(Array.isArray(obj.restDays))base.restDays=[...new Set(obj.restDays.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))];
  base.oneRoomPerDay=obj.oneRoomPerDay===true;
  const cap=Number(obj.makerMinutes);if(Number.isFinite(cap)&&cap>=0&&cap<=1440)base.makerMinutes=cap;
  if([1,2,3].includes(Number(obj.presetMultiplier)))base.presetMultiplier=Number(obj.presetMultiplier);
  return base;
 }
 function chosen(draft){return Object.entries(draft?.taskOptions||{}).filter(([,v])=>v.selected===true).map(([id])=>id);}
 function allCandidates(board,draft){return [...candidates(board),...catalogue(board),...(draft?.customTasks||[])];}
 function addCustom(draft,roomId,record){
  if(!draft||draft.version!==2)throw Error('Start a Schedule Maker draft first.');
  const title=String(record?.title||'').trim();
  if(!title||title.length>180)throw Error('Enter a task name (up to 180 characters).');
  const count=Number(record?.count),minutes=Number(record?.minutes);
  if(!Number.isInteger(count)||count<1||count>3650)throw Error('Repeat every must be 1–3650.');
  if(!['days','weeks','months'].includes(record?.unit))throw Error('Choose Days, Weeks or Months.');
  if(!Number.isFinite(minutes)||minutes<0||minutes>100000)throw Error('Time must be 0–100000 minutes.');
  const id='custom:'+((typeof globalThis!=='undefined'&&globalThis.crypto?.randomUUID?.())||Math.random().toString(36).slice(2)+Date.now().toString(36));
  const t={id,title,room:roomId||'',source:'custom'};
  draft.customTasks.push(t);
  draft.taskOptions[id]={selected:true,count,unit:record.unit,minutes,tools:String(record?.tools||'').slice(0,1000),timeEdited:true};
  return t;
 }
 function renameCustom(draft,id,title){const t=draft?.customTasks?.find(t=>t.id===id);if(!t)return false;const s=String(title||'').trim();if(!s||s.length>180)return false;t.title=s;return true;}
 function removeCustom(draft,id){const index=draft?.customTasks?.findIndex(t=>t.id===id)??-1;if(index<0)return false;draft.customTasks.splice(index,1);delete draft.taskOptions[id];return true;}
 function preview(board,draft,S,{from,days=28}={}){
  if(!S?.preview||!S?.addDays||!S?.parseDay)throw Error('Scheduling engine unavailable. No schedule changed.');
  const date=from||draft.from;
  if(!S.parseDay(date))throw Error('Choose a valid schedule start date.');
  const selected=new Set(chosen(draft));
  const tasks=allCandidates(board,draft).filter(t=>selected.has(t.id)).map(original=>{
   const t=clone(original),option=draft.taskOptions[t.id];
   t.repeatDays=option.unit==='months'?0:option.count*(option.unit==='weeks'?7:1);
   t.repeatMonths=option.unit==='months'?option.count:0;
   t.repeatWeekdays=[];t.repeatRestDays=[];t.paused=false;t.archived=false;t.side=false;
   t.nextDue='';t.dueDate='';t.skippedDates=[];
   const minutes=Number(option.minutes)||0;
   // Never pad a saved user's time or a custom task. Only untouched presets
   // can be scaled with the explicit preset multiplier (default is x1).
   if(t.source==='preset'&&!option.timeEdited){t.estimate=0;t.presetMinutes=minutes;}
   else {t.estimate=minutes;t.presetMinutes=0;}
   t.tools=option.tools;
   return t;
  });
  const plan=S.preview({tasks},{from:date,days,restDays:draft.restDays,
    oneRoomPerDay:draft.oneRoomPerDay,dailyCapMinutes:draft.makerMinutes,presetMultiplier:draft.presetMultiplier});
  return {...plan,selectedTasks:tasks};
 }
 return {candidates,suggestions,customFor,catalogue,allCandidates,defaultDraft,loadDraft,cadence,chosen,preview,recurring,addCustom,renameCustom,removeCustom};
});
