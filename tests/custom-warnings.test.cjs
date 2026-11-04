const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../js/model.js');
const W=require('../js/custom-warnings.js');
const Share=require('../js/sharing-model.js');

test('custom warning task follows due and escalation dates with distinct Home icons',()=>{
 const task=M.task({id:'cat-tree',title:'Trim cat tree',warningEnabled:true,warningFirstDue:'2026-11-10',warningRepeatDays:14});
 assert.equal(W.status(task,'2026-11-09').state,'green');
 assert.equal(W.status(task,'2026-11-10').state,'blue');
 assert.equal(W.status(task,'2026-11-11').state,'orange');
 assert.equal(W.status(task,'2026-11-12').state,'red');
 assert.equal(W.status(task,'2026-11-13').state,'flashing');
 assert.equal(W.taskIcon(task),'🐈');
 assert.equal(W.taskIcon(M.task({title:'Polish shelves'})),'🔔');
 const rows=W.list({tasks:[task,M.task({id:'not-warning',title:'Wipe table'}),M.task({id:'due-fish',title:'Top up fish tank',warningEnabled:true,warningFirstDue:'2026-11-10'})]},'2026-11-10');
 assert.deepEqual(rows.map(x=>x.task.id),['due-fish','cat-tree']);
});

test('custom warning escalation can be edited independently per task',()=>{
 const task=M.task({warningEnabled:true,warningFirstDue:'2026-11-10',warningAmberDays:2,warningRedDays:4,warningFlashingDays:6});
 assert.equal(W.status(task,'2026-11-11').state,'blue');
 assert.equal(W.status(task,'2026-11-12').state,'orange');
 assert.equal(W.status(task,'2026-11-14').state,'red');
 assert.equal(W.status(task,'2026-11-16').state,'flashing');
});

test('completion clears a one-off warning and undo restores its due state',()=>{
 const b=M.board(),t=M.task({id:'one-off',title:'Clean extractor fan',warningEnabled:true,warningFirstDue:M.date(),warningRepeatDays:0});M.add(b,t);
 assert.notEqual(W.status(t,M.date()).state,'green');
 M.finish(b,t.id,true);assert.equal(W.status(t,M.date()).state,'green');assert.equal(W.status(t,M.date()).label,'Completed');
 M.finish(b,t.id,false);assert.equal(W.status(t,M.date()).state,'blue');assert.equal(t.warningLastCompletedAt,'');
});

test('a completed one-off warning stays clear until a new due date is set',()=>{
 const b=M.board(),t=M.task({id:'one-off-reset',title:'Clean fan',warningEnabled:true,warningFirstDue:M.date(),warningRepeatDays:0});M.add(b,t);M.finish(b,t.id,true);
 const nextDate=M.plus(M.date(),10);t.warningFirstDue=nextDate;t.warningLastCompletedAt='';M.refresh(b,nextDate);
 assert.equal(t.done,false);assert.equal(W.status(t,nextDate).state,'blue');assert.equal(b.features.wins.length,1);
});

test('repeat warning restarts from completion and reopens the task on its next due date',()=>{
 const b=M.board(),t=M.task({id:'pet-care',title:'Refresh tank water',warningEnabled:true,warningFirstDue:M.date(),warningRepeatDays:7});M.add(b,t);
 M.finish(b,t.id,true);const due=t.warningNextDue,last=t.warningLastCompletedAt;
 assert.equal(due,M.plus(M.date(),7));assert.equal(W.status(t,M.date()).state,'green');
 M.refresh(b,due);assert.equal(t.done,false);assert.equal(W.status(t,due).state,'blue');
 assert.equal(b.features.wins.length,1);assert.equal(t.warningLastCompletedAt,last);
});

test('one-off task warning repeats after its chosen interval and clears on completion',()=>{
 const b=M.board(),t=M.task({id:'one-off-repeat',title:'Clean extractor fan',oneOff:true,warningEnabled:true,warningFirstDue:M.date(),warningRepeatDays:30});M.add(b,t);
 M.finish(b,t.id,true);const due=t.warningNextDue;
 assert.equal(due,M.plus(M.date(),30));assert.equal(W.status(t,M.date()).state,'green');
 M.refresh(b,due);assert.equal(t.done,false);assert.equal(W.status(t,due).state,'blue');
 assert.equal(b.features.wins.length,1);
});

test('repeat warning can reopen a Side Quest without deleting its earlier completion',()=>{
 const b=M.board(),t=M.task({id:'side-care',title:'Clean pet carrier',side:true,done:true,warningEnabled:true,warningFirstDue:'2026-11-01',warningRepeatDays:7,warningLastCompletedAt:'2026-11-01T10:00:00.000Z',warningNextDue:'2026-11-08'});M.add(b,t);b.features.wins.push({id:'prior-side-win',taskId:t.id,title:t.title,at:t.warningLastCompletedAt,points:1});
 M.refresh(b,'2026-11-08');assert.equal(t.done,false);assert.equal(b.features.wins.length,1);assert.equal(W.status(t,'2026-11-08').state,'blue');
});

test('warning settings and completion reset survive household projection and import',()=>{
 const b=M.board(),t=M.task({id:'plant-care',title:'Water plants',room:'living',warningEnabled:true,warningFirstDue:'2026-11-10',warningRepeatDays:7,warningAmberDays:2,warningRedDays:3,warningFlashingDays:5,warningNextDue:'2026-11-20',warningLastCompletedAt:'2026-11-13T10:00:00.000Z',warningUndo:{warningNextDue:'2026-11-10',warningLastCompletedAt:''}});M.add(b,t);
 const payload=Share.project(b,{},'test-member'),restored=Share.importRaw(payload).tasks[0];
 for(const key of ['warningEnabled','warningFirstDue','warningRepeatDays','warningAmberDays','warningRedDays','warningFlashingDays','warningNextDue','warningLastCompletedAt','warningUndo'])assert.deepEqual(restored[key],t[key],key);
});

test('Undo after household sync restores the warning state from before completion',()=>{
 const b=M.board(),t=M.task({id:'shared-care',title:'Trim cat tree',room:'living',warningEnabled:true,warningFirstDue:M.date(),warningRepeatDays:7});M.add(b,t);M.finish(b,t.id,true);
 const restored=Share.importRaw(Share.project(b,{},'test-member'));M.finish(restored,t.id,false);
 assert.equal(restored.tasks[0].warningLastCompletedAt,'');assert.equal(restored.tasks[0].warningNextDue,'');assert.equal(W.status(restored.tasks[0],M.date()).state,'blue');assert.equal(restored.features.wins.length,0);
});

test('care and custom warning UI keeps green out of the header and respects reduced motion',()=>{
 const fs=require('node:fs'),app=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8'),css=fs.readFileSync(require('node:path').join(__dirname,'../css/care-system.css'),'utf8');
 assert.match(app,/function careWarnings\(\).*filter\(item=>item\.state\.state!=='green'\)/);
 assert.match(app,/customWarnings\(\)\.filter\(item=>item\.state\.state!=='green'\)/);
 assert.match(app,/function customWarningHomeIcons\(\).*custom-warning-home-item/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.global \.warning-task\.flashing\{animation:none/);
});
