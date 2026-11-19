'use strict';
// Offline renderer/static regression only. Does not test real layout or input acceptance.
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/doing-now-compact.css'),'utf8');
const start=app.indexOf('function doingTaskCard(t,pos=0){');
const end=app.indexOf('\nfunction doingChildren(',start);
assert.ok(start>=0&&end>start);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context={esc,openTasks:new Set(),D:{palette:p=>p%6},doingPositionStyle:()=>'',doingDetailed:false,dateLabel:()=> 'Date fixture',creatorLabel:()=> 'Creator fixture',doingChildren:()=>'<div class="fixture-child">Existing child</div>',phoneClock:'<svg class="phone-clock" aria-hidden="true"></svg>'};
context.button=vm.runInNewContext('('+app.match(/^const button=(.+);$/m)[1]+')',context);
const render=vm.runInNewContext('('+app.slice(start,end)+')',context);
const task={id:'task-1',title:'Tidy sofa',children:[],doing:true,assigned:'Anyone'};
const actions=markup=>Array.from(markup.matchAll(/data-action="([^"]+)"/g),m=>m[1]);
test('all existing Doing Now action handlers and IDs survive reparenting exactly once',()=>{
 const h=render(task);assert.deepEqual(actions(h),['select-task','expand','add-child','first','last','task-menu','timer','complete']);
 assert.equal((h.match(/data-id="task-1"/g)||[]).length,8);
 assert.match(h,/doing-task-center/);assert.match(h,/doing-task-title-row/);
 assert.match(h,/aria-pressed="true"/);assert.match(h,/aria-label="Remove from Doing Now: Tidy sofa"/);
 assert.match(h,/✓ I did a thing!/);
});
test('five options remain together in the centre, between the title and completion',()=>{
 const h=render(task);const a=h.indexOf('class="doing-task-actions"'); const b=h.indexOf('class="complete doing-complete"');
 assert.ok(h.indexOf('doing-task-title-row')<a&&a<b);assert.deepEqual(actions(h.slice(a,b)),['add-child','first','last','task-menu','timer']);
 assert.match(h,/aria-label="Add subtask to Tidy sofa"/);assert.match(h,/aria-label="Edit and actions for Tidy sofa"/);assert.match(h,/aria-label="Set phone alarm timer for Tidy sofa"/);
});
test('subtask count stays beside title, accessible, and completion label retained',()=>{
 const h=render({...task,children:[{done:true},{done:false},{done:false}]});assert.match(h,/class="doing-subtask-count" aria-label="1 of 3 subtasks complete">1\/3/);assert.match(h,/Done em all/);assert.ok(h.indexOf('doing-subtask-count')<h.indexOf('doing-task-actions'));
 assert.doesNotMatch(render(task),/doing-subtask-count/);
});
test('expanded children and detailed metadata remain after main controls, one per card',()=>{
 context.openTasks.add(task.id);context.doingDetailed=true;try{const h=render({...task,children:[{done:false}]});assert.match(h,/aria-expanded="true"/);assert.match(h,/Date fixture/);assert.match(h,/Creator fixture/);assert.equal((h.match(/fixture-child/g)||[]).length,1);assert.ok(h.indexOf('doing-complete')<h.indexOf('doing-meta')&&h.indexOf('doing-meta')<h.indexOf('fixture-child'));}finally{context.openTasks.clear();context.doingDetailed=false;}
});
test('unselected state, task IDs and special characters retain existing escaping',()=>{
 const h=render({...task,id:'a"b',title:'<b>&"',doing:false});assert.match(h,/I’m on it!|I'm on it!/);assert.match(h,/aria-pressed="false"/);assert.match(h,/&lt;b&gt;&amp;&quot;/);assert.match(h,/data-id="a&quot;b"/);assert.doesNotMatch(h,/<b>/);
});
test('style is scoped to Doing Now; five columns with 44px height and square completion',()=>{
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/height:44px;\s*min-height:44px;/);
 assert.match(css,/inset:5px 0;/);assert.match(css,/pointer-events:none/);
 assert.match(css,/aspect-ratio:1;/);assert.match(css,/--doing-complete-size:50px/);
 assert.match(css,/\.phone-clock\{width:18px;height:18px/);
 for(const m of css.matchAll(/(?:^|\n)\s*(#app[^\{]+)\{/g))for(const s of m[1].split(','))assert.match(s.trim(),/^#app \.doing-board \.task\.doing-task/);
});
test('new stylesheet follows tap-target stylesheet; app cache tag advances',()=>{
 const link='css/doing-now-compact.css?v=20261117-issue02a1-cardhotfix1';assert.equal(html.split(link).length,2);assert.ok(html.indexOf(link)>html.indexOf('css/mobile-tap-targets.css'));assert.ok(html.includes('js/app.js?v=20261115-task-data-daily-view1-issue02a1-layoutbundle1-management1-cardhotfix1-routines1-libraryheader1-occasionaltab1-interface1-timedcompletion1-subtasktimer1"'));
});
