const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const M=require('../js/model.js');
const S=require('../js/sharing-model.js');

const source=fs.readFileSync(path.join(__dirname,'../js/sharing.js'),'utf8');
function fixture(initialBoard,{online=false}={}){
 let board=initialBoard;
 const calls={},storage=new Map(),listeners={};
 const ui={getBoard:()=>board,acceptSync:next=>{board=next;},onSyncStatus(){},notice(){},confirmDialog(title,message,confirm){calls.confirm=confirm;},editing:()=>false,button:(label,action,id='',style='',attrs='')=>`<button data-action="${action}" data-id="${id}" ${attrs}>${label}</button>`,field:(label,name)=>`<label>${label}<input name="${name}"></label>`,card:x=>x,detail:(title,body)=>`<details>${title}${body}</details>`,select:()=>'<select></select>',esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),storageKey:'qa'};
 const mapStore={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 if(board.features.browserSync)storage.set('tidyish-html-v023-sync-approved:'+board.features.browserSync.account+'/'+board.features.browserSync.house,'yes');
 const ctx={URL,URLSearchParams,sessionStorage:mapStore,localStorage:mapStore,location:{href:'https://example.test/index.html',protocol:'https:',search:''},navigator:{onLine:online},document:{addEventListener(){},hidden:false,getElementById(){return null;}},Event:class{},setTimeout(fn){calls.timer=fn;return 1;},clearTimeout(){delete calls.timer;},window:{TidyUI:ui,TidyModel:M,TidySharedModel:S,TidyStorageCodec:null,dispatchEvent(){},addEventListener:(n,fn)=>{listeners[n]=fn;},history:{state:{},replaceState(){}}}};
 const hooked=source.replace('const api={','window.__testStatus=()=>status;window.__testLoad=load;window.__testRefreshHouses=refreshHouses;window.__testRoster=()=>({account:rosterAccount,loaded:rosterLoaded,stale:rosterStale,houses:rosterHouses,members:newMembers});window.__testUpdatePeople=(account,house)=>updatePeople({householdPeople:[]},account,house);window.__setSession=(person,db)=>{session=person?{user:person}:null;client=db;};\nconst api={');
 vm.runInNewContext(hooked,ctx,{filename:'sharing.js'});
 return {api:ctx.window.TidySharing,ctx,calls,storage,listeners,status:()=>ctx.window.__testStatus(),roster:()=>ctx.window.__testRoster(),getBoard:()=>board,setSession:(person,db)=>ctx.window.__setSession(person,db),refresh:()=>ctx.window.__testRefreshHouses()};
}
function syncState(board,base){return {account:'owner',house:'house',kind:'legacy',base,native:S.snapshot(board),initial:false,hidden:[],choices:{},conflicts:[],retired:[]};}

test('a nested child Undo marker targets only the removed win and preserves a concurrently completed sibling',async()=>{
 const original=M.board(),earlier=M.task({id:'nested-undo-earlier-task',title:'File the mail'}),task=M.task({id:'child-undo-parent',title:'Reset the room',children:[M.child({id:'child-undo-a',title:'Wipe the shelf'}),M.child({id:'child-undo-grandchild',parentId:'child-undo-a',title:'Dust the books'}),M.child({id:'child-undo-b',title:'Put the books back'})]});M.add(original,earlier);M.finish(original,earlier.id,true);const earlierWin=original.tasks[0]._completionIds[0];original.features.questTimings.push({id:'nested-undo-earlier-timing',taskId:earlier.id,owner:'owner',kind:'valid',durationMs:25000,at:'2026-11-27T09:10:00.000Z',completionWinIds:[earlierWin]});M.add(original,task);
 const base=S.project(original,{},'owner'),local=M.clone(original);local.features.browserSync=syncState(local,base);
 M.completeChild(local,task.id,'child-undo-grandchild',true);
 const targetWin=local.tasks.find(row=>row.id===task.id).children.find(row=>row.id==='child-undo-grandchild')._winId;local.features.questTimings.push({id:'nested-undo-target-timing',taskId:'child-undo-grandchild',owner:'owner',kind:'valid',durationMs:35000,at:'2026-11-27T09:11:00.000Z',completionWinIds:[targetWin]});
 const acknowledgedCandidate=S.project(local,base,'owner'),remoteDevice=S.importRaw(acknowledgedCandidate);M.completeChild(remoteDevice,task.id,'child-undo-b',true);const siblingWin=remoteDevice.tasks.find(row=>row.id===task.id).children.find(row=>row.id==='child-undo-b')._winId;remoteDevice.features.questTimings.push({id:'nested-undo-sibling-timing',taskId:'child-undo-b',owner:'owner',kind:'valid',durationMs:40000,at:'2026-11-27T09:12:00.000Z',completionWinIds:[siblingWin]});
 const remote=S.project(remoteDevice,acknowledgedCandidate,'owner');
 const completed=M.clone(local),undone=M.clone(local);M.completeChild(undone,task.id,'child-undo-grandchild',false);S.transition(completed,undone);
 assert.deepEqual(undone.features.browserSync.pendingUndos[0].winIds,[targetWin]);
 assert.deepEqual(undone.features.browserSync.pendingUndos[0].settingIds,['tidy-timing:nested-undo-target-timing']);
 const result=await S.synchronize(undone,async house=>({house,account:'owner',payload:remote}),async()=>true);
 assert.equal(result.conflicts.length,0);
 const rows=new Map(result.payload.tasks.map(row=>[row.id,row]));
 assert.equal(rows.get(task.id).done,false,'the parent reflects the undone child');
 assert.equal(rows.get('child-undo-a').done,false,'the nested parent is restored to incomplete');
 assert.equal(rows.get('child-undo-grandchild').done,false,'the undone nested child is restored to incomplete');
 assert.equal(rows.get('child-undo-b').done,true,'the sibling completion remains intact');
 assert.deepEqual(result.payload.wins.map(row=>row.id),[earlierWin,siblingWin]);
 assert.deepEqual(S.importRaw(result.payload).features.questTimings.map(row=>row.id),['nested-undo-earlier-timing','nested-undo-sibling-timing']);
});

test('parent Undo synchronizes its exact wins and preserves an earlier subtask completion and timing',async()=>{
 const board=M.board(),task=M.task({id:'parent-undo-root',title:'Reset the hall',children:[M.child({id:'parent-undo-kept',title:'Hang coats'}),M.child({id:'parent-undo-new',title:'Clear the bench'})]});M.add(board,task);
 M.completeChild(board,task.id,'parent-undo-kept',true);
 const keptWin=board.tasks[0].children[0]._winId;board.features.questTimings.push({id:'parent-undo-earlier-timing',taskId:'parent-undo-kept',owner:'owner',kind:'valid',durationMs:28000,at:'2026-11-27T09:13:00.000Z',completionWinIds:[keptWin]});
 const base=S.project(board,{},'owner');board.features.browserSync=syncState(board,base);
 M.finish(board,task.id,true);const removedWins=board.tasks[0]._completionIds.slice();board.features.questTimings.push({id:'parent-undo-target-timing',taskId:'parent-undo-new',owner:'owner',kind:'valid',durationMs:32000,at:'2026-11-27T09:14:00.000Z',completionWinIds:removedWins});const completed=M.clone(board),remote=S.project(completed,base,'owner');
 M.finish(board,task.id,false);S.transition(completed,board);
 const marker=board.features.browserSync.pendingUndos[0];
 assert.deepEqual(marker.winIds,removedWins);
 assert.equal(marker.winIds.includes(keptWin),false,'the pre-existing subtask win is not marked for removal');
 assert.deepEqual(marker.settingIds,['tidy-timing:parent-undo-target-timing']);
 assert.equal(board.features.wins.some(row=>row.id===keptWin),true,'the earlier completion remains in local history');
 assert.equal(board.tasks[0].children[0].done,true,'Undo restores the completed subtask state');
 assert.equal(board.tasks[0].children[1].done,false);
 const result=await S.synchronize(board,async house=>({house,account:'owner',payload:remote}),async()=>true);
 assert.equal(result.conflicts.length,0);
 const rows=new Map(result.payload.tasks.map(row=>[row.id,row]));
 assert.equal(rows.get(task.id).done,false);
 assert.equal(rows.get('parent-undo-kept').done,true);
 assert.equal(rows.get('parent-undo-new').done,false);
 assert.deepEqual(result.payload.wins.map(row=>row.id),[keptWin]);
 assert.deepEqual(S.importRaw(result.payload).features.questTimings.map(row=>row.id),['parent-undo-earlier-timing']);
});

test('ordinary reactivation keeps completion history and does not create an Undo marker',()=>{
 const board=M.board(),task=M.task({id:'reactivate-history-task',title:'Restart the recurring task'});M.add(board,task);
 const base=S.project(board,{},'owner');board.features.browserSync=syncState(board,base);
 const before=M.clone(board);M.finish(board,task.id,true);const completionId=board.tasks[0]._completionIds[0];
 const completed=M.clone(board);M.reactivate(board,task.id);S.transition(completed,board);
 assert.deepEqual(board.features.browserSync.pendingUndos||[],[]);
 assert.ok(board.features.wins.some(row=>row.id===completionId),'reactivation retains its historic completion');
});

test('offline saved edits stay visible after reload and upload after reconnection',async()=>{
 const board=M.board(),task=M.task({id:'sync-offline-task',title:'Wipe the table'});M.add(board,task);
 const base=S.project(board,{},'owner');board.features.browserSync=syncState(board,base);board.tasks[0].title='Wipe the whole table';
 const saved=JSON.parse(JSON.stringify(board));
 const app=fixture(saved,{online:false});
 assert.match(app.api.panel(),/waiting for an internet connection/i);
 assert.match(fixture(saved,{online:true}).api.panel(),/waiting to sync with the household/i);
 const reloaded=JSON.parse(JSON.stringify(saved));
 const afterReload=fixture(reloaded,{online:false});
 assert.match(afterReload.api.panel(),/waiting for an internet connection/i);
 const client=mockClient({remote:base});afterReload.setSession({id:'owner'},client);
 afterReload.ctx.navigator.onLine=true;await afterReload.listeners.online();
 await afterReload.calls.timer();
 assert.equal(client.savedPayloads.length,1);
 assert.equal(client.savedPayloads[0].tasks[0].text,'Wipe the whole table');
 assert.match(afterReload.api.panel(),/Synced at \d{2}:\d{2}/);
});

function v2House(id='house',ownerId='owner'){return {id,label:'Shared home',ownerId};}
function v2Member(id,email,houseId='house'){return {id,email,houseId};}
function selectedV2Board(){const board=M.board();board.features.browserSync=syncState(board,{});board.features.browserSync.kind='v2';return board;}

test('a temporary v2 roster failure keeps the last successful same-account roster and disables removals',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[
  {data:{houses:[v2House(),v2House('other-house','other')],members:[v2Member('member-a','a@example.test'),v2Member('member-other','other@example.test','other-house')]},error:null},
  {data:null,error:{message:'Failed to fetch'}}
 ]});app.setSession({id:'owner',email:'owner@example.test'},client);
 await app.refresh();
 app.ctx.window.__testUpdatePeople('owner','house');
 assert.equal(app.api.people().some(person=>person.id==='member-a'),true);
 await assert.rejects(app.refresh(),/Failed to fetch/);
 const html=app.api.panel();
 assert.match(html,/a@example\.test/);
 assert.doesNotMatch(html,/other@example\.test/);
 assert.match(html,/stale/i);
 assert.ok(html.indexOf('Household member list is stale')<html.indexOf('<details>'),'the stale state is visible outside the collapsed member details');
 assert.match(html,/data-action="house-remove"[^>]*disabled/i);
 app.api.actions['house-remove']({dataset:{id:'member-a'}});
 assert.equal(app.calls.confirm,undefined,'a stale member cannot open the removal confirmation');
 assert.equal(app.roster().stale,true);
 assert.equal(app.roster().members[0].houseId,'house');
 assert.equal(app.api.people().some(person=>person.id==='member-a'),false,'a stale roster is display-only and cannot populate assignment choices');
});

test('a first v2 roster failure shows unavailable without inventing member identities',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[{data:null,error:{message:'Failed to fetch'}}]});
 app.setSession({id:'owner',email:'owner@example.test'},client);
 await assert.rejects(app.refresh(),/Failed to fetch/);
 const html=app.api.panel();
 assert.match(html,/member list unavailable/i);
 assert.ok(html.indexOf('Household member list unavailable')<html.indexOf('<details>'),'unavailable status is visible outside the collapsed member details');
 assert.doesNotMatch(html,/a@example\.test/);
 assert.equal(app.roster().loaded,false);
 assert.equal(app.roster().stale,false);
 app.api.actions['house-remove']({dataset:{id:'member-a'}});
 assert.equal(app.calls.confirm,undefined,'a missing roster cannot authorize removal from an old control');
});

test('a legacy household-list failure also marks the retained v2 roster stale',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},legacyLists:[
  {data:{houses:[],members:[]},error:null},
  {data:null,error:{message:'Failed to fetch'}}
 ],v2Lists:[{data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null}]});
 app.setSession({id:'owner',email:'owner@example.test'},client);
 await app.refresh();await assert.rejects(app.refresh(),/Failed to fetch/);
 assert.equal(app.roster().stale,true);
 assert.match(app.api.panel(),/Household member list is stale/);
});

test('a missing v2-list RPC fallback cannot repopulate assignee choices from a stale roster',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[
  {data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null},
  {data:null,error:{code:'PGRST202',message:'function missing'}}
 ]});app.setSession({id:'owner',email:'owner@example.test'},client);
 await app.refresh();app.ctx.window.__testUpdatePeople('owner','house');
 assert.equal(app.api.people().some(person=>person.id==='member-a'),true);
 await app.refresh();
 app.ctx.window.__testUpdatePeople('owner','house');
 assert.equal(app.roster().stale,true);
 assert.equal(app.api.people().some(person=>person.id==='member-a'),false);
});

test('a successful retry replaces the stale v2 roster and clears its stale label',async()=>{
 const board=selectedV2Board(),task=M.task({id:'roster-recovery-task',title:'Keep the saved assignment'});M.add(board,task);board.tasks[0].assignedUserId='member-a';board.tasks[0].assigned='A member';
 const app=fixture(board),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[
  {data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null},
  {data:null,error:{message:'Failed to fetch'}},
  {data:{houses:[v2House()],members:[v2Member('member-b','b@example.test')]},error:null}
 ]});app.setSession({id:'owner',email:'owner@example.test'},client);
 await app.refresh();assert.equal(app.api.people().some(person=>person.id==='member-a'),true,'the current roster supplies fresh assignee choices');
 await assert.rejects(app.refresh(),/Failed to fetch/);assert.equal(app.api.people().some(person=>person.id==='member-a'),false,'cached names are unavailable while stale');
 assert.deepEqual([app.getBoard().tasks[0].assignedUserId,app.getBoard().tasks[0].assigned],['member-a','A member']);
 await app.refresh();
 const html=app.api.panel();
 assert.match(html,/b@example\.test/);
 assert.doesNotMatch(html,/a@example\.test/);
 assert.doesNotMatch(html,/stale/i);
 assert.equal(app.api.people().some(person=>person.id==='member-b'),true,'a successful refresh restores current assignee choices');
 assert.deepEqual([app.getBoard().tasks[0].assignedUserId,app.getBoard().tasks[0].assigned],['member-a','A member'],'refresh does not rewrite a saved task assignment');
 assert.equal(app.roster().stale,false);
});

test('changing accounts discards the previous account roster before loading the new one',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},userId:'owner',v2Lists:[
  {data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null},
  {data:{houses:[v2House('other-house','other')],members:[v2Member('member-b','b@example.test','other-house')]},error:null}
 ]});app.setSession({id:'owner',email:'owner@example.test'},client);
 await app.refresh();client.user.id='other';app.setSession({id:'other',email:'other@example.test'},client);await app.refresh();
 assert.equal(app.roster().account,'other');
 assert.deepEqual(app.roster().members.map(member=>member.id),['member-b']);
 assert.doesNotMatch(app.api.panel(),/a@example\.test/);
 app.api.actions['house-remove']({dataset:{id:'member-a'}});
 assert.equal(app.calls.confirm,undefined,'a previous-account identity cannot authorize removal');
});

test('sign-out clears cached v2 member identities',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[{data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null}]});
 app.setSession({id:'owner',email:'owner@example.test'},client);await app.refresh();
 assert.match(app.api.panel(),/a@example\.test/);
 await app.api.actions['house-signout']();
 assert.doesNotMatch(app.api.panel(),/a@example\.test/);
 assert.equal(app.roster().loaded,false);
});

test('confirmed access removal clears identities if the follow-up roster refresh fails',async()=>{
 const app=fixture(selectedV2Board()),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[
  {data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null},
  {data:null,error:{message:'Failed to fetch'}}
 ]});app.setSession({id:'owner',email:'owner@example.test'},client);
 await app.refresh();
 app.api.actions['house-remove']({dataset:{id:'member-a'}});
 await app.calls.confirm();
 assert.match(app.api.panel(),/member list unavailable/i);
 assert.doesNotMatch(app.api.panel(),/a@example\.test/);
 assert.equal(app.roster().loaded,false);
});

test('confirmation revalidates the account and selected household immediately before member removal',async()=>{
 for(const change of ['account','household']){
  const board=selectedV2Board(),app=fixture(board),client=mockClient({legacyList:{houses:[],members:[]},v2Lists:[{data:{houses:[v2House()],members:[v2Member('member-a','a@example.test')]},error:null}]});
  app.setSession({id:'owner',email:'owner@example.test'},client);await app.refresh();app.api.actions['house-remove']({dataset:{id:'member-a'}});
  if(change==='account')client.user.id='other';else board.features.browserSync.house='other-house';
  await app.calls.confirm();
  assert.equal(client.removeRequests.length,0,`a changed ${change} must block the removal RPC`);
 }
});

function mockClient({listError=null,readError=null,saveError=null,remote,v2Lists=null,legacyLists=null,legacyList={houses:[{id:'house',label:'House'}],members:[]},userId='owner'}={}){
 const savedPayloads=[],removeRequests=[],user={id:userId,email:`${userId}@example.test`};
 return {
  user,auth:{getUser:async()=>({data:{user},error:null}),signOut:async()=>({error:null})},
  rpc:async(name,args)=>{
   if(args.action==='list'&&name==='mission_house_sharing'){if(legacyLists?.length)return legacyLists.shift();return listError?{data:null,error:listError}:{data:legacyList,error:null};}
   if(args.action==='list'&&name==='tidyish_household_v2')return v2Lists?.length?v2Lists.shift():{data:{houses:[],members:[]},error:null};
   if(args.action==='remove-member')removeRequests.push({name,args});
   if(name==='save_shared_mission_board'||name==='save_mission_board')savedPayloads.push(args.new_payload);
   return saveError?{data:null,error:saveError}:{data:true,error:null};
  },
  from(){
   return {select(){
    return {eq(){
     return {maybeSingle:async()=>readError?{data:null,error:readError}:{data:{payload:remote,revision:1},error:null}};
    }};
   }};
  },
  channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel:async()=>{},savedPayloads,removeRequests
 };
}

test('household list, board read and board save errors identify their stage',async()=>{
 const board=M.board(),task=M.task({id:'sync-stage-task',title:'Dust the shelf'});M.add(board,task);
 const base=S.project(board,{},'owner');board.features.browserSync=syncState(board,base);board.tasks[0].title='Dust every shelf';
 const list=fixture(M.clone(board));list.setSession({id:'owner'},mockClient({listError:{message:'list unavailable'}}));
 await assert.rejects(list.ctx.window.__testLoad('house'),/Sync error: household\/member list refresh failed/);
 const read=fixture(M.clone(board));read.setSession({id:'owner'},mockClient({remote:base,readError:{message:'read unavailable'}}));
 await assert.rejects(read.ctx.window.__testLoad('house'),/Sync error: shared board read failed/);
 const save=fixture(M.clone(board),{online:true});save.setSession({id:'owner'},mockClient({remote:base,saveError:{message:'save unavailable'}}));
 await assert.rejects(save.api.sync(),/Sync error: shared board save failed/);
 assert.match(save.api.panel(),/Sync error: shared board save failed/);
});

test('stale Undo does not remove a remote re-completion win',async()=>{
 const original=M.board(),task=M.task({id:'sync-undo-task',title:'Clean the counter',children:[M.child({id:'sync-undo-child',title:'Wipe the counter'})]});M.add(original,task);
 const originalRaw=S.project(original,{},'owner');
 const timing=(b,id,durationMs)=>b.features.questTimings.push({id,taskId:task.id,owner:'owner',kind:'valid',durationMs,at:`2026-11-27T07:00:${id.endsWith('new')?'02':'01'}.000Z`,completionWinIds:b.tasks[0]._completionIds.slice()});
 const a=M.clone(original);a.features.browserSync=syncState(a,originalRaw);M.finish(a,task.id,true);timing(a,'timing-old',45000);
 let remote;
 const first=await S.synchronize(a,async()=>({house:'house',account:'owner',payload:originalRaw}),async(_r,payload)=>{remote=payload;return true;});
 let b=M.clone(original);b.features.browserSync=syncState(b,originalRaw);
 const received=await S.synchronize(b,async()=>({house:'house',account:'owner',payload:remote}),async()=>{assert.fail('unchanged member should not upload');});
 b=received.accepted;M.finish(b,task.id,false);
 const aAccepted=first.accepted;M.finish(aAccepted,task.id,false);M.finish(aAccepted,task.id,true);timing(aAccepted,'timing-new',90000);
 const second=await S.synchronize(aAccepted,async()=>({house:'house',account:'owner',payload:remote}),async(_r,payload)=>{remote=payload;return true;});
 const undone=await S.synchronize(b,async()=>({house:'house',account:'owner',payload:remote}),async(_r,payload)=>{remote=payload;return true;});
 assert.equal(undone.conflicts.length,0);
 assert.equal(undone.payload.wins.length,1);
 assert.equal(undone.payload.wins[0].id,second.payload.wins[0].id);
 assert.equal(undone.payload.wins[0].points,second.payload.wins[0].points);
 assert.deepEqual(S.importRaw(undone.payload).features.questTimings.map(x=>x.id),['timing-new']);
 const mergedTask=undone.payload.tasks.find(t=>t.id===task.id),mergedChild=undone.payload.tasks.find(t=>t.id==='sync-undo-child');
 assert.equal(mergedTask.done,true);
 assert.equal(mergedTask.completionUndo.winId,second.payload.tasks.find(t=>t.id===task.id).completionUndo.winId);
 assert.equal(mergedChild.done,true);
 assert.equal(mergedChild.completionUndo.winId,second.payload.tasks.find(t=>t.id==='sync-undo-child').completionUndo.winId);
});

test('ordinary Undo still removes its own completion and timing record',async()=>{
 const board=M.board(),task=M.task({id:'ordinary-sync-undo',title:'Wipe the side table'});M.add(board,task);
 const base=S.project(board,{},'owner'),local=M.clone(board);local.features.browserSync=syncState(local,base);
 M.finish(local,task.id,true);local.features.questTimings.push({id:'ordinary-undo-timing',taskId:task.id,owner:'owner',kind:'valid',durationMs:30000,at:'2026-11-27T07:00:00.000Z',completionWinIds:local.tasks[0]._completionIds.slice()});
 const completed=await S.synchronize(local,async house=>({house,account:'owner',payload:base}),async()=>true);
 const current=completed.accepted;M.finish(current,task.id,false);
 const undone=await S.synchronize(current,async house=>({house,account:'owner',payload:completed.payload}),async()=>true);
 assert.equal(undone.payload.tasks.find(t=>t.id===task.id).done,false);
 assert.equal(undone.payload.wins.length,0);
 assert.deepEqual(S.importRaw(undone.payload).features.questTimings,[]);
});

test('accept keeps an incoming newer subtask completion identity',()=>{
 const board=M.board(),task=M.task({id:'accept-subtask-task',title:'Reset the room',children:[M.child({id:'accept-subtask-child',title:'Put the cushions back'})]});M.add(board,task);M.finish(board,task.id,true);
 const stale=M.clone(board),remote=M.clone(board);M.finish(remote,task.id,false);M.finish(remote,task.id,true);
 const staleId=stale.tasks[0].children[0]._winId,newId=remote.tasks[0].children[0]._winId;
 assert.notEqual(newId,staleId);
 const accepted=S.accept(stale,S.project(remote,{},'owner'),{native:S.snapshot(stale),hidden:[]});
 assert.equal(accepted.tasks[0].children[0]._winId,newId);
});

test('reconcile ignores stale Undo across a newer completion while keeping unrelated edits',()=>{
 const base=M.board(),task=M.task({id:'reconcile-subtask-task',title:'Reset the room',children:[M.child({id:'reconcile-subtask-child',title:'Put the cushions back'})]});M.add(base,task);M.finish(base,task.id,true);
 const current=M.clone(base);M.finish(current,task.id,false);current.tasks[0].notes='Keep this offline note';
 const incoming=M.clone(base);M.finish(incoming,task.id,false);M.finish(incoming,task.id,true);
 const latestWin=incoming.features.wins.at(-1),latestChildId=incoming.tasks[0].children[0]._winId;
 incoming.features.questTimings.push({id:'reconcile-new-timing',taskId:task.children[0].id,owner:'owner',kind:'valid',durationMs:60000,at:'2026-11-27T08:00:00.000Z',completionWinIds:[latestWin.id]});
 const merged=S.reconcile(base,current,incoming);
 assert.equal(merged.tasks[0].done,true);
 assert.equal(merged.tasks[0].children[0].done,true);
 assert.equal(merged.tasks[0].children[0]._winId,latestChildId);
 assert.deepEqual(merged.tasks[0]._completionIds,incoming.tasks[0]._completionIds);
 assert.ok(merged.tasks[0]._completionIds.includes(latestChildId));
 assert.equal(merged.tasks[0].notes,'Keep this offline note');
 assert.equal(merged.features.wins.at(-1).id,latestWin.id);
 assert.deepEqual(merged.features.questTimings.map(x=>x.id),['reconcile-new-timing']);
});

test('stale Undo preserves a newer completion for a simple task',async()=>{
 const original=M.board(),task=M.task({id:'simple-sync-undo',title:'Wipe the table'});M.add(original,task);
 const base=S.project(original,{},'owner'),first=M.clone(original);first.features.browserSync=syncState(first,base);M.finish(first,task.id,true);
 let remote;
 const firstSync=await S.synchronize(first,async house=>({house,account:'owner',payload:base}),async(_r,payload)=>{remote=payload;return true;});
 const secondDevice=M.clone(original);secondDevice.features.browserSync=syncState(secondDevice,base);
 const received=await S.synchronize(secondDevice,async house=>({house,account:'owner',payload:remote}),async()=>{assert.fail('unchanged device should not upload');});
 M.finish(received.accepted,task.id,false);
 const newer=firstSync.accepted;M.finish(newer,task.id,false);M.finish(newer,task.id,true);
 newer.features.questTimings.push({id:'simple-new-timing',taskId:task.id,owner:'owner',kind:'valid',durationMs:45000,at:'2026-11-27T08:00:01.000Z',completionWinIds:newer.tasks[0]._completionIds.slice()});
 const recompleted=await S.synchronize(newer,async house=>({house,account:'owner',payload:remote}),async(_r,payload)=>{remote=payload;return true;});
 const staleUndo=await S.synchronize(received.accepted,async house=>({house,account:'owner',payload:remote}),async(_r,payload)=>{remote=payload;return true;});
 const merged=staleUndo.payload.tasks.find(row=>row.id===task.id);
 assert.equal(merged.done,true);
 assert.equal(merged.completionUndo.winId,recompleted.payload.tasks.find(row=>row.id===task.id).completionUndo.winId);
 assert.equal(staleUndo.payload.wins.length,1);
 assert.equal(staleUndo.payload.wins[0].id,recompleted.payload.wins[0].id);
 assert.deepEqual(S.importRaw(staleUndo.payload).features.questTimings.map(row=>row.id),['simple-new-timing']);
});

test('lost save acknowledgement keeps newer local edits, unrelated household additions and one completion',async()=>{
 const local=M.board(),task=M.task({id:'lost-ack-edit-task',title:'Fold the towels'}),other=M.task({id:'lost-ack-other-task',title:'Clear the chair'});M.add(local,task);M.add(local,other);
 const base=S.project(local,{},'owner');local.features.browserSync=syncState(local,base);M.finish(local,task.id,true);
 const completionId=local.tasks.find(row=>row.id===task.id)._completionIds[0];local.features.questTimings.push({id:'lost-ack-edit-timing',taskId:task.id,owner:'owner',kind:'valid',durationMs:42000,at:'2026-11-27T09:00:00.000Z',completionWinIds:[completionId]});
 let remote=M.clone(base),revision=1,loseResponse=true,saves=0;
 const load=async house=>({house,account:'owner',revision,payload:M.clone(remote)});
 const save=async(_record,payload)=>{saves++;remote=M.clone(payload);revision++;if(loseResponse){loseResponse=false;throw new TypeError('Failed to fetch after server commit');}return true;};
 await assert.rejects(S.synchronize(local,load,save),/Failed to fetch after server commit/);
 assert.equal(remote.wins.filter(row=>row.id===completionId).length,1);
 local.tasks.find(row=>row.id===task.id).notes='Fold towels before lunch';
 const otherDevice=S.importRaw(M.clone(remote));M.add(otherDevice,M.task({id:'lost-ack-remote-addition',title:'Put away the books'}));
 remote=S.project(otherDevice,remote,'owner');revision++;
 const retry=await S.synchronize(local,load,save);
 assert.equal(retry.conflicts.length,0);
 assert.equal(retry.payload.tasks.find(row=>row.id===task.id).done,true);
 assert.equal(retry.payload.tasks.find(row=>row.id===task.id).notes,'Fold towels before lunch');
 assert.equal(retry.payload.tasks.some(row=>row.id==='lost-ack-remote-addition'),true);
 assert.deepEqual(retry.payload.wins.filter(row=>row.taskId===task.id).map(row=>row.id),[completionId]);
 assert.deepEqual(S.importRaw(retry.payload).features.questTimings.map(row=>row.id),['lost-ack-edit-timing']);
 assert.equal(saves,2,'one accepted save and one retry save');
});

test('Undo after a server-accepted save with a lost response removes that exact family win and timing',async()=>{
 const local=M.board(),task=M.task({id:'lost-ack-undo-task',title:'Reset the kitchen',children:[M.child({id:'lost-ack-undo-child',title:'Wipe the table'})]});M.add(local,task);
 const base=S.project(local,{},'owner');local.features.browserSync=syncState(local,base);M.finish(local,task.id,true);
 const completionIds=local.tasks.find(row=>row.id===task.id)._completionIds.slice();local.features.questTimings.push({id:'lost-ack-undo-timing',taskId:task.id,owner:'owner',kind:'valid',durationMs:30000,at:'2026-11-27T09:01:00.000Z',completionWinIds:completionIds});
 let remote=M.clone(base),revision=1,loseResponse=true;
 const load=async house=>({house,account:'owner',revision,payload:M.clone(remote)});
 const save=async(_record,payload)=>{remote=M.clone(payload);revision++;if(loseResponse){loseResponse=false;throw new TypeError('Failed to fetch after server commit');}return true;};
 await assert.rejects(S.synchronize(local,load,save),/Failed to fetch after server commit/);
 const completed=M.clone(local),undone=M.clone(local);M.finish(undone,task.id,false);S.transition(completed,undone);
 const retry=await S.synchronize(undone,load,save);
 assert.equal(retry.payload.tasks.find(row=>row.id===task.id).done,false);
 assert.equal(retry.payload.tasks.find(row=>row.id==='lost-ack-undo-child').done,false);
 assert.equal(retry.payload.wins.some(row=>completionIds.includes(row.id)),false);
 assert.deepEqual(S.importRaw(retry.payload).features.questTimings,[]);
 assert.equal(retry.accepted.features.browserSync.pendingUndos?.length||0,0,'successful sync clears the temporary Undo marker');
});

test('lost acknowledgement Undo removes only its own win when a newer remote completion exists',async()=>{
 const local=M.board(),task=M.task({id:'lost-ack-newer-task',title:'Complete once'});M.add(local,task);
 const base=S.project(local,{},'owner');local.features.browserSync=syncState(local,base);M.finish(local,task.id,true);
 const originalWinIds=local.tasks.find(row=>row.id===task.id)._completionIds.slice();local.features.questTimings.push({id:'lost-ack-old-timing',taskId:task.id,owner:'owner',kind:'valid',durationMs:30000,at:'2026-11-27T09:02:00.000Z',completionWinIds:originalWinIds});
 let remote=M.clone(base),revision=1,loseResponse=true;
 const load=async house=>({house,account:'owner',revision,payload:M.clone(remote)});
 const save=async(_record,payload)=>{remote=M.clone(payload);revision++;if(loseResponse){loseResponse=false;throw new TypeError('Failed to fetch after server commit');}return true;};
 await assert.rejects(S.synchronize(local,load,save),/Failed to fetch after server commit/);
 const completed=M.clone(local),undone=M.clone(local);M.finish(undone,task.id,false);S.transition(completed,undone);
 const newerDevice=S.importRaw(M.clone(remote)),oldWin=M.clone(remote.wins.find(row=>originalWinIds.includes(row.id))),oldTiming=M.clone(newerDevice.features.questTimings[0]);
 M.finish(newerDevice,task.id,false);M.finish(newerDevice,task.id,true);
 newerDevice.features.wins.push(oldWin);newerDevice.features.questTimings.push(oldTiming);
 const newerWinId=newerDevice.tasks.find(row=>row.id===task.id)._completionIds[0];
 newerDevice.features.questTimings.push({id:'lost-ack-new-timing',taskId:task.id,owner:'owner',kind:'valid',durationMs:55000,at:'2026-11-27T09:03:00.000Z',completionWinIds:[newerWinId]});
 remote=S.project(newerDevice,remote,'owner');revision++;
 const retry=await S.synchronize(undone,load,save);
 assert.equal(retry.payload.tasks.find(row=>row.id===task.id).done,true);
 assert.equal(retry.payload.tasks.find(row=>row.id===task.id).completionUndo.winId,newerWinId);
 assert.deepEqual(retry.payload.wins.filter(row=>row.taskId===task.id).map(row=>row.id),[newerWinId]);
 assert.deepEqual(S.importRaw(retry.payload).features.questTimings.map(row=>row.id),['lost-ack-new-timing']);
});

test('remote-row deletion safeguard still stops an unconfirmed disappearance',()=>{
 const board=M.board(),task=M.task({id:'deletion-guard-task',title:'Keep this task'});M.add(board,task);
 const base=S.project(board,{},'owner'),state=syncState(board,base),remote=M.clone(base);remote.tasks.push({...M.clone(base.tasks[0]),id:'unseen-remote-task',text:'Remote addition'});
 const truncated=M.clone(base),app=fixture(board);
 assert.throws(()=>app.api._protectRemoteRows(remote,truncated,state,board),/Safety stop: shared tasks record unseen-remote-task/);
});
