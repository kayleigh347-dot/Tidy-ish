const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js');
const S=require('../js/sharing-model.js');
const D=require('../js/sync-diagnostics.js');

function fixture(){
 const board=M.board(),task=M.task({id:'synthetic-task',title:'PRIVATE TASK',createdAt:'2026-11-27T09:00:00.000Z'});M.add(board,task);
 board.features.wins.push({id:'synthetic-win-a',taskId:task.id,rootId:task.id,_actor:'member-a',person:'PRIVATE PERSON A',title:task.title,room:task.room,at:'2026-11-27T10:00:00.000Z'});
 board.features.questTimings.push({id:'synthetic-attempt-a',taskId:task.id,memberId:'member-a',owner:'PRIVATE OWNER A',kind:'valid',durationMs:12000,at:'2026-11-27T10:01:00.000Z'});
 board.features.taskDataArchives.push({id:'synthetic-completion-archive',kind:'completion',taskId:task.id,count:4},{id:'synthetic-attempt-archive',kind:'attempt',taskId:task.id,count:3});
 const base=S.project(board,{},'member-a');
 board.features.browserSync={account:'member-a',house:'synthetic-house',kind:'legacy',base,native:S.snapshot(board),initial:false,hidden:[],choices:{},pendingUndos:[],retired:[]};
 board.tasks[0].title='PRIVATE LOCAL EDIT';
 const remote=JSON.parse(JSON.stringify(base));
 remote.wins.push({id:'synthetic-win-b',taskId:task.id,rootTaskId:task.id,text:'PRIVATE TASK',roomId:'',area:'Kitchen',at:'2026-11-27T10:02:00.000Z',measuredMinutes:null,points:1,aggregate:false,completedBy:'member-b',completedByName:'PRIVATE PERSON B',kind:'task',sourceTemplateId:''});
 remote.settings.push({id:'tidy-timing:synthetic-attempt-b',timing:{id:'synthetic-attempt-b',taskId:task.id,memberId:'member-b',owner:'PRIVATE OWNER B',kind:'valid',durationMs:18000,at:'2026-11-27T10:03:00.000Z'}});
 return {board,remote};
}

async function runSync(observer){
 const {board,remote}=fixture(),flow=[],saved=[];
 const result=await S.synchronize(board,async house=>{flow.push(`read:${house}`);return {house,account:'member-a',payload:remote,revision:7};},async(_remote,payload)=>{flow.push('save');saved.push(payload);return true;},async()=>{flow.push('check');},observer);
 return {result,flow,saved};
}

test('temporary summaries count members without exposing record content and distinguish filtering from display caps',()=>{
 D.clear();D.start();
 const board=M.board();
 board.features.wins.push(
  {id:'secret-win-a',_actor:'secret-member-a',person:'Secret Name A',title:'Secret Task',at:'2026-11-27T10:00:00Z'},
  {id:'secret-win-b',taskId:'secret-task',_actor:'secret-member-b',person:'Secret Name B',title:'Secret Task',at:'2026-11-27T10:01:00Z'}
 );
 board.features.questTimings.push({id:'secret-attempt-a',memberId:'secret-member-a',owner:'Private Owner'});
 board.features.taskDataArchives.push({id:'secret-archive-completion',kind:'completion',taskId:'secret-task',count:5},{id:'secret-archive-attempt',kind:'attempt',taskId:'secret-task',count:6});
 const observed=D.activeObserver();
 observed('empty-board',{features:{wins:[],questTimings:[]}},{kind:'board'});
 observed('not-readable',null,{kind:'raw',availability:'unavailable',reason:'read-failed'});
 D.captureTaskData(board,{
  sourceWins:board.features.wins,
  selectedWins:[board.features.wins[1]],
  displayedWins:[],
  sourceAttempts:board.features.questTimings,
  selectedAttempts:[],
  displayedAttempts:[],
 },{view:'task-family',period:'all',roomFiltered:true});
 const summary=D.stop(),json=JSON.stringify(summary);
 const empty=summary.find(x=>x.stage==='empty-board'),missing=summary.find(x=>x.stage==='not-readable'),data=summary.find(x=>x.stage==='task-data');
 assert.equal(empty.availability,'observed');assert.deepEqual(empty.counts.completions,{});assert.equal(empty.totals.completions,0);assert.equal(empty.missingLinks.completions,0);
 assert.equal(missing.availability,'unavailable');assert.equal(missing.reason,'read-failed');
 assert.deepEqual(Object.values(data.filteredOut.completions),[1]);assert.deepEqual(Object.values(data.displayLimited.completions),[1]);
 assert.equal(data.missingLinks.sourceCompletions,1);assert.equal(data.missingLinks.sourceAttempts,1);
 assert.equal(data.totals.completionArchiveSummaries,1);assert.equal(data.totals.attemptArchiveSummaries,1);
 assert.doesNotMatch(json,/secret-win|secret-attempt|secret-archive|secret-task|secret-member|Secret Name|Secret Task|Private Owner/);
 D.clear();
});

test('observer failures at every sync boundary do not change read, save, accepted payload, or request order',async()=>{
 D.clear();
 const baseline=await runSync(null),stages=['local-board','previous-shared-baseline','projected-shared-data','outgoing-payload','remote-snapshot','merged-data','accepted-board','save-result'];
 assert.equal(baseline.flow.filter(x=>x.startsWith('read:')).length,1);
 for(const stage of stages){
  const result=await runSync((current)=>{if(current===stage)throw Error('synthetic observer failure');});
  assert.deepEqual(result.flow,baseline.flow,`sync order changed when observer failed at ${stage}`);
  assert.deepEqual(result.result.payload,baseline.result.payload,`saved payload changed when observer failed at ${stage}`);
  assert.deepEqual(result.result.accepted.features.wins,baseline.result.accepted.features.wins,`accepted data changed when observer failed at ${stage}`);
 }
});

test('normal synthetic sync reports the remote-baseline divergence and save acknowledgement without IDs',async()=>{
 D.clear();D.start();
 const run=await runSync(D.activeObserver()),summary=D.stop(),json=JSON.stringify(summary),remote=summary.find(x=>x.stage==='remote-snapshot'),save=summary.find(x=>x.stage==='save-result');
 assert.equal(run.flow.filter(x=>x.startsWith('read:')).length,1);
 assert.equal(save.status,'save-acknowledged');
 const baseline=summary.find(x=>x.stage==='previous-shared-baseline');assert.equal(baseline.totals.completionArchiveSummaries,1);assert.equal(baseline.totals.attemptArchiveSummaries,1);
 assert.ok(remote.changes.completions.added);
 assert.doesNotMatch(json,/synthetic-win|synthetic-attempt|synthetic-task|PRIVATE/);
 D.clear();
});
