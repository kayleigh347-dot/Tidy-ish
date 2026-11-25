/* Workload A: local occasion plans and lifecycle. No network or implicit gift
 * completion. All persistence is the caller's responsibility. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./model.js'):root.TidyModel,typeof module==='object'&&module.exports?require('./seasonal-core.js'):root.TidySeasonal);if(typeof module==='object'&&module.exports)module.exports=api;else root.TidySeasonalWorkflow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M,S){'use strict';
const fail=message=>{throw Error(message+' No data changed.');};
const copy=M.clone, id=M.uid;
const fields=['eventDate','preparationStartDate','endDate'];
const windowOf=o=>Object.fromEntries(fields.map(k=>[k,o[k]]));
const phase=(o,today)=>S.windowPhase(o,today,{startInclusive:true,endInclusive:true});
const pairs=b=>b.features.occasionOccurrences.map(o=>({o,t:b.features.occasionTemplates.find(t=>t.id===o.templateId)}));
const get=(b,oid)=>{const p=pairs(b).find(x=>x.o.id===oid);if(!p)fail('Occasion not found.');return p;};
const defaults={tasksEnabled:true,decorationsEnabled:true,countdown:false,celebrated:false};
// Hydrated plan fields exist only in a disposable working copy. The persisted
// legacy template/occurrence shapes remain unchanged for source rollback.
function hydrate(input,readOnly=false){const b=readOnly?{...input,features:{...input.features,occasionTemplates:input.features.occasionTemplates.map(x=>({...x})),occasionOccurrences:input.features.occasionOccurrences.map(x=>({...x}))}}:copy(input),store=b.features.occasionPlans;if(store){for(const x of b.features.occasionTemplates){const plan=store.templates.find(r=>r.id===x.id);if(plan)x.workflow=plan.plan;}for(const x of b.features.occasionOccurrences){const plan=store.occurrences.find(r=>r.id===x.id);if(plan)x.workflow=plan.plan;}delete b.features.occasionPlans;}return b;}
function dehydrate(b){const store={templates:[],occurrences:[]};for(const [kind,key] of [['templates','occasionTemplates'],['occurrences','occasionOccurrences']])for(const x of b.features[key])if(x.workflow){store[kind].push({id:x.id,plan:x.workflow});delete x.workflow;}if(store.templates.length||store.occurrences.length)b.features.occasionPlans=store;return b;}
function inspect(b,oid){const o=b.features.occasionPlans?.occurrences.find(x=>x.id===oid)?.plan;return o?copy(o):null;}
function hasPlans(b){return !!b.features.occasionPlans?.templates?.length;}
// Old local-only plans are not implicitly uploaded when joining a house.
// Only an empty connected board or a plan already bound to that household
// can participate. Existing local plans require an explicit migration flow.
function shareReady(b){const f=b.features,state=f.browserSync;if(!state)return true;if(!state.account||!state.house||!Array.isArray(state.base?.tasks)||!state.native?.features)return false;if(f.seasonalSharedHouse===state.house)return true;return !f.occasionTemplates.length&&!f.occasionOccurrences.length&&!(state.base.settings||[]).some(r=>r.id==='tidy-seasonal-plans-v1');}
function requireShare(b){if(!shareReady(b))fail('Seasonal household sharing needs a current household copy or review of existing local-only plans.');}


// Explicit date rule selection. Fixed-day leap handling remains explicit;
// no February 29 substitution is silently selected for an existing occasion.
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return S.fixedDate(y,Math.floor(n/31),n%31+1,'reject');}
function eventFor(rule,y,ref,leap){if(rule==='easter')return easter(y);if(rule==='uk-mothers-day')return S.shiftDays(easter(y),-21);if(rule==='uk-fathers-day'){const d=S.fixedDate(y,6,1,'reject'),dow=new Date(d+'T12:00:00Z').getUTCDay();return S.shiftDays(d,(7-dow)%7+14);}return S.fixedDate(y,Number(ref.slice(5,7)),Number(ref.slice(8,10)),leap);}
const PRESETS={
 christmas:{name:'Christmas',month:12,day:25,start:-56,endFixed:[1,30,1],countdown:true,items:[['Buy gifts',-56,true,'buy'],['Sort children’s toys',-56,true],['Organise decorations',-28,true],['Put up decorations','november',true,'normal',['Check decorations','Put up tree','Decorate tree']],['Wrapping supplies',-21,true],['Wrap gifts',0,true,'wrap'],['Food shopping',-7,false]]},
 birthday:{name:'Birthday',start:-28,end:1,countdown:true,items:[['Buy gifts',-28,true,'buy'],['Plan activities',-28,true],['Organise cake',-7,true],['Wrap gifts',0,true,'wrap'],['Organise celebration',-21,false],['Party supplies',-28,false],['Decorations',-1,false]]},
 halloween:{name:'Halloween',month:10,day:31,start:-28,end:1,items:[['Costumes',-28,true],['Sweets',-7,true],['Pumpkins',-14,true,'normal',['Buy pumpkins','Carve pumpkins']],['Plan activities',-14,true],['Put up decorations',-14,false],['Take down decorations',1,false]]},
 valentines:{name:'Valentine’s Day',month:2,day:14,start:-14,end:1,countdown:true,items:[['Buy gifts and cards',-14,true,'buy'],['Wrap gifts',0,true,'wrap'],['Plan activities',-14,false]]},
 easter:{name:'Easter',rule:'easter',start:-21,end:1,items:[['Buy Easter eggs',-21,true],['Activities',-14,false],['Decorations',-14,false],['Take down decorations',7,false]]},
 newyear:{name:'New Year',month:1,day:1,start:-2,end:1,items:[['Take down Christmas decorations',0,true,'teardown'],['Plan activities',-14,false],['Supplies',-7,false],['Resolutions',-7,false]]},
 mothers:{name:'Mother’s Day',rule:'uk-mothers-day',start:-14,end:1,items:[['Buy gifts and cards',-14,true,'buy'],['Wrap gifts',0,true,'wrap'],['Plan activities',-14,false]]},
 fathers:{name:'Father’s Day',rule:'uk-fathers-day',start:-14,end:1,items:[['Buy gifts and cards',-14,true,'buy'],['Wrap gifts',0,true,'wrap'],['Plan activities',-14,false]]},
 anniversary:{name:'Anniversary',start:-14,end:1,items:[['Buy gifts and cards',-14,true,'buy'],['Wrap gifts',0,true,'wrap'],['Plan celebration',-28,false]]},custom:{name:'Custom occasion',items:[]}
};
function preset(key,eventDate){const p=PRESETS[key];if(!p)fail('Unknown occasion preset.');const y=Number(eventDate.slice(0,4));S.windowOffsets({eventDate,preparationStartDate:eventDate,endDate:eventDate});const window={eventDate,preparationStartDate:S.shiftDays(eventDate,p.start||0),endDate:p.endFixed?S.fixedDate(y+p.endFixed[2],p.endFixed[0],p.endFixed[1],'reject'):S.shiftDays(eventDate,p.end||0)};return {...window,name:p.name,countdown:!!p.countdown,items:p.items.map(([title,offset,selected,role='normal',children=[]])=>({title,startDate:offset==='november'?S.novemberLastWeek(y).start:S.shiftDays(eventDate,offset),selected,repeat:true,role,children:[...children]}))};}
function legacyItems(b,o,t){return (t.taskDefinitions||[]).map(d=>{const link=(o.taskLinks||[]).find(l=>l.definitionId===d.id),task=b.tasks.find(x=>x.id===link?.taskId);const date=task?.nextDue||task?.dueDate||'';return {definitionId:d.id,taskId:link?.taskId||'',title:task?.title||d.title,selected:!!link,startDate:date>=o.preparationStartDate&&date<=o.endDate?date:o.preparationStartDate,repeat:t.recurrence==='annual',role:'normal',children:[]};});}
function editableHydrated(b,oid){const {o,t}=get(b,oid),w=o.workflow,tw=t.workflow;return {id:o.id,templateId:t.id,name:w?.name||t.name,recurrence:t.recurrence,...windowOf(o),preset:tw?.preset||'custom',dateRule:tw?.dateRule||'fixed',leapPolicy:tw?.leapPolicy||'reject',annualEnabled:tw?.annualEnabled!==false,...defaults,...(w?.settings||{}),items:w?w.items.map(row=>({...copy(row),title:b.tasks.find(t=>t.id===row.taskId)?.title||row.title,startDate:S.shiftDays(o.eventDate,row.offset),reminderDate:row.reminderOffset===null?'':S.shiftDays(o.eventDate,row.reminderOffset??row.offset)})):legacyItems(b,o,t)};}
const selectedLinks=items=>items.filter(r=>r.selected&&r.taskId).map(r=>({definitionId:r.definitionId,taskId:r.taskId}));
function validItemWindow(o,row){try{return S.relativeTaskStart(o,row.offset);}catch{return '';}}
function configure(b,oid,draft,scope='this'){
 if(!['this','every'].includes(scope))fail('Choose this year or every year.');
 requireShare(b);
 const n=hydrate(b);if(n.features.browserSync)n.features.seasonalSharedHouse=n.features.browserSync.house;
 const {o,t}=get(n,oid),prior=editableHydrated(n,oid),oldItems=prior.items;
 if(o.workflow?.closed)fail('Ended occasion history is read-only.');
 if(typeof draft.name!=='string'||!draft.name.trim()||draft.name.trim().length>100)fail('Enter an occasion name.');
 if((scope==='every'||!t.workflow)&&n.features.occasionTemplates.some(x=>x.id!==t.id&&x.name.trim().toLocaleLowerCase()===draft.name.trim().toLocaleLowerCase()))fail('An occasion with this name already exists.');
 if(!Array.isArray(draft.items)||draft.items.length>200)fail('Invalid task list.');
 const window=windowOf(draft);S.windowOffsets(window);
 if(draft.recurrence!==t.recurrence){if(!['annual','one-off'].includes(draft.recurrence)||scope!=='every'||n.features.occasionOccurrences.some(x=>x.templateId===t.id&&x.id!==o.id))fail('Change recurrence for a single occasion using Every year; for existing annual history, disable future repetition instead.');t.recurrence=draft.recurrence;}
 const nextKey=JSON.stringify([t.id,t.recurrence,t.recurrence==='annual'?Number(window.eventDate.slice(0,4)):o.id]);
 if(n.features.occasionOccurrences.some(x=>x.id!==o.id&&x.occurrenceKey===nextKey))fail('An occurrence for this year already exists.');
 const defs=t.taskDefinitions||(t.taskDefinitions=[]),ids=new Set(),taskIds=new Set(),items=[];
 for(const row of draft.items){
  if(typeof row.title!=='string'||!row.title.trim()||row.title.trim().length>160||typeof row.selected!=='boolean'||typeof row.repeat!=='boolean'||!['normal','buy','wrap','teardown'].includes(row.role||'normal'))fail('Invalid task definition.');
  const old=oldItems.find(x=>x.definitionId===row.definitionId),definitionId=old?.definitionId||id();
  if(ids.has(definitionId))fail('Duplicate task definition.');ids.add(definitionId);
  const priorLink=old?.definitionId&&t.workflow?.items.find(x=>x.definitionId===definitionId)?.taskId;
  let taskId=old?.taskId||row.taskId||priorLink||'',task=n.tasks.find(x=>x.id===taskId);
  if(taskId&&(!task||task.archived)&&taskId!==old?.taskId&&taskId!==priorLink)fail('Selected task no longer exists.');
  if(taskId&&taskId!==old?.taskId&&taskId!==priorLink&&task&&(task.side||task.scheduleMakerManaged||task.tidyScheduleV3||task.littleOften||!(task.section==='Seasonal'||task.seasonMonth)))fail('Choose an existing Seasonal task, not a task managed by another system.');
  if(taskId&&taskIds.has(taskId))fail('A task cannot be selected twice.');
  if(taskId)taskIds.add(taskId);
  if(task&&row.taskId&&old?.taskId&&row.taskId!==old.taskId)fail('Existing task links cannot be silently replaced.');
  if(!Array.isArray(row.children||[])||(row.children||[]).some(x=>typeof x!=='string'||!x.trim()||x.length>160))fail('Invalid subtask names.');
  const offset=S.daysBetween(window.eventDate,row.startDate),reminderOffset=row.reminderDate===''?null:S.daysBetween(window.eventDate,row.reminderDate||row.startDate);
  if(row.selected&&(!validItemWindow(window,{offset})||(reminderOffset!==null&&!validItemWindow(window,{offset:reminderOffset}))))fail('Selected task start and reminder dates must be inside the occasion window.');
  if(row.selected&&!taskId){if(n.tasks.some(t=>!t.archived&&t.section==='Seasonal'&&t.title.trim().toLocaleLowerCase()===row.title.trim().toLocaleLowerCase()&&!pairs(n).some(({o:x})=>x.id!==oid&&x.workflow?.items.some(r=>r.taskId===t.id))))fail('A Seasonal task named '+row.title+' already exists. Choose that task instead of creating a duplicate.');task=M.task({title:row.title.trim(),section:'Seasonal',taskType:'maintenance',messImpact:'small',showInSuggestions:false});task.children=(row.children||[]).map(title=>M.child({title,parentId:task.id}));M.add(n,task);taskId=task.id;taskIds.add(taskId);}
  // A linked task is a shared identity, including its canonical name. Occasion
  // edits may change its schedule/selection, not rename the underlying task.
  const title=task?.title||old?.taskId&&old.title||row.title.trim();
  if(!defs.some(d=>d.id===definitionId))defs.push({id:definitionId,title});
  items.push({definitionId,taskId,title,selected:row.selected,offset,reminderOffset,repeat:row.repeat,role:row.role||'normal',children:copy(row.children||[])});
 }
 const settings={};for(const k of Object.keys(defaults)){if(typeof draft[k]!=='boolean')fail('Invalid occasion settings.');settings[k]=draft[k];}
 const dateRule=draft.dateRule||'fixed',leapPolicy=draft.leapPolicy||'reject',presetKey=draft.preset||'custom';
 if(!Object.hasOwn(PRESETS,presetKey)||!['fixed','easter','uk-mothers-day','uk-fathers-day'].includes(dateRule)||!['reject','feb28','mar1'].includes(leapPolicy)||typeof draft.annualEnabled!=='boolean')fail('Invalid recurrence settings.');
 const existingActivated=o.workflow?.activated||[],history=o.workflow?.history||[];
 // A deselected item retains the original task identity. Never delete records.
 // Keep removed definitions in the historical template catalogue.
 for(const old of oldItems.filter(x=>!ids.has(x.definitionId))){const offset=S.daysBetween(prior.eventDate,old.startDate);items.push({...old,offset,selected:false});delete items.at(-1).startDate;delete items.at(-1).reminderDate;}
 const wasActive=existingActivated.filter(a=>!items.some(r=>r.definitionId===a.definitionId&&r.selected));
 for(const a of wasActive){if(!a.wasDoing&&shareReady(n)&&!pairs(n).some(({o:x})=>x.id!==oid&&!x.workflow?.closed&&x.workflow?.activated.some(r=>r.taskId===a.taskId&&!r.suspended))&&n.tasks.some(x=>x.id===a.taskId&&x.doing)){M.select(n,a.taskId,false);a.suspended=true;}}
 if(!t.workflow||scope==='every'){
  t.name=draft.name.trim();t.workflow={reference:copy(window),preset:presetKey,dateRule,leapPolicy,annualEnabled:draft.annualEnabled,settings:{...settings,celebrated:false},items:copy(items)};
 }else if(t.recurrence==='annual'&&(dateRule!==t.workflow.dateRule||leapPolicy!==t.workflow.leapPolicy||draft.annualEnabled!==t.workflow.annualEnabled))fail('Change recurring settings with Every year.');
 // This-year selection may allocate an identity without changing recurring choices.
 if(scope==='this'&&t.workflow)for(const row of items){const ref=t.workflow.items.find(r=>r.definitionId===row.definitionId);if(ref&&!ref.taskId&&row.taskId)ref.taskId=row.taskId;}
 // Old occurrences keep their concrete dates and choices. Future generated
 // occurrences not yet started can take the new recurring configuration.
 o.workflow={name:draft.name.trim(),settings,items,activated:existingActivated,history,closed:false,override:scope==='this'&&t.recurrence==='annual',reminded:copy(o.workflow?.reminded||[])};
 Object.assign(o,window,{occurrenceKey:nextKey,taskLinks:selectedLinks(items)});
 if(scope==='every'&&t.recurrence==='annual')for(const other of n.features.occasionOccurrences.filter(x=>x.templateId===t.id&&x.id!==o.id&&x.eventDate>o.eventDate&&!x.workflow?.activated?.length&&!x.workflow?.closed&&!x.workflow?.override)){
  const y=Number(other.eventDate.slice(0,4));let date;try{date=eventFor(dateRule,y,window.eventDate,leapPolicy);}catch{continue;}
  const w=S.shiftWindow(window,date);Object.assign(other,w,{workflow:{name:t.name,settings:{...settings,celebrated:false},items:copy(items.filter(x=>x.repeat)),activated:[],history:[],closed:false,override:false,reminded:[]}});other.taskLinks=selectedLinks(other.workflow.items);
 }
 n.features.seasonalEditedAt=new Date().toISOString();
 return M.normalize(dehydrate(n));
}
function create(b,draft){requireShare(b);const n=M.createOccasion(b,{name:draft.name,recurrence:draft.recurrence,...windowOf(draft),taskIds:[],optionalTitles:[]}),o=n.features.occasionOccurrences.at(-1);if(n.features.browserSync)n.features.seasonalSharedHouse=n.features.browserSync.house;return configure(n,o.id,draft,'every');}
function recurring(b,t,today,warnings){
 if(t.recurrence!=='annual'||!t.workflow||!t.workflow.annualEnabled)return;
 const old=b.features.occasionOccurrences.filter(o=>o.templateId===t.id),ref=t.workflow.reference,refYear=Number(ref.eventDate.slice(0,4));
 // Existing ended years are historical facts, not fabricated occurrences.
 // Generate a current active/upcoming occurrence and, after expiry, the next.
 const y=Number(today.slice(0,4));const years=[y-1,y,y+1].filter(n=>n>=refYear&&n<=9999);
 for(const year of years){const key=JSON.stringify([t.id,'annual',year]);if(old.some(o=>o.occurrenceKey===key))continue;
  let event;try{event=eventFor(t.workflow.dateRule,year,ref.eventDate,t.workflow.leapPolicy);}catch{warnings.push(`${t.name}: choose a leap-day rule for ${year}.`);continue;}
  const window=S.shiftWindow(ref,event);if(window.endDate<today)continue;
  // Do not accumulate future years while there is already an unended occurrence,
  // unless the next occurrence is itself active (overlapping windows).
  if(window.preparationStartDate>today&&old.some(o=>o.endDate>=today))continue;
  const items=copy(t.workflow.items.filter(r=>r.repeat));const occurrence={id:b.features.browserSync?'seasonal-year:'+t.id+':'+year:id(),templateId:t.id,occurrenceKey:key,...window,taskLinks:selectedLinks(items),workflow:{name:t.name,settings:{...t.workflow.settings,celebrated:false},items,activated:[],history:[],closed:false,override:false,reminded:[]}};
  b.features.occasionOccurrences.push(occurrence);old.push(occurrence);
 }
}
function active(b,today=M.date()){return pairs(b).filter(({o})=>o.workflow&&!o.workflow.closed&&phase(o,today)==='active').sort((a,z)=>a.o.eventDate.localeCompare(z.o.eventDate));}
// Christmas gift records remain the sole source of receipt/wrapping state.
// Legacy bought gifts already appeared in Needs wrapped: preserve that meaning.
function received(g){return g.status==='wrapped'||g.status==='bought'&&g.receiptStatus!=='ordered';}
function needsWrap(g){return received(g)&&g.status!=='wrapped'&&g.noWrapping!==true;}
function christmasContext(b,oid,today=M.date()){
 const o=b.features.occasionOccurrences.find(x=>x.id===oid),t=o&&b.features.occasionTemplates.find(x=>x.id===o.templateId),plan=t&&(t.workflow||b.features.occasionPlans?.templates.find(x=>x.id===t.id)?.plan),w=o&&(o.workflow||b.features.occasionPlans?.occurrences.find(x=>x.id===o.id)?.plan);
 if(!o||plan?.preset!=='christmas'||!w)return null;
 const linked=b.features.gifts.filter(g=>g.occasion==='christmas'&&(o.giftIds||[]).includes(g.id)),gifts=linked.filter(g=>b.features.occasionOccurrences.filter(x=>(x.giftIds||[]).includes(g.id)).length===1);
 const available=b.features.gifts.filter(g=>g.occasion==='christmas'&&g.eventDate===o.eventDate&&!b.features.occasionOccurrences.some(x=>(x.giftIds||[]).includes(g.id)));
 return {o,w,gifts,available,conflicts:linked.length-gifts.length,readOnly:w.closed||phase(o,today)==='ended',active:phase(o,today)==='active'};
}
function christmasGiftChange(input,oid,action,data,today=M.date()){
 const b=copy(input),ctx=christmasContext(b,oid,today);if(!ctx||ctx.readOnly)fail('Christmas occasion is missing or ended.');
 const {o}=ctx,prior=new Set(ctx.gifts.filter(needsWrap).map(g=>g.id)),g=ctx.gifts.find(x=>x.id===data.id);
 const now=new Date().toISOString();
 if(action==='link'){
  const target=ctx.available.find(x=>x.id===data.id);if(!target)fail('Gift is already linked or does not match this Christmas date.');
  o.giftIds=[...(o.giftIds||[]),target.id];if(target.recipientId&&b.features.giftPeople.some(p=>p.id===target.recipientId))o.recipientIds=[...new Set([...(o.recipientIds||[]),target.recipientId])];
 }else if(action==='save'){
  if(data.id&&!g)fail('Gift no longer belongs to this occasion.');
  const person=b.features.giftPeople.find(p=>p.id===data.recipientId&&p.tracker!==false),title=String(data.title||'').trim(),price=Number(data.price);
  if(!person||!title||title.length>160||data.price===''||!Number.isFinite(price)||price<0||!['ordered','received'].includes(data.receiptStatus)||typeof data.noWrapping!=='boolean')fail('Enter a recipient, gift name, price and receipt status.');
  if(g?.status==='wrapped'&&data.receiptStatus==='ordered')fail('Unwrap the gift before changing its receipt status.');
  const row={...g,id:g?.id||id(),occasion:'christmas',recipientId:person.id,recipient:person.name,title,price,budget:price,spent:price,eventDate:g?.eventDate||o.eventDate,status:g?.status==='wrapped'?'wrapped':'bought',receiptStatus:data.receiptStatus,noWrapping:data.noWrapping,createdAt:g?.createdAt||now,updatedAt:now};
  if(data.receiptStatus==='ordered')row.orderedAt=g?.receiptStatus==='ordered'&&g.orderedAt?g.orderedAt:today;
  else delete row.orderedAt;
  if(g)b.features.gifts[b.features.gifts.indexOf(g)]=row;else{b.features.gifts.push(row);o.giftIds=[...(o.giftIds||[]),row.id];}
  o.recipientIds=[...new Set([...(o.recipientIds||[]),person.id])];
 }else if(action==='delete'){
  if(!g)fail('Gift no longer belongs to this occasion.');b.features.gifts=b.features.gifts.filter(x=>x.id!==g.id);o.giftIds=(o.giftIds||[]).filter(x=>x!==g.id);
 }else if(action==='receive'){
  if(!g||g.status!=='bought'||g.receiptStatus!=='ordered')fail('Only ordered gifts can be marked received.');g.receiptStatus='received';delete g.orderedAt;g.updatedAt=now;
 }else if(action==='wrap'){
  if(!g||!(needsWrap(g)||g.status==='wrapped'&&g.noWrapping!==true))fail('This gift is not eligible for wrapping.');g.status=g.status==='wrapped'?'bought':'wrapped';g.receiptStatus='received';delete g.orderedAt;g.updatedAt=now;
 }else fail('Unknown gift action.');
 // Each direct gift or receipt action also carries a Seasonal edit timestamp.
 // Sync compares saved edits, rather than a later refresh time.
 b.features.seasonalEditedAt=now;
 const next=reconcile(b,today).board,after=christmasContext(next,oid,today);
 if(shareReady(next)&&after?.active&&after.w.settings.tasksEnabled&&after.gifts.some(g=>needsWrap(g)&&!prior.has(g.id))){
  for(const r of after.w.items.filter(r=>r.selected&&r.role==='wrap')){
   const a=after.w.activated.find(x=>x.definitionId===r.definitionId&&!x.suspended),task=next.tasks.find(t=>t.id===r.taskId&&!t.archived);
   // A real completed wrapping cycle can be reopened, never an unrelated task
   // or previous year's completion. Undo of the next completion preserves wins.
   if(a&&task?.done&&next.features.wins.some(w=>(w.rootId===task.id||w.taskId===task.id)&&!a.priorWinIds.includes(w.id))){M.reactivate(next,task.id);M.select(next,task.id,true);}
  }
 }
 return next;
}
function eligible(b,o,row,today){if(!o.workflow.settings.tasksEnabled||!row.selected||!row.taskId)return false;if(row.role==='wrap'){const ctx=christmasContext(b,o.id,today);return !!ctx&&(ctx.gifts.some(needsWrap)||o.workflow.activated.some(a=>a.definitionId===row.definitionId));}const start=validItemWindow(o,row);if(!start||today<start)return false;
 if(row.role==='teardown'){const y=Number(o.eventDate.slice(0,4))-1;if(!pairs(b).some(({o:other,t})=>t.workflow?.preset==='christmas'&&Number(other.eventDate.slice(0,4))===y&&other.workflow?.settings.celebrated))return false;}
 return true;}
function snapshot(b,a){const t=b.tasks.find(x=>x.id===a.taskId);return {definitionId:a.definitionId,taskId:a.taskId,done:!!t?.done,completedAt:t?.completedAt||'',children:(t?.children||[]).map(c=>({id:c.id,done:!!c.done})),winIds:b.features.wins.filter(w=>(w.rootId===a.taskId||w.taskId===a.taskId)&&!(a.priorWinIds||[]).includes(w.id)).map(w=>w.id)};}
function reconcile(input,today=M.date()){
 const b=hydrate(input),warnings=[];S.windowOffsets({eventDate:today,preparationStartDate:today,endDate:today});
 // Household coordination is separate (Workload B). Do not reset or select
 // shared task state from local-only occasion records on a synced household.
 if(!shareReady(b)){if(pairs(b).some(({o})=>o.workflow))warnings.push('Automatic Seasonal task changes require Seasonal household sharing to be ready.');return {board:copy(input),warnings,changed:false};}
 for(const t of b.features.occasionTemplates)recurring(b,t,today,warnings);
 const sorted=pairs(b).filter(({o})=>o.workflow).sort((a,z)=>a.o.eventDate.localeCompare(z.o.eventDate));
 for(const {o} of sorted){const w=o.workflow;if(w.closed||phase(o,today)!=='ended')continue;
  w.history=w.activated.map(a=>snapshot(b,a));
  for(const a of w.activated){if(!a.wasDoing&&!sorted.some(({o:x})=>x.id!==o.id&&!x.workflow.closed&&phase(x,today)==='active'&&x.workflow.activated.some(r=>r.taskId===a.taskId)))M.select(b,a.taskId,false);}
  w.closed=true;
 }
 const held=new Set(),pending=[];
 // Keep an existing eligible owner ahead of a suspended overlapping record.
 for(const {o} of sorted){const w=o.workflow;if(w.closed)continue;
  for(const a of w.activated){const row=w.items.find(r=>r.definitionId===a.definitionId),due=phase(o,today)==='active'&&row&&eligible(b,o,row,today);pending.push({a,due});if(due&&!a.suspended)held.add(a.taskId);}
 }
 for(const {a,due} of pending){if(!due){if(!a.wasDoing&&!held.has(a.taskId)&&b.tasks.some(t=>t.id===a.taskId&&t.doing))M.select(b,a.taskId,false);a.suspended=true;}}
 for(const {a,due} of pending){if(due&&a.suspended&&!held.has(a.taskId)){M.select(b,a.taskId,true);delete a.suspended;held.add(a.taskId);}}
 for(const {o} of active(b,today)){const w=o.workflow;
  for(const row of w.items){if(!eligible(b,o,row,today)||w.activated.some(a=>a.definitionId===row.definitionId))continue;
   const task=b.tasks.find(x=>x.id===row.taskId&&!x.archived);if(!task){warnings.push(`${w.name}: ${row.title} is missing.`);continue;}
   if(held.has(task.id)){warnings.push(`${w.name}: ${row.title} is already active in another occasion.`);continue;}
   if(task.side||task.scheduleMakerManaged||task.tidyScheduleV3||task.littleOften){warnings.push(`${w.name}: ${row.title} is managed by another task system.`);continue;}
   const previous=sorted.filter(({o:x})=>x.id!==o.id&&x.templateId===o.templateId&&x.eventDate<o.eventDate&&x.workflow.closed&&x.workflow.activated.some(a=>a.definitionId===row.definitionId&&a.taskId===task.id)).at(-1)?.o;
   if(previous&&row.repeat){const prior=previous.workflow.history.find(h=>h.definitionId===row.definitionId),activation=previous.workflow.activated.find(a=>a.definitionId===row.definitionId),known=new Set([...(prior?.winIds||[]),...(activation?.priorWinIds||[])]);if(b.features.wins.some(w=>(w.rootId===task.id||w.taskId===task.id)&&!known.has(w.id))){warnings.push(`${w.name}: ${row.title} has newer completion history; review it before resetting.`);continue;}if(task.startedAt||task.children.some(c=>c.startedAt)){warnings.push(`${w.name}: stop the existing timer before resetting ${row.title}.`);continue;}
    if(task.done)M.reactivate(b,task.id);else if(task.children.some(c=>c.done)){task._canUndoFamily=false;delete task._finishState;delete task._completionIds;task.undoChildren=[];for(const c of task.children){c.done=false;c.elapsed=0;delete c._winId;}task.elapsed=0;}
   }
   // A first eligible Christmas wrapping activation may encounter a task
   // already completed before any gift arrived. Start a fresh cycle without
   // undoing old wins; subsequent reconciles skip the existing activation.
   // Keep the annual-history and overlapping-owner guards above in force.
   if(row.role==='wrap'&&task.done){if(task.startedAt||task.children.some(c=>c.startedAt)){warnings.push(`${w.name}: stop the existing timer before reopening ${row.title}.`);continue;}M.reactivate(b,task.id);}
   const wasDoing=!!task.doing;M.select(b,task.id,true);w.activated.push({definitionId:row.definitionId,taskId:task.id,wasDoing,priorWinIds:b.features.wins.filter(w=>w.rootId===task.id||w.taskId===task.id).map(w=>w.id)});held.add(task.id);
  }
 }
 const stable=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const out=dehydrate(b);return {board:out,warnings,changed:stable(out)!==stable(input)};
}
function activeGroups(input,today=M.date()){
 const b=hydrate(input,true),seen=new Set();return active(b,today).map(({o,t})=>({id:o.id,name:o.workflow.name||t.name,eventDate:o.eventDate,countdown:o.workflow.settings.countdown,tasks:o.workflow.items.filter(r=>eligible(b,o,r,today)&&o.workflow.activated.some(a=>a.definitionId===r.definitionId&&!a.suspended)).map(r=>b.tasks.find(x=>x.id===r.taskId&&x.doing&&!x.archived&&!M.paused(x,today))).filter(x=>x&&!seen.has(x.id)&&seen.add(x.id))}));
}
function birthdayMarks(input){if(!hasPlans(input))return [];const b=hydrate(input,true);return pairs(b).filter(({o,t})=>t.workflow?.preset==='birthday'&&o.workflow).map(({o,t})=>({id:o.id,date:o.eventDate,name:o.workflow.name||t.name}));}
function giftRole(input,taskId,today=M.date()){if(!hasPlans(input))return null;const b=hydrate(input,true);for(const {o,t} of pairs(b).filter(({o})=>o.workflow&&!o.workflow.closed&&phase(o,today)!=='ended').sort((a,z)=>Number(phase(z.o,today)==='active')-Number(phase(a.o,today)==='active')||a.o.eventDate.localeCompare(z.o.eventDate))){const row=o.workflow.items.find(r=>r.selected&&r.taskId===taskId&&['buy','wrap'].includes(r.role));if(row)return {role:row.role,preset:t.workflow?.preset||'custom',occurrenceId:o.id};}return null;}
function dueReminders(input,today=M.date()){const b=hydrate(input,true),out=[],seen=new Set();if(!shareReady(b))return out;for(const {o} of active(b,today)){const w=o.workflow;if(!w.settings.tasksEnabled)continue;for(const row of w.items){if(!row.selected||!row.taskId||row.role==='wrap'||row.role==='teardown'||row.reminderOffset===null||(w.reminded||[]).includes(row.definitionId)||seen.has(row.taskId))continue;const due=validItemWindow(o,{offset:row.reminderOffset??row.offset}),task=b.tasks.find(t=>t.id===row.taskId&&!t.archived&&!t.done);if(due&&due<=today&&task){out.push({occurrenceId:o.id,definitionId:row.definitionId,taskId:row.taskId,title:task.title,name:w.name});seen.add(row.taskId);}}}return out;}
function markReminders(input,rows,today=M.date()){const b=hydrate(input),due=dueReminders(input,today);for(const r of rows){if(!due.some(x=>x.occurrenceId===r.occurrenceId&&x.definitionId===r.definitionId))continue;const {o}=get(b,r.occurrenceId);o.workflow.reminded||=[];if(!o.workflow.reminded.includes(r.definitionId))o.workflow.reminded.push(r.definitionId);}return dehydrate(b);}
function editable(b,oid){return editableHydrated(hydrate(b,true),oid);}
return Object.freeze({shareReady,PRESETS,preset,eventFor,phase,editable,create,configure,reconcile,activeGroups,inspect,hasPlans,birthdayMarks,giftRole,dueReminders,markReminders,christmasContext,christmasGiftChange,received,needsWrap});
});
