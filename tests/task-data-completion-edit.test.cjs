const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/model.js');
const Data = require('../js/task-data.js');

function fixture(){
  const b=M.board();
  const t=M.task({id:'quest-one',title:'Original Quest',room:'kitchen'});
  b.tasks.push(t);
  b.features.wins.push({id:'win-one',taskId:t.id,rootId:t.id,title:'Original completion',room:t.room,at:'2026-11-14T13:25:00Z',minutes:12,measured:true,points:1,person:'First person',_actor:'actor-1',templateId:'template-1'});
  b.features.questTimings.push({id:'timing-1',taskId:t.id,kind:'valid',durationMs:720000,completionWinIds:['win-one']});
  return b;
}

test('completion correction preserves canonical and immutable historical fields',async()=>{
  const core=await import('../addons/tidyish-daily-log/core.mjs');
  const b=fixture(),before=M.clone(b),win=b.features.wins[0];
  Data.editCompletion(b,'win-one',{title:'Updated completion',person:'Second person',date:'2026-11-10'},core);
  assert.equal(win.title,'Updated completion');
  assert.equal(win.person,'Second person');
  for(const key of ['id','taskId','rootId','at','minutes','measured','points','_actor','templateId'])assert.deepEqual(win[key],before.features.wins[0][key]);
  assert.deepEqual(b.tasks,before.tasks);
  assert.deepEqual(b.features.questTimings,before.features.questTimings);
  assert.equal(b.features.dailyLogRecords.length,1);
  assert.equal(core.completionDate({schemaVersion:1,records:b.features.dailyLogRecords,rewashes:[]},win).date,'2026-11-10');
});

test('invalid corrections and missing/archived IDs make no changes',async()=>{
  const core=await import('../addons/tidyish-daily-log/core.mjs');
  const b=fixture();
  b.features.taskDataArchives.push({id:'archive-1',kind:'completion',count:3});
  const original=JSON.stringify(b);
  for(const values of [
    {title:'',person:'Someone',date:'2026-11-10'},
    {title:'Fine',person:'',date:'2026-11-10'},
    {title:'Fine',person:'Someone',date:'2026-02-30'}
  ])assert.throws(()=>Data.editCompletion(b,'win-one',values,core));
  assert.throws(()=>Data.editCompletion(b,'archive-1',{title:'Fine',person:'Someone',date:'2026-11-10'},core),/unavailable or archived/);
  assert.equal(JSON.stringify(b),original);
});

test('Task Data UI wires day navigation and record edits through one change',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
  for(const marker of ["['day','Day']",'data-day-prev','data-day-next','data-day-today','data-day-picker','data-edit-completion'])assert.ok(source.includes(marker),marker);
  assert.match(source,/change\(b=>TD\.editCompletion\(b,id,values,core\)\)/);
});
