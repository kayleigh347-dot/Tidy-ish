'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model.js'),B=require('../js/backup-tools.js');
const person=(id,name)=>({id,name,tracker:true,ideas:['idea']});
const gift=(id,recipientId,recipient,extra={})=>({id,recipientId,recipient,occasion:'christmas',title:'Synthetic gift',budget:5,spent:5,status:'bought',...extra});
const prepare=(a,b)=>B.prepare(a,JSON.stringify(b),M);
test('backup merge restores missing gifts and people, preserves existing IDs and exact history',()=>{
 const a=M.board(),b=M.board();a.features.giftPeople.push(person('p1','First'));a.features.gifts.push(gift('g1','p1','First',{status:'wrapped'}));
 a.features.wins.push({id:'win',taskId:'task',room:'kitchen',title:'task',at:'2026-11-24T12:00:00Z',points:3,person:'Me'});
 b.features.giftPeople.push(person('p1','First'),person('p2','Second'));b.features.gifts.push(gift('g1','p1','First'),gift('g2','p2','Second'));
 const before=JSON.stringify(a),source=JSON.stringify(b),p=prepare(a,b),out=B.apply(a,p,M);
 assert.equal(p.summary.changes.gifts,1);assert.equal(p.summary.changes.giftPeople,1);assert.equal(p.summary.skipped.gifts,1);assert.equal(p.summary.skipped.giftPeople,1);
 assert.match(B.describe(p.summary),/1 new gifts.*1 new gift recipients/);assert.match(B.describe(p.summary),/previously removed locally/);
 assert.deepEqual(out.features.gifts,[a.features.gifts[0],b.features.gifts[1]]);assert.deepEqual(out.features.giftPeople,[a.features.giftPeople[0],b.features.giftPeople[1]]);assert.deepEqual(out.features.wins,a.features.wins);assert.equal(JSON.stringify(a),before);assert.equal(JSON.stringify(b),source);
 const again=prepare(out,b);assert.equal(again.summary.changes.gifts,0);assert.equal(again.summary.changes.giftPeople,0);
});
test('conflicting same ID or duplicate-name recipient cannot silently receive imported gifts',()=>{
 const a=M.board(),b=M.board();a.features.giftPeople.push(person('p','Current'),person('local','Same name'));
 b.features.giftPeople.push(person('p','Different'),person('remote','same name'));b.features.gifts.push(gift('conflict','p','Different'),gift('duplicate','remote','same name'));
 const p=prepare(a,b),out=B.apply(a,p,M);assert.equal(p.summary.skipped.gifts,2);assert.equal(p.summary.skipped.giftPeople,2);assert.equal(p.summary.changes.gifts,0);assert.equal(p.summary.changes.giftPeople,0);assert.deepEqual(out.features.gifts,[]);assert.deepEqual(out.features.giftPeople,a.features.giftPeople);assert.match(B.describe(p.summary),/conflicting recipients or duplicate names/);
});
test('an orphan gift ID cannot acquire a conflicting recipient on merge',()=>{
 const a=M.board(),b=M.board();a.features.gifts.push(gift('current','orphan','Old person'));a.features.giftPeople.push(person('p','Current'));b.features.giftPeople.push(person('orphan','Other person'));b.features.gifts.push(gift('incoming','p','Unknown source person'));
 const p=prepare(a,b),out=B.apply(a,p,M);assert.equal(p.summary.skipped.gifts,1);assert.equal(p.summary.skipped.giftPeople,1);assert.deepEqual(out.features.gifts,a.features.gifts);assert.deepEqual(out.features.giftPeople,a.features.giftPeople);
});
test('explicit recipient may not cause double membership through legacy name fallback',()=>{
 const a=M.board(),b=M.board();a.features.giftPeople.push(person('other','Other'));b.features.giftPeople.push(person('p','First'));b.features.gifts.push(gift('ambiguous','p','Other'));
 const p=prepare(a,b);assert.equal(p.summary.changes.giftPeople,1);assert.equal(p.summary.skipped.gifts,1);assert.deepEqual(B.apply(a,p,M).features.gifts,[]);
});
test('legacy name-only and missing-person gifts are preserved without rewriting IDs',()=>{
 const a=M.board(),b=M.board();b.features.gifts.push(gift('legacy',undefined,'Legacy'),gift('orphan','missing','Missing'));
 const p=prepare(a,b);assert.equal(p.summary.changes.gifts,2);assert.deepEqual(B.apply(a,p,M).features.gifts,JSON.parse(JSON.stringify(b.features.gifts)));assert.deepEqual(B.apply(a,p,M).features.giftPeople,[]);
});
test('full restore shows gift and person counts, retains records without altering source',()=>{
 const a=M.board(),b=M.board();b.features.giftPeople.push(person('p','Person'));b.features.gifts.push(gift('g','p','Person'));
 const p=B.prepareRestore(a,JSON.stringify(b),M);assert.equal(p.summary.gifts,1);assert.equal(p.summary.giftPeople,1);assert.match(B.describeRestore(p.summary),/1 gifts and 1 gift recipients/);const out=B.applyRestore(a,p,M);assert.deepEqual(out.features.gifts,b.features.gifts);assert.deepEqual(out.features.giftPeople,b.features.giftPeople);
});
test('normal model merge used for household connection remains unchanged',()=>{
 const a=M.board(),b=M.board();b.features.giftPeople.push(person('p','Person'));b.features.gifts.push(gift('g','p','Person'));
 const out=M.merge(a,b);assert.deepEqual(out.features.gifts,[]);assert.deepEqual(out.features.giftPeople,[]);assert.equal(B.apply(a,prepare(a,b),M).features.gifts.length,1);
});
test('duplicate gift and person IDs rejected before merge or restore, with unchanged current board',()=>{
 const a=M.board(),b=M.board(),before=JSON.stringify(a);b.features.giftPeople.push(person('p','Person'),person('p','Other'));assert.throws(()=>prepare(a,b),/Invalid saved gift person/);b.features.giftPeople.pop();b.features.gifts.push(gift('g','p','Person'),gift('g','p','Person'));assert.throws(()=>B.prepareRestore(a,JSON.stringify(b),M),/Invalid saved gift record/);assert.equal(JSON.stringify(a),before);
});

// Run the real tracker projection, not a duplicate approximation of its rules.
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const giftProjection=app.slice(app.indexOf('function giftPeopleWithLegacy(){'),app.indexOf('function giftTrackerPage(){'));
function memberships(board,giftId){
 const g=board.features.gifts.find(g=>g.id===giftId);
 if(!g)return [];
 return vm.runInNewContext(giftProjection+'\ngiftPeopleWithLegacy().filter(p=>giftForPerson(g,p)).map(p=>p.name)',{board,g});
}
test('conflicting label without an explicit legacy person is skipped and counted',()=>{
 const a=M.board(),b=M.board();a.features.giftPeople.push(person('p-alice','Alice'));
 b.features.giftPeople.push(person('p-alice','Alice'));b.features.gifts.push(gift('bad','p-alice','Bob'),gift('good','p-alice','alice'));
 const before=JSON.stringify(a),p=prepare(a,b),out=B.apply(a,p,M);
 assert.equal(p.summary.changes.gifts,1);assert.equal(p.summary.skipped.gifts,1);
 assert.match(B.describe(p.summary),/1 gift\(s\).*conflicting recipients/);
 assert.equal(out.features.gifts.some(g=>g.id==='bad'),false);
 assert.deepEqual(Array.from(memberships(out,'good')),['Alice']);assert.equal(JSON.stringify(a),before);
});
test('newly imported person cannot receive mismatched label through a virtual legacy tab',()=>{
 const a=M.board(),b=M.board();b.features.giftPeople.push(person('p-alice','Alice'));
 b.features.gifts.push(gift('bad','p-alice','Bob'),gift('space','p-alice',' Alice '));
 const p=prepare(a,b),out=B.apply(a,p,M);assert.equal(p.summary.changes.giftPeople,1);
 assert.equal(p.summary.skipped.gifts,2);assert.equal(p.summary.changes.gifts,0);assert.deepEqual(out.features.gifts,[]);
});
