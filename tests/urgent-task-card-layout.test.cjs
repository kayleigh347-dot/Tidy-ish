'use strict';
// Source/renderer/model regressions only: visual measurement is separate.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'js/app.js'),'utf8'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const M=require('../js/model.js'),D=require('../js/drag-core.js');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(){
 const board=M.board(),t=M.task({id:'t"&',room:'kitchen',title:'Very long & <task> with lots of detail and a verylongunbrokenwordthatmustwrap',doing:true,children:[M.child({id:'child',title:'An expanded child'})]}),other=M.task({id:'other',room:'kitchen',title:'Other parent',doing:true}),outside=M.task({id:'outside',room:'living',title:'Different room',doing:true});
 for(const task of [t,other,outside])M.add(board,task);board.doingOrder=[t.id,other.id,outside.id];
 const ctx={M,D,board,esc,seasonalGiftButton:()=>'',openTasks:new Set([t.id]),route:'room',doingTab:'doing',detailed:false,doingDetailed:false,room:id=>({id,name:'Kitchen'}),dateLabel:()=>'',creatorLabel:()=>'',detail:(label,html)=>`<details><summary>${label}</summary>${html}</details>`,hasTimedAttempt:()=>false,finishTimed:()=>{throw Error('unexpected timer')},task:id=>board.tasks.find(t=>t.id===id),change:fn=>fn(board),confirmDialog:(title,message,fn)=>fn()};
 function loadLine(name){return app.match(new RegExp('^const '+name+'=(.+);$','m'))[1]}
 for(const name of ['button','stopwatch','phoneClock'])ctx[name]=vm.runInNewContext('('+loadLine(name)+')',ctx);
 function load(name,next){let a=app.indexOf('function '+name+'('),b=app.indexOf('\nfunction '+next+'(',a);assert.ok(a>=0&&b>a);ctx[name]=vm.runInNewContext('('+app.slice(a,b).trim()+')',ctx)}
 for(const [name,next] of [['taskCard','focusTaskCard'],['focusTaskCard','safeImage'],['childrenHtml','roomPage'],['doingPositionStyle','doingTaskCard'],['doingTaskCard','doingChildren'],['doingChildren','completedDoingList'],['completedDoingList','doingPage']])load(name,next);
 return {ctx,board,t,other,outside};
}
const actions=h=>Array.from(h.matchAll(/data-action="([^"]+)"/g),m=>m[1]);
function parentOnly(html){return html.split('data-child-id=')[0]}
function handler(ctx,name,pattern){const m=app.match(pattern);assert.ok(m,name);return vm.runInNewContext('('+m[1]+')',ctx)}
test('old direct-child grid rule no longer targets nested titles; compact centre uses explicit one-column rows',()=>{
 const old=read('css/dark-compact-surfaces.css'),css=read('css/task-layout-bundle.css');assert.match(old,/\.task \.room-task-main > \.task-title\{grid-column:2;/);assert.doesNotMatch(old,/\.task \.room-task-main \.task-title\{grid-column:2/);
 assert.match(css,/\.compact-task-center\{[^}]*grid-template-columns:minmax\(0,1fr\)/);assert.match(css,/\.compact-task-center > \.task-title\{\s*grid-column:1;grid-row:1;justify-self:stretch;/);assert.match(css,/\.compact-task-actions\{\s*grid-column:1;grid-row:2;/);assert.match(css,/\.room-subtask-count\{color:#21012a;background:#f8c662/);
});
test('centred rows, visible option focus rings, non-intercepting artwork, 44px height, square completion',()=>{
 const doing=read('css/doing-now-compact.css'),room=read('css/task-layout-bundle.css');assert.match(doing,/\.doing-task-actions\{[^}]*width:100%;\s*max-width:260px;\s*justify-self:center;/);assert.match(room,/\.compact-task-actions\{width:100%;max-width:260px;justify-self:center\}/);for(const css of [doing,room]){assert.match(css,/height:44px;\s*min-height:44px/);assert.match(css,/aspect-ratio:1/);assert.match(css,/button:focus-visible\{outline:2px solid #f8c662/)}assert.match(doing,/\.add-subtask-art\{[^}]*pointer-events:none/);
});
test('actual renderers keep exact action order, native named controls, long titles and expanded child markup',()=>{
 const {ctx,t}=fixture();const h=ctx.doingTaskCard(t),r=ctx.taskCard(t);assert.deepEqual(actions(parentOnly(h)),['select-task','expand','add-child','first','last','task-menu','timer','complete']);assert.deepEqual(actions(parentOnly(r)),['select-task','expand','add-child','first','last','timer','task-menu','complete']);
 for(const x of [h,r]){assert.match(x,/Very long &amp; &lt;task&gt;/);assert.match(x,/aria-expanded="true"/);assert.match(x,/data-child-id="child"/);assert.match(x,/class="child-grip"/);assert.match(x,/type="button"[^>]*data-action="add-child"[^>]*aria-label="Add subtask to Very long &amp; &lt;task&gt;/);assert.doesNotMatch(x,/tabindex="-1"/);}
 assert.match(h,/<svg class="add-subtask-art"[^>]*aria-hidden="true" focusable="false"/);assert.match(r,/class="small room-subtask-count">0\/1<\/span>/);assert.doesNotMatch(ctx.focusTaskCard(t),/room-subtask-count|add-subtask-art/);
});
test('actual complete and undo handlers preserve parent/child histories and renderer labels',()=>{
 const {ctx,board,t}=fixture(),complete=handler(ctx,'complete',/^ complete:(el=>[^\n]+),$/m);const before=board.features.wins.length;complete({dataset:{id:t.id}});assert.equal(t.done,true);assert.ok(t.children.every(c=>c.done));assert.ok(board.features.wins.length>before);assert.match(ctx.taskCard(t),/>Undo<\/button>/);assert.match(ctx.completedDoingList([t]),/>Undo<\/button>/);complete({dataset:{id:t.id}});assert.equal(t.done,false);assert.equal(board.features.wins.length,before);assert.match(ctx.taskCard(t),/Done em all/);
});
test('actual first/last handlers and drag core preserve row identities and prevent cross-room moves',()=>{
 const {ctx,board,t,other,outside}=fixture();const first=handler(ctx,'first',/^ first:(el=>[^\n]+?),last:/m),last=handler(ctx,'last',/,last:(el=>change\(b=>M\.move\([^\n]+?\)\)),/);ctx.route='doing';const initial=board.doingOrder.slice();first({dataset:{id:other.id}});assert.equal(board.doingOrder[0],other.id);last({dataset:{id:other.id}});assert.ok(board.doingOrder.indexOf(other.id)>board.doingOrder.indexOf(t.id));assert.deepEqual([...board.doingOrder].sort(),initial.sort());assert.throws(()=>D.reorder(board,t.id,outside.id,false,'doing'));D.reorder(board,other.id,t.id,false,'doing');assert.ok(board.doingOrder.indexOf(other.id)<board.doingOrder.indexOf(t.id));assert.equal(t.room,'kitchen');
});
