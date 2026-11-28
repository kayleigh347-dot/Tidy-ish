'use strict';
// Exercises the actual action handlers and save path without a browser or live household.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const M=require('../js/model.js');
const S=require('../js/sharing-model.js');
const TSC=require('../js/local-storage-codec.js');
const TIME=require('../js/quest-time-core.js');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const clone=M.clone;
function line(prefix){
 const row=source.split('\n').find(s=>s.startsWith(prefix));
 assert.ok(row,'Missing '+prefix);return row;
}
function section(start,end){
 const a=source.indexOf(start),z=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&z>a,'Missing source section '+start);return source.slice(a,z);
}
const menu=section("'task-menu':el=>",',search:()=>');
const forward=section("'move-side-quest':el=>",',expand:el=>');
const reverse=line(" 'move-main-task':").trim().replace(/,$/,'');
const actual=[line('const room='),line('const button='),line('const stopwatch='),
 line('function persist('),line('function stampTaskEdits('),line('function change('),line('function confirmDialog('),
 section('function mainTaskMoveBlocker(','function taskEditorTabs('),section('function visibleTasks(','function taskList('),
 section('function homelessPage(','\nfunction '),
 `this.actions={${menu},${forward},${reverse}};this.visibleTasks=visibleTasks;this.homelessPage=homelessPage;`].join('\n');
function setup(board){
 let stored=TSC.encode(board),dialog=null,writes=0,closes=0,queues=0,fail=false;
 const notices=[],errors=[];
 const ctx={board,M,TSC,TIME,route:'side',roomId:'kitchen',tab:'side',sideTab:'all',search:'',doingTab:'all',
  V:null,SW:null,Q:null,focusBreakTimer:null,storageError:'',KEY:'synthetic-board',lastSaved:stored,
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  safeImage:()=>'',field:()=>'',card:x=>x,taskList:rows=>rows.map(t=>`<i data-task-id="${t.id}"></i>`).join(''),
  localStorage:{getItem:()=>stored,setItem:(_key,value)=>{if(fail)throw Error('Simulated storage failure');stored=value;writes++;}},
  window:{TidySharing:{transition:S.transition,queue(){queues++;}}},
  dialog:(title,body,onSave,options)=>{dialog={title,body,onSave,options};},
  closeDialog:()=>{closes++;dialog=null;},render(){},cancelStaleLaundryReminderAudio(){},
  notice:message=>notices.push(message),showDialogSaveError:message=>errors.push(message)};
 vm.runInNewContext(actual,ctx,{filename:'app.js task option handlers'});
 const click=(action,id)=>ctx.actions[action]({dataset:{action,id}});
 const open=id=>{click('task-menu',id);return dialog.body;};
 const confirm=()=>{assert.ok(dialog?.onSave,'Expected confirmation');dialog.onSave();};
 return {ctx,click,open,confirm,get dialog(){return dialog;},get writes(){return writes;},get closes(){return closes;},get queues(){return queues;},
  get stored(){return stored;},notices,errors,failSave(){fail=true;},cancel(){ctx.closeDialog();}};
}
function fixture(side=false){
 const b=M.board(),root=M.task({id:'root',room:'kitchen',title:'Sort shelves',side,sideKind:side?'custom-category':'organisation',
  notes:'Keep these notes',tools:'Cloth',estimate:23,priority:2,assigned:'Test member',dueDate:'2099-02-01',repeatDays:7,
  doing:true,attention:true,children:[M.child({id:'parent',title:'Shelf'}),M.child({id:'nested',parentId:'parent',title:'Upper shelf',elapsed:120000}),M.child({id:'remaining',parentId:'parent',title:'Lower shelf'})]});
 M.add(b,M.task({id:'other',room:'living',title:'Other task'}));M.add(b,root);
 M.completeChild(b,root.id,'nested',true);
 b.features.sideTabs.push({id:'custom-category',name:'Custom category'});
 return b;
}
const task=(b,id='root')=>b.tasks.find(t=>t.id===id);
const ids=rows=>Array.from(rows,t=>t.id);
const keys=markup=>Array.from(markup.matchAll(/data-action="([^"]+)"/g),m=>m[1]);
function withoutStamp(t){const out=clone(t);delete out.syncUpdatedAt;return out;}
function expectedTask(t,side){return {...withoutStamp(t),side,sideKind:'organisation'};}
function assertOnlyMove(before,after,side){
 assert.deepEqual(ids(after.tasks),ids(before.tasks));
 assert.deepEqual(withoutStamp(task(after)),expectedTask(task(before),side));
 assert.deepEqual(task(after,'other'),task(before,'other'));
 assert.deepEqual(after.doingOrder,before.doingOrder);
 assert.deepEqual(after.rooms,before.rooms);
 assert.deepEqual(after.features,before.features);
}

test('main and Sidequests menus expose exactly the corresponding move action; other actions remain in place',()=>{
 const main=setup(fixture(false)),side=setup(fixture(true));
 const expected=['edit-task','move-side-quest','add-child','timer','data-open-task','save-template','pause-task','delete-task'];
 assert.deepEqual(keys(main.open('root')),expected);
 assert.deepEqual(keys(side.open('root')),expected.map(k=>k==='move-side-quest'?'move-main-task':k));
 assert.match(side.open('root'),/>Move to main task<\/button>/);
 assert.match(main.open('root'),/>Move to Side Task<\/button>/);
 assert.equal(main.writes+side.writes,0);
});

test('confirmed reverse move changes only side membership and category, persists the existing family/history, and moves between actual room lists',()=>{
 const before=fixture(true),h=setup(before),savedBefore=h.stored;
 const inRoom=(side)=>ids(h.ctx.visibleTasks('room','kitchen',side?'side':'tasks'));
 assert.deepEqual(inRoom(true),['root']);assert.deepEqual(inRoom(false),[]);
 assert.deepEqual(ids(h.ctx.visibleTasks('side')),['root']);
 h.click('move-main-task','root');assert.match(h.dialog.title,/Move to main task/);assert.match(h.dialog.body,/Kitchen Tasks/);
 assert.equal(h.stored,savedBefore);assert.equal(h.writes,0);h.confirm();
 assert.equal(h.writes,1);assert.equal(h.queues,1);assert.equal(h.closes,1);
 assertOnlyMove(before,h.ctx.board,false);
 assert.deepEqual(TSC.decode(h.stored),h.ctx.board);
 assert.deepEqual(withoutStamp(task(M.normalize(TSC.decode(h.stored)))),expectedTask(task(before),false));
 assert.deepEqual(inRoom(true),[]);assert.deepEqual(inRoom(false),['root']);
 assert.deepEqual(ids(h.ctx.visibleTasks('side')),[]);
 assert.match(h.open('root'),/data-action="move-side-quest"/);
});

test('existing forward move and reverse move can round-trip the same root and nested child identities without duplicate tasks or new wins',()=>{
 const before=fixture(false),h=setup(before);
 h.click('move-side-quest','root');assert.match(h.dialog.title,/Move to Side Task/);h.confirm();
 assertOnlyMove(before,h.ctx.board,true);
 h.click('move-main-task','root');h.confirm();assertOnlyMove(before,h.ctx.board,false);
 assert.equal(h.writes,2);assert.equal(h.ctx.board.tasks.filter(t=>t.id==='root').length,1);
 assert.equal(h.ctx.board.features.wins.length,before.features.wins.length);
});

test('cancel and failed local storage leave all saved data unchanged; successful notice is not emitted',()=>{
 const b=fixture(true),h=setup(b),saved=h.stored;
 h.click('move-main-task','root');h.cancel();assert.equal(h.stored,saved);assert.equal(h.writes,0);
 h.click('move-main-task','root');h.failSave();h.confirm();
 assert.equal(h.stored,saved);assert.deepEqual(h.ctx.board,b);assert.equal(h.writes,0);assert.equal(h.queues,0);
 assert.ok(h.dialog);assert.deepEqual(h.errors,['Simulated storage failure']);assert.ok(!h.notices.includes('Moved to Main Tasks'));
});

test('roomless tasks stay roomless in the existing Homeless list; unavailable rooms do not permit an unsafe move',()=>{
 const b=fixture(true);task(b).room='';const h=setup(b);
 h.click('move-main-task','root');assert.match(h.dialog.body,/Homeless task list/);h.confirm();
 assertOnlyMove(b,h.ctx.board,false);assert.match(h.ctx.homelessPage(h.ctx.board.rooms[0]),/data-task-id="root"/);
 for(const room of ['missing-room','kitchen']){
  const b=fixture(true);task(b).room=room;if(room==='kitchen')b.rooms.find(r=>r.id===room).archived=true;
  const h=setup(b);assert.doesNotMatch(h.open('root'),/data-action="move-main-task"/);
  h.click('move-main-task','root');assert.match(h.notices.at(-1),/available room/);assert.equal(h.writes,0);
 }
});

test('stale confirmation after destination becomes invalid cannot save or duplicate a task',()=>{
 const h=setup(fixture(true));h.click('move-main-task','root');h.ctx.board.rooms.find(r=>r.id==='kitchen').archived=true;
 h.confirm();assert.equal(h.writes,0);assert.equal(task(h.ctx.board).side,true);assert.match(h.errors.at(-1),/available room/);
 const j=setup(fixture(true));j.click('move-main-task','root');task(j.ctx.board).side=false;j.confirm();
 assert.equal(j.writes,0);assert.match(j.errors.at(-1),/no longer in Side Tasks/);
});

function sharedState(base,board){return {account:'synthetic',house:'synthetic-house',base:clone(base),native:S.snapshot(board),hidden:[],initial:false,choices:{},retired:[]};}
const rawIds=rows=>rows.map(row=>row.id).sort();

test('synthetic household forward and reverse projections retain family IDs and completion links with no duplicate rows',()=>{
 const b=fixture(false),raw=S.project(b,{},'synthetic'),initial=S.importRaw(raw);
 initial.features.browserSync=sharedState(raw,initial);const h=setup(initial);
 h.click('move-side-quest','root');h.confirm();
 const sideRaw=S.outgoing(h.ctx.board,h.ctx.board.features.browserSync);
 assert.deepEqual(rawIds(sideRaw.tasks),['other']);assert.deepEqual(rawIds(sideRaw.side),['nested','parent','remaining','root']);
 // The same local pending move may also be reversed before a household save.
 h.click('move-main-task','root');h.confirm();
 const pending=S.outgoing(h.ctx.board,h.ctx.board.features.browserSync);
 assert.deepEqual(rawIds(pending.tasks),rawIds(raw.tasks));assert.deepEqual(rawIds(pending.side),[]);
 // Simulate the accepted forward payload and then the separate reverse move.
 const received=S.importRaw(sideRaw);received.features.browserSync=sharedState(sideRaw,received);const j=setup(received);
 j.click('move-main-task','root');j.confirm();const out=S.outgoing(j.ctx.board,j.ctx.board.features.browserSync);
 assert.deepEqual(rawIds(out.tasks),rawIds(raw.tasks));assert.deepEqual(rawIds(out.side),[]);
 const beforeWins=raw.wins.map(w=>[w.id,w.taskId,w.rootTaskId,w.points,w.at,w.measuredMinutes]);
 assert.deepEqual(out.wins.map(w=>[w.id,w.taskId,w.rootTaskId,w.points,w.at,w.measuredMinutes]),beforeWins);
 const restored=S.importRaw(out),t=task(restored);
 assert.equal(t.room,'kitchen');assert.equal(t.notes,task(b).notes);assert.equal(t.estimate,23);assert.equal(t.side,false);
 assert.equal(t.children.find(c=>c.id==='nested').parentId,'parent');assert.equal(t.children.find(c=>c.id==='nested')._winId,b.features.wins[0].id);
});

test('legacy shared ID collisions, including hidden main rows and nested child collisions, block the reverse move',()=>{
 const b=fixture(true),raw=S.project(b,{},'synthetic');raw.tasks.push({...raw.side.find(t=>t.id==='root'),text:'Different main task'});
 const imported=S.importRaw(raw);imported.features.browserSync=sharedState(raw,imported);
 const h=setup(imported);assert.doesNotMatch(h.open('web-side:root'),/data-action="move-main-task"/);
 h.click('move-main-task','web-side:root');assert.match(h.notices.at(-1),/conflicting household task ID/);assert.equal(h.writes,0);
 const hidden=fixture(true),base=S.project(hidden,{},'synthetic');base.tasks.push({...base.side.find(t=>t.id==='root'),text:'Hidden main task'});
 hidden.features.browserSync=sharedState(base,hidden);const j=setup(hidden);
 assert.doesNotMatch(j.open('root'),/data-action="move-main-task"/);assert.equal(j.writes,0);
 const child=fixture(true),childRaw=S.project(child,{},'synthetic');childRaw.tasks.push({...childRaw.side.find(t=>t.id==='nested'),parentId:null,text:'Different task'});
 const childImported=S.importRaw(childRaw),k=setup(childImported);
 assert.doesNotMatch(k.open('root'),/data-action="move-main-task"/);assert.equal(k.writes,0);
});

test('new action is registered once, routed through existing dispatch, and app cache suffix is current',()=>{
 assert.equal((source.match(/'move-main-task':moveToMainTask/g)||[]).length,1);
 assert.match(source,/const action=actions\[el\.dataset\.action\]/);
 assert.equal((html.match(/src="js\/app\.js\?v=[^"]+-clearway-links1-movemain1-dragchildline2"/g)||[]).length,1);
});
