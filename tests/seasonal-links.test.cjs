'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model.js'),B=require('../js/backup-tools.js'),S=require('../js/seasonal-core.js'),C=require('../js/local-storage-codec.js'),Sharing=require('../js/sharing-model.js'),Fresh=require('../js/fresh-house-core.js');
const link={taskLinks:[{definitionId:'def',taskId:'task'}],giftIds:['gift'],recipientIds:['person']};
function fixture(){
 const b=M.board();
 b.tasks.push(M.task({id:'task',room:'kitchen',title:'Synthetic task',createdAt:'2026-01-01T12:00:00Z'}));
 b.features.giftPeople.push({id:'person',name:'Alice'});
 b.features.gifts.push({id:'gift',recipientId:'person',recipient:'Alice',occasion:'christmas',title:'Synthetic gift',status:'bought',budget:5,spent:5});
 b.features.wins.push({id:'win',taskId:'task',title:'Synthetic task',room:'kitchen',at:'2026-11-24T12:00:00Z',points:3,person:'Me'});
 b.features.occasionTemplates.push({id:'event',name:'Synthetic event',recurrence:'annual',taskDefinitions:[{id:'def',title:'Prepare'}]});
 b.features.occasionOccurrences.push({id:'occ',templateId:'event',...S.resolveOccurrence({templateId:'event',recurrence:'annual',year:2026,eventRule:{kind:'date',date:'2026-12-25'},preparationRule:{kind:'days',offset:-7},endRule:{kind:'days',offset:1}})});
 return b;
}
const linked=()=>M.setOccasionLinks(fixture(),'occ',link);
const occurrence=b=>b.features.occasionOccurrences[0];
const status=b=>M.occasionLinkStatus(b,occurrence(b));
const prepare=(a,b)=>B.prepare(a,JSON.stringify(b),M);
const expected={tasks:[{definitionId:'def',taskId:'task',status:'linked'}],gifts:[{id:'gift',status:'linked'}],recipients:[{id:'person',status:'linked'}]};
test('explicit link edit is pure, preserves IDs and all task, gift, person and completion data',()=>{
 const b=fixture(),before=JSON.stringify(b),selection=JSON.stringify(link),n=M.setOccasionLinks(b,'occ',link);
 assert.deepEqual(status(n),expected);assert.deepEqual(n.tasks,b.tasks);
 for(const k of ['gifts','giftPeople','wins'])assert.deepEqual(n.features[k],b.features[k]);
 assert.equal(JSON.stringify(b),before);assert.equal(JSON.stringify(link),selection);
 assert.deepEqual(occurrence(M.normalize(C.decode(C.encode(n)))),occurrence(n));
 const unlinked=M.setOccasionLinks(n,'occ',{giftIds:[]});assert.deepEqual(occurrence(unlinked).giftIds,[]);assert.deepEqual(occurrence(unlinked).taskLinks,link.taskLinks);assert.equal(unlinked.features.gifts.length,1);
});
test('invalid link shapes and duplicate definitions/IDs rejected; missing target cannot be newly selected',()=>{
 const cases=[{taskLinks:[{definitionId:'unknown',taskId:'task'}]},{taskLinks:[{definitionId:'def',taskId:'missing'}]},{giftIds:['gift','gift']},{recipientIds:['missing']},{giftIds:['missing']},{giftIds:null},{taskLinks:[{...link.taskLinks[0],extra:true}]},{unknown:[]}];
 const b=fixture(),before=JSON.stringify(b);for(const c of cases)assert.throws(()=>M.setOccasionLinks(b,'occ',c));assert.equal(JSON.stringify(b),before);
 const n=linked();n.features.occasionTemplates[0].taskDefinitions.push({id:'def',title:'duplicate'});assert.throws(()=>M.normalize(n),/Invalid saved Seasonal/);
});
test('target deletion retains unresolved references without blocking normal load or awarding points',()=>{
 const b=linked();b.tasks=[];b.features.gifts=[];b.features.giftPeople=[];const before=JSON.stringify(b),n=M.normalize(b);
 assert.deepEqual(status(n),{tasks:[{...link.taskLinks[0],status:'missing'}],gifts:[{id:'gift',status:'missing'}],recipients:[{id:'person',status:'missing'}]});
 assert.deepEqual(occurrence(n),occurrence(b));assert.deepEqual(n.features.wins,b.features.wins);assert.equal(JSON.stringify(b),before);
 const edited=M.setOccasionLinks(n,'occ',{taskLinks:[]});assert.deepEqual(occurrence(edited).giftIds,['gift']);
});
test('explicit gift recipient conflict or deletion is surfaced, not silently assigned by name',()=>{
 const b=linked();b.features.gifts[0].recipient='Bob';assert.equal(status(M.normalize(b)).gifts[0].status,'recipient-conflict');assert.throws(()=>M.setOccasionLinks(b,'occ',{giftIds:['gift']}));
 b.features.gifts[0].recipient='alice';assert.equal(status(b).gifts[0].status,'linked');
 b.features.giftPeople=[];assert.equal(status(b).gifts[0].status,'unresolved-recipient');
 delete b.features.gifts[0].recipientId;assert.equal(status(b).gifts[0].status,'linked');assert.equal(status(b).recipients[0].status,'missing');
});
test('confirmed backup merge imports complete linked occurrence and preserves all records; restore preserves unresolved ones',()=>{
 const a=M.board(),b=linked(),before=JSON.stringify(a),p=prepare(a,b),n=B.apply(a,p,M);
 assert.equal(p.summary.changes.occasionOccurrences,1);assert.deepEqual(status(n),expected);assert.deepEqual(occurrence(n),occurrence(b));assert.equal(JSON.stringify(a),before);
 b.features.gifts=[];const r=B.prepareRestore(a,JSON.stringify(b),M),out=B.applyRestore(a,r,M);assert.equal(r.summary.unresolvedSeasonalLinks,1);assert.match(B.describeRestore(r.summary),/1 Seasonal link\(s\) will remain unresolved/);assert.equal(status(out).gifts[0].status,'missing');assert.deepEqual(occurrence(out),occurrence(b));
});
test('backup skips occurrence with missing or conflicting linked dependencies, including gift merge rejection',()=>{
 for(const edit of [a=>a.tasks[0].title='Different',a=>a.features.gifts[0].title='Different',a=>a.features.giftPeople[0].name='Other',a=>a.features.occasionTemplates[0].taskDefinitions[0].title='Different']){
  const a=fixture(),b=linked();a.features.occasionOccurrences=[];edit(a);
  const p=prepare(a,b),n=B.apply(a,p,M);assert.equal(p.summary.skipped.occasionOccurrences,1);assert.equal(n.features.occasionOccurrences.length,0);assert.match(B.describe(p.summary),/missing\/conflicting linked records/);
 }
 const a=M.board(),b=linked();b.features.gifts=[];const p=prepare(a,b);assert.equal(p.summary.skipped.occasionOccurrences,1);assert.equal(B.apply(a,p,M).features.occasionOccurrences.length,0);
});
test('current occurrence wins over stale backup link edits; restoring missing linked targets is explicit in preview',()=>{
 const a=linked(),b=linked();a.features.gifts=[];const p=prepare(a,b);assert.match(B.describe(p.summary),/1 existing Seasonal link\(s\) become available again/);assert.deepEqual(status(B.apply(a,p,M)),expected);
 const unlinked=M.setOccasionLinks(b,'occ',{giftIds:[]});const q=prepare(unlinked,b);assert.equal(q.summary.skipped.occasionOccurrences,1);assert.deepEqual(occurrence(B.apply(unlinked,q,M)).giftIds,[]);
});
test('sharing projection and household connection never import linked occurrences or expose local links',()=>{
 const b=linked(),raw=Sharing.project(b,{},'synthetic');assert.doesNotMatch(JSON.stringify(raw),/occasionTemplates|occasionOccurrences|taskDefinitions|taskLinks|recipientIds/);
 const remote=Sharing.importRaw(raw);assert.deepEqual(remote.features.occasionOccurrences,[]);
 assert.deepEqual(M.merge(M.board(),b).features.occasionOccurrences,[]);
 const state={account:'synthetic',house:'synthetic-house',base:raw,native:Sharing.snapshot(b),hidden:[],initial:false,choices:{},retired:[]};
 const empty=Sharing.project(M.board(),{},'synthetic');const after=M.normalize(Sharing.accept(b,empty,state));assert.deepEqual(occurrence(after),occurrence(b));assert.equal(status(after).tasks[0].status,'missing');
 const fresh=Fresh.prepare(b,'synthetic',[]);assert.deepEqual(occurrence(M.normalize(fresh.local)),occurrence(b));assert.equal(status(fresh.local).tasks[0].status,'missing');assert.deepEqual(fresh.imported.features.occasionOccurrences,[]);
});
