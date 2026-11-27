const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js');
const Time=require('../js/quest-time-core.js');
globalThis.TidyQuestTime=Time;
const Q=require('../js/quest-focus.js');
globalThis.TidyQuestFocus=Q;
const DAY='2026-11-01';

function setup(now=Date.now(),options={}){
 const board=M.board(),values=new Map(),dialogs=[],completedReturns=[];let counter=0,leaveForLaterCalls=0;
 delete require.cache[require.resolve('../js/quest-focus-ui.js')];
 const UI=require('../js/quest-focus-ui.js');
 const api={board:()=>board,room:()=> 'kitchen',date:()=>DAY,notice:()=>{},render:()=>{},storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},memberId:()=> 'audit-member',makeId:()=>`audit-${++counter}`,dialog:(title,body)=>dialogs.push({title,body}),closeDialog:()=>{},editor:()=>({querySelector:()=>null,querySelectorAll:()=>[]}),returnTasks:()=>options.returnTasks||[],completeReturn:id=>completedReturns.push(id),roomOverview:(_board,_id,scope)=>`<p data-overview-scope="${scope}"></p>`,isTaskCompletionVisible:task=>M.isTaskCompletionVisible(board,task,now),taskCompletionTime:task=>M.taskCompletionTime(board,task),renderFocusTask:(task,pos,done)=>`<article class="task ordinary-focus-card ${done?'done':''}" data-focus-task-id="${task.id}">${task.title}</article>`,leave:()=>{},leaveForLater:()=>{leaveForLaterCalls++;},openFocus:()=>{}};
 UI.init(api);return {board,UI,dialogs,values,completedReturns,leaveForLaterCalls:()=>leaveForLaterCalls};
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

test('Focus picker follows the approved top and bottom controls and only shows Reload for a saved selection',()=>{
 const {board,UI,dialogs}=setup(),task=M.task({id:'focus-audit-quest',title:'Audit Quest',room:'kitchen'});board.tasks.push(task);UI.enter(board,'kitchen','focus');
 let html=UI.content(board);assert.match(html,/class="quest-picker-header"/);assert.match(html,/data-action="quest-plan"/);assert.match(html,/class="quest-title">Add Tasks/);assert.doesNotMatch(html,/data-action="quest-reload"/);
 UI.pick(task.id);html=UI.content(board);assert.match(html,/data-action="quest-reload"/);assert.match(html,/data-action="quest-exit"/);assert.match(html,/data-action="quest-go"/);
 const header=html.match(/<nav class="quest-picker-header"[^>]*>(.*?)<\/nav>/)?.[1]||'';for(const action of ['quest-exit','quest-add-task','quest-reload','quest-go'])assert.match(header,new RegExp(`data-action="${action}"`));assert.match(header,/Add Some Tasks/);assert.match(header,/Add Tasks/);assert.match(header,/Let&#39;s Get Tidy-ish/);assert.doesNotMatch(header,/Plan for me/);assert.match(html,/<div class="quest-picker-bottom">[\s\S]*?Plan for me[\s\S]*?Let&#39;s Get Tidy-ish/);
 click(UI,'quest-go');assert.equal(dialogs.at(-1).title,'Start Task?');assert.match(dialogs.at(-1).body,/Re-pick/);assert.match(dialogs.at(-1).body,/Task Accepted/);click(UI,'quest-repick');
 const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../css/quest-focus.css'),'utf8');assert.match(css,/\.quest-picker-header\{display:grid;grid-template-columns:/);
});

test('Focus picker shows Side Tasks directly above Future Tasks and searches both together without changing selection',()=>{
 const {board,UI}=setup(),main=M.task({id:'focus-search-main',title:'Clean the shelf',room:'kitchen',repeatDays:7,nextDue:DAY,priority:1}),side=M.task({id:'focus-search-side',title:'Sort side basket',room:'kitchen',side:true}),future=M.task({id:'focus-search-future',title:'Polish tomorrow',room:'kitchen',repeatDays:7,nextDue:'2026-12-01'});board.tasks.push(main,side,future);UI.enter(board,'kitchen','focus');UI.pick(main.id);UI.pick(side.id);
 const html=UI.content(board),sections=[...html.matchAll(/data-quest-section="([^"]+)"/g)].map(match=>match[1]);assert.deepEqual(sections,['mine','main','bonus','optional','side','future']);assert.match(html,/Side Tasks <small>1<\/small>/);assert.match(html,/Future Tasks <small>1<\/small>/);assert.match(html,/data-quest-select="focus-search-main"[^>]*checked/);assert.match(html,/data-quest-select="focus-search-side"[^>]*checked/);assert.doesNotMatch(html,/data-action="quest-tab"|role="tablist"/);
 const controls=html.match(/<div class="quest-search-wrap">([\s\S]*?)<\/div>/)?.[1]||'';assert.match(controls,/<label[^>]*>Search<\/label>[\s\S]*?<input[^>]*id="quest-search"[\s\S]*?<button[^>]*quest-clear-search[\s\S]*?<button[^>]*quest-search-voice/);
 const rows=[{dataset:{searchText:'clean shelf kitchen'},hidden:false},{dataset:{searchText:'sort side basket kitchen'},hidden:false}],details=sections.map(id=>({dataset:{questSection:id},open:false})),empty={hidden:true},body={querySelectorAll(selector){return selector==='[data-quest-row]'?rows:details;}},previous=global.document;
 global.document={querySelector(selector){return selector==='#quest-categories'?body:selector==='#quest-search-empty'?empty:null;}};
 try{UI.input({target:{id:'quest-search',value:'side'}});assert.equal(rows[0].hidden,true);assert.equal(rows[1].hidden,false);assert.ok(details.every(section=>section.open));assert.deepEqual(UI.get().questIds,[main.id,side.id]);assert.equal(empty.hidden,true);}finally{global.document=previous;}
 const css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../css/quest-focus.css'),'utf8');assert.match(css,/\.quest-search-clear\{position:static/);assert.match(css,/\.quest-search-wrap \.quest-search-mic\{flex:none;min-width:44px;min-height:44px/);
});

test('Room Focus offers Clear the Way or Skip before task selection',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 const ui=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/quest-focus-ui.js'),'utf8');
 assert.match(source,/function startRoomFocus\(/);
 assert.match(source,/dialog\('Room Focus',`<p>Start with Clear the Way, or skip to choose tasks\?/);
 assert.match(source,/focus:el=>startRoomFocus\(el\.dataset\.id\)/);
 assert.match(source,/focus-start-clearway'.*openClearWay\(el\.dataset\.id\)/);
 assert.match(source,/focus-skip-clearway'.*openQuestFocus\(el\.dataset\.id\)/);
 assert.doesNotMatch(ui,/showFocusIntro/);
});

test('Start new Room Focus from a saved active session offers Clear the Way and a visible Skip',()=>{
 const {board,UI,dialogs}=setup(),task=M.task({id:'focus-clearway-prev',title:'Keep this room task',room:'kitchen',doing:true});board.tasks.push(task);
 UI.enter(board,'kitchen','focus');UI.pick(task.id);click(UI,'quest-accepted');
 assert.equal(UI.get().phase,'active');
 UI.enter(board,'kitchen','focus');
 assert.equal(dialogs.at(-1).title,'Previous Focus found');
 const before=dialogs.length;
 click(UI,'quest-fresh-overwrite');
 assert.equal(dialogs.length,before+1);
 assert.equal(dialogs.at(-1).title,'Room Focus');
 assert.match(dialogs.at(-1).body,/Start with Clear the Way, or skip to choose tasks\?/);
 assert.match(dialogs.at(-1).body,/data-action="focus-start-clearway" data-id="kitchen"[^>]*>Clear the Way<\/button>/);
 assert.match(dialogs.at(-1).body,/data-action="focus-skip-clearway" data-id="kitchen"[^>]*>Skip<\/button>/);
 assert.equal(UI.get().phase,'pick');
 assert.deepEqual(UI.get().startedIds,[]);
 assert.deepEqual(UI.get().questIds,[]);
 assert.equal(board.tasks[0],task);
 assert.equal(task.doing,true);
 // App's existing Skip route calls openQuestFocus(), which reloads this fresh session.
 UI.enter(board,'kitchen','focus');
 assert.equal(dialogs.length,before+1,'Skip must not trigger another previous-session prompt');
 assert.equal(UI.get().phase,'pick');
 // App's existing Clear the Way route calls openClearWay() without changing room tasks.
 UI.enter(board,'kitchen','clear');
 assert.equal(UI.get().phase,'clear-choose');
 assert.equal(board.tasks[0],task);
});

test('Resume and Edit keep their existing saved Focus behaviour',()=>{
 const {board,UI,dialogs}=setup(),task=M.task({id:'focus-saved-resume',title:'Original Focus task',room:'kitchen'});board.tasks.push(task);
 UI.enter(board,'kitchen','focus');UI.pick(task.id);click(UI,'quest-accepted');
 UI.enter(board,'kitchen','focus');
 const before=dialogs.length;
 click(UI,'quest-fresh-load');
 assert.equal(dialogs.length,before,'Resume must not display a new-session prompt');
 assert.equal(UI.get().phase,'active');
 assert.deepEqual(UI.get().startedIds,[task.id]);
 UI.enter(board,'kitchen','focus');
 const after=dialogs.length;
 click(UI,'quest-fresh-change');
 assert.equal(dialogs.length,after,'Change tasks must not display a new-session prompt');
 assert.equal(UI.get().phase,'pick');
 assert.deepEqual(UI.get().questIds,[task.id]);
});

test('resume summary names a current task only when its timer is recorded and follows saved order',()=>{
 const {board,UI,dialogs}=setup(),current=M.task({id:'focus-summary-current',title:'Kitchen reset',room:'kitchen'}),next=M.task({id:'focus-summary-next',title:'Vacuum floor',room:'kitchen'});
 current.children.push({id:'focus-summary-child',title:'Wipe behind toaster',startedAt:0,done:false});board.tasks.push(current,next);
 UI.enter(board,'kitchen','focus');UI.pick(current.id);UI.pick(next.id);click(UI,'quest-accepted');UI.enter(board,'kitchen','focus');
 assert.match(dialogs.at(-1).body,/Your saved Focus is ready/);assert.doesNotMatch(dialogs.at(-1).body,/You were doing/);
 current.children[0].startedAt=Date.now();UI.enter(board,'kitchen','focus');
 assert.match(dialogs.at(-1).body,/You were doing <strong>Kitchen reset · Wipe behind toaster<\/strong>; next: <strong>Vacuum floor<\/strong>/);
});

test('Leave for later preserves saved Focus and returns through the app callback',()=>{
 const {board,UI,dialogs,values,leaveForLaterCalls}=setup(),task=M.task({id:'focus-leave-later',title:'Fold laundry',room:'kitchen'});board.tasks.push(task);
 UI.enter(board,'kitchen','focus');UI.pick(task.id);click(UI,'quest-accepted');UI.enter(board,'kitchen','focus');
 assert.match(dialogs.at(-1).body,/data-action="quest-leave-later"[^>]*>Leave for later<\/button>/);
 const savedBefore=[...values.entries()];click(UI,'quest-leave-later');
 assert.equal(leaveForLaterCalls(),1);assert.deepEqual([...values.entries()],savedBefore);assert.equal(UI.get().phase,'active');
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');assert.match(app,/leaveForLater:\(\)=>\{const current=Q\?\.get\(\);navigate\(current\?\.scope==='doing'\?'doing':'room',current\?\.room\|\|roomId\);\}/);
});

test('Start new Doing Now Focus does not offer a room-only Clear the Way prompt',()=>{
 const {board,UI,dialogs}=setup(),task=M.task({id:'focus-doing-saved',title:'Doing task',room:'kitchen',doing:true});board.tasks.push(task);
 UI.enter(board,'kitchen','focus','doing');UI.pick(task.id);click(UI,'quest-accepted');
 UI.enter(board,'kitchen','focus','doing');
 assert.equal(dialogs.at(-1).title,'Previous Focus found');
 const before=dialogs.length;
 click(UI,'quest-fresh-overwrite');
 assert.equal(dialogs.length,before);
 assert.equal(UI.get().phase,'pick');
 assert.deepEqual(UI.get().startedIds,[]);
});

test('Restarting an unfinished Clear the Way routine keeps the original routine flow',()=>{
 const {board,UI,dialogs}=setup();
 UI.enter(board,'kitchen','clear');click(UI,'quest-begin-clear');
 assert.equal(UI.get().phase,'clear-active');
 UI.enter(board,'kitchen','clear');
 assert.equal(dialogs.at(-1).title,'Previous Focus found');
 const before=dialogs.length;
 click(UI,'quest-fresh-overwrite');
 assert.equal(dialogs.length,before,'Clear the Way restart must not show Room Focus prompt');
 assert.equal(UI.get().phase,'clear-choose');
 assert.ok(UI.get().steps.length>0);
});

test('resuming Focus lists saved tasks and changing selection replaces only Focus membership',()=>{
 const {board,UI,dialogs}=setup(),oldTask=M.task({id:'focus-old',title:'Existing task',room:'kitchen',doing:true}),newTask=M.task({id:'focus-new',title:'New task',room:'kitchen'});board.tasks.push(oldTask,newTask);
 UI.enter(board,'kitchen','focus');UI.pick(oldTask.id);click(UI,'quest-go');click(UI,'quest-accepted');UI.enter(board,'kitchen','focus');
 assert.match(dialogs.at(-1).body,/Existing task/);assert.match(dialogs.at(-1).body,/>Edit<\/button>/);assert.match(dialogs.at(-1).body,/Resume Focus/);
 click(UI,'quest-fresh-change');assert.equal(UI.get().phase,'pick');assert.deepEqual(UI.get().questIds,[oldTask.id]);
 UI.change({target:{dataset:{questSelect:oldTask.id}}});UI.change({target:{dataset:{questSelect:newTask.id}}});click(UI,'quest-go');click(UI,'quest-accepted');
 assert.deepEqual(UI.get().startedIds,[newTask.id]);assert.equal(oldTask.doing,true);assert.equal(board.tasks.length,2);
});

test('adding tasks keeps existing Focus tasks, progress, and timer state',()=>{
 const {board,UI}=setup(),current=M.task({id:'focus-add-current',title:'Current task',room:'kitchen',doing:true}),next=M.task({id:'focus-add-next',title:'Another task',room:'kitchen'});
 current.children.push({id:'focus-add-child',title:'Wipe behind toaster',done:false,startedAt:1234});board.tasks.push(current,next);
 UI.enter(board,'kitchen','focus');UI.pick(current.id);click(UI,'quest-accepted');click(UI,'quest-add-more');
 assert.equal(UI.get().phase,'pick');assert.deepEqual(UI.get().questIds,[current.id]);
 UI.pick(next.id);click(UI,'quest-accepted');
 assert.deepEqual(UI.get().startedIds,[current.id,next.id]);assert.equal(current.children[0].startedAt,1234);assert.equal(current.doing,true);
});

test('Room and Doing Now overview toggles preserve Focus progress and timers',()=>{
 for(const scope of ['room','doing']){
  const {board,UI,values,dialogs}=setup(),current=M.task({id:`focus-overview-${scope}`,title:'Current task',room:'kitchen',doing:true}),other=M.task({id:`focus-overview-other-${scope}`,title:'Other room task',room:'bathroom',doing:true});
  current.children.push({id:`focus-overview-child-${scope}`,title:'Timed subtask',done:false,startedAt:4321});board.tasks.push(current,other);
  UI.enter(board,'kitchen','focus',scope);UI.pick(current.id);click(UI,'quest-accepted');
  const savedSession=JSON.stringify(UI.get()),savedStorage=[...values.entries()],savedDialogs=dialogs.length;
  click(UI,'quest-overview');assert.match(UI.content(board),new RegExp(`data-overview-scope="${scope}"`));
  assert.equal(JSON.stringify(UI.get()),savedSession);assert.deepEqual([...values.entries()],savedStorage);assert.equal(current.children[0].startedAt,4321);assert.equal(dialogs.length,savedDialogs);
  click(UI,'quest-return-focus');assert.match(UI.content(board),/quest-active-bottom/);assert.equal(JSON.stringify(UI.get()),savedSession);assert.deepEqual([...values.entries()],savedStorage);
 }
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/const list=CQ\?\.doingEligible\(board,M\.date\(\)\)\|\|M\.doing\(board\),groups=\[\.\.\.new Set\(list\.map\(t=>t\.room\|\|'\'\)\)\]/);
});

test('each Returned control targets one item and Return Later keeps unfinished items active',()=>{
 const returns=[{id:'collected-one',title:'Put books away'},{id:'collected-two',title:'Sort craft box'}],{board,UI,completedReturns}=setup(Date.now(),{returnTasks:returns}),focused=M.task({id:'focus-return-done',title:'Finished Focus task',room:'kitchen'});board.tasks.push(focused);
 UI.enter(board,'kitchen','focus');UI.pick(focused.id);click(UI,'quest-accepted');focused.done=true;
 const html=UI.content(board);assert.match(html,/data-action="quest-return-complete" data-id="collected-one"/);assert.match(html,/data-action="quest-return-complete" data-id="collected-two"/);
 click(UI,'quest-return-complete','collected-two');assert.deepEqual(completedReturns,['collected-two']);assert.deepEqual(UI.get().startedIds,[focused.id]);
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/button\('Returned','clear-return-complete',t\.id/);assert.match(app,/function completeCollectedReturn\(id\)[\s\S]*?M\.finish\(b,id,true\)/);
 assert.match(app,/clear-return-complete':el=>\{closeDialog\(true\);if\(!completeCollectedReturn\(el\.dataset\.id\)\)/);
 assert.match(app,/clear-return-later':\(\)=>\{const current=Q\?\.get\(\),destination=current\?\.scope==='doing'\?'doing':'room';closeDialog\(true\);navigate\(destination,current\?\.room\|\|roomId\);notice\('Return and sorting Tasks remain active for later\.'\);\}/);
});

test('a Focus task can be removed from the session without changing the task',()=>{
 const {board,UI}=setup(),task=M.task({id:'focus-remove',title:'Keep in room',room:'kitchen',doing:true});board.tasks.push(task);
 UI.enter(board,'kitchen','focus');UI.pick(task.id);click(UI,'quest-go');click(UI,'quest-accepted');click(UI,'quest-remove-focus',task.id);
 assert.deepEqual(UI.get().startedIds,[]);assert.equal(board.tasks[0],task);assert.equal(task.doing,true);
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');assert.match(app,/button\('Remove','quest-remove-focus',t\.id/);
});

test('active Focus uses ordinary task-card rendering, reorders privately and separates completions',()=>{
 const {board,UI}=setup(),tasks=['one','two','three'].map(id=>M.task({id:'focus-'+id,title:id,room:'kitchen'}));board.tasks.push(...tasks);UI.enter(board,'kitchen','focus');tasks.forEach(t=>UI.pick(t.id));click(UI,'quest-accepted');
 assert.deepEqual(UI.get().startedIds,tasks.map(t=>t.id));assert.equal(UI.moveFocus(tasks[1].id,-1),true);assert.deepEqual(UI.get().startedIds,[tasks[1].id,tasks[0].id,tasks[2].id]);assert.equal(UI.reorderFocus(tasks[2].id,tasks[1].id,false),true);assert.deepEqual(UI.get().startedIds,[tasks[2].id,tasks[1].id,tasks[0].id]);
 const html=UI.content(board);assert.match(html,/ordinary-focus-card/);
 tasks[1].done=true;tasks[1].completedAt=new Date().toISOString();const completed=UI.content(board);assert.match(completed,/quest-completed-section/);assert.ok(completed.indexOf('Completed')>completed.indexOf('three'));
 assert.deepEqual(board.tasks.map(t=>t.id),tasks.map(t=>t.id));
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');assert.match(source,/function focusTaskCard/);assert.match(source,/quest-focus-grip/);assert.match(source,/pointerdown/);assert.match(source,/childrenHtml\(t\)/);
});

test('Focus hides tasks after the next-day 3am clear and sorts recent completions newest first',()=>{
 const now=new Date(2026,11,1,4).getTime(),{board,UI}=setup(now),tasks=[
  M.task({id:'focus-expired',title:'Expired completion',room:'kitchen'}),
  M.task({id:'focus-earlier',title:'Earlier completion',room:'kitchen'}),
  M.task({id:'focus-latest',title:'Latest completion',room:'kitchen'})
 ];board.tasks.push(...tasks);UI.enter(board,'kitchen','focus');tasks.forEach(task=>UI.pick(task.id));click(UI,'quest-accepted');
 tasks[0].done=true;tasks[0].completedAt=new Date(2026,10,30,2).toISOString();
 tasks[1].done=true;tasks[1].completedAt=new Date(2026,11,1,0).toISOString();
 tasks[2].done=true;tasks[2].completedAt=new Date(2026,11,1,1).toISOString();
 const html=UI.content(board);assert.doesNotMatch(html,/Expired completion/);assert.ok(html.indexOf('Latest completion')<html.indexOf('Earlier completion'));
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

test('shared dialog and Focus selection controls expose accessible names',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 const focus=fs.readFileSync(path.join(__dirname,'../js/quest-focus-ui.js'),'utf8');
 assert.match(html,/id="editor" aria-labelledby="dialog-title"/);
 assert.match(app,/<h2 id="dialog-title">/);
 assert.match(focus,/aria-label="Focus task selection controls"/);
 assert.match(focus,/aria-label="Clear search"/);
 assert.match(focus,/aria-label="Search by voice"/);
 assert.doesNotMatch(focus,/data-action="quest-tab"|role="tablist"/);
});

test('Focus assets use refreshed cache versions',()=>{
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 assert.match(html,/css\/quest-focus\.css\?v=20261126-focus-task-selection1-focusnav1"/);
 assert.match(html,/js\/quest-focus-ui\.js\?v=20261126-focus-task-selection1-focusresume1-focusnav1"/);
 assert.match(html,/js\/app\.js\?v=[^"]+-taskcardart1-focusresume1-focusnav1-timeralarmfix1-focusbreak2-elapsedentry1-doingcollapse1-seasonalhomecomplete1"/);
});

test('active Focus removes the old Options disclosure while keeping compact subtask actions',()=>{
 const app=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/function focusTaskCard\([\s\S]*?childrenHtml\(t,'',0,true\)/);
 assert.match(app,/const actions=compactFocus\s*\?button\('⋯','child-menu'/);
 assert.match(app,/'child-menu':el=>[\s\S]*button\('Task Data','data-open-task'/);
});
