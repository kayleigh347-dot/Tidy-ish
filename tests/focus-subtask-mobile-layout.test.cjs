'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html');
const app=read('js/app.js');
const phone=read('js/focus-timer.js');
const css=fs.existsSync(path.join(root,'css/focus-subtask-mobile-layout.css'))
 ? read('css/focus-subtask-mobile-layout.css'):'';

test('responsive stylesheet loads once after the existing task-options CSS',()=>{
 const href='css/focus-subtask-mobile-layout.css?v=20261120-focus-subtask-mobile1';
 assert.equal(html.split(href).length,2,'one cache-busted stylesheet link');
 assert.ok(html.indexOf(href)>html.indexOf('css/task-options-05.css'));
});
test('320px Focus subtask action dialog is isolated and keeps every control inside',()=>{
 assert.match(app,/'child-menu':el=>\{/);
 assert.match(app,/dialog\('Subtask actions · '\+c.title/);
 assert.match(app,/'focus-child-first'/);
 assert.match(css,/@media\s*\(max-width:360px\)/);
 assert.match(css,/#editor:has\(\.doing-menu-grid > button\[data-action="focus-child-first"\]\)/);
 assert.match(css,/#dialog-title\{[^}]*min-width:0;[^}]*overflow-wrap:anywhere/);
 assert.match(css,/#editor:has\(\.doing-menu-grid > button\[data-action="focus-child-first"\]\) \.doing-menu-grid > button\{[^}]*min-width:0;[^}]*min-height:44px/);
});
for(const width of [393,430]){
 test(`${width}px Task Timer long unbroken child title cannot force horizontal dialog overflow`,()=>{
  assert.match(app,/function timerDialog\(t,cid=''/);
  assert.match(app,/dialog\('Task Timer · '\+item.title/);
  assert.match(css,/@media\s*\(max-width:430px\)/);
  assert.match(css,/#editor:has\(\.quest-time-panel\) #dialog-title\{[^}]*min-width:0;[^}]*overflow-wrap:anywhere/);
  assert.match(css,/#editor:has\(\.quest-time-panel\)\{[^}]*max-width:calc\(100% - 20px\)/);
 });
}
test('320px phone connection settings summary has a 44px touch target and native disclosure',()=>{
 assert.match(phone,/<details class="phone-timer-settings">/);
 assert.match(phone,/<summary>Phone connection settings<\/summary>/);
 assert.match(css,/#editor:has\(\.quest-time-panel\) \.phone-timer-settings > summary\{[^}]*min-height:44px/);
 assert.doesNotMatch(css,/\.phone-timer-settings > summary\{[^}]*display:flex/);
});
