/* Step 04: explainable, read-only recommendations from canonical Quests. */
(function(root,factory){const api=factory(root.TidyQuestMemory,root.TidyQuestTime);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyQuestRecommendations=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Memory,Time){'use strict';
const finite=(v,otherwise)=>Number.isFinite(Number(v))?Number(v):otherwise;
function eligible(t,room='',today='',board=null,now=null){
 if(!t||t.side||t.archived||t.littleOften||t.dailyGrind||t.careTask||t.scheduleMakerManaged||t.tidyScheduleV3)return false;
 if(t.showInSuggestions===false)return false;
 if(['care','laundry','little-often','pet','plant'].includes(t.taskType)||t.generatedFrom?.startsWith('clear-way-session:')&&t.done)return false;
 if(room&&t.room!==room)return false;
 if(t.paused&&(!t.pauseUntil||t.pauseUntil>today))return false;
 if(t.occasionKind==='occasional')return false;
 if(t.done){
  const memory=board&&Memory?.status?.(board,t,now||new Date(today+'T12:00:00'));
  const interval=Number(t.checkDays)||0;
  // Completed tasks become candidates once their user-set check interval or saved due date arrives.
  // An 'as needed' task with no interval remains available manually from the Quest Library.
  if(!memory?.lastDone)return false;
  if(interval>0)return memory.daysSince!==null&&memory.daysSince>=interval;
  return !!t.nextDue&&t.nextDue<=today;
 }
 if(t.nextDue&&t.nextDue>today)return false;
 return true;
}
function rank(board,opts={}){
 const now=opts.now instanceof Date?opts.now:new Date(opts.now??Date.now()),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const room=opts.room||'',limit=Math.max(1,Math.min(100,finite(opts.limit,20))),maxMinutes=finite(opts.maxMinutes,0),maxTasks=finite(opts.maxTasks,0);
 const rows=(board.tasks||[]).filter(t=>eligible(t,room,today,board,now)).map(t=>{
  const memory=Memory.status(board,t,now),priority=Math.max(1,Math.min(5,finite(t.priority,3))),mess={none:0,tiny:.14,small:.5,normal:1,big:2}[t.messImpact]??1;
  const age=memory.daysSince===null?0:Math.min(memory.daysSince,365);
  // The editable per-task factors allow all scoring inputs to be tuned in Task Settings.
  const priorityFactor=Math.max(0,Math.min(10,finite(t.rankPriorityWeight,1)));
  const ageFactor=Math.max(0,Math.min(10,finite(t.rankRecencyWeight,1)));
  const messFactor=Math.max(0,Math.min(10,finite(t.rankMessWeight,1)));
  const dueCheck=memory.mode==='check'&&memory.due?10:0;
  const putAwayFirst=String(t.generatedFrom||'').startsWith('clear-way-session:')&&String(t.title||'').toLowerCase().includes('near their homes');
  const score=(putAwayFirst?100000:0)+(6-priority)*10*priorityFactor+Math.min(age,90)/3*ageFactor+mess*8*messFactor+dueCheck;
  const estimated=Time?.suggested?.(board,t)||Number(t.estimate)||15;
  const reason=t.done&&memory.mode==='condition'?'Check condition · '+memory.daysSince+' days since last completion':t.done&&memory.mode==='check'?'Ready to check · '+memory.daysSince+' days since last completion':t.done?'Scheduled date reached · '+memory.daysSince+' days since last completion':memory.label;
  return {id:t.id,task:t,score,estimated,reason,lastDone:memory.lastDone,daysSince:memory.daysSince};
 }).sort((a,b)=>b.score-a.score||(a.task.title||'').localeCompare(b.task.title||''));
 let minutes=0,count=0;return rows.filter(row=>{if(count>=limit||(maxTasks>0&&count>=maxTasks))return false;if(maxMinutes>0&&minutes+row.estimated>maxMinutes)return false;count++;minutes+=row.estimated;return true;});
}
return Object.freeze({eligible,rank});
});
