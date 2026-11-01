const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../js/model.js');
const Base=require('../js/base-schedule-95.js');
const Occ=require('../js/occasional.js');
const Library=require('../js/quest-library.js');
const Time=require('../js/quest-time-core.js');
const TaskData=require('../js/task-data.js');
globalThis.TidyQuestTime=Time;
const Focus=require('../js/quest-focus.js');

test('replacement catalogue carries the PDF estimates, cadence and task groups',()=>{
 assert.equal(Base.length,127);
 assert.equal(Base.find(x=>x.title==='Clean toilet').repeatDays,7);
 assert.equal(Base.find(x=>x.title==='Tumble dryer: clean internal filter').priority,1);
 assert.equal(Base.find(x=>x.title==='Wash or replace vacuum cleaner filters').conditionMode,'check');
 assert.ok(Base.some(x=>x.title==='Birthday planning (set a date for each person)'));
 assert.equal(Library.SUGGESTIONS.length,Base.length);
});

test('selected seasonal jobs keep exact annual dates and subtasks through completion',()=>{
 const b=M.board(),row=Base.find(x=>x.title==='Christmas is coming');
 assert.equal(Occ.addSelected(b,M,[row.id],new Date('2026-10-31T12:00:00Z')).added,1);
 const task=b.tasks[0];assert.equal(task.nextDue,'2026-11-24');assert.equal(task.seasonDay,24);assert.equal(task.children.length,4);
 Occ.complete(b,task.id,M,new Date('2026-11-26T12:00:00Z'));
 assert.equal(task.nextDue,'2027-11-24');assert.equal(b.features.wins.length,1);
 const cleanup=Base.find(x=>x.title==='Pack away Christmas decorations');
 const another=M.board();Occ.addSelected(another,M,[cleanup.id],new Date('2026-10-31T12:00:00Z'));
 assert.equal(another.tasks[0].nextDue,'2027-01-01');
});

test('library tasks feed the estimate calculator and Task Data history',()=>{
 const b=M.board(),choice=Library.SUGGESTIONS.find(x=>x.title==='Tidy and wipe down bath edge');
 const added=Library.addSuggestion(b,choice.id,M),task=b.tasks.find(x=>x.id===added.id);
 assert.equal(task.estimate,5);assert.equal(task.repeatMonths,1);assert.equal(Focus.estimate(task,b),5);
 const owner=Time.ownerOf(b);b.features.questTimings.push({id:'attempt-1',taskId:task.id,owner,kind:'valid',durationMs:18*60000,at:'2026-10-31T12:00:00Z'});
 assert.equal(Focus.estimate(task,b),18);
 b.features.wins.push({id:'win-1',taskId:task.id,rootId:task.id,title:task.title,room:task.room,at:'2026-10-31T12:00:00Z',minutes:18,points:1});
 const history=TaskData.summarize(b,{period:'all',now:new Date('2026-11-01T12:00:00Z')});
 assert.equal(history.count,1);assert.equal(history.minutes,18);
});

test('app loads the replacement catalogue before its library and the tracking/calculator modules before app code',()=>{
 const fs=require('node:fs'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.ok(html.indexOf('js/base-schedule-95.js')<html.indexOf('js/quest-library.js'));
 for(const script of ['js/task-data.js','js/quest-time-core.js','js/app.js'])assert.ok(html.includes(script));
 assert.ok(html.indexOf('js/task-data.js')<html.indexOf('js/app.js'));
 assert.ok(html.indexOf('js/quest-time-core.js')<html.indexOf('js/app.js'));
});
