const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');

const local=(y,m,d,h=0,min=0,s=0,ms=0)=>new Date(y,m,d,h,min,s,ms);

test('completed tasks stay visible through the completion day and disappear at 3am the next day',()=>{
 const board=M.board(),old=M.task({id:'old-done',title:'Older completion',done:true,completedAt:local(2026,10,2,10).toISOString()}),latest=M.task({id:'latest-done',title:'Latest completion',done:true,completedAt:local(2026,10,3,1).toISOString()}),active=M.task({id:'still-open',title:'Still open'});
 board.tasks.push(old,latest,active);board.features.wins.push({id:'old-win',taskId:old.id,title:old.title,at:old.completedAt},{id:'latest-win',taskId:latest.id,title:latest.title,at:latest.completedAt});
 const before=JSON.stringify(board),cutoff=local(2026,10,3,3).getTime();
 assert.equal(M.taskCompletionExpiresAt(board,old),cutoff);
 assert.equal(M.isTaskCompletionVisible(board,old,cutoff-1),true);
 assert.equal(M.isTaskCompletionVisible(board,old,cutoff),false);
 assert.deepEqual(M.orderTaskList(board,[old,latest,active],cutoff-1).map(t=>t.id),[active.id,latest.id,old.id]);
 assert.deepEqual(M.orderTaskList(board,[old,latest,active],cutoff).map(t=>t.id),[active.id,latest.id]);
 assert.equal(M.nextTaskCompletionExpiry(board,cutoff-1),cutoff);
 assert.equal(M.nextTaskCompletionExpiry(board,cutoff),M.taskCompletionExpiresAt(board,latest));
 assert.equal(JSON.stringify(board),before,'hiding old task cards must not delete task or completion history');
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/return M\.orderTaskList\(board,list,Date\.now\(\)\)/);
 assert.match(app,/M\.orderChildList\(board,t,parent,Date\.now\(\)\)/);
 assert.match(app,/nextCompletionExpiry=M\.nextTaskCompletionExpiry\(board,now\);if\(expiryPassed\)\{render\(\);return;\}/);
});

test('subtask completion uses its own completion record and recent completions sort first',()=>{
 const board=M.board(),older=M.child({id:'child-old',title:'Older subtask',done:true}),newer=M.child({id:'child-new',title:'Newer subtask',done:true}),parent=M.task({id:'parent',title:'Parent',children:[older,newer]});
 board.tasks.push(parent);board.features.wins.push({id:'child-old-win',taskId:older.id,rootId:parent.id,at:local(2026,10,2,11).toISOString()},{id:'child-new-win',taskId:newer.id,rootId:parent.id,at:local(2026,10,3,1).toISOString()});
 const now=local(2026,10,3,4).getTime();
 assert.deepEqual(M.orderChildList(board,parent,'',now).map(c=>c.id),[newer.id]);
 assert.equal(M.isTaskCompletionVisible(board,M.child({id:'legacy-done',done:true}),now),false,'undated completed cards are treated as old and hidden without deleting their data');
});
