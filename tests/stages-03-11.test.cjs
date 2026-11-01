const assert=require('node:assert/strict');const {test}=require('node:test');
const M=require('../js/model.js');const Time=require('../js/quest-time-core.js');
const Memory=require('../js/quest-memory.js');const Rec=require('../js/quest-recommendations.js');
const Library=require('../js/quest-library.js');
const Care=require('../js/care-system.js');require('../js/base-schedule-95.js');const Occ=require('../js/occasional.js');
const Share=require('../js/sharing-model.js');
const at=(x)=>new Date(x+'T10:00:00Z');
test('memory uses genuine wins and condition prompts do not claim a cleaning occurred',()=>{
 const b=M.board(),t=M.task({id:'t1',title:'Dust shelves',room:'living',checkDays:5,conditionMode:'condition'});M.add(b,t);
 assert.equal(Memory.status(b,t,at('2026-10-31')).lastDone,null);
 b.features.wins.push({id:'w1',taskId:t.id,at:at('2026-10-20').toISOString(),points:1});
 const before=JSON.stringify(b.features.wins);
 const s=Memory.status(b,t,at('2026-10-31'));assert.equal(s.daysSince,11);assert.equal(s.needsInspection,true);assert.equal(s.label,'Check condition');
 assert.equal(JSON.stringify(b.features.wins),before);
});
test('real completion and Undo restore the prior last-done state and retain older wins',()=>{
 const b=M.board(),t=M.task({id:'memory-undo',title:'Wipe sink',room:'kitchen'});M.add(b,t);
 M.finish(b,t.id,true);const first=Memory.lastDone(b,t),firstWins=JSON.stringify(b.features.wins);
 assert.ok(first);assert.equal(Memory.status(b,t,at('2026-11-01')).lastDone,first);
 M.reactivate(b,t.id);M.finish(b,t.id,true);assert.equal(b.features.wins.length,2);
 const second=Memory.lastDone(b,t);assert.ok(second);assert.equal(Memory.completions(b,t)[0].at,second);
 M.finish(b,t.id,false);assert.equal(JSON.stringify(b.features.wins),firstWins);assert.equal(Memory.lastDone(b,t),first);
});
test('as-needed Quests do not become false overdue items and remain reusable in the Library',()=>{
 const b=M.board(),t=M.task({id:'as-needed-memory',title:'Dust shelves',room:'living',checkDays:0});M.add(b,t);
 b.features.wins.push({id:'old-win',taskId:t.id,title:t.title,room:t.room,at:at('2026-10-01').toISOString(),points:1});
 const before=JSON.stringify(b.features.wins),s=Memory.status(b,t,at('2026-11-01'));
 assert.equal(s.mode,'as-needed');assert.equal(s.due,false);assert.equal(s.daysSince,31);assert.equal(JSON.stringify(b.features.wins),before);
 assert.equal(Library.catalogue(b,{kind:'task'}).some(x=>x.id===t.id),true);
});
test('recommendations use completion age and configurable weights, excluding sidequests, care and quick jobs',()=>{
 const b=M.board();for(const [id,opts] of [['a',{priority:5,rankRecencyWeight:5}],['b',{priority:1,rankRecencyWeight:0}],['c',{side:true}],['d',{taskType:'care'}],['e',{littleOften:true}]])M.add(b,M.task({id,room:'living',title:id,...opts}));
 b.features.wins.push({id:'w',taskId:'a',at:at('2026-06-01').toISOString()});
 const rows=Rec.rank(b,{room:'living',now:at('2026-10-31')});assert.deepEqual(rows.map(x=>x.id),['a','b']);
 assert.equal(b.features.wins.length,1);
});
test('recommendations stay room-scoped when requested, explain inspection without claiming cleaning, and remain read-only',()=>{
 const b=M.board(),condition=M.task({id:'condition-room',title:'Inspect fan',room:'living',done:true,checkDays:5,conditionMode:'condition'}),other=M.task({id:'other-room',title:'Wipe counter',room:'kitchen'});
 M.add(b,condition);M.add(b,other);b.features.wins.push({id:'condition-win',taskId:condition.id,at:at('2026-10-20').toISOString(),points:1});
 const before=JSON.stringify(b),living=Rec.rank(b,{room:'living',now:at('2026-10-31')}),home=Rec.rank(b,{now:at('2026-10-31')});
 assert.deepEqual(living.map(x=>x.id),['condition-room']);assert.match(living[0].reason,/^Check condition · 11 days/);assert.doesNotMatch(living[0].reason,/Due again|cleaned/i);
 assert.deepEqual(new Set(home.map(x=>x.id)),new Set(['condition-room','other-room']));assert.equal(JSON.stringify(b),before);
});
test('suggestion limits are advisory filters and do not mutate canonical tasks or wins',()=>{
 const b=M.board();for(const [id,room] of [['one','living'],['two','kitchen'],['three','bathroom']])M.add(b,M.task({id,title:id,room,estimate:10}));
 const before=JSON.stringify(b),rows=Rec.rank(b,{now:at('2026-11-01'),maxTasks:2,maxMinutes:20});
 assert.equal(rows.length,2);assert.ok(rows.every(x=>x.estimated===10));assert.equal(JSON.stringify(b),before);
});
test('Cat Tray escalates through green, blue, amber, red and flashing red; undo restores no completion',()=>{
 const b=M.board();Care.complete(b,'cat',()=> 'cat-win',at('2026-10-01'));
 const expectState={'2026-10-01':'green','2026-10-02':'blue','2026-10-03':'orange','2026-10-04':'red','2026-10-05':'flashing','2027-02-01':'flashing'};
 for(const [date,state] of Object.entries(expectState))assert.equal(Care.status(b,'cat',at(date)).state,state);
 assert.equal(Care.undo(b,'cat'),true);assert.equal(Care.wins(b,'cat').length,0);
});
test('care statuses follow approved intervals and escalation thresholds',()=>{
 for(const [id,dates] of Object.entries({
  'plants':[['2026-10-06','green'],['2026-10-07','blue'],['2026-10-08','orange'],['2026-10-10','red'],['2026-10-12','flashing']],
  'fish-topup':[['2026-10-08','blue'],['2026-10-09','orange'],['2026-10-10','red'],['2026-10-11','flashing'],['2026-10-14','flashing']],
  'fish-outside':[['2026-10-10','orange'],['2026-10-12','red'],['2026-10-14','flashing']],
  'fish-inside':[['2026-11-08','orange'],['2026-11-15','red'],['2026-11-22','flashing']],
  'isopods':[['2026-11-01','blue'],['2026-11-07','blue'],['2026-11-08','orange'],['2026-11-15','red'],['2026-11-22','flashing']]
 })) {const b=M.board();Care.complete(b,id,()=>id+'1',at('2026-10-01'));for(const [d,state] of dates)assert.equal(Care.status(b,id,at(d)).state,state,id+' '+d);}
 const b=M.board();for(const id of ['cat','fish-topup','fish-outside','fish-inside','isopods'])Care.complete(b,id,()=>id+'-base',at('2026-10-01'));assert.equal(Care.status(b,'fish-topup',at('2026-10-10')).warning,'Aquatic life needs water.');assert.equal(Care.status(b,'isopods',at('2026-12-01')).warning,'The isopods are hungry.');
 const topup=Care.status(b,'fish-topup',at('2026-10-10'));assert.equal(topup.escalation,2);assert.equal(topup.state,'red');
 const iso=Care.status(b,'isopods',at('2026-11-15'));assert.equal(iso.escalation,2);assert.match(iso.label,/stage 2/);
 assert.equal(Care.status(b,'cat',at('2027-03-01')).state,'flashing');
});
test('little often increments every time, undo last only, and never affects room mess',()=>{
 const b=M.board(),t=M.task({id:'wipe',room:'kitchen',title:'Wipe table',littleOften:true,taskType:'little-often',messImpact:'big'});M.add(b,t);
 Care.littleOften(b,t.id,()=> 'a',at('2026-10-31'));Care.littleOften(b,t.id,()=> 'b',at('2026-10-31'));
 assert.equal(b.features.wins.length,2);assert.equal(M.mess(b,b.rooms.find(r=>r.id==='kitchen')),0);
 Care.littleUndo(b,t.id);assert.equal(b.features.wins.length,1);assert.equal(b.features.wins[0].id,'a');
});
test('occasional seed uses user Base long-interval rows and never reseeds deleted defaults',()=>{
 const b=M.board(),first=Occ.seed(b,M,at('2026-10-31'));assert.equal(first.added,Occ.OWNER_ROWS.length);assert.ok(first.added>=20);
 assert.equal(Occ.seed(b,M).added,0);const erased=b.tasks.pop();assert.equal(Occ.seed(b,M).added,0);assert.equal(b.tasks.some(t=>t.id===erased.id),false);
});
test('PDF task catalogue keeps the supplied occasional intervals without mutating Base Schedule rows',()=>{
 const base=require('../js/base-schedule-95.js');
 const entry=base.find(r=>r.title==='Clean front door inside');
 assert.equal(entry.sourceFrequency,'6 months');assert.equal(entry.repeatMonths,6);
 const imported=Occ.OWNER_ROWS.find(r=>r.id===entry.id);
 assert.equal(imported.repeatMonths,6);
 assert.equal(base.some(r=>r.title==='Wipe skirting boards'),false);
 assert.equal(base.find(r=>r.title==='Clean picture frames').repeatMonths,6);
 assert.equal(base.find(r=>r.title==='Defrost freezer').repeatMonths,12);
});
test('occasional completion counts once, schedules from actual completion, undo restores only latest',()=>{
 const b=M.board(),t=M.task({id:'occ',occasionKind:'occasional',title:'Descale shower',room:'bathroom',repeatMonths:3,nextDue:'2026-11-01'});M.add(b,t);
 Occ.complete(b,t.id,M,at('2026-11-20'));assert.equal(t.nextDue,'2027-02-20');assert.equal(b.features.wins.length,1);assert.equal(t.done,false);
 assert.equal(Occ.undo(b,t.id),true);assert.equal(t.nextDue,'2026-11-01');assert.equal(b.features.wins.length,0);
});
test('shared settings round-trip timed attempts, notes, exclusions and new Quest settings',()=>{
 const b=M.board(),t=M.task({id:'task-9',title:'Clean sink',room:'kitchen',rankRecencyWeight:2.5,conditionMode:'condition'});M.add(b,t);
 b.features.questTimings.push({id:'attempt-a',taskId:'task-9',kind:'valid',durationMs:150000,excludedFromLearning:true,note:'Distracted',owner:'member:test',at:at('2026-10-31').toISOString()});
 const raw=Share.project(b,{},'acct'),back=Share.importRaw(raw);
 assert.equal(back.features.questTimings.length,1);assert.equal(back.features.questTimings[0].note,'Distracted');assert.equal(back.features.questTimings[0].excludedFromLearning,true);
 assert.equal(back.tasks[0].rankRecencyWeight,2.5);assert.equal(back.tasks[0].conditionMode,'condition');
 assert.equal(Time.average(back.features.questTimings,'task-9','member:test'),null);
});
test('household-shared Quest Memory visibility survives normalization and sync and filters recommendations',()=>{
 const b=M.board(),t=M.task({id:'shared-memory',title:'Dust shelves',room:'living',checkDays:14,conditionMode:'check',showInSuggestions:false});M.add(b,t);
 const local=M.normalize(M.clone(b)).tasks[0];assert.equal(local.checkDays,14);assert.equal(local.showInSuggestions,false);
 const back=Share.importRaw(Share.project(b,{},'acct')),copy=back.tasks[0];
 assert.equal(copy.checkDays,14);assert.equal(copy.conditionMode,'check');assert.equal(copy.showInSuggestions,false);
 assert.equal(Rec.eligible(copy,'','2026-11-01',back,at('2026-11-01')),false);
 copy.showInSuggestions=true;assert.equal(Rec.eligible(copy,'','2026-11-01',back,at('2026-11-01')),true);
});

test('occasional calendar exposes only next saved occurrence, never generated phantom repeats',()=>{
 const b=M.board(),t=M.task({id:'oc-next',room:'kitchen',title:'Deep clean the fridge',occasionKind:'occasional',repeatMonths:3,nextDue:'2026-11-01'});M.add(b,t);
 const rows=M.occurrences(b,'2026-10-31','2028-10-31');
 assert.deepEqual(rows.filter(row=>row.task.id===t.id).map(row=>row.date),['2026-11-01']);
 assert.equal(b.features.wins.length,0);
});

test('Fresh Household All, Selected and None preserve only explicitly chosen task identities and related history',()=>{
 const Fresh=require('../js/fresh-house-core.js');
 const b=M.board();
 M.add(b,M.task({id:'a-task',title:'Clean sink',room:'kitchen',children:[M.child({id:'a-child',title:'Rinse sink'})]}));
 M.add(b,M.task({id:'b-task',title:'Dust dresser',room:'master'}));
 b.doingOrder=['a-task','b-task'];
 b.features.wins.push({id:'a-win',taskId:'a-child',rootId:'a-task',title:'Rinse sink',room:'kitchen',points:1,person:'Test member',at:at('2026-10-31').toISOString()});
 b.features.wins.push({id:'b-win',taskId:'b-task',title:'Dust dresser',room:'master',points:2,person:'Test member',at:at('2026-10-30').toISOString()});
 b.features.wins.push({id:'cat-win',taskId:'tidy-care:cat',title:'Cat Tray',room:'cats',points:1,person:'Test member',at:at('2026-10-29').toISOString()});
 b.features.questTimings.push({id:'t-a',taskId:'a-task',kind:'valid',durationMs:45000,owner:'Test member',at:at('2026-10-31').toISOString()});
 b.features.questTimings.push({id:'t-b',taskId:'b-task',kind:'valid',durationMs:25000,owner:'Test member',at:at('2026-10-30').toISOString()});
 b.features.activityDiary={annotations:{'2026-10-01':{type:'rest',symbol:'🌙',description:'Take a break'}},earned:[]};
 b.features.completionSummaries=[{id:'archive-1',count:123,points:123,period:'2025'}];
 const before=JSON.stringify(b),all=Fresh.prepare(b,'acct','all');
 assert.equal(all.counts.tasks,2);assert.equal(all.counts.completions,3);
 assert.equal(all.imported.features.questTimings.length,2);assert.equal(all.imported.features.completionSummaries[0].id,'archive-1');
 const selected=Fresh.prepare(b,'acct',['a-task']);
 assert.equal(selected.transferMode,'selected');assert.deepEqual(selected.local.tasks.map(x=>x.id),['a-task']);
 assert.deepEqual(selected.local.doingOrder,['a-task']);
 assert.deepEqual(selected.imported.features.wins.map(x=>x.id),['a-win']);
 assert.equal(selected.imported.features.questTimings.length,1);assert.equal(selected.imported.features.completionSummaries.length,0);
 assert.deepEqual(selected.imported.features.activityDiary,{annotations:{},earned:[]});
 const none=Fresh.prepare(b,'acct',[]);
 assert.equal(none.transferMode,'none');assert.equal(none.counts.tasks,0);assert.equal(none.counts.completions,0);
 assert.equal(none.imported.features.questTimings.length,0);
 assert.throws(()=>Fresh.prepare(b,'acct',['not-here']),/no longer exists/);
 assert.equal(JSON.stringify(b),before,'source must be byte-for-byte unchanged in memory');
});

test('timer alarm begins at five minutes after zero and snooze lasts five more minutes',()=>{
 const estimate=15*60000;
 assert.equal(Time.status(estimate+Time.BUFFER_MS-1000,estimate).alarmDue,false);
 assert.equal(Time.status(estimate+Time.BUFFER_MS,estimate).alarmDue,true);
 assert.equal(Time.status(estimate+Time.BUFFER_MS,estimate,0,true).alarmDue,false);
 const now=estimate+Time.BUFFER_MS,afterSnooze=now+Time.SNOOZE_MS;
 assert.equal(Time.status(now+60000,estimate,afterSnooze).alarmDue,false);
 assert.equal(Time.status(afterSnooze-1,estimate,afterSnooze).alarmDue,false);
 assert.equal(Time.status(afterSnooze,estimate,afterSnooze).alarmDue,true);
});

test('shared transfer retains individual care wins, daily-grind counts and Task Data diary',()=>{
 const b=M.board();
 Care.complete(b,'cat',()=> 'care-1',at('2026-10-31'));
 const quick=M.task({id:'quick',title:'Wipe worktop',room:'kitchen',littleOften:true});M.add(b,quick);
 Care.littleOften(b,'quick',()=> 'often-1',at('2026-10-31'));
 Care.littleOften(b,'quick',()=> 'often-2',at('2026-10-31'));
 b.features.activityDiary.annotations['2026-10-27']={type:'outing',symbol:'🚗',description:'A nice day out'};
 const raw=Share.project(b,{},'test-account'),back=Share.importRaw(raw);
 assert.equal(back.features.wins.length,3);
 assert.deepEqual(back.features.wins.map(w=>w.id),['care-1','often-1','often-2']);
 assert.equal(back.features.activityDiary.annotations['2026-10-27'].description,'A nice day out');
 assert.equal(Care.wins(back,'cat').length,1);
});

test('Clear the Way points award once and only one active collection follow-up is created',()=>{
 const Q=require('../js/quest-focus.js'),b=M.board(),entry={id:'clear-step',title:'Pick up important items in a bag',followup:'Return important items'};
 assert.equal(Q.recordClearWin(b,{room:'kitchen',entry,now:at('2026-10-31').toISOString(),id:'win-clear',person:'Test'}),true);
 assert.equal(Q.recordClearWin(b,{room:'kitchen',entry,now:at('2026-10-31').toISOString(),id:'win-extra',person:'Test'}),false);
 assert.equal(Q.addFollowup(b,'kitchen',entry,v=>M.task(v)),true);
 assert.equal(Q.addFollowup(b,'kitchen',entry,v=>M.task(v)),false);
 assert.equal(b.tasks.length,1);assert.equal(b.features.wins.length,1);
 assert.equal(b.tasks[0].done,false);assert.equal(b.tasks[0].side,false);
});

test('Clear the Way setup step does not duplicate the important-items follow-up',()=>{
 const Q=require('../js/quest-focus.js');
 const followups=Q.standardSteps.map(title=>Q.followupTitle({title})).filter(Boolean);
 assert.deepEqual(followups,[
  'Put away the important items from the door-handle bag',
  'Return items from other rooms to their homes',
  'Put away items placed near their homes',
  'Sort and put away collected bags or boxes'
 ]);
 assert.equal(Q.followupTitle({title:'Custom important items',followup:'My custom return task'}),'My custom return task');
});


test('older saved board upgrades without replacing rooms, task IDs, completions or active elapsed time',()=>{
 const legacy=M.board(),r=legacy.rooms.find(x=>x.id==='living');
 r.name='My living space';r.art='custom-room-image.png';r.mess=47;r.capacity=8;
 const t=M.task({id:'kept-quest',title:'Hoover beside the sofa',room:'living',elapsed:12500,startedAt:100000,priority:4,estimate:5,children:[M.child({id:'kept-child',title:'Move the footstool'})]});
 M.add(legacy,t);legacy.doingOrder=['kept-quest'];
 legacy.features.wins.push({id:'saved-win',taskId:'kept-child',rootId:'kept-quest',points:2,at:'2026-10-30T10:00:00.000Z'});
 legacy.features.items.push({id:'item-original',kind:'homeless',text:'Book on shelf',location:'living'});
 legacy.features.templates.push(M.task({id:'saved-template',title:'Quick tidy',room:'living'}));
 delete legacy.features.questTimings;delete legacy.features.activityDiary;
 const before=JSON.stringify(legacy),restored=M.normalize(legacy);
 assert.equal(JSON.stringify(legacy),before,'migration must not mutate the old saved board');
 assert.equal(restored.rooms.find(x=>x.id==='living').name,'My living space');
 assert.equal(restored.rooms.find(x=>x.id==='living').art,'custom-room-image.png');
 assert.equal(restored.rooms.find(x=>x.id==='living').mess,47);
 assert.equal(restored.tasks[0].id,'kept-quest');
 assert.equal(restored.tasks[0].children[0].id,'kept-child');
 assert.equal(restored.tasks[0].startedAt,100000);
 assert.equal(M.time(restored.tasks[0],200000),112500);
 assert.deepEqual(restored.doingOrder,['kept-quest']);
 assert.equal(restored.features.wins[0].id,'saved-win');
 assert.equal(restored.features.items[0].id,'item-original');
 assert.equal(restored.features.templates[0].id,'saved-template');
 assert.deepEqual(restored.features.questTimings,[]);
 assert.deepEqual(restored.features.activityDiary,{annotations:{},earned:[]});
});

test('reject invalid saved new-feature structures without mutating user data',()=>{
 const b=M.board();b.features.wins.push({id:'history-preserved',taskId:'x',points:3});
 b.features.questTimings='unexpected';
 const snapshot=JSON.stringify(b);
 assert.throws(()=>M.normalize(b),/questTimings/);
 assert.equal(JSON.stringify(b),snapshot);
 delete b.features.questTimings;b.features.activityDiary={annotations:[],earned:[]};
 const second=JSON.stringify(b);
 assert.throws(()=>M.normalize(b),/activity diary/);
 assert.equal(JSON.stringify(b),second);
});

test('household name survives shared payload export, sync merge and import',()=>{
 const board=M.board();board.features.householdName='The Willow House';
 const blank={tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]};
 const base=Share.project(board,blank,'member-1');
 assert.equal(base.settings.find(x=>x.id==='tidy-html-household-name')?.text,'The Willow House');
 const before=Share.snapshot(board),state={base,native:before,account:'member-1',house:'house-1',choices:{},initial:false};
 const renamed=M.clone(board);renamed.features.householdName='Willow Cottage';
 const outgoing=Share.outgoing(renamed,state);
 const merged=Share.merge(base,outgoing,base,{},false);
 assert.deepEqual(merged.conflicts,[]);
 assert.equal(merged.payload.settings.find(x=>x.id==='tidy-html-household-name')?.text,'Willow Cottage');
 const restored=Share.importRaw(merged.payload);
 assert.equal(restored.features.householdName,'Willow Cottage');
 const accepted=Share.accept(board,merged.payload,state);
 assert.equal(accepted.features.householdName,'Willow Cottage');
});
