const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/model.js');
const Data = require('../js/task-data.js');

const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/task-data-daily-view.css'), 'utf8');

function boardWithHistory(){
 const board = M.board();
 const quest = M.task({id:'daily-q',title:'Wipe worktop',room:'kitchen'});
 board.tasks.push(quest);
 board.features.wins.push(
  {id:'win-a',taskId:quest.id,rootId:quest.id,room:'kitchen',title:'Wipe worktop',person:'First',at:'2026-11-14T11:00:00Z',points:2,minutes:10},
  {id:'win-b',taskId:quest.id,rootId:quest.id,room:'kitchen',title:'Hoover floor',person:'Second',at:'2026-11-15T11:00:00Z',points:1,minutes:5}
 );
 board.features.questTimings.push({id:'time-a',taskId:quest.id,kind:'valid',durationMs:600000,completionWinIds:['win-a']});
 return board;
}

test('Task Data initially opens the dedicated daily screen, retaining other views',()=>{
 assert.match(app, /dataVisible=12,dataView='day',dataDay=M\.date\(\)/);
 for(const marker of ["['overview','Overview']","['day','Day']","['rooms','Rooms']","['quests','Tasks']","['focus','Focus & timers']","['daybook','Daily Log']"])
  assert.ok(app.includes(marker),marker);
 assert.match(app, /<h2>Daily view<\/h2>/);
 assert.match(app, /task-data-daily-view/);
});

test('Daily screen provides navigation and room filter, and preserves selected day when switching tabs',()=>{
 for(const action of ['data-day-prev','data-day-next','data-day-today','data-day-picker','data-room-filter','data-edit-completion'])assert.ok(app.includes(action),action);
 assert.match(app, /role="group" aria-label="Daily Task Data date navigation"/);
 assert.match(app, /type="date" aria-label="Task Data date"/);
 assert.match(app, /dataView=el\.dataset\.id;render\(\)/);
 assert.doesNotMatch(app, /if\(el\.dataset\.id==='day'&&dataView!=='day'\)dataDay=M\.date\(\)/);
 assert.match(css,/grid-template-areas:\s*"prev next" "date date" "today today"/);
 assert.match(css,/min-height:\s*44px/);
 assert.match(html,/css\/task-data-daily-view\.css/);
});

test('Completing an edit returns to the corrected daily date only after successful save',()=>{
 assert.match(app,/change\(b=>TD\.editCompletion\(b,id,values,core\)\)/);
 assert.match(app,/if\(route==='data'&&dataView==='day'&&dataDay!==String\(values\.date\)\)\{dataDay=String\(values\.date\);render\(\);\}/);
 assert.match(app,/closeDialog\(true\);render\(\)/);
 assert.match(app,/field\('Completed task title','title'/);
 assert.match(app,/field\('Completed by \(display name\)','person'/);
 assert.match(app,/field\('Completion date','date'/);
});

test('Editing historical date moves only that record to the selected day, preserving timings and points',async()=>{
 const core=await import('../addons/tidyish-daily-log/core.mjs');
 const board=boardWithHistory();
 const before=M.clone(board);
 const getProjected=()=>core.projectCompletionDates(board,core.normalizeState({schemaVersion:1,records:board.features.dailyLogRecords||[],rewashes:board.features.dailyLogRewashes||[]}));
 assert.deepEqual(Data.summarizeDay(getProjected(),{day:'2026-11-14'}).wins.map(x=>x.id),['win-a']);
 Data.editCompletion(board,'win-a',{title:'Changed title',person:'Updated member',date:'2026-11-15'},core);
 const view=getProjected();
 assert.equal(Data.summarizeDay(view,{day:'2026-11-14'}).count,0);
 assert.deepEqual(new Set(Data.summarizeDay(view,{day:'2026-11-15'}).wins.map(x=>x.id)),new Set(['win-a','win-b']));
 assert.deepEqual(new Set(Data.summarizeDay(view,{day:'2026-11-15'}).wins.map(x=>x.title+'|'+x.person)),new Set(['Hoover floor|Second','Changed title|Updated member']));
 assert.equal(board.features.wins[0].at,before.features.wins[0].at);
 assert.equal(board.features.wins[0].points,before.features.wins[0].points);
 assert.equal(board.features.wins[0].minutes,before.features.wins[0].minutes);
 assert.deepEqual(board.features.wins[1],before.features.wins[1]);
 assert.deepEqual(board.features.questTimings,before.features.questTimings);
 assert.deepEqual(board.tasks,before.tasks);
 assert.equal(Data.summarizeDay(view,{day:'2026-11-15'}).points,3);
});
