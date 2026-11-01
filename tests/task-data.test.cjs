const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js');
const Time=require('../js/quest-time-core.js');
const Data=require('../js/task-data.js');
const Share=require('../js/sharing-model.js');
const date=n=>`2025-01-${String(n).padStart(2,'0')}T10:00:00Z`;
function taskBoard(){const b=M.board(),t=M.task({id:'quest-a',title:'Wipe surfaces',room:'kitchen'});M.add(b,t);return {b,t};}

test('Task Data reports unknown instead of fabricated zero values',()=>{
 const {b,t}=taskBoard(),d=Data.perQuest(b,t.id,Time.ownerOf(b));
 assert.equal(d.count,0);assert.equal(d.lastDone,null);assert.equal(d.fastestMs,null);assert.equal(d.slowestMs,null);assert.equal(d.averageMs,null);assert.equal(d.validCount,0);assert.deepEqual(b.features.wins,[]);
});

test('per-Quest history keeps personal timing separate and retains note/exclusion records',()=>{
 const {b,t}=taskBoard(),owner=Time.ownerOf(b);
 b.features.wins.push({id:'win-a',taskId:t.id,rootId:t.id,title:t.title,room:t.room,at:date(10),person:'Kayleigh',points:1});
 b.features.questTimings.push(
  {id:'valid-fast',taskId:t.id,owner,kind:'valid',durationMs:60000,at:date(1)},
  {id:'valid-excluded',taskId:t.id,owner,kind:'valid',durationMs:180000,excludedFromLearning:true,at:date(2),note:'Interrupted'},
  {id:'distracted',taskId:t.id,owner,kind:'distracted',durationMs:240000,note:'Doorbell',at:date(3)},
  {id:'other-member',taskId:t.id,owner:'another-member',kind:'valid',durationMs:300000,at:date(4)});
 const before=JSON.stringify(b),d=Data.perQuest(b,t.id,owner);
 assert.equal(d.count,1);assert.equal(d.lastDone,date(10));assert.equal(d.fastestMs,60000);assert.equal(d.slowestMs,60000);assert.equal(d.averageMs,60000);assert.equal(d.validCount,2);
 assert.ok(d.visibleAttempts.some(r=>r.id==='valid-excluded'));assert.ok(d.visibleAttempts.some(r=>r.id==='distracted'&&r.note==='Doorbell'));
 assert.equal(JSON.stringify(b),before);
});

test('confirmed archive plan is read-only and preserves completion totals and the estimate basis',()=>{
 const {b,t}=taskBoard(),owner=Time.ownerOf(b);
 for(let i=1;i<=15;i++)b.features.wins.push({id:`win-${i}`,taskId:t.id,rootId:t.id,title:t.title,room:t.room,at:date(i),person:'Kayleigh',points:1});
 for(let i=1;i<=10;i++)b.features.questTimings.push({id:`valid-${i}`,taskId:t.id,owner,kind:'valid',durationMs:i*60000,at:date(i)});
 b.features.questTimings.push({id:'note',taskId:t.id,owner,kind:'distracted',durationMs:90000,note:'Keep note',at:date(2)});
 b.features.questTimings.push({id:'no-time',taskId:t.id,owner,kind:'no-time',durationMs:0,at:date(2)});
 const before=JSON.stringify(b),beforeData=Data.perQuest(b,t.id,owner),beforeAverage=Time.average(b.features.questTimings,t.id,owner),plan=Data.planArchive(b,t.id,'2026-01-01');
 assert.equal(JSON.stringify(b),before);assert.equal(plan.removedWins.length,14);assert.equal(plan.removedAttempts.length,2);
 const result=Data.applyArchive(b,plan),after=Data.perQuest(b,t.id,owner);
 assert.deepEqual(result,{winsRemoved:14,attemptsRemoved:2,pointsPreserved:14});
 assert.equal(after.count,beforeData.count);assert.equal(after.points,beforeData.points);assert.equal(after.lastDone,beforeData.lastDone);
 assert.equal(after.fastestMs,beforeData.fastestMs);assert.equal(after.slowestMs,beforeData.slowestMs);assert.equal(after.averageMs,beforeData.averageMs);assert.equal(Time.average(b.features.questTimings,t.id,owner),beforeAverage);
 assert.equal(after.validCount,10);assert.equal(after.attemptCount,12);assert.equal(b.features.wins.length,1);
 assert.ok(b.features.questTimings.some(r=>r.id==='note'));assert.ok(b.features.questTimings.some(r=>r.id==='valid-1'));
 assert.equal(after.olderWinPeriods.reduce((n,r)=>n+r.count,0),14);assert.equal(after.olderAttemptPeriods.reduce((n,r)=>n+r.count,0),2);
 assert.ok(after.visibleAttempts.some(r=>r.id==='note'));assert.equal(Data.summarize(b,{period:'all',now:new Date('2026-11-01T12:00:00Z')}).count,15);
 assert.equal(Data.summarize(b,{period:'all',now:new Date('2026-11-01T12:00:00Z')}).points,15);
 const normalized=M.normalize(b);assert.equal(normalized.features.taskDataArchives.length,b.features.taskDataArchives.length);
});

test('timed completion Undo removes its linked attempt and estimate exactly once',()=>{
 const {b,t}=taskBoard(),owner=Time.ownerOf(b);M.finish(b,t.id,true);
 const completionWinIds=t._completionIds.slice();b.features.questTimings.push({id:'timed-win',taskId:t.id,owner,kind:'valid',durationMs:120000,at:date(4),completionWinIds});
 assert.equal(Data.perQuest(b,t.id,owner).count,1);assert.equal(Time.average(b.features.questTimings,t.id,owner),2);
 M.finish(b,t.id,false);
 assert.equal(Data.perQuest(b,t.id,owner).count,0);assert.equal(Time.average(b.features.questTimings,t.id,owner),null);assert.equal(b.features.questTimings.length,0);
});

test('household sharing and board merge preserve Task Data archive summaries',()=>{
 const {b,t}=taskBoard();b.features.taskDataArchives.push({id:'archive-1',kind:'completion',taskId:t.id,rootId:t.id,title:t.title,room:t.room,period:'2025-01',count:4,points:4,minutes:0});
 const blank={tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]};
 const shared=Share.project(b,blank,'household'),back=Share.importRaw(shared);
 assert.deepEqual(back.features.taskDataArchives,b.features.taskDataArchives);
 assert.deepEqual(M.merge(M.board(),b).features.taskDataArchives,b.features.taskDataArchives);
});

test('slowest valid attempt stays visible and survives old-detail archiving',()=>{
 const {b,t}=taskBoard(),owner=Time.ownerOf(b);
 for(let i=1;i<=15;i++)b.features.questTimings.push({id:`attempt-${i}`,taskId:t.id,owner,kind:'valid',durationMs:i===1?900000:i===2?60000:120000+i,at:date(i)});
 const before=Data.perQuest(b,t.id,owner);assert.equal(before.slowestMs,900000);assert.ok(before.visibleAttempts.some(r=>r.id==='attempt-1'));
 const plan=Data.planArchive(b,t.id,'2026-01-01');assert.ok(plan.removedAttempts.some(r=>r.id==='attempt-1')===false);
 Data.applyArchive(b,plan);const after=Data.perQuest(b,t.id,owner);assert.equal(after.slowestMs,900000);assert.ok(after.visibleAttempts.some(r=>r.id==='attempt-1'));
});
