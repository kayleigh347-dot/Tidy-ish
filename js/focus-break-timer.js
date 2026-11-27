/* A separate five-minute Focus break timer, stored only in this browser. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TidyFocusBreakTimer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const DURATION_MS=5*60*1000;
 function create(storage,key){
  const read=()=>{try{const value=JSON.parse(storage?.getItem(key)||'null');return value&&Number.isFinite(Number(value.endsAt))?value:null;}catch{return null;}};
  const write=value=>{try{storage?.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
  const idle=()=>({state:'idle',endsAt:0,remainingMs:0});
  function start(now=Date.now(),taskId=''){
   const current=read();if(current&&!current.alarmFired&&Number(current.endsAt)>now)return Number(current.endsAt);
   const endsAt=now+DURATION_MS;return write({endsAt,taskId:String(taskId||''),alarmFired:false})?endsAt:0;
  }
  function peek(now=Date.now()){
   const current=read();if(!current||current.alarmFired||Number(current.endsAt)<=now)return idle();
   return {state:'running',endsAt:Number(current.endsAt),remainingMs:Number(current.endsAt)-now};
  }
  function check(now=Date.now()){
   const current=read();if(!current||current.alarmFired)return idle();const endsAt=Number(current.endsAt);
   if(endsAt>now)return {state:'running',endsAt,remainingMs:endsAt-now};
   if(!write({...current,alarmFired:true}))return idle();
   return {state:'due',endsAt,remainingMs:0};
  }
  function cancel(){try{storage?.removeItem(key);return true;}catch{return false;}}
  function cancelIfTaskUndone(board){const current=read();if(!current?.taskId||current.alarmFired)return false;const task=board?.tasks?.find(row=>row.id===current.taskId);if(task?.done)return false;return cancel();}
  return Object.freeze({start,peek,check,cancel,cancelIfTaskUndone});
 }
 return Object.freeze({DURATION_MS,create});
});
