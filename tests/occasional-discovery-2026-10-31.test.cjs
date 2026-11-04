const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
globalThis.TidyBase95=require('../js/base-schedule-95.js');
const Occ=require('../js/occasional.js');
const NOW=new Date('2026-10-31T12:00:00Z');

test('new boards have long-interval defaults, with first due dates spread over the year',()=>{
 const b=M.board();const result=Occ.seed(b,M,NOW);
 assert.equal(result.added,Occ.OWNER_ROWS.length);
 assert.ok(result.added>25);
 const dates=Occ.tasks(b).map(x=>x.nextDue);
 assert.ok(dates.every(d=>d>='2026-10-31'));
 assert.ok(new Set(dates).size>10);
});

test('a deleted default does not silently reappear after reopening or ordinary opt-in',()=>{
 const b=M.board();Occ.seed(b,M,NOW);
 const id=Occ.tasks(b)[0].id;b.tasks=b.tasks.filter(x=>x.id!==id);
 assert.equal(Occ.seed(b,M,new Date('2026-11-01T12:00:00Z')).added,0);
 assert.equal(Occ.seed(b,M,new Date('2026-11-01T12:00:00Z'),true).added,0);
 assert.equal(b.tasks.some(t=>t.id===id),false);
});

test('restoring defaults is explicit, preserves existing IDs/wins and does not duplicate other jobs',()=>{
 const b=M.board();Occ.seed(b,M,NOW);
 const before=Occ.tasks(b),missing=before[0],existing=before[1];
 b.tasks=b.tasks.filter(x=>x.id!==missing.id);
 b.features.wins.push({id:'win-old',taskId:missing.id,title:missing.title,at:'2026-01-01',points:1});
 assert.equal(Occ.seed(b,M,NOW,true,true).added,1);
 assert.equal(b.tasks.filter(t=>t.id===missing.id).length,1);
 assert.equal(b.tasks.filter(t=>t.id===existing.id).length,1);
 assert.equal(b.features.wins.find(w=>w.id==='win-old').points,1);
 assert.equal(Occ.seed(b,M,NOW,true,true).added,0);
});

test('calendar import previews exact dates without mutation before the owner confirms',()=>{
 const b=M.board(),rows=[Occ.OWNER_ROWS.find(x=>x.title==='Clean front door inside'),Occ.OWNER_ROWS.find(x=>x.title==='Christmas is coming')],before=JSON.stringify(b);
 const preview=Occ.previewSelected(b,M,rows.map(x=>x.id),NOW);
 assert.deepEqual(preview.map(x=>x.firstDue),['2027-05-01','2026-11-24']);
 assert.equal(preview[1].seasonal,true);assert.equal(JSON.stringify(b),before);
 const result=Occ.addSelected(b,M,rows.map(x=>x.id),NOW);assert.equal(result.added,2);
 for(const item of preview)assert.equal(b.tasks.find(t=>t.id==='tidy-occasional:'+item.id).nextDue,item.firstDue);
});
test('the calendar task manager uses the confirmed Occasional and seasonal workflow',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 assert.match(app,/Occasional & seasonal calendar/);
 assert.match(app,/calendarEnabled===true/);
 assert.match(app,/calendar-choose/);
 assert.match(app,/OCC\.addSelected/);
 assert.match(app,/Choose from your task list/);
 assert.doesNotMatch(app,/Choose from essentials and Base Schedule|ESS\.addSelected/);
 assert.match(app,/Preview selected dates/);assert.match(app,/Review your calendar changes/);
 assert.match(app,/Nothing has been saved yet/);
 assert.doesNotMatch(app,/if\(!lastSaved&&OCC\)OCC\.seed/);
});
