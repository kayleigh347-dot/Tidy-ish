const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../js/model.js'),L=require('../js/quest-library.js');

test('Do Later suggestions retain task identity and are distinct from matching templates',()=>{
 const b=M.board(),t=M.task({title:'Hoover rug',room:'living',children:[M.child({title:'Move chairs',done:true})]});
 M.add(b,t);const template=M.task({title:t.title,room:t.room});b.features.templates.push(template);
 const before=M.clone(b),rows=L.autocompleteSavedTasks(b,'vacuum','living',6,M);
 assert.equal(rows[0].id,t.id);assert.equal(rows[0].sourceType,'do-later');
 assert.ok(rows.some(r=>r.id===template.id&&r.sourceType==='template'));
 assert.equal(rows.filter(r=>r.id===t.id).length,1);assert.deepEqual(b,before);
 assert.equal(L.findDuplicateTask(b,t.title,t.room,false).id,t.id);
 assert.ok(L.autocompleteSavedTasks(b,'vacuum','living').every(r=>r.sourceType!=='do-later'));
});

test('Do Later selection only selects the existing task and is idempotent',()=>{
 const b=M.board(),t=M.task({title:'Wipe shelf',room:'living',notes:'Keep this',children:[M.child({title:'Top shelf',done:true})]});
 M.add(b,t);const other=M.task({title:'Dust',doing:true});M.add(b,other);
 const expected=M.clone(b);M.select(expected,t.id,true);
 assert.equal(L.selectDoLaterTask(b,t.id,M),true);assert.deepEqual(b,expected);
 const third=M.task({title:'Tidy',doing:true});M.add(b,third);const after=M.clone(b);
 assert.equal(L.selectDoLaterTask(b,t.id,M),false);assert.deepEqual(b,after);
});

test('completed, paused, archived, side, and scheduled tasks cannot be selected as Do Later',()=>{
 const b=M.board();const flags=[{done:true},{paused:true},{archived:true},{side:true},{repeatDays:7},{calendarEnabled:true},{occasionKind:'occasional'},{seasonMonth:12},{nextDue:'2099-01-01'},{scheduleMakerManaged:true}];
 for(const [i,flag] of flags.entries()){
  const t=M.task({title:'Shelf '+i,...flag});M.add(b,t);
  assert.equal(L.isDoLaterTask(t,M),false);const before=M.clone(b);
  assert.throws(()=>L.selectDoLaterTask(b,t.id,M),/no longer available/);assert.deepEqual(b,before);
 }
 assert.equal(L.autocompleteSavedTasks(b,'Shelf','',6,M).some(r=>r.sourceType==='do-later'),false);
});
