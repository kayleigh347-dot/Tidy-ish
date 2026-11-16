const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../js/schedule-core.js');

test('weekday-only repeats appear in read-only schedule preview on their selected weekdays',()=>{
 const task={id:'weekly',title:'Water plants',room:'living',repeatWeekdays:[1,3,5],repeatRestDays:[],nextDue:'2026-11-01'};
 assert.deepEqual(S.occurrenceDates(task,'2026-11-01',7),['2026-11-02','2026-11-04','2026-11-06']);
 const preview=S.preview({tasks:[task]},{from:'2026-11-01',days:7});
 assert.deepEqual(preview.days.map(day=>day.date),['2026-11-02','2026-11-04','2026-11-06']);
 assert.equal(preview.sourceCount,3);
 assert.deepEqual(task,{id:'weekly',title:'Water plants',room:'living',repeatWeekdays:[1,3,5],repeatRestDays:[],nextDue:'2026-11-01'},'preview does not mutate the saved task');
});
