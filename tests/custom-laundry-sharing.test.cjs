'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const M=require('../js/model.js');
const S=require('../js/sharing-model.js');

const publishedRef='66182618d5ccba2127a3360398cc3fc92d07f76c';
const publishedSource=execFileSync('git',['show',publishedRef+':js/sharing-model.js'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
const publishedModule={exports:{}};
vm.runInNewContext(publishedSource,{TidyModel:M,module:publishedModule,require:id=>{if(id==='./model.js')return M;throw Error('Unexpected published sharing dependency: '+id);}},{filename:'sharing-model@66182618.js'});
const Published=publishedModule.exports;
const prefix='tidy-custom-laundry-load:';
const now=Date.parse('2026-11-27T12:00:00Z');
const empty=()=>({tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]});
const cycle=(b,name='Bedding')=>M.saveCustomCycle(b,'',{name,steps:['Wash bedding','Hang up','Put away'],reminderAfterFirst:true});
const rows=raw=>(raw.settings||[]).filter(row=>row.id?.startsWith(prefix));
const state=(base,native)=>({account:'synthetic',house:'synthetic-house',base,native:S.snapshot(native),hidden:[],initial:false,choices:{},retired:[]});
const publishedState=(base,native)=>({account:'synthetic',house:'synthetic-house',base,native:Published.snapshot(native),hidden:[],initial:false,choices:{},retired:[]});

test('custom load snapshots round-trip independently while cycle definitions stay local',()=>{
 const board=M.board(),def=cycle(board),first=M.startCustomLoad(board,def.id),second=M.startCustomLoad(board,def.id);
 const win=M.completeCustomStep(board,first.id,now);M.removeCustomCycle(board,def.id);
 const raw=S.project(board,{},'synthetic'),shared=rows(raw),imported=S.importRaw(raw);
 assert.equal(shared.length,2);
 assert.deepEqual(shared.map(row=>row.id).sort(),[prefix+first.id,prefix+second.id].sort());
 assert.ok(shared.every(row=>row.data.schemaVersion===1&&row.data.load.id===row.id.slice(prefix.length)));
 assert.deepEqual(imported.features.customLaundryLoads,board.features.customLaundryLoads);
 assert.deepEqual(imported.features.customLaundryCycles,[]);
 assert.ok(imported.features.wins.some(row=>row.id===win.id&&row.taskId==='laundry-custom:'+first.id+':0'));
 assert.ok(!raw.settings.some(row=>row.customLaundryCycles),'the cycle definition list is not shared');
});

test('one custom-load reminder pause syncs to another device while delivery timestamps stay local',()=>{
 const board=M.board(),def=cycle(board),paused=M.startCustomLoad(board,def.id),other=M.startCustomLoad(board,def.id);
 M.completeCustomStep(board,paused.id,now-7200000);M.completeCustomStep(board,other.id,now-7200000);
 paused.lastReminderAt=now-1800000;other.lastReminderAt=now-1200000;M.pauseLaundryReminder(paused,60,now);
 const raw=S.project(board,{},'synthetic'),shared=rows(raw),pausedRow=shared.find(row=>row.id===prefix+paused.id),otherRow=shared.find(row=>row.id===prefix+other.id);
 assert.equal(pausedRow.data.load.pauseUntil,now+3600000);assert.equal(pausedRow.data.load.pauseStep,1);
 assert.equal(otherRow.data.load.pauseUntil,undefined);assert.equal(pausedRow.data.load.lastReminderAt,undefined);assert.equal(otherRow.data.load.lastReminderAt,undefined);
 const peer=S.importRaw(raw),peerPaused=peer.features.customLaundryLoads.find(load=>load.id===paused.id),peerOther=peer.features.customLaundryLoads.find(load=>load.id===other.id);
 assert.equal(M.laundryReminderPaused(peerPaused,now+1000),true);assert.equal(M.customLaundryReminderDue(peerPaused,now+1000),false);assert.equal(M.customLaundryReminderDue(peerOther,now+1000),true);
 peerPaused.lastReminderAt=now-60000;const accepted=S.accept(peer,raw,{account:'synthetic',house:'synthetic-house',base:raw,native:S.snapshot(peer),hidden:[],initial:false,choices:{},retired:[]});
 assert.equal(accepted.features.customLaundryLoads.find(load=>load.id===paused.id).lastReminderAt,now-60000);
});

test('custom Undo delivery timestamps stay device-local through projection, merge, and acceptance',()=>{
 const board=M.board(),def=cycle(board),load=M.startCustomLoad(board,def.id);M.completeCustomStep(board,load.id,now);load.lastReminderAt=now+7200000;M.completeCustomStep(board,load.id,now+7200001);
 const base=S.project(board,{},'synthetic'),row=rows(base)[0];assert.equal(row.data.load.lastReminderAt,undefined);assert.equal(row.data.load.undo.lastReminderAt,undefined);
 const localPayload=M.clone(base),remotePayload=M.clone(base);rows(localPayload)[0].data.load.undo.lastReminderAt=now+7200100;rows(remotePayload)[0].data.load.undo.lastReminderAt=now+7200200;
 assert.deepEqual(S.merge(base,localPayload,remotePayload).conflicts,[],'device-local Undo timestamps do not cause a shared-load conflict');
 const local=M.clone(board);local.features.customLaundryLoads[0].undo.lastReminderAt=now+7200300;
 const incoming=M.clone(base);rows(incoming)[0].data.load.undo.lastReminderAt=now+7200400;
 const accepted=S.accept(local,incoming,{account:'synthetic',house:'synthetic-house',base:incoming,native:S.snapshot(local),hidden:[]});
 assert.equal(accepted.features.customLaundryLoads[0].undo.lastReminderAt,now+7200300,'same local Undo keeps its own delivery time');
 const noLocalUndo=M.clone(local);delete noLocalUndo.features.customLaundryLoads[0].undo;
 const freshAccept=S.accept(noLocalUndo,incoming,{account:'synthetic',house:'synthetic-house',base:incoming,native:S.snapshot(noLocalUndo),hidden:[]});
 assert.equal(freshAccept.features.customLaundryLoads[0].undo.lastReminderAt,0,'remote Undo delivery time is never restored');
});

test('first-sync and connected-household migration preserve existing IDs and are idempotent',()=>{
 const board=M.board(),def=cycle(board),load=M.startCustomLoad(board,def.id);M.completeCustomStep(board,load.id,now);
 const baseline=empty(),firstSync=S.outgoing(board,state(baseline,S.importRaw(baseline))),migratedOut=S.outgoing(board,state(baseline,board)),merged=S.merge(baseline,migratedOut,baseline);
 assert.equal(rows(firstSync).length,1);
 assert.equal(rows(migratedOut).length,1,'connected households must upload rows missing from the server base even when native and current boards match');
 assert.equal(migratedOut.wins.length,1,'a migrated custom load must include its completion record when its Undo reference is shared');
 assert.deepEqual(merged.conflicts,[]);
 const migrated=merged.payload;
 const imported=S.importRaw(migrated),again=S.project(imported,migrated,'synthetic');
 assert.equal(rows(migrated).length,1);
 assert.equal(rows(again).length,1);
 assert.equal(rows(again)[0].id,prefix+load.id);
 assert.deepEqual(rows(again)[0],rows(migrated)[0]);
});

test('accept replaces loads with the selected household while retaining device-local cycle definitions',()=>{
 const local=M.board(),localDef=cycle(local,'Local cycle'),localLoad=M.startCustomLoad(local,localDef.id);
 const selected=M.board(),selectedDef=cycle(selected,'Selected house cycle'),selectedLoad=M.startCustomLoad(selected,selectedDef.id);
 const payload=S.project(selected,{},'synthetic');
 const accepted=S.accept(local,payload,{account:'synthetic',house:'other-house',base:payload,native:S.snapshot(local),hidden:[]});
 assert.deepEqual(accepted.features.customLaundryLoads,[selectedLoad]);
 assert.deepEqual(accepted.features.customLaundryCycles,[localDef]);
 assert.ok(!accepted.features.customLaundryLoads.some(load=>load.id===localLoad.id));
});

test('independent devices can advance different custom loads without combining their state',()=>{
 const original=M.board(),def=cycle(original),one=M.startCustomLoad(original,def.id),two=M.startCustomLoad(original,def.id),base=S.project(original,{},'synthetic');
 const local=M.clone(original),remote=M.clone(original);
 M.completeCustomStep(local,one.id,now);M.completeCustomStep(remote,two.id,now+1000);
 const result=S.merge(base,S.project(local,base,'synthetic'),S.project(remote,base,'synthetic'));
 assert.deepEqual(result.conflicts,[]);
 const merged=S.importRaw(result.payload);
 assert.deepEqual(merged.features.customLaundryLoads.map(load=>load.step),[1,1]);
 assert.equal(merged.features.wins.length,2);
});

test('divergent changes to the same custom load stop atomically and preserve the remote branch',()=>{
 const original=M.board(),def=cycle(original),load=M.startCustomLoad(original,def.id),base=S.project(original,{},'synthetic');
 const local=M.clone(original),remote=M.clone(original);
 M.completeCustomStep(local,load.id,now);M.completeCustomStep(remote,load.id,now+1000);
 const remotePayload=S.project(remote,base,'synthetic'),result=S.merge(base,S.project(local,base,'synthetic'),remotePayload);
 assert.equal(result.conflicts.length,1);
 assert.deepEqual(result.payload,remotePayload);
 assert.equal(S.importRaw(result.payload).features.wins[0].id,remote.features.wins[0].id);
});

test('deleting an unchanged custom load is safe, but conflicts with a remote edit',()=>{
 const board=M.board(),def=cycle(board),load=M.startCustomLoad(board,def.id),base=S.project(board,{},'synthetic');
 const deleted=M.clone(base);deleted.settings=deleted.settings.filter(row=>row.id!==prefix+load.id);
 const safe=S.merge(base,deleted,base);
 assert.deepEqual(safe.conflicts,[]);
 assert.equal(rows(safe.payload).length,0);
 const changed=M.clone(base),row=rows(changed)[0];row.data.load.lastReminderAt=now;
 const conflict=S.merge(base,deleted,changed);
 assert.equal(conflict.conflicts.length,0,'device-local reminder delivery must not create a household conflict');
 assert.equal(rows(conflict.payload).length,0,'the unrelated explicit deletion remains authoritative');
});

test('an unchanged stale device cannot restore a pre-completion custom-load snapshot',()=>{
 const original=M.board(),def=cycle(original),load=M.startCustomLoad(original,def.id),base=S.project(original,{},'synthetic');
 const stale=S.importRaw(base),completed=M.clone(original);
 for(let i=0;i<load.steps.length;i++)M.completeCustomStep(completed,load.id,now+i*1000);
 const result=S.merge(base,S.outgoing(stale,state(base,stale)),S.project(completed,base,'synthetic'));
 assert.deepEqual(result.conflicts,[]);
 const accepted=S.importRaw(result.payload);
 assert.equal(accepted.features.customLaundryLoads[0].step,load.steps.length);
 assert.equal(accepted.features.wins.length,load.steps.length);
});

test('custom-load Undo removes only its matching win and shares the restored snapshot',()=>{
 const original=M.board(),def=cycle(original),load=M.startCustomLoad(original,def.id),win=M.completeCustomStep(original,load.id,now),base=S.project(original,{},'synthetic');
 const undone=M.clone(original);M.undoCustomStep(undone,load.id,win.id);
 const result=S.merge(base,S.project(undone,base,'synthetic'),base),accepted=S.importRaw(result.payload);
 assert.deepEqual(result.conflicts,[]);
 assert.equal(accepted.features.customLaundryLoads[0].step,0);
 assert.ok(!accepted.features.wins.some(row=>row.id===win.id));
});

test('an Undo racing remote progress conflicts and leaves both saved branches intact',()=>{
 const original=M.board(),def=cycle(original),load=M.startCustomLoad(original,def.id),first=M.completeCustomStep(original,load.id,now),base=S.project(original,{},'synthetic');
 const local=M.clone(original),remote=M.clone(original);
 M.undoCustomStep(local,load.id,first.id);const remoteWin=M.completeCustomStep(remote,load.id,now+1000);
 const localPayload=S.project(local,base,'synthetic'),remotePayload=S.project(remote,base,'synthetic');
 const result=S.merge(base,localPayload,remotePayload);
 assert.equal(result.conflicts.length,1);
 assert.deepEqual(result.payload,remotePayload);
 assert.equal(local.features.customLaundryLoads[0].step,0);
 assert.ok(!local.features.wins.some(win=>win.id===first.id));
 assert.equal(remote.features.customLaundryLoads[0].step,2);
 assert.ok(remote.features.wins.some(win=>win.id===first.id));
 assert.ok(remote.features.wins.some(win=>win.id===remoteWin.id));
});

test('published 66182618 client preserves unfamiliar custom-load settings already in base',()=>{
 const current=M.board(),def=cycle(current),load=M.startCustomLoad(current,def.id),base=S.project(current,{},'synthetic');
 const native=Published.importRaw(base),saved=Published.snapshot(native),oldClient=M.clone(native);M.add(oldClient,M.task({id:'legacy-client-edit',title:'Older client edit'}));
 const outgoing=Published.outgoing(oldClient,publishedState(base,saved));
 assert.equal(JSON.stringify(rows(outgoing)),JSON.stringify(rows(base)));
 assert.equal(JSON.stringify(rows(Published.merge(base,outgoing,base).payload)),JSON.stringify(rows(base)));
});

test('published 66182618 client preserves custom-load settings first received from the remote base',()=>{
 const oldBase=empty(),native=Published.importRaw(oldBase),saved=Published.snapshot(native),oldClient=M.clone(native);M.add(oldClient,M.task({id:'legacy-client-edit',title:'Older client edit'}));
 const current=M.board(),def=cycle(current),load=M.startCustomLoad(current,def.id),remote=S.project(current,oldBase,'synthetic');
 const outgoing=Published.outgoing(oldClient,publishedState(oldBase,saved));
 const merged=Published.merge(oldBase,outgoing,remote);
 assert.equal(merged.conflicts.length,0);
 assert.equal(JSON.stringify(rows(merged.payload)),JSON.stringify(rows(remote)));
});

test('standard pause is cycle-bound when the published older client transfers or starts a later wash',()=>{
 const board=M.board(),load=board.features.laundry[0];load.step=1;load.startedAt=now-7200000;load.revision=1;M.pauseLaundryReminder(load,30,now);
 const base=S.project(board,{},'synthetic'),native=Published.importRaw(base),saved=Published.snapshot(native),oldClient=M.clone(native);M.laundry(oldClient,load.slot);
 const outgoing=Published.outgoing(oldClient,publishedState(base,saved)),shared=outgoing.settings.find(row=>row.id==='laundry-load-'+load.slot);
 assert.equal(shared.currentStepId,'put-away');assert.equal(shared.reminderPauseUntil,now+1800000);assert.equal(shared.reminderPauseCycleStartedAt,load.startedAt,'the older client preserves unknown pause metadata while transferring');
 const transferred=S.importRaw(outgoing).features.laundry.find(item=>item.slot===load.slot);
 assert.equal(M.laundryReminderPaused(transferred,now+1000),false,'a pause for the transfer step is inactive on the put-away step');
 const later=M.clone(outgoing),laterRow=later.settings.find(row=>row.id==='laundry-load-'+load.slot),newStart=now+5000;
 laterRow.completedSteps=4;laterRow.currentStepId='transfer';laterRow.reminderStartedAt=new Date(newStart).toISOString();
 const nextWash=S.importRaw(later).features.laundry.find(item=>item.slot===load.slot);
 assert.equal(nextWash.step,1);assert.equal(nextWash.startedAt,newStart);assert.equal(nextWash.pauseUntil,undefined,'stale older-client pause is dropped when its wash-cycle identity differs');assert.equal(M.laundryReminderPaused(nextWash,now+6000),false);
});

test('starting a custom load queues household sync after it becomes shareable',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
 assert.match(source,/'custom-load-start':el=>change\(b=>M\.startCustomLoad\(b,el\.dataset\.id\)\)/);
});
