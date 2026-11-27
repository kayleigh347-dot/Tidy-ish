'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../js/model.js'),SW=require('../js/seasonal-workflow.js'),S=require('../js/seasonal-core.js'),OCC=require('../js/occasional.js');
const src=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(board=M.board()){
 let modal,listener,saveCount=0;const date={value:'2026-12-25',addEventListener:(type,fn)=>listener=fn,removeEventListener:()=>listener=null},shifted=[{value:'2026-12-01'},{value:'2027-01-05'},{value:'2026-12-03'}];
 const handlers={},panels=Object.create(null),toggles=Object.create(null),labels=Object.create(null);
 const panelFor=i=>(panels[i]??={id:'seasonal-task-options-'+i,hidden:true});
 const toggleFor=i=>(toggles[i]??={textContent:'Edit',attr:{'aria-controls':'seasonal-task-options-'+i,'aria-expanded':'false'},getAttribute(k){return this.attr[k]},setAttribute(k,v){this.attr[k]=v}});
 const editor={querySelector:sel=>{if(sel==='[name="eventDate"]')return date;const p=sel.match(/^#seasonal-task-options-(\d+)$/);if(p)return panelFor(p[1]);const t=sel.match(/^\[aria-controls="seasonal-task-options-(\d+)"\]$/);if(t)return toggleFor(t[1]);const l=sel.match(/^\[data-seasonal-task-label="(\d+)"\]$/);if(l)return labels[l[1]]??={textContent:''};return null;},querySelectorAll:()=>shifted,addEventListener:(type,fn)=>handlers[type]=fn,removeEventListener:(type,fn)=>{if(handlers[type]===fn)delete handlers[type]}};
 const ctx={M:{...M,date:()=> '2026-12-10'},SW,OCC,board,esc,window:{TidySeasonal:S},F:()=>ctx.board.features,editor,dialog:(title,body,save)=>modal={title,body,save},closeDialog:()=>{},persist:b=>{ctx.board=b;saveCount++},stampTaskEdits:()=>{},render:()=>{},notice:()=>{},dialogCleanup:null,showDialogSaveError:e=>{throw Error(e)},route:'doing',doingTab:'doing',doingDetailed:false,doingCollapsed:new Set(),search:'',deleted:null,tabs:()=>'',taskList:ts=>ts.map(t=>`<i>${esc(t.title)}</i>`).join(''),groupedTasks:ts=>ts.map(t=>`<b>${esc(t.title)}</b>`).join(''),completedDoingList:()=>''};
 for(const n of ['button','field','area','check','select'])ctx[n]=vm.runInNewContext('('+src.match(new RegExp('^const '+n+'=(.+);$','m'))[1]+')',ctx);
 const fn=(name,next)=>vm.runInNewContext('('+src.slice(src.indexOf('function '+name+'('),src.indexOf('\nfunction '+next+'('))+')',ctx);
 ctx.visibleTasks=fn('visibleTasks','taskList');return {ctx,date,shifted,shift:()=>listener(),panelFor,toggleFor,handlers,fire:(kind,target)=>handlers[kind]({target}),modal:()=>modal,saved:()=>saveCount,edit:fn('seasonalWorkflowEditor','seasonalGiftArchiveHtml'),doing:fn('doingPage','guardianThumb'),home:fn('seasonalHomeSection','seasonalWorkflowChooser')};
}
const draft={name:'Winter event',preset:'custom',recurrence:'annual',dateRule:'fixed',leapPolicy:'reject',annualEnabled:true,tasksEnabled:true,decorationsEnabled:true,countdown:true,celebrated:false,eventDate:'2026-12-25',preparationStartDate:'2026-12-01',endDate:'2027-01-05',items:[{title:'Early task',selected:true,startDate:'2026-12-03',repeat:true,children:[]},{title:'Optional task',selected:false,startDate:'2026-12-04',repeat:true,children:[]}]};
function form(d,extra={}){return new Map(Object.entries({name:d.name,eventDate:d.eventDate,preparationStartDate:d.preparationStartDate,endDate:d.endDate,dateRule:d.dateRule,leapPolicy:d.leapPolicy,annualEnabled:'on',tasksEnabled:'on',decorationsEnabled:'on',countdown:'on',newStart:d.preparationStartDate,...Object.fromEntries(d.items.flatMap((r,i)=>[[`title-${i}`,r.title],[`start-${i}`,r.startDate],[`reminder-${i}`,r.startDate],[`repeat-${i}`,'on'],...(r.selected?[[`selected-${i}`,'on']]:[])])),...extra}));}
test('actual editor callback: opening is read-only, shifting moves the window, valid save creates one occurrence and optional stays uncreated',()=>{const f=fixture(),before=JSON.stringify(f.ctx.board);f.edit('',draft);assert.equal(JSON.stringify(f.ctx.board),before);assert.match(f.modal().body,/name="selected-0" checked/);assert.match(f.modal().body,/aria-label="Edit options for Early task"/);f.date.value='2026-12-28';f.shift();assert.deepEqual(f.shifted.map(x=>x.value),['2026-12-04','2027-01-08','2026-12-06']);f.modal().save(form(draft));assert.equal(f.saved(),1);assert.equal(f.ctx.board.features.occasionOccurrences.length,1);assert.equal(f.ctx.board.tasks.length,1);const o=f.ctx.board.features.occasionOccurrences[0];f.edit(o.id);assert.match(f.modal().body,/This year only/);assert.match(f.modal().body,/Every year/);const d=SW.editable(f.ctx.board,o.id);f.modal().save(form(d,{name:'Renamed',scope:'this'}));assert.equal(f.saved(),2);assert.equal(SW.inspect(f.ctx.board,o.id).name,'Renamed');assert.equal(f.ctx.board.features.occasionTemplates[0].name,'Winter event');});
test('actual editor callback rejects invalid dates and stale edits without persistence',()=>{const f=fixture(SW.create(M.board(),draft)),o=f.ctx.board.features.occasionOccurrences[0],d=SW.editable(f.ctx.board,o.id);f.edit(o.id);const before=JSON.stringify(f.ctx.board);assert.throws(()=>f.modal().save(form(d,{'start-0':'2026-11-01',scope:'this'})),/inside/);assert.equal(JSON.stringify(f.ctx.board),before);assert.equal(f.saved(),0);f.ctx.board=SW.configure(f.ctx.board,o.id,{...d,name:'Changed elsewhere'},'this');assert.throws(()=>f.modal().save(form(d,{scope:'this'})),/changed/);assert.equal(f.saved(),0);});
test('actual Doing Now and Home renderers show only active selected tasks, once, above ordinary tasks',()=>{let b=SW.reconcile(SW.create(M.board(),draft),'2026-12-10').board;const t=M.task({title:'Ordinary task',doing:true});M.add(b,t);M.select(b,t.id,true);const f=fixture(b),before=JSON.stringify(b),doing=f.doing(),home=f.home();assert.ok(doing.indexOf('Early task')<doing.indexOf('Ordinary task'));assert.equal((doing.match(/Early task/g)||[]).length,1);assert.doesNotMatch(doing,/Optional task/);assert.match(home,/Winter event/);assert.match(home,/Early task/);assert.match(home,/15 days to go/);assert.equal(JSON.stringify(b),before);});

test('Attempt 2: linked name read-only, no decorations control, existing decorations setting preserved',()=>{
 const b=SW.create(M.board(),{...draft,decorationsEnabled:false}),o=b.features.occasionOccurrences[0],f=fixture(b);f.edit(o.id);const body=f.modal().body;assert.match(body,/name="title-0"[^>]*readonly/);assert.match(body,/Rename it using the task’s usual Edit action/);assert.doesNotMatch(body,/Enable decorations this year|name="decorationsEnabled"/);const d=SW.editable(b,o.id);f.modal().save(form(d,{'title-0':'Forged rename',scope:'this'}));assert.equal(SW.inspect(f.ctx.board,o.id).settings.decorationsEnabled,false);assert.equal(SW.inspect(f.ctx.board,o.id).items[0].title,'Early task');assert.equal(f.ctx.board.tasks[0].title,'Early task');assert.equal(f.ctx.board.tasks[0].id,b.tasks[0].id);
});
test('Attempt 2: Easter editor discloses missing Egg Hunt preset without a default date',()=>{const f=fixture();f.edit('',{...draft,...SW.preset('easter','2027-03-28'),preset:'easter'});assert.match(f.modal().body,/Egg hunt is not scheduled by default/);assert.doesNotMatch(f.modal().body,/value="Egg hunt"/i);});

test('compact occasion checklist keeps options closed, toggles individual Edit controls, and preserves checked choices',()=>{
 const f=fixture();f.edit('',draft);const html=f.modal().body;
 assert.match(html,/name="selected-0" checked/);assert.match(html,/name="selected-1" (?!checked)/);
 assert.match(html,/id="seasonal-task-options-0" hidden/);
 assert.match(html,/aria-controls="seasonal-task-options-1" aria-expanded="false"/);
 const toggle=f.toggleFor(0),panel=f.panelFor(0),clickTarget={closest:selector=>selector==='[data-seasonal-options-toggle]'?toggle:null};
 assert.equal(panel.hidden,true);f.fire('click',clickTarget);assert.equal(panel.hidden,false);assert.equal(toggle.attr['aria-expanded'],'true');assert.equal(toggle.textContent,'Close');
 f.fire('click',clickTarget);assert.equal(panel.hidden,true);assert.equal(toggle.attr['aria-expanded'],'false');assert.equal(toggle.textContent,'Edit');
 f.modal().save(form(draft));const o=f.ctx.board.features.occasionOccurrences[0],d=SW.editable(f.ctx.board,o.id);
 assert.equal(d.items[0].selected,true);assert.equal(d.items[1].selected,false);
 f.edit(o.id);assert.match(f.modal().body,/name="selected-0" checked/);assert.match(f.modal().body,/name="selected-1" (?!checked)/);
});
test('hidden options reveal themselves on an invalid input and edit title labels do not inject markup',()=>{
 const f=fixture();f.edit('',draft);const panel=f.panelFor(0),toggle=f.toggleFor(0);
 const invalidTarget={closest:selector=>selector==='.seasonal-task-options'?panel:null};
 f.fire('invalid',invalidTarget);assert.equal(panel.hidden,false);assert.equal(toggle.attr['aria-expanded'],'true');
 const input={name:'title-0',value:'<Gift> & new',readOnly:false,closest:selector=>selector==='[name^="title-"]'?input:null};
 f.fire('input',input);assert.equal(f.ctx.editor.querySelector('[data-seasonal-task-label="0"]').textContent,'<Gift> & new');
 assert.doesNotMatch(f.modal().body,/name="decorationsEnabled"/);
});
test('new Christmas and birthday choices preserve preset optional defaults inside the window',()=>{
 const original=SW.preset('christmas','2026-12-25');
 assert.equal(original.items.find(t=>t.title==='Food shopping').selected,false);
 let chooserSave,captured,closeCount=0;
 const ctx={SW,M:{date:()=> '2026-11-25'},dialog:(_title,_html,callback)=>{chooserSave=callback;},field:(...args)=>args.join('|'),select:(...args)=>args.join('|'),closeDialog:()=>closeCount++,seasonalWorkflowEditor:(_id,d)=>captured=d};
 const start=src.indexOf('function seasonalWorkflowChooser('),end=src.indexOf('\nfunction seasonalWorkflowEditor(',start);
 vm.runInNewContext('('+src.slice(start,end)+')',ctx)();
 chooserSave(new Map([['preset','christmas'],['eventDate','2026-11-25'],['recurrence','annual']]));
 assert.equal(closeCount,1);assert.ok(captured.items.length>1);
 assert.equal(captured.items.find(t=>t.title==='Food shopping').selected,false);
 assert.ok(captured.items.filter(t=>t.title!=='Food shopping').every(t=>t.selected));
 assert.equal(original.items.find(t=>t.title==='Food shopping').selected,false);
 // Moving an event shifts the dates, not whether an optional suggestion is ticked.
 const f=fixture();f.edit('',captured);
 const idx=captured.items.findIndex(t=>t.title==='Food shopping');
 assert.match(f.modal().body,new RegExp('name="selected-'+idx+'" (?!checked)'));
 f.date.value='2026-12-28';f.shift();
 assert.match(f.modal().body,new RegExp('name="selected-'+idx+'" (?!checked)'));
 assert.match(f.modal().body,/Optional suggestions stay unchecked until you tick them/);
 chooserSave(new Map([['preset','birthday'],['eventDate','2026-12-25'],['recurrence','annual']]));
 assert.equal(captured.items.find(t=>t.title==='Organise celebration').selected,false);
 assert.equal(captured.items.find(t=>t.title==='Party supplies').selected,false);
 assert.equal(captured.items.find(t=>t.title==='Plan activities').selected,true);
});
test('out-of-window suggestions remain unticked on first creation and saved edits keep deliberate deselections',()=>{
 let chooserSave,captured;
 const ctx={SW,M:{date:()=> '2026-11-25'},dialog:(_title,_html,callback)=>{chooserSave=callback;},field:(...args)=>args.join('|'),select:(...args)=>args.join('|'),closeDialog:()=>{},seasonalWorkflowEditor:(_id,d)=>captured=d};
 const start=src.indexOf('function seasonalWorkflowChooser('),end=src.indexOf('\nfunction seasonalWorkflowEditor(',start);
 vm.runInNewContext('('+src.slice(start,end)+')',ctx)();
 chooserSave(new Map([['preset','newyear'],['eventDate','2027-01-01'],['recurrence','annual']]));
 assert.equal(captured.items.find(t=>t.title==='Plan activities').selected,false);
 assert.equal(captured.items.find(t=>t.title==='Take down Christmas decorations').selected,true);
 const f=fixture(SW.create(M.board(),draft)),o=f.ctx.board.features.occasionOccurrences[0];
 f.edit(o.id);const html=f.modal().body;
 assert.match(html,/name="selected-0" checked/);assert.match(html,/name="selected-1" (?!checked)/);
});

test('Christmas decoration control is independent of tasks and countdown and preserves saved task IDs',()=>{
 const d={...draft,...SW.preset('christmas','2026-12-25'),preset:'christmas',decorationsEnabled:true};
 const b=SW.reconcile(SW.create(M.board(),d),'2026-12-10').board,o=b.features.occasionOccurrences[0],f=fixture(b),before=b.tasks.map(t=>t.id);
 f.edit(o.id);assert.match(f.modal().body,/name="decorationsEnabled" checked/);
 const fd=form(SW.editable(b,o.id),{scope:'this'});fd.delete('decorationsEnabled');f.modal().save(fd);
 const saved=SW.inspect(f.ctx.board,o.id);assert.equal(saved.settings.decorationsEnabled,false);assert.equal(saved.settings.tasksEnabled,true);assert.equal(saved.settings.countdown,true);assert.deepEqual(f.ctx.board.tasks.map(t=>t.id),before);
 f.edit(o.id);assert.match(f.modal().body,/name="decorationsEnabled" (?!checked)/);assert.equal(f.saved(),1);
});
