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
    ['hall','Main Floor Landing / Hallway','hall-background.png',null],
    ['penny','Penny’s Bedroom','room-penny-spotless.jpg','bedroom-cat-header.png'],
    ['master','Master Bedroom','room-master-spotless.png','bedroom-bigfoot-header.png'],
    ['bathroom','Bathroom','room-bathroom-spotless.png','bathroom-header.png'],
    ['kitchen','Kitchen','room-kitchen-spotless.png','kitchen-header.png'],
    ['living','Living Room','room-living-spotless.png','living-header(1).png'],
    ['cats','Cat Tray Area','room-cats-clean.png','cat-trays-header.png'],
    ['print','3D Printer Room','room-print-spotless.png','3d-printer-header.png'],
    ['storage','Storage Room','room-craft-spotless.png','storage-header.png'],
    ['upstairs','Upstairs Landing','upstairs-landing-background.png',null]
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
      items:[],wins:[],completionSummaries:[],templates:[],hiddenTemplates:[],
      laundry:[{slot:1,route:'rail',step:0,selected:false},{slot:2,route:'dryer',step:0,selected:false}],
      wash:'Put a load on',railTransfer:'Put out washing',dryerTransfer:'Put in dryer',
      railFinish:'Put away clothes on rail',dryerFinish:'Empty dryer',
      uniformSteps:[...STANDARD_UNIFORM],uniformIndex:-1,uniformWeek:'',uniformPaused:false,
      routines:[],areas:{},tools:[],focusSessions:[],sideTabs:[],
      displayName:'Me',simple:false,sound:true,reduceMotion:false,pauseWandering:false,
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
      estimate:0,priority:3,sideKind:'organisation',assigned:'',assignedUserId:'',area:'',
      templateId:'',messImpact:'normal',effort:'',createdAt:new Date().toISOString(),image:'',
      paused:false,pauseUntil:'',followupTitle:'',generatedFrom:'',touched:false,wasParent:false,...v};
  }
  function child(v={}) {return {id:uid(),title:'',done:false,parentId:'',tools:'',notes:'',estimate:0,elapsed:0,startedAt:0,followupTitle:'',...v};}
  function unique(records,used,label) {
    for (const r of records) {
      if (!isObject(r) || typeof r.id!=='string' || !r.id.trim() || used.has(r.id))
        throw Error(`Invalid or duplicate ${label} ID. Original saved data was not changed.`);
      used.add(r.id);
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
    }
    seen.clear();unique(b.tasks,seen,'task');
    b.tasks=b.tasks.map(t=>{
      if(typeof t.title!=='string'||!Array.isArray(t.children))throw Error('Invalid task data; original saved data preserved.');
      unique(t.children,seen,'subtask');
      const known=new Set(t.children.map(c=>c.id));
      for(const c of t.children) {
        if(typeof c.title!=='string'||(c.parentId&&!known.has(c.parentId)))throw Error('Invalid subtask parent/name; original saved data preserved.');
        let at=c,visited=new Set();while(at.parentId){if(visited.has(at.id))throw Error('Circular subtask nesting; original saved data preserved.');visited.add(at.id);at=t.children.find(x=>x.id===at.parentId);if(!at)break;}
      }
      return task({...t,children:t.children.map(c=>child(c))});
    });
    let f=b.features;
    if(typeof f==='string') {try{f=JSON.parse(f);}catch{throw Error('Invalid saved feature data. Original saved data preserved.');}}
    if(f!==undefined&&!isObject(f))throw Error('Invalid saved feature data. Original saved data preserved.');
    b.features={...features(),...f};
    for(const name of ['items','wins','completionSummaries','templates','hiddenTemplates','laundry','routines','tools','focusSessions','sideTabs','uniformSteps'])
      if(!Array.isArray(b.features[name]))throw Error(`Invalid saved ${name}; original saved data preserved.`);
    if(!isObject(b.features.areas))throw Error('Invalid saved room areas; original saved data preserved.');
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
      t.undoChildren=before.map(c=>c.done);t._finishState={before,added,nextDue:t.nextDue||''};
      t._canUndoFamily=true;t._completionIds=added;
      t.children.forEach(c=>{c.done=true;c.elapsed=time(c);c.startedAt=0;});
      t.elapsed=time(t);t.startedAt=0;t.done=true;t.completedAt=new Date().toISOString();
      if(repeat(t))t.nextDue=next(t,date());
      followup(b,t,t);
    }else{
      if(t._canUndoFamily===false)throw Error('This completion needs Undo from the original device. No saved records changed.');
      const state=t._finishState;
      if(!state&&t.children.length&&!t.undoChildren?.length)throw Error('Completion history is missing Undo details. Records preserved.');
      const undoIds=new Set(state?.added||t._completionIds||[]);
      b.features.wins=b.features.wins.filter(w=>!undoIds.has(w.id));
      t.children.forEach((c,i)=>{const previous=state?.before.find(x=>x.id===c.id);c.done=previous?previous.done:!!t.undoChildren[i];if(previous){if(previous.winId)c._winId=previous.winId;else delete c._winId;}else if(undoIds.has(c._winId))delete c._winId;});
      t.done=false;t.completedAt='';if(state)t.nextDue=state.nextDue;delete t._finishState;delete t._completionIds;
      const touched=new Set([t.id,...t.children.map(c=>c.id)]);
      b.tasks=b.tasks.filter(x=>!touched.has(x.generatedFrom)||x.touched||x.done||x.startedAt||x.elapsed);
      b.doingOrder=b.doingOrder.filter(x=>b.tasks.some(t=>t.id===x));
    }
  }
  function completeChild(b,id,childId,done){
    const t=b.tasks.find(x=>x.id===id),c=t?.children.find(x=>x.id===childId);
    if(!c||!!c.done===!!done)return;
    const family=new Set([childId]);for(let i=0;i<t.children.length;i++)for(const kid of t.children)if(family.has(kid.parentId))family.add(kid.id);
    const before=new Map(t.children.map(c=>[c.id,!!c.done]));
    const changedWinIds=[];
    for(const kid of t.children){
      if(!family.has(kid.id))continue;
      if(done&&!kid.done&&!t.children.some(x=>x.parentId===kid.id)){
        kid._winId=winner(b,kid,t.id,t.room);changedWinIds.push(kid._winId);followup(b,t,kid);
      }
      if(!done&&kid._winId){const winId=kid._winId;b.features.wins=b.features.wins.filter(w=>w.id!==winId);delete kid._winId;
        b.tasks=b.tasks.filter(x=>x.generatedFrom!==kid.id||x.touched||x.done||x.startedAt||x.elapsed);
      }
      kid.done=!!done;kid.elapsed=time(kid);kid.startedAt=0;
    }
    // Parent subtasks reflect the completion status of their children.
    for(let i=0;i<t.children.length;i++)for(const p of t.children){const children=t.children.filter(x=>x.parentId===p.id);if(children.length)p.done=children.every(x=>x.done);}
    const all=t.children.every(x=>x.done);
    if(done&&all&&!t.done){t.done=true;t.completedAt=new Date().toISOString();t._canUndoFamily=true;t.undoChildren=[...before.values()];t._completionIds=t.children.map(x=>x._winId).filter(Boolean);t._finishState={before:[...before].map(([id,done])=>({id,done,winId:''})),added:changedWinIds,nextDue:t.nextDue||''};if(repeat(t))t.nextDue=next(t,date());}
    if(!done&&t.done){t.done=false;t.completedAt='';delete t._finishState;}
  }
  function refresh(b,today=date()) {
    // A startup refresh NEVER reopens completed recurring work or rewrites history.
    // Upcoming occurrences are computed separately by schedule-core.
    for(const t of b.tasks)if(t.paused&&t.pauseUntil&&t.pauseUntil<=today)t.paused=false;
    // Laundry is independent of cleaning schedule. Start a weekly reminder only if idle.
    const f=b.features,offset=(weekday(today)+1)%7,saturday=plus(today,-offset);
    if(f.uniformPaused&&f.uniformPauseUntil&&f.uniformPauseUntil<=today)f.uniformPaused=false;
    if(weekday(today)===6&&!f.uniformPaused&&f.uniformIndex<0&&f.uniformWeek!==saturday){f.uniformIndex=0;f.uniformWeek=saturday;}
    return b;
  }
  function eligibleLeaves(b,roomId,today=date()) {
    return b.tasks.filter(t=>t.room===roomId&&!t.side&&!t.done&&!paused(t,today)&&(!t.nextDue||t.nextDue<=today))
      .flatMap(t=>{const overdue=t.dueDate?Math.max(0,Math.min(14,Math.floor((parseDay(today)-parseDay(t.dueDate))/86400000))):0;
        const factor={none:0,tiny:.14,small:.5,normal:1,big:2}[t.messImpact]??1;
        return (t.children.length?leaf(t).filter(c=>!c.done):[t]).map(c=>({id:c.id,impact:t.messImpact,weight:factor*(1+overdue*.25)}));});
  }
  function messLeaves(b,id,today=date()){return eligibleLeaves(b,id,today);}
  function mess(b,r){
    if(!r)return 0;
    const leaves=eligibleLeaves(b,r.id),count=leaves.filter(x=>x.impact!=='tiny').reduce((sum,x)=>sum+x.weight,0);
    let result=count/Math.max(14,Number(r.capacity)||14,count)*100+leaves.filter(x=>x.impact==='tiny').length;
    if(r.calibration){
      let c;try{c=typeof r.calibration==='string'?JSON.parse(r.calibration):r.calibration;}catch{c=null;}
      if(isObject(c)&&Number.isFinite(Number(c.percent))){const historical=isObject(c.weights)?c.weights:{},baseline=Object.values(historical).reduce((s,v)=>s+(Number(v)||0),0);
        const represented=leaves.filter(x=>x.id in historical&&x.impact!=='tiny').reduce((s,x)=>s+x.weight,0);
        const extra=leaves.filter(x=>!(x.id in historical)&&x.impact!=='tiny').reduce((s,x)=>s+x.weight,0);
        result=Math.max(0,Number(c.percent))*(baseline?represented/baseline:1)+extra*100/14+leaves.filter(x=>x.impact==='tiny').length;
      }
    }
    return Math.round(Math.max(0,Math.min(100,result))*10)/10;
  }
  function calibrate(b,id,percent){const r=b.rooms.find(x=>x.id===id);if(!r)throw Error('Room not found.');const n=Number(percent);if(!Number.isFinite(n)||n<0||n>100)throw Error('Mess must be 0–100%.');const leaves=eligibleLeaves(b,id);r.calibration=JSON.stringify({percent:n,weights:Object.fromEntries(leaves.filter(x=>x.impact!=='tiny').map(x=>[x.id,x.weight])),tinyIds:leaves.filter(x=>x.impact==='tiny').map(x=>x.id)});}
  function occurrences(b,start,end,roomId=''){
    const out=[];for(const t of b.tasks.filter(t=>repeat(t)&&!t.side&&!paused(t)&&(!roomId||t.room===roomId))){
      let day=t.nextDue||t.dueDate||next(t,start),limit=0;if(!parseDay(day))continue;
      while(day<=end&&limit++<4000){if(day>=start&&!t.skippedDates?.includes(day)){const shown=t.calendarMoves?.[day]||day;if(shown>=start&&shown<=end)out.push({task:t,original:day,date:shown});}const updated=next(t,day);if(updated<=day)break;day=updated;}
    }return out.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function laundryText(f,l){return l.step===0?f.wash:l.step===1?(l.route==='dryer'?f.dryerTransfer:f.railTransfer):(l.route==='dryer'?f.dryerFinish:f.railFinish);}
  function laundry(b,slot){const f=b.features,l=f.laundry.find(x=>x.slot===slot);if(!l)return;const before=clone(l);delete before._undo;const win=winner(b,{id:`laundry-${slot}-${uid()}`,title:laundryText(f,l),room:'laundry'},'', 'laundry');l._undo={load:before,win};l.step=(l.step+1)%3;l.selected=before.step===0;if(before.step===0)l.startedAt=Date.now();l.revision=(l.revision||0)+1;}
  function undoLaundry(b,slot){const l=b.features.laundry.find(x=>x.slot===slot);if(!l?._undo)return;const u=l._undo;b.features.wins=b.features.wins.filter(w=>w.id!==u.win);Object.keys(l).forEach(k=>delete l[k]);Object.assign(l,clone(u.load));}
  function uniform(b){const f=b.features;if(f.uniformIndex<0||f.uniformPaused)return;const snapshot={index:f.uniformIndex,steps:clone(f.uniformSteps),startedAt:f.uniformStartedAt||0};const win=winner(b,{id:`uniform-${uid()}`,title:f.uniformSteps[f.uniformIndex],room:'laundry'},'','laundry');f._uniformUndo={...snapshot,win};f.uniformStartedAt=/^Wash/.test(f.uniformSteps[f.uniformIndex])?Date.now():0;f.uniformIndex++;if(f.uniformIndex>=f.uniformSteps.length-1){const slot=Math.max(0,...f.laundry.map(l=>l.slot))+1;f.laundry.push({slot,step:2,route:'rail',selected:true,uniformWeek:f.uniformWeek,revision:0});f._uniformUndo.handoff=slot;f.uniformIndex=-1;}}
  function undoUniform(b){const f=b.features,u=f._uniformUndo;if(!u)return;if(u.handoff&&f.laundry.find(x=>x.slot===u.handoff)?.revision>0)throw Error('The laundry load has progressed. Undo was not applied.');f.laundry=f.laundry.filter(x=>x.slot!==u.handoff);f.uniformIndex=u.index;f.uniformSteps=u.steps;f.uniformStartedAt=u.startedAt;f.wins=f.wins.filter(w=>w.id!==u.win);delete f._uniformUndo;}
  function templateCopy(source,room,doing=false){const t=clone(source),ids=new Map(t.children.map(c=>[c.id,uid()]));return task({...t,id:uid(),room,templateId:source.id,done:false,doing:!!doing,elapsed:0,startedAt:0,nextDue:'',generatedFrom:'',completedAt:'',_completionIds:[],_finishState:undefined,children:t.children.map(c=>child({...c,id:ids.get(c.id),parentId:ids.get(c.parentId)||'',done:false,elapsed:0,startedAt:0,_winId:undefined}))});}
  function merge(b,incoming){const n=normalize(incoming),result=normalize(b);const roomIds=new Set(result.rooms.map(r=>r.id)),taskIds=new Set(result.tasks.map(t=>t.id));for(const r of n.rooms)if(!roomIds.has(r.id)){result.rooms.push(r);roomIds.add(r.id);}for(const t of n.tasks)if(!taskIds.has(t.id)){result.tasks.push(t);taskIds.add(t.id);}for(const id of n.doingOrder)if(taskIds.has(id)&&!result.doingOrder.includes(id))result.doingOrder.push(id);for(const key of ['items','wins','completionSummaries','templates','routines']){const have=new Set(result.features[key].map(x=>x.id));for(const item of n.features[key])if(!have.has(item.id)){result.features[key].push(item);have.add(item.id);}}return result;}
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
  return {id:ID,uid,clone,date,plus,months,board,features,task,child,normalize,paused,time,repeat,next,
    add,select,finish,completeChild,refresh,messLeaves,mess,cleanPercent,phrase,calibrate,occurrences,
    laundryText,laundry,undoLaundry,uniform,undoUniform,templateCopy,merge,focus,doing,move,sideTabs,uniformSteps:[...STANDARD_UNIFORM]};
});
