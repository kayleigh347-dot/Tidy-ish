const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const sharing=fs.readFileSync(path.join(__dirname,'../js/sharing.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');

// A synthetic, in-memory Supabase client; tests never contact a live household.
function fixture({href='https://kayleigh347-dot.github.io/Tidy-ish/index.html?qa=1',house=null,userId='owner-id',responses={},clipboard=true,storedInvite=''}={}){
 const address=new URL(href), notices=[],requests=[],navigation=[],otp=[],copied=[];
 const board={features:{...(house?{browserSync:house}:{})}};
 const storage=new Map(),local=new Map();
 if(storedInvite)storage.set('tidyish-v023-pending-invite'+(address.searchParams.get('qa')==='1'?'-qa':''),storedInvite);
 const memoryStore=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
 const u={
  getBoard:()=>board,onSyncStatus(){},navigate:(page,id,view)=>navigation.push({page,id,view}),notice:message=>notices.push(message),
  button:(label,action)=>`<button data-action="${action}">${label}</button>`,
  field:(label,name,value='')=>`<label>${label}<input name="${name}" value="${String(value).replaceAll('&','&amp;').replaceAll('"','&quot;')}"></label>`,
  card:x=>x,detail:(name,body,open=false)=>`<details ${open?'open':''}>${name}${body}</details>`,
  select:(name,key,options)=>`<select name="${key}">${options.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select>`,
  esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  storageKey:'qa',change(){throw Error('Unexpected board mutation');},acceptSync(){throw Error('Unexpected board import');}
 };
 const ctx={
  URL,URLSearchParams,sessionStorage:memoryStore(storage),localStorage:memoryStore(local),
  location:{href:address.href,protocol:address.protocol,search:address.search},
  navigator:{clipboard:clipboard?{writeText:async text=>{copied.push(text);}}:undefined},
  document:{addEventListener(){},hidden:false,getElementById(){return null;}},
  Event:class{},setTimeout(fn){return 1;},clearTimeout(){},
  window:{TidyUI:u,TidyModel:{},TidySharedModel:{transition(){}},TidyStorageCodec:null,dispatchEvent(){},addEventListener(){},
   history:{state:{depth:0},replaceState(state,title,url){this.state=state;ctx.location.href=url;ctx.location.search=new URL(url).search;}}}
 };
 const src=sharing.replace('const api={','window.__testSetSession=(person,db)=>{session={user:person};client=db;};\nconst api={');
 assert.notEqual(src,sharing,'test state hook inserted');
 vm.runInNewContext(src,ctx,{filename:'sharing.js'});
 const user={id:userId,email:'example@invalid.test'};
 const db={
  auth:{getUser:async()=>({data:{user},error:null}),signInWithOtp:async args=>{otp.push(args);return {error:null};}},
  rpc:async(name,args)=>{
   requests.push({name,args});
   const key=`${name}:${args.action}`;
   if(Object.hasOwn(responses,key)){
    const response=responses[key];return typeof response==='function'?response(args):response;
   }
   if(args.action==='list')return {data:{houses:[],members:[]},error:null};
   if(args.action==='join')return {data:{},error:null};
   return {data:{code:'TEST+& CODE'},error:null};
  }
 };
 const signIn=()=>ctx.window.__testSetSession(user,db);
 return {ctx,api:ctx.window.TidySharing,board,signIn,requests,notices,navigation,otp,copied,storage};
}

test('recipient link opens Settings, invites sign-in and never imports automatically',()=>{
 const t=fixture({href:'https://kayleigh347-dot.github.io/Tidy-ish/index.html?invite=TEST%2B123&qa=1'});
 assert.deepEqual(t.navigation,[{page:'settings',id:undefined,view:'household'}]);
 assert.match(t.api.panel(),/Household invitation received/);
 assert.equal(t.storage.get('tidyish-v023-pending-invite-qa'),'TEST+123');
 assert.equal(t.storage.has('tidyish-v023-pending-invite'),false);
 assert.equal(t.requests.length,0);
 assert.equal(t.board.features.browserSync,undefined);
 t.signIn();
 assert.match(t.api.panel(),/name="code" value="TEST\+123"/);
 assert.match(t.api.panel(),/Joining will let you preview/);
 assert.match(t.api.panel(),/<details open>Share or join a house/);
});

test('owner v2: invite code comes from the correct Supabase RPC; link is encoded and copyable',async()=>{
 const t=fixture({house:{kind:'v2',house:'new-house-17',account:'owner-id'}});t.signIn();
 await t.api.actions['house-invite']();
 assert.deepEqual(t.requests.map(x=>({name:x.name,action:x.args.action,house:x.args.p_house_id})),[{name:'tidyish_household_v2',action:'invite',house:'new-house-17'}]);
 const panel=t.api.panel();
 assert.match(panel,/Invitation code: TEST\+&amp; CODE/);
 assert.match(panel,/house-invite-link/);
 assert.match(panel,/index\.html\?invite=TEST%2B%26\+CODE/);
 await t.api.actions['house-copy-invite']();
 assert.deepEqual(t.copied,['https://kayleigh347-dot.github.io/Tidy-ish/index.html?invite=TEST%2B%26+CODE']);
 assert.equal(t.notices.at(-1),'Invitation link copied.');
});

test('old household keeps its existing RPC and never invents invitation codes',async()=>{
 const t=fixture({house:{house:'owner-id',account:'owner-id'}});t.signIn();
 await t.api.actions['house-invite']();
 assert.equal(t.requests[0].name,'mission_house_sharing');
 assert.equal(t.requests[0].args.action,'invite');
 assert.match(t.api.panel(),/Invitation link/);
 await t.api.actions['house-cancel-invite']();
 assert.doesNotMatch(t.api.panel(),/id="house-invite-link"/);
});

test('RPC missing an invitation code fails visibly without fake link or board edits',async()=>{
 const t=fixture({house:{kind:'v2',house:'new-house-17',account:'owner-id'},responses:{'tidyish_household_v2:invite':{data:{},error:null}}});
 t.signIn();
 await assert.rejects(t.api.actions['house-invite'](),/Supabase did not return an invitation code/);
 assert.doesNotMatch(t.api.panel(),/id="house-invite-link"/);
 assert.equal(t.board.features.browserSync.house,'new-house-17');
});

test('v2 Supabase errors never fall back to an unrelated old household',async()=>{
 const t=fixture({house:{kind:'v2',house:'new-house-17',account:'owner-id'},responses:{'tidyish_household_v2:invite':{data:null,error:{code:'PGRST202',message:'missing RPC'}}}});
 t.signIn();await assert.rejects(t.api.actions['house-invite'](),/New households need the supplied additive Supabase SQL installed/);
 assert.equal(t.requests.length,1);
 assert.equal(t.requests[0].name,'tidyish_household_v2');
});

test('no selected household is blocked before any invite RPC, not silently sent to legacy household',async()=>{
 const t=fixture();t.signIn();
 assert.doesNotMatch(t.api.panel(),/id=\"house-invite-link\"/);
 await assert.rejects(t.api.actions['house-invite'](),/Choose and connect a household/);
 assert.equal(t.requests.length,0);
 assert.equal(t.board.features.browserSync,undefined);
 assert.doesNotMatch(t.api.panel(),/id=\"house-invite-link\"/);
});

test('cancel unused invite with no selected household never hits the legacy RPC',async()=>{
 const t=fixture();t.signIn();
 await assert.rejects(t.api.actions['house-cancel-invite'](),/Choose and connect a household/);
 assert.equal(t.requests.length,0);
});

test('empty selected household ID is also blocked without a legacy RPC fallback',async()=>{
 const t=fixture({house:{kind:'v2',house:'',account:'owner-id'}});t.signIn();
 await assert.rejects(t.api.actions['house-invite'](),/Choose and connect a household/);
 assert.equal(t.requests.length,0);
});

test('non-owner cannot generate an invitation for another legacy household',async()=>{
 const t=fixture({house:{house:'different-owner',account:'owner-id'}});t.signIn();
 await assert.rejects(t.api.actions['house-invite'](),/Only the owner can invite others/);
 assert.equal(t.requests.length,0);
});

test('sign-in keeps original authorised redirect and leaves pending invite in tab storage',async()=>{
 const t=fixture({href:'https://kayleigh347-dot.github.io/Tidy-ish/index.html?qa=1&invite=NEWTOKEN'});t.signIn();
 await t.api.submit({id:'house-signin'},{get:()=> 'example@invalid.test'});
 assert.equal(t.otp.length,1);
 assert.equal(t.otp[0].options.emailRedirectTo,'https://kayleigh347-dot.github.io/Tidy-ish/index.html');
 assert.equal(t.otp[0].options.shouldCreateUser,false);
 assert.equal(t.storage.get('tidyish-v023-pending-invite-qa'),'NEWTOKEN');
});

test('successful join clears pending invite after RPC, preserving other query parameters',async()=>{
 const t=fixture({href:'https://kayleigh347-dot.github.io/Tidy-ish/index.html?qa=1&invite=join%2Bme',responses:{'tidyish_household_v2:join':{data:{},error:null}}});t.signIn();
 await t.api.submit({id:'house-join'},{get:key=>key==='code'?'join+me':''});
 assert.equal(t.requests[0].name,'tidyish_household_v2');
 assert.equal(t.requests[0].args.invite_code,'join+me');
 assert.equal(t.storage.has('tidyish-v023-pending-invite-qa'),false);
 assert.equal(t.ctx.location.href,'https://kayleigh347-dot.github.io/Tidy-ish/index.html?qa=1');
 assert.doesNotMatch(t.api.panel(),/Invitation ready/);
});

test('failed join preserves invitation for retry; does not discard or import records',async()=>{
 const t=fixture({href:'https://kayleigh347-dot.github.io/Tidy-ish/index.html?invite=bad',responses:{'tidyish_household_v2:join':{data:null,error:{code:'INVALID',message:'Network unavailable'}}}});t.signIn();
 await assert.rejects(t.api.submit({id:'house-join'},{get:()=> 'bad'}),/Network unavailable/);
 assert.equal(t.storage.get('tidyish-v023-pending-invite'),'bad');
 assert.match(t.ctx.location.href,/invite=bad/);
 assert.equal(t.board.features.browserSync,undefined);
});

test('layout release advances app version and preserves the invitation-safe sharing and history asset versions',()=>{
 assert.match(html,/js\/sharing\.js\?v=20261115-invite-link-qa1/);
 assert.ok(html.includes('js/app.js?v=20261127-task-timer-alarm1-task-data-daily-view1-issue02a1-layoutbundle1-management1-cardhotfix1-routines1-libraryheader1-occasionaltab1-interface1-timedcompletion1-subtasktimer1-masterportrait2-libraryrepeat1-seasonaltab1-kayleighwriting1-seasonal2a1-seasonal2b1-seasonal2c1-workloada2-christmasb1-seasonalshare1-taskcheck1-christmashome1-christmasb2a1-christmasb3a1-christmasart1-dolater1-christmastrees1-jingle1-fontcards1-taskcardart1-focusresume1-focusnav1-timeralarmfix1"'));
 assert.ok(html.includes('css/task-data-completed-rows.css?v=20261115-local-prototype1"'),'Protected asset: css/task-data-completed-rows.css');
 assert.ok(html.includes('css/task-data-daily-view.css?v=20261115-daily-view1"'),'Protected asset: css/task-data-daily-view.css');
 assert.ok(html.includes('addons/tidyish-daily-log/addon.css?v=20261112-connected1"'),'Protected asset: addons/tidyish-daily-log/addon.css');
 assert.ok(html.includes('js/task-data.js?v=20261104-timer-task-title1-management1"'),'Protected asset: js/task-data.js');
 assert.ok(html.includes('js/daily-log-host.js?v=20261114-stage2"'),'Protected asset: js/daily-log-host.js');
 assert.ok(html.includes('js/sharing-model.js?v=20261112-connected1-interface1-seasonalshare1-christmasb2a1-christmasb3a1"'),'Protected asset: js/sharing-model.js');
 assert.ok(html.includes('js/sharing.js?v=20261115-invite-link-qa1-interface1-seasonalshare1"'),'Protected asset: js/sharing.js');
});

test('invite survives an email redirect reload in the same browser tab',()=>{
 const t=fixture({href:'https://kayleigh347-dot.github.io/Tidy-ish/index.html#access_token=synthetic',storedInvite:'RESTORED-INVITE'});
 assert.deepEqual(t.navigation,[{page:'settings',id:undefined,view:'household'}]);
 t.signIn();assert.match(t.api.panel(),/name="code" value="RESTORED-INVITE"/);
});

test('failed reissue clears a potentially stale link and gives explicit failure feedback',async()=>{
 let attempts=0;
 const t=fixture({house:{house:'owner-id',account:'owner-id'},responses:{'mission_house_sharing:invite':()=>++attempts===1?{data:{code:'FIRST'},error:null}:{data:null,error:{code:'FAILED',message:'Invitation could not be created'}}}});
 t.signIn();await t.api.actions['house-invite']();
 assert.match(t.api.panel(),/house-invite-link/);
 await assert.rejects(t.api.actions['house-invite'](),/Invitation could not be created/);
 assert.doesNotMatch(t.api.panel(),/house-invite-link/);
});

test('clipboard unavailable leaves the link visible for manual copying',async()=>{
 const t=fixture({clipboard:false,house:{house:'owner-id',account:'owner-id'}});t.signIn();await t.api.actions['house-invite']();
 await t.api.actions['house-copy-invite']();
 assert.match(t.api.panel(),/id="house-invite-link"/);
 assert.match(t.notices.at(-1),/Copy the invitation link shown/);
});
