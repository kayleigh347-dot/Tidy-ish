const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../js/model.js');

test('washing loads progress independently and expose the exact dryer and rail finish steps',()=>{
 const b=M.board(),dryer=b.features.laundry.find(l=>l.slot===1),rail=b.features.laundry.find(l=>l.slot===2);
 dryer.route='dryer';rail.route='rail';M.laundry(b,dryer.slot);const dryerStart=dryer.startedAt;assert.equal(dryer.step,1);assert.ok(dryerStart>0);
 M.laundry(b,rail.slot);assert.equal(rail.step,1);assert.ok(rail.startedAt>0);assert.equal(dryer.step,1);assert.equal(new Set([dryer.slot,rail.slot]).size,2);
 M.laundry(b,dryer.slot);assert.equal(dryer.step,2);assert.equal(M.laundryText(b.features,dryer),'Empty dryer');
 M.laundry(b,rail.slot);assert.equal(rail.step,2);assert.equal(M.laundryText(b.features,rail),'Move dry clothes from rail');
 assert.equal(b.features.wins.length,4);assert.ok(b.features.laundry.every(l=>l.slot===1||l.slot===2));
});

test('only the built-in rail label is updated; household custom wording stays intact',()=>{
 const standard=M.board();standard.features.railFinish='Put away clothes on rail';
 assert.equal(M.normalize(standard).features.railFinish,'Move dry clothes from rail');
 standard.features.railFinish='Hang up the dark clothes';assert.equal(M.normalize(standard).features.railFinish,'Hang up the dark clothes');
});

test('laundry alerts begin at two hours and repeat every thirty minutes until transfer',()=>{
 const load={step:1,startedAt:1000,lastReminderAt:0};
 assert.equal(M.laundryNeedsAttention(load,7200999),false);assert.equal(M.laundryNeedsAttention(load,7201000),true);
 assert.equal(M.laundryReminderDue(load,7201000),true);load.lastReminderAt=7201000;
 assert.equal(M.laundryReminderDue(load,9000999),false);assert.equal(M.laundryReminderDue(load,9001000),true);
 assert.equal(M.laundryNeedsAttention({...load,step:2},9001000),false);
 assert.equal(M.laundryNeedsAttention({step:1,startedAt:0},9001000),false);
});

test('a fresh wash clears the prior alert timer and finished-cycle start time',()=>{
 const b=M.board(),load=b.features.laundry[0];M.laundry(b,load.slot);load.lastReminderAt=load.startedAt+7200000;
 M.laundry(b,load.slot);M.laundry(b,load.slot);assert.equal(load.step,0);assert.equal(load.startedAt,0);assert.equal(load.lastReminderAt,0);
 M.laundry(b,load.slot);assert.equal(load.step,1);assert.ok(load.startedAt>0);assert.equal(load.lastReminderAt,0);
});

test('laundry start time and independent load state survive household sync round-trip',()=>{
 const Share=require('../js/sharing-model.js'),b=M.board();M.laundry(b,1);M.laundry(b,2);const payload=Share.project(b,{},'test-member');
 assert.equal(payload.settings.filter(s=>/^laundry-load-\d+$/.test(s.id)).length,2);
 assert.ok(payload.settings.filter(s=>/^laundry-load-\d+$/.test(s.id)).every(s=>s.reminderStartedAt));
 const back=Share.importRaw(payload);assert.deepEqual(back.features.laundry.map(l=>[l.slot,l.step,l.startedAt>0]),[[1,1,true],[2,1,true]]);
});

test('household sync does not carry an old load reminder into a newly started cycle',()=>{
 const Share=require('../js/sharing-model.js'),b=M.board(),load=b.features.laundry[0];load.step=1;load.startedAt=2000;load.lastReminderAt=1500;load.revision=1;
 const incoming=M.clone(b);incoming.features.laundry[0].startedAt=4000;incoming.features.laundry[0].lastReminderAt=0;incoming.features.laundry[0].revision=2;
 const payload=Share.project(incoming,{},'test-member'),state={hidden:[],native:{tasks:[]},account:'test-member',house:'test-house'};
 const accepted=Share.accept(b,payload,state);assert.equal(accepted.features.laundry[0].startedAt,4000);assert.equal(accepted.features.laundry[0].lastReminderAt,undefined);
});

test('laundry task types stay out of cleaning estimates, recommendations and calendar choices',()=>{
 const Q=require('../js/quest-time-core.js'),Mem=require('../js/quest-memory.js'),Rec=require('../js/quest-recommendations.js'),Calendar=require('../js/owner-calendar.js');
 const b=M.board(),laundry=M.task({id:'laundry-task',title:'Put a wash on',room:'kitchen',taskType:'laundry',calendarEnabled:true}),clean=M.task({id:'clean-task',title:'Wipe counter',room:'kitchen'});b.tasks.push(laundry,clean);
 assert.deepEqual(M.messLeaves(b,'kitchen').map(x=>x.id),['clean-task']);
 assert.equal(Rec.eligible(laundry,'','2026-11-01',b),false);
 assert.equal(Calendar.eligible(laundry),false);assert.throws(()=>Calendar.apply(b.tasks,[{id:laundry.id,unit:'months',every:2,firstDue:'2026-12-01'}]),/Unknown calendar task/);
});

test('laundry remains second in Doing Now, first on the home grind tile, with a cross-page alert style',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8'),css=require('node:fs').readFileSync(require('node:path').join(__dirname,'../css/care-system.css'),'utf8');
 assert.match(source,/tabs\(\[\['doing','Doing Now'\],\['laundry','Laundry'\]/);
 assert.match(source,/\[\['laundry','Laundry','Laundry cycles'\],\['cat'/);
 assert.match(source,/alertChanged=F\(\)\.laundry\.some\(l=>M\.laundryNeedsAttention\(l\)\)!==lastLaundryAttention/);
 assert.match(css,/\.doing-board \.tabs\.nested button\[data-id="laundry"\]/);assert.match(css,/\.laundry-ready-alert\{animation:/);
});
