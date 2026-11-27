'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../js/model.js'),SW=require('../js/seasonal-workflow.js'),Theme=require('../js/seasonal-theme.js');
const root=require('node:path').resolve(__dirname,'..'),source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function christmasBoard(){const draft={...SW.preset('christmas','2026-12-25'),preset:'christmas',recurrence:'annual',dateRule:'fixed',leapPolicy:'reject',annualEnabled:true,tasksEnabled:true,decorationsEnabled:true,celebrated:false};return SW.create(M.board(),draft);}
function roomHtml(id,board,date='2026-11-27',preferences={decorations:true,animation:true}){
 const start=source.indexOf('function roomScene('),end=source.indexOf('\nfunction taskToolbar()',start),code=source.slice(start,end);
 const ctx={board,M:{mess:()=>0,phrase:()=>'Spotless',date:()=>date},houseKey:r=>r.id,seasonalTheme:Theme,seasonalDisplay:preferences,asset:p=>'assets/'+p,esc:escapeHtml,button:(text,action,id,cls,extra)=>`<button class="${cls}" data-action="${action}" data-id="${id}" ${extra}>${text}</button>`,meter:()=>'<div class="meter"></div>'};
 return vm.runInNewContext(`(${code})`,ctx)({id,name:id});
}
class FakeAudio{
 static played=[];
 constructor(src){this.src=src;this.volume=1;this.paused=true;this.listeners={};FakeAudio.played.push(this);}
 addEventListener(name,fn){this.listeners[name]=fn;}
 play(){this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
}

test('Christmas decor uses trees in the requested rooms and never shows the gonk',()=>{
 const board=christmasBoard();
 for(const id of ['living','master','penny','bathroom']){
  const html=roomHtml(id,board);
  assert.match(html,new RegExp(`class="seasonal-room-tree seasonal-room-tree-${id}"`));
  assert.match(html,/assets\/seasonal\/christmas\/tree\.webp/);
  assert.match(html,/aria-hidden="true"/);
  assert.match(html,/christmas-costume/);
  assert.doesNotMatch(html,/gonk\.webp|elf/i);
 }
 assert.doesNotMatch(roomHtml('kitchen',board),/seasonal-room-tree/);
 assert.doesNotMatch(roomHtml('living',board,'2026-11-27',{decorations:false,animation:true}),/seasonal-room-tree/);
 assert.doesNotMatch(roomHtml('living',board,'2026-11-27',{decorations:false,animation:true}),/christmas-costume/);
 assert.equal(Theme.manifest.christmas.character,'tree.webp');
 assert.doesNotMatch(fs.readFileSync(require.resolve('../css/seasonal-theme.css'),'utf8'),/gonk\.webp/);
});

test('Christmas jingle plays locally only during Christmas with sound enabled, without overlapping or replaying on redraw',()=>{
 assert.ok(source.includes('function playChristmasJingle('),'Christmas jingle helper should be defined');
 const start=source.indexOf('function isChristmasActive()'),end=source.indexOf('\nfunction dailyLogState()',start),code=source.slice(start,end);
 assert.ok(start>=0&&end>start,'Christmas audio helpers and change() should be defined together');
 FakeAudio.played=[];
 const board=christmasBoard(),linkedId=board.features.occasionOccurrences[0].taskLinks[0].taskId;board.features.sound=true;
 const bodyClasses=new Set(),ctx={board,SW,M:{clone:M.clone,date:()=> '2026-11-27'},F:()=>ctx.board.features,Audio:FakeAudio,christmasJingle:null,christmasJinglePending:false,seasonalDisplay:{decorations:true,animation:true},window:{TidySharing:{transition(){},queue(){}}},document:{hidden:false,body:{classList:{add:x=>bodyClasses.add(x),remove:x=>bodyClasses.delete(x)},get offsetWidth(){return 1;}}},asset:p=>'sounds/'+p.replace(/^audio\//,''),soundVolume:.12,setTimeout(){},stampTaskEdits(){},persist(next){ctx.board=next;},render(){},showDialogSaveError(){},notice(){},storageError:'',route:'room'};
 vm.runInNewContext(code+';this.audioApi={playChristmasJingle,stopChristmasJingle,change};',ctx);
 const {playChristmasJingle,stopChristmasJingle,change}=ctx.audioApi;
 assert.equal(playChristmasJingle(),true);assert.equal(FakeAudio.played.length,1);
 assert.equal(FakeAudio.played[0].src,'sounds/christmas-jingle.wav');assert.equal(FakeAudio.played[0].volume,.12);
 const file=fs.readFileSync(require.resolve('../sounds/christmas-jingle.wav'));assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE');
 assert.equal(playChristmasJingle(),false,'a live jingle is not overlapped');
 stopChristmasJingle();
 const before=FakeAudio.played.length;
 change(b=>{const target=b.tasks.find(t=>t.id===linkedId);target.done=true;b.features.wins.push({id:'christmas-win',taskId:linkedId,rootId:linkedId,title:target.title});});
 assert.equal(FakeAudio.played.length,before+1,'a newly recorded local completion plays once');
 change(()=>{});assert.equal(FakeAudio.played.length,before+1,'a redraw without a new completion stays silent');
 stopChristmasJingle();ctx.board.features.sound=false;assert.equal(playChristmasJingle(),false);
 ctx.board.features.sound=true;ctx.M.date=()=> '2027-02-01';assert.equal(playChristmasJingle(),false);
});
