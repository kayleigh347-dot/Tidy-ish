const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../js/owner-calendar.js');
const S=require('../js/schedule-core.js');
const M=require('../js/model.js');
const SHARE=require('../js/sharing-model.js');
const F=path.join(__dirname,'../js/app.js');
const app=fs.readFileSync(F,'utf8');
function loadBackup(){
 const b=M.board(),beddingId='8f9c4a53-3a5a-3cd0-95d8-b769a23716b7';
 for(let i=0;i<165;i++)b.tasks.push(M.task({id:i===0?beddingId:`calendar-fixture-task-${i}`,title:i===0?'Change bedding':`Ordinary cleaning task ${i}`,room:'living',nextDue:i===0?'2026-11-06':''}));
 b.features.wins=Array.from({length:273},(_,i)=>({id:`calendar-fixture-win-${i}`,taskId:b.tasks[i%165].id,rootId:'',title:b.tasks[i%165].title,room:'living',at:'2026-10-31T12:00:00.000Z',points:1,person:'Fixture'}));
 return M.normalize(b);
}

test('ordinary backup tasks are eligible, with no old calendar jobs automatically selected',()=>{
 const b=loadBackup();
 assert.equal(b.tasks.length,165);
 assert.equal(b.features.wins.length,273);
 assert.equal(C.preview(b,'2026-11-01',30).days.length,0);
 assert.ok(b.tasks.filter(C.eligible).length>5);
});
test('selected date-only Change bedding task appears exactly once on 6 Nov 2026',()=>{
 const b=loadBackup();
 const id='8f9c4a53-3a5a-3cd0-95d8-b769a23716b7';
 const found=b.tasks.find(x=>x.id===id);
 assert.ok(found);assert.equal(found.nextDue,'2026-11-06');
 const before=JSON.stringify({wins:b.features.wins,tasks:b.tasks});
 C.apply(b.tasks,[{id,firstDue:'2026-11-06',unit:'once',every:1}]);
 assert.deepEqual(C.preview(b,'2026-11-01',30).days.filter(d=>d.items.some(i=>i.taskId===id)).map(d=>d.date),['2026-11-06']);
 assert.equal(b.tasks.length,165);assert.equal(b.features.wins.length,273);
 assert.equal(found.repeatDays,0);assert.equal(found.repeatMonths,0);
 assert.equal(found.nextDue,'2026-11-06');
 assert.deepEqual(JSON.parse(before).wins,b.features.wins);
});
test('any existing saved task can be given a first date and repeat monthly',()=>{
 const b=M.board();b.tasks.push(M.task({id:'a',title:'Dust blinds',room:'living'}));
 C.apply(b.tasks,[{id:'a',firstDue:'2026-11-15',unit:'months',every:4}]);
 const dates=C.preview(b,'2026-11-01',366).days.map(d=>d.date);
 assert.deepEqual(dates,['2026-11-15','2027-03-15','2027-07-15']);
 assert.equal(b.tasks[0].repeatMonths,0,'original cleaning task recurrence unchanged');
 assert.equal(b.tasks[0].nextDue,'');
});
test('monthly recurrence dates stay consistent when the viewing range starts later',()=>{
 const task={repeatMonths:1,nextDue:'2026-01-31'};
 const long=S.occurrenceDates(task,'2026-01-01',181).filter(d=>d.startsWith('2026-04'));
 const short=S.occurrenceDates(task,'2026-04-01',30).filter(d=>d.startsWith('2026-04'));
 assert.deepEqual(long,short);assert.deepEqual(short,['2026-04-28']);
});
test('every N days cadence and uncheck without losing selected settings',()=>{
 const b=M.board();b.tasks.push(M.task({id:'a',title:'Kitchen job'}));
 C.apply(b.tasks,[{id:'a',firstDue:'2026-11-01',unit:'days',every:14}]);
 assert.deepEqual(C.preview(b,'2026-11-01',29).days.map(x=>x.date),['2026-11-01','2026-11-15','2026-11-29']);
 const copy=JSON.stringify(b.tasks[0].calendarSchedule);
 C.apply(b.tasks,[]);
 assert.equal(C.preview(b,'2026-11-01',29).days.length,0);
 assert.equal(JSON.stringify(b.tasks[0].calendarSchedule),copy);
});
test('invalid dates, duplicate IDs, unknown IDs and invalid repeat interval do not mutate any saved tasks',()=>{
 const b=M.board();b.tasks.push(M.task({id:'a',title:'Do me'}));const original=JSON.stringify(b);
 const cases=[
  [{id:'a',firstDue:'2026-02-30',unit:'once',every:1}],
  [{id:'a',firstDue:'2026-11-01',unit:'months',every:0}],
  [{id:'a',firstDue:'2026-11-01',unit:'week',every:1}],
  [{id:'missing',firstDue:'2026-11-01',unit:'once',every:1}],
  [{id:'a',firstDue:'2026-11-01',unit:'once',every:1},{id:'a',firstDue:'2026-11-02',unit:'once',every:1}],
 ];
 for(const rows of cases){assert.throws(()=>C.apply(b.tasks,rows));assert.equal(JSON.stringify(b),original);}
});
test('sync roundtrip preserves calendar schedule even for completed task without losing win history',()=>{
 const b=M.board();b.tasks.push(M.task({id:'a',title:'Clean drawer',done:true}));
 b.features.wins.push({id:'winA',taskId:'a',at:'2026-10-25T12:00:00Z',title:'Clean drawer',points:1});
 C.apply(b.tasks,[{id:'a',firstDue:'2026-11-13',unit:'months',every:4}]);
 const raw=SHARE.project(b,{},'test-account');
 const again=SHARE.importRaw(raw);
 const found=again.tasks.find(t=>t.id==='a');
 assert.equal(found.calendarEnabled,true);
 assert.deepEqual(found.calendarSchedule,{firstDue:'2026-11-13',unit:'months',every:4});
 assert.equal(again.features.wins.length,1);
 assert.deepEqual(C.preview(again,'2026-11-01',31).days.map(d=>d.date),['2026-11-13']);
});
test('existing imported occasional jobs without calendarSchedule can still be displayed when explicitly selected',()=>{
 const b=M.board();b.tasks.push(M.task({id:'dryer',title:'Dryer deep clean',occasionKind:'occasional',calendarEnabled:true,nextDue:'2026-11-10',repeatMonths:4}));
 assert.deepEqual(C.preview(b,'2026-11-01',31).days.map(d=>d.date),['2026-11-10']);
});
test('calendar UI exposes the curated occasional catalogue, not the all-task daily/weekly picker',()=>{
 assert.match(app,/OCAL\.preview\(board,from,days\)/);
 assert.match(app,/function calendarChoose\(\)\{essentialsSetup\(\);\}/);
 assert.match(app,/OCC\.previewSelected\(board,M,baseIds\)/);
 assert.doesNotMatch(app,/function calendarChoose\(\)\{[\s\S]*?calendarTask/);
 assert.doesNotMatch(app,/name="calendarUnit:[^\"]+">[\s\S]*Every N days/);
 assert.doesNotMatch(app,/const candidates=board\.tasks\.filter\(t=>!t\.side&&!t\.archived&&\(/);
});
test('occasional completion advances an opted-in calendar and undo restores previous owner date',()=>{
 const Occ=require('../js/occasional.js');
 const b=M.board();b.tasks.push(M.task({id:'dryer',title:'Dryer drum clean',occasionKind:'occasional',repeatMonths:4,nextDue:'2026-11-01',calendarEnabled:true}));
 C.apply(b.tasks,[{id:'dryer',firstDue:'2026-11-01',unit:'months',every:4}]);
 const win=Occ.complete(b,'dryer',M,new Date('2026-11-05T12:00:00Z'));
 assert.equal(b.tasks[0].calendarSchedule.firstDue,'2027-03-05');
 assert.equal(b.features.wins.at(-1).id,win.id);
 assert.deepEqual(C.preview(b,'2027-03-01',31).days.map(x=>x.date),['2027-03-05']);
 assert.equal(Occ.undo(b,'dryer'),true);
 assert.equal(b.tasks[0].calendarSchedule.firstDue,'2026-11-01');
 assert.equal(b.tasks[0].nextDue,'2026-11-01');
 assert.equal(b.features.wins.length,0);
});
