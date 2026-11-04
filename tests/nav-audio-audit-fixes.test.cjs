const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('bottom navigation has the six requested destinations and supplied artwork',()=>{
 const app=read('js/app.js');
 assert.match(app,/const destinations=\[\['home','Home'\],\['doing','Doing Now'\],\['focus-hub','Focus'\],\['calendar','Calendar'\],\['data','Data'\],\['more','More'\]\]/);
 assert.match(app,/navigation\/navigation-six-tabs-focus\.webp/);
 assert.match(app,/aria-label="Main navigation"/);
 assert.match(app,/function focusHubPage\(\)[\s\S]*?focus-hub-doing[\s\S]*?focus-hub-room/);
 assert.match(app,/focus-hub':'Focus'/);
 assert.match(app,/route==='focus-hub'\?focusHubPage\(\)/);
 assert.match(app,/\['side','Side Quests'\]/);
});

test('saved Room and Doing Now Focus sessions offer Resume or Start new',()=>{
 const Model=require('../js/model.js');
 globalThis.TidyQuestTime=require('../js/quest-time-core.js');
 const Focus=require('../js/quest-focus.js');
 globalThis.TidyQuestFocus=Focus;
 delete require.cache[require.resolve('../js/quest-focus-ui.js')];
 const UI=require('../js/quest-focus-ui.js'),board=Model.board(),values=new Map(),dialogs=[];let serial=0;
 const api={board:()=>board,room:()=> 'kitchen',date:()=> '2026-11-02',notice:()=>{},render:()=>{},storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},memberId:()=> 'nav-audio-audit',makeId:()=>`nav-audit-${++serial}`,dialog:(title,body)=>dialogs.push({title,body}),closeDialog:()=>{},editor:()=>({querySelector:()=>null,querySelectorAll:()=>[]}),returnTasks:()=>[],renderFocusTask:()=>'',leave:()=>{},openFocus:()=>{}};
 UI.init(api);
 const roomTask=Model.task({id:'nav-room-task',title:'Room task',room:'kitchen'});board.tasks.push(roomTask);
 UI.enter(board,'kitchen','focus');UI.pick(roomTask.id);UI.enter(board,'kitchen','focus');
 assert.equal(dialogs.at(-1).title,'Previous Focus found');assert.match(dialogs.at(-1).body,/Resume Focus/);assert.match(dialogs.at(-1).body,/Start new Focus/);
 const doingTask=Model.task({id:'nav-doing-task',title:'Doing task',room:'bathroom',doing:true});board.tasks.push(doingTask);
 UI.enter(board,'kitchen','focus','doing');UI.pick(doingTask.id);UI.enter(board,'kitchen','focus','doing');
 assert.match(dialogs.at(-1).body,/Doing Now across all rooms/);assert.match(dialogs.at(-1).body,/Resume Focus/);
});

test('calm local music and soft timer sound exist; no electronic oscillator beep remains',()=>{
 const app=read('js/app.js'),sources=read('sounds/SOURCES.txt');
 for(const file of ['forest-ambience.mp3','subtle-bass.mp3','soft-double-tap.wav'])assert.ok(fs.statSync(path.join(root,'sounds',file)).size>1000,file+' should be bundled');
 assert.match(app,/forest-ambience/);assert.match(app,/subtle-bass/);assert.match(app,/soft-double-tap\.wav/);assert.match(app,/Music and alarm volume/);
 assert.doesNotMatch(app,/createOscillator|frequency\.value\s*=\s*660|calm\.wav|dubstep\.wav|morning\.wav|steps\.wav|waltz\.wav/);
 assert.match(sources,/License: CC0 \/ public domain/);assert.match(sources,/contains no high-pitched oscillator or beep/);
});

test('touch layouts preserve 44px target height and navigation fallback text',()=>{
 const css=read('css/mobile-tap-targets.css'),navCss=read('css/style.css'),app=read('js/app.js');
 assert.match(css,/@media\(pointer:coarse\)/);assert.match(css,/#app button,#app summary,#app \[role="tab"\],#app a\{min-height:44px\}/);
 assert.match(navCss,/\.nav-image-missing \.nav-fallback-label/);assert.match(app,/nav-image-missing/);
});
