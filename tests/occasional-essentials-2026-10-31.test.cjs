const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const M=require('../js/model.js');
const ESS=require('../js/occasional-essentials.js');
const Occ=require('../js/occasional.js');
const Share=require('../js/sharing-model.js');
const now=new Date('2026-10-31T10:00:00Z');
const selected=(id,months,room='')=>({id,months,room});
test('curated essentials include four-month dryer cleaning, but not a four-month lint-filter task',()=>{
 const dryer=ESS.entries.find(x=>x.id==='dryer-deep');assert.equal(dryer.months,4);
 assert.match(dryer.title,/drum.*seal.*sensor/i);
 assert.equal(ESS.entries.some(x=>/after (every|each) load/i.test(x.title)),false);
 assert.ok(ESS.entries.length>=25);
 assert.ok(ESS.entries.find(x=>x.id==='smoke-alarms').months<=1);
 assert.ok(ESS.entries.find(x=>x.id==='dryer-heat').months<=1);
});
test('catalogue is opt-in and never mutates the household merely by opening',()=>{
 const b=M.board();const before=JSON.stringify(b);
 ESS.entries.forEach(x=>ESS.eligible(b,x));assert.equal(JSON.stringify(b),before);
 assert.throws(()=>ESS.addSelected(b,M,[selected('nonexistent',4)],now),/Unknown/);
 assert.throws(()=>ESS.addSelected(b,M,[selected('dryer-deep',0)],now),/interval/);
 assert.equal(JSON.stringify(b),before);
});
test('user selections are the only jobs added, due dates are future, and task metadata is correct',()=>{
 const b=M.board();const old=M.task({id:'existing',title:'Saved chore',room:'kitchen'});M.add(b,old);
 b.features.wins.push({id:'old-win',taskId:'existing',points:2,at:'2026-09-01T09:00:00Z'});
 const added=ESS.addSelected(b,M,[selected('dryer-deep',4),selected('dish-filter',1,'kitchen')],now);
 assert.equal(added.added,2);assert.equal(b.tasks.length,3);
 assert.ok(b.tasks.some(t=>t.id==='existing'));
 assert.deepEqual(b.features.wins.map(x=>x.id),['old-win']);
 const dryer=b.tasks.find(t=>t.id===ESS.key('dryer-deep'));
 assert.equal(dryer.repeatMonths,4);assert.equal(dryer.occasionKind,'occasional');
 assert.equal(dryer.taskType,'maintenance');assert.ok(dryer.nextDue>'2026-10-31');
 const dish=b.tasks.find(t=>t.id===ESS.key('dish-filter'));assert.equal(dish.repeatMonths,1);assert.equal(dish.room,'kitchen');
 assert.equal(ESS.eligible(b,ESS.entries.find(x=>x.id==='dryer-deep')),false);
 assert.equal(ESS.addSelected(b,M,[selected('dryer-deep',4)],now).skipped,1);
});
test('existing job with matching title stays untouched, rather than duplicated',()=>{
 const b=M.board(),item=ESS.entries.find(x=>x.id==='washer-filter');
 M.add(b,M.task({id:'mycustom',title:item.title,occasionKind:'occasional',room:'kitchen',repeatMonths:12}));
 assert.equal(ESS.addSelected(b,M,[selected(item.id,2)],now).added,0);
 assert.equal(b.tasks.length,1);assert.equal(b.tasks[0].repeatMonths,12);
});
test('UK seasonal suggestions use the right months and repeat annually',()=>{
 const b=M.board();ESS.addSelected(b,M,[selected('radiators',12),selected('outdoor-pipes',12),selected('gutters-spring',12)],now);
 assert.equal(b.tasks.find(t=>t.id===ESS.key('radiators')).nextDue,'2027-09-15');
 assert.equal(b.tasks.find(t=>t.id===ESS.key('outdoor-pipes')).nextDue,'2026-11-15');
 assert.equal(b.tasks.find(t=>t.id===ESS.key('gutters-spring')).nextDue,'2027-04-15');
 assert.equal(b.tasks.find(t=>t.id===ESS.key('radiators')).seasonMonth,9);
 const rows=M.occurrences(b,'2026-10-31','2028-10-31');
 assert.equal(rows.filter(x=>x.task.id===ESS.key('radiators')).length,1,'only the next job occurrence should be shown');
});
test('completion/undo and share conversion preserve selected jobs and historical points',()=>{
 const b=M.board();ESS.addSelected(b,M,[selected('dryer-deep',4)],now);
 const id=ESS.key('dryer-deep'),t=b.tasks.find(x=>x.id===id);
 assert.ok(t);const firstDue=t.nextDue;
 Occ.complete(b,id,M,new Date('2026-11-20T13:00:00Z'));
 assert.equal(t.nextDue,'2027-03-20');assert.ok(b.features.wins.some(w=>w.taskId===id));
 const round=Share.importRaw(Share.project(b,{},'test-account'));
 const shared=round.tasks.find(x=>x.id===id);
 assert.ok(shared);assert.equal(shared.nextDue,'2027-03-20');assert.equal(shared.repeatMonths,4);
 assert.ok(round.features.wins.some(w=>w.taskId===id));
 assert.equal(Occ.undo(round,id),true);assert.equal(shared.nextDue,firstDue);
});
test('calendar suggestions are limited to the supplied PDF task list',()=>{
 const base=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 assert.ok(!html.includes('js/occasional-essentials.js'));
 const js=fs.readFileSync(path.join(base,'js/app.js'),'utf8');
 assert.match(js,/function essentialsSetup\(\)/);
 assert.match(js,/data-action="essentials-setup"|\'essentials-setup\':/);
 assert.match(js,/Choose from your task list/);
 assert.doesNotMatch(js,/ESS\.addSelected|Choose from essentials and Base Schedule/);
 assert.ok(js.includes('OCC.addSelected(b,M,baseIds)'));
});
