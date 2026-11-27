const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
const Time=require('../js/quest-time-core.js');
let BreakTimer;
try{BreakTimer=require('../js/focus-break-timer.js');}catch{}

const local=(y,m,d,h=0,min=0,s=0,ms=0)=>new Date(y,m,d,h,min,s,ms);
const withTimer=(row,{startedAt,elapsed=120000,estimate=900000,alarmNextAt=240000}={})=>Object.assign(row,{
 startedAt,elapsed,timerEstimateMs:estimate,alarmNextAtMs:alarmNextAt,alarmDismissed:false
});

test('timer expiry uses the next local 3 a.m. boundary, including a timer started before 3 a.m.',()=>{
 const before=local(2026,10,3,2,59,59,999).getTime();
 const at=local(2026,10,3,3).getTime();
 const after=local(2026,10,3,3,1).getTime();
 assert.equal(M.taskTimerExpiresAt(local(2026,10,3,2).getTime()),at);
 assert.equal(M.taskTimerExpiresAt(at),local(2026,10,4,3).getTime());
 assert.equal(M.taskTimerExpiresAt(local(2026,10,2,22).getTime()),at);
 assert.ok(M.taskTimerExpiresAt(local(2026,10,3,3,1).getTime())>after);
 assert.equal(M.taskTimerExpiresAt(0),0);
});

test('reopening after 3 a.m. clears only expired active task timers and preserves completion history',()=>{
 const board=M.board(),cutoff=local(2026,10,3,3).getTime();
 const expiredRoot=withTimer(M.task({id:'expired-root',title:'Old task'}),{startedAt:local(2026,10,2,22).getTime()});
 const expiredChild=withTimer(M.child({id:'expired-child',title:'Old subtask'}),{startedAt:local(2026,10,3,2,30).getTime()});
 const current=withTimer(M.task({id:'current',title:'Current task'}),{startedAt:local(2026,10,3,3,1).getTime()});
 const paused=withTimer(M.task({id:'paused',title:'Paused task'}),{startedAt:0});
 const completed=M.task({id:'completed',title:'Completed task',done:true,completedAt:local(2026,10,2,20).toISOString()});
 expiredChild.children=[withTimer(M.child({id:'expired-grandchild',title:'Old nested subtask'}),{startedAt:local(2026,10,3,2,45).getTime()})];
 expiredRoot.children.push(expiredChild);
 board.tasks.push(expiredRoot,current,paused,completed);
 board.features.wins.push({id:'win-1',taskId:completed.id,at:completed.completedAt,points:1});
 board.features.questTimings.push({id:'attempt-1',taskId:'historical-task',kind:'valid',durationMs:60000,at:completed.completedAt});
 const beforeHistory=JSON.stringify([board.features.wins,board.features.questTimings]);

 assert.deepEqual(M.discardExpiredTaskTimers(board,cutoff).sort(),['expired-child','expired-grandchild','expired-root']);
for(const item of [expiredRoot,expiredChild,expiredChild.children[0]]){
  assert.equal(item.done,false);
  assert.equal(item.startedAt,0);
  assert.equal(item.elapsed,0);
  assert.equal(item.timerEstimateMs,0);
  assert.equal(item.alarmNextAtMs,0);
  assert.equal(item.alarmDismissed,true);
 }
 assert.equal(current.startedAt,local(2026,10,3,3,1).getTime());
 assert.equal(paused.elapsed,120000);
 assert.equal(completed.done,true);
 assert.equal(JSON.stringify([board.features.wins,board.features.questTimings]),beforeHistory);
});

test('only a newly completed top-level Quest in active Focus starts the between-task timer',()=>{
 const before=M.board(),after=M.board(),task=M.task({id:'focus-root',title:'Kitchen reset',room:'kitchen'});
 before.tasks.push(M.clone(task));after.tasks.push(M.clone(task));
 after.tasks[0].done=true;
 const session={phase:'active',startedIds:[task.id]};
 assert.equal(Time.focusQuestCompleted(before,after,'focus',session),true);
 after.tasks[0].done=false;after.tasks[0].children=[M.child({id:'child',title:'Wipe counter',done:true})];
 assert.equal(Time.focusQuestCompleted(before,after,'focus',session),false,'a subtask alone is not a completed top-level Quest');
 after.tasks[0].done=true;
 assert.equal(Time.focusQuestCompleted(before,after,'room',session),false);
 assert.equal(Time.focusQuestCompleted(before,after,'focus',{...session,phase:'pick'}),false);
 assert.equal(Time.focusQuestCompleted(before,after,'focus',{...session,startedIds:[]}),false);
});

test('the between-task timer lasts five minutes, survives reopening, rings once and can be cancelled',()=>{
 assert.ok(BreakTimer,'focus-break-timer.js must export its timer controller');
 const store=new Map(),storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
 const first=BreakTimer.create(storage,'focus-break:test'),start=local(2026,10,3,12).getTime();
 assert.equal(first.start(start),start+5*60000);
 const reopened=BreakTimer.create(storage,'focus-break:test');
 assert.deepEqual(reopened.check(start+5*60000-1),{state:'running',endsAt:start+5*60000,remainingMs:1});
 assert.deepEqual(reopened.check(start+5*60000),{state:'due',endsAt:start+5*60000,remainingMs:0});
 assert.deepEqual(first.check(start+5*60000+1),{state:'idle',endsAt:0,remainingMs:0});
 reopened.start(start+10*60000);
 reopened.cancel();
 assert.deepEqual(first.check(start+10*60000+1),{state:'idle',endsAt:0,remainingMs:0});
});

test('app expiry and between-task timer wiring stays local, cancels on task start and Focus exit, and exposes manual stop',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/js\/focus-break-timer\.js/);
 assert.match(app,/M\.discardExpiredTaskTimers\(b,now\)/);
 assert.match(app,/TIME\.focusQuestCompleted\(board,next,route,Q\?\.get\?\.\(\)\)/);
 assert.match(app,/focus-break-stop/);
 assert.match(app,/cancelFocusBreakTimer\(\)/);
 assert.match(app,/route==='focus'&&next!=='focus'/);
});
