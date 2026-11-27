'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../js/model.js'),L=require('../js/quest-library.js'),SM=require('../js/sharing-model.js'),TSC=require('../js/local-storage-codec.js');
const Time=require('../js/quest-time-core.js');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const line=prefix=>{const result=source.split('\n').find(s=>s.trimStart().startsWith(prefix));assert.ok(result,prefix);return result.trim();};
const handlers=['library-save-custom','save-template','data-one-off-toggle'];
const raw=()=>({tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]});
const snap=x=>JSON.stringify(x);
function harness(shared=false){
 let dialog,stored;
 const c={M,L,CW:require('../js/custom-warnings.js'),TIME:Time,Q:{get:()=>null},focusBreakTimer:{cancelIfTaskUndone(){},start(){}},window:{},board:M.board(),route:'room',roomId:'kitchen',tab:'active',sideTab:'all',taskTitleSuggestionState:null,
 esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),sideChoices:()=>[['all','All'],['organisation','Organisation']],
 closeDialog(){},notice(){},showDialogSaveError:msg=>{throw Error(msg);},render(){},stampTaskEdits(){},
 dialog:(heading,html,save,opts)=>{dialog={heading,html,save,opts};},F:()=>c.board.features,rooms:()=>c.board.rooms,
 persist:next=>{stored=TSC.encode(next);c.board=next;}};
 if(shared){c.board.features.browserSync={house:'synthetic',account:'test',native:SM.snapshot(c.board),base:raw(),hidden:[]};c.window.TidySharing={transition:SM.transition,queue(){},people:()=>[]};}
 stored=TSC.encode(c.board);
 vm.createContext(c);
 const helpers=['button','field','area','check','select','detail','card'].map(name=>line('const '+name+'=')).join('\n');
 const tabs=source.slice(source.indexOf('function taskEditorTabs('),source.indexOf('\nlet photoImportState='));
 const editor=source.slice(source.indexOf('function taskEditor('),source.indexOf('\nfunction childEditor('));
 vm.runInContext(helpers+'\n'+tabs+'\n'+editor+'\n'+line('function change(')+'\nthis.actions=({'+handlers.map(id=>line("'"+id+"':")).join('\n')+'});',c);
 const form=d=>({get:k=>d[k]??null,has:k=>Object.hasOwn(d,k),getAll:k=>d[k]===undefined?[]:Array.isArray(d[k])?d[k]:[d[k]]});
 const baseForm={room:'kitchen',children:'One time preparation\nWeekly clean',priority:'3',estimate:'12',taskType:'cleaning',sideKind:'organisation',messImpact:'normal',showInSuggestions:'on'};
 const open=(original=null,template=false,mode='task')=>{c.taskEditor(original,template,mode);return dialog;};
 const submit=(title,fields={})=>dialog.save(form({...baseForm,title,...fields}));
 const create=async(title,fields,template=false,mode='task')=>{const d=open(null,template,mode);await submit(title,fields);return {d,item:(template?c.board.features.templates:c.board.tasks).find(t=>t.title===title)};};
 const action=(name,id)=>c.actions[name]({dataset:{id}});
 const reload=()=>{c.board=M.normalize(TSC.decode(stored));};
 return {c,open,submit,create,action,reload,rows:()=>L.libraryRows(c.board),saveState:()=>snap(c.board)};
}
const weekly={repeatValue:'1',repeatUnit:'weeks',firstDue:'2026-11-21'};
function checkWeekly(t,oneOff){assert.ok(t);assert.equal(t.repeatDays,7);assert.equal(t.repeatMonths,0);assert.equal(t.calendarEnabled,true);assert.equal(M.next(t,'2026-11-21'),'2026-11-28');if(oneOff!==undefined)assert.equal(t.children[0].oneOff,oneOff);}
function history(b){return snap({wins:b.features.wins,timings:b.features.questTimings});}
function checkNoOccurrenceState(t){assert.equal(t.done,false);assert.equal(t.elapsed,0);assert.equal(t.startedAt,0);assert.equal(t.nextDue,'');assert.equal(t._cycle,undefined);assert.equal(t._sharedId,undefined);assert.ok(!t._completionIds?.length);assert.equal(t.children[0].done,false);}
test('Path 1: scheduled weekly creation, explicit Add to library, reload, Use; source/history and one-off subtask preserved',async()=>{
 const h=harness(),{item,d}=await h.create('Scheduled weekly',weekly,false,'scheduled');assert.match(d.html,/name="repeatValue"[^>]*required/);checkWeekly(item,false);
 assert.equal(h.rows().saved.length,0,'creating does not implicitly save');assert.ok(h.rows().custom.some(t=>t.id===item.id));h.action('data-one-off-toggle',item.children[0].id);
 h.c.change(b=>M.finish(b,item.id,true));const tasks=snap(h.c.board.tasks),oldHistory=history(h.c.board);
 h.action('library-save-custom',item.id);assert.equal(snap(h.c.board.tasks),tasks);assert.equal(history(h.c.board),oldHistory);const id=h.rows().saved[0].id;
 h.reload();const saved=h.rows().saved.find(t=>t.id===id);checkWeekly(saved,true);checkNoOccurrenceState(saved);assert.ok(!h.rows().custom.some(t=>t.id===item.id));
 h.c.change(b=>L.activateSaved(b,id,['living'],false,M));const copy=h.c.board.tasks.find(t=>t.templateId===id);checkWeekly(copy,true);checkNoOccurrenceState(copy);assert.equal(history(h.c.board),oldHistory);assert.equal(snap(h.c.board.tasks.find(t=>t.id===item.id)),snap(JSON.parse(tasks)[0]));
});
test('Path 2: direct Add reusable task shows optional repeat controls, creates a template only, reloads and reuses weekly',async()=>{
 const h=harness();const d=h.open(null,true);assert.match(d.html,/Repeat every \(optional\)/);assert.match(d.html,/name="repeatValue"[^>]*value=""/);assert.doesNotMatch(d.html,/name="repeatValue"[^>]*required/);assert.match(d.html,/name="repeatUnit"/);assert.doesNotMatch(d.html,/name="firstDue"/);
 await h.submit('Direct weekly',{repeatValue:'1',repeatUnit:'weeks'});assert.equal(h.c.board.tasks.length,0);const id=h.rows().saved[0].id;h.reload();const saved=h.rows().saved.find(t=>t.id===id);checkWeekly(saved,false);checkNoOccurrenceState(saved);h.c.change(b=>L.activateSaved(b,id,['living'],false,M));const copy=h.c.board.tasks.find(t=>t.templateId===id);checkWeekly(copy,false);checkNoOccurrenceState(copy);assert.deepEqual(h.c.board.features.wins,[]);
});
test('Path 2: blank optional interval saves a non-repeating template',async()=>{const h=harness();const {item}=await h.create('No repeat',{repeatValue:'',repeatUnit:'weeks'},true);assert.ok(item);assert.equal(M.repeat(item),false);assert.notEqual(item.calendarEnabled,true);assert.equal(h.c.board.tasks.length,0);});
test('Path 2: days/months are supported; invalid nonblank interval is rejected before mutation',async()=>{
 for(const [unit,n,days,months] of [['days','3',3,0],['months','2',0,2]]){const h=harness(),{item}=await h.create('Direct '+unit,{repeatValue:n,repeatUnit:unit},true);assert.equal(item.repeatDays,days);assert.equal(item.repeatMonths,months);}
 for(const [value,unit] of [['0','weeks'],['-2','weeks'],['1.5','weeks'],['3651','weeks'],['1','years'],['x','weeks']]){const h=harness();h.open(null,true);const before=h.saveState();await assert.rejects(h.submit('Invalid',{repeatValue:value,repeatUnit:unit}),/valid repeat interval/);assert.equal(h.saveState(),before);}
});
test('Existing template edit keeps complex recurrence and a one-off child intact; ordinary Add Task does not get recurrence controls',async()=>{
 const h=harness();const t=M.task({id:'existing',title:'Existing template',room:'kitchen',repeatDays:1,repeatWeekdays:[1,3],repeatRestDays:[7],children:[M.child({title:'One time preparation',oneOff:true}),M.child({title:'Weekly clean'})]});h.c.change(b=>b.features.templates.push(t));const d=h.open(t,true);assert.doesNotMatch(d.html,/name="repeatValue"/);await h.submit(t.title);const updated=h.rows().saved[0];assert.deepEqual(updated.repeatWeekdays,[1,3]);assert.deepEqual(updated.repeatRestDays,[7]);assert.equal(updated.children[0].oneOff,true);assert.equal(h.rows().saved.length,1);assert.doesNotMatch(h.open().html,/name="repeatValue"/);
});
test('Path 1 completion edge: connected weekly occurrence uses preserved original recurrence when explicitly saved, not zeroed completed interval',async()=>{
 const h=harness(true),{item}=await h.create('Completed linked weekly',weekly,false,'scheduled');h.action('data-one-off-toggle',item.children[0].id);h.c.change(b=>M.finish(b,item.id,true));const completed=h.c.board.tasks.find(t=>t.id===item.id),next=h.c.board.tasks.find(t=>t.id===completed._cycle.next);assert.equal(completed.repeatDays,0);assert.equal(completed._cycle.original.repeatDays,7);checkWeekly(next,true);
 const before=snap(h.c.board.tasks),oldHistory=history(h.c.board);h.action('library-save-custom',item.id);const saved=h.rows().saved[0];checkWeekly(saved,true);checkNoOccurrenceState(saved);assert.equal(snap(h.c.board.tasks),before);assert.equal(history(h.c.board),oldHistory);h.reload();checkWeekly(h.rows().saved[0],true);h.c.change(b=>L.activateSaved(b,saved.id,['living'],false,M));checkWeekly(h.c.board.tasks.find(t=>t.templateId===saved.id),true);assert.equal(history(h.c.board),oldHistory);
});
test('Completed recurrence copies definition fields only, including weekday/rest days and months, without copying cycle or due dates',()=>{
 for(const recurrence of [{repeatDays:0,repeatMonths:3,repeatWeekdays:[],repeatRestDays:[7]},{repeatDays:1,repeatMonths:0,repeatWeekdays:[2,4],repeatRestDays:[6]}]){const b=M.board(),t=M.task({title:'Legacy completed',room:'kitchen',done:true,repeatDays:0,repeatMonths:0,repeatWeekdays:[],repeatRestDays:[],nextDue:'2026-11-10',_cycle:{next:'future',original:{...recurrence,nextDue:'2026-11-10',scheduleSpec:'old schedule'}}});M.add(b,t);const before=snap(b.tasks),saved=L.saveFromTask(b,t.id,M);for(const [k,v] of Object.entries(recurrence))assert.deepEqual(saved[k],v,k);checkNoOccurrenceState({...saved,children:[M.child()]});assert.equal(saved.scheduleSpec,undefined);assert.equal(snap(b.tasks),before);}
});
