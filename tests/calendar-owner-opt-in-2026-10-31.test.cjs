const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
const SHARE=require('../js/sharing-model.js');
globalThis.TidyBase95=require('../js/base-schedule-95.js');
const OCC=require('../js/occasional.js');
const S=require('../js/schedule-core.js');
const V=require('../js/schedule-maker-v2.js');
const NOW=new Date('2026-10-31T10:00:00Z');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function selectedPreview(b,from='2026-11-01',days=31){const tasks=b.tasks.filter(t=>t.calendarEnabled===true);const older=S.preview({...b,tasks:tasks.filter(t=>!V.isManaged(t))},{from,days});const newer=V.calendar({...b,tasks},from,days);return [...older.days,...newer.days].flatMap(x=>x.items);}
test('new household has no tasks and cannot acquire recurrence just by launching the app',()=>{
 const b=M.board();assert.equal(b.tasks.length,0);assert.doesNotMatch(app,/if\(!lastSaved&&OCC\)OCC\.seed/);
 assert.equal(selectedPreview(b).length,0);
});
test('older due dates and repeat fields never silently enter calendar; toggling does not delete anything',()=>{
 const b=M.board();b.tasks.push(M.task({id:'legacy',title:'Saved bathroom task',room:'bathroom',repeatMonths:1,repeatDays:30,nextDue:'2026-11-03'}));
 b.features.wins.push({id:'win1',taskId:'legacy',title:'Saved bathroom task',at:'2026-09-19T12:00:00Z',points:4});
 const before=JSON.stringify(b);assert.equal(selectedPreview(b).length,0);
 b.tasks[0].calendarEnabled=true;assert.ok(selectedPreview(b).length>0);
 b.tasks[0].calendarEnabled=false;assert.equal(selectedPreview(b).length,0);
 assert.equal(b.tasks[0].repeatMonths,1);assert.equal(b.tasks[0].nextDue,'2026-11-03');
 assert.deepEqual(b.features.wins.map(x=>x.id),['win1']);assert.notEqual(JSON.stringify(b),before);
});
test('a user-chosen PDF list job alone is added to calendar and shared',()=>{
 const b=M.board(),row=OCC.OWNER_ROWS.find(x=>x.title==='Clean front door inside');OCC.addSelected(b,M,[row.id],NOW);assert.equal(b.tasks.length,1);
 assert.equal(b.tasks[0].calendarEnabled,true);assert.equal(b.tasks[0].repeatMonths,6);
 const shared=SHARE.importRaw(SHARE.project(b,{},'test'));
 assert.equal(shared.tasks[0].calendarEnabled,true);
 assert.equal(shared.tasks[0].repeatMonths,6);
});
test('seasonal day survives household sharing round-trip',()=>{
 const row=OCC.OWNER_ROWS.find(x=>x.title==='Christmas is coming');assert.ok(row);const b=M.board();OCC.addSelected(b,M,[row.id],NOW);
 const imported=SHARE.importRaw(SHARE.project(b,{},'test')),task=imported.tasks.find(x=>x.occasionSourceId===row.id);
 assert.equal(task.seasonMonth,row.seasonMonth);assert.equal(task.seasonDay,row.seasonDay);
});
test('owner selects individual Base Schedule jobs; unselected jobs not imported',()=>{
 const b=M.board(),base=OCC.OWNER_ROWS;assert.ok(base.length>=20);
 const picked=base[0];const out=OCC.addSelected(b,M,[picked.id],NOW);
 assert.equal(out.added,1);assert.equal(b.tasks.length,1);assert.equal(b.tasks[0].calendarEnabled,true);
 assert.equal(b.tasks[0].title,picked.title);
 assert.equal(OCC.addSelected(b,M,[picked.id],NOW).added,0);
 assert.throws(()=>OCC.addSelected(b,M,['unknown'],NOW),/Unknown/);
});
test('automatically seeded defaults are on the calendar and cannot be duplicated',()=>{
 const b=M.board();OCC.seed(b,M,NOW);
 assert.ok(b.tasks.length>20);
 const reopened=M.normalize(JSON.parse(JSON.stringify(b)));
 assert.equal(reopened.tasks.length,b.tasks.length);
 assert.ok(reopened.tasks.every(t=>t.children.every(c=>!c.parentId||c.parentId===t.id||t.children.some(x=>x.id===c.parentId))));
 const oldCount=b.tasks.length,selected=b.tasks[0];
 assert.equal(selected.calendarEnabled,true);
 const result=OCC.addSelected(b,M,[selected.occasionSourceId],NOW);
 assert.equal(result.added,0);assert.equal(result.skipped,1);assert.equal(b.tasks.length,oldCount);
 assert.equal(b.tasks.filter(x=>x.id===selected.id).length,1);
});
test('UI does not show Speak a Sidequest nor Daily Grind heading on Home',()=>{
 const tiles=app.match(/function dailyGrindTiles\(\)\{return `([\s\S]*?)`;\}/);assert.ok(tiles);
 assert.doesNotMatch(tiles[1],/Speak a Sidequest/);
 assert.doesNotMatch(tiles[1],/<h2>Daily Grind<\/h2>/);
 assert.doesNotMatch(app,/button\('🎙','voice-capture'/);
});
test('calendar task selection is restricted to the confirmed occasional and seasonal catalogue',()=>{
 assert.match(app,/OCAL\.preview\(board,from,days\)/);
 assert.match(app,/function calendarChoose\(\)/);
 assert.match(app,/function calendarChoose\(\)\{essentialsSetup\(\);\}/);
 assert.match(app,/function essentialsSetup\(\)/);
 assert.match(app,/OCC\.previewSelected\(board,M,baseIds\)/);
 assert.match(app,/Review your calendar changes/);
 assert.doesNotMatch(app,/function calendarChoose\(\)\{[\s\S]*?fd\.getAll\('calendarTask'\)/);
 assert.doesNotMatch(app,/if\(!lastSaved&&OCC\)OCC\.seed\(board,M\)/);
});
