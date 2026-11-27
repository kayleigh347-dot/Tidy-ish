/* Tidyish data-model foundation. No bundled tasks, account calls, or silent imports.
 * A saved board with unfamiliar/invalid identity data is rejected, never overwritten.
 * This is a NEW implementation of the app's existing TidyModel interface. */
(function (root, create) {
  'use strict';
  const api = create();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TidyModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ID = 'tidyish-v1';
  const ROOMS = [
    ['entrance','Downstairs Entrance Landing','entrance-background.png','entrance-header.png'],
    ['hall','Main Landing','room-main-landing-spotless.png',null],
    ['penny','Penny’s Bedroom','room-penny-spotless.jpg','bedroom-cat-header.png'],
    ['master','Master Bedroom','room-master-spotless.png','bedroom-bigfoot-header.png'],
    ['bathroom','Bathroom','room-bathroom-spotless.png','bathroom-header.png'],
    ['kitchen','Kitchen','room-kitchen-spotless.png','kitchen-header.png'],
    ['living','Living Room','room-living-spotless.png','living-header(1).png'],
    ['cats','Upstairs Landing','room-cats-clean.png','cat-trays-header.png'],
    ['print','3D Printer Room','room-print-spotless.png','3d-printer-header.png'],
    ['storage','Storage Room','room-craft-spotless.png','storage-header.png']
  ];
  const STANDARD_UNIFORM = Object.freeze(['Gather uniform','Wash darks','Hang darks','Wash whites','Hang whites','Put away darks','Put away whites']);
  const sideTabs = Object.freeze([{id:'organisation',name:'Organisation'},{id:'hobby',name:'Crafts/hobbies'}]);
  const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  function clone(value) {return value === undefined ? undefined : JSON.parse(JSON.stringify(value));}
  function uid() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else for (let i=0;i<bytes.length;i++) bytes[i]=Math.floor(Math.random()*256);
    return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function parseDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const [y,m,d] = day.split('-').map(Number), out = new Date(Date.UTC(y,m-1,d,12));
    return out.getUTCFullYear()===y && out.getUTCMonth()===m-1 && out.getUTCDate()===d ? out : null;
  }
  function date(value) {
    if (value === undefined || value === null || value === '') {
      const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    }
    if (parseDay(value)) return value;
    if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
    throw Error('Invalid date. No saved work changed.');
  }
  // Recurrence advances from the UK calendar day of the recorded completion,
  // not the device's local date (which may be a different day at the same instant).
  const ukDayFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'});
  function ukCompletionDay(isoTimestamp) {
    const instant=new Date(isoTimestamp);
    if(!Number.isFinite(instant.getTime()))throw Error('Invalid completion timestamp. No saved work changed.');
    const parts=Object.fromEntries(ukDayFormat.formatToParts(instant).map(x=>[x.type,x.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function plus(day,amount) {
    const d=parseDay(day);if (!d || !Number.isInteger(Number(amount))) throw Error('Invalid calendar date or day count.');
    d.setUTCDate(d.getUTCDate()+Number(amount));return d.toISOString().slice(0,10);
  }
  function months(day,amount) {
    const d=parseDay(day);if (!d || !Number.isInteger(Number(amount))) throw Error('Invalid calendar date or month count.');
    const dayOfMonth=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+Number(amount));
    const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();
    d.setUTCDate(Math.min(dayOfMonth,max));return d.toISOString().slice(0,10);
  }
  const weekday=day=>parseDay(day)?.getUTCDay()||7;
  const cleanPercent=mess=>Math.round((100-Math.max(0,Math.min(100,Number(mess)||0)))*10)/10;
  // Keep phrasing separate from task data so changing wording never touches a saved board.
  const phrase = mess => typeof globalThis.TidyMessPhrase?.messPhrase === 'function'
    ? (globalThis.TidyMessPhrase.messPhrase(mess) || 'only way is up')
    : (cleanPercent(mess)===100?'✨Spotless✨':cleanPercent(mess)===0?'only way is up':'Messy-ish');
  function features() {
    return {
      items:[],wins:[],completionSummaries:[],templates:[],hiddenTemplates:[],hiddenCustomLibraryIds:[],
      laundry:[{slot:1,route:'',step:0,selected:false}],laundryCycleVersion:1,customLaundryCycles:[],customLaundryLoads:[],careDefinitions:[],
      wash:'Put a load on',railTransfer:'Put out washing',dryerTransfer:'Put in dryer',
      railFinish:'Move dry clothes from rail',dryerFinish:'Empty dryer',
      uniformSteps:[...STANDARD_UNIFORM],uniformIndex:-1,uniformWeek:'',uniformPaused:false,
      routines:[],occasionalScheduleDefaultsVersion:0,occasionalDefaultsInitialised:false,areas:{},tools:[],focusSessions:[],sideTabs:[],locationTabs:[{id:'household',name:'Household',order:0}],locationAreas:[],locationEntries:[],locationMoves:[],locationTrash:[],questTimings:[],taskDataArchives:[],dailyLogRecords:[],dailyLogRewashes:[],gifts:[],giftPeople:[],occasionTemplates:[],occasionOccurrences:[],activityDiary:{annotations:{},earned:[]},
      displayName:'Me',householdName:'',simple:false,sound:true,reduceMotion:false,pauseWandering:false,
      dialogue:'Gentle teasing',timeFactor:1,flexibleMode:false,revealed:[],rewardPrizeIndices:{},
      scheduleDraft:null,hiddenGuardians:[]
    };
  }
  function roomDefaults() {return ROOMS.map(([id,name,art,header])=>({id,name,art,header,mess:0,capacity:14,calibration:'',archived:false}));}
  function board() {return {version:1,rooms:roomDefaults(),tasks:[],doingOrder:[],features:features()};}
  function task(v={}) {
    return {id:uid(),room:'',title:'',children:[],done:false,doing:false,side:false,attention:false,
      tools:'',notes:'',repeatDays:0,repeatMonths:0,repeatWeekdays:[],repeatRestDays:[],nextDue:'',
      dueDate:'',elapsed:0,startedAt:0,undoChildren:[],skippedDates:[],calendarMoves:{},
      estimate:0,priority:3,rankPriorityWeight:1,rankRecencyWeight:1,rankMessWeight:1,conditionMode:'as-needed',sideKind:'organisation',assigned:'',assignedUserId:'',area:'',
      templateId:'',messImpact:'normal',effort:'',taskType:'cleaning',tags:[],checkDays:0,showInSuggestions:true,oneOff:false,warningEnabled:false,warningFirstDue:'',warningRepeatDays:0,warningAmberDays:1,warningRedDays:2,warningFlashingDays:3,warningNextDue:'',warningLastCompletedAt:'',createdAt:new Date().toISOString(),image:'',
      paused:false,pauseUntil:'',followupTitle:'',generatedFrom:'',touched:false,wasParent:false,...v};
  }
  function child(v={}) {return {id:uid(),title:'',done:false,parentId:'',tools:'',notes:'',estimate:0,elapsed:0,startedAt:0,followupTitle:'',oneOff:false,...v};}
  function reconcileChildren(previous,names) {
    const oldRows=Array.isArray(previous)?previous:[];
    const titles=(Array.isArray(names)?names:[]).map(value=>String(value||'').trim()).filter(Boolean);
    const remaining=new Set(oldRows.map(row=>row.id));
    const result=new Array(titles.length);
    // Match unchanged titles first, wherever they moved in the edited list.
    for(let i=0;i<titles.length;i++){
      const old=oldRows.find(row=>remaining.has(row.id)&&row.title===titles[i]);
      if(!old)continue;
      result[i]={...old,title:titles[i]};
      remaining.delete(old.id);
    }
    // Pair renamed rows in their original relative order. This preserves identity
    // when a list is reordered and one or more remaining titles are edited.
    const unmatchedOld=oldRows.filter(row=>remaining.has(row.id));
    const unmatchedNew=titles.map((title,index)=>({title,index})).filter(row=>!result[row.index]);
    let i=0;
    for(;i<unmatchedOld.length&&i<unmatchedNew.length;i++){
      const old=unmatchedOld[i],row=unmatchedNew[i];
      result[row.index]={...old,title:row.title};
    }
    for(;i<unmatchedNew.length;i++){
      const row=unmatchedNew[i];
      result[row.index]=child({title:row.title});
    }
    return result;
  }
  function unique(records,used,label) {
    for (const r of records) {
      if (!isObject(r) || typeof r.id!=='string' || !r.id.trim() || used.has(r.id))
        throw Error(`Invalid or duplicate ${label} ID. Original saved data was not changed.`);
      used.add(r.id);
    }
  }
  // Stage 1C2: local-only explicit links. Missing targets remain recorded,
  // never guessed by name, and never prevent an existing board from loading.
  const seasonalKeys = ['occasionTemplates','occasionOccurrences'];
  function validateOccasions(f) {
    const fail=label=>{throw Error('Invalid saved Seasonal '+label+'; original saved data preserved.');};
    const validId=v=>typeof v==='string'&&v.trim()===v&&v.length>0;
    const fields=(row,keys)=>isObject(row)&&Object.keys(row).every(k=>keys.includes(k));
    const uniqueIds=rows=>Array.isArray(rows)&&rows.every(validId)&&new Set(rows).size===rows.length;
    const templates=new Map(), occurrences=new Set(), keys=new Set();
    // Workload A adds optional plans to the existing schema. Old #69 records
    // remain byte-for-byte compatible; malformed new plans never overwrite a board.
    const validWindow=w=>fields(w,['eventDate','preparationStartDate','endDate'])&&['eventDate','preparationStartDate','endDate'].every(k=>parseDay(w[k]))&&w.preparationStartDate<=w.eventDate&&w.endDate>=w.eventDate;
    const validSettings=w=>fields(w,['tasksEnabled','decorationsEnabled','countdown','celebrated'])&&['tasksEnabled','decorationsEnabled','countdown','celebrated'].every(k=>typeof w[k]==='boolean');
    const validItems=(rows,defs,window)=>Array.isArray(rows)&&rows.length<=400&&rows.every(r=>fields(r,['definitionId','taskId','title','selected','offset','reminderOffset','repeat','role','children'])&&defs.has(r.definitionId)&&(r.taskId===''||validId(r.taskId))&&typeof r.title==='string'&&!!r.title.trim()&&r.title.length<=160&&typeof r.selected==='boolean'&&(!r.selected||!!r.taskId)&&Number.isSafeInteger(r.offset)&&Math.abs(r.offset)<=3652425&&(!r.selected||(r.offset>=Math.round((parseDay(window.preparationStartDate)-parseDay(window.eventDate))/86400000)&&r.offset<=Math.round((parseDay(window.endDate)-parseDay(window.eventDate))/86400000)))&&(r.reminderOffset===undefined||r.reminderOffset===null||Number.isSafeInteger(r.reminderOffset)&&Math.abs(r.reminderOffset)<=3652425&&(!r.selected||(r.reminderOffset>=Math.round((parseDay(window.preparationStartDate)-parseDay(window.eventDate))/86400000)&&r.reminderOffset<=Math.round((parseDay(window.endDate)-parseDay(window.eventDate))/86400000))))&&typeof r.repeat==='boolean'&&['normal','buy','wrap','teardown'].includes(r.role)&&Array.isArray(r.children)&&r.children.every(c=>typeof c==='string'&&!!c.trim()&&c.length<=160))&&uniqueIds(rows.map(r=>r.definitionId))&&uniqueIds(rows.map(r=>r.taskId).filter(Boolean));
    const validActivation=(a,defs)=>fields(a,['definitionId','taskId','wasDoing','suspended','priorWinIds'])&&defs.has(a.definitionId)&&validId(a.taskId)&&typeof a.wasDoing==='boolean'&&(a.suspended===undefined||typeof a.suspended==='boolean')&&(a.priorWinIds===undefined||uniqueIds(a.priorWinIds));
    const validHistory=(h,defs)=>fields(h,['definitionId','taskId','done','completedAt','children','winIds'])&&defs.has(h.definitionId)&&validId(h.taskId)&&typeof h.done==='boolean'&&typeof h.completedAt==='string'&&Array.isArray(h.children)&&h.children.every(c=>fields(c,['id','done'])&&validId(c.id)&&typeof c.done==='boolean')&&uniqueIds(h.winIds);
    // Keep plan metadata in a separate feature so #69 can still open an
    // upgraded board on a rollback. Do not change the legacy record shapes.
    const store=f.occasionPlans;
    if(store!==undefined&&(!fields(store,['templates','occurrences'])||!['templates','occurrences'].every(k=>Array.isArray(store[k])&&store[k].every(x=>fields(x,['id','plan'])&&validId(x.id)&&isObject(x.plan))&&uniqueIds(store[k].map(x=>x.id)))))fail('plan storage');
    const templatePlans=new Map((store?.templates||[]).map(x=>[x.id,x.plan])),occurrencePlans=new Map((store?.occurrences||[]).map(x=>[x.id,x.plan]));
    for(const name of seasonalKeys)if(!Array.isArray(f[name]))fail(name);
    for(const t of f.occasionTemplates){
      if(!fields(t,['id','name','recurrence','taskDefinitions'])||!validId(t.id)||templates.has(t.id)||typeof t.name!=='string'||!t.name.trim()||!['annual','one-off'].includes(t.recurrence))fail('template');
      if(t.taskDefinitions!==undefined&&(!Array.isArray(t.taskDefinitions)||
        !t.taskDefinitions.every(d=>fields(d,['id','title'])&&validId(d.id)&&typeof d.title==='string'&&d.title.trim())||
        !uniqueIds(t.taskDefinitions.map(d=>d.id))))fail('task definitions');
      if(templatePlans.has(t.id)){const w=templatePlans.get(t.id),defs=new Set((t.taskDefinitions||[]).map(d=>d.id));if(!fields(w,['reference','preset','dateRule','leapPolicy','annualEnabled','settings','items'])||!validWindow(w.reference)||!['custom','christmas','birthday','halloween','valentines','easter','newyear','mothers','fathers','anniversary'].includes(w.preset)||!['fixed','easter','uk-mothers-day','uk-fathers-day'].includes(w.dateRule)||!['reject','feb28','mar1'].includes(w.leapPolicy)||typeof w.annualEnabled!=='boolean'||!validSettings(w.settings)||!validItems(w.items,defs,w.reference))fail('recurring plan');}
      templates.set(t.id,t);
    }
    for(const o of f.occasionOccurrences){
      if(!fields(o,['id','templateId','occurrenceKey','eventDate','preparationStartDate','endDate','taskLinks','giftIds','recipientIds'])||!validId(o.id)||occurrences.has(o.id)||!validId(o.templateId)||!templates.has(o.templateId)||!parseDay(o.eventDate)||!parseDay(o.preparationStartDate)||!parseDay(o.endDate)||o.preparationStartDate>o.eventDate||o.endDate<o.eventDate)fail('occurrence');
      const t=templates.get(o.templateId);
      if(o.taskLinks!==undefined){
        const defs=new Set((t.taskDefinitions||[]).map(d=>d.id));
        if(!Array.isArray(o.taskLinks)||!o.taskLinks.every(l=>fields(l,['definitionId','taskId'])&&defs.has(l.definitionId)&&validId(l.taskId))||
          !uniqueIds(o.taskLinks.map(l=>l.definitionId))||!uniqueIds(o.taskLinks.map(l=>l.taskId)))fail('task links');
      }
      if(occurrencePlans.has(o.id)){const w=occurrencePlans.get(o.id),defs=new Set((t.taskDefinitions||[]).map(d=>d.id));if(!fields(w,['name','settings','items','activated','history','closed','override','reminded'])||typeof w.name!=='string'||!w.name.trim()||w.name.length>100||!validSettings(w.settings)||!validItems(w.items,defs,o)||!Array.isArray(w.activated)||!w.activated.every(a=>validActivation(a,defs))||!uniqueIds(w.activated.map(a=>a.definitionId))||!uniqueIds(w.activated.map(a=>a.taskId))||!Array.isArray(w.history)||!w.history.every(h=>validHistory(h,defs))||typeof w.closed!=='boolean'||w.override!==undefined&&typeof w.override!=='boolean'||w.reminded!==undefined&&(!uniqueIds(w.reminded)||w.reminded.some(id=>!defs.has(id))))fail('occurrence plan');const selected=w.items.filter(r=>r.selected).map(r=>JSON.stringify([r.definitionId,r.taskId])).sort(),links=(o.taskLinks||[]).map(r=>JSON.stringify([r.definitionId,r.taskId])).sort();if(JSON.stringify(selected)!==JSON.stringify(links))fail('occurrence plan links');}
      for(const k of ['giftIds','recipientIds'])if(o[k]!==undefined&&!uniqueIds(o[k]))fail(k);
      // Same opaque identity tuple as seasonal-core.js. The event year, never
      // the preparation year, identifies an annual occurrence in this slice.
      const expected=JSON.stringify([t.id,t.recurrence,t.recurrence==='annual'?Number(o.eventDate.slice(0,4)):o.id]);
      if(o.occurrenceKey!==expected||keys.has(expected))fail('occurrence identity');
      occurrences.add(o.id);keys.add(expected);
    }
    if([...templatePlans.keys()].some(id=>!templates.has(id))||[...occurrencePlans.keys()].some(id=>!occurrences.has(id)))fail('plan identity');
  }
  // Read-only resolution: distinguish missing and ambiguous gift targets;
  // never fabricate people, copy task data, or award completion points.
  // Separate optional records keep the #75 occasion/plan schemas readable on rollback.
  function validateSeasonalContent(f){
    const fail=()=>{throw Error('Invalid saved Seasonal notes or gift history; original saved data preserved.');};
    const rows=f.seasonalNotes===undefined?[]:f.seasonalNotes, history=f.seasonalGiftHistory===undefined?[]:f.seasonalGiftHistory;
    const validId=v=>typeof v==='string'&&v.length>0;
    const str=(v,max)=>typeof v==='string'&&v.length<=max;
    const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
    const money=v=>typeof v==='number'&&v>=0&&Number.isSafeInteger(Math.round(v*100));
    const ids=a=>new Set(a.map(x=>x.id)).size===a.length;
    const hasOccurrence=id=>f.occasionOccurrences.some(o=>o.id===id);
    const keys=(r,allowed)=>isObject(r)&&Object.keys(r).every(k=>allowed.includes(k));
    if(!Array.isArray(rows)||!Array.isArray(history))fail();
    let photoBytes=0;
    for(const r of rows){
      if(!keys(r,['id','occurrenceId','kind','title','body','items','url','photo','updatedAt','deleted'])||!validId(r.id)||!hasOccurrence(r.occurrenceId)||!stamp(r.updatedAt)||typeof r.deleted!=='boolean')fail();
      if(r.deleted){if(Object.keys(r).some(k=>!['id','occurrenceId','updatedAt','deleted'].includes(k)))fail();continue;}
      if(!['note','checklist','link','photo'].includes(r.kind)||!str(r.title,160)||!r.title.trim()||!str(r.body,4000))fail();
      if(r.kind==='checklist'){if(!Array.isArray(r.items)||r.items.length<1||r.items.length>100||r.items.some(i=>!keys(i,['id','text','checked'])||!validId(i.id)||!str(i.text,300)||!i.text.trim()||typeof i.checked!=='boolean')||!ids(r.items))fail();}else if(r.items!==undefined)fail();
      if(r.kind==='link'){if(!str(r.url,2000)||!/^https?:\/\/[^\s]+$/i.test(r.url))fail();try{if(!new URL(r.url).hostname)fail();}catch{fail();}}else if(r.url!==undefined)fail();
      if(r.kind==='photo'){if(!str(r.photo,80000)||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.photo))fail();photoBytes+=r.photo.length;}else if(r.photo!==undefined)fail();
    }
    if(!ids(rows)||photoBytes>640000)fail();
    for(const r of history){
      if(!keys(r,['id','occurrenceId','updatedAt','people'])||!validId(r.id)||r.id!==r.occurrenceId||!hasOccurrence(r.occurrenceId)||!f.occasionPlans?.occurrences.find(o=>o.id===r.occurrenceId)?.plan.closed||!stamp(r.updatedAt)||!Array.isArray(r.people))fail();
      for(const p of r.people){if(!keys(p,['id','name','gifts','total'])||!validId(p.id)||!str(p.name,100)||!Array.isArray(p.gifts)||!money(p.total)||p.gifts.some(g=>!keys(g,['title','price'])||typeof g.title!=='string'||!money(g.price))||p.total!==p.gifts.reduce((n,g)=>n+Math.round(g.price*100),0)/100)fail();}
      if(!ids(r.people))fail();
    }
    if(!ids(history))fail();
  }
  function occasionLinkStatus(board,occurrence){
    const f=board.features;
    const target=(rows,id)=>rows.find(row=>row.id===id);
    const status=(rows,id)=>target(rows,id)?'linked':'missing';
    const gifts=(occurrence.giftIds||[]).map(id=>{
      const g=target(f.gifts,id);
      if(!g)return {id,status:'missing'};
      // Explicit recipient IDs must agree with the actual tracker label.
      // Legacy name-only gifts remain gift links, not inferred person links.
      if(g.recipientId){
        const p=target(f.giftPeople,g.recipientId);
        if(!p)return {id,status:'unresolved-recipient'};
        const label=g.recipient.toLocaleLowerCase(),name=p.name.toLocaleLowerCase();
        if(label!==name||label.trim()!==name||f.giftPeople.some(other=>other.id!==p.id&&other.name.trim().toLocaleLowerCase()===label.trim()))return {id,status:'recipient-conflict'};
      }
      return {id,status:'linked'};
    });
    return {tasks:(occurrence.taskLinks||[]).map(l=>({...l,status:status(board.tasks,l.taskId)})),gifts,recipients:(occurrence.recipientIds||[]).map(id=>({id,status:status(f.giftPeople,id)}))};
  }
  function setOccasionLinks(board,occurrenceId,links){
    if(!isObject(links)||!Object.keys(links).length||Object.keys(links).some(k=>!['taskLinks','giftIds','recipientIds'].includes(k)))throw Error('Invalid Seasonal link selection. No data changed.');
    const out=normalize(board),o=out.features.occasionOccurrences.find(row=>row.id===occurrenceId);
    if(!o)throw Error('Seasonal occurrence not found. No data changed.');
    // Omitted collections are untouched. Supplied collections are explicit
    // replacements, so an unresolved historic link can be removed deliberately.
    for(const k of Object.keys(links)){
      if(!Array.isArray(links[k]))throw Error('Invalid Seasonal link selection. No data changed.');
      o[k]=clone(links[k]);
    }
    validateOccasions(out.features);
    const resolved=occasionLinkStatus(out,o);
    for(const [k,group] of [['taskLinks','tasks'],['giftIds','gifts'],['recipientIds','recipients']]){
      if(Object.prototype.hasOwnProperty.call(links,k)&&resolved[group].some(l=>l.status!=='linked'))throw Error('Seasonal link target missing or conflicting. No data changed.');
    }
    return out;
  }
  // Stage 2B: create a local template and its first occurrence from explicit
  // choices. Existing tasks, gifts, wins, schedules and sharing state are untouched.
  function createOccasion(board,draft){
    const fail=message=>{throw Error(message+' No data changed.');};
    if(!isObject(draft)||typeof draft.name!=='string'||!draft.name.trim()||draft.name.trim().length>100)fail('Enter an occasion name of 1–100 characters.');
    if(!['annual','one-off'].includes(draft.recurrence))fail('Choose annual or one-off.');
    for(const k of ['eventDate','preparationStartDate','endDate'])if(!parseDay(draft[k]))fail('Choose all three valid dates.');
    if(draft.preparationStartDate>draft.eventDate||draft.endDate<draft.eventDate)fail('The preparation and end dates must contain the event date.');
    if(!Array.isArray(draft.taskIds)||new Set(draft.taskIds).size!==draft.taskIds.length||!Array.isArray(draft.optionalTitles))fail('Invalid task selection.');
    if(draft.optionalTitles.length>100||draft.optionalTitles.some(t=>typeof t!=='string'||!t.trim()||t.trim().length>160))fail('Use up to 100 optional task names of 1–160 characters.');
    const optional=draft.optionalTitles.map(t=>t.trim());
    if(new Set(optional.map(t=>t.toLocaleLowerCase())).size!==optional.length)fail('Remove duplicate optional task names.');
    const selected=draft.taskIds.map(id=>board.tasks.find(t=>t.id===id&&!t.archived));
    if(selected.some(t=>!t))fail('A selected task is no longer available.');
    if(optional.some(name=>selected.some(t=>t.title.trim().toLocaleLowerCase()===name.toLocaleLowerCase())))fail('An optional task duplicates a selected task name.');
    const name=draft.name.trim(),out=clone(board),f=out.features;
    if(f.occasionTemplates.some(t=>t.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase()))fail('An occasion with this name already exists.');
    const templateId=uid(),occurrenceId=uid();
    const definitions=selected.map(t=>({id:uid(),title:t.title}));
    const taskLinks=selected.map((t,i)=>({definitionId:definitions[i].id,taskId:t.id}));
    definitions.push(...optional.map(title=>({id:uid(),title})));
    f.occasionTemplates.push({id:templateId,name,recurrence:draft.recurrence,taskDefinitions:definitions});
    f.occasionOccurrences.push({id:occurrenceId,templateId,occurrenceKey:JSON.stringify([templateId,draft.recurrence,draft.recurrence==='annual'?Number(draft.eventDate.slice(0,4)):occurrenceId]),eventDate:draft.eventDate,preparationStartDate:draft.preparationStartDate,endDate:draft.endDate,taskLinks});
    validateOccasions(f);
    return out;
  }
  // Stage 2C1: edit the saved occurrence in place. Shared templates allow
  // date-only edits until explicit per-year vs all-years overrides are available.
  function editOccasion(board,occurrenceId,draft){
    const fail=message=>{throw Error(message+' No data changed.');};
    if(!isObject(draft))fail('Invalid occasion edit.');
    const dates=['eventDate','preparationStartDate','endDate'];
    if(Object.keys(draft).some(k=>![...dates,'name','recurrence','taskIds','optionalTitles'].includes(k)))fail('Invalid occasion edit field.');
    for(const k of dates)if(!parseDay(draft[k]))fail('Choose all three valid dates.');
    if(draft.preparationStartDate>draft.eventDate||draft.endDate<draft.eventDate)fail('The preparation and end dates must contain the event date.');
    const out=clone(board),f=out.features,o=f.occasionOccurrences.find(x=>x.id===occurrenceId);
    if(!o)fail('Seasonal occurrence not found.');
    const t=f.occasionTemplates.find(x=>x.id===o.templateId);
    if(!t)fail('Seasonal template not found.');
    if(f.occasionPlans?.templates.some(x=>x.id===t.id)||f.occasionPlans?.occurrences.some(x=>x.id===o.id))fail('Use the Seasonal workflow editor for this occasion.');
    const templateEdit=Object.keys(draft).some(k=>!dates.includes(k));
    if(templateEdit){
      if(f.occasionOccurrences.some(x=>x.id!==o.id&&x.templateId===t.id))fail('This template has other occurrences. Edit dates only for now.');
      if(typeof draft.name!=='string'||!draft.name.trim()||draft.name.trim().length>100)fail('Enter an occasion name of 1–100 characters.');
      if(!['annual','one-off'].includes(draft.recurrence))fail('Choose annual or one-off.');
      const name=draft.name.trim(),fold=v=>v.trim().toLocaleLowerCase();
      if(f.occasionTemplates.some(x=>x.id!==t.id&&fold(x.name)===fold(name)))fail('An occasion with this name already exists.');
      if(!Array.isArray(draft.taskIds)||new Set(draft.taskIds).size!==draft.taskIds.length||!Array.isArray(draft.optionalTitles))fail('Invalid task selection.');
      if(draft.optionalTitles.length>100||draft.optionalTitles.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>160))fail('Use up to 100 optional task names of 1–160 characters.');
      const optional=draft.optionalTitles.map(v=>v.trim());
      if(new Set(optional.map(fold)).size!==optional.length)fail('Remove duplicate optional task names.');
      const oldLinks=o.taskLinks||[],oldDefs=t.taskDefinitions||[],linkedIds=new Set(oldLinks.map(l=>l.definitionId));
      const definitions=[],taskLinks=[],selectedTitles=[];
      for(const id of draft.taskIds){
        const old=oldLinks.find(l=>l.taskId===id),task=out.tasks.find(x=>x.id===id);
        if(!old&&(!task||task.archived))fail('A selected task is no longer available.');
        // Retain original link and definition IDs, even if a target was removed.
        const definition=old?oldDefs.find(d=>d.id===old.definitionId):{id:uid(),title:task.title};
        if(!definition)fail('A saved task definition is missing.');
        definitions.push(definition);taskLinks.push({definitionId:definition.id,taskId:id});
        selectedTitles.push(definition.title);if(task)selectedTitles.push(task.title);
      }
      if(optional.some(v=>selectedTitles.some(title=>fold(title)===fold(v))))fail('An optional task duplicates a selected task name.');
      const used=new Set(definitions.map(d=>d.id));
      for(const title of optional){
        // Only an unchanged unlinked idea can reuse its own identity. Never
        // attach a task to an optional definition by matching names.
        const old=oldDefs.find(d=>!linkedIds.has(d.id)&&!used.has(d.id)&&fold(d.title)===fold(title));
        const d={id:old?.id||uid(),title};definitions.push(d);used.add(d.id);
      }
      t.name=name;t.recurrence=draft.recurrence;t.taskDefinitions=definitions;o.taskLinks=taskLinks;
    }
    for(const k of dates)o[k]=draft[k];
    o.occurrenceKey=JSON.stringify([t.id,t.recurrence,t.recurrence==='annual'?Number(o.eventDate.slice(0,4)):o.id]);
    if(f.occasionOccurrences.some(x=>x.id!==o.id&&x.occurrenceKey===o.occurrenceKey))fail('An occurrence for this year already exists.');
    validateOccasions(f);
    return out;
  }
  // Comparison ignores object key ordering but not record content or array order.
  const stableSeasonal=value=>Array.isArray(value)?value.map(stableSeasonal):isObject(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableSeasonal(value[k])])):value;
  const sameSeasonal=(a,b)=>JSON.stringify(stableSeasonal(a))===JSON.stringify(stableSeasonal(b));
  function compatibleOccasionLinks(result,incoming,o){
    const refs=occasionLinkStatus(result,o),source=occasionLinkStatus(incoming,o);
    if([...refs.tasks,...refs.gifts,...refs.recipients,...source.tasks,...source.gifts,...source.recipients].some(l=>l.status!=='linked'))return false;
    const same=(a,b,id)=>{const x=a.find(r=>r.id===id),y=b.find(r=>r.id===id);return !!x&&!!y&&sameSeasonal(x,y);};
    return (o.taskLinks||[]).every(l=>same(result.tasks,incoming.tasks,l.taskId))&&
      (o.recipientIds||[]).every(id=>same(result.features.giftPeople,incoming.features.giftPeople,id))&&
      (o.giftIds||[]).every(id=>{
        if(!same(result.features.gifts,incoming.features.gifts,id))return false;
        const g=incoming.features.gifts.find(r=>r.id===id);
        return !g.recipientId||same(result.features.giftPeople,incoming.features.giftPeople,g.recipientId);
      });
  }
  function mergeOccasions(result,source,backup){
    const current=result.features,incoming=source.features;
    const templates=new Map(current.occasionTemplates.map(t=>[t.id,t]));
    const incompatible=new Set();
    const plan=(features,kind,id)=>features.occasionPlans?.[kind]?.find(x=>x.id===id)?.plan;
    const addPlan=(kind,id)=>{const p=plan(incoming,kind,id);if(p!==undefined){current.occasionPlans||={templates:[],occurrences:[]};current.occasionPlans[kind].push({id,plan:clone(p)});}};
    for(const t of incoming.occasionTemplates){
      const prior=templates.get(t.id);
      if(prior){if(!sameSeasonal(prior,t)||!sameSeasonal(plan(current,'templates',t.id),plan(incoming,'templates',t.id)))incompatible.add(t.id);}
      else {current.occasionTemplates.push(t);templates.set(t.id,t);addPlan('templates',t.id);}
    }
    const addedOccurrences=new Set();
    const ids=new Set(current.occasionOccurrences.map(o=>o.id));
    const keys=new Set(current.occasionOccurrences.map(o=>o.occurrenceKey));
    for(const o of incoming.occasionOccurrences){
      // Current records win; never silently attach an imported occurrence to
      // a conflicting template, or duplicate its logical occurrence identity.
      if(incompatible.has(o.templateId)||ids.has(o.id)||keys.has(o.occurrenceKey))continue;
      const linked=(o.taskLinks||[]).length||(o.giftIds||[]).length||(o.recipientIds||[]).length;
      if(linked&&(!backup||!compatibleOccasionLinks(result,source,o)))continue;
      current.occasionOccurrences.push(o);addedOccurrences.add(o.id);ids.add(o.id);keys.add(o.occurrenceKey);addPlan('occurrences',o.id);
    }
    for(const key of ['seasonalNotes','seasonalGiftHistory']){const added=(incoming[key]||[]).filter(r=>addedOccurrences.has(r.occurrenceId));if(added.length){const rows=current[key]||[],ids=new Set(rows.map(r=>r.id));if(added.some(r=>ids.has(r.id)))throw Error('Conflicting Seasonal content identity; original saved data preserved.');current[key]=[...rows,...clone(added)];}}
    validateOccasions(current);
    validateSeasonalContent(current);
    if(backup&&incoming.christmasGiftStages?.length){const rows=current.christmasGiftStages||[];for(const row of incoming.christmasGiftStages)if(!incompatible.has(row.templateId)&&templates.has(row.templateId)&&!rows.some(r=>r.templateId===row.templateId))rows.push(clone(row));if(rows.length)current.christmasGiftStages=rows;}
  }
  // Backup-only gift merge. Existing IDs win, and an imported gift must not
  // acquire a different recipient through a conflicting or previously missing ID.
  // Household connection continues to use the existing merge behavior.
  function mergeBackupGifts(current,incoming){
    const nameKey=value=>String(value||'').trim().toLocaleLowerCase();
    const people=new Map(current.giftPeople.map(p=>[p.id,p]));
    const sourcePeople=new Map(incoming.giftPeople.map(p=>[p.id,p]));
    const names=new Set(current.giftPeople.map(p=>nameKey(p.name)));
    for(const p of incoming.giftPeople){
      if(people.has(p.id)||names.has(nameKey(p.name)))continue;
      if(current.gifts.some(g=>g.recipientId===p.id&&nameKey(g.recipient)!==nameKey(p.name)))continue;
      current.giftPeople.push(p);people.set(p.id,p);names.add(nameKey(p.name));
    }
    const ids=new Set(current.gifts.map(g=>g.id));
    for(const g of incoming.gifts){
      if(ids.has(g.id))continue;
      if(g.recipientId){
        const source=sourcePeople.get(g.recipientId),target=people.get(g.recipientId);
        if(source&&(!target||nameKey(source.name)!==nameKey(target.name)))continue;
        if(!source&&target)continue;
        // The tracker creates virtual legacy people from nonempty trimmed gift
        // labels, even when no explicit person with that name exists. Require
        // an ID-linked gift's label to agree with the target's actual name
        // (case-insensitive, as giftForPerson matches it). Also reject whitespace
        // ambiguity rather than rewriting existing labels or recipient IDs.
        if(target&&(g.recipient.toLocaleLowerCase()!==target.name.toLocaleLowerCase()||
          nameKey(g.recipient)!==target.name.toLocaleLowerCase()))continue;
        if(target&&current.giftPeople.some(p=>p.id!==target.id&&nameKey(p.name)===nameKey(g.recipient)))continue;
      }
      current.gifts.push(g);ids.add(g.id);
    }
  }
  function normalize(raw) {
    if (!isObject(raw)||raw.version!==1||!Array.isArray(raw.rooms)||!Array.isArray(raw.tasks)||!Array.isArray(raw.doingOrder))
      throw Error('Unrecognised Tidyish board format. Original saved data was not changed.');
    const b=clone(raw),seen=new Set();unique(b.rooms,seen,'room');
    for(const r of b.rooms) {
      if(typeof r.name!=='string'||!r.name.trim())throw Error('Invalid room name; original saved data preserved.');
      const reference=roomDefaults().find(x=>x.id===r.id);
      Object.assign(r,{...reference,...r});
      // Migrate only the old built-in landing label; preserve any user-chosen room name.
      if(r.id==='hall'&&r.name==='Main Floor Landing / Hallway')r.name='Main Landing';
    }
    seen.clear();unique(b.tasks,seen,'task');
    b.tasks=b.tasks.map(t=>{
      if(typeof t.title!=='string'||!Array.isArray(t.children))throw Error('Invalid task data; original saved data preserved.');
      unique(t.children,seen,'subtask');
      const known=new Set(t.children.map(c=>c.id));
      for(const c of t.children) {
        if(typeof c.title!=='string'||(c.parentId&&c.parentId!==t.id&&!known.has(c.parentId)))throw Error('Invalid subtask parent/name; original saved data preserved.');
        let at=c,visited=new Set();while(at.parentId){if(visited.has(at.id))throw Error('Circular subtask nesting; original saved data preserved.');visited.add(at.id);at=t.children.find(x=>x.id===at.parentId);if(!at)break;}
      }
      return task({...t,...(!Object.hasOwn(t,'createdAt')?{libraryCreationUnknown:true}:{}),children:t.children.map(c=>child(c))});
    });
    let f=b.features;
    if(typeof f==='string') {try{f=JSON.parse(f);}catch{throw Error('Invalid saved feature data. Original saved data preserved.');}}
    if(f!==undefined&&!isObject(f))throw Error('Invalid saved feature data. Original saved data preserved.');
    b.features={...features(),...f};
    // Older boards represented the two drying choices as separate empty loads.
    // Fold only that untouched built-in pair into one wash cycle; retain active,
    // edited, or undoable loads so no household progress is discarded.
    if(Number(f?.laundryCycleVersion)!==1){
      const loads=b.features.laundry;for(const l of loads)if(l.slot>2&&Number(l.step)===0&&!l.uniformWeek)l.manual=true;
      const untouched=(l,slot,route)=>l&&l.slot===slot&&l.route===route&&Number(l.step)===0&&!l.selected&&!l.manual&&!Number(l.startedAt)&&!Number(l.lastReminderAt)&&!Number(l.revision)&&!l._undo&&!l.uniformWeek;
      if(untouched(loads.find(l=>l.slot===1),1,'rail')&&untouched(loads.find(l=>l.slot===2),2,'dryer')&&!b.features.wins.some(w=>w._load===2||w.laundryLoad===2||String(w.taskId||'').startsWith('laundry-2-')))
        b.features.laundry=loads.filter(l=>l.slot!==2).map(l=>({...l,route:''}));
      b.features.laundryCycleVersion=1;
    }
    if(b.features.railFinish==='Put away clothes on rail')b.features.railFinish='Move dry clothes from rail';
    for(const name of ['items','wins','completionSummaries','templates','hiddenTemplates','hiddenCustomLibraryIds','laundry','customLaundryCycles','customLaundryLoads','careDefinitions','routines','tools','focusSessions','sideTabs','locationTabs','locationAreas','locationEntries','locationMoves','locationTrash','uniformSteps','questTimings','taskDataArchives','dailyLogRecords','dailyLogRewashes','gifts','giftPeople'])
      if(!Array.isArray(b.features[name]))throw Error(`Invalid saved ${name}; original saved data preserved.`);
    validateRoutineDefinitions(b.features);
    validateOccasions(b.features);
    validateSeasonalContent(b.features);
    if(b.features.christmasGiftStages!==undefined){const rows=b.features.christmasGiftStages;if(!Array.isArray(rows)||rows.some(r=>!isObject(r)||typeof r.templateId!=='string'||!r.templateId||!b.features.occasionTemplates.some(t=>t.id===r.templateId)||!Array.isArray(r.stages)||r.stages.length>50||r.stages.some(v=>typeof v!=='string'||!v.trim()||v.length>100)||new Set(r.stages.map(v=>v.trim().toLocaleLowerCase())).size!==r.stages.length||typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt)))||new Set(rows.map(r=>r.templateId)).size!==rows.length)throw Error('Invalid saved Christmas gift stages; original saved data preserved.');}
    const giftIds=new Set();for(const gift of b.features.gifts){if(!isObject(gift)||typeof gift.id!=='string'||!gift.id||giftIds.has(gift.id)||!['christmas','birthday'].includes(gift.occasion)||typeof gift.recipient!=='string'||typeof gift.title!=='string'||gift.recipientId!==undefined&&typeof gift.recipientId!=='string'||!Number.isFinite(Number(gift.budget))||Number(gift.budget)<0||!Number.isFinite(Number(gift.spent))||Number(gift.spent)<0||!['idea','bought','wrapped'].includes(gift.status)||gift.receiptStatus!==undefined&&!['ordered','received'].includes(gift.receiptStatus)||gift.noWrapping!==undefined&&typeof gift.noWrapping!=='boolean'||gift.orderedAt!==undefined&&!parseDay(gift.orderedAt)||gift.receiptPromptedAt!==undefined&&!parseDay(gift.receiptPromptedAt)||gift.stage!==undefined&&(typeof gift.stage!=='string'||gift.stage.length>100))throw Error('Invalid saved gift record; original saved data preserved.');giftIds.add(gift.id);}
    const personIds=new Set();for(const person of b.features.giftPeople){if(!isObject(person)||typeof person.id!=='string'||!person.id||personIds.has(person.id)||typeof person.name!=='string'||!person.name.trim()||person.name.length>100||person.tracker!==undefined&&typeof person.tracker!=='boolean'||person.checkoffs!==undefined&&(!isObject(person.checkoffs)||Object.values(person.checkoffs).some(value=>typeof value!=='boolean'))||person.ideas!==undefined&&(!Array.isArray(person.ideas)||person.ideas.length>100||person.ideas.some(idea=>typeof idea!=='string'||idea.length>160))||person.christmasSettings!==undefined&&(!Array.isArray(person.christmasSettings)||person.christmasSettings.some(r=>!isObject(r)||typeof r.occurrenceId!=='string'||!r.occurrenceId||typeof r.checked!=='boolean'||r.budget!==null&&(typeof r.budget!=='number'||!Number.isFinite(r.budget)||r.budget<0||!Number.isSafeInteger(Math.round(r.budget*100))))||new Set(person.christmasSettings.map(r=>r.occurrenceId)).size!==person.christmasSettings.length))throw Error('Invalid saved gift person; original saved data preserved.');personIds.add(person.id);}
    // Merge the former Cat Tray Area and Upstairs Landing into one room. Keep the
    // long-standing `cats` identity so care, schedules, and existing task links remain valid.
    const catRoom=b.rooms.find(r=>r.id==='cats'),upstairsRoom=b.rooms.find(r=>r.id==='upstairs');
    if(upstairsRoom){
      if(catRoom){
        catRoom.name='Upstairs Landing';
        catRoom.capacity=Math.max(Number(catRoom.capacity)||14,Number(upstairsRoom.capacity)||14);
        catRoom.archived=!!catRoom.archived&&!!upstairsRoom.archived;
        const readCalibration=value=>{try{return typeof value==='string'?JSON.parse(value):value||null;}catch{return null;}};
        const a=readCalibration(catRoom.calibration),u=readCalibration(upstairsRoom.calibration);
        if(a||u){const weights={...(u?.weights||{}),...(a?.weights||{})},tinyIds=[...new Set([...(u?.tinyIds||[]),...(a?.tinyIds||[])])];catRoom.calibration=JSON.stringify({percent:Number.isFinite(Number(a?.percent))?Number(a.percent):Number(u?.percent)||0,weights,tinyIds});}
      }else{const defaults=roomDefaults().find(r=>r.id==='cats');upstairsRoom.id='cats';upstairsRoom.name='Upstairs Landing';upstairsRoom.art=defaults.art;upstairsRoom.header=defaults.header;}
      b.rooms=b.rooms.filter(r=>r.id!=='upstairs');
    }
    const remapRoom=value=>value==='upstairs'?'cats':value;
    const remapRecord=row=>{if(!row||typeof row!=='object')return;if(typeof row.room==='string')row.room=remapRoom(row.room);if(typeof row.roomId==='string')row.roomId=remapRoom(row.roomId);};
    for(const t of b.tasks)if(typeof t.room==='string')t.room=remapRoom(t.room);
    for(const key of ['items','wins','completionSummaries','templates','routines','taskDataArchives'])for(const row of b.features[key]){
      remapRecord(row);if(key==='items'&&row.location==='upstairs')row.location='cats';
    }
    const mergedSessions=new Map();for(const session of b.features.focusSessions){remapRecord(session);const existing=mergedSessions.get(session.room);if(existing){for(const key of ['resetIds','taskIds'])existing[key]=[...new Set([...(existing[key]||[]),...(session[key]||[])])];}else mergedSessions.set(session.room,session);}
    b.features.focusSessions=[...mergedSessions.values()];
    for(const location of b.features.locationAreas)remapRecord(location);
    if(isObject(b.features.areas)&&Object.prototype.hasOwnProperty.call(b.features.areas,'upstairs')){const cats=Array.isArray(b.features.areas.cats)?b.features.areas.cats:[],upstairs=Array.isArray(b.features.areas.upstairs)?b.features.areas.upstairs:[];b.features.areas.cats=[...new Set([...cats,...upstairs])];delete b.features.areas.upstairs;}
    const remapNested=(value)=>{if(Array.isArray(value)){value.forEach(remapNested);return;}if(!isObject(value))return;for(const [key,item] of Object.entries(value)){if((key==='room'||key==='roomId')&&item==='upstairs')value[key]='cats';else remapNested(item);}};
    remapNested(b.features.activityDiary);remapNested(b.features.scheduleDraft);
    const canonical=b.rooms.find(r=>r.id==='cats');if(canonical&&canonical.name==='Cat Tray Area')canonical.name='Upstairs Landing';
    if(!b.features.locationTabs.some(t=>t?.id==='household'))b.features.locationTabs.unshift({id:'household',name:'Household',order:0});
    const tabIds=new Set();for(const t of b.features.locationTabs){if(!isObject(t)||typeof t.id!=='string'||!t.id||typeof t.name!=='string'||!t.name.trim()||t.name.length>60||tabIds.has(t.id))throw Error('Invalid saved location tab; original saved data preserved.');tabIds.add(t.id);}
    // Two household members can create the same area name at the same time on
    // separate devices. Keep both identity-based records after sync rather than
    // rejecting the whole saved board; the editor still blocks local duplicates.
    const areaIds=new Set();for(const a of b.features.locationAreas){if(!isObject(a)||typeof a.id!=='string'||!a.id||typeof a.roomId!=='string'||!b.rooms.some(r=>r.id===a.roomId)||typeof a.name!=='string'||!a.name.trim()||a.name.length>60||areaIds.has(a.id))throw Error('Invalid saved location area; original saved data preserved.');areaIds.add(a.id);}
    const entryIds=new Set();for(const entry of b.features.locationEntries){if(!isObject(entry)||typeof entry.id!=='string'||!entry.id||entryIds.has(entry.id)||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>180||!tabIds.has(entry.tabId)||!areaIds.has(entry.areaId))throw Error('Invalid saved location item; original saved data preserved.');entryIds.add(entry.id);}
    const trashIds=new Set();for(const row of b.features.locationTrash){const item=row?.item;if(!isObject(row)||typeof row.id!=='string'||!row.id||trashIds.has(row.id)||entryIds.has(row.id)||!isObject(item)||item.id!==row.id||typeof item.name!=='string'||!item.name.trim()||item.name.length>180||typeof row.fromRoomName!=='string'||typeof row.fromAreaName!=='string'||!Number.isFinite(Date.parse(row.deletedAt))||!Number.isFinite(Date.parse(row.expiresAt))||Date.parse(row.expiresAt)<=Date.parse(row.deletedAt))throw Error('Invalid saved location Bin item; original saved data preserved.');trashIds.add(row.id);}
    const historyEntryIds=new Set([...entryIds,...trashIds]);
    const moveIds=new Set();for(const move of b.features.locationMoves){if(!isObject(move)||typeof move.id!=='string'||!move.id||moveIds.has(move.id)||!historyEntryIds.has(move.entryId)||typeof move.fromRoomName!=='string'||typeof move.fromAreaName!=='string'||typeof move.toRoomName!=='string'||typeof move.toAreaName!=='string'||typeof move.at!=='string'||!Number.isFinite(Date.parse(move.at)))throw Error('Invalid saved location history; original saved data preserved.');moveIds.add(move.id);}
    for(const entry of b.features.locationEntries)if(entry.lastMoveId&&(!moveIds.has(entry.lastMoveId)||!b.features.locationMoves.some(m=>m.id===entry.lastMoveId&&m.entryId===entry.id)))throw Error('Invalid saved previous location; original saved data preserved.');
    const archiveIds=new Set();for(const row of b.features.taskDataArchives){if(!isObject(row)||typeof row.id!=='string'||archiveIds.has(row.id)||!['completion','attempt'].includes(row.kind)||typeof row.taskId!=='string'||typeof row.period!=='string'||!Number.isFinite(Number(row.count))||Number(row.count)<0)throw Error('Invalid saved Task Data archive; original saved data preserved.');archiveIds.add(row.id);}
    if(!isObject(b.features.areas))throw Error('Invalid saved room areas; original saved data preserved.');
    if(!isObject(b.features.activityDiary)||!isObject(b.features.activityDiary.annotations)||!Array.isArray(b.features.activityDiary.earned)||JSON.stringify(b.features.activityDiary).length>100000)throw Error('Invalid saved activity diary; original saved data preserved.');

    b.features.templates=b.features.templates.map(t=>{
      if(!isObject(t)||typeof t.id!=='string'||!Array.isArray(t.children)||typeof t.title!=='string') throw Error('Invalid saved reusable task.');
      return task({...t,children:t.children.map(c=>child(c))});
    });
    const ids=new Set(b.tasks.map(t=>t.id));b.doingOrder=b.doingOrder.filter(id=>ids.has(id));
    return b;
  }
  function paused(t,today=date()) {return !!(t?.paused&&(!t.pauseUntil||t.pauseUntil>today));}
  const time=(t,now=Date.now())=>Math.max(0,Number(t?.elapsed)||0)+(t?.startedAt?Math.max(0,now-Number(t.startedAt)):0);
  const repeat=t=>Number(t?.repeatDays)>0||Number(t?.repeatMonths)>0||!!t?.repeatWeekdays?.length;
  function next(t,from=date()) {
    let day=Number(t?.repeatMonths)>0?months(from,Number(t.repeatMonths)):plus(from,Math.max(1,Number(t.repeatDays)||1));
    for(let i=0;i<370;i++){
      const dow=weekday(day);
      if((!t.repeatWeekdays?.length||t.repeatWeekdays.map(Number).includes(dow))&&!t.repeatRestDays?.map(Number).includes(dow))return day;
      day=plus(day,1);
    }
    throw Error('No available weekdays in recurrence. No changes saved.');
  }
  function add(b,t){if(!t?.id||b.tasks.some(x=>x.id===t.id))throw Error('This task ID already exists.');b.tasks.unshift(t);if(t.doing)b.doingOrder=[t.id,...b.doingOrder.filter(x=>x!==t.id)];}
  function select(b,id,on){const t=b.tasks.find(x=>x.id===id);if(!t)return;t.doing=!!on;b.doingOrder=b.doingOrder.filter(x=>x!==id);if(on)b.doingOrder.push(id);}
  function winner(b,subject,rootId,roomId){const id=uid();b.features.wins.push({id,taskId:subject.id,rootId,title:subject.title,room:roomId||'',at:new Date().toISOString(),minutes:Math.floor(time(subject)/60000),measured:time(subject)>0,points:1,person:b.features.displayName,templateId:subject.templateId||''});return id;}
  // Completed task cards stay visible until 03:00 on the next local calendar day.
  // These helpers only affect display ordering; they never delete task or win history.
  function taskCompletionTime(b,t){
    if(!t?.id)return 0;const ids=new Set([t.id,...(t.children||[]).map(c=>c.id)]);
    const values=[t.completedAt,t._cycle?.at,t.doneAt,...(b?.features?.wins||[]).filter(w=>ids.has(w.taskId)||w.rootId===t.id).map(w=>w.at)];
    const times=values.map(value=>value?Date.parse(value):NaN).filter(Number.isFinite);return times.length?Math.max(...times):0;
  }
  function taskCompletionExpiresAt(b,t){
    const at=taskCompletionTime(b,t);if(!at)return 0;const date=new Date(at);
    return new Date(date.getFullYear(),date.getMonth(),date.getDate()+1,3,0,0,0).getTime();
  }
  function taskTimerExpiresAt(startedAt){
    const at=Number(startedAt);if(!Number.isFinite(at)||at<=0)return 0;const boundary=new Date(at);boundary.setHours(3,0,0,0);if(boundary.getTime()<=at)boundary.setDate(boundary.getDate()+1);return boundary.getTime();
  }
  function hasExpiredTaskTimer(b,now=Date.now()){
    const at=now instanceof Date?now.getTime():Number(now),current=Number.isFinite(at)?at:Date.now();let found=false;
    const visit=item=>{if(!item||found)return;if(Number(item.startedAt)>0&&taskTimerExpiresAt(item.startedAt)<=current){found=true;return;}for(const child of item.children||[])visit(child);};
    for(const task of b?.tasks||[])visit(task);return found;
  }
  function discardExpiredTaskTimers(b,now=Date.now()){
    const at=now instanceof Date?now.getTime():Number(now),current=Number.isFinite(at)?at:Date.now(),expired=[];
    const visit=item=>{if(!item)return;if(Number(item.startedAt)>0&&taskTimerExpiresAt(item.startedAt)<=current){expired.push(item.id);item.startedAt=0;item.elapsed=0;item.timerEstimateMs=0;item.alarmNextAtMs=0;item.alarmDismissed=true;}for(const child of item.children||[])visit(child);};
    for(const task of b?.tasks||[])visit(task);return expired;
  }
  function isTaskCompletionVisible(b,t,now=Date.now()){
    if(!t?.done)return true;const expiry=taskCompletionExpiresAt(b,t);if(!expiry)return false;
    const at=now instanceof Date?now.getTime():Number(now);return expiry>(Number.isFinite(at)?at:Date.now());
  }
  function orderTaskList(b,rows,now=Date.now()){
    const visible=(rows||[]).filter(t=>!t.done||isTaskCompletionVisible(b,t,now)),active=visible.filter(t=>!t.done),completed=visible.filter(t=>t.done);
    completed.sort((a,z)=>taskCompletionTime(b,z)-taskCompletionTime(b,a)||String(a.title||'').localeCompare(String(z.title||'')));
    return [...active,...completed];
  }
  function orderChildList(b,t,parentId='',now=Date.now()){
    const activeTopLevel=!t?.done;
    return (t?.children||[]).filter(c=>(c.parentId||'')===parentId&&(!c.done||activeTopLevel||isTaskCompletionVisible(b,c,now)))
      .sort((a,z)=>Number(a.done)-Number(z.done)||(a.done?taskCompletionTime(b,z)-taskCompletionTime(b,a):0));
  }
  function nextTaskCompletionExpiry(b,now=Date.now()){
    const at=now instanceof Date?now.getTime():Number(now),deadlines=[];
    for(const t of b?.tasks||[])for(const row of [t,...(t.children||[])])if(row.done){const expiry=taskCompletionExpiresAt(b,row);if(expiry>(Number.isFinite(at)?at:Date.now()))deadlines.push(expiry);}
    return deadlines.length?Math.min(...deadlines):0;
  }
  const leaf=t=>t.children.filter(c=>!t.children.some(other=>other.parentId===c.id));
  function followup(b,parent,source){
    // Only an explicitly selected Clear the Way pickup step may generate a sorting task.
    if(!source.clearTheWayPickup||!source.followupTitle||b.tasks.some(t=>t.generatedFrom===source.id))return;
    add(b,task({room:parent.room,title:source.followupTitle,generatedFrom:source.id,priority:source.importantPickup?1:4,doing:false}));
  }
  function finish(b,id,done=true){
    const t=b.tasks.find(x=>x.id===id);if(!t||!!t.done===!!done)return;
    if(done){
      const before=t.children.map(c=>({id:c.id,done:!!c.done,winId:c._winId||''})),added=[];
      for(const c of (t.children.length?leaf(t):[t])){
        if(c.done)continue;
        const win=winner(b,c,t.id,t.room);added.push(win);
        if(c!==t)c._winId=win;
        followup(b,t,c);
      }
      t.undoChildren=before.map(c=>c.done);t._finishState={before,added,nextDue:t.nextDue||'',scheduleActive:!!t.scheduleActive,warningNextDue:t.warningNextDue||'',warningLastCompletedAt:t.warningLastCompletedAt||''};
      t._canUndoFamily=true;t._completionIds=added;
      t.children.forEach(c=>{c.done=true;c.elapsed=time(c);c.startedAt=0;});
      t.elapsed=time(t);t.startedAt=0;t.done=true;t.completedAt=new Date().toISOString();if(t.scheduleMakerManaged)t.scheduleActive=false;
      const completedDay=ukCompletionDay(t.completedAt);
      if(repeat(t))t.nextDue=next(t,completedDay);
      if(t.warningEnabled){t.warningUndo={warningNextDue:t.warningNextDue||'',warningLastCompletedAt:t.warningLastCompletedAt||''};t.warningLastCompletedAt=t.completedAt;t.warningNextDue=Number(t.warningRepeatDays)>0?plus(completedDay,Number(t.warningRepeatDays)):'';}
      followup(b,t,t);
    }else{
      if(t._canUndoFamily===false)throw Error('This completion needs Undo from the original device. No saved records changed.');
      const state=t._finishState;
      if(!state&&t.children.length&&!t.undoChildren?.length)throw Error('Completion history is missing Undo details. Records preserved.');
      const undoIds=new Set(state?.added||t._completionIds||[]);
      b.features.wins=b.features.wins.filter(w=>!undoIds.has(w.id));
      b.features.questTimings=b.features.questTimings.filter(r=>!Array.isArray(r.completionWinIds)||!r.completionWinIds.some(id=>undoIds.has(id)));
      t.children.forEach((c,i)=>{const previous=state?.before.find(x=>x.id===c.id);c.done=previous?previous.done:!!t.undoChildren[i];if(previous){if(previous.winId)c._winId=previous.winId;else delete c._winId;}else if(undoIds.has(c._winId))delete c._winId;});
      t.done=false;t.completedAt='';if(state){t.nextDue=state.nextDue;if(t.scheduleMakerManaged)t.scheduleActive=!!state.scheduleActive;}const warningBefore=state||t.warningUndo;if(warningBefore){t.warningNextDue=warningBefore.warningNextDue||'';t.warningLastCompletedAt=warningBefore.warningLastCompletedAt||'';}delete t.warningUndo;delete t._finishState;delete t._completionIds;
      const touched=new Set([t.id,...t.children.map(c=>c.id)]);
      b.tasks=b.tasks.filter(x=>!touched.has(x.generatedFrom)||x.touched||x.done||x.startedAt||x.elapsed);
      b.doingOrder=b.doingOrder.filter(x=>b.tasks.some(t=>t.id===x));
    }
  }
  // Restart a repeatable / as-needed Task without pretending the previous win never happened.
  // Undo still applies only to the latest completion, not to archived completion records.
  function reopenWarningCycle(t){
    if(!t?.done)return t;
    t.done=false;t.completedAt='';t.elapsed=0;t.startedAt=0;
    t._canUndoFamily=false;
    delete t._finishState;delete t._completionIds;delete t.undoChildren;delete t.warningUndo;
    for(const c of t.children){c.done=false;c.elapsed=0;c.startedAt=0;delete c._winId;}
    return t;
  }
  function reactivate(b,id){
    const t=b.tasks.find(x=>x.id===id);
    if(!t)throw Error('Task not found. Nothing changed.');
    if(t.side||t.scheduleMakerManaged||t.tidyScheduleV3)throw Error('This Task is managed by another system. Nothing changed.');
    return reopenWarningCycle(t);
  }
  function completeChild(b,id,childId,done){
    const t=b.tasks.find(x=>x.id===id),c=t?.children.find(x=>x.id===childId);
    if(!c||!!c.done===!!done)return;
    const family=new Set([childId]);for(let i=0;i<t.children.length;i++)for(const kid of t.children)if(family.has(kid.parentId))family.add(kid.id);
    const before=new Map(t.children.map(c=>[c.id,{done:!!c.done,winId:c._winId||''}]));
    const changedWinIds=[],removedWinIds=new Set();
    for(const kid of t.children){
      if(!family.has(kid.id))continue;
      if(done&&!kid.done&&!t.children.some(x=>x.parentId===kid.id)){
        kid._winId=winner(b,kid,t.id,t.room);changedWinIds.push(kid._winId);followup(b,t,kid);
      }
      if(!done&&kid._winId){const winId=kid._winId;removedWinIds.add(winId);b.features.wins=b.features.wins.filter(w=>w.id!==winId);delete kid._winId;
        b.tasks=b.tasks.filter(x=>x.generatedFrom!==kid.id||x.touched||x.done||x.startedAt||x.elapsed);
      }
      kid.done=!!done;kid.elapsed=time(kid);kid.startedAt=0;
    }
    if(removedWinIds.size)b.features.questTimings=b.features.questTimings.filter(r=>!Array.isArray(r.completionWinIds)||!r.completionWinIds.some(id=>removedWinIds.has(id)));
    // Parent subtasks reflect the completion status of their children.
    for(let i=0;i<t.children.length;i++)for(const p of t.children){const children=t.children.filter(x=>x.parentId===p.id);if(children.length)p.done=children.every(x=>x.done);}
    const all=t.children.every(x=>x.done);
    if(done&&all&&!t.done){t.done=true;t.completedAt=new Date().toISOString();if(t.scheduleMakerManaged)t.scheduleActive=false;t._canUndoFamily=true;t.undoChildren=[...before.values()].map(x=>x.done);t._completionIds=t.children.map(x=>x._winId).filter(Boolean);t._finishState={before:[...before].map(([id,state])=>({id,...state})),added:changedWinIds,nextDue:t.nextDue||'',warningNextDue:t.warningNextDue||'',warningLastCompletedAt:t.warningLastCompletedAt||''};const completedDay=ukCompletionDay(t.completedAt);if(repeat(t))t.nextDue=next(t,completedDay);if(t.warningEnabled){t.warningUndo={warningNextDue:t.warningNextDue||'',warningLastCompletedAt:t.warningLastCompletedAt||''};t.warningLastCompletedAt=t.completedAt;t.warningNextDue=Number(t.warningRepeatDays)>0?plus(completedDay,Number(t.warningRepeatDays)):'';}}
    if(!done&&t.done){const state=t._finishState||t.warningUndo;t.done=false;t.completedAt='';if(state){t.warningNextDue=state.warningNextDue||'';t.warningLastCompletedAt=state.warningLastCompletedAt||'';}delete t.warningUndo;delete t._finishState;}
  }
  function refresh(b,today=date()) {
    // A startup refresh NEVER reopens completed recurring work or rewrites history.
    // Upcoming occurrences are computed separately by schedule-core.
    for(const t of b.tasks){if(t.paused&&t.pauseUntil&&t.pauseUntil<=today)t.paused=false;if(t.warningEnabled&&t.done&&!t.scheduleMakerManaged&&!t.tidyScheduleV3){const due=t.warningNextDue||(!t.warningLastCompletedAt?t.warningFirstDue:'');if(/^\d{4}-\d{2}-\d{2}$/.test(due)&&due<=today)reopenWarningCycle(t);}}
    // Laundry is independent of cleaning schedule. Start a weekly reminder only if idle.
    const f=b.features,offset=(weekday(today)+1)%7,saturday=plus(today,-offset);
    if(f.uniformPaused&&f.uniformPauseUntil&&f.uniformPauseUntil<=today)f.uniformPaused=false;
    if(weekday(today)===6&&!f.uniformPaused&&f.uniformIndex<0&&f.uniformWeek!==saturday){f.uniformIndex=0;f.uniformWeek=saturday;}
    return b;
  }
  function eligibleLeaves(b,roomId,today=date()) {
    return b.tasks.filter(t=>t.room===roomId&&!t.side&&!t.done&&!t.littleOften&&t.taskType!=='little-often'&&t.taskType!=='laundry'&&!paused(t,today)&&(!t.nextDue||t.nextDue<=today))
      .flatMap(t=>{const overdue=t.dueDate?Math.max(0,Math.min(14,Math.floor((parseDay(today)-parseDay(t.dueDate))/86400000))):0;
        const factor={none:0,tiny:.14,small:.5,normal:1,big:2}[t.messImpact]??1;
        return (t.children.length?leaf(t).filter(c=>!c.done):[t]).map(c=>({id:c.id,taskId:t.id,title:c.title||t.title,parentTitle:c.id===t.id?'':t.title,impact:t.messImpact,weight:factor*(1+overdue*.25)}));});
  }
  function messLeaves(b,id,today=date()){return eligibleLeaves(b,id,today);}
  function messBreakdown(b,r,today=date()){
    if(!r)return {items:[],adjustment:0,raw:0,score:0,capped:false};
    const leaves=eligibleLeaves(b,r.id,today),count=leaves.filter(x=>x.impact!=='tiny').reduce((sum,x)=>sum+x.weight,0);
    let adjustment=0,items;
    if(r.calibration){
      let c;try{c=typeof r.calibration==='string'?JSON.parse(r.calibration):r.calibration;}catch{c=null;}
      if(isObject(c)&&Number.isFinite(Number(c.percent))){const historical=isObject(c.weights)?c.weights:{},baseline=Object.values(historical).reduce((s,v)=>s+(Number(v)||0),0),percent=Math.max(0,Number(c.percent));
        if(!baseline)adjustment=percent;
        items=leaves.map(x=>{const represented=Object.prototype.hasOwnProperty.call(historical,x.id);const contribution=x.impact==='tiny'?1:represented?(baseline?percent*x.weight/baseline:0):x.weight*100/14;return {...x,contribution};});
      }
    }
    if(!items){const denominator=Math.max(14,Number(r.capacity)||14,count);items=leaves.map(x=>({...x,contribution:x.impact==='tiny'?1:x.weight/denominator*100}));}
    const raw=adjustment+items.reduce((sum,x)=>sum+x.contribution,0);
    return {items,adjustment,raw,score:Math.round(Math.max(0,Math.min(100,raw))*10)/10,capped:raw>100};
  }
  function mess(b,r){return messBreakdown(b,r).score;}
  // Home's combined meter also includes care urgency. Care records remain their own
  // tasks, with no made-up physical room assignment for an aquarium or plant.
  function householdMess(b){
    const open=b.rooms.filter(r=>!r.archived),roomTotal=open.reduce((sum,r)=>sum+mess(b,r),0);
    const care=globalThis.TidyCare?.RULES||[];
    const careWeight=care.reduce((sum,r)=>{
      const level=globalThis.TidyCare.status(b,r.id).state;
      return sum+({green:0,blue:1,orange:1.5,red:2,flashing:2.5}[level]||0);
    },0);
    return Math.min(100,Math.round((roomTotal/(open.length||1)+careWeight*100/14)*10)/10);
  }
  function calibrate(b,id,percent){const r=b.rooms.find(x=>x.id===id);if(!r)throw Error('Room not found.');const n=Number(percent);if(!Number.isFinite(n)||n<0||n>100)throw Error('Mess must be 0–100%.');const leaves=eligibleLeaves(b,id);r.calibration=JSON.stringify({percent:n,weights:Object.fromEntries(leaves.filter(x=>x.impact!=='tiny').map(x=>[x.id,x.weight])),tinyIds:leaves.filter(x=>x.impact==='tiny').map(x=>x.id)});}
  function occurrences(b,start,end,roomId=''){
    const out=[];for(const t of b.tasks.filter(t=>repeat(t)&&!t.side&&!paused(t)&&(!roomId||t.room===roomId))){
      let day=t.nextDue||t.dueDate||next(t,start),limit=0;if(!parseDay(day))continue;
      while(day<=end&&limit++<4000){if(day>=start&&!t.skippedDates?.includes(day)){const shown=t.calendarMoves?.[day]||day;if(shown>=start&&shown<=end)out.push({task:t,original:day,date:shown});}if(t.occasionKind==='occasional')break;const updated=next(t,day);if(updated<=day)break;day=updated;}
    }return out.sort((a,b)=>a.date.localeCompare(b.date));
  }
  // New custom cycles are intentionally browser-local until a mixed-client live sync
  // path is verified. The legacy three-step standard load schema stays untouched.
  function cycleSteps(values){
    if(!Array.isArray(values)||values.length<1||values.length>20||values.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>140))throw Error('Enter 1–20 steps, each 1–140 characters.');
    return values.map(x=>x.trim());
  }
  function cycleName(value){const name=String(value??'').trim();if(!name||name.length>80)throw Error('Enter a cycle name of 1–80 characters.');return name;}
  function validateRoutineDefinitions(f){
    const unique=(rows,validate)=>{const ids=new Set();for(const row of rows){if(!isObject(row)||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Invalid saved routine identity; original saved data preserved.');validate(row);ids.add(row.id);}};
    unique(f.customLaundryCycles,x=>{cycleName(x.name);cycleSteps(x.steps);if(typeof x.reminderAfterFirst!=='boolean')throw Error('Invalid saved custom cycle reminder.');});
    unique(f.customLaundryLoads,x=>{cycleName(x.name);cycleSteps(x.steps);if(typeof x.cycleId!=='string'||!x.cycleId||!Number.isInteger(x.step)||x.step<0||x.step>x.steps.length||typeof x.reminderAfterFirst!=='boolean'||!Number.isFinite(x.startedAt)||x.startedAt<0||!Number.isFinite(x.lastReminderAt)||x.lastReminderAt<0)throw Error('Invalid saved custom laundry progress.');if(x.undo&&(!isObject(x.undo)||typeof x.undo.winId!=='string'||!x.undo.winId||x.undo.step!==x.step-1||!Number.isFinite(x.undo.startedAt)||x.undo.startedAt<0||!Number.isFinite(x.undo.lastReminderAt)||x.undo.lastReminderAt<0))throw Error('Invalid saved custom laundry undo.');});
    unique(f.careDefinitions,x=>{if(typeof x.title!=='string'||!x.title.trim()||x.title.length>140||typeof x.warning!=='string'||x.warning.length>200||!['cat','aquatic','custom'].includes(x.group)||!['daily','weekly','every-two','monthly','plants','interval'].includes(x.type)||x.type==='interval'&&(!Number.isInteger(x.intervalDays)||x.intervalDays<1||x.intervalDays>365))throw Error('Invalid saved care definition.');});
  }
  function saveCustomCycle(b,id,values){const f=b.features,prior=id?f.customLaundryCycles.find(x=>x.id===id):null;if(id&&!prior)throw Error('Cycle no longer exists.');const def={id:prior?.id||'custom-cycle:'+uid(),name:cycleName(values.name),steps:cycleSteps(values.steps),reminderAfterFirst:values.reminderAfterFirst===true};if(prior)Object.assign(prior,def);else f.customLaundryCycles.push(def);return def;}
  function removeCustomCycle(b,id){b.features.customLaundryCycles=b.features.customLaundryCycles.filter(x=>x.id!==id);}
  function startCustomLoad(b,cycleId){const f=b.features,definition=f.customLaundryCycles.find(x=>x.id===cycleId);if(!definition)throw Error('Cycle no longer exists.');const load={id:'custom-load:'+uid(),cycleId:definition.id,name:cycleName(definition.name),steps:cycleSteps(definition.steps),reminderAfterFirst:definition.reminderAfterFirst,step:0,startedAt:0,lastReminderAt:0};f.customLaundryLoads.push(load);return load;}
  function customLaundryNeedsAttention(l,now=Date.now()){return l?.reminderAfterFirst===true&&l.step===1&&l.step<l.steps.length&&l.startedAt>0&&now-l.startedAt>=7200000;}
  function customLaundryReminderDue(l,now=Date.now()){return customLaundryNeedsAttention(l,now)&&now-l.lastReminderAt>=1800000;}
  function completeCustomStep(b,id,now=Date.now()){
    const f=b.features,l=f.customLaundryLoads.find(x=>x.id===id);if(!l||l.step>=l.steps.length)throw Error('No pending custom laundry step.');
    if(!Number.isFinite(now)||now<=0)throw Error('Invalid completion time.');
    const win={id:uid(),taskId:'laundry-custom:'+l.id+':'+l.step,rootId:'',title:l.steps[l.step],room:'laundry',at:new Date(now).toISOString(),minutes:0,measured:false,points:1,person:f.displayName||'Me',_kind:'laundry',_laundry:true};
    l.undo={step:l.step,startedAt:l.startedAt,lastReminderAt:l.lastReminderAt,winId:win.id};f.wins.push(win);l.step++;
    if(l.step===1&&l.step<l.steps.length&&l.reminderAfterFirst){l.startedAt=now;l.lastReminderAt=0;}else{l.startedAt=0;l.lastReminderAt=0;}
    return win;
  }
  function undoCustomStep(b,id,winId){const f=b.features,l=f.customLaundryLoads.find(x=>x.id===id),u=l?.undo;if(!u||u.winId!==winId||l.step!==u.step+1||!f.wins.some(w=>w.id===winId&&w.taskId==='laundry-custom:'+l.id+':'+u.step))throw Error('That completion is no longer available. No other completion was removed.');f.wins=f.wins.filter(w=>w.id!==winId);l.step=u.step;l.startedAt=u.startedAt;l.lastReminderAt=u.lastReminderAt;delete l.undo;}
  function laundryText(f,l){return l.step===0?f.wash:l.step===1?(l.route==='dryer'?f.dryerTransfer:f.railTransfer):(l.route==='dryer'?f.dryerFinish:f.railFinish);}
  function laundryNeedsAttention(l,now=Date.now()){const started=Number(l?.startedAt);return Number(l?.step)===1&&Number.isFinite(started)&&started>0&&now-started>=7200000;}
  function laundryReminderDue(l,now=Date.now()){return laundryNeedsAttention(l,now)&&now-(Number(l?.lastReminderAt)||0)>=1800000;}
  function laundry(b,slot){const f=b.features,l=f.laundry.find(x=>x.slot===slot);if(!l)return;const before=clone(l);delete before._undo;const win=winner(b,{id:`laundry-${slot}-${uid()}`,title:laundryText(f,l),room:'laundry'},'', 'laundry');l._undo={load:before,win};l.step=(l.step+1)%3;l.complete=!!(before.manual&&before.step===2);l.selected=before.step===0;if(before.step===0){l.startedAt=Date.now();l.lastReminderAt=0;}else if(l.step===0){l.startedAt=0;l.lastReminderAt=0;}l.revision=(l.revision||0)+1;}
  function undoLaundry(b,slot){const l=b.features.laundry.find(x=>x.slot===slot);if(!l?._undo)return;const u=l._undo;b.features.wins=b.features.wins.filter(w=>w.id!==u.win);Object.keys(l).forEach(k=>delete l[k]);Object.assign(l,clone(u.load));}
  function uniform(b){const f=b.features;if(f.uniformIndex<0||f.uniformPaused)return;const snapshot={index:f.uniformIndex,steps:clone(f.uniformSteps),startedAt:f.uniformStartedAt||0};const win=winner(b,{id:`uniform-${uid()}`,title:f.uniformSteps[f.uniformIndex],room:'laundry'},'','laundry');f._uniformUndo={...snapshot,win};f.uniformStartedAt=/^Wash/.test(f.uniformSteps[f.uniformIndex])?Date.now():0;f.uniformIndex++;if(f.uniformIndex>=f.uniformSteps.length-1){const slot=Math.max(0,...f.laundry.map(l=>l.slot))+1;f.laundry.push({slot,step:2,route:'rail',selected:true,uniformWeek:f.uniformWeek,revision:0});f._uniformUndo.handoff=slot;f.uniformIndex=-1;}}
  function undoUniform(b){const f=b.features,u=f._uniformUndo;if(!u)return;if(u.handoff&&f.laundry.find(x=>x.slot===u.handoff)?.revision>0)throw Error('The laundry load has progressed. Undo was not applied.');f.laundry=f.laundry.filter(x=>x.slot!==u.handoff);f.uniformIndex=u.index;f.uniformSteps=u.steps;f.uniformStartedAt=u.startedAt;f.wins=f.wins.filter(w=>w.id!==u.win);delete f._uniformUndo;}
  function templateCopy(source,room,doing=false){const t=clone(source),ids=new Map(t.children.map(c=>[c.id,uid()]));return task({...t,id:uid(),room,templateId:source.id,done:false,doing:!!doing,elapsed:0,startedAt:0,nextDue:'',generatedFrom:'',completedAt:'',_completionIds:[],_finishState:undefined,children:t.children.map(c=>child({...c,id:ids.get(c.id),parentId:ids.get(c.parentId)||'',done:false,elapsed:0,startedAt:0,_winId:undefined}))});}
  function merge(b,incoming,options={}){const n=normalize(incoming),result=normalize(b);const roomIds=new Set(result.rooms.map(r=>r.id)),taskIds=new Set(result.tasks.map(t=>t.id));for(const r of n.rooms)if(!roomIds.has(r.id)){result.rooms.push(r);roomIds.add(r.id);}for(const t of n.tasks)if(!taskIds.has(t.id)){result.tasks.push(t);taskIds.add(t.id);}for(const id of n.doingOrder)if(taskIds.has(id)&&!result.doingOrder.includes(id))result.doingOrder.push(id);for(const key of ['items','wins','completionSummaries','templates','routines','customLaundryCycles','customLaundryLoads','careDefinitions','locationTabs','locationAreas','locationEntries','locationMoves','locationTrash','questTimings','taskDataArchives','dailyLogRecords','dailyLogRewashes']){const have=new Set(result.features[key].map(x=>x.id));for(const item of n.features[key])if(!have.has(item.id)){result.features[key].push(item);have.add(item.id);}}if(options.backupGifts===true)mergeBackupGifts(result.features,n.features);mergeOccasions(result,n,options.backupGifts===true);return result;}
  function focus(b,roomId,routine,steps,selected){
    // Called ONLY after explicit user confirmation in the Focus dialog.
    if(!b.rooms.some(r=>r.id===roomId))throw Error('Choose a room.');
    const chosen=new Set(selected.filter(id=>b.tasks.some(t=>t.id===id&&t.room===roomId)));
    const sessions=b.features.focusSessions;const previous=sessions.find(x=>x.room===roomId);
    const resetIds=[];
    if(steps.length){
      const created=task({room:roomId,title:`Clear the Way · ${b.rooms.find(r=>r.id===roomId).name}`,children:steps.map((title,i)=>child({title,clearTheWayPickup:true,followupTitle:routine?.followups?.[title]||''})),doing:true});
      add(b,created);resetIds.push(created.id);
    }
    if(previous)for(const id of previous.resetIds||[])if(!resetIds.includes(id))select(b,id,false);
    for(const id of chosen)select(b,id,true);
    b.doingOrder=[...resetIds,...b.doingOrder.filter(id=>!resetIds.includes(id))];
    b.features.focusSessions=sessions.filter(s=>s.room!==roomId).concat({room:roomId,resetIds,taskIds:[...chosen]});
  }
  function doing(b){const withheld=new Set(b.features.focusSessions.filter(s=>(s.resetIds||[]).some(id=>b.tasks.some(t=>t.id===id&&!t.done))).flatMap(s=>s.taskIds||[]));return b.doingOrder.map(id=>b.tasks.find(t=>t.id===id&&t.doing&&!paused(t)&&!withheld.has(id))).filter(Boolean);}
  function move(b,id,to,doingView=false){const list=doingView?b.doingOrder:b.tasks.map(t=>t.id);const from=list.indexOf(id),target=to==='first'?0:to==='last'?list.length-1:list.indexOf(to);if(from<0||target<0)return;list.splice(from,1);list.splice(target,0,id);if(doingView)b.doingOrder=list;else b.tasks=list.map(id=>b.tasks.find(t=>t.id===id));}
  return {id:ID,uid,clone,date,plus,months,board,features,task,child,reconcileChildren,normalize,paused,time,repeat,next,
    taskCompletionTime,taskCompletionExpiresAt,taskTimerExpiresAt,hasExpiredTaskTimer,discardExpiredTaskTimers,isTaskCompletionVisible,orderTaskList,orderChildList,nextTaskCompletionExpiry,
    add,select,finish,reactivate,completeChild,refresh,messLeaves,messBreakdown,mess,householdMess,cleanPercent,phrase,calibrate,occurrences,
    saveCustomCycle,removeCustomCycle,startCustomLoad,completeCustomStep,undoCustomStep,customLaundryNeedsAttention,customLaundryReminderDue,
    laundryText,laundryNeedsAttention,laundryReminderDue,laundry,undoLaundry,uniform,undoUniform,templateCopy,merge,occasionLinkStatus,setOccasionLinks,createOccasion,editOccasion,focus,doing,move,sideTabs,uniformSteps:[...STANDARD_UNIFORM]};
});
