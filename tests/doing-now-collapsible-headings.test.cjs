'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const rooms=[{id:'kitchen',name:'Kitchen'},{id:'bedroom',name:'Bedroom'}];
const tasks=[
 {id:'tree',title:'Put up Christmas tree',room:'kitchen',done:false,children:[]},
 {id:'lights',title:'Hang Christmas lights',room:'kitchen',done:false,children:[]},
 {id:'bed',title:'Make the bed',room:'bedroom',done:false,children:[]}
];
let renders=0;
const ctx={
 board:{tasks},route:'doing',doingTab:'doing',sideTab:'all',doingDetailed:false,
 deleted:null,openTasks:new Set(),collapsed:new Set(),sideCollapsed:new Set(),doingCollapsed:new Set(),
 rooms:()=>rooms,room:id=>rooms.find(r=>r.id===id),guardianThumb:()=>'',
 esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 visibleTasks:()=>tasks,tabs:()=>'',taskList:list=>list.map(t=>`<article data-task-id="${t.id}"><button data-action="timer">Timer</button><button data-action="complete">Done</button></article>`).join(''),
 groupedTasks:null,completedDoingList:()=>'',pageKey:()=>'',
 SW:{activeGroups:()=>[
  {id:'christmas',name:'Christmas',tasks:[tasks[0],tasks[1]]}
 ]},
 M:{date:()=> '2026-11-27',isTaskCompletionVisible:()=>false,taskCompletionTime:()=>0},
 button:(label,action,id='',cls='',extra='')=>`<button class="${cls}" data-action="${action}" data-id="${id}" ${extra}>${label}</button>`,
 render:()=>{renders++;}
};
const functionSource=(name,next)=>{
 const start=source.indexOf(`function ${name}(`);
 const end=source.indexOf(`\nfunction ${next}(`,start);
 assert.ok(start>=0&&end>start,`source for ${name}`);
 return source.slice(start,end).trim();
};
ctx.groupedTasks=vm.runInNewContext(`(${functionSource('groupedTasks','sidePage')})`,ctx);
ctx.doingPage=vm.runInNewContext(`(${functionSource('doingPage','guardianThumb')})`,ctx);
const action=(name)=>{
 const property=name==='collapse'?'collapse:':`'${name}':`;
 const start=source.indexOf(property,source.indexOf('const actions={'));
 const bodyStart=start+property.length;
 const end=source.indexOf(name==='collapse'?',tools:':"'seasonal-open':",bodyStart);
 assert.ok(start>=0&&end>bodyStart,`action source for ${name}`);
 return vm.runInNewContext(`(${source.slice(bodyStart,end).trim().replace(/,$/,'')})`,ctx);
};
const ids=html=>Array.from(html.matchAll(/data-task-id="([^"]+)"/g),m=>m[1]);

test('Doing Now Room and Seasonal headings collapse independently without mutating task order or route',()=>{
 const original=JSON.stringify(tasks);renders=0;
 const initial=ctx.doingPage();
 assert.match(initial,/data-action="collapse" data-id="bedroom"/);
 assert.match(initial,/data-action="doing-collapse-seasonal" data-id="christmas"/);
 assert.doesNotMatch(initial,/data-action="seasonal-open"/);
 assert.deepEqual(ids(initial),['tree','lights','bed']);
 assert.match(initial,/aria-expanded="true"/);

 const roomCollapse=action('collapse'),seasonalCollapse=action('doing-collapse-seasonal');
 roomCollapse({dataset:{id:'bedroom'}});
 assert.equal(ctx.route,'doing','collapsing must not navigate away from Doing Now');
 const roomClosed=ctx.doingPage();
 assert.deepEqual(ids(roomClosed),['tree','lights']);
 assert.match(roomClosed,/data-action="collapse" data-id="bedroom"[^>]*aria-expanded="false"/);
 assert.deepEqual([...ctx.collapsed],[],'Doing Now collapse must not alter Room collapse state');

 roomCollapse({dataset:{id:'bedroom'}});
 const roomReopened=ctx.doingPage();
 assert.deepEqual(ids(roomReopened),['tree','lights','bed']);
 assert.match(roomReopened,/data-action="collapse" data-id="bedroom"[^>]*aria-expanded="true"/);
 assert.equal(ctx.route,'doing','reopening must remain on Doing Now');

 seasonalCollapse({dataset:{id:'christmas'}});
 const seasonalClosed=ctx.doingPage();
 assert.deepEqual(ids(seasonalClosed),['bed']);
 assert.match(seasonalClosed,/data-action="doing-collapse-seasonal" data-id="christmas"[^>]*aria-expanded="false"/);
 assert.match(seasonalClosed,/data-action="collapse" data-id="bedroom"[^>]*aria-expanded="true"/);
 assert.deepEqual([...ctx.doingCollapsed],['seasonal:christmas']);
 assert.equal(ctx.route,'doing','collapsing Seasonal must remain on Doing Now');
 assert.equal(JSON.stringify(tasks),original);

 seasonalCollapse({dataset:{id:'christmas'}});
 const reopened=ctx.doingPage();
 assert.deepEqual(ids(reopened),['tree','lights','bed']);
 assert.deepEqual([...ctx.doingCollapsed],[]);
 assert.equal(ctx.route,'doing','reopening Seasonal must remain on Doing Now');
 assert.deepEqual(JSON.stringify(tasks),original);
 assert.equal(renders,4);
});
