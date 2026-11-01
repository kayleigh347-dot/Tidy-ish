const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../js/model.js'),L=require('../js/quest-library.js');
const fresh=()=>M.board();
test('short word, synonym, notes, tags and room search prioritise exact task name',()=>{
 const b=fresh();M.add(b,M.task({title:'Clean toilet',room:'bathroom',tags:['sanitary']}));
 const a=L.catalogue(b,{query:'loo'});assert.equal(a[0].title,'Clean toilet');
 const d=L.catalogue(b,{query:'toilet'});assert.equal(d[0].title,'Clean toilet');
 const c=L.catalogue(b,{query:'sanitary'});assert.equal(c[0].title,'Clean toilet');
 assert.equal(L.catalogue(b,{query:'hoover'}).some(x=>x.title==='Hoover floor'),true);
});
test('existing Quests remain single canonical ID with correct filters',()=>{
 const b=fresh(),t=M.task({room:'living',title:'Wipe everything',tags:['glass','worktops'],priority:2});M.add(b,t);
 const results=L.catalogue(b,{query:'wipe',room:'living',kind:'task',priority:'2'});
 assert.equal(results.length,1);assert.equal(results[0].id,t.id);assert.deepEqual(results[0].tags,['glass','worktops']);
 assert.equal(L.catalogue(b,{tag:'glass',kind:'task'}).length,1);
});
test('optional suggestions require explicit add and cannot import twice',()=>{
 const b=fresh(),id=L.SUGGESTIONS.find(s=>s.title==='Clean toilet').id;
 assert.equal(L.catalogue(b).some(t=>t.id===id),true);
 assert.equal(b.tasks.length,0);
 const first=L.addSuggestion(b,id,M);assert.equal(first.added,true);
 const repeated=L.addSuggestion(b,id,M);assert.equal(repeated.added,false);
 assert.equal(repeated.id,first.id);assert.equal(b.tasks.length,1);
 assert.equal(L.catalogue(b).some(t=>t.id===id),false);
});
test('does not offer care, sidequests, laundry, little & often as ordinary quests',()=>{
 const b=fresh();for(const t of [{title:'Cat tray',room:'cats'},{title:'Fish tank',room:'living'},{title:'Laundry',taskType:'laundry'},{title:'Make craft',side:true},{title:'Daily counter',littleOften:true}])M.add(b,M.task(t));
 assert.equal(L.catalogue(b,{kind:'task'}).length,0);
});
test('reactivating an as-needed task preserves past completions, points, ID and new completion',()=>{
 const b=fresh(),t=M.task({title:'Wipe table',room:'kitchen',checkDays:0,children:[M.child({title:'Top'})]});M.add(b,t);
 M.finish(b,t.id,true);const originalWins=JSON.stringify(b.features.wins),taskId=t.id;
 M.reactivate(b,t.id);
 assert.equal(t.done,false);assert.equal(t.children[0].done,false);assert.equal(t.id,taskId);assert.equal(JSON.stringify(b.features.wins),originalWins);
 M.finish(b,t.id,true);assert.equal(b.features.wins.length,2);
 M.finish(b,t.id,false);assert.equal(b.features.wins.length,1);assert.equal(b.tasks[0].id,taskId);
});
test('a previous template task is reusable by reactivation with same ID',()=>{
 const b=fresh(),template=M.task({title:'Dust shelves',room:'living'});b.features.templates.push(template);
 const active=M.templateCopy(template,'living');M.add(b,active);M.finish(b,active.id,true);
 const wins=b.features.wins.length;M.reactivate(b,active.id);
 assert.equal(b.tasks[0].id,active.id);assert.equal(b.features.wins.length,wins);
});
test('saved reusable Quest suppresses identical opt-in idea in same room',()=>{
 const b=fresh(),item=M.task({room:'bathroom',title:'Clean toilet'});b.features.templates.push(item);
 assert.equal(L.catalogue(b,{kind:'suggestion'}).some(x=>x.title==='Clean toilet'),false);
});
test('stage-02 settings survive normalization and shared-household project/import',()=>{
 const SM=require('../js/sharing-model.js'),b=fresh(),t=M.task({room:'bathroom',title:'Wipe surfaces',tags:['worktops','easy'],checkDays:9,priority:2,taskType:'maintenance',messImpact:'small'});
 M.add(b,t);
 const local=M.normalize(M.clone(b)).tasks[0];assert.deepEqual(local.tags,['worktops','easy']);assert.equal(local.checkDays,9);
 const empty={tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]};
 const outgoing=SM.project(b,empty,'member-1');
 assert.deepEqual(outgoing.tasks[0].androidTask.tags,['worktops','easy']);
 const imported=SM.importRaw(outgoing).tasks.find(x=>x.id===t.id);
 assert.ok(imported);assert.deepEqual(imported.tags,['worktops','easy']);assert.equal(imported.checkDays,9);assert.equal(imported.taskType,'maintenance');
});
