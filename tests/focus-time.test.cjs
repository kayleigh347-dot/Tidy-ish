const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js');
const Time=require('../js/quest-time-core.js');
globalThis.TidyQuestTime=Time;
const Q=require('../js/quest-focus.js');

const DAY='2026-10-31';
const add=(board,title,values={})=>{const task=M.task({id:M.uid(),title,room:'kitchen',...values});board.tasks.push(task);return task;};

test('Clear the Way has the seven specified steps and only selects laundry in bedrooms and bathrooms',()=>{
 const b=M.board();
 assert.equal(Q.standardSteps.length,7);
 assert.match(Q.standardSteps[0],/bin bag and 3 boxes\/bags/);
 assert.match(Q.standardSteps[6],/Do not sort/);
 assert.equal(Q.standardSelection(b,'kitchen').length,6);
 assert.ok(!Q.standardSelection(b,'kitchen').some(x=>x===Q.standardSteps[3]));
 assert.equal(Q.standardSelection(b,'bathroom').length,7);
 assert.equal(Q.standardSelection(b,'penny').length,7);
});

test('room selector separates My, Main, Bonus, Optional, Future, and Side Quests while excluding inactive tasks',()=>{
 const b=M.board();
 const mine=add(b,'My room task');
 const main=add(b,'Main task',{repeatDays:7,nextDue:DAY,priority:1});
 const bonus=add(b,'Bonus task',{repeatDays:7,nextDue:DAY,priority:3});
 const optional=add(b,'Optional task',{repeatDays:7,nextDue:DAY,priority:5});
 const future=add(b,'Future task',{repeatDays:7,nextDue:'2026-11-03',priority:1});
 const side=add(b,'Side task',{side:true});
 add(b,'Done task',{done:true});add(b,'Paused task',{paused:true});
 const groups=Q.eligible(b,'kitchen',DAY);
 assert.deepEqual(groups.mine.map(x=>x.id),[mine.id]);
 assert.deepEqual(groups.main.map(x=>x.id),[main.id]);
 assert.deepEqual(groups.bonus.map(x=>x.id),[bonus.id]);
 assert.deepEqual(groups.optional.map(x=>x.id),[optional.id]);
 assert.deepEqual(groups.future.map(x=>x.id),[future.id]);
 assert.deepEqual(groups.side.map(x=>x.id),[side.id]);
});

test('personal calculator uses recent valid attempts, task estimate, then a 15-minute starter estimate',()=>{
 const b=M.board(),t=add(b,'Measured task',{estimate:25}),owner=Time.ownerOf(b);
 assert.equal(Q.estimate(t,b),25);
 const fallback=add(b,'Unmeasured task');assert.equal(Q.estimate(fallback,b),15);
 b.features.questTimings=[];
 for(let i=0;i<10;i++)b.features.questTimings.push({id:'timing-'+i,taskId:t.id,owner,kind:'valid',durationMs:(8+i)*60000,at:`2026-10-${String(i+1).padStart(2,'0')}T09:00:00Z`});
 b.features.questTimings.push({id:'distracted',taskId:t.id,owner,kind:'distracted',durationMs:9000000,at:'2026-10-30T10:00:00Z'});
 b.features.questTimings.push({id:'no-time',taskId:t.id,owner,kind:'no-time',durationMs:0,at:'2026-10-30T11:00:00Z'});
 const learned=Time.average(b.features.questTimings,t.id,owner);
 assert.ok(learned>14&&learned<18);
 assert.equal(Q.estimate(t,b),Math.ceil(learned));
 assert.equal(Time.average(b.features.questTimings,t.id,'someone else'),null);
});
test('a just-started timer is still an attempt and pause preserves only accumulated active seconds',()=>{
 const now=Date.now(),running={startedAt:now,elapsed:0};
 assert.equal(Time.hasAttempt(running),true);
 running.elapsed=M.time(running,now+4200);running.startedAt=0;
 assert.equal(M.time(running,now+600000),4200);
 assert.equal(Time.hasAttempt(running),true);
 assert.equal(Time.hasAttempt({startedAt:0,elapsed:0}),false);
});

test('Focus totals and time recommendations use the same personal task estimates',()=>{
 const b=M.board(),a=add(b,'A',{estimate:7,repeatDays:7,nextDue:DAY,priority:1}),bb=add(b,'B',{estimate:20,repeatDays:7,nextDue:DAY,priority:2}),owner=Time.ownerOf(b);
 b.features.questTimings.push({id:'new-a',taskId:a.id,owner,kind:'valid',durationMs:4*60000,at:'2026-10-30T10:00:00Z'});
 assert.deepEqual(Q.metrics(b,[a.id,bb.id,a.id]),{count:2,minutes:24,unknown:0});
 assert.deepEqual(Q.recommend(b,'kitchen',DAY,{minutes:5}),[a.id]);
 assert.deepEqual(Q.recommend(b,'kitchen',DAY,{count:1}),[a.id]);
});

test('Plan for me includes unscheduled Quests, honors no-limit selection, and follows the active category tab',()=>{
 const b=M.board(),high=add(b,'High priority',{repeatDays:7,nextDue:DAY,priority:1}),mine=add(b,'My unscheduled Quest'),side=add(b,'Side Quest',{side:true});
 assert.deepEqual(Q.recommend(b,'kitchen',DAY),[high.id,mine.id]);
 assert.deepEqual(Q.recommend(b,'kitchen',DAY,{count:null,tab:'side'}),[side.id]);
 assert.deepEqual(Q.recommend(b,'kitchen',DAY,{count:1}),[high.id]);
});

test('Doing Now Focus contains only current Doing Now tasks across all rooms and resumes selected IDs',()=>{
 const b=M.board(),one=add(b,'Kitchen doing',{doing:true}),two=M.task({id:M.uid(),title:'Bedroom doing',room:'penny',doing:true}),notDoing=add(b,'Not doing');b.tasks.push(two);
 assert.deepEqual(Q.doingEligible(b,DAY).map(t=>t.id),[one.id,two.id]);
 const saved=Q.session('kitchen',undefined,'doing');saved.phase='active';saved.startedIds=[one.id,two.id];
 const restored=Q.sanitize(saved,b,'kitchen');assert.equal(restored.scope,'doing');assert.deepEqual(restored.startedIds,[one.id,two.id]);
 assert.ok(!Q.doingEligible(b,DAY).some(t=>t.id===notDoing.id));
});

test('old board data and timing history survive normalization and sync merge',()=>{
 const base=M.board(),incoming=M.board();delete base.features.questTimings;const normalized=M.normalize(base);
 assert.deepEqual(normalized.features.questTimings,[]);
 incoming.features.questTimings.push({id:'timing-1',taskId:'task-1',owner:'member',kind:'valid',durationMs:60000,at:'2026-10-31T10:00:00Z'});
 const merged=M.merge(normalized,incoming);assert.equal(merged.features.questTimings.length,1);
 assert.equal(merged.features.questTimings[0].durationMs,60000);
});

test('Clear the Way completions make one point record without creating or selecting a task',()=>{
 const b=M.board(),beforeTasks=b.tasks.length,entry={id:'clear-step-1',title:'Bag loose rubbish'};
 assert.equal(Q.recordClearWin(b,{room:'kitchen',entry,now:'2026-10-31T10:00:00Z',id:'win-1',person:'Kayleigh'}),true);
 assert.equal(b.features.wins[0].points,1);assert.equal(b.tasks.length,beforeTasks);assert.deepEqual(b.doingOrder,[]);
});

test('Focus completion preserves existing Clear the Way follow-up behavior and touched follow-up tasks',()=>{
 const b=M.board(),child=M.child({title:'Important pickup',clearTheWayPickup:true,followupTitle:'Sort important items later'}),root=add(b,'Clear the Way task',{children:[child],doing:true});
 M.finish(b,root.id,true);const followup=b.tasks.find(t=>t.generatedFrom===child.id);assert.equal(followup.title,'Sort important items later');
 followup.touched=true;M.finish(b,root.id,false);assert.ok(b.tasks.includes(followup));assert.equal(root.done,false);
});

test('timer grace period and snooze do not affect the estimate calculation',()=>{
 assert.equal(Time.status(14*60000,10*60000).alarmDue,false);
 assert.equal(Time.status(15*60000,10*60000).phase,'overtime');
 assert.equal(Time.status(15*60000,10*60000).alarmDue,true);
 assert.equal(Time.status(24*60000,10*60000,25*60000).alarmDue,false);
 assert.equal(Time.status(25*60000,10*60000,25*60000).alarmDue,true);
 assert.equal(Time.status(25*60000,10*60000,0,true).alarmDue,false);
});
