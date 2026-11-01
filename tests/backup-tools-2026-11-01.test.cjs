const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../js/model.js');
const B=require('../js/backup-tools.js');

function boardWithOneTask(){
 const b=M.board();
 const room=b.rooms[0];
 b.tasks.push(M.task({id:'backup-task-one',room:room.id,title:'Backup test Quest'}));
 return b;
}

test('legacy sharedSnapshot is ignored while exported board records validate and merge',()=>{
 const incoming=boardWithOneTask();
 incoming.sharedSnapshot={tasks:[{id:'remote-copy',title:'Never import this snapshot'}]};
 const current=M.board();
 const prepared=B.prepare(current,JSON.stringify(incoming),M);
 assert.equal(prepared.source.tasks.some(t=>t.id==='backup-task-one'),true);
 assert.equal(prepared.source.tasks.some(t=>t.id==='remote-copy'),false);
 assert.match(prepared.summary.notes.join(' '),/household sync snapshot is ignored/i);
 const result=B.apply(current,prepared,M);
 assert.equal(result.tasks.some(t=>t.id==='backup-task-one'),true);
 assert.equal(result.tasks.some(t=>t.id==='remote-copy'),false);
});

test('credential-bearing backup remains blocked',()=>{
 const incoming=boardWithOneTask();
 incoming.authSession={access_token:'not-a-real-token'};
 assert.throws(()=>B.fromText(JSON.stringify(incoming),M),/includes account credentials/i);
});

test('the supplied November 1 backup validates when selected explicitly',t=>{
 const file=process.env.TIDYISH_TEST_BACKUP;
 if(!file){t.skip('Set TIDYISH_TEST_BACKUP to check a user-selected local backup.');return;}
 const text=fs.readFileSync(file,'utf8');
 const raw=JSON.parse(text);
 const current=M.board();
 const prepared=B.prepare(current,text,M);
 const hasBoth=raw.rooms.some(r=>r.id==='cats')&&raw.rooms.some(r=>r.id==='upstairs');
 assert.equal(prepared.source.rooms.length,raw.rooms.length-(hasBoth?1:0));
 assert.equal(prepared.source.rooms.some(r=>r.id==='upstairs'),false);
 if(hasBoth)assert.equal(prepared.source.rooms.find(r=>r.id==='cats').name,'Upstairs Landing');
 assert.equal(prepared.source.tasks.length,raw.tasks.length);
 assert.match(prepared.summary.notes.join(' '),/household sync snapshot is ignored/i);
 const restore=B.applyRestore(current,B.prepareRestore(current,text,M),M);
 assert.equal(restore.tasks.length,raw.tasks.length);assert.equal(restore.features.wins.length,raw.features.wins.length);
 assert.equal(restore.features.tools.length,raw.features.tools.length);assert.equal(restore.features.laundry.length,raw.features.laundry.length);
 assert.equal(restore.rooms.length,raw.rooms.length-(hasBoth?1:0));assert.equal('browserSync' in restore,false);
});

test('full restore replaces the local board and restores settings without restoring account bindings',()=>{
 const incoming=M.board();incoming.tasks.push(M.task({id:'restore-incoming',title:'Incoming',room:'cats'}));
 incoming.features.tools=['Brush','Cloth'];incoming.features.laundry=[{slot:1,route:'rail',step:3,selected:true},{slot:2,route:'dryer',step:1,selected:true},{slot:3,route:'rail',step:0,selected:false}];
 incoming.features.railFinish='Hang every garment';incoming.features.sound=false;incoming.features.uniformStartedAt=12345;
 incoming.browserSync={account:'do-not-restore',house:'old-house'};incoming.householdSync={id:'old-house'};incoming.connectedHouse='old-house';incoming.features.browserSync={account:'feature-link'};incoming.features.householdSync={id:'feature-house'};incoming.features.connectedHouse='feature-house';incoming.sharedSnapshot={private:'ignored'};
 const current=M.board();current.tasks.push(M.task({id:'replace-me',title:'Old local work',room:'kitchen'}));current.features.tools=['Old tool'];
 const before=JSON.stringify(current),preview=B.prepareRestore(current,JSON.stringify(incoming),M),restored=B.applyRestore(current,preview,M);
 assert.equal(JSON.stringify(current),before);assert.equal(restored.tasks.some(t=>t.id==='replace-me'),false);assert.equal(restored.tasks.some(t=>t.id==='restore-incoming'),true);
 assert.deepEqual(restored.features.tools,['Brush','Cloth']);assert.equal(restored.features.laundry.length,3);assert.equal(restored.features.railFinish,'Hang every garment');assert.equal(restored.features.sound,false);assert.equal(restored.features.uniformStartedAt,12345);
 assert.equal('browserSync' in restored,false);assert.equal('householdSync' in restored,false);assert.equal('connectedHouse' in restored,false);assert.equal('browserSync' in restored.features,false);assert.equal('householdSync' in restored.features,false);assert.equal('connectedHouse' in restored.features,false);assert.equal('sharedSnapshot' in restored,false);
 assert.match(B.describeRestore(preview.summary),/entire local board/);assert.match(B.describeRestore(preview.summary),/does not write to a live household/);
});

test('full restore preview expires if the current local board changes',()=>{
 const current=M.board(),incoming=M.board(),preview=B.prepareRestore(current,JSON.stringify(incoming),M);current.features.displayName='Changed after preview';
 assert.throws(()=>B.applyRestore(current,preview,M),/changed since the restore preview/i);
});
