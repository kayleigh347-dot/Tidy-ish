const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/seasonal-core.js');
const annual = () => ({
  templateId:'christmas', recurrence:'annual', year:2026,
  eventRule:{kind:'fixed',month:12,day:25}, leapDayPolicy:'reject',
  preparationRule:{kind:'days',offset:-56},
  endRule:{kind:'fixed',month:1,day:30,yearOffset:1}
});
test('explicit Christmas fixture crosses year without modifying input',()=>{
  const input=annual(), before=JSON.stringify(input);
  const result=S.resolveOccurrence(input);
  assert.deepEqual(result,{occurrenceKey:'["christmas","annual",2026]',eventDate:'2026-12-25',preparationStartDate:'2026-10-30',endDate:'2027-01-30'});
  assert.deepEqual(S.resolveOccurrence(input),result);
  assert.equal(JSON.stringify(input),before);
});
test('New Year fixture crosses backwards; identity independent of preparation year',()=>{
  const x=S.resolveOccurrence({...annual(),templateId:'new-year',year:2027,eventRule:{kind:'fixed',month:1,day:1},preparationRule:{kind:'days',offset:-2},endRule:{kind:'days',offset:1}});
  assert.equal(x.preparationStartDate,'2026-12-30');
  assert.equal(x.endDate,'2027-01-02');
  assert.notEqual(x.occurrenceKey,S.resolveOccurrence(annual()).occurrenceKey);
});
test('one-off and annual resolved dates, with no implicit identity or policy',()=>{
  const base={templateId:'example',eventRule:{kind:'date',date:'2028-04-16'},preparationRule:{kind:'days',offset:-21},endRule:{kind:'days',offset:1}};
  const once=S.resolveOccurrence({...base,recurrence:'one-off',instanceId:'id:1'});
  const yearly=S.resolveOccurrence({...base,recurrence:'annual',year:2028});
  assert.notEqual(once.occurrenceKey,yearly.occurrenceKey);
  assert.equal(once.preparationStartDate,'2028-03-26');
  assert.equal(once.endDate,'2028-04-17');
  assert.throws(()=>S.resolveOccurrence(base));
  assert.throws(()=>S.resolveOccurrence({...base,recurrence:'annual',year:2027}));
  assert.throws(()=>S.occurrenceKey({...base,recurrence:'one-off',instanceId:'id:1',year:2028}));
});
test('leap-day policy is explicit, only February 29 may be adjusted',()=>{
  assert.equal(S.fixedDate(2028,2,29,'reject'),'2028-02-29');
  assert.throws(()=>S.fixedDate(2027,2,29,'reject'));
  assert.equal(S.fixedDate(2027,2,29,'feb28'),'2027-02-28');
  assert.equal(S.fixedDate(2027,2,29,'mar1'),'2027-03-01');
  assert.throws(()=>S.fixedDate(2027,4,31,'mar1'));
  assert.throws(()=>S.fixedDate(2027,2,28));
});
test('window boundary policies and overlapping windows are independent',()=>{
  const a=S.resolveOccurrence(annual());
  const p={startInclusive:true,endInclusive:true};
  assert.equal(S.isActive(a,a.preparationStartDate,p),true);
  assert.equal(S.isActive(a,a.endDate,p),true);
  assert.equal(S.isActive(a,a.preparationStartDate,{...p,startInclusive:false}),false);
  assert.equal(S.isActive(a,a.endDate,{...p,endInclusive:false}),false);
  assert.equal(S.isActive(a,'2027-01-31',p),false);
  assert.throws(()=>S.isActive(a,a.eventDate,{}));
  const b=S.resolveOccurrence({...annual(),templateId:'birthday',year:2027,eventRule:{kind:'date',date:'2027-01-02'},preparationRule:{kind:'days',offset:-28},endRule:{kind:'days',offset:1}});
  assert.equal(S.isActive(a,'2027-01-02',p),true);
  assert.equal(S.isActive(b,'2027-01-02',p),true);
});
test('invalid dates, offsets, keys and inverted windows are rejected',()=>{
  for(const date of ['2026-02-29','2026-13-01','2026-1-01','10000-01-01']) assert.throws(()=>S.shiftDays(date,1));
  for(const offset of [NaN,Infinity,0.5,3652426,'1']) assert.throws(()=>S.shiftDays('2026-01-01',offset));
  assert.throws(()=>S.shiftDays('9999-12-31',1));
  assert.throws(()=>S.shiftDays('0100-01-01',-1));
  assert.throws(()=>S.resolveOccurrence({...annual(),preparationRule:{kind:'days',offset:1}}));
  assert.throws(()=>S.resolveOccurrence({...annual(),endRule:{kind:'days',offset:-1}}));
  assert.throws(()=>S.resolveOccurrence({...annual(),templateId:' '}));
  assert.throws(()=>S.isActive({eventDate:'2026-01-01',preparationStartDate:'2026-01-02',endDate:'2026-01-03'},'2026-01-02',{startInclusive:true,endInclusive:true}));
  assert.notEqual(S.occurrenceKey({templateId:'a:b',recurrence:'one-off',instanceId:'c'}),S.occurrenceKey({templateId:'a',recurrence:'one-off',instanceId:'b:c'}));
});
test('date edits preserve annual identity and recalculate relative boundaries',()=>{
  const x=annual(), a=S.resolveOccurrence(x);
  const b=S.resolveOccurrence({...x,eventRule:{kind:'date',date:'2026-12-24'}});
  assert.equal(a.occurrenceKey,b.occurrenceKey);
  assert.equal(b.preparationStartDate,'2026-10-29');
  assert.equal(b.endDate,'2027-01-30');
});
