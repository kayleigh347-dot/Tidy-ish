'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model.js'),SW=require('../js/seasonal-workflow.js'),S=require('../js/sharing-model.js'),F=require('../js/fresh-house-core.js'),C=require('../js/local-storage-codec.js');
const today='2026-11-25',house='synthetic-house',draft={...SW.preset('christmas','2026-12-25'),preset:'christmas',recurrence:'annual',dateRule:'fixed',leapPolicy:'reject',annualEnabled:true,tasksEnabled:true,decorationsEnabled:true,celebrated:false};
function fixture(){const b=M.board();M.add(b,M.task({id:'ordinary',title:'Ordinary',doing:true}));b.features.giftPeople.push({id:'person',name:'Example',tracker:true});let raw=S.project(b,{},'alice'),rev=1;function member(account){const n=S.importRaw(M.clone(raw));n.features.browserSync={account,house,base:M.clone(raw),native:S.snapshot(n),initial:false,hidden:[],choices:{},conflicts:[],retired:[]};return n;}
 async function sync(b){const account=b.features.browserSync.account;const result=await S.synchronize(b,async()=>({account,house,revision:rev,payload:M.clone(raw)}),async(remote,payload)=>{assert.equal(remote.revision,rev);raw=M.clone(payload);rev++;return true;});assert.deepEqual(result.conflicts,[]);return result.accepted;}
 return {member,sync,raw:()=>M.clone(raw),revision:()=>rev};}
const oid=b=>b.features.occasionOccurrences[0].id,wrap=b=>b.tasks.find(t=>t.title==='Wrap gifts'),gift=b=>SW.christmasContext(b,oid(b),today).gifts[0],points=b=>b.features.wins.reduce((n,w)=>n+w.points,0);
const add=(b,title='Gift')=>SW.christmasGiftChange(b,oid(b),'save',{recipientId:'person',title,price:'3',receiptStatus:'received',noWrapping:false},today);
test('connected creation, Home countdown and activated tasks round-trip across two household members',async()=>{const f=fixture();let a=f.member('alice'),b=f.member('bob');assert.equal(SW.shareReady(a),true);a=SW.reconcile(SW.create(a,draft),today).board;assert.equal(SW.activeGroups(a,today)[0].countdown,true);assert.ok(SW.activeGroups(a,today)[0].tasks.some(t=>t.title==='Buy gifts'));a=await f.sync(a);b=await f.sync(b);assert.equal(oid(a),oid(b));assert.deepEqual(b.features.occasionPlans,a.features.occasionPlans);assert.deepEqual(b.tasks.map(t=>t.id),a.tasks.map(t=>t.id));assert.equal(wrap(b).section,'Seasonal');assert.ok(SW.activeGroups(b,today)[0].tasks.some(t=>t.title==='Buy gifts'));assert.equal(SW.reconcile(b,today).changed,false);assert.equal(b.tasks.find(t=>t.id==='ordinary').doing,true);const restored=M.normalize(C.decode(C.encode(b)));assert.equal(SW.shareReady(restored),true);assert.equal(oid(restored),oid(b));});
test('receipt, completion, second receipt reopening and Undo preserve IDs and older wins across devices',async()=>{const f=fixture();let a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),b=await f.sync(f.member('bob'));const id=wrap(a).id;a=await f.sync(add(a));b=await f.sync(b);assert.equal(wrap(b).doing,true);assert.equal(wrap(b).id,id);b=SW.christmasGiftChange(b,oid(b),'wrap',{id:gift(b).id},today);M.finish(b,id,true);b=await f.sync(b);a=await f.sync(a);const oldWins=M.clone(a.features.wins),p=points(a);assert.ok(p>0);assert.equal(wrap(a).done,true);a=await f.sync(add(a,'Second gift'));b=await f.sync(b);assert.equal(wrap(b).done,false);assert.equal(points(b),p);M.finish(b,id,true);b=await f.sync(b);a=await f.sync(a);assert.equal(points(a),2*p);M.finish(a,id,false);a=await f.sync(a);b=await f.sync(b);assert.equal(points(b),p);assert.deepEqual(b.features.wins.map(w=>w.id),oldWins.map(w=>w.id));assert.equal(wrap(b).done,false);});
test('simultaneous first creation chooses newest saved Seasonal edit without duplicate tasks',async()=>{
 const f=fixture();let a=SW.reconcile(SW.create(f.member('alice'),draft),today).board,b=SW.reconcile(SW.create(f.member('bob'),draft),today).board;
 a.features.seasonalEditedAt='2026-11-25T15:00:00Z';b.features.seasonalEditedAt='2026-11-25T15:00:10Z';
 const chosen=oid(b),loserIds=new Set(a.tasks.filter(t=>t.section==='Seasonal').map(t=>t.id));
 a=await f.sync(a);b=await f.sync(b);a=await f.sync(a);
 assert.equal(oid(a),chosen);assert.equal(oid(b),chosen);assert.equal(a.features.occasionOccurrences.length,1);
 assert.deepEqual(new Set(a.tasks.map(t=>t.id)),new Set(b.tasks.map(t=>t.id)));
 assert.equal(a.tasks.filter(t=>t.section==='Seasonal').length, b.tasks.filter(t=>t.section==='Seasonal').length);
 assert.ok(a.tasks.filter(t=>t.section==='Seasonal').every(t=>!loserIds.has(t.id)));
 assert.equal(a.tasks.find(t=>t.id==='ordinary').title,'Ordinary');
});
test('simultaneous Seasonal updates choose the later timestamp, remote on an exact tie',()=>{
 const f=fixture();let a=SW.create(f.member('alice'),draft),b=SW.create(f.member('bob'),draft),base=f.raw();
 a.features.seasonalEditedAt='2026-11-25T10:00:01Z';b.features.seasonalEditedAt='2026-11-25T10:00:02Z';
 const ra=S.outgoing(a,a.features.browserSync),rb=S.outgoing(b,b.features.browserSync);
 let m=S.merge(base,ra,rb);assert.deepEqual(m.conflicts,[]);assert.equal(m.payload.settings.find(r=>r.id==='tidy-seasonal-plans-v1').data.occasionOccurrences[0].id,oid(b));
 ra.settings.find(r=>r.id==='tidy-seasonal-plans-v1').updatedAt='2026-11-25T10:00:02Z';ra.settings.find(r=>r.id==='tidy-seasonal-plans-v1').data.updatedAt='2026-11-25T10:00:02Z';
 m=S.merge(base,ra,rb);assert.equal(m.payload.settings.find(r=>r.id==='tidy-seasonal-plans-v1').data.occasionOccurrences[0].id,oid(b));
});
test('pending differences UI and manual conflict actions are absent from household settings',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require('node:path').join(__dirname,'../js/sharing.js'),'utf8');
 assert.doesNotMatch(ui,/Pending differences|house-conflict|Keep browser version|Use household version/);
});
test('a concurrent unrelated task change merges without blocking a Seasonal create',async()=>{const f=fixture();let a=SW.reconcile(SW.create(f.member('alice'),draft),today).board,b=f.member('bob');b.tasks.find(t=>t.id==='ordinary').title='Ordinary updated';b=await f.sync(b);a=await f.sync(a);b=await f.sync(b);assert.equal(b.tasks.find(t=>t.id==='ordinary').title,'Ordinary updated');assert.equal(oid(b),oid(a));});
test('old local-only plans stay local and invalid remote plans cannot replace existing data',async()=>{const f=fixture();const local=SW.create(M.board(),draft),a=f.member('alice');Object.assign(a.features,{occasionPlans:local.features.occasionPlans,occasionTemplates:local.features.occasionTemplates,occasionOccurrences:local.features.occasionOccurrences});assert.equal(SW.shareReady(a),false);assert.equal(S.project(a,a.features.browserSync.base,'alice').settings.some(r=>r.id==='tidy-seasonal-plans-v1'),false);assert.throws(()=>SW.create(a,{...draft,name:'Another'}),/local-only/);const accepted=await f.sync(a);assert.deepEqual(accepted.features.occasionPlans,a.features.occasionPlans);const bad=f.raw();bad.settings.push({id:'tidy-seasonal-plans-v1',data:{occasionTemplates:[],occasionOccurrences:[{id:'bad'}]}});assert.throws(()=>S.importRaw(bad),/Invalid saved Seasonal/);});
test('fresh household task transfer does not disclose old occasion plans',async()=>{const f=fixture();const a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),before=JSON.stringify(a);const result=F.prepare(a,'alice','all');assert.equal(result.payload.settings.some(r=>r.id==='tidy-seasonal-plans-v1'),false);assert.deepEqual(result.local.features.occasionOccurrences,a.features.occasionOccurrences);assert.equal(result.local.features.seasonalSharedHouse,undefined);assert.equal(JSON.stringify(a),before);});
test('receive and complete again before intermediate sync still creates a new Undo cycle',async()=>{const f=fixture();let a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),b=await f.sync(f.member('bob'));const id=wrap(a).id;a=await f.sync(add(a));M.finish(a,id,true);a=await f.sync(a);b=await f.sync(b);const oldWins=b.features.wins.map(w=>w.id),p=points(b);b=add(b,'Second gift');assert.equal(wrap(b).done,false);M.finish(b,id,true);b=await f.sync(b);a=await f.sync(a);assert.equal(points(a),2*p);assert.ok(wrap(a)._completionIds.every(x=>!oldWins.includes(x)));M.finish(a,id,false);a=await f.sync(a);assert.deepEqual(a.features.wins.map(w=>w.id),oldWins);});
test('simultaneous identical activation uses the same annual identity and no duplicate tasks',async()=>{const f=fixture();let a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),b=await f.sync(f.member('bob'));a=SW.reconcile(a,'2027-11-25').board;b=SW.reconcile(b,'2027-11-25').board;const year=a.features.occasionOccurrences.find(x=>x.eventDate==='2027-12-25');assert.ok(year);assert.equal(b.features.occasionOccurrences.find(x=>x.eventDate==='2027-12-25').id,year.id);for(const t of a.tasks)t.syncUpdatedAt='2027-11-25T10:00:00Z';for(const t of b.tasks)t.syncUpdatedAt='2027-11-25T10:00:01Z';a=await f.sync(a);b=await f.sync(b);assert.equal(b.features.occasionOccurrences.filter(x=>x.eventDate==='2027-12-25').length,1);assert.equal(b.tasks.length,a.tasks.length);});
test('a linked gift deletion is received on a second device without a false removal conflict',async()=>{const f=fixture();let a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),b=await f.sync(f.member('bob'));a=await f.sync(add(a));b=await f.sync(b);a=SW.christmasGiftChange(a,oid(a),'delete',{id:gift(a).id},today);a=await f.sync(a);b=await f.sync(b);assert.equal(gift(b),undefined);});
test('portable restore retains plans but drops the shared household binding',async()=>{const f=fixture(),a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),B=require('../js/backup-tools.js'),blank=M.board(),r=B.applyRestore(blank,B.prepareRestore(blank,JSON.stringify(a),M),M);assert.deepEqual(r.features.occasionPlans,a.features.occasionPlans);assert.equal(r.features.seasonalSharedHouse,undefined);assert.equal(r.features.browserSync,undefined);});

test('older Pending Differences state cannot block Christmas and is cleared by automatic sync',async()=>{
 const f=fixture(),a=f.member('alice');a.features.browserSync.conflicts=[{key:'tasks/ordinary/text',token:'old',label:'Legacy prompt'}];
 a.features.browserSync.choices={'tasks/ordinary/text':{side:'local',token:'old'}};
 assert.equal(SW.shareReady(a),true);let joined=await f.sync(SW.reconcile(SW.create(a,draft),today).board);
 assert.deepEqual(joined.features.browserSync.conflicts,[]);assert.deepEqual(joined.features.browserSync.choices,{});
 assert.ok(SW.activeGroups(joined,today)[0].tasks.length);
});
test('two members edit the same Christmas name: the later saved change is shared',async()=>{
 const f=fixture();let a=await f.sync(SW.reconcile(SW.create(f.member('alice'),draft),today).board),b=await f.sync(f.member('bob'));
 a=SW.configure(a,oid(a),{...SW.editable(a,oid(a)),name:'Christmas A'},'every');
 b=SW.configure(b,oid(b),{...SW.editable(b,oid(b)),name:'Christmas B'},'every');
 a.features.seasonalEditedAt='2026-11-25T16:00:01Z';b.features.seasonalEditedAt='2026-11-25T16:00:02Z';
 a=await f.sync(a);b=await f.sync(b);a=await f.sync(a);
 assert.equal(SW.editable(a,oid(a)).name,'Christmas B');
 assert.equal(SW.editable(b,oid(b)).name,'Christmas B');
 assert.equal(a.tasks.filter(t=>t.section==='Seasonal').length,b.tasks.filter(t=>t.section==='Seasonal').length);
});
