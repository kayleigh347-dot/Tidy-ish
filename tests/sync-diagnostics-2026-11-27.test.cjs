const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../js/model.js');
const S=require('../js/sharing-model.js');
const D=require('../js/sync-diagnostics.js');
const boundContext={account:'member-a',house:'synthetic-house'};
let currentContext=boundContext;
globalThis.TidySharing={diagnosticsContext:()=>currentContext};

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
 D.clear();D.start(boundContext);
 const board=M.board();
 board.features.browserSync={account:boundContext.account,house:boundContext.house};
 board.features.wins.push(
  {id:'secret-win-a',_actor:'secret-member-a',person:'Secret Name A',title:'Secret Task',at:'2026-11-27T10:00:00Z'},
  {id:'secret-win-b',taskId:'secret-task',_actor:'secret-member-b',person:'Secret Name B',title:'Secret Task',at:'2026-11-27T10:01:00Z'}
 );
 board.features.questTimings.push({id:'secret-attempt-a',memberId:'secret-member-a',owner:'Private Owner'},{id:'secret-attempt-owner-only',taskId:'secret-task',owner:'Private Owner Only'});
 board.features.taskDataArchives.push({id:'secret-archive-completion',kind:'completion',taskId:'secret-task',count:5},{id:'secret-archive-attempt',kind:'attempt',taskId:'secret-task',count:6});
 const observed=D.activeObserver(boundContext);
 observed('empty-board',{features:{wins:[],questTimings:[]}},{kind:'board'});
 observed('not-readable',null,{kind:'raw',availability:'unavailable',reason:'read-failed'});
 D.captureTaskData(board,{
  sourceWins:board.features.wins,
  selectedWins:[board.features.wins[1]],
  displayedWins:[],
  sourceAttempts:board.features.questTimings,
  selectedAttempts:[board.features.questTimings[0]],
  displayedAttempts:[],
 },{view:'task-family',period:'all',roomFiltered:true});
 const summary=D.stop(),json=JSON.stringify(summary);
 const empty=summary.find(x=>x.stage==='empty-board'),missing=summary.find(x=>x.stage==='not-readable'),data=summary.find(x=>x.stage==='task-data');
 assert.equal(empty.availability,'observed');assert.deepEqual(empty.counts.completions,{});assert.equal(empty.totals.completions,0);assert.equal(empty.missingLinks.completions,0);
 assert.equal(missing.availability,'unavailable');assert.equal(missing.reason,'read-failed');
 assert.deepEqual(Object.values(data.filteredOut.completions),[1]);assert.deepEqual(Object.values(data.displayLimited.completions),[1]);
 assert.deepEqual(Object.values(data.filteredOut.timerAttempts),[1]);assert.deepEqual(Object.values(data.displayLimited.timerAttempts),[1]);
 assert.equal(data.counts.sourceAttempts.Unattributed,1);
 assert.equal(data.missingLinks.sourceCompletions,1);assert.equal(data.missingLinks.sourceAttempts,1);
 assert.equal(data.totals.completionArchiveSummaries,1);assert.equal(data.totals.attemptArchiveSummaries,1);
 assert.doesNotMatch(json,/secret-win|secret-attempt|secret-archive|secret-task|secret-member|Secret Name|Secret Task|Private Owner/);
 D.clear();
});

test('observer failures at each model boundary do not change read, save, accepted payload, or request order',async()=>{
 D.clear();
 const baseline=await runSync(null),stages=['local-board','previous-shared-baseline','projected-shared-data','outgoing-payload','remote-snapshot','merged-data','save-result'];
 assert.equal(baseline.flow.filter(x=>x.startsWith('read:')).length,1);
 for(const stage of stages){
  const result=await runSync((current)=>{if(current===stage)throw Error('synthetic observer failure');});
  assert.deepEqual(result.flow,baseline.flow,`sync order changed when observer failed at ${stage}`);
  assert.deepEqual(result.result.payload,baseline.result.payload,`saved payload changed when observer failed at ${stage}`);
  assert.deepEqual(result.result.accepted.features.wins,baseline.result.accepted.features.wins,`accepted data changed when observer failed at ${stage}`);
 }
});

test('normal synthetic sync reports the remote-baseline divergence and save acknowledgement without IDs',async()=>{
 D.clear();D.start(boundContext);
 const run=await runSync(D.activeObserver(boundContext)),summary=D.stop(),json=JSON.stringify(summary),remote=summary.find(x=>x.stage==='remote-snapshot'),save=summary.find(x=>x.stage==='save-result');
 assert.equal(run.flow.filter(x=>x.startsWith('read:')).length,1);
 assert.equal(save.status,'save-acknowledged');
 const baseline=summary.find(x=>x.stage==='previous-shared-baseline');assert.equal(baseline.totals.completionArchiveSummaries,1);assert.equal(baseline.totals.attemptArchiveSummaries,1);
 assert.ok(remote.changes.completions.added);
 assert.doesNotMatch(json,/synthetic-win|synthetic-attempt|synthetic-task|PRIVATE/);
 D.clear();
});

test('stale observers stop at session or household boundaries',()=>{
 D.clear();currentContext=boundContext;assert.equal(D.start(boundContext),true);const stale=D.activeObserver(boundContext);
 stale('first-session',{features:{wins:[],questTimings:[]}},{kind:'board'});D.stop();assert.equal(D.start(boundContext),true);const current=D.activeObserver(boundContext);
 stale('late-old-session',{features:{wins:[],questTimings:[]}},{kind:'board'});
 currentContext={account:boundContext.account,house:'different-house'};
 current('wrong-house',{features:{wins:[],questTimings:[]}},{kind:'board'});
 assert.deepEqual(D.summary().map(row=>row.stage),[]);
 currentContext=boundContext;current('current-session',{features:{wins:[],questTimings:[]}},{kind:'board'});
 assert.deepEqual(D.summary().map(row=>row.stage),['current-session']);
 D.clear();currentContext=boundContext;
});

test('observer mutation cannot alter sync inputs or saved payloads',async()=>{
 D.clear();const baseline=await runSync(null);
 for(const stage of ['local-board','remote-snapshot','outgoing-payload']){
  const changed=await runSync((current,data)=>{if(current===stage){if(data?.features?.wins?.[0])data.features.wins[0].title='OBSERVER MUTATION';else if(data?.wins?.[0])data.wins[0].title='OBSERVER MUTATION';}});
  assert.deepEqual(changed.flow,baseline.flow);
  assert.deepEqual(changed.result.payload,baseline.result.payload,`observer changed saved payload at ${stage}`);
 }
});

test('unverified remote household identity yields no payload observation',async()=>{
 D.clear();D.start(boundContext);const observed=D.activeObserver(boundContext),{board,remote}=fixture();let failure;
 try{await S.synchronize(board,async house=>({house,account:'different-account',payload:remote,revision:7}),async()=>true,async()=>{},observed);}catch(error){failure=error;}
 const summary=D.stop(),checkpoint=summary.find(row=>row.stage==='remote-snapshot');
 assert.match(failure.message,/Account or household changed/);assert.equal(checkpoint.availability,'unavailable');assert.equal(checkpoint.status,'unverified');
 assert.equal(checkpoint.totals,undefined);assert.doesNotMatch(JSON.stringify(summary),/PRIVATE|synthetic-win|synthetic-attempt/);D.clear();
});

test('Task Data reports filtered versus displayed attempts and accepted capture follows UI acceptance',()=>{
 const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
 const sharing=fs.readFileSync(require.resolve('../js/sharing.js'),'utf8');
 const model=fs.readFileSync(require.resolve('../js/sharing-model.js'),'utf8');
 assert.match(app,/selectedAttempts:d\.attempts\|\|\[\],displayedAttempts:d\.visibleAttempts\|\|\[\]/);
 const accepted=sharing.indexOf('U.acceptSync(accepted);'),captured=sharing.indexOf("diagnosticObserver?.('accepted-board',U.getBoard()",accepted);
 assert.ok(accepted>=0&&captured>accepted,'capture the reconciled board only after the UI accepts it');
 assert.doesNotMatch(model,/observe\('accepted-board'/);
 assert.match(model,/if\(typeof observer==='function'\)try\{observe\('projected-shared-data'/,'skip diagnostic projection when diagnostics are off');
});
