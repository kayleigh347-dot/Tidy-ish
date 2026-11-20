'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css/subtask-colours.css'),'utf8');
const main=fs.readFileSync(path.join(root,'css/style.css'),'utf8');
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');

test('consolidation retains both new stylesheet links once, in a predictable order',()=>{
  const names=['css/subtask-colours.css','css/task-options-05.css'];
  let index=html.indexOf('css/task-layout-bundle.css');
  assert.ok(index>=0);
  for(const name of names){
    assert.equal(html.split(name).length,2,name);
    const i=html.indexOf(name);assert.ok(i>index,name);index=i;
  }
});
test('subtask palette keeps independent sibling colours and all directional drag states',()=>{
  assert.match(css,/#app \.task \.child:nth-of-type\(4n \+ 1\)/);
  assert.match(css,/#app \.task \.child:nth-of-type\(4n \+ 2\)/);
  assert.match(css,/#app \.task \.child\.drag-over\.child-drop-before/);
  assert.match(css,/#app \.task \.child\.drag-over\.child-drop-after/);
  assert.match(css,/inset 0 3px 0 var\(--gold\)/);
  assert.match(css,/inset 0 -3px 0 var\(--gold\)/);
});
test('room subtask completed titles use the recovered scoped strike-through rule',()=>{
  assert.match(main,/#app \.room-child > \.row > \.grow\.muted\{text-decoration:line-through\}/);
  assert.match(app,/function doingChildren\(/);
  assert.match(app,/function childrenHtml\(/);
});

test('room-subtask strike-through has a new stylesheet cache key on reload',()=>{
  const current='css/style.css?v=20261104-laundry-single-load1-interface2-subtasktimer2-masterportrait2-roomchildstrike2';
  const stale='css/style.css?v=20261104-laundry-single-load1-interface2-subtasktimer2-masterportrait2"';
  assert.equal(html.split(current).length,2,'new cache key must be linked exactly once');
  assert.ok(!html.includes(stale),'old #58 cache URL must not remain');
  assert.match(main,/#app \.room-child > \.row > \.grow\.muted\{text-decoration:line-through\}/);
});
