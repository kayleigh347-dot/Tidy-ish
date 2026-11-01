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
 const occasional=choice.repeatMonths>=2||choice.seasonMonth>0,idForTask=occasional&&choice.sourceId?'tidy-occasional:'+choice.sourceId:M.uid();
 const created=M.task({id:idForTask,room:choice.room,title:choice.title,priority:choice.priority,messImpact:choice.messImpact,taskType:choice.taskType,tags:[...choice.tags],estimate:choice.estimate,repeatDays:choice.repeatDays,repeatMonths:choice.repeatMonths,seasonMonth:choice.seasonMonth,seasonDay:choice.seasonDay,nextDue,occasionKind:occasional?'occasional':'',calendarEnabled:occasional,occasionSourceId:occasional?choice.sourceId:'',checkDays:choice.checkDays,conditionMode:choice.conditionMode,tools:choice.tools,notes:choice.notes,section:choice.section,source:'optional-library',children:[]});
 created.children=choice.subtasks.map(x=>M.child({title:typeof x==='string'?x:x.title||'',followupTitle:typeof x==='string'?'':x.followupTitle||'',parentId:created.id}));
 M.add(board,created);return {id:created.id,added:true};
}
return Object.freeze({catalogue,availableTags,suggestion,addSuggestion,kindAllowed,scoring,SUGGESTIONS});
});
