'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../js/model.js'),Time=require('../js/quest-time-core.js');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const line=prefix=>{const value=source.split('\n').find(s=>s.startsWith(prefix));assert.ok(value,prefix);return value;};
const block=(name,end)=>{const start=source.indexOf('function '+name+'('),finish=source.indexOf(end,start);assert.ok(start>=0&&finish>start,`Missing ${name}`);return source.slice(start,finish);};

function fixture(){
 const board=M.board(),root=M.task({id:'root',title:'Kitchen reset',room:'kitchen',estimate:30,children:[M.child({id:'child',title:'Wipe counters',estimate:10})]});
 M.add(board,root);const owner=Time.ownerOf(board);
 board.features.questTimings.push({id:'prior',taskId:root.id,owner,kind:'valid',durationMs:5*60000,at:'2026-11-20T12:00:00Z'});
 const log={clock:[],alerts:[],dialogs:[],commits:0};let elapsedValue='0',elapsedBadInput=false,now=Date.now();
 const model={...M,time:item=>M.time(item,now)};
 const ClockDate=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 const ctx={board,M:model,TIME:Time,task:id=>board.tasks.find(t=>t.id===id),questEstimateMs:item=>item.estimate*60000,
  editor:{querySelector:selector=>selector==='#quest-timer-elapsed-minutes'?{value:elapsedValue,validity:{badInput:elapsedBadInput}}:selector==='#quest-timer-note'?{value:'Elapsed-time entry test'}:null},
  alarmSignals:new Set(),timerAlarmAudio:{prime(){return Promise.resolve(true);}},timerDialog:(task,cid)=>log.clock.push([task.id,cid]),
  button:(label,action,id,cls,attrs='')=>`<button data-action="${action}" data-id="${id}" ${attrs}>${label}</button>`,
  dialog:(title,html)=>log.dialogs.push({title,html}),confirmDialog:(title,text,save)=>save(),esc:String,
  change:fn=>{fn(board);log.commits++;return true;},updateClocks(){},Date:ClockDate,route:'room',
  closeDialog(){},stampTaskEdits(){},persist(){},render(){},window:{},focusBreakTimer:{cancelIfTaskUndone(){},start(){}},
  showDialogSaveError:error=>log.alerts.push(error),notice:message=>log.alerts.push(message),log};
 const actionNames=[" 'task-clock-start':"," 'task-clock-toggle':"," 'task-clock-finish':"," 'task-clock-commit':"];
 const actions=actionNames.map(name=>line(name).trim().replace(/,$/,'')).join(',');
 vm.runInNewContext([line('function timerChange('),line('function hasTimedAttempt('),block('finishTimed','const alarmSignals='),`this.actions={${actions}};`].join('\n'),ctx);
 return {ctx,root,log,setElapsed:value=>{elapsedValue=value;elapsedBadInput=false;},setBadInput:value=>{elapsedBadInput=value;},setNow:value=>{now=value;},getNow:()=>now};
}

test('new timer dialog offers optional minutes already worked before starting',()=>{
 const start=source.indexOf('function timerDialog('),end=source.indexOf('\nfunction finishTimed(',start),timerDialog=source.slice(start,end);
 assert.ok(timerDialog.includes('Minutes already worked (optional)'),'timer dialog explains the optional elapsed-time field');
 assert.ok(/id="quest-timer-elapsed-minutes" type="number"[^`]*min="0"[^`]*step="0\.1"/.test(timerDialog),'elapsed minutes use a non-negative decimal number input');
});

test('elapsed-minute conversion accepts blank and decimals and rejects invalid or unsafe values',()=>{
 assert.equal(Time.elapsedMinutesToMs(''),0);
 assert.equal(Time.elapsedMinutesToMs('0.1'),6000);
 assert.equal(Time.elapsedMinutesToMs('6.5'),390000);
 for(const raw of ['-0.1','abc','Infinity','999999999999999999999999'])assert.throws(()=>Time.elapsedMinutesToMs(raw),/elapsed time/i);
});

test('root timer starts with entered elapsed time without completing or recording it',()=>{
 const {ctx,root,log,setElapsed}=fixture(),beforeAverage=Time.average(ctx.board.features.questTimings,root.id,Time.ownerOf(ctx.board));
 const winsBefore=JSON.stringify(ctx.board.features.wins),attemptsBefore=JSON.stringify(ctx.board.features.questTimings);
 setElapsed('6.5');ctx.actions['task-clock-start']({dataset:{id:root.id,child:''}});
 assert.equal(root.elapsed,390000);assert.ok(root.startedAt>0);assert.equal(root.timerEstimateMs,30*60000);assert.equal(root.done,false);
 assert.equal(JSON.stringify(ctx.board.features.wins),winsBefore);assert.equal(JSON.stringify(ctx.board.features.questTimings),attemptsBefore);
 assert.equal(Time.average(ctx.board.features.questTimings,root.id,Time.ownerOf(ctx.board)),beforeAverage);
 assert.deepEqual(log.clock,[['root','']]);
});

test('nested timer starts with its elapsed time without changing its parent or sibling',()=>{
 const {ctx,root,log,setElapsed}=fixture(),child=root.children[0],parentBefore={elapsed:root.elapsed,startedAt:root.startedAt},winsBefore=JSON.stringify(ctx.board.features.wins),attemptsBefore=JSON.stringify(ctx.board.features.questTimings);
 const other=M.child({id:'sibling',title:'Put dishes away',elapsed:0,startedAt:0});root.children.push(other);
 setElapsed('2.25');ctx.actions['task-clock-start']({dataset:{id:root.id,child:child.id}});
 assert.equal(child.elapsed,135000);assert.ok(child.startedAt>0);assert.equal(child.timerEstimateMs,10*60000);assert.equal(child.done,false);
 assert.deepEqual({elapsed:root.elapsed,startedAt:root.startedAt},parentBefore);assert.equal(other.elapsed,0);assert.equal(other.startedAt,0);
 assert.equal(JSON.stringify(ctx.board.features.wins),winsBefore);assert.equal(JSON.stringify(ctx.board.features.questTimings),attemptsBefore);
 assert.deepEqual(log.clock,[['root','child']]);
});

test('invalid elapsed time cannot start or alter any timer or history',()=>{
 for(const value of ['-1','not a number','Infinity','999999999999999999999999']){
  const {ctx,root,log,setElapsed}=fixture(),before=JSON.stringify(ctx.board);setElapsed(value);
  assert.throws(()=>ctx.actions['task-clock-start']({dataset:{id:root.id,child:''}}),/elapsed time/i);
  assert.equal(JSON.stringify(ctx.board),before);assert.deepEqual(log.clock,[]);
 }
});

test('browser number-input badInput cannot be mistaken for blank zero minutes',()=>{
 const {ctx,root,log,setElapsed,setBadInput}=fixture(),before=JSON.stringify(ctx.board);
 setElapsed('');setBadInput(true);
 assert.throws(()=>ctx.actions['task-clock-start']({dataset:{id:root.id,child:''}}),/elapsed time/i);
 assert.equal(JSON.stringify(ctx.board),before);assert.deepEqual(log.clock,[]);
});

test('elapsed time beyond the estimate starts in overtime',()=>{
 const {ctx,root,setElapsed,getNow}=fixture();setElapsed('31');
 ctx.actions['task-clock-start']({dataset:{id:root.id,child:''}});
 const item=ctx.task(root.id),state=Time.status(M.time(item,getNow()),item.timerEstimateMs);
 assert.equal(item.elapsed,31*60000);assert.equal(item.startedAt,getNow());
 assert.equal(state.phase,'overtime');assert.equal(state.shownMs,60000);assert.equal(state.overdue,true);
});

test('pause and resume preserve entered work while excluding paused time',()=>{
 const {ctx,root,setElapsed,setNow,getNow}=fixture();setElapsed('5');
 ctx.actions['task-clock-start']({dataset:{id:root.id,child:''}});
 setNow(getNow()+2*60000);ctx.actions['task-clock-toggle']({dataset:{id:root.id,child:''}});
 const item=ctx.task(root.id);assert.equal(item.elapsed,7*60000);assert.equal(item.startedAt,0);
 setNow(getNow()+20*60000);ctx.actions['task-clock-toggle']({dataset:{id:root.id,child:''}});
 assert.equal(item.elapsed,7*60000);assert.equal(item.startedAt,getNow());
 setNow(getNow()+3*60000);assert.equal(M.time(item,getNow()),10*60000);
});

test('finishing records the entered time plus active timer duration',()=>{
 const {ctx,root,log,setElapsed,setNow,getNow}=fixture();setElapsed('4');
 const beforeAttempts=ctx.board.features.questTimings.length,beforeWins=ctx.board.features.wins.length;
 ctx.actions['task-clock-start']({dataset:{id:root.id,child:''}});
 setNow(getNow()+75_000);
 ctx.actions['task-clock-finish']({dataset:{id:root.id,child:''}});
 assert.match(log.dialogs.at(-1).html,/05:15/);
 assert.equal(ctx.board.features.questTimings.length,beforeAttempts);assert.equal(ctx.board.features.wins.length,beforeWins);
 ctx.actions['task-clock-commit']({dataset:{id:root.id,child:'',mode:'valid'}});
 const record=ctx.board.features.questTimings.at(-1);
 assert.equal(record.durationMs,4*60000+75_000);assert.equal(record.kind,'valid');
 assert.ok(record.completionWinIds.length);assert.equal(ctx.task(root.id).done,true);
});
