'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../js/seasonal-core.js');
const christmas={eventDate:'2026-12-25',preparationStartDate:'2026-10-30',endDate:'2027-01-30'};
test('annual reference windows keep event-year identity across January and do not mutate reference',()=>{
 const original=JSON.stringify(christmas),a=S.annualFromWindow('christmas',christmas,2027,'reject');
 assert.deepEqual(a,{occurrenceKey:'["christmas","annual",2027]',eventDate:'2027-12-25',preparationStartDate:'2027-10-30',endDate:'2028-01-30'});
 assert.deepEqual(S.annualFromWindow('christmas',christmas,2027,'reject'),a);
 assert.notEqual(a.occurrenceKey,S.annualFromWindow('newyear',christmas,2027,'reject').occurrenceKey);
 assert.equal(JSON.stringify(christmas),original);
});
test('event date edits shift relative window and task start together',()=>{
 const shifted=S.shiftWindow(christmas,'2026-12-28');
 assert.deepEqual(shifted,{eventDate:'2026-12-28',preparationStartDate:'2026-11-02',endDate:'2027-02-02'});
 assert.equal(S.relativeTaskStart(shifted,-7),'2026-12-21');
 assert.throws(()=>S.relativeTaskStart(shifted,-57),/inside/);
 assert.throws(()=>S.relativeTaskStart(shifted,37),/inside/);
});
test('lifecycle phase respects explicit inclusion and rejects malformed dates',()=>{
 const policy={startInclusive:true,endInclusive:true};
 for(const [date,phase] of [['2026-10-29','upcoming'],['2026-10-30','active'],['2027-01-30','active'],['2027-01-31','ended']]) assert.equal(S.windowPhase(christmas,date,policy),phase);
 assert.equal(S.windowPhase(christmas,'2027-01-30',{...policy,endInclusive:false}),'ended');
 assert.throws(()=>S.windowPhase(christmas,'2026-11-31',policy));
 assert.throws(()=>S.windowPhase(christmas,'2026-12-25',{}));
});
test('last week of November always uses the approved dates',()=>{
 for(const year of [2026,2027,2028,2030])assert.deepEqual(S.novemberLastWeek(year),{start:`${year}-11-24`,end:`${year}-11-30`});
});
test('leap-day policies remain explicit rather than guessing',()=>{
 const ref={eventDate:'2028-02-29',preparationStartDate:'2028-02-15',endDate:'2028-03-01'};
 assert.throws(()=>S.annualFromWindow('leap',ref,2029,'reject'));
 assert.throws(()=>S.annualFromWindow('leap',ref,2029));
 assert.equal(S.annualFromWindow('leap',ref,2029,'feb28').eventDate,'2029-02-28');
 assert.equal(S.annualFromWindow('leap',ref,2029,'mar1').eventDate,'2029-03-01');
});
