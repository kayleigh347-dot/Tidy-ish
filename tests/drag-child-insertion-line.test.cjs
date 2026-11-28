'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../js/model.js');
const D=require('../js/drag-core.js');
const Codec=require('../js/local-storage-codec.js');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const css=fs.readFileSync(require.resolve('../css/style.css'),'utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start+1);assert.ok(start>=0&&end>start);return source.slice(start,end);}
function fixture(){
 const board=M.board();
 const item=(id,parentId='',details={})=>M.child({id,parentId,title:id,...details});
 const root=M.task({id:'root',room:'kitchen',title:'Root',children:[item('a','',{notes:'keep',elapsed:1200}),item('b'),item('nested','b',{done:true}),item('deep','nested'),item('c')]});
 const target=M.task({id:'target',room:'kitchen',title:'Target'});
 board.tasks.push(root,target);board.features.wins.push({id:'win',taskId:'nested',rootId:'root',at:'2026-11-28T09:00:00Z',points:1});
 const classes=(...initial)=>{const s=new Set(initial);return {add:(...v)=>v.forEach(x=>s.add(x)),remove:(...v)=>v.forEach(x=>s.delete(x)),contains:v=>s.has(v)};};
 function node(dataset,top,bottom,kind='child',left=30,width=280){
  return {dataset,style:{},hidden:true,classList:classes(kind),getBoundingClientRect:()=>({left,right:left+width,width,top,bottom,height:bottom-top}),matches:s=>s==='.doing-child'&&kind==='doing-child',setAttribute(){},remove(){this.removed=true}};
 }
 function bindNode(n){n.closest=s=>s==='[data-child-id]'?(n.dataset.childId?n:null):s==='.task[data-task-id]'?(n.dataset.taskId?n:card):null;return n;}
 const card=bindNode(node({taskId:'root'},80,410,'task',10,320)),other=bindNode(node({taskId:'target'},440,530,'task',10,320));
 const row=(id,parent,top,bottom,kind='doing-child')=>bindNode(node({childId:id,parentId:parent,rootId:'root'},top,bottom,kind));
 const a=row('a','',100,140),b=row('b','',150,190),nested=row('nested','b',200,240),deep=row('deep','nested',250,290),c=row('c','',300,340);
 const rows=[a,b,nested,deep,c];card.querySelectorAll=()=>rows;
 let under=null;const lines=[],timers=[];
 const document={body:{classList:classes(),appendChild:n=>lines.push(n)},createElement:()=>({style:{},setAttribute(k,v){this[k]=v}}),elementFromPoint:()=>under,querySelectorAll:s=>s==='.task[data-task-id]'?[card,other]:s==='.child.drag-over'?rows.filter(r=>r.classList.contains('drag-over')):s.startsWith('.task.drop-')?[card,other]:[]};
 const ctx={board,document,M,D,innerWidth:400,innerHeight:800,window:{innerHeight:800,scrollBy(){}},task:id=>board.tasks.find(t=>t.id===id),notice(){},change:fn=>{fn(board);return true;},clearTimeout(){},clearInterval(){},setTimeout:fn=>{timers.push(fn);return timers.length;}};
 const script=between('function reorderChild(','// Stage 10G:')+between('let childGesture=null','// Continue scrolling while a held subtask')+between('let rootGesture=null','function resetRootGesture(')+between('function indicateRootDrop(','function moveRootGhost(')+`\nthis.api={childTargetAt,moveChildPreview,reorderChild,resetChildGesture,indicateRootDrop,clearRootDrop,setRootInsertionLine,hideRootInsertionLine,childDrop:()=>childHover,rootDrop:()=>rootDrop,armRoot:g=>{rootGesture=g;}};`;
 vm.createContext(ctx);vm.runInContext(script,ctx);
 const g={root:'root',parent:'',child:'a',view:'room'};
 return {board,root,target,rows,a,b,nested,deep,c,card,other,lines,timers,g,api:ctx.api,hit:n=>{under=n},line:()=>lines.find(n=>n.className==='tidy-task-insertion-line')};
}

test('sibling before uses one body-level insertion line and does not highlight the target',()=>{
 const f=fixture();f.hit(f.b);f.api.moveChildPreview(f.g,100,155);const line=f.line();assert.ok(line);assert.equal(line.hidden,false);assert.equal(line.style.top,'150px');assert.equal(line.style.left,'34px');assert.equal(line.style.width,'272px');assert.equal(line['aria-hidden'],'true');assert.equal(f.b.classList.contains('drag-over'),false);assert.equal(f.api.childDrop().id,'b');assert.equal(f.api.childDrop().after,false);
 f.hit(f.c);f.api.moveChildPreview(f.g,100,335);assert.equal(f.lines.length,1);assert.equal(line.style.top,'340px');assert.equal(f.c.classList.contains('drag-over'),false);
});
test('Doing Now after marker clears the complete flattened descendant family',()=>{
 const f=fixture();f.hit(f.b);f.api.moveChildPreview(f.g,100,185);assert.equal(f.line().style.top,'290px');assert.equal(f.line().style.width,'272px');assert.equal(f.api.childDrop().id,'b');assert.equal(f.api.childDrop().after,true);
 f.hit(f.c);f.api.moveChildPreview(f.g,100,305);assert.equal(f.line().style.top,'300px');
});
test('room sibling after uses the containing card bottom without altering sibling scope',()=>{
 const f=fixture();f.b.matches=()=>false;f.b.getBoundingClientRect=()=>({left:30,right:310,width:280,top:150,bottom:290,height:140});f.hit(f.b);f.api.moveChildPreview(f.g,100,270);assert.equal(f.line().style.top,'290px');assert.equal(f.api.childDrop().id,'b');assert.equal(f.api.childDrop().after,true);
});
test('wrong-parent target and no target hide the line; cancellation clears preview',()=>{
 const f=fixture();f.hit(f.b);f.api.moveChildPreview(f.g,100,155);f.hit(f.nested);f.api.moveChildPreview(f.g,100,220);assert.equal(f.api.childDrop(),null);assert.equal(f.line().hidden,true);f.hit(f.b);f.api.moveChildPreview(f.g,100,155);f.api.resetChildGesture();assert.equal(f.line().hidden,true);assert.equal(f.api.childDrop(),null);
 f.hit(null);f.api.moveChildPreview(f.g,380,700);assert.equal(f.line().hidden,true);
});
test('existing child-to-root insertion geometry stays unchanged',()=>{
 const f=fixture();f.hit(f.other);f.api.moveChildPreview(f.g,100,445);assert.equal(f.api.childDrop().kind,'root');assert.equal(f.line().style.top,'440px');assert.equal(f.line().style.left,'14px');f.api.moveChildPreview(f.g,100,525);assert.equal(f.line().style.top,'530px');
});
test('root ordinary insertion remains a line, deliberate hold switches to nesting highlight',()=>{
 const f=fixture();f.api.armRoot({armed:true,id:'root',view:'room'});f.hit(f.other);f.api.indicateRootDrop(100,445);assert.equal(f.line().style.top,'440px');assert.equal(f.other.classList.contains('drop-nest'),false);f.api.indicateRootDrop(100,485);assert.equal(f.line().hidden,false);assert.equal(f.other.classList.contains('drop-nest'),false);f.timers.at(-1)();assert.equal(f.api.rootDrop().kind,'nest');assert.equal(f.line().hidden,true);assert.equal(f.other.classList.contains('drop-nest'),true);f.api.clearRootDrop();assert.equal(f.other.classList.contains('drop-nest'),false);
});
test('dropping after a sibling moves only the original family and preserves history across storage round trip',()=>{
 const f=fixture(),before=JSON.stringify(f.board.features.wins),byId=new Map(f.root.children.map(c=>[c.id,JSON.stringify(c)]));f.hit(f.b);f.api.moveChildPreview(f.g,100,185);const drop=f.api.childDrop();f.api.reorderChild(f.g.root,f.g.child,drop.id,drop.after);const saved=M.normalize(Codec.decode(Codec.encode(f.board)));const children=saved.tasks.find(t=>t.id==='root').children;assert.deepEqual(children.filter(c=>!c.parentId).map(c=>c.id),['b','a','c']);for(const c of children)assert.equal(JSON.stringify(c),byId.get(c.id));assert.equal(JSON.stringify(saved.features.wins),before);
});
test('existing cache is refreshed once and the reused fixed line is non-interactive',()=>{
 assert.equal((html.match(/src="js\/app\.js\?v=[^"]+-movemain1-dragchildline2"/g)||[]).length,1);assert.match(css,/\.tidy-task-insertion-line\{[^}]*position:fixed;pointer-events:none;/);assert.match(css,/\.tidy-task-insertion-line\[hidden\]\{display:none!important\}/);
});
