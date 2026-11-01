const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Tools=require('../js/focus-tools.js');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../css/quest-focus.css'),'utf8');

test('selected Quest supplies are deduplicated and remain linked to every Quest using them',()=>{
 const quests=[
  {title:'Clean sink',tools:'E-cloth, Washing-up liquid',children:[{tools:'E-cloth'}]},
  {title:'Wipe taps',tools:'e-cloth'}
 ];
 assert.deepEqual(Tools.groups(quests).map(x=>[x.name,x.quests]),[
  ['E-cloth',['Clean sink','Wipe taps']],
  ['Washing-up liquid',['Clean sink']]
 ]);
});

test('one member can change a preferred supply without changing shared Quest defaults or another member',()=>{
 const storage=new Map(),adapter={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 const quest={id:'shared-quest',title:'Wipe shelf',tools:'Microfibre cloth'};
 const before=JSON.stringify(quest),ownerA='account-a|member:Kayleigh',ownerB='account-b|member:Sam';
 const preferences=Tools.write(adapter,ownerA,{[Tools.normalize('Microfibre cloth')]:'E-cloth'});
 assert.equal(Tools.groups([quest],preferences)[0].name,'E-cloth');
 assert.equal(Tools.groups([quest],Tools.read(adapter,ownerB))[0].name,'Microfibre cloth');
 assert.equal(JSON.stringify(quest),before,'the shared default stays unchanged');
 assert.notEqual(Tools.key(ownerA),Tools.key(ownerB));
});

test('only selected Quests and unfinished subtasks contribute known supplies',()=>{
 const groups=Tools.groups([
  {title:'Selected Quest',tools:'Dust cloth',children:[{tools:'Brush',done:false},{tools:'Wipes',done:true}]}
 ]);
 assert.deepEqual(groups.map(x=>x.name),['Dust cloth','Brush']);
});

test('changing a preferred item to another existing item keeps one grouped row with all Quest links',()=>{
 const quests=[{title:'First Quest',tools:'Microfibre cloth'},{title:'Second Quest',tools:'E-cloth'}];
 const sources=Tools.sources(quests),prefs=Tools.update({},sources,i=>i===0?'E-cloth':'');
 assert.deepEqual(Tools.groups(quests,prefs).map(x=>[x.name,x.quests]),[['E-cloth',['First Quest','Second Quest']]]);
});

test('preference cleanup ignores prototype property names',()=>{
 const input=JSON.parse('{"__proto__":"unsafe","constructor":"unsafe","prototype":"unsafe","e-cloth":"Reusable cloth"}');
 assert.deepEqual(Tools.clean(input),{'e-cloth':'Reusable cloth'});
});

test('Focus tools are optional, selected-only, member-local, and do not complete or time a Quest',()=>{
 const body=app.match(/function focusToolsDialog\(ids=\[\]\)\{([\s\S]*?)\n\}/)?.[1]||'';
 assert.match(body,/ids\.map\(id=>task\(id\)\)/);
 assert.match(body,/TIME\.ownerOf\(board\)/);
 assert.match(body,/FTOOLS\?\.groups\(selected,preferences\)/);
 assert.match(body,/Skip · continue Focus/);
 assert.match(body,/Save my preferences/);
 assert.match(body,/FTOOLS\.write\(localStorage,owner,next\);closeDialog\(true\)/);
 assert.doesNotMatch(body,/M\.finish|change\(/);
 assert.match(index,/js\/focus-tools\.js[^\n]+step13/);
 assert.match(css,/\.quest-focus-tools/);
});
