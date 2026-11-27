const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const M=require('../js/model.js');
const S=require('../js/sharing-model.js');

const source=fs.readFileSync(path.join(__dirname,'../js/sharing.js'),'utf8');
function fixture(initialBoard,{online=true,editing=false}={}){
 let board=initialBoard,isEditing=editing,now=0,nextTimer=1;
 const timers=new Map(),scheduledDelays=[],storage=new Map(),listeners={},dialogListeners={};
 const editor={addEventListener:(name,fn)=>{dialogListeners[name]=fn;}};
 const ui={getBoard:()=>board,acceptSync:next=>{board=next;},onSyncStatus(){},notice(){},editing:()=>isEditing,button:(label,action)=>`<button data-action="${action}">${label}</button>`,field:(label,name)=>`<label>${label}<input name="${name}"></label>`,card:x=>x,detail:(title,body)=>`<details>${title}${body}</details>`,select:()=>'<select></select>',esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),storageKey:'qa'};
 const mapStore={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 if(board.features.browserSync)storage.set('tidyish-html-v023-sync-approved:'+board.features.browserSync.account+'/'+board.features.browserSync.house,'yes');
 const ctx={URL,URLSearchParams,sessionStorage:mapStore,localStorage:mapStore,location:{href:'https://example.test/index.html',protocol:'https:',search:''},navigator:{onLine:online},document:{addEventListener:(n,fn)=>{listeners['document:'+n]=fn;},hidden:false,getElementById:id=>id==='editor'?editor:null},Event:class{},setTimeout(fn,ms=0){const id=nextTimer++;scheduledDelays.push(ms);timers.set(id,{fn,at:now+ms,ms});return id;},clearTimeout(id){timers.delete(id);},window:{TidyUI:ui,TidyModel:M,TidySharedModel:S,TidyStorageCodec:null,dispatchEvent(){},addEventListener:(n,fn)=>{listeners[n]=fn;},history:{state:{},replaceState(){}}}};
 const hooked=source.replace('const api={','window.__testStatus=()=>status;window.__setSession=(person,db)=>{session={user:person};client=db;};\nconst api={');
 vm.runInNewContext(hooked,ctx,{filename:'sharing.js'});
 async function advance(ms){const end=now+ms;let runs=0;while(true){const item=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;if(++runs>100)throw Error('Timer loop exceeded test bound.');const [id,t]=item;timers.delete(id);now=t.at;await t.fn();}now=end;}
 function closeEditor(){isEditing=false;dialogListeners.close?.();}
 return {api:ctx.window.TidySharing,ctx,timers,scheduledDelays,listeners,storage,advance,closeEditor,status:()=>ctx.window.__testStatus(),setSession:(person,db)=>ctx.window.__setSession(person,db),setEditing:value=>{isEditing=value;},setOnline:value=>{ctx.navigator.onLine=value;}};
}
function pendingBoard(){const board=M.board(),task=M.task({id:'retry-task',title:'Wipe the table'});M.add(board,task);const base=S.project(board,{},'owner');board.features.browserSync={account:'owner',house:'house',kind:'legacy',base,native:S.snapshot(board),initial:false,hidden:[],choices:{},conflicts:[],retired:[]};board.tasks[0].title='Wipe the whole table';return {board,base};}
async function reachFinalRetry(app,client){await assert.rejects(app.api.sync(),/shared board read failed/);await app.advance(52000);assert.equal(client.readCount,5);assert.deepEqual([...app.timers.values()].map(t=>t.ms),[60000]);}
async function verifyManualRefreshAfterFinalRetry(app,client){const before=client.readCount;app.api.queue({immediate:true});app.listeners.online();await app.advance(120000);assert.equal(client.readCount,before,'automatic events stay stopped after the deferred final retry actually runs');await assert.rejects(app.api.actions['house-sync'](),/shared board read failed/);assert.equal(client.readCount,before+1);assert.deepEqual([...app.timers.values()].map(t=>t.ms),[2000]);}
function mockClient({remote,read,casFailures=0,authError=null,rpcErrors={}}={}){
 let activeReads=0,maxConcurrentReads=0,readCount=0,saveCount=0;
 const savedPayloads=[];
 return {
  auth:{getUser:async()=>authError?{data:null,error:authError}:{data:{user:{id:'owner',email:'owner@example.test'}},error:null}},
  rpc:async(name,args)=>{
   const rpcError=rpcErrors[`${name}:${args.action}`];if(rpcError)return {data:null,error:rpcError};
   if(args.action==='list'&&name==='mission_house_sharing')return {data:{houses:[{id:'house',label:'House'}],members:[]},error:null};
   if(args.action==='list'&&name==='tidyish_household_v2')return {data:{houses:[],members:[]},error:null};
   if(name==='save_shared_mission_board'||name==='save_mission_board'){saveCount++;if(casFailures>0){casFailures--;return {data:false,error:null};}savedPayloads.push(args.new_payload);return {data:true,error:null};}
   return {data:true,error:null};
  },
  from(){
   return {select(){
    return {eq(){
     return {maybeSingle:async()=>{
      readCount++;activeReads++;maxConcurrentReads=Math.max(maxConcurrentReads,activeReads);
      try{if(read)await read(readCount);return {data:{payload:remote,revision:1},error:null};}
      finally{activeReads--;}
     }};
    }};
   }};
  },
  channel(){return {on(){return this;},subscribe(){return this;}};},removeChannel:async()=>{},get readCount(){return readCount;},get saveCount(){return saveCount;},get maxConcurrentReads(){return maxConcurrentReads;},savedPayloads};
}

test('transient network failure retries with bounded backoff and then syncs pending edits',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board),client=mockClient({remote:base,read:async n=>{if(n===1)throw new TypeError('Failed to fetch');}});app.setSession({id:'owner'},client);
 await assert.rejects(app.api.sync(),/Sync error: shared board read failed/);
 assert.deepEqual([...app.timers.values()].map(t=>t.ms),[2000]);
 assert.match(app.status(),/Retrying in 2 seconds/i);
 board.tasks[0].title='Wipe the table and the sides';
 await app.advance(2000);
 assert.equal(client.saveCount,1);
 assert.equal(client.savedPayloads[0].tasks[0].text,'Wipe the table and the sides');
 assert.match(app.api.panel(),/Synced at \d{2}:\d{2}/);
 assert.equal(app.timers.size,0);
});

test('CAS exhaustion gets a bounded retry instead of dropping the pending edit',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board),client=mockClient({remote:base,casFailures:3});app.setSession({id:'owner'},client);
 await assert.rejects(app.api.sync(),/Another device is updating this house/);
 assert.equal(client.saveCount,3);
 assert.deepEqual([...app.timers.values()].map(t=>t.ms),[2000]);
 await app.advance(2000);
 assert.equal(client.saveCount,4);
 assert.equal(client.savedPayloads.length,1);
});

for(const changedField of ['house','account'])test(`a scheduled retry is discarded after the ${changedField} changes`,async()=>{
 const {board,base}=pendingBoard(),app=fixture(board),client=mockClient({remote:base,read:async n=>{if(n===1)throw new TypeError('Failed to fetch');}});app.setSession({id:'owner'},client);
 await assert.rejects(app.api.sync(),/shared board read failed/);
 board.features.browserSync[changedField]=changedField==='house'?'another-house':'another-account';
 await app.advance(2000);
 assert.equal(client.readCount,1);
 assert.equal(client.saveCount,0);
});

test('transient failures stop after the bounded retry window and keep local edits',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board),client=mockClient({remote:base,read:async()=>{throw new TypeError('Failed to fetch');}});app.setSession({id:'owner'},client);
 await assert.rejects(app.api.sync(),/shared board read failed/);
 await app.advance(112000);
 assert.equal(client.readCount,6);
 assert.deepEqual(app.scheduledDelays,[2000,5000,15000,30000,60000]);
 assert.equal(app.timers.size,0);
 assert.equal(board.tasks[0].title,'Wipe the whole table');
 assert.match(app.status(),/pending changes remain saved/i);
 const attemptsAtExhaustion=client.readCount;
 app.api.queue({immediate:true});app.listeners.online();await app.advance(120000);
 assert.equal(client.readCount,attemptsAtExhaustion,'automatic queue and reconnect events do not restart an exhausted retry window');
 assert.equal(app.timers.size,0);
 await assert.rejects(app.api.actions['house-sync'](),/shared board read failed/);
 assert.deepEqual([...app.timers.values()].map(t=>t.ms),[2000]);
});

test('the final scheduled retry resumes when its timer fires offline',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board),client=mockClient({remote:base,read:async()=>{throw new TypeError('Failed to fetch');}});app.setSession({id:'owner'},client);
 await reachFinalRetry(app,client);app.setOnline(false);await app.advance(60000);
 assert.equal(client.readCount,5);assert.equal(app.timers.size,0);assert.match(app.status(),/waiting for an internet connection/i);
 app.setOnline(true);app.listeners.online();await app.advance(0);
 assert.equal(client.readCount,6,'the reserved final retry runs once after connectivity returns');
 await verifyManualRefreshAfterFinalRetry(app,client);
});

test('the final scheduled retry resumes when its timer fires during editing',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board),client=mockClient({remote:base,read:async()=>{throw new TypeError('Failed to fetch');}});app.setSession({id:'owner'},client);
 await reachFinalRetry(app,client);app.setEditing(true);await app.advance(60000);
 assert.equal(client.readCount,5);assert.equal(app.timers.size,0);assert.match(app.status(),/resumes when editing is closed/i);
 app.closeEditor();await app.advance(0);
 assert.equal(client.readCount,6,'the reserved final retry runs once after editing closes');
 await verifyManualRefreshAfterFinalRetry(app,client);
});

test('authentication and permission failures do not schedule retries',async()=>{
 const authBoard=pendingBoard(),authApp=fixture(authBoard.board),auth=mockClient({remote:authBoard.base,authError:Object.assign(Error('Invalid JWT'),{status:401})});authApp.setSession({id:'owner'},auth);
 await assert.rejects(authApp.api.sync(),/Invalid JWT/);assert.equal(authApp.timers.size,0);assert.equal(auth.readCount,0);
 const permissionBoard=pendingBoard(),permissionApp=fixture(permissionBoard.board),permission=mockClient({remote:permissionBoard.base,read:async()=>{throw Object.assign(Error('Permission denied'),{status:403});}});permissionApp.setSession({id:'owner'},permission);
 await assert.rejects(permissionApp.api.sync(),/Permission denied/);assert.equal(permissionApp.timers.size,0);assert.equal(permission.readCount,1);
});

test('RPC status and codes survive both wrappers and override retryable message text',async()=>{
 for(const item of [
  {name:'mission_house_sharing',code:'42501',status:403,kind:'legacy'},
  {name:'tidyish_household_v2',code:'PGRST301',status:401,kind:'v2'}
 ]){
  const {board,base}=pendingBoard();board.features.browserSync.kind=item.kind;
  const rpcError=Object.assign(Error('Failed to fetch'),{code:item.code,status:item.status});
  const app=fixture(board),client=mockClient({remote:base,rpcErrors:{[`${item.name}:list`]:rpcError}});app.setSession({id:'owner'},client);
  let caught;try{await app.api.sync();}catch(error){caught=error;}
  assert.ok(caught,`${item.name} failure is surfaced`);
  assert.equal(caught.cause?.cause?.code,item.code);
  assert.equal(caught.cause?.cause?.status,item.status);
  assert.equal(app.timers.size,0,`${item.status} takes precedence over retryable message text`);
 }
});

test('pending edits retry after the editor closes',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board,{editing:true}),client=mockClient({remote:base});app.setSession({id:'owner'},client);
 app.api.queue();await app.advance(900);
 assert.equal(client.readCount,0);
 app.closeEditor();await app.advance(900);
 assert.equal(client.saveCount,1);
});

test('a second sync request while one is in flight never overlaps the remote read',async()=>{
 const {board,base}=pendingBoard(),app=fixture(board);let finishRead;
 const client=mockClient({remote:base,read:async n=>{if(n===1)await new Promise(resolve=>{finishRead=resolve;});}});app.setSession({id:'owner'},client);
 const first=app.api.sync();await new Promise(resolve=>setImmediate(resolve));
 await app.api.sync();assert.equal(client.maxConcurrentReads,1);
 finishRead();await first;assert.equal(client.maxConcurrentReads,1);
});
