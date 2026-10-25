/* Browser account transport. Public project configuration matches the existing web/Android app. */
(function(){'use strict';
const U=window.TidyUI,M=window.TidyModel,S=window.TidySharedModel;
const SUPABASE_URL='https://thviqhojcjrmqurhdkql.supabase.co',PUBLIC_KEY='sb_publishable_ziQesp5o-pHIXINUMMdmTA_3nDFSVZr',AUTH_KEY='tidyish-html-v023-auth';
let client=null,loading=null,session=null,houses=[],members=[],newMembers=[],people=[],busy=false,status='Not connected. Changes are saved in this browser.',timer=null,invite='',conflicts=[],generation=0;
if(!U||!M||!S)throw Error('Sharing requires the current Tidyish model and UI. Nothing was synced.');
const {button:btn,field,card,detail,esc}=U;
function statusChanged(message){status=message;U.onSyncStatus();}
async function init(){if(client)return client;if(location.protocol==='file:')throw Error('Household sign-in needs the local HTTP preview or an HTTPS website. Open the supplied local preview.');if(loading)return loading;loading=(async()=>{const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');client=createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{storageKey:AUTH_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});const {data,error}=await client.auth.getSession();if(error)throw error;session=data.session;client.auth.onAuthStateChange((_event,s)=>{session=s;generation++;setTimeout(()=>{statusChanged(s?'Signed in as '+s.user.email+'. Choose a household.':'Signed out. Your saved board remains in this browser.');if(s&&U.getBoard().features.browserSync?.account===s.user.id)queue();},0)});if(session)statusChanged('Signed in as '+session.user.email+'. Refresh households to choose your house.');return client;})();try{return await loading;}catch(e){client=null;loading=null;throw e;}}
async function verified(){const db=await init(),{data,error}=await db.auth.getUser();if(error)throw error;if(!data.user)throw Error('Sign in with your own email first.');session={...session,user:data.user};return data.user;}
async function call(action,extra={}){const db=await init();await verified();const {data,error}=await db.rpc('mission_house_sharing',{action,...extra});if(error)throw Error(error.code==='PGRST202'?'Household sharing is not installed in this Supabase project. The saved board is unchanged.':error.message);return data;}
async function callNew(action,extra={}){
 const db=await init();await verified();
 const {data,error}=await db.rpc('tidyish_household_v2',{action,...extra});
 if(error)throw Error(error.code==='PGRST202'?'New households need the supplied additive Supabase SQL installed first. Nothing has been uploaded.':error.message);
 return data;
}
async function refreshHouses(){
 const user=await verified();let old={houses:[],members:[]};
 try{old=await call('list');}catch(err){if(err.message&&!/not installed|Could not find the function/i.test(err.message))throw err;}
 members=old.members||[];houses=old.houses||[];
 if(!houses.some(h=>h.id===user.id))houses.push({id:user.id,label:'My old house'});
 try{const fresh=await callNew('list');newMembers=fresh.members||[];houses.push(...(fresh.houses||[]).map(h=>({...h,kind:'v2'})));}
 catch(err){newMembers=[];if(!/New households need|Could not find the function/i.test(err.message))throw err;}
 return houses;
}
async function load(house){
 const db=await init(),user=await verified();await refreshHouses();
 const entry=houses.find(h=>h.id===house);if(!entry)throw Error('This account cannot access that household.');
 if(entry.kind==='v2'){
  const data=await callNew('read',{p_house_id:house});S.validateRaw(data.payload);
  return {house,account:user.id,payload:data.payload,revision:data.revision};
 }
 const {data,error}=await db.from('mission_boards').select('payload,revision').eq('user_id',house).maybeSingle();if(error)throw error;
 if(!data&&house!==user.id)throw Error('This household has no available board. Ask its owner to open it first.');
 const payload=data?.payload||{tasks:[],side:[],rooms:[],wins:[],settings:[],householdPeople:[]};S.validateRaw(payload);
 return {house,account:user.id,payload,revision:data?.revision||0};
}
function updatePeople(payload,account,house){const map=new Map((payload.householdPeople||[]).filter(p=>p.id!=='local-device').map(p=>[p.id,{id:p.id,name:p.name||p.displayName||p.email||'Household member'}]));map.set(account,{id:account,name:map.get(account)?.name||session?.user.email||'Me'});if(!map.has(house))map.set(house,{id:house,name:'Household owner'});if(house===account)members.forEach(p=>{if(!map.has(p.id))map.set(p.id,{id:p.id,name:p.email||'Household member'})});const entry=houses.find(h=>h.id===house);
 if(entry?.kind==='v2'){
  map.delete(house);
  if(entry.ownerId&&!map.has(entry.ownerId))map.set(entry.ownerId,{id:entry.ownerId,name:'Household owner'});
  for(const m of newMembers.filter(m=>m.houseId===house))map.set(m.id,{id:m.id,name:m.email||'Household member'});
  const allowed=new Set([account,entry.ownerId,...newMembers.filter(m=>m.houseId===house).map(m=>m.id)]);
  people=[...map.values()].filter(p=>allowed.has(p.id));
 }else{
  const allowed=new Set([account,house,...(house===account?members.map(p=>p.id):[])]);
  people=[...map.values()].filter(p=>allowed.has(p.id));
 }}
function panel(){const state=U.getBoard().features.browserSync,user=session?.user;return card(`<h2>Connected household</h2><p class="small" role="status">${esc(status)}</p>${busy?'<p class="gold small">Working…</p>':''}${!user?`<form id="house-signin">${field('Email used for your household','email','','email','required autocomplete="email"')}<button ${busy?'disabled':''}>Send sign-in link</button></form><p class="small">Open the newest email link in this browser. The local preview address must be permitted in Supabase’s redirect URLs.</p>`:`<p class="small">${esc(user.email)}</p>`}<div class="row">${btn('Refresh households','house-refresh','','',busy?'disabled':'')}${user?btn('Sign out','house-signout','','ghost',busy?'disabled':''):''}</div>${houses.length?`<form id="house-select">${U.select('Household','house',houses.map(h=>[h.id,h.label]),state?.house||user?.id)}<button ${busy?'disabled':''}>Preview household</button></form>`:''}${state?`<p class="small">Connected: ${esc(houses.find(h=>h.id===state.house)?.label||state.house)}</p>${!approved(state)?'<p class="small">Automatic uploads are paused until you explicitly enable sync for this household.</p>':''}${btn(approved(state)?'Sync now':'Enable sync for this household','house-sync','','',busy?'disabled':'')}${detail('Pending differences',conflicts.length?conflicts.map((c,i)=>`<section class="card"><h3>${esc(c.label)}</h3><p class="small">Browser: ${esc(display(c.local))}</p><p class="small">Household: ${esc(display(c.shared))}</p><div class="row">${btn('Keep browser version','house-conflict',i,'','data-side="local"')}${btn('Use household version','house-conflict',i,'','data-side="shared"')}</div></section>`).join(''):'<p class="small">No differences awaiting review.</p>',conflicts.length>0)}`:''}${user?card(`<h3>Start Fresh Household</h3><p class="small">Create a completely separate household using the tasks and completion history in THIS browser. Your old household remains unchanged. A one-time Supabase setup is needed.</p>${btn('Start Fresh Household','house-fresh','','',busy?'disabled':'')}`):''}${user?detail('Share or join a house',`<div class="row">${btn('Create invite code','house-invite')}${btn('Cancel unused invite','house-cancel-invite','','ghost')}</div>${invite?`<p class="gold">${esc(invite)}</p><p class="small">Share this code privately. It gives access to your own house.</p>`:''}<form id="house-join">${field('Invitation code','code','','text','required autocomplete="off"')}<button ${busy?'disabled':''}>Join household</button></form>${(state?.kind==='v2'?newMembers.filter(m=>m.houseId===state.house):members).length?'<h3>Members of selected household</h3>'+(state?.kind==='v2'?newMembers.filter(m=>m.houseId===state.house):members).map(p=>`<p class="small">${esc(p.email)} ${btn('Remove access','house-remove',p.id,'ghost')}</p>`).join(''):''}`):''}`);}
function display(x){return x===undefined||x===null?'Removed / empty':typeof x==='object'?JSON.stringify(x).slice(0,1000):String(x).slice(0,1000);}
async function run(work){if(busy)return;busy=true;U.onSyncStatus();try{return await work();}catch(e){statusChanged(e.message);U.notice(e.message);throw e;}finally{busy=false;U.onSyncStatus();}}
function cacheKey(account,house){return 'tidyish-html-v023-house:'+account+'/'+house;}
// A previously saved browserSync state alone must never auto-enable cloud writes.
function approved(state){if(!state?.account||!state?.house)return false;try{return localStorage.getItem('tidyish-html-v023-sync-approved:'+state.account+'/'+state.house)==='yes';}catch{return false;}}
function approve(state){if(!state?.account||!state?.house)throw Error('Choose a household before enabling sync.');localStorage.setItem('tidyish-html-v023-sync-approved:'+state.account+'/'+state.house,'yes');}
async function preview(house){const remote=await load(house),incoming=S.importRaw(remote.payload),current=U.getBoard(),state=current.features.browserSync;updatePeople(remote.payload,remote.account,house);let chosen=current,mode='merge';if(houses.find(h=>h.id===house)?.kind==='v2'&&state?.house!==house){chosen=incoming;mode='switch';}else if(state&&(state.account!==remote.account||state.house!==house)){const raw=localStorage.getItem(cacheKey(remote.account,house));chosen=raw?M.normalize(JSON.parse(raw)):incoming;mode='switch';}const added=incoming.tasks.filter(t=>!chosen.tasks.some(x=>x.id===t.id)).length;const title=houses.find(h=>h.id===house)?.label||'Household';U.dialog('Connect household',`<h3>${esc(title)}</h3><p>${incoming.rooms.length} rooms · ${incoming.tasks.length} task families · ${incoming.features.laundry.filter(l=>l.step).length} active laundry loads.</p><p class="small">${mode==='switch'?'Your current household is kept in a separate browser copy. This opens the selected household.':`${added} household task families will be added. Your local tasks, timers, attachments and progress are kept. Same-identity differences are reviewed before any shared write.`}</p><p class="small">${incoming.tasks.filter(M.repeat).length} existing recurring families are preserved. Calendar and Schedule editing remain for later.</p>`,()=>{if(busy)throw Error('Wait for the current operation to finish.');const latest=U.getBoard(),old=latest.features.browserSync;if(old)localStorage.setItem(cacheKey(old.account,old.house),JSON.stringify(latest));else if(!localStorage.getItem(U.storageKey+'-before-first-connection'))localStorage.setItem(U.storageKey+'-before-first-connection',JSON.stringify(latest));let next=mode==='switch'?M.clone(chosen):M.merge(latest,incoming);if(mode==='switch'&&chosen.features.browserSync?.account===remote.account&&chosen.features.browserSync.house===house){/* Preserve the cached merge base and pending changes. */}else next.features.browserSync={account:remote.account,house,kind:houses.find(h=>h.id===house)?.kind||'legacy',base:M.clone(remote.payload),native:S.snapshot(incoming),initial:true,hidden:[],choices:{},conflicts:[],retired:[]};next.features.connectedHouse=house;U.acceptSync(next);approve(next.features.browserSync);generation++;conflicts=[];U.closeDialog(true);statusChanged('Household connected. Checking saved differences before syncing.');queue();},{saveLabel:'Connect this household'});}
function queue(){clearTimeout(timer);const state=U.getBoard().features.browserSync;if(!approved(state))return;timer=setTimeout(()=>sync().catch(()=>{}),900);}
const reconcile=S.reconcile;
// Every remote deletion must be traceable to a locally removed row from the
// previously seen base. This detects accidental truncation by a new serializer.
function protectRemoteRows(remote,payload,state,local){
 for(const collection of S.collections){
  const oldRows=remote[collection]||[],nextIds=new Set((payload[collection]||[]).map(r=>r.id));
  const known=new Set((state.base?.[collection]||[]).map(r=>r.id));
  const current=new Set((S.project(local,state.base,state.account)[collection]||[]).map(r=>r.id));
  for(const row of oldRows){
   if(nextIds.has(row.id))continue;
   if(!known.has(row.id)||current.has(row.id))throw Error('Safety stop: shared '+collection+' record '+row.id+' would disappear without a confirmed local deletion. Nothing was uploaded.');
  }
 }
}
function localSnapshot(b){const out=M.clone(b);delete out.features.browserSync;return out;}

async function sync(){if(busy||U.editing()||!navigator.onLine)return;const initial=U.getBoard().features.browserSync;if(!approved(initial))return;return run(async()=>{const user=await verified();if(user.id!==initial.account)throw Error('This browser board belongs to a different account. Its saved work is preserved. Choose the matching household.');const runGeneration=generation,snapshot=M.clone(U.getBoard()),state=snapshot.features.browserSync;statusChanged('Syncing household…');const result=await S.synchronize(snapshot,load,async(remote,payload,account)=>{const check=await verified();if(check.id!==account||generation!==runGeneration)throw Error('Account changed before saving.');protectRemoteRows(remote.payload,payload,state,snapshot);if(state.kind==='v2'){
   const answer=await callNew('save',{p_house_id:state.house,expected_revision:remote.revision,new_payload:payload});
   return answer.saved===true;
  }
  const own=state.house===account,{data,error}=await client.rpc(own?'save_mission_board':'save_shared_mission_board',{...(own?{}:{house_id:state.house}),expected_revision:remote.revision,new_payload:payload});
  if(error)throw error;return data===true;},async()=>{if(generation!==runGeneration||U.getBoard().features.browserSync?.house!==state.house)throw Error('Account or household changed; the earlier response was not applied.');if(U.editing())throw Error('Saved locally. Sync resumes when editing is closed.');});
 if(result.conflicts.length){conflicts=result.conflicts;const next=M.clone(U.getBoard());next.features.browserSync.conflicts=conflicts;U.acceptSync(next);statusChanged(`${conflicts.length} differences need review. Both versions are kept.`);return;}
 const current=U.getBoard();if(generation!==runGeneration||current.features.browserSync?.account!==state.account||current.features.browserSync?.house!==state.house)throw Error('Household changed while syncing; the earlier response was not applied.');let accepted=result.accepted;const currentSnapshot=localSnapshot(current);if(!S.equal(localSnapshot(snapshot),currentSnapshot)){const rebased=reconcile(localSnapshot(snapshot),currentSnapshot,localSnapshot(accepted));rebased.features.browserSync=accepted.features.browserSync;accepted=rebased;}U.acceptSync(accepted);localStorage.setItem(cacheKey(state.account,state.house),JSON.stringify(accepted));updatePeople(result.payload,state.account,state.house);conflicts=[];statusChanged('Synced at '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'. Changes share with this household.');if(!S.equal(localSnapshot(snapshot),currentSnapshot))queue();});}

async function startFreshHousehold(){
 const user=await verified(),source=U.getBoard(),snapshot=M.clone(source);
 const prepared=window.TidyFreshHouse.prepare(snapshot,user.id);
 const c=prepared.counts;
 U.dialog('Start Fresh Household',`<p>This creates a <strong>new, separate household</strong> using the current browser's tasks and completions.</p>
  <p><strong>${c.tasks} tasks · ${c.subtasks} subtasks · ${c.completions} completions · ${c.rooms} rooms</strong></p>
  <p class="small">The old Supabase household, its data and its members will not be touched. Your current browser board is preserved. Personal calendar day symbols and other device-only preferences do not sync yet.</p>
  <p class="small">Only start this on the device containing your most up-to-date tasks. Keep your downloaded backup.</p>`,async()=>{
   if(busy)throw Error('Wait for the current operation to finish.');
   // Refuse if a task has changed since the user reviewed counts.
   const latest=U.getBoard();if(!S.equal(snapshot,latest))throw Error('Your board changed. Close this popup and start again to review the new totals.');
   const signing=await verified();if(signing.id!==user.id)throw Error('Signed-in account changed. No new household created.');
   clearTimeout(timer);generation++;
   const existing=latest.features.browserSync;
   // Existing local work must be recoverable before attempting a remote create.
   const safeKey=U.storageKey+'-before-fresh-house-'+new Date().toISOString();
   try{localStorage.setItem(safeKey,JSON.stringify(latest));}
   catch(e){throw Error('Could not save a local safety copy. Keep your downloaded backup and free storage before trying again: '+e.message);}
   return run(async()=>{
    const result=await callNew('create',{new_payload:prepared.payload});
    if(!result?.houseId||result.revision!==1)throw Error('Household response was unexpected. Your local board was preserved; refresh households before trying again.');
    const next=M.clone(latest);
    if(existing)try{localStorage.setItem(cacheKey(existing.account,existing.house),JSON.stringify(latest));}catch{}
    next.features.browserSync={account:user.id,house:result.houseId,kind:'v2',base:M.clone(prepared.payload),native:S.snapshot(prepared.imported),initial:false,hidden:[],choices:{},conflicts:[],retired:[]};
    next.features.connectedHouse=result.houseId;
    U.acceptSync(next);approve(next.features.browserSync);
    await refreshHouses();updatePeople(prepared.payload,user.id,result.houseId);
    conflicts=[];U.closeDialog(true);
    statusChanged('Fresh household created. Your current tasks are now the starting board. The old household was not changed.');
   });
  },{saveLabel:'Create New Household'});
}

const actions={
 'house-fresh':()=>startFreshHousehold(),
 'house-refresh':()=>run(async()=>{await refreshHouses();statusChanged('Households refreshed. Choose one to preview.')}),
 'house-sync':()=>{approve(U.getBoard().features.browserSync);return sync()},
 'house-signout':()=>run(async()=>{generation++;clearTimeout(timer);const db=await init(),{error}=await db.auth.signOut({scope:'local'});if(error)throw error;session=null;houses=[];people=[];members=[];statusChanged('Signed out. All local work is kept.')}),
 'house-invite':()=>run(async()=>{const house=U.getBoard().features.browserSync;invite=((house?.kind==='v2')?await callNew('invite',{p_house_id:house.house}):await call('invite')).code||'';if(!invite)throw Error('No invitation code was returned.');statusChanged('Invite created for your own house. Share the displayed code privately.')}),
 'house-cancel-invite':()=>run(async()=>{const house=U.getBoard().features.browserSync;if(house?.kind==='v2')await callNew('cancel-invite',{p_house_id:house.house});else await call('cancel-invite');invite='';statusChanged('Unused invitation cancelled.')}),
 'house-remove':el=>U.confirmDialog('Remove household access?','This removes this member’s access to your house. Previously downloaded copies remain on their device.',()=>{run(async()=>{const house=U.getBoard().features.browserSync;if(house?.kind==='v2')await callNew('remove-member',{p_house_id:house.house,target_member:el.dataset.id});else await call('remove-member',{target_member:el.dataset.id});await refreshHouses();statusChanged('Member access removed.')}).catch(()=>{});},'Remove access'),
 'house-conflict':el=>{const c=conflicts[Number(el.dataset.id)];if(!c)return;U.change(b=>{b.features.browserSync.choices[c.key]={side:el.dataset.side,token:c.token};b.features.browserSync.conflicts=b.features.browserSync.conflicts.filter(x=>x.key!==c.key)},{sync:false});conflicts=conflicts.filter(x=>x.key!==c.key);U.onSyncStatus();queue();}
};
async function submit(form,fd){if(form.id==='house-signin')return run(async()=>{const db=await init(),email=String(fd.get('email')).trim(),redirect=new URL('index.html',location.href).href,{error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:false}});if(error)throw error;statusChanged('Check your email and open the newest sign-in link in this browser.');});if(form.id==='house-select')return run(()=>preview(String(fd.get('house'))));if(form.id==='house-join')return run(async()=>{const code=String(fd.get('code')).trim();if(!code)throw Error('Paste an invitation code.');let data;try{data=await callNew('join',{invite_code:code});}catch(e){if(!/Invite expired or invalid/i.test(e.message))throw e;data=await call('join',{invite_code:code});}await refreshHouses();statusChanged('Invitation accepted. Preview the shared house before opening it.');if(data.houseId)await preview(data.houseId);});}
const api={init,panel,actions,submit,queue,sync,people:()=>people,transition:S.transition,_reconcile:reconcile,_protectRemoteRows:protectRemoteRows};window.TidySharing=api;conflicts=U.getBoard().features.browserSync?.conflicts||[];window.dispatchEvent(new Event('tidy-sharing-ready'));setInterval(()=>{if(!document.hidden&&session&&U.getBoard().features.browserSync)sync().catch(()=>{})},20000);window.addEventListener('online',queue);document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});if(localStorage.getItem(AUTH_KEY))init().catch(e=>statusChanged(e.message));U.onSyncStatus();
})();
