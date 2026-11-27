'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const M=require('../js/model.js');
const CARE=require('../js/care-system.js');
const Codec=require('../js/local-storage-codec.js');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function context(board=M.board()){
 const ctx={
  M,CARE,board,F:()=>board.features,route:'grind',grindSection:'care',
  esc,
  button:(text,action,id='',cls='',extra='')=>`<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}" ${extra}>${text}</button>`,
  field:(label,name,value='',type='text',extra='')=>`<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`,
  select:(label,name,values,value)=>`<label>${esc(label)}<select name="${name}">${values.map(([id,title])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`,
  tabs:(items,active,action)=>`<nav>${items.map(([id,title])=>ctx.button(esc(title),action,id,id===active?'active':'')).join('')}</nav>`,
  dialog:(title,body,save,options)=>{ctx.lastDialog={title,body,save,options};},
  closeDialog:()=>{},change:fn=>{fn(board);return true;},carePill:state=>state.label,
  quickGrid:()=>'<div class="little-often-grid">quick tasks</div>'
 };
 function extract(name,next){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf(`\nfunction ${next}(`,start);
  assert.ok(start>=0&&end>start,`could extract ${name}`);
  ctx[name]=vm.runInNewContext(`(${source.slice(start,end).trim()})`,ctx);
 }
 extract('careEditor','dailyGrindPage');
 extract('dailyGrindPage','voiceCapture');
 return ctx;
}

function submitCareDialog(ctx,values){
 assert.ok(ctx.lastDialog?.save,'care dialog should expose its save handler');
 ctx.lastDialog.save(new Map(Object.entries(values)));
}

test('care tabs filter category rows, retain legacy custom tasks in All and Aquatic, and leave Little & Often and Home shortcuts intact',()=>{
 const board=M.board();
 const legacy=CARE.saveRule(board,'',{title:'Legacy custom',warning:'',type:'daily'},()=> 'legacy');
 CARE.complete(board,'cat',()=> 'cat-win',new Date('2026-11-10T12:00:00Z'));
 const c=context(board);
 c.grindSection='care';
 let html=c.dailyGrindPage();
 for(const [id,label] of [['care','All'],['cat','Cat Tray'],['aquatic','Fish · Isopods · Plants'],['often','Little & Often']]){
  assert.ok(html.includes(`data-action="open-grind" data-id="${id}"`),`${label} tab is present`);
 }
 for(const rule of CARE.RULES)assert.ok(html.includes(`data-action="care-done" data-id="${rule.id}"`),`${rule.id} appears in All`);
 assert.ok(html.includes(`data-action="care-done" data-id="${legacy.id}"`));
 c.grindSection='cat';
 html=c.dailyGrindPage();
 assert.ok(html.includes('data-action="care-done" data-id="cat"'));
 assert.ok(!html.includes('data-action="care-done" data-id="fish-topup"'));
 assert.ok(!html.includes(`data-action="care-done" data-id="${legacy.id}"`));
 c.grindSection='aquatic';
 html=c.dailyGrindPage();
 assert.ok(html.includes('data-action="care-done" data-id="fish-topup"'));
 assert.ok(html.includes('data-action="care-done" data-id="plants"'));
 assert.ok(html.includes(`data-action="care-done" data-id="${legacy.id}"`));
 assert.ok(!html.includes('data-action="care-done" data-id="cat"'));
 c.grindSection='often';
 html=c.dailyGrindPage();
 assert.match(html,/little-often-grid/);
 assert.match(html,/Little &amp; Often/);
 assert.match(source,/\['cat','Cat Tray'/);
 assert.match(source,/\['aquatic','Fish · Isopods · Plants'/);
 assert.match(source,/!CARE\.RULES\.some\(base=>base\.id===rule\.id\)/,'categorized custom care warnings remain visible');
 assert.equal(CARE.wins(board,'cat')[0].id,'cat-win');
});

test('new care tasks inherit the selected category or require a choice from All; edits preserve identity, history and local persistence',()=>{
 const board=M.board();
 const catWin=CARE.complete(board,'cat',()=> 'stable-cat-win',new Date('2026-11-10T12:00:00Z'));
 const c=context(board);
 c.grindSection='care';
 c.careEditor();
 assert.match(c.lastDialog.body,/<select name="group">/,'All offers a category choice');
 submitCareDialog(c,{title:'Water basil',warning:'',type:'daily',group:'aquatic'});
 let created=board.features.careDefinitions.at(-1);
 assert.equal(created.group,'aquatic');
 assert.match(c.dailyGrindPage(),/Water basil/);
 c.grindSection='cat';
 c.careEditor();
 assert.doesNotMatch(c.lastDialog.body,/<select name="group">/,'Cat Tray inherits the selected category');
 submitCareDialog(c,{title:'Refresh cat mat',warning:'',type:'weekly'});
 assert.equal(board.features.careDefinitions.at(-1).group,'cat');
 c.grindSection='aquatic';
 c.careEditor();
 submitCareDialog(c,{title:'Check filter',warning:'',type:'monthly'});
 assert.equal(board.features.careDefinitions.at(-1).group,'aquatic');
 c.careEditor('cat');
 submitCareDialog(c,{title:'Scoop tray',warning:'',type:'daily'});
 assert.equal(CARE.rule('cat',board).id,'cat');
 assert.equal(CARE.wins(board,'cat')[0].id,catWin.id);
 assert.equal(CARE.undo(board,'cat',catWin.id),true);
 assert.equal(CARE.undo(board,'cat',catWin.id),false);
 const reloaded=M.normalize(Codec.decode(Codec.encode(board)));
 assert.deepEqual(reloaded.features.careDefinitions,board.features.careDefinitions);
});

test('app script cache key advances for the care category UI',()=>{
 assert.match(html,/js\/app\.js\?v=[^"]+-petcaretabs1"/);
});
