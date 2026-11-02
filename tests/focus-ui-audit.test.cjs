const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js');
const Time=require('../js/quest-time-core.js');
globalThis.TidyQuestTime=Time;
const Q=require('../js/quest-focus.js');
globalThis.TidyQuestFocus=Q;
const DAY='2026-11-01';

function setup(){
 const board=M.board(),values=new Map(),dialogs=[];let counter=0;
 delete require.cache[require.resolve('../js/quest-focus-ui.js')];
 const UI=require('../js/quest-focus-ui.js');
 const api={board:()=>board,room:()=> 'kitchen',date:()=>DAY,notice:()=>{},render:()=>{},storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},memberId:()=> 'audit-member',makeId:()=>`audit-${++counter}`,dialog:(title,body)=>dialogs.push({title,body}),closeDialog:()=>{},editor:()=>({querySelector:()=>null,querySelectorAll:()=>[]}),returnTasks:()=>[],renderFocusTask:(task,pos,done)=>`<article class="task ordinary-focus-card ${done?'done':''}" data-focus-task-id="${task.id}">${task.title}</article>`,leave:()=>{},openFocus:()=>{}};
 UI.init(api);return {board,UI,dialogs};
}
const click=(UI,action,id='')=>UI.handle({dataset:{action,id,direction:'-1'}});

test('Clear the Way setup has Exit/title/add/Load and an All/None toggle',()=>{
 const {board,UI}=setup();UI.enter(board,'kitchen','clear');const html=UI.content(board);
 assert.match(html,/aria-label="Clear the Way controls"/);assert.match(html,/data-action="quest-exit"/);assert.match(html,/class="quest-title">Clear the Way/);
 assert.match(html,/aria-label="Add custom routine"/);assert.match(html,/data-action="quest-load-routine"/);assert.match(html,/data-action="quest-toggle-clear-defaults"/);
 const initial=UI.get().steps.length;click(UI,'quest-toggle-clear-defaults');assert.equal(UI.get().steps.length,7);click(UI,'quest-toggle-clear-defaults');assert.equal(UI.get().steps.length,0);click(UI,'quest-toggle-clear-defaults');assert.equal(UI.get().steps.length,7);assert.equal(initial,6);
});

test('running preparation uses Cleared and All Clear at the top and bottom',()=>{
 const {board,UI}=setup();UI.enter(board,'kitchen','clear');click(UI,'quest-begin-clear');const html=UI.content(board);
 assert.match(html,/data-action="quest-finish-clear"[^>]*>Cleared<\/button>/);assert.doesNotMatch(html,/Clear this/);
 assert.equal((html.match(/data-action="quest-clear-all"/g)||[]).length,2);assert.match(html,/aria-label="Add steps"/);
});

test('routine editor centres the editable title with matching Exit and Save controls',()=>{
 const {board,UI,dialogs}=setup();UI.enter(board,'kitchen','clear');click(UI,'quest-new-routine');const html=UI.content(board);
 assert.match(html,/quest-editor-header/);assert.match(html,/id="quest-routine-name"[^>]*placeholder="Tap To Rename"/);
 assert.equal((html.match(/data-action="quest-editor-exit"/g)||[]).length,2);assert.equal((html.match(/data-action="quest-save-options"/g)||[]).length,2);
 click(UI,'quest-save-options');assert.equal(dialogs.at(-1).title,'Save routine');assert.match(dialogs.at(-1).body,/Save for later/);assert.match(dialogs.at(-1).body,/Save and start/);assert.equal(UI.get().phase,'clear-choose');
});

test('Focus header groups controls on one row and only shows Reload for a saved selection',()=>{
 const {board,UI}=setup(),task=M.task({id:'focus-audit-quest',title:'Audit Quest',room:'kitchen'});board.tasks.push(task);UI.enter(board,'kitchen','focus');
 let html=UI.content(board);assert.match(html,/class="quest-picker-header"/);assert.match(html,/data-action="quest-plan"/);assert.match(html,/class="quest-title">Add Quests/);assert.doesNotMatch(html,/data-action="quest-reload"/);
 UI.pick(task.id);html=UI.content(board);assert.match(html,/data-action="quest-reload"/);assert.match(html,/data-action="quest-exit"/);assert.match(html,/data-action="quest-go"/);
 const header=html.match(/<nav class="quest-picker-header"[^>]*>(.*?)<\/nav>/)?.[1]||'';for(const action of ['quest-exit','quest-plan','quest-reload','quest-go'])assert.match(header,new RegExp(`data-action="${action}"`));assert.match(header,/Add Quests/);
 const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../css/quest-focus.css'),'utf8');assert.match(css,/\.quest-picker-header\{display:grid;grid-template-columns:/);
});

test('Room Focus offers Clear the Way or Skip before Quest selection',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 const ui=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/quest-focus-ui.js'),'utf8');
 assert.match(source,/function startRoomFocus\(/);
 assert.match(source,/dialog\('Room Focus',`<p>Start with Clear the Way, or skip to choose Quests\?/);
 assert.match(source,/focus:el=>startRoomFocus\(el\.dataset\.id\)/);
 assert.match(source,/focus-start-clearway'.*openClearWay\(el\.dataset\.id\)/);
 assert.match(source,/focus-skip-clearway'.*openQuestFocus\(el\.dataset\.id\)/);
 assert.doesNotMatch(ui,/showFocusIntro/);
});

test('active Focus uses ordinary task-card rendering, reorders privately and separates completions',()=>{
 const {board,UI}=setup(),tasks=['one','two','three'].map(id=>M.task({id:'focus-'+id,title:id,room:'kitchen'}));board.tasks.push(...tasks);UI.enter(board,'kitchen','focus');tasks.forEach(t=>UI.pick(t.id));click(UI,'quest-accepted');
 assert.deepEqual(UI.get().startedIds,tasks.map(t=>t.id));assert.equal(UI.moveFocus(tasks[1].id,-1),true);assert.deepEqual(UI.get().startedIds,[tasks[1].id,tasks[0].id,tasks[2].id]);assert.equal(UI.reorderFocus(tasks[2].id,tasks[1].id,false),true);assert.deepEqual(UI.get().startedIds,[tasks[2].id,tasks[1].id,tasks[0].id]);
 const html=UI.content(board);assert.match(html,/ordinary-focus-card/);
 tasks[1].done=true;const completed=UI.content(board);assert.match(completed,/quest-completed-section/);assert.ok(completed.indexOf('Completed')>completed.indexOf('three'));
 assert.deepEqual(board.tasks.map(t=>t.id),tasks.map(t=>t.id));
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');assert.match(source,/function focusTaskCard/);assert.match(source,/quest-focus-grip/);assert.match(source,/pointerdown/);assert.match(source,/childrenHtml\(t\)/);
});

test('app warns before leaving an unfinished Focus while preserving the saved session',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 assert.match(source,/Leave unfinished Focus\?/);assert.match(source,/unfinished Focus will be saved so you can continue later/);assert.match(source,/if\(!remaining\.length\)\{if\(unfinished\)/);
});

test('collected follow-ups are room-scoped for Room Focus, global for Doing Now, and category-first',()=>{
 const board=M.board(),records=[
  M.task({id:'other-room-sort',title:'Sort and put away collected bags or boxes',room:'bathroom',generatedFrom:'clear-way-session:other'}),
  M.task({id:'near-home-sort',title:'Put away items placed near their homes',room:'kitchen',generatedFrom:'clear-way-session:near'}),
  M.task({id:'ordinary-task',title:'Wipe the counter',room:'kitchen'}),
  M.task({id:'completed-sort',title:'Return completed items',room:'kitchen',done:true,generatedFrom:'clear-way-session:done'})
 ];board.tasks.push(...records);
 assert.deepEqual(Q.collectedTasks(board,'kitchen').map(t=>t.id),['near-home-sort']);
 assert.deepEqual(Q.collectedTasks(board,'kitchen',true).map(t=>t.id),['near-home-sort','other-room-sort']);
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');assert.match(source,/returnTasks:\(\)=>clearUnfinished\(Q\?\.get\(\)\?\.room\|\|roomId,Q\?\.get\(\)\?\.scope==='doing'\)/);assert.match(source,/remaining=clearUnfinished\(found,allRooms\)/);
});

test('optional Finish the Room has a scrollable floor area and shows repeatable floor actions',()=>{
 const {board,UI}=setup(),focus=M.task({id:'floor-focus-done',title:'Wipe shelf',room:'kitchen'}),floor=M.task({id:'floor-repeat',title:'Sweep stairs',room:'kitchen',littleOften:true,taskType:'little-often'});board.tasks.push(focus,floor);UI.enter(board,'kitchen','focus');UI.pick(focus.id);click(UI,'quest-accepted');focus.done=true;const html=UI.content(board);
 assert.match(html,/Finish the Room\? · optional/);assert.match(html,/<h4>Floors<\/h4><div class="tidy-utility-scroll">/);assert.match(html,/I did a thing!/);assert.match(html,/Finish for now/);
});

test('shared dialog and Focus tabs expose accessible names and selected state',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 const focus=fs.readFileSync(path.join(__dirname,'../js/quest-focus-ui.js'),'utf8');
 assert.match(html,/id="editor" aria-labelledby="dialog-title"/);
 assert.match(app,/<h2 id="dialog-title">/);
 assert.match(focus,/role="tab" aria-selected=/);
});

test('active Focus removes the old Options disclosure while keeping compact subtask actions',()=>{
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/function focusTaskCard\([\s\S]*?childrenHtml\(t,'',0,true\)/);
 assert.match(app,/const actions=compactFocus\s*\?button\('⋯','child-menu'/);
 assert.match(app,/'child-menu':el=>[\s\S]*button\('Task Data','data-open-task'/);
});
