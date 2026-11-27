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
 const ui={getBoard:()=>board,acceptSync:next=>{board=next;},onSyncStatus(){},notice(){},editing:()=>false,button:(label,action)=>`<button data-action="${action}">${label}</button>`,field:(label,name)=>`<label>${label}<input name="${name}"></label>`,card:x=>x,detail:(title,body)=>`<details>${title}${body}</details>`,select:()=>'<select></select>',esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),storageKey:'qa'};
 const mapStore={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 if(board.features.browserSync)storage.set('tidyish-html-v023-sync-approved:'+board.features.browserSync.account+'/'+board.features.browserSync.house,'yes');
 const ctx={URL,URLSearchParams,sessionStorage:mapStore,localStorage:mapStore,location:{href:'https://example.test/index.html',protocol:'https:',search:''},navigator:{onLine:online},document:{addEventListener(){},hidden:false,getElementById(){return null;}},Event:class{},setTimeout(fn){calls.timer=fn;return 1;},clearTimeout(){delete calls.timer;},window:{TidyUI:ui,TidyModel:M,TidySharedModel:S,TidyStorageCodec:null,dispatchEvent(){},addEventListener:(n,fn)=>{listeners[n]=fn;},history:{state:{},replaceState(){}}}};
 const hooked=source.replace('const api={','window.__testStatus=()=>status;window.__testLoad=load;window.__setSession=(person,db)=>{session={user:person};client=db;};\nconst api={');
 vm.runInNewContext(hooked,ctx,{filename:'sharing.js'});
 return {api:ctx.window.TidySharing,ctx,calls,storage,listeners,status:()=>ctx.window.__testStatus(),setSession:(person,db)=>ctx.window.__setSession(person,db)};
}
function syncState(board,base){return {account:'owner',house:'house',kind:'legacy',base,native:S.snapshot(board),initial:false,hidden:[],choices:{},conflicts:[],retired:[]};}

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

function mockClient({listError=null,readError=null,saveError=null,remote}={}){
 const savedPayloads=[];
 return {
  auth:{getUser:async()=>({data:{user:{id:'owner',email:'owner@example.test'}},error:null})},
  rpc:async(name,args)=>{
   if(args.action==='list'&&name==='mission_house_sharing')return listError?{data:null,error:listError}:{data:{houses:[{id:'house',label:'House'}],members:[]},error:null};
   if(args.action==='list'&&name==='tidyish_household_v2')return {data:{houses:[],members:[]},error:null};
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
  channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel:async()=>{},savedPayloads
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
 assert.deepEqual(merged.tasks[0]._completionIds.map(w=>w.id),incoming.tasks[0]._completionIds.map(w=>w.id));
 assert.equal(merged.tasks[0].notes,'Keep this offline note');
 assert.equal(merged.features.wins.at(-1).id,latestWin.id);
 assert.deepEqual(merged.features.questTimings.map(x=>x.id),['reconcile-new-timing']);
});
