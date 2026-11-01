/* Independent-household creation: converts the CURRENT browser board only.
 * New household creation is atomic on the server; old households are untouched. */
(function(root){'use strict';
 const M=root.TidyModel||(typeof require==='function'?require('./model.js'):null);
 const S=root.TidySharedModel||(typeof require==='function'?require('./sharing-model.js'):null);
 const blank=()=>({tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]});
 function prepare(board,account,selection='all'){
  if(!board||!board.features||!Array.isArray(board.tasks)||!Array.isArray(board.features.wins)||!account)throw Error('Current board and signed-in account required.');
  const original=M.clone(board);
  delete original.features.browserSync;delete original.features.connectedHouse;delete original.features.householdSync;
  original.features.householdName='';
  original.features.locationTabs=[{id:'household',name:'Household',order:0}];original.features.locationAreas=[];original.features.locationEntries=[];original.features.locationMoves=[];original.features.locationTrash=[];
  const chooseAll=selection==='all';
  if(!chooseAll){
   if(!Array.isArray(selection)||selection.some(id=>typeof id!=='string'))throw Error('Choose All, None or an explicit set of task IDs. No work changed.');
   const picked=new Set(selection),available=new Set(original.tasks.map(t=>t.id));
   for(const id of picked)if(!available.has(id))throw Error('A selected task no longer exists. Refresh the transfer preview.');
   original.tasks=original.tasks.filter(t=>picked.has(t.id));
   const allowed=new Set(original.tasks.flatMap(t=>[t.id,...t.children.map(c=>c.id)]));
   original.doingOrder=original.doingOrder.filter(id=>allowed.has(id));
   // Preserve history only for selected tasks, not other tasks, care, laundry or unrelated day symbols.
   original.features.wins=original.features.wins.filter(w=>allowed.has(w.taskId)||allowed.has(w.rootId));
   original.features.questTimings=(original.features.questTimings||[]).filter(r=>allowed.has(r.taskId));
   original.features.activityDiary={annotations:{},earned:[]};
   original.features.items=(original.features.items||[]).filter(i=>!['homeless','laundry'].includes(i.kind));
   // Reset household-wide cycles and unrelated older aggregate records in a partial transfer.
   const defaults=M.features();
   original.features.laundry=defaults.laundry;
   for(const key of ['uniformIndex','uniformWeek','uniformPaused','uniformSteps'])original.features[key]=defaults[key];
   original.features.completionSummaries=[];
   original.features.focusSessions=[];
   original.features.routines=[];
   original.features.templates=[];
   original.features.hiddenTemplates=[];
  }
  const beforeTasks=original.tasks.flatMap(t=>[t,...t.children]);
  const unique=rows=>new Set(rows.map(x=>x.id)).size===rows.length;
  if(!unique(beforeTasks)||!unique(original.features.wins))throw Error('Duplicate local task or completion ID. Nothing sent.');
  const payload=S.project(original,blank(),account);
  // importRaw already understands archival summaries; explicitly include them in the
  // one-time full-household transfer. Selection excludes unrelated aggregated history.
  if(chooseAll&&original.features.completionSummaries?.length)payload.completionArchive=M.clone(original.features.completionSummaries);
  S.validateRaw(payload);
  const imported=S.importRaw(M.clone(payload));
  const afterTasks=imported.tasks.flatMap(t=>[t,...t.children]);
  if(beforeTasks.length!==afterTasks.length||original.features.wins.length!==imported.features.wins.length)throw Error('A task or completion was lost during sharing conversion. Nothing sent.');
  if(chooseAll&&JSON.stringify(original.features.completionSummaries||[])!==JSON.stringify(imported.features.completionSummaries||[]))throw Error('Archived history failed to round-trip. Nothing sent.');
  const compareWin=w=>[w.id,w.taskId,w.at,w.points??1,w.person||'Unattributed'];
  const a=original.features.wins.map(compareWin).sort((x,y)=>String(x[0]).localeCompare(String(y[0])));
  const b=imported.features.wins.map(compareWin).sort((x,y)=>String(x[0]).localeCompare(String(y[0])));
  if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Completion identities, dates, people or points did not round-trip. Nothing sent.');
  for(const t of beforeTasks){if(!afterTasks.some(x=>x.id===t.id))throw Error('Task identity could not be preserved: '+t.id);}
  return {payload,local:original,imported,transferMode:chooseAll?'all':selection.length?'selected':'none',counts:{tasks:original.tasks.length,subtasks:beforeTasks.length-original.tasks.length,completions:original.features.wins.length,rooms:original.rooms.length}};
 }
 const api={prepare};root.TidyFreshHouse=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
