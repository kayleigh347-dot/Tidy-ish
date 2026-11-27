'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../js/model.js'),OCC=require('../js/occasional.js'),Base=require('../js/base-schedule-95.js');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),source=read('js/app.js');
const now=new Date(2026,10,19,12),today='2026-11-19',json=x=>JSON.stringify(x);
const seasonalSource=Base.filter(r=>r.section==='Seasonal'&&(r.repeatMonths>=2||r.seasonMonth>0));
const named=(part)=>seasonalSource.find(r=>r.title===part);
const add=(b,id,more={})=>{const t=M.task({id,title:id,occasionKind:'occasional',room:'kitchen',repeatMonths:12,nextDue:'2026-12-01',...more});M.add(b,t);return t;};
const seeded=()=>{const b=M.board();OCC.seed(b,M,now);return b;};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderFixture(board){
 const ctx={OCC,M,board,libraryTab:'seasonal',libraryQuery:'',libraryRoom:'all',libraryPriority:'all',libraryTag:'',roomId:'kitchen',route:'library',rooms:()=>board.rooms,room:id=>board.rooms.find(r=>r.id===id),guardianThumb:()=>'',esc,Date:class extends Date{constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}}};
 for(const name of ['button','select','card']){const match=source.match(new RegExp('^const '+name+'=(.+);$','m'));assert.ok(match,name);ctx[name]=vm.runInNewContext('('+match[1]+')',ctx);}
 const stubs={tabs:(arr)=>'<nav class="library-tabs">'+arr.map(([id,label])=>`<button role="tab" data-id="${id}">${label}</button>`).join('')+'</nav>',L:{libraryRows:()=>({saved:[],custom:[]}),availableTags:()=>[]},libraryTab:'seasonal'};Object.assign(ctx,stubs);
 for(const [name,next] of [['managementRoomGroups','schedulePage'],['questLibraryPage','libraryIdeas'],['occasionalLibraryContent','seasonalLibraryContent'],['seasonalLibraryContent','libraryFindExisting']]){
  const start=source.indexOf('function '+name+'('),stop=source.indexOf('\nfunction '+next+'(',start);
  if(start<0||stop<0)continue;
  ctx[name]=vm.runInNewContext('('+source.slice(start,stop).trim()+')',ctx);
 }
 return ctx;
}
test('baseline regression: Seasonal is a distinct fourth library tab and has a renderer',()=>{
 assert.match(source,/\['seasonal','Seasonal'\]/);
 assert.match(source,/if\(libraryTab==='seasonal'\)/);
 assert.match(source,/function seasonalLibraryContent\(/);
});
test('all saved source Seasonal entries appear once, including future and not-yet-due',()=>{
 const b=seeded(),before=json(b),rows=OCC.seasonalGroups(b,now).flatMap(g=>g.tasks),sourceIds=seasonalSource.map(x=>x.id).sort();
 assert.deepEqual(rows.map(t=>t.occasionSourceId).sort(),sourceIds);
 assert.equal(new Set(rows.map(t=>t.id)).size,rows.length);
 assert.ok(rows.some(t=>t.nextDue>today));assert.equal(json(b),before);
});
test('named events are explicit, generic seasonal work stays neutral, no accidental birthday group',()=>{
 const b=seeded(),groups=OCC.seasonalGroups(b,now),rows=groups.flatMap(g=>g.tasks),map=new Map(groups.map(g=>[g.id,g.tasks.map(t=>t.title)]));
 assert.deepEqual(map.get('christmas').sort(),['Christmas is coming','Pack away Christmas decorations','Christmas present planning'].sort());
 assert.deepEqual(map.get('halloween'),['Halloween planning']);
 assert.deepEqual(map.get('valentines'),["Valentine's Day planning"]);
 const maintenance=['Wash and dry winter entrance mats','Wipe radiators before heating season','Change to warmer bedding','Change to lighter bedding'];
 for(const title of maintenance){const row=Base.find(x=>x.title===title);assert.ok(row);assert.equal(row.section,'Occasional');assert.ok(!rows.some(t=>t.title===title),'reclassified maintenance is not in the Seasonal projection');}
 assert.equal(map.has('birthdays'),false);
});
test('only explicit seasonal metadata qualifies; matching unrelated titles and monthly occasional work do not move',()=>{
 const b=M.board(),known=named('Halloween planning'),others=['generic ordinary','named unrelated','custom seasonal','month seasonal'];
 add(b,others[0],{seasonMonth:0,section:'Occasional',nextDue:today});
 add(b,others[1],{title:'Halloween planning',seasonMonth:0,section:'Occasional',nextDue:today});
 add(b,others[2],{occasionKind:'',section:'Seasonal',nextDue:''});
 add(b,others[3],{seasonMonth:9,section:'',nextDue:'2027-09-01'});
 add(b,'known source',{occasionSourceId:known.id,seasonMonth:0,section:'Occasional',nextDue:'2026-10-01'});
 const before=json(b),rows=OCC.seasonalGroups(b,now).flatMap(g=>g.tasks);
 assert.deepEqual(rows.map(t=>t.id).sort(),['custom seasonal','month seasonal','known source'].sort());
 assert.equal(json(b),before);
});
test('Birthday group requires a saved dated Seasonal task; undated entries remain visible in generic group',()=>{
 const b=M.board();add(b,'undated birthday',{title:'Birthday planning (set a date for each person)',section:'Seasonal',occasionKind:'',nextDue:''});
 assert.equal(OCC.seasonalGroups(b,now).find(g=>g.id==='birthdays'),undefined);
 add(b,'dated birthday',{title:'Birthday planning (set a date for each person)',section:'Seasonal',occasionKind:'',nextDue:'2027-05-19'});
 const groups=OCC.seasonalGroups(b,now);assert.deepEqual(groups.find(g=>g.id==='birthdays').tasks.map(t=>t.id),['dated birthday']);
 assert.ok(groups.find(g=>g.id==='seasonal').tasks.some(t=>t.id==='undated birthday'));
});
test('Seasonal view shows dated statuses and reuses existing actions; other occasional/check lists remain unchanged',()=>{
 const b=seeded();b.tasks.find(t=>t.title==='Christmas is coming').nextDue='2026-11-01';const extra=add(b,'not-seasonal',{section:'Occasional',nextDue:today});add(b,'recommended',{occasionKind:'',checkDays:5,completedAt:new Date(2026,10,1).toISOString(),title:'Recommended ordinary'});
 const seasonal=OCC.seasonalGroups(b,now).flatMap(g=>g.tasks),before=json(b),due=OCC.dueTasks(b,now).map(t=>t.id),checks=OCC.staleChecks(b,now).map(x=>x.task.id);
 const c=renderFixture(b),html=c.questLibraryPage();
 assert.match(html,/role="tab"[^>]*data-id="seasonal"/);assert.match(html,/🎄 Christmas|Christmas/);assert.match(html,/data-action="occasional-done"/);assert.match(html,/data-action="occasional-edit"/);
 assert.match(html,/Upcoming/);assert.match(html,/Overdue|Due today|Date not set/);
 assert.equal((html.match(/class="management-row seasonal-row"/g)||[]).length,seasonal.length);
 assert.doesNotMatch(html,/Recommended ordinary|not-seasonal/);
 const occHtml=c.occasionalLibraryContent();assert.match(occHtml,/not-seasonal/);assert.match(occHtml,/Recommended ordinary/);
 assert.deepEqual(OCC.dueTasks(b,now).map(t=>t.id),due);assert.deepEqual(OCC.staleChecks(b,now).map(x=>x.task.id),checks);assert.equal(json(b),before);
});
test('previously saved seasonal maintenance moves to Occasional while celebration IDs, dates, history and Undo stay intact',()=>{
 const b=seeded(),maintenanceTitles=['Wash and dry winter entrance mats','Wipe radiators before heating season','Change to warmer bedding','Change to lighter bedding'],rows=Base.filter(x=>maintenanceTitles.includes(x.title)),celebration=b.tasks.find(t=>t.title==='Christmas is coming'),unrelated=b.tasks.find(t=>t.title==='Descale kettle');
 assert.deepEqual(rows.map(x=>x.title).sort(),maintenanceTitles.slice().sort());assert.ok(celebration&&unrelated);
 const moved=rows.map(row=>{const task=b.tasks.find(t=>t.occasionSourceId===row.id);assert.ok(task);assert.equal(task.id,'tidy-occasional:'+row.id);assert.equal(task.occasionSourceId,row.id);task.section='Seasonal';task.tags=['Seasonal',row.category];task.nextDue=today;return {row,task};}); // emulate existing saved records predating source reclassification
 celebration.nextDue='2026-11-01';unrelated.nextDue='2026-11-10';
 const prior=json(b),c=renderFixture(b),oldDue=c.occasionalLibraryContent(),season=c.seasonalLibraryContent();
 const dueIds=OCC.dueTasks(b,now).map(t=>t.id);
 for(const {task} of moved){const action='data-action="occasional-done" data-id="'+task.id+'"';assert.ok(oldDue.includes(action),'each old saved maintenance record remains due in Occasional Essentials');assert.ok(!season.includes(task.title),'source provenance removes old saved records from Seasonal despite their saved section value');assert.equal(dueIds.filter(id=>id===task.id).length,1,'each record appears once in the due schedule');}
 assert.ok(season.includes(celebration.title),'a named celebration remains visible in Seasonal');
 assert.ok(oldDue.includes(unrelated.title),'unrelated occasional work remains visible');
 for(const {task} of moved)assert.equal(b.tasks.filter(t=>t.id===task.id).length,1);
 assert.equal(json(b),prior,'reading both views does not modify household data');
 const {row,task}=moved[2],action='data-action="occasional-done" data-id="'+task.id+'"',oldWins=json(b.features.wins),oldDueDate=task.nextDue,w=OCC.complete(b,task.id,M,now);
 assert.equal(b.features.wins.filter(x=>x.id===w.id).length,1,'completion is recorded exactly once');
 assert.ok(!c.occasionalLibraryContent().includes(action),'completion moves its next due date forward');
 assert.ok(!c.seasonalLibraryContent().includes(task.title));
 assert.equal(OCC.undo(b,task.id),true);
 assert.equal(task.id,'tidy-occasional:'+row.id);assert.equal(task.occasionSourceId,row.id);assert.equal(task.nextDue,oldDueDate);assert.equal(json(b.features.wins),oldWins);
 assert.ok(c.occasionalLibraryContent().includes(action),'Undo restores the original due-list visibility');
 assert.equal(b.tasks.filter(t=>t.id===task.id).length,1);
});
test('complete/Undo preserve exact history and schedule; seasonal rendering is read-only after reload',()=>{
 const b=seeded(),t=b.tasks.find(t=>t.title==='Christmas is coming');assert.ok(t);
 t.nextDue='2026-11-01';const history=json(b.features.wins),due=t.nextDue,oldCalendar=t.calendarEnabled;
 const won=OCC.complete(b,t.id,M,now);assert.ok(b.features.wins.some(w=>w.id===won.id));assert.ok(OCC.seasonalGroups(b,now).flatMap(g=>g.tasks).includes(t));
 assert.equal(OCC.undo(b,t.id),true);assert.equal(t.nextDue,due);assert.equal(json(b.features.wins),history);assert.equal(t.calendarEnabled,oldCalendar);
 const reloaded=M.normalize(M.clone(b)),before=json(reloaded);assert.ok(OCC.seasonalGroups(reloaded,now).flatMap(g=>g.tasks).some(x=>x.id===t.id));assert.equal(json(reloaded),before);
});
test('four tabs have responsive 44px controls and cache-busted script/css versions',()=>{
 const css=read('css/quest-library.css'),html=read('index.html');
 assert.match(html,/js\/base-schedule-95\.js\?v=[^"]+-20261127/,'the changed Base Schedule has a fresh cache key');
 assert.match(css,/\.management-page \.library-tabs\{[^}]*repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:600px\)\{[^}]*\.management-page \.library-tabs\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.management-page \.library-tabs button\{[^}]*min-height:44px/);
 for(const name of ['js/app.js','js/occasional.js','css/quest-library.css'])assert.match(html,new RegExp(name.replace('.','\\.')+'\\?v=[^\"]+-seasonaltab1'+(name==='js/app.js'?'-kayleighwriting1-seasonal2a1-seasonal2b1-seasonal2c1-workloada2-christmasb1-seasonalshare1-taskcheck1-christmashome1-christmasb2a1-christmasb3a1-christmasart1-dolater1-christmastrees1-jingle1-fontcards1-taskcardart1-focusresume1-focusnav1-timeralarmfix1-focusbreak2-elapsedentry1-doingcollapse1-seasonalhomecomplete1-liftduedate1-petcaretabs1-littleoftenlayout1':'')+'"'));
});
test('Seasonal tab selection uses existing navigation and survives back-state eligibility',()=>{
 const b=seeded(),c=renderFixture(b),before=json(b);
 const text=source.match(/'library-tab':(el=>\{if\(\[[^\n]+?\}\}),/);
 assert.ok(text,'real tab handler');c.render=()=>{};c.rememberBackState=()=>{};
 const choose=vm.runInNewContext('('+text[1]+')',c);choose({dataset:{id:'seasonal'}});
 assert.equal(c.libraryTab,'seasonal');assert.match(c.questLibraryPage(),/Seasonal tasks/);
 for(const marker of ["['saved','custom','occasional','seasonal'].includes(view)","['saved','custom','occasional','seasonal'].includes(previous.libraryTab)","['saved','custom','occasional','seasonal'].includes(savedBack.libraryTab)"])assert.ok(source.includes(marker),marker);
 assert.equal(json(b),before);
});
test('seasonal completion displays exact Undo and future next date without losing historical wins',()=>{
 const b=seeded(),t=b.tasks.find(t=>t.title==='Halloween planning'),previousId='historic-nonseasonal';
 b.features.wins.push({id:previousId,taskId:'other',rootId:'other',at:'2026-10-01T12:00:00Z',title:'Unrelated',points:1});t.nextDue='2026-11-19';
 const old=t.nextDue,w=OCC.complete(b,t.id,M,now),c=renderFixture(b),html=c.questLibraryPage();
 assert.match(html,new RegExp('data-action="occasional-undo" data-id="'+t.id+'"'));
 assert.match(html,/Upcoming/);assert.ok(t.nextDue>today);assert.equal(b.features.wins.at(0).id,previousId);
 assert.equal(OCC.undo(b,t.id),true);assert.equal(t.nextDue,old);
 assert.doesNotMatch(c.questLibraryPage(),new RegExp('data-action="occasional-undo" data-id="'+t.id+'"'));
 assert.deepEqual(b.features.wins.map(x=>x.id),[previousId]);
});
// Generate self-contained, synthetic rendered fixtures without URLs or account data.
if(require.main===module&&process.env.NOVA_SEASONAL_FIXTURE){
 const out=path.resolve(process.env.NOVA_SEASONAL_FIXTURE);fs.mkdirSync(out,{recursive:true});
 const b=seeded();b.tasks.find(t=>t.title==='Christmas is coming').nextDue='2026-11-01';
 add(b,'fictional seasonal birthday',{title:'Birthday planning (set a date for each person)',section:'Seasonal',occasionKind:'',nextDue:'2027-05-19'});
 add(b,'seasonal custom long title',{title:'Check the long stairway decorations and winter bedding arrangements without assuming they are already due',section:'Seasonal',occasionKind:'',nextDue:''});
 add(b,'fictional nonseasonal recommended',{title:'Unrelated recommended check',occasionKind:'',checkDays:7,completedAt:'2026-10-01T10:00:00Z'});
 const c=renderFixture(b),css=['css/style.css','css/quest-library.css','css/mobile-tap-targets.css','css/dark-compact-surfaces.css'].map(read).join('\n');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="app"><header class="top"><h1>Task Library</h1></header><main>'+c.questLibraryPage()+'</main></div></body></html>';
 fs.writeFileSync(path.join(out,'seasonal-fixture.html'),html);
 c.libraryTab='occasional';const other='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="app"><header class="top"><h1>Task Library</h1></header><main>'+c.questLibraryPage()+'</main></div></body></html>';fs.writeFileSync(path.join(out,'occasional-fixture.html'),other);
}
