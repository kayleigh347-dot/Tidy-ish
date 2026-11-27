'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../js/model.js');
const D=require('../js/drag-core.js');
const Codec=require('../js/local-storage-codec.js');

const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const start=source.indexOf('function liftChildToRoot(');
const end=source.indexOf('\nlet childGesture',start);
assert.ok(start>=0&&end>start,'production child-lift function is present');
const lift=vm.runInNewContext(`(()=>{${source.slice(start,end)};return liftChildToRoot;})()`,{M,D});
const saveReload=board=>M.normalize(Codec.decode(Codec.encode(board)));
const json=value=>JSON.stringify(value);

test('nesting and lifting a dated task preserves dates and task data through both reloads',()=>{
 const board=M.board(),dated=M.task({
  id:'dated-root',title:'Dated root',room:'kitchen',dueDate:'2026-12-18',nextDue:'2026-12-18',
  notes:'Keep these notes',elapsed:135000,startedAt:1764000000000,timerEstimateMs:240000,
  alarmNextAtMs:1764000240000,children:[M.child({id:'dated-descendant',title:'Nested descendant',
   parentId:'dated-root',done:true,notes:'Descendant notes',elapsed:25000})]
 }),parent=M.task({id:'nest-parent',title:'Parent task',room:'kitchen'});
 board.tasks.push(dated,parent);
 board.features.wins.push({id:'descendant-win',taskId:'dated-descendant',rootId:'dated-root',at:'2026-11-26T10:00:00.000Z',points:2});
 const winsBefore=json(board.features.wins);

 D.nest(board,dated.id,parent.id,'','room');
 let saved=saveReload(board);
 let nested=saved.tasks.find(task=>task.id===parent.id).children.find(child=>child.id===dated.id);
 assert.equal(nested.dueDate,'2026-12-18');
 assert.equal(nested.nextDue,'2026-12-18');
 assert.equal(nested.id,dated.id);

 lift(saved,parent.id,dated.id,parent.id,false,'room');
 saved=saveReload(saved);
 const promoted=saved.tasks.find(task=>task.id===dated.id);
 assert.ok(promoted,'the original task identity is promoted');
 assert.equal(promoted.dueDate,'2026-12-18');
 assert.equal(promoted.nextDue,'2026-12-18');
 assert.equal(promoted.notes,'Keep these notes');
 assert.equal(promoted.elapsed,135000);
 assert.equal(promoted.startedAt,1764000000000);
 assert.equal(promoted.timerEstimateMs,240000);
 assert.equal(promoted.alarmNextAtMs,1764000240000);
 assert.equal(promoted.children[0].id,'dated-descendant');
 assert.equal(promoted.children[0].parentId,'');
 assert.equal(promoted.children[0].done,true);
 assert.equal(promoted.children[0].notes,'Descendant notes');
 assert.equal(json(saved.features.wins),winsBefore);
});

test('lifting an undated subtask keeps its date fields blank and recurring roots remain ineligible',()=>{
 const board=M.board(),parent=M.task({id:'plain-parent',title:'Parent',room:'kitchen',children:[M.child({id:'plain-child',title:'Undated child'})]}),target=M.task({id:'plain-target',title:'Target',room:'kitchen'});
 board.tasks.push(parent,target);
 lift(board,parent.id,'plain-child',target.id,false,'room');
 const promoted=board.tasks.find(task=>task.id==='plain-child');
 assert.equal(promoted.dueDate,'');
 assert.equal(promoted.nextDue,'');

 const recurring=M.task({id:'recurring-parent',title:'Weekly parent',room:'kitchen',repeatDays:7,nextDue:'2026-12-18',children:[M.child({id:'blocked-child',title:'Child'})]});
 const blocked=M.board();blocked.tasks.push(recurring);
 const before=json(blocked);
 assert.throws(()=>lift(blocked,recurring.id,'blocked-child',recurring.id,false,'room'),/Only active, non-recurring/);
 assert.equal(json(blocked),before,'a rejected recurring move leaves the entire board unchanged');
});
