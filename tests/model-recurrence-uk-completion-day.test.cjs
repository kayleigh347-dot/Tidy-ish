'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

// Separate processes make the device's timezone a real test input.
// This suite never changes a saved household or the host's timezone.
const runner=String.raw`
 const M=require('./js/model.js');
 const actual=globalThis.Date, instant=process.env.TEST_INSTANT;
 class FrozenDate extends actual {
   constructor(...args){super(...(args.length?args:[instant]));}
   static now(){return actual.parse(instant);}
 }
 globalThis.Date=FrozenDate;
 const root=M.task({id:'qa-monthly',title:'Monthly QA',room:'kitchen',repeatMonths:1,nextDue:'2026-01-31'});
 const children=M.task({id:'qa-child-parent',title:'Child QA',room:'kitchen',repeatMonths:1,nextDue:'2026-01-31',
   children:[M.child({id:'qa-leaf',parentId:'',title:'Leaf'})]});
 const warning=M.task({id:'qa-warning',title:'Warning QA',room:'kitchen',repeatDays:1,nextDue:'2026-01-31',
   warningEnabled:true,warningRepeatDays:2,warningFirstDue:'2026-01-31'});
 const board=M.board();board.tasks.push(root,children,warning);
 M.finish(board,root.id,true);
 M.completeChild(board,children.id,'qa-leaf',true);
 M.finish(board,warning.id,true);
 const result={monthly:root.nextDue,child:children.nextDue,warningNextDue:warning.warningNextDue,
   warningTaskDue:warning.nextDue,rootCompletedAt:root.completedAt,childCompletedAt:children.completedAt,
   winCount:board.features.wins.length};
 M.finish(board,root.id,false);
 result.undoDue=root.nextDue;result.winsAfterUndo=board.features.wins.length;
 process.stdout.write(JSON.stringify(result));
`;
function run(instant,timezone){
 const root=path.resolve(__dirname,'..');
 const child=spawnSync(process.execPath,['-e',runner],{
   cwd:root,encoding:'utf8',env:{...process.env,TZ:timezone,TEST_INSTANT:instant},timeout:10000
 });
 assert.equal(child.status,0,`${timezone}: ${child.stderr||child.stdout}`);
 return JSON.parse(child.stdout);
}

const cases=[
 {instant:'2026-10-24T23:30:00.000Z',nextMonth:'2026-11-25',nextDay:'2026-10-26',warning:'2026-10-27'},
 {instant:'2026-03-29T23:30:00.000Z',nextMonth:'2026-04-30',nextDay:'2026-03-31',warning:'2026-04-01'},
 {instant:'2026-10-25T01:30:00.000Z',nextMonth:'2026-11-25',nextDay:'2026-10-26',warning:'2026-10-27'}
];
for(const item of cases){
 test(`completion day and recurring due are UK-based across device timezones at ${item.instant}`,()=>{
   const results=['Europe/London','UTC','America/Los_Angeles'].map(tz=>run(item.instant,tz));
   for(const [index,result] of results.entries()){
     const where=['Europe/London','UTC','America/Los_Angeles'][index];
     assert.equal(result.monthly,item.nextMonth,`${where}: monthly next due`);
     assert.equal(result.child,item.nextMonth,`${where}: child completion next due`);
     assert.equal(result.warningTaskDue,item.nextDay,`${where}: recurring daily next due`);
     assert.equal(result.warningNextDue,item.warning,`${where}: warning due`);
     assert.equal(result.undoDue,'2026-01-31',`${where}: undo restores previous due`);
     assert.equal(result.winCount,3,`${where}: completion wins`);
     assert.equal(result.winsAfterUndo,2,`${where}: undo only removes latest win`);
     assert.equal(result.rootCompletedAt,item.instant);
     assert.equal(result.childCompletedAt,item.instant);
   }
   assert.deepEqual(results[0],results[1]);
   assert.deepEqual(results[1],results[2]);
 });
}
