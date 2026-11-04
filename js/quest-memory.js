/* Tidy-ish Step 03: read-only household Quest memory. No fabricated completions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyQuestMemory=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const at=r=>Number.isFinite(Date.parse(r?.at||''))?Date.parse(r.at):0;
function completions(board,task){const ids=new Set([task.id,...(task.children||[]).map(c=>c.id)]);return (board?.features?.wins||[]).filter(w=>ids.has(w.taskId)||w.rootId===task.id).filter(w=>at(w)).sort((a,b)=>at(b)-at(a));}
function lastDone(board,task){const recent=completions(board,task)[0];return recent?.at||task.completedAt||null;}
function daysSince(value,now=new Date()){if(!value)return null;const d=new Date(value);if(!Number.isFinite(d.getTime()))return null;const key=x=>Date.UTC(x.getFullYear(),x.getMonth(),x.getDate());return Math.max(0,Math.floor((key(now)-key(d))/86400000));}
function status(board,task,now=new Date()){
 const last=lastDone(board,task),elapsed=daysSince(last,now),check=Number(task.checkDays)||0;
 const mode=task.conditionMode==='condition'?'condition':check>0?'check':'as-needed';
 const due=check>0&&elapsed!==null&&elapsed>=check;
 return {lastDone:last,daysSince:elapsed,mode,checkDays:check,due,needsInspection:mode==='condition'&&due,showInSuggestions:task.showInSuggestions!==false,
  label:task.done?'Completed':mode==='condition'&&due?'Check condition':due?'Ready to check':last?'As needed · last done '+elapsed+' days ago':'As needed · no recorded completion'};
}
return Object.freeze({completions,lastDone,daysSince,status});
});
