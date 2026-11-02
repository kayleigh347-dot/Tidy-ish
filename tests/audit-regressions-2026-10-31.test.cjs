const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js');
require('../js/quest-memory.js');
const Rec=require('../js/quest-recommendations.js');
const Share=require('../js/sharing-model.js');
require('../js/base-schedule-95.js');
const Occ=require('../js/occasional.js');
const on=date=>new Date(date+'T10:00:00Z');

test('completed recurring cleaning becomes recommended once review interval passes, without erasing history',()=>{
 const b=M.board(),t=M.task({id:'review-clean',room:'kitchen',title:'Wipe kitchen cabinets',done:true,completedAt:on('2026-08-01').toISOString(),checkDays:30,priority:1});
 M.add(b,t);b.features.wins.push({id:'old-completion',taskId:t.id,rootId:t.id,points:1,at:t.completedAt});
 const before=JSON.stringify(b);
 assert.deepEqual(Rec.rank(b,{now:on('2026-08-30')}).map(x=>x.id),[]);
 assert.deepEqual(Rec.rank(b,{now:on('2026-09-02')}).map(x=>x.id),['review-clean']);
 assert.equal(JSON.stringify(b),before,'passive recommendation must not mutate the saved board');
 M.reactivate(b,t.id);
 assert.equal(t.done,false);
 assert.deepEqual(b.features.wins.map(w=>w.id),['old-completion']);
 M.finish(b,t.id,true);assert.equal(b.features.wins.length,2);
});

test('completed recurring cleaning without explicit check interval returns when next due date passes',()=>{
 const b=M.board(),t=M.task({id:'recurring',room:'living',title:'Wipe shelf',done:true,completedAt:on('2026-10-01').toISOString(),nextDue:'2026-11-01',repeatMonths:1});M.add(b,t);
 assert.equal(Rec.rank(b,{now:on('2026-10-31')}).some(x=>x.id===t.id),false);
 assert.equal(Rec.rank(b,{now:on('2026-11-01')}).some(x=>x.id===t.id),true);
});

test('occasional Undo metadata survives actual shared export/import and preserves points until undone',()=>{
 const b=M.board(),t=M.task({id:'quarterly',title:'Clean extractor',room:'kitchen',occasionKind:'occasional',repeatMonths:3,nextDue:'2026-11-01'});M.add(b,t);
 Occ.complete(b,t.id,M,on('2026-11-03'));
 const roundtrip=Share.importRaw(Share.project(b,{},'house-member'));
 assert.equal(roundtrip.tasks[0]._occasionalUndo.nextDue,'2026-11-01');
 assert.equal(roundtrip.features.wins.length,1);
 assert.equal(Occ.undo(roundtrip,t.id),true);
 assert.equal(roundtrip.tasks[0].nextDue,'2026-11-01');
 assert.equal(roundtrip.features.wins.length,0);
});

test('deleted occasional task is retired from shared collection but historical wins remain',()=>{
 const original=M.board(),t=M.task({id:'oc-delete',title:'Clean cupboard',room:'kitchen',occasionKind:'occasional',repeatMonths:6});M.add(original,t);
 original.features.wins.push({id:'historic-win',taskId:t.id,rootId:t.id,room:t.room,title:t.title,at:on('2026-10-01').toISOString(),points:1});
 const base=Share.project(original,{},'acct');
 const next=M.clone(original);next.features.browserSync={account:'acct',house:'house',base,native:Share.snapshot(original),retired:[],hidden:[],initial:false};
 next.tasks=[];Share.transition(original,next);
 assert.deepEqual(next.features.browserSync.retired,['tasks/oc-delete']);
 const outgoing=Share.outgoing(next,next.features.browserSync);
 assert.equal(outgoing.tasks.length,0);
 assert.deepEqual(outgoing.wins.map(x=>x.id),['historic-win']);
 const merged=Share.merge(base,outgoing,base);
 assert.equal(merged.conflicts.length,0);
 assert.equal(merged.payload.tasks.length,0);
});

test('ordinary deleted quests stay member-local, not deleted for everyone',()=>{
 const b=M.board();M.add(b,M.task({id:'normal',title:'Unrelated',room:'kitchen'}));
 const raw=Share.project(b,{},'acct'),next=M.clone(b);
 next.features.browserSync={account:'acct',house:'house',base:raw,native:Share.snapshot(b),retired:[],hidden:[],initial:false};
 next.tasks=[];Share.transition(b,next);
 assert.deepEqual(next.features.browserSync.retired,[]);
 assert.equal(Share.outgoing(next,next.features.browserSync).tasks.length,1);
});

test('saved templates, hidden choices, supplies and Clear the Way definitions survive household round trip and acceptance',()=>{
 const b=M.board();
 b.features.templates=[M.task({id:'tmpl',title:'Favorite tidy',room:'living',tags:['routine']})];
 b.features.hiddenTemplates=['old-template'];
 b.features.tools=['Microfibre cloths','Magic Erasers'];
 b.features.routines=[{id:'routine-custom',room:'living',name:'Fast clear',steps:['Collect bagged items'],scope:'shared'}];
 b.features.occasionalDefaultsInitialised=true;
 const raw=Share.project(b,{},'acct'),imported=Share.importRaw(raw);
 for(const key of ['templates','hiddenTemplates','tools','routines','occasionalDefaultsInitialised'])assert.deepEqual(imported.features[key],b.features[key],key);
 const current=M.board();current.features.browserSync={account:'acct',house:'house',base:raw,native:Share.snapshot(current),hidden:[],choices:[],initial:false};
 const accepted=Share.accept(current,raw,current.features.browserSync);
 for(const key of ['templates','hiddenTemplates','tools','routines','occasionalDefaultsInitialised'])assert.deepEqual(accepted.features[key],b.features[key],key);
});

test('existing household receives all Base occasional defaults once and deleted defaults stay removed',()=>{
 const b=M.board();M.add(b,M.task({id:'existing',title:'My original task',room:'living'}));
 const result=Occ.seed(b,M,on('2026-10-31'));
 assert.equal(result.added,Occ.OWNER_ROWS.length);
 assert.equal(b.tasks.filter(t=>t.occasionKind==='occasional'&&t.calendarEnabled===true).length,Occ.OWNER_ROWS.length);
 const one=b.tasks.find(t=>t.occasionKind==='occasional');const oldId=one.id;
 b.tasks=b.tasks.filter(t=>t.id!==oldId);
 assert.equal(Occ.seed(b,M,on('2026-11-01')).added,0);
 assert.equal(b.tasks.some(t=>t.id===oldId),false);
 assert.equal(b.tasks.some(t=>t.id==='existing'),true);
});

test('mock household sync publishes edited supplies without deleting unrelated remote tasks',async()=>{
 const initial=M.board();M.add(initial,M.task({id:'r-1',title:'Living room task',room:'living'}));
 const base=Share.project(initial,{},'acct');
 const local=M.clone(initial);
 local.features.tools=['Microfibre cloths','Magic Erasers'];
 local.features.browserSync={account:'acct',house:'house',base,native:Share.snapshot(initial),retired:[],hidden:[],choices:{},initial:false};
 const remote=structuredClone(base);remote.tasks[0].notes='Edited on second device';
 let saved;
 const result=await Share.synchronize(local,async()=>({account:'acct',house:'house',payload:remote}),async(_server,payload)=>{saved=payload;return true});
 assert.deepEqual(result.conflicts,[]);
 assert.deepEqual(Share.importRaw(saved).features.tools,['Microfibre cloths','Magic Erasers']);
 assert.equal(Share.importRaw(saved).tasks[0].notes,'Edited on second device');
 assert.deepEqual(result.accepted.features.tools,['Microfibre cloths','Magic Erasers']);
});

test('concurrent completion stays a visible conflict until a member chooses a branch',()=>{
 const initial=M.board();M.add(initial,M.task({id:'shared-completion',title:'Wipe the kitchen table',room:'kitchen'}));
 const base=Share.project(initial,{},'acct'),local=M.clone(initial),remote=M.clone(initial);
 M.finish(local,'shared-completion',true);M.finish(remote,'shared-completion',true);
 const mine=Share.project(local,base,'acct'),theirs=Share.project(remote,base,'acct');
 const choices={},seen=[];let resolved;
 for(let i=0;i<3;i++){
  resolved=Share.merge(base,mine,theirs,choices);seen.push(...resolved.conflicts.map(x=>x.key));
  if(!resolved.conflicts.length)break;
  for(const conflict of resolved.conflicts)choices[conflict.key]={token:conflict.token,side:'local'};
 }
 assert.deepEqual(seen,['tasks/shared-completion/completion','tasks/shared-completion/htmlCompletionIds']);
 assert.deepEqual(resolved.conflicts,[]);
 assert.equal(resolved.payload.wins.length,1,'the explicitly resolved task completion cannot duplicate points');
 assert.equal(resolved.payload.wins[0].id,mine.wins[0].id,'the chosen branch is accepted after review');
});

test('mock household sync propagates an occasional deletion with no loss of past wins',async()=>{
 const initial=M.board(),t=M.task({id:'r-oc',title:'Deep clean',room:'living',occasionKind:'occasional',repeatMonths:6});M.add(initial,t);
 initial.features.wins.push({id:'historic',taskId:t.id,rootId:t.id,title:t.title,room:t.room,at:on('2026-10-01').toISOString(),points:1});
 const base=Share.project(initial,{},'acct'),local=M.clone(initial);
 local.features.browserSync={account:'acct',house:'house',base,native:Share.snapshot(initial),retired:[],hidden:[],choices:{},initial:false};
 local.tasks=[];Share.transition(initial,local);
 const result=await Share.synchronize(local,async()=>({account:'acct',house:'house',payload:base}),async()=>true);
 assert.deepEqual(result.conflicts,[]);
 assert.equal(result.payload.tasks.length,0);
 assert.deepEqual(result.payload.wins.map(x=>x.id),['historic']);
 assert.equal(result.accepted.tasks.length,0);
 assert.deepEqual(result.accepted.features.wins.map(x=>x.id),['historic']);
});

test('conflicting remote task edits do not silently override an intentional occasional deletion',()=>{
 const original=M.board();M.add(original,M.task({id:'job',title:'Deep clean',room:'kitchen',occasionKind:'occasional',repeatMonths:6}));
 const base=Share.project(original,{},'acct'),local=M.clone(original),state={base,native:Share.snapshot(original),account:'acct',retired:[]};
 local.tasks=[];state.retired=['tasks/job'];const outgoing=Share.outgoing(local,state);
 const remote=structuredClone(base);remote.tasks[0].text='Changed on a different device';
 const result=Share.merge(base,outgoing,remote);
 assert.ok(result.conflicts.some(x=>x.key==='tasks/job/record'));
 assert.equal(result.payload.tasks[0].text,'Changed on a different device');
});
