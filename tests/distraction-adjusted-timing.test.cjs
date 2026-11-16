const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/model.js');
const Time = require('../js/quest-time-core.js');
const Data = require('../js/task-data.js');
const MIN = 60000;
const at = n => `2026-10-${String(n).padStart(2,'0')}T12:00:00Z`;
const timing = (id, taskId, owner, kind, minutes, extras={}) => ({id,taskId,owner,kind,durationMs:minutes*MIN,at:at(10),...extras});

function fixture(){
 const b=M.board(),t=M.task({id:'distraction-task',title:'Synthetic Quest',room:'kitchen',estimate:20});
 M.add(b,t);return {b,t,owner:Time.ownerOf(b)};
}

test('known distraction minutes are strictly validated against raw elapsed duration',()=>{
 assert.deepEqual(Time.distraction(12*MIN,'4'),{distractionMinutes:4,workDurationMs:8*MIN});
 assert.deepEqual(Time.distraction(12*MIN,'0'),{distractionMinutes:0,workDurationMs:12*MIN});
 assert.deepEqual(Time.distraction(12*MIN,' '),{distractionMinutes:null,workDurationMs:null});
 assert.deepEqual(Time.distraction(12*MIN,null),{distractionMinutes:null,workDurationMs:null});
 assert.deepEqual(Time.distraction(12*MIN,'12'),{distractionMinutes:12,workDurationMs:0});
 for(const input of ['-1','12.1','not a number','Infinity','1e2'])assert.throws(()=>Time.distraction(12*MIN,input));
});

test('legacy and unquantified distracted attempts cannot change averages',()=>{
 const {b,t,owner}=fixture();
 b.features.questTimings.push(timing('old',t.id,owner,'distracted',120,{note:'Old history'}));
 b.features.questTimings.push(timing('blank',t.id,owner,'distracted',90));
 b.features.questTimings.push(timing('no-time',t.id,owner,'no-time',200));
 assert.equal(Time.average(b.features.questTimings,t.id,owner),null);
 assert.equal(Time.suggested(b,t),20);
 assert.equal(Data.perQuest(b,t.id,owner).validCount,0);
 assert.equal(Data.perQuest(b,t.id,owner).attemptCount,3);
 assert.equal(b.features.questTimings[0].note,'Old history');
});

test('recorded interruption learns net work time while preserving raw minutes and note',()=>{
 const {b,t,owner}=fixture();
 const adj=Time.distraction(12*MIN,'4');
 b.features.questTimings.push(timing('adjusted',t.id,owner,'distracted',12,{...adj,note:'Phone call'}));
 assert.equal(b.features.questTimings[0].durationMs,12*MIN);
 assert.equal(b.features.questTimings[0].distractionMinutes,4);
 assert.equal(b.features.questTimings[0].workDurationMs,8*MIN);
 assert.equal(Time.learningDuration(b.features.questTimings[0]),8*MIN);
 assert.equal(Time.average(b.features.questTimings,t.id,owner),8);
 assert.equal(Time.suggested(b,t),8);
 const d=Data.perQuest(b,t.id,owner);
 assert.deepEqual([d.fastestMs,d.slowestMs,d.averageMs,d.validCount,d.attemptCount],[8*MIN,8*MIN,8*MIN,1,1]);
 assert.equal(d.visibleAttempts[0].note,'Phone call');
});

test('legacy valid durations, adjusted interrupted durations and explicit exclusions coexist',()=>{
 const {b,t,owner}=fixture();
 b.features.questTimings.push(timing('valid',t.id,owner,'valid',6,{at:at(10)}));
 b.features.questTimings.push(timing('adjusted',t.id,owner,'distracted',12,{at:at(11),distractionMinutes:4,workDurationMs:8*MIN}));
 b.features.questTimings.push(timing('excluded',t.id,owner,'distracted',40,{at:at(12),distractionMinutes:1,excludedFromLearning:true}));
 b.features.questTimings.push(timing('other',t.id,'another owner','distracted',99,{at:at(13),distractionMinutes:1}));
 assert.equal(Data.perQuest(b,t.id,owner).validCount,3); // all household members; average remains owner-specific
 const weighted=Time.average(b.features.questTimings,t.id,owner);
 assert.equal(weighted,7.1);
 assert.equal(Data.perQuest(b,t.id,owner).averageMs,Math.round((8+.78*6)/(1+.78)*MIN));
 assert.equal(Time.average(b.features.questTimings,t.id,'another owner'),98);
});

test('invalid or contradictory adjusted records are ignored, not trusted from workDurationMs',()=>{
 const {b,t,owner}=fixture();
 for(const [i,extras] of [
  {distractionMinutes:-1,workDurationMs:MIN},
  {distractionMinutes:20,workDurationMs:MIN},
  {distractionMinutes:'4',workDurationMs:8*MIN},
  {workDurationMs:MIN},
  {distractionMinutes:12,workDurationMs:MIN}
 ].entries())b.features.questTimings.push(timing('invalid'+i,t.id,owner,'distracted',12,extras));
 assert.equal(Time.average(b.features.questTimings,t.id,owner),null);
 assert.equal(Data.perQuest(b,t.id,owner).validCount,0);
});

test('archive protects latest adjusted attempts and their speed extremes; no double-counting',()=>{
 const {b,t,owner}=fixture();
 for(let i=1;i<=12;i++)b.features.questTimings.push(timing('attempt'+i,t.id,owner,'distracted',15,{at:`2025-01-${String(i).padStart(2,'0')}T10:00:00Z`,distractionMinutes:i===1?14:i===2?0:5}));
 const before=Data.perQuest(b,t.id,owner),plan=Data.planArchive(b,t.id,'2026-01-01');
 assert.ok(!plan.removedAttempts.some(r=>r.id==='attempt1'));
 assert.ok(!plan.removedAttempts.some(r=>r.id==='attempt2'));
 assert.ok(!plan.removedAttempts.some(r=>r.id==='attempt12'));
 Data.applyArchive(b,plan);
 const after=Data.perQuest(b,t.id,owner);
 assert.equal(after.validCount,before.validCount);
 assert.equal(after.fastestMs,before.fastestMs);
 assert.equal(after.slowestMs,before.slowestMs);
 assert.equal(after.averageMs,before.averageMs);
 assert.equal(Time.average(b.features.questTimings,t.id,owner),10);
 const again=Data.planArchive(b,t.id,'2026-01-01');
 assert.equal(again.removedAttempts.length,0);
});

test('Undo removes a linked adjusted attempt without erasing earlier history',()=>{
 const {b,t,owner}=fixture();
 M.finish(b,t.id,true);
 let winIds=t._completionIds.slice();
 b.features.questTimings.push(timing('first',t.id,owner,'valid',7,{completionWinIds:winIds}));
 M.reactivate(b,t.id);
 M.finish(b,t.id,true);
 winIds=t._completionIds.slice();
 b.features.questTimings.push(timing('second',t.id,owner,'distracted',12,{distractionMinutes:4,workDurationMs:8*MIN,completionWinIds:winIds}));
 assert.equal(Time.average(b.features.questTimings,t.id,owner),7.4); // records share a timestamp in this fixture
 M.finish(b,t.id,false);
 assert.deepEqual(b.features.questTimings.map(x=>x.id),['first']);
 assert.equal(Time.average(b.features.questTimings,t.id,owner),7);
 assert.equal(b.features.wins.length,1);
});

test('UI has separate distraction form, confirm/back paths, raw history and manual exclusion',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 for(const marker of ['function distractionTimed(', 'quest-distraction-minutes','task-clock-distraction-back','data-final="1"', 'record.distractionMinutes=adjustment.distractionMinutes','record.workDurationMs=adjustment.workDurationMs','TIME.learningDuration(r)'])assert.ok(app.includes(marker),marker);
 assert.match(app,/kind==='distracted'&&el\.dataset\.final!=='1'/);
 assert.match(app,/TIME\.distraction\(M\.time\(item\),distractionRaw\)/);
 assert.match(app,/TIME\.valid\(r\)\?button\('Exclude from estimate'/);
});
