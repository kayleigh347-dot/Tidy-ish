'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../js/model.js');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const start=source.indexOf('function completeSeasonalHomeTask('),end=source.indexOf('\nfunction distractionTimed',start);
assert.ok(start>=0&&end>start,'seasonal Home completion action exists');
const chunk=source.slice(start,end);
function taskBoard(task){const board=M.board();M.add(board,task);return board;}
function harness(board,{timed=false}={}){
 const state={board,confirmations:[],timedCalls:[],openTasks:new Set(),M,
  task:id=>state.board.tasks.find(t=>t.id===id),
  hasTimedAttempt:()=>timed,
  finishTimed:id=>state.timedCalls.push(id),
  change:edit=>{const next=M.clone(state.board);edit(next);state.board=next;return true;},
  confirmDialog:(title,message,callback)=>state.confirmations.push(callback)};
 state.complete=vm.runInNewContext(`${chunk}; completeSeasonalHomeTask`,state);
 return state;
}
test('Home completion is one-way and repeated activation records a single completion',()=>{
 const t=M.task({id:'seasonal-task',title:'Buy gifts',room:'kitchen'}),s=harness(taskBoard(t));
 s.complete(t.id);s.complete(t.id);
 assert.equal(s.board.tasks[0].done,true);
 assert.equal(s.board.features.wins.filter(w=>w.taskId===t.id).length,1);
 assert.equal(s.board.features.wins.reduce((total,w)=>total+w.points,0),1);
});
test('repeated Done em all confirmations recheck current state and cannot add duplicate wins',()=>{
 const t=M.task({id:'seasonal-parent',title:'Christmas reset',room:'kitchen',children:[M.child({id:'seasonal-child',title:'Put gifts away'})]}),s=harness(taskBoard(t));
 s.complete(t.id);s.complete(t.id);
 assert.equal(s.confirmations.length,2);
 s.confirmations.forEach(confirm=>confirm());
 assert.equal(s.board.tasks[0].done,true);
 assert.equal(s.board.features.wins.filter(w=>w.rootId===t.id).length,1);
});
test('Home completion preserves the existing timed-task flow',()=>{
 const t=M.task({id:'timed-seasonal-task',title:'Wrap gifts',room:'kitchen'}),s=harness(taskBoard(t),{timed:true});
 s.complete(t.id);
 assert.deepEqual(s.timedCalls,[t.id]);
 assert.equal(s.board.tasks[0].done,false);
 assert.equal(s.board.features.wins.length,0);
});
