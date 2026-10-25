/* Independent-household creation: converts the CURRENT browser board only.
 * New household creation is atomic on the server; old households are untouched. */
(function(root){'use strict';
 const M=root.TidyModel||(typeof require==='function'?require('./model.js'):null);
 const S=root.TidySharedModel||(typeof require==='function'?require('./sharing-model.js'):null);
 const blank=()=>({tasks:[],side:[],rooms:[],wins:[],settings:[],homeless:[],sideTabs:[]});
 function prepare(board,account){
  if(!board||!board.features||!Array.isArray(board.tasks)||!Array.isArray(board.features.wins)||!account)throw Error('Current board and signed-in account required.');
  const original=M.clone(board);
  delete original.features.browserSync;delete original.features.connectedHouse;delete original.features.householdSync;
  const beforeTasks=original.tasks.flatMap(t=>[t,...t.children]);
  const unique=rows=>new Set(rows.map(x=>x.id)).size===rows.length;
  if(!unique(beforeTasks)||!unique(original.features.wins))throw Error('Duplicate local task or completion ID. Nothing sent.');
  const payload=S.project(original,blank(),account);
  S.validateRaw(payload);
  const imported=S.importRaw(M.clone(payload));
  const afterTasks=imported.tasks.flatMap(t=>[t,...t.children]);
  if(beforeTasks.length!==afterTasks.length||original.features.wins.length!==imported.features.wins.length)throw Error('A task or completion was lost during sharing conversion. Nothing sent.');
  const compareWin=w=>[w.id,w.taskId,w.at,w.points??1,w.person||'Unattributed'];
  const a=original.features.wins.map(compareWin).sort((x,y)=>String(x[0]).localeCompare(String(y[0])));
  const b=imported.features.wins.map(compareWin).sort((x,y)=>String(x[0]).localeCompare(String(y[0])));
  if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Completion identities, dates, people or points did not round-trip. Nothing sent.');
  for(const t of beforeTasks){if(!afterTasks.some(x=>x.id===t.id))throw Error('Task identity could not be preserved: '+t.id);}
  return {payload,local:original,imported,counts:{tasks:original.tasks.length,subtasks:beforeTasks.length-original.tasks.length,completions:original.features.wins.length,rooms:original.rooms.length}};
 }
 const api={prepare};root.TidyFreshHouse=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
