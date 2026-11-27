'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../js/model.js'),Time=require('../js/quest-time-core.js');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const line=prefix=>{const value=source.split('\n').find(s=>s.startsWith(prefix));assert.ok(value,prefix);return value;};

function fixture(){
 const board=M.board(),root=M.task({id:'root',title:'Kitchen reset',room:'kitchen',estimate:30,children:[M.child({id:'child',title:'Wipe counters',estimate:10})]});
 M.add(board,root);const owner=Time.ownerOf(board);
 board.features.questTimings.push({id:'prior',taskId:root.id,owner,kind:'valid',durationMs:5*60000,at:'2026-11-20T12:00:00Z'});
 const log={clock:[],alerts:[]};let elapsedValue='0';
 const ctx={board,M,TIME:Time,task:id=>board.tasks.find(t=>t.id===id),questEstimateMs:item=>item.estimate*60000,
  editor:{querySelector:selector=>selector==='#quest-timer-elapsed-minutes'?{value:elapsedValue}:null},
  alarmSignals:new Set(),timerAlarmAudio:{prime(){return Promise.resolve(true);}},timerDialog:(task,cid)=>log.clock.push([task.id,cid]),
  change:fn=>{fn(board);return true;},updateClocks(){},Date,log,notice:message=>log.alerts.push(message)};
 const action=line(" 'task-clock-start':").trim().replace(/,$/,'');
 vm.runInNewContext(line('function timerChange(')+'\nthis.actions={'+action+'};',ctx);
 return {ctx,root,log,setElapsed:value=>{elapsedValue=value;}};
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
