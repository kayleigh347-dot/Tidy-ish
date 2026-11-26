'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../js/model.js'),SW=require('../js/seasonal-workflow.js'),S=require('../js/seasonal-core.js');
const Theme=require('../js/seasonal-theme.js');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const chunk=source.slice(source.indexOf('function seasonalHomeSection(){'),source.indexOf('\nfunction seasonalWorkflowChooser(){'));
function render(board,today='2026-11-25'){
 const context={M:{date:()=>today},SW,board,window:{TidySeasonal:S,TidySeasonalTheme:Theme},esc:htmlEscape,button:(title,action,id,cls='',extra='')=>`<button class="${cls}" data-action="${action}" data-id="${htmlEscape(id)}" ${extra}>${title}</button>`};
 return vm.runInNewContext(`(${chunk})`,context)();
}
function event(preset,eventDate,overrides={}){
 const d={...SW.preset(preset,eventDate),preset,recurrence:'annual',dateRule:'fixed',leapPolicy:'reject',annualEnabled:true,tasksEnabled:true,decorationsEnabled:true,celebrated:false,...overrides};
 return SW.create(M.board(),d);
}
test('Christmas Home gives a large accessible countdown, festive styling, active tasks, and opens existing occasion',()=>{
 const board=SW.reconcile(event('christmas','2026-12-25'),'2026-11-25').board,prior=JSON.stringify(board);
 const html=render(board);assert.match(html,/class="seasonal-home-event seasonal-home-christmas is-decorated"/);
 assert.match(html,/<strong class="seasonal-christmas-number">30<\/strong>/);
 assert.match(html,/aria-label="30 days until Christmas"/);
 assert.match(html,/days to go/);assert.match(html,/Christmas to-dos/);assert.match(html,/Buy gifts/);
 assert.match(html,/data-action="seasonal-open"/);assert.match(html,/class="seasonal-christmas-icon" aria-hidden="true"/);
 assert.equal(JSON.stringify(board),prior,'Home render is read-only');
});
test('occasion-specific celebrations: Christmas day is Today, and countdown displays singular day',()=>{
 const board=SW.reconcile(event('christmas','2026-12-25'),'2026-12-24').board;
 assert.match(render(board,'2026-12-24'),/aria-label="1 day until Christmas"/);
 assert.match(render(board,'2026-12-24'),/>day to go<\/span>/);
 assert.match(render(board,'2026-12-25'),/It’s Christmas!/);
 assert.doesNotMatch(render(board,'2026-12-25'),/class="seasonal-christmas-number"/);
});
test('Christmas ornaments stop after 30 December without removing the still-open occasion',()=>{
 const board=SW.reconcile(event('christmas','2026-12-25'),'2026-12-31').board;
 const html=render(board,'2026-12-31');
 assert.match(html,/Christmas plans/);assert.doesNotMatch(html,/is-decorated|seasonal-christmas-icon/);
 assert.match(html,/Christmas has passed/);
});
test('disabled decoration preference removes visual ornaments but keeps the Christmas countdown',()=>{
 const board=SW.reconcile(event('christmas','2026-12-25',{decorationsEnabled:false}),'2026-11-25').board;
 const html=render(board);assert.match(html,/class="seasonal-home-event seasonal-home-christmas"/);
 assert.doesNotMatch(html,/seasonal-christmas-icon|is-decorated/);
 assert.match(html,/class="seasonal-christmas-number">30/);
});
test('non-Christmas occasions retain their former neutral Home layout',()=>{
 const board=SW.reconcile(event('birthday','2026-12-10'),'2026-11-25').board,html=render(board);
 assert.match(html,/15 days to go/);assert.match(html,/seasonal-home-event/);
 assert.doesNotMatch(html,/seasonal-home-christmas|Christmas to-dos/);
});
test('Christmas Home escapes user-defined occasion names and makes no changes when none are active',()=>{
 const board=SW.reconcile(event('christmas','2026-12-25',{name:'<img onerror=alert(1)>'}),'2026-11-25').board;
 const html=render(board);assert.doesNotMatch(html,/<img onerror/);assert.match(html,/&lt;img/);
 assert.equal(render(M.board()),'');
});
test('countdown can be switched off without hiding active Christmas tasks',()=>{
 const board=SW.reconcile(event('christmas','2026-12-25',{countdown:false}),'2026-11-25').board,html=render(board);
 assert.doesNotMatch(html,/seasonal-christmas-number|It’s Christmas!/);
 assert.match(html,/Christmas to-dos/);
});
test('Christmas styles have responsive and reduced-motion fallbacks, and only source files get versioned',()=>{
 const css=fs.readFileSync(require.resolve('../css/seasonal-hub.css'),'utf8');
 const index=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.match(css,/seasonal-christmas-number\{font-size:clamp\(4rem/);
 assert.match(css,/@media\(max-width:350px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(index,/seasonal2b1-seasonal2c1-workloada2-taskcheck1-christmashome1/);
 assert.match(index,/seasonalshare1-taskcheck1-christmashome1/);
});
