const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
const Time=require('../js/quest-time-core.js');
const BreakTimer=require('../js/focus-break-timer.js');

const local=(y,m,d,h=0,min=0,s=0,ms=0)=>new Date(y,m,d,h,min,s,ms);
const storageFixture=()=>{const store=new Map();return {getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};};

test('only a newly completed top-level task in active Focus qualifies for the break',()=>{
 const before=M.board(),after=M.board(),task=M.task({id:'focus-root',title:'Kitchen reset',room:'kitchen'});
 before.tasks.push(M.clone(task));after.tasks.push(M.clone(task));after.tasks[0].done=true;
 const session={phase:'active',startedIds:[task.id]};
 assert.equal(Time.focusQuestCompleted(before,after,'focus',session),true);
 after.tasks[0].done=false;after.tasks[0].children=[M.child({id:'child',title:'Wipe counter',done:true})];
 assert.equal(Time.focusQuestCompleted(before,after,'focus',session),false,'a subtask alone is not a completed top-level task');
 after.tasks[0].done=true;
 assert.equal(Time.focusQuestCompleted(before,after,'room',session),false);
 assert.equal(Time.focusQuestCompleted(before,after,'focus',{...session,phase:'pick'}),false);
 assert.equal(Time.focusQuestCompleted(before,after,'focus',{...session,startedIds:[]}),false);
});

test('the between-task timer lasts five minutes, survives reopening, rings once and can be cancelled',()=>{
 const store=storageFixture(),first=BreakTimer.create(store,'focus-break:test'),start=local(2026,10,3,12).getTime();
 assert.equal(first.start(start),start+5*60000);
 const reopened=BreakTimer.create(store,'focus-break:test');
 assert.deepEqual(reopened.check(start+5*60000-1),{state:'running',endsAt:start+5*60000,remainingMs:1});
 assert.deepEqual(reopened.check(start+5*60000),{state:'due',endsAt:start+5*60000,remainingMs:0});
 assert.deepEqual(first.check(start+5*60000+1),{state:'idle',endsAt:0,remainingMs:0});
 reopened.start(start+10*60000);
 reopened.cancel();
 assert.deepEqual(first.check(start+10*60000+1),{state:'idle',endsAt:0,remainingMs:0});
});

test('undoing the completion that triggered a Focus break cancels that break',()=>{
 const store=storageFixture(),timer=BreakTimer.create(store,'focus-break:undo-test'),done=M.board(),start=local(2026,10,3,12).getTime();
 done.tasks.push(M.task({id:'focus-root-undo',title:'Kitchen reset',done:true}));timer.start(start,'focus-root-undo');
 const undone=M.clone(done);undone.tasks[0].done=false;
 assert.equal(timer.cancelIfTaskUndone(undone),true);
 assert.deepEqual(timer.peek(start+1),{state:'idle',endsAt:0,remainingMs:0});
});

test('Focus break integration has current caches, cancels its panel and has no overnight expiry path',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/js\/focus-break-timer\.js\?v=/);
 assert.match(html,/js\/quest-time-core\.js\?v=3-focusbreak1-elapsedentry1/);
 assert.match(html,/js\/app\.js\?v=[^\"]*focusbreak2-elapsedentry1-doingcollapse1-seasonalhomecomplete1-sleighbells1/);
 assert.doesNotMatch(app,/discardExpiredTaskTimers|hasExpiredTaskTimer|timerExpirySyncPending/);
 assert.match(app,/TIME\.focusQuestCompleted\(board,next,route,Q\?\.get\?\.\(\)\)/);
 assert.match(app,/focusBreakTimer\?\.cancelIfTaskUndone\(next\)/);
 assert.match(app,/function cancelFocusBreakTimer\(\)\{focusBreakTimer\?\.cancel\(\);document\.querySelector\('\[data-focus-break\]'\)\?\.remove\(\);\}/);
 assert.match(app,/focus-break-stop/);
 assert.match(app,/route==='focus'&&next!=='focus'/);
});
