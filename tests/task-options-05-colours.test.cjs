'use strict';
// Task options (05) source-only guards. Rendered acceptance requires authorised HTTPS preview.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'css/task-options-05.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const actions=['edit-task','move-side-quest','add-child','timer','data-open-task','save-template','library-reactivate','pause-task','delete-task'];
const menu='#editor .doing-menu-grid:has(> button[data-action="edit-task"])';

test('new menu stylesheet loads once after existing task/card styling',()=>{
  const prior=html.indexOf('css/task-layout-bundle.css?');
  const added=html.indexOf('css/task-options-05.css?v=20261120-vega-attempt1');
  assert.ok(prior>=0&&added>prior);
  assert.equal(html.split('css/task-options-05.css').length,2);
});

test('every visual selector is gated by a direct main-menu Edit task button',()=>{
  const selectors=[...css.matchAll(/(?:^|\n)(#editor[^\n{]+)\s*\{/g)].map(m=>m[1].trim());
  assert.equal(selectors.length,actions.length+1);
  for(const selector of selectors){
    assert.ok(selector.startsWith(menu+' > button[data-action'),selector);
    assert.ok(!selector.includes('edit-child')&&!selector.includes('focus-child'),selector);
  }
  assert.match(app,/dialog\('Task actions · '/);
  assert.match(app,/dialog\('Subtask actions · '/);
  assert.match(app,/button\('✎ Edit task','edit-task'/);
  assert.match(app,/button\('Edit','edit-child'/);
});

test('every main action gets a stable selector and distinct muted fill',()=>{
  const seen=new Set();
  for(const action of actions){
    const selector=menu+' > button[data-action="'+action+'"]';
    const at=css.indexOf(selector+' {');
    assert.ok(at>=0,'Missing '+action);
    const rule=css.slice(css.indexOf('{',at)+1,css.indexOf('}',at));
    const fill=rule.match(/--task-option-top:(#[0-9a-f]{6})/);
    const border=rule.match(/--task-option-border:(#[0-9a-f]{6})/);
    assert.ok(fill&&border,'Background/border missing for '+action);
    assert.ok(!seen.has(fill[1]),'Duplicate background for '+action);
    seen.add(fill[1]);
  }
});

test('ghost Move and Do again receive a real background and border',()=>{
  const base=css.slice(css.indexOf(menu+' > button[data-action] {'));
  const baseRule=base.slice(0,base.indexOf('}'));
  assert.match(baseRule,/background:linear-gradient/);
  assert.match(baseRule,/border:1px solid/);
  for(const action of ['move-side-quest','library-reactivate']){
    assert.match(css,new RegExp('button\\[data-action="'+action+'"\\]'));
    assert.match(app,new RegExp("'"+action+"',t.id,'ghost'"));
  }
});

test('two-column menu, existing labels, actions, minimum target and wrapping preserved',()=>{
  assert.match(fs.readFileSync(path.join(root,'css/style.css'),'utf8'),/\.doing-menu-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:7px\}/);
  assert.match(css,/min-height:41px/);
  assert.match(css,/white-space:normal/);
  assert.match(css,/overflow-wrap:anywhere/);
  for(const action of actions)assert.ok(app.includes("'"+action+"'"),action);
  assert.match(app,/Move to Side Task/);
  assert.match(app,/Do again/);
  assert.match(app,/Move to Side Task\?/);
});
