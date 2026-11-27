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
 const maintenance=['Wash and dry winter entrance mats','Wipe radiators before heating season','Change to warmer bedding','Change to lighter bedding'];
 for(const title of maintenance){const item=L.SUGGESTIONS.find(s=>s.title===title);assert.ok(item);assert.equal(item.section,'Occasional');assert.ok(L.catalogue(b,{kind:'suggestion',query:title,tag:'Occasional'}).some(x=>x.title===title));}
 assert.equal(L.catalogue(b,{kind:'suggestion',query:'Christmas is coming',tag:'Seasonal'}).some(x=>x.title==='Christmas is coming'),true);
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
test('saved-task matcher accepts aliases and close spelling while preferring the selected room',()=>{
 const b=fresh(),living=M.task({room:'living',title:'Vacuum carpet',estimate:15,messImpact:'medium'}),bathroom=M.task({room:'bathroom',title:'Vacuum carpet',estimate:25});
 M.add(b,living);M.add(b,bathroom);
 const match=L.matchSavedTask(b,'hoover carpett','living');
 assert.ok(match);assert.equal(match.id,living.id);assert.equal(match.sourceType,'task');
 assert.equal(L.matchSavedTask(b,'Vacuum carpet','living').id,living.id);
 assert.equal(L.matchSavedTask(b,'Vacuum carpet','bathroom').id,bathroom.id);
 assert.equal(L.matchSavedTask(b,'Vacuum carpet',''),null);
 assert.equal(L.matchSavedTask(b,'astronaut garden','living'),null);
 assert.equal(L.matchSavedTask(b,'x'.repeat(161),'living'),null);
});
test('saved-task matcher suppresses equally likely cross-room choices',()=>{
 const b=fresh();M.add(b,M.task({room:'living',title:'Clean sink'}));M.add(b,M.task({room:'bathroom',title:'Clean sink'}));
 assert.equal(L.matchSavedTask(b,'Clean sing',''),null);
 assert.equal(L.matchSavedTask(b,'Clean sing','living').room,'living');
});
test('saved reusable templates can be suggested without creating a task',()=>{
 const b=fresh(),saved=M.task({room:'living',title:'Dust picture frames',estimate:8});b.features.templates.push(saved);
 const match=L.matchSavedTask(b,'dust pictre frames','living');
 assert.ok(match);assert.equal(match.sourceType,'template');assert.equal(match.id,saved.id);assert.equal(b.tasks.length,0);
});
test('applying a saved task returns only reusable draft settings',()=>{
 const saved=M.task({room:'living',title:'Wipe shelves',tools:'Cloth',notes:'Use the blue cloth',estimate:12,priority:2,effort:'Light',messImpact:'none',tags:['weekly'],taskType:'maintenance',children:[M.child({title:'Move ornaments',tools:'Box'})]});
 saved.done=true;saved.assigned='Alex';saved.warningEnabled=true;saved.repeatDays=7;saved.timerSeconds=99;
 const draft=L.draftFromSavedTask(saved);
 assert.deepEqual(Object.keys(draft).sort(),['title','children','tools','notes','estimate','priority','effort','messImpact','tags','taskType'].sort());
 assert.deepEqual(draft.children,[{title:'Move ornaments'}]);assert.equal(draft.estimate,12);assert.equal(draft.messImpact,'none');
 assert.equal('done' in draft,false);assert.equal('assigned' in draft,false);assert.equal('repeatDays' in draft,false);assert.equal('warningEnabled' in draft,false);
});
test('a completed Quest remains completed when used as a suggestion source',()=>{
 const b=fresh(),saved=M.task({room:'living',title:'Wipe shelves',estimate:12});M.add(b,saved);M.finish(b,saved.id,true);
 const wins=JSON.stringify(b.features.wins),match=L.matchSavedTask(b,'wip shelves','living'),draft=L.draftFromSavedTask(match);
 assert.ok(draft);assert.equal(saved.done,true);assert.equal(JSON.stringify(b.features.wins),wins);assert.equal(L.hasActiveDuplicate(b,draft.title,'living'),false);
 assert.equal(L.findDuplicateTask(b,draft.title,'living').id,saved.id);assert.equal(saved.done,true);assert.equal(JSON.stringify(b.features.wins),wins);
});
test('duplicate guard blocks active copies but leaves completed history untouched',()=>{
 const b=fresh(),saved=M.task({room:'living',title:'Wipe shelves'});M.add(b,saved);
 assert.equal(L.hasActiveDuplicate(b,'wipe shelves','living'),true);
 assert.equal(L.findDuplicateTask(b,'wipe shelves','living').id,saved.id);
 saved.done=true;
 assert.equal(L.hasActiveDuplicate(b,'Wipe shelves','living'),false);assert.equal(L.findDuplicateTask(b,'Wipe shelves','living').id,saved.id);
 assert.equal(L.findDuplicateTask(b,'Wipe shelves','bathroom'),null);assert.equal(saved.done,true);assert.equal(b.tasks.length,1);
});
test('Add Saved Task reactivates the same completed Quest and preserves history',()=>{
 const b=fresh(),template=M.task({room:'living',title:'Dust shelves'});b.features.templates.push(template);
 const active=M.templateCopy(template,'living');M.add(b,active);M.finish(b,active.id,true);
 const wins=JSON.stringify(b.features.wins),taskId=active.id,selected=b.tasks.find(x=>x.templateId===template.id&&x.room==='living');
 if(selected?.done)M.reactivate(b,selected.id);
 assert.equal(b.tasks.length,1);assert.equal(selected.id,taskId);assert.equal(selected.done,false);assert.equal(JSON.stringify(b.features.wins),wins);
});

test('inline autocomplete matches a substring anywhere and stays bounded',()=>{
 const b=fresh();
 for(const title of ['Dust the picture frames','Clean bathroom mirror','Wipe mirror edges','Polish hallway mirror','Clean mirrors again','Shine glass mirror','Bathroom mirrors'])M.add(b,M.task({title,room:'living'}));
 const list=L.autocompleteSavedTasks(b,'mirror','living');
 assert.ok(list.length>1);assert.ok(list.length<=6);
 assert.ok(list.some(item=>item.title==='Clean bathroom mirror'));
 assert.ok(!list.some(item=>item.title==='Dust the picture frames'));
 assert.deepEqual(L.autocompleteSavedTasks(b,'','living'),[]);
});
test('autocomplete treats vacuum as an alias for Hoover without rewriting saved names',()=>{
 const b=fresh();M.add(b,M.task({title:'Hoover carpet',room:'living'}));
 const results=L.autocompleteSavedTasks(b,'vacuum','living');
 assert.equal(results[0].title,'Hoover carpet');
 assert.equal(b.tasks[0].title,'Hoover carpet');
});
test('autocomplete prefers same-room matches but allows cross-room titles',()=>{
 const b=fresh();M.add(b,M.task({title:'Hoover floor',room:'living'}));M.add(b,M.task({title:'Hoover stairs',room:'entrance'}));
 const result=L.autocompleteSavedTasks(b,'hoover','living');
 assert.equal(result[0].room,'living');assert.equal(result.length,2);
});
