/* Tidy-ish Step 02: read-through Quest Library, not an independent task database.
   Real task IDs/history remain in board.tasks. Suggestions are opt-in only. */
(function(root,factory){
  const source=typeof module==='object'&&module.exports?require('./base-schedule-95.js'):root.TidyBase95;
  const api=factory(source||[]);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TidyQuestLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(BASE){
'use strict';
const roomFor=category=>({'Bathroom':'bathroom','Master Bedroom':'master',"Penny's Bedroom":'penny','Living Room':'living','Kitchen':'kitchen','Entrance':'entrance','Upstairs Landing':'cats','Craft & Storage':'storage'})[category]||'';
const SUGGESTIONS=Object.freeze(BASE.map(row=>Object.freeze({id:'preset:'+row.id,sourceId:row.id,room:roomFor(row.category),roomLabel:roomFor(row.category)?'':'Whole house',title:row.title,taskType:row.taskType||'cleaning',tags:[...(row.tags||[]),row.section||'Room tasks'],priority:Number(row.priority)||3,messImpact:'normal',estimate:Number(row.minutes)||0,repeatDays:Number(row.repeatDays)||0,repeatMonths:Number(row.repeatMonths)||0,seasonMonth:Number(row.seasonMonth)||0,seasonDay:Number(row.seasonDay)||15,checkDays:Number(row.checkDays)||0,conditionMode:row.conditionMode||'as-needed',subtasks:row.subtasks||[],tools:row.tools||'',notes:row.notes||'',section:row.section||'Room tasks',kind:'suggestion'})));
const GROUPS=[
 ['toilet','loo','wc','lavatory'],['bathroom','washroom','bath'],['vacuum','hoover','vacuuming','carpet'],
 ['rubbish','trash','bin','bins','garbage'],['worktop','worktops','counter','counters','countertop','countertops','surface','surfaces'],
 ['sink','basin'],['tap','taps','faucet'],['tidy','organise','organize','sort','declutter'],
 ['mop','wash','floor'],['dust','dusting'],['shelf','shelves'],['glass','mirror','mirrors']
];
const equivalents=new Map();for(const group of GROUPS)for(const word of group)equivalents.set(word,new Set(group));
const words=x=>String(x||'').toLocaleLowerCase('en-GB').match(/[\p{L}\p{N}]+/gu)||[];
const fold=x=>words(x).join(' ');
const tags=t=>Array.isArray(t.tags)?t.tags.map(x=>String(x).trim()).filter(Boolean):typeof t.tags==='string'?t.tags.split(/[,\n]/).map(x=>x.trim()).filter(Boolean):[];
function kindAllowed(t){
 if(t.side||t.archived||t.littleOften||t.dailyGrind||t.careTask||t.scheduleMakerManaged||t.tidyScheduleV3)return false;
 if(['care','laundry','little-often','pet','plant'].includes(t.taskType))return false;
 // Legacy care tasks without taskType exist in older boards.
 if(/^(cat tray|fish tank|isopod|water plants|feed (?:the )?fish|feed (?:the )?cat)/i.test(t.title||''))return false;
 return true;
}
function scoring(item,q){
 if(!q.trim())return 1;
 const all=[...new Set(words(q))];if(!all.length)return 1;
 const title=fold(item.title),sub=(item.children||[]).map(c=>fold(c.title)).join(' '),tag=tags(item).map(fold).join(' ');
 const note=fold(item.notes),place=fold(item.roomName),extra=[title,sub,tag,note].join(' ');
 let score=0;
 for(const term of all){
  const aliases=equivalents.get(term)||new Set([term]);
  let value=0;
  const contains=(s)=>words(s).some(x=>x===term||term.length>=4&&x.startsWith(term));
  if(contains(title))value=50;
  else if(contains(sub))value=36;
  else if(contains(tag))value=30;
  else if(contains(note))value=18;
  else if([...aliases].some(a=>words(extra).some(x=>x===a||x.startsWith(a)&&a.length>=4)))value=14;
  else if(words(place).some(x=>x===term||x.startsWith(term)))value=4;
  if(!value)return 0;
  score+=value;
 }
 return score;
}
const MATCH_STOP_WORDS=new Set(['a','an','and','down','for','of','the','to','up','your','my']);
function matchWords(value){return words(value).filter(word=>!MATCH_STOP_WORDS.has(word)).slice(0,24);}
function editDistance(a,b){
 if(a===b)return 0;if(Math.abs(a.length-b.length)>2)return 3;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const current=[i];let rowMin=i;
  for(let j=1;j<=b.length;j++){
   const value=Math.min(current[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
   current[j]=value;rowMin=Math.min(rowMin,value);
  }
  if(rowMin>2)return 3;previous=current;
 }
 return previous[b.length];
}
function wordSimilarity(a,b){
 if(a===b)return 1;
 if((equivalents.get(a)||new Set()).has(b))return .94;
 if(Math.min(a.length,b.length)>=4&&(a.startsWith(b)||b.startsWith(a)))return .86;
 const length=Math.max(a.length,b.length),distance=editDistance(a,b),limit=length>=8?2:1;
 return distance<=limit&&1-distance/length>=.72?1-distance/length:0;
}
function titleSimilarity(query,title){
 const q=matchWords(query),target=matchWords(title);if(!q.length||!target.length)return {score:0,qCoverage:0,tCoverage:0,bestWord:0};
 const pairs=[];
 q.forEach((left,qi)=>target.forEach((right,ti)=>{const value=wordSimilarity(left,right);if(value)pairs.push({qi,ti,value});}));
 pairs.sort((a,b)=>b.value-a.value);
 const usedQ=new Set(),usedT=new Set();let total=0,bestWord=0;
 for(const pair of pairs){if(usedQ.has(pair.qi)||usedT.has(pair.ti))continue;usedQ.add(pair.qi);usedT.add(pair.ti);total+=pair.value;bestWord=Math.max(bestWord,pair.value);}
 const qCoverage=total/q.length,tCoverage=total/target.length,score=qCoverage+tCoverage?2*qCoverage*tCoverage/(qCoverage+tCoverage):0;
 return {score,qCoverage,tCoverage,bestWord};
}
function savedTaskCandidates(board){
 const rooms=new Map((board.rooms||[]).map(r=>[r.id,r.name])),hidden=new Set(board.features?.hiddenTemplates||[]),candidates=[],seen=new Set();
 const add=(item,sourceType)=>{
  if(!item||!item.title||!kindAllowed(item))return;
  const room=String(item.room||''),key=`${room}|${fold(item.title)}`;
  const previous=seen.has(key);
  if(previous){if(sourceType!=='template')return;const at=candidates.findIndex(row=>row.key===key);if(at>=0)candidates.splice(at,1);}
  seen.add(key);candidates.push({...item,sourceType,room,roomName:rooms.get(room)||'General',key});
 };
 for(const item of board.tasks||[])if(!item.archived)add(item,'task');
 for(const item of board.features?.templates||[])if(!hidden.has(item.id))add(item,'template');
 return candidates;
}
function matchSavedTask(board,query,room=''){
 const value=String(query||'').trim();if(value.length>160)return null;
 const normalized=fold(value);if(!normalized||matchWords(value).length===0)return null;
 const candidates=savedTaskCandidates(board).map(item=>{
  const similarity=titleSimilarity(value,item.title),sameRoom=!!room&&item.room===room;
  const oneWordAllowed=matchWords(value).length===1&&sameRoom&&similarity.qCoverage>=.9&&similarity.bestWord>=.9;
  const strong=similarity.score>=.74&&similarity.qCoverage>=.67&&similarity.tCoverage>=.55;
  return {...item,matchScore:similarity.score+(sameRoom ? .1 : 0),matchSimilarity:similarity,sameRoom,eligible:strong||oneWordAllowed};
 }).filter(item=>item.eligible).sort((a,b)=>b.matchScore-a.matchScore||Number(b.sameRoom)-Number(a.sameRoom)||Number(b.sourceType==='template')-Number(a.sourceType==='template'));
 const best=candidates[0];if(!best)return null;
 if(candidates[1]&&best.matchScore-candidates[1].matchScore<.08)return null;
 return best;
}
// Autocomplete is a bounded, read-only list: literal substrings first,
// then known alternative words and close spelling. Never inserts a task.
function isDoLaterTask(t,M){
 return !!(t&&M&&kindAllowed(t)&&!t.done&&!t.doing&&!M.paused(t)&&!M.repeat(t)&&!t.calendarEnabled&&!t.occasionKind&&!t.seasonMonth&&!t.nextDue);
}
function selectDoLaterTask(board,id,M){
 const t=(board.tasks||[]).find(row=>row.id===id);
 if(t&&t.doing&&!t.done)return false;
 if(!isDoLaterTask(t,M))throw Error('This Do Later task is no longer available. Nothing changed.');
 M.select(board,id,true);return true;
}
function autocompleteSavedTasks(board,query,room='',limit=6,M=null){
 const value=String(query||'').trim();
 if(!value||value.length>160)return [];
 const normalized=fold(value),terms=matchWords(value);
 if(!normalized||!terms.length)return [];
 const max=Math.max(1,Math.min(8,Number(limit)||6));
 const later=M?(board.tasks||[]).filter(t=>isDoLaterTask(t,M)).map(t=>({...t,sourceType:'do-later',room:String(t.room||''),roomName:(board.rooms||[]).find(r=>r.id===t.room)?.name||'General'})):[];
 const laterIds=new Set(later.map(t=>t.id));
 const candidates=[...later,...savedTaskCandidates(board).filter(t=>t.sourceType!=='task'||!laterIds.has(t.id))];
 return candidates.map(item=>{
  const title=fold(item.title),sameRoom=!!room&&item.room===room;
  let rank=0;
  if(title===normalized)rank=500;
  else if(title.startsWith(normalized))rank=400;
  else if(title.includes(normalized))rank=300;
  else if(value.length>=3){
   const similar=titleSimilarity(value,item.title);
   const strong=similar.score>=.74&&similar.qCoverage>=.67&&similar.tCoverage>=.55;
   const singleWord=terms.length===1&&similar.qCoverage>=.85&&similar.bestWord>=.85;
   if(strong||singleWord)rank=150+similar.score*100;
  }
  return {...item,autocompleteRank:rank?rank+(sameRoom?15:0):0,sameRoom};
 }).filter(item=>item.autocompleteRank>0)
  .sort((a,b)=>Number(b.sameRoom)-Number(a.sameRoom)||b.autocompleteRank-a.autocompleteRank||Number(b.sourceType==='do-later')-Number(a.sourceType==='do-later')||a.title.localeCompare(b.title)||a.roomName.localeCompare(b.roomName))
  .slice(0,max);
}
function draftFromSavedTask(item){
 if(!item)return null;
 return {
  title:String(item.title||''),children:(item.children||[]).map(child=>({title:String(child.title||'')})),
  tools:String(item.tools||''),notes:String(item.notes||''),estimate:Number(item.estimate)||0,
  priority:Number(item.priority)||3,effort:String(item.effort||''),messImpact:String(item.messImpact||'normal'),
  tags:tags(item),taskType:String(item.taskType||'cleaning')
 };
}
function findDuplicateTask(board,title,room='',side=false,excludeId=''){
 const normalized=fold(title);if(!normalized)return null;
 return (board.tasks||[]).find(item=>item.id!==excludeId&&!item.archived&&!!item.side===!!side&&String(item.room||'')===String(room||'')&&fold(item.title)===normalized)||null;
}
function hasActiveDuplicate(board,title,room='',side=false,excludeId=''){
 const match=findDuplicateTask(board,title,room,side,excludeId);return !!match&&!match.done;
}
function catalogue(board,opts={}){
 const rooms=new Map((board.rooms||[]).map(r=>[r.id,r.name]));
 const hidden=new Set(board.features?.hiddenTemplates||[]),existing=new Set();
 const active=(board.tasks||[]).filter(kindAllowed).map(t=>({...t,kind:'task',roomName:rooms.get(t.room)||'General',tags:tags(t)}));
 for(const t of active)existing.add(`${t.room}|${fold(t.title)}`);
 const templates=(board.features?.templates||[]).filter(t=>!hidden.has(t.id)&&kindAllowed(t))
  .map(t=>({...t,kind:'template',roomName:rooms.get(t.room)||'General',tags:tags(t)}));
 for(const t of templates)existing.add(`${t.room}|${fold(t.title)}`);
 const suggestions=SUGGESTIONS.filter(t=>(!t.room||rooms.has(t.room))&&!existing.has(`${t.room}|${fold(t.title)}`)&&!active.some(x=>fold(x.title)===fold(t.title)&&(!t.room||!x.room||x.room===t.room)))
  .map(t=>({...t,roomName:t.room?rooms.get(t.room):t.roomLabel||'Whole house',tags:tags(t)}));
 const options={room:'all',kind:'all',priority:'all',tag:'',query:'',...opts};
 return [...active,...templates,...suggestions].filter(t=>
   (options.room==='all'||t.room===options.room||!t.room)&&
   (options.kind==='all'||t.kind===options.kind)&&
   (options.priority==='all'||Number(t.priority)===Number(options.priority))&&
   (!options.tag||tags(t).some(tag=>fold(tag)===fold(options.tag)))
 ).map(t=>({...t,searchScore:scoring(t,options.query)})).filter(t=>t.searchScore>0)
  .sort((a,b)=>b.searchScore-a.searchScore||({task:0,template:1,suggestion:2}[a.kind]-{task:0,template:1,suggestion:2}[b.kind])||a.title.localeCompare(b.title));
}
function availableTags(board){return [...new Set([...board.tasks,...(board.features?.templates||[]),...SUGGESTIONS].filter(kindAllowed).flatMap(tags))].sort((a,b)=>a.localeCompare(b));}
function suggestion(id){return SUGGESTIONS.find(s=>s.id===id)||null;}
function addSuggestion(board,id,M){
 const choice=suggestion(id);if(!choice||choice.room&&!board.rooms.some(r=>r.id===choice.room))throw Error('This library suggestion is unavailable.');
 const matching=board.tasks.find(t=>fold(t.title)===fold(choice.title)&&(!choice.room||!t.room||t.room===choice.room));
 if(matching)return {id:matching.id,added:false};
 const today=M.date(),seasonal=choice.seasonMonth&&globalThis.TidyOccasional?.seasonNext?globalThis.TidyOccasional.seasonNext(choice.seasonMonth,new Date(today+'T12:00:00'),choice.seasonDay):'';
 const nextDue=seasonal|| (choice.repeatMonths?M.months(today,choice.repeatMonths):choice.repeatDays?M.plus(today,choice.repeatDays):'');
 const occasional=['Occasional','Seasonal'].includes(choice.section)&&(choice.repeatMonths>=2||choice.seasonMonth>0),idForTask=occasional&&choice.sourceId?'tidy-occasional:'+choice.sourceId:M.uid();
 const created=M.task({id:idForTask,room:choice.room,title:choice.title,priority:choice.priority,messImpact:choice.messImpact,taskType:choice.taskType,tags:[...choice.tags],estimate:choice.estimate,repeatDays:choice.repeatDays,repeatMonths:choice.repeatMonths,seasonMonth:choice.seasonMonth,seasonDay:choice.seasonDay,nextDue,occasionKind:occasional?'occasional':'',calendarEnabled:occasional,occasionSourceId:occasional?choice.sourceId:'',checkDays:choice.checkDays,conditionMode:choice.conditionMode,tools:choice.tools,notes:choice.notes,section:choice.section,source:'optional-library',children:[]});
 created.children=choice.subtasks.map(x=>M.child({title:typeof x==='string'?x:x.title||'',followupTitle:typeof x==='string'?'':x.followupTitle||'',parentId:created.id}));
 M.add(board,created);return {id:created.id,added:true};
}
// Custom-library visibility is a projection, never a task deletion or history mutation.
const CUSTOM_VISIBLE_MS=30*24*60*60*1000;
function isCustomTask(t){
 if(!t||typeof t.id!=='string'||!String(t.title||'').trim())return false;
 if(t.archived||t.generatedFrom||t.templateId||t.scheduleMakerManaged||t.tidyScheduleV3||t.littleOften||t.dailyGrind||t.careTask||t.occasionKind||t.occasionSourceId||t.baseScheduleKey)return false;
 if(t.source&& !['custom','manual','user'].includes(t.source))return false;
 return kindAllowed({...t,side:false});
}
function linkedTemplate(board,t){return (board.features?.templates||[]).find(x=>x.sourceTaskId===t.id)||null;}
function matchesLibrary(t,opts){return (opts.room==='all'||t.room===opts.room)&&(opts.priority==='all'||Number(t.priority)===Number(opts.priority))&&(!opts.tag||tags(t).some(tag=>fold(tag)===fold(opts.tag)))&&scoring(t,opts.query)>0;}
function libraryRows(board,options={}){
 const opts={room:'all',priority:'all',tag:'',query:'',...options},now=new Date(opts.now??Date.now()).getTime();if(!Number.isFinite(now))throw Error('Invalid library reference date.');
 const hidden=new Set(board.features?.hiddenCustomLibraryIds||[]),hiddenTemplates=new Set(board.features?.hiddenTemplates||[]),names=new Map((board.rooms||[]).map(r=>[r.id,r.name]));
 const decorate=(t,kind)=>({...t,kind,roomName:names.get(t.room)||'General',tags:tags(t),hidden:kind==='template'&&hiddenTemplates.has(t.id)});
 const sort=(a,b)=>scoring(b,opts.query)-scoring(a,opts.query)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id);
 const custom=(board.tasks||[]).filter(t=>isCustomTask(t)&&!linkedTemplate(board,t)&&!hidden.has(t.id)).filter(t=>{const created=Date.parse(t.createdAt);return t.libraryCreationUnknown===true||!Number.isFinite(created)||created>now||now-created<CUSTOM_VISIBLE_MS;}).map(t=>decorate(t,'custom')).filter(t=>matchesLibrary(t,opts)).sort(sort);
 const saved=(board.features?.templates||[]).map(t=>decorate(t,'template')).filter(t=>matchesLibrary(t,opts)).sort(sort);
 return {custom,saved};
}
function hideCustom(board,id,now=Date.now()){
 if(!libraryRows(board,{now}).custom.some(t=>t.id===id))throw Error('This custom library entry is no longer available.');
 board.features.hiddenCustomLibraryIds=[...new Set([...(board.features.hiddenCustomLibraryIds||[]),id])];
}
function saveCustom(board,id,M,now=Date.now()){
 if(!libraryRows(board,{now}).custom.some(t=>t.id===id))throw Error('This custom library entry is no longer available.');
 return saveFromTask(board,id,M);
}
function saveFromTask(board,id,M){
 const original=(board.tasks||[]).find(t=>t.id===id);if(!original)throw Error('Task not found.');
 if(linkedTemplate(board,original)||(board.features.templates||[]).some(t=>t.id===original.templateId))throw Error('This task already has a saved reusable template.');
 // Explicit template saving preserves definitions; autocomplete remains a smaller, non-scheduling draft.
 // Allowlist rather than cloning a live occurrence (which can contain history, timers or shared IDs).
 const fields={...draftFromSavedTask(original),room:original.room,side:!!original.side,sideKind:original.sideKind||'organisation',checkDays:Number(original.checkDays)||0,conditionMode:original.conditionMode||'as-needed',showInSuggestions:original.showInSuggestions!==false};
 const definitionKeys=['attention','area','image','followupTitle','rankPriorityWeight','rankRecencyWeight','rankMessWeight','repeatDays','repeatMonths','repeatWeekdays','repeatRestDays','seasonMonth','seasonDay','oneOff','warningEnabled','warningFirstDue','warningRepeatDays','warningAmberDays','warningRedDays','warningFlashingDays'];
 for(const key of definitionKeys)if(original[key]!==undefined)fields[key]=M.clone(original[key]);
 // Completed shared occurrences have their live interval cleared when the next occurrence is created.
 // Recover only the stored repeat definition, not the occurrence, next due date or undo state.
 const priorRepeat=original.done&&original._cycle?.next&&original._cycle.original;
 if(priorRepeat&&!Number(original.repeatDays)&&!Number(original.repeatMonths)&&M.repeat(priorRepeat)){
  for(const key of ['repeatDays','repeatMonths','repeatWeekdays','repeatRestDays'])if(priorRepeat[key]!==undefined)fields[key]=M.clone(priorRepeat[key]);
 }
 // Ordinary tasks may have an explicitly chosen calendar definition. Never copy a managed/generated
 // occurrence's calendar placement, schedule ownership, current due dates or per-occurrence overrides.
 if(!original.occasionKind&&!original.occasionSourceId&&!original.scheduleMakerManaged&&!original.tidyScheduleV3&&!original.scheduleSpec&&!original.generatedFrom&&!original.baseScheduleKey){
  if(typeof original.calendarEnabled==='boolean')fields.calendarEnabled=original.calendarEnabled;
  const calendar=original.calendarSchedule;
  if(calendar&&['once','days','months'].includes(calendar.unit))fields.calendarSchedule={firstDue:calendar.firstDue||'',unit:calendar.unit,every:calendar.every};
 }
 const ids=new Map((original.children||[]).map(c=>[c.id,M.uid()]));
 const saved=M.task({...fields,sourceTaskId:original.id,children:(original.children||[]).map(c=>M.child({id:ids.get(c.id),parentId:ids.get(c.parentId)||'',title:c.title,tools:c.tools||'',notes:c.notes||'',estimate:Number(c.estimate)||0,followupTitle:c.followupTitle||'',oneOff:!!c.oneOff}))});
 board.features.templates.unshift(saved);return saved;
}
function removeSaved(board,id){
 if(!(board.features.templates||[]).some(t=>t.id===id))throw Error('Saved task not found.');
 board.features.templates=board.features.templates.filter(t=>t.id!==id);board.features.hiddenTemplates=(board.features.hiddenTemplates||[]).filter(key=>key!==id);
}
function activateSaved(board,id,selectedRooms,doing,M){
 const t=(board.features.templates||[]).find(x=>x.id===id);if(!t||(board.features.hiddenTemplates||[]).includes(id))throw Error('Saved task not available.');
 for(const room of [...new Set(selectedRooms)]){
  if(!board.rooms.some(r=>r.id===room&&!r.archived))throw Error('Choose an available room.');
  const active=board.tasks.find(x=>x.room===room&&!x.archived&&!!x.side===!!t.side&&(x.templateId===id||x.id===t.sourceTaskId));
  if(active){if(active.done){if(active.side)throw Error('This completed side task is kept in history. Add the reusable task to another room or edit the template.');M.reactivate(board,active.id);}if(doing)M.select(board,active.id,true);}
  else {const duplicate=findDuplicateTask(board,t.title,room,!!t.side);if(duplicate)throw Error('A task with this title already exists in this room. Choose or edit that task instead.');M.add(board,M.templateCopy(t,room,doing));}
 }
}
return Object.freeze({catalogue,availableTags,suggestion,addSuggestion,kindAllowed,scoring,matchSavedTask,autocompleteSavedTasks,isDoLaterTask,selectDoLaterTask,draftFromSavedTask,findDuplicateTask,hasActiveDuplicate,isCustomTask,linkedTemplate,libraryRows,hideCustom,saveCustom,saveFromTask,removeSaved,activateSaved,SUGGESTIONS});
});
