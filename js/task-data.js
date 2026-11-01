/* Tidy-ish Stage 07: Task Data summaries and user-confirmed old-history archiving. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TidyTaskData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const allowed = new Set(['7', '30', '90', 'all']);
  const dateKey = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  function descendants(root,start){const found=new Set([start]);for(let i=0;i<(root?.children||[]).length;i++)for(const c of root.children)if(found.has(c.parentId))found.add(c.id);return found;}
  function periodOf(value){const at=Date.parse(value||'');if(!Number.isFinite(at))return 'Undated';const d=new Date(at);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function ensurePeriod(map,period){if(!map.has(period))map.set(period,{period,count:0,points:0,validCount:0,excludedCount:0,notedCount:0,kinds:{}});return map.get(period);}
  function summarizePeriods(rows,archives,type){
    const groups=new Map();
    for(const row of rows){const g=ensurePeriod(groups,periodOf(row.at));g.count++;if(type==='completion')g.points+=Number.isFinite(Number(row.points))?Number(row.points):1;else{g.kinds[row.kind]=(g.kinds[row.kind]||0)+1;if(row.kind==='valid'&&!row.excludedFromLearning)g.validCount++;if(row.excludedFromLearning)g.excludedCount++;if(row.note)g.notedCount++;}}
    for(const row of archives){const period=row.period||'Undated',g=ensurePeriod(groups,period),count=Math.max(0,Number(row.count)||0);g.count+=count;if(type==='completion')g.points+=Number(row.points)||0;else{const kind=row.attemptKind||'unknown';g.kinds[kind]=(g.kinds[kind]||0)+count;if(kind==='valid'&&!row.excludedFromLearning)g.validCount+=Number(row.validCount??count)||0;if(row.excludedFromLearning)g.excludedCount+=count;g.notedCount+=Number(row.noteCount)||0;}}
    return [...groups.values()].sort((a,b)=>b.period.localeCompare(a.period));
  }
  function summarize(board, opts={}) {
    const period = allowed.has(String(opts.period)) ? String(opts.period) : '30';
    const roomId = typeof opts.roomId === 'string' ? opts.roomId : 'all';
    const now = opts.now instanceof Date ? new Date(opts.now.getTime()) : new Date(opts.now === undefined ? Date.now() : opts.now);
    if (!Number.isFinite(now.getTime())) throw Error('Invalid Task Data reference date.');
    const days = period === 'all' ? null : Number(period);
    const cutoff = days === null ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    const all = Array.isArray(board?.features?.wins) ? board.features.wins : [];
    const filtered=[];let undated=0;
    for (const w of all) {
      if (!w || typeof w !== 'object') continue;
      const winRoom = w.room || 'general';if (roomId !== 'all' && winRoom !== roomId) continue;
      const timestamp = typeof w.at === 'string' && w.at.trim() ? Date.parse(w.at) : NaN;
      if (!Number.isFinite(timestamp)) {if (cutoff === null) {filtered.push(w);undated++;}continue;}
      if (cutoff !== null && (timestamp < cutoff.getTime() || timestamp > now.getTime())) continue;
      filtered.push(w);
    }
    const archives=(Array.isArray(board?.features?.taskDataArchives)?board.features.taskDataArchives:[]).filter(x=>x?.kind==='completion'&&(roomId==='all'||(x.room||'general')===roomId));
    const byRoom=new Map();let points=0,minutes=0;
    for (const w of filtered) {const id=w.room||'general',row=byRoom.get(id)||{id,count:0};row.count++;byRoom.set(id,row);const p=Number(w.points),m=Number(w.minutes);if(Number.isFinite(p)&&p>0)points+=p;if(Number.isFinite(m)&&m>0)minutes+=m;}
    if(period==='all')for(const a of archives){const id=a.room||'general',row=byRoom.get(id)||{id,count:0};row.count+=Number(a.count)||0;byRoom.set(id,row);points+=Number(a.points)||0;minutes+=Number(a.minutes)||0;}
    const entries=[...byRoom.values()].sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
    const sorted=filtered.slice().sort((a,b)=>(Date.parse(b.at||'')||0)-(Date.parse(a.at||'')||0));
    const lastSeven=Array.from({length:7},(_,i)=>{const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(6-i));return {day:dateKey(day),count:0};});
    const daily=new Map(lastSeven.map(row=>[row.day,row]));for(const w of filtered){const at=typeof w.at==='string'?new Date(w.at):new Date(NaN);if(!Number.isFinite(at.getTime())||at.getTime()>now.getTime())continue;const record=daily.get(dateKey(at));if(record)record.count++;}
    let legacyArchive=0;for(const x of (Array.isArray(board?.features?.completionSummaries)?board.features.completionSummaries:[])){const count=Number(x?.count);if(Number.isFinite(count)&&count>0)legacyArchive+=count;}
    const archivedCount=archives.reduce((n,x)=>n+(Number(x.count)||0),0);
    return {period,roomId,count:filtered.length+(period==='all'?archivedCount:0),points,minutes,entries,wins:sorted,trend:lastSeven,undated,archiveCount:legacyArchive,archivedCount};
  }
  function perQuest(board,id,owner=''){
    const task=(board.tasks||[]).find(t=>t.id===id||t.children?.some(c=>c.id===id));
    const rootId=task?.id||id;
    const isChild=!!task&&task.id!==id;
    const family=isChild?descendants(task,id):new Set(task?[task.id,...task.children.map(c=>c.id)]:[id]);
    const wins=(board.features?.wins||[]).filter(w=>family.has(w.taskId)||(!isChild&&w.rootId===rootId)).sort((a,b)=>(Date.parse(b.at||'')||0)-(Date.parse(a.at||'')||0));
    // Each timer estimate belongs to the exact Quest ID, never a sibling subtask.
    const attempts=(board.features?.questTimings||[]).filter(r=>r.taskId===id).sort((a,b)=>(Date.parse(b.at||'')||0)-(Date.parse(a.at||'')||0));
    const archives=(board.features?.taskDataArchives||[]).filter(a=>family.has(a.taskId)||(!isChild&&a.rootId===rootId));
    const completionArchives=archives.filter(a=>a.kind==='completion');
    const attemptArchives=archives.filter(a=>a.kind==='attempt'&&a.taskId===id);
    const valid=attempts.filter(r=>r.kind==='valid'&&!r.excludedFromLearning&&Number(r.durationMs)>0);
    const mine=owner?valid.filter(r=>r.owner===owner):valid;
    const fastest=mine.length?Math.min(...mine.map(r=>Number(r.durationMs))):null;
    const fastestRow=mine.find(r=>Number(r.durationMs)===fastest);
    const slowest=mine.length?Math.max(...mine.map(r=>Number(r.durationMs))):null;
    const slowestRow=mine.find(r=>Number(r.durationMs)===slowest);
    const recent=mine.slice(0,8);let weighted=0,weight=0;recent.forEach((r,i)=>{const w=.78**i;weighted+=Number(r.durationMs)*w;weight+=w;});
    const visible=new Set(attempts.slice(0,8));if(fastestRow)visible.add(fastestRow);if(slowestRow)visible.add(slowestRow);for(const r of attempts)if(r.note)visible.add(r);
    const visibleAttempts=attempts.filter(r=>visible.has(r));
    const olderAttempts=attempts.filter(r=>!visible.has(r));
    const olderWins=wins.slice(12);
    const olderWinPeriods=summarizePeriods(olderWins,completionArchives,'completion');
    const olderAttemptPeriods=summarizePeriods(olderAttempts,attemptArchives,'attempt');
    const archiveCompletionCount=completionArchives.reduce((n,a)=>n+(Number(a.count)||0),0);
    const archiveAttemptCount=attemptArchives.reduce((n,a)=>n+(Number(a.count)||0),0);
    const archivedValid=attemptArchives.reduce((n,a)=>n+(Number(a.validCount??(a.attemptKind==='valid'&&!a.excludedFromLearning?a.count:0))||0),0);
    const lastDone=wins[0]?.at||null;
    return {taskId:id,title:(isChild?task.children.find(c=>c.id===id)?.title:task?.title)||wins[0]?.title||'Unknown task',count:wins.length+archiveCompletionCount,points:wins.reduce((n,w)=>n+(Number(w.points)||0),0)+completionArchives.reduce((n,a)=>n+(Number(a.points)||0),0),lastDone,wins,attempts,visibleAttempts,olderWinPeriods,olderAttemptPeriods,archives,validCount:valid.length+archivedValid,attemptCount:attempts.length+archiveAttemptCount,fastestMs:fastest,slowestMs:slowest,averageMs:weight?Math.round(weighted/weight):null};
  }
  function planArchive(board,id,beforeDate){
    const date=String(beforeDate||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Choose a valid date before removing history.');
    const [y,m,d]=date.split('-').map(Number),cutoff=new Date(y,m-1,d).getTime();if(!Number.isFinite(cutoff))throw Error('Choose a valid date before removing history.');
    const task=(board.tasks||[]).find(t=>t.id===id||t.children?.some(c=>c.id===id));if(!task)throw Error('Quest not found. No history was changed.');
    const isChild=task.id!==id;
    const family=new Set(task.id===id?[task.id,...task.children.map(c=>c.id)]:descendants(task,id));
    const wins=(board.features?.wins||[]),attempts=(board.features?.questTimings||[]);
    const latestTasks=new Set(),latestWinIds=new Set();for(const w of wins.filter(w=>family.has(w.taskId)||(!isChild&&w.rootId===task.id)).sort((a,b)=>(Date.parse(b.at||'')||0)-(Date.parse(a.at||'')||0))){if(!latestTasks.has(w.taskId)){latestTasks.add(w.taskId);latestWinIds.add(w.id);}}
    const attemptKeep=new Set();
    const groups=new Map();for(const r of attempts.filter(r=>family.has(r.taskId))){const key=String(r.taskId)+'\u0000'+String(r.owner||'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    for(const rows of groups.values()){
      const eligible=rows.filter(r=>r.kind==='valid'&&!r.excludedFromLearning&&Number(r.durationMs)>0).sort((a,b)=>(Date.parse(b.at||'')||0)-(Date.parse(a.at||'')||0));
      eligible.slice(0,8).forEach(r=>attemptKeep.add(r));if(eligible.length){attemptKeep.add(eligible.reduce((best,r)=>Number(r.durationMs)<Number(best.durationMs)?r:best));attemptKeep.add(eligible.reduce((best,r)=>Number(r.durationMs)>Number(best.durationMs)?r:best));}
      rows.filter(r=>r.note).forEach(r=>attemptKeep.add(r));
    }
    const matchesWin=w=>family.has(w.taskId)||(!isChild&&w.rootId===task.id);
    const removedWins=wins.filter(matchesWin).filter(w=>{const at=Date.parse(w.at||'');return Number.isFinite(at)&&at<cutoff&&!latestWinIds.has(w.id);});
    const removedAttempts=attempts.filter(r=>family.has(r.taskId)).filter(r=>{const at=Date.parse(r.at||'');return Number.isFinite(at)&&at<cutoff&&!attemptKeep.has(r);});
    return {taskId:id,rootId:task.id,beforeDate:date,cutoff,removedWins,removedAttempts};
  }
  function applyArchive(board,plan){
    if(!plan?.taskId||!Array.isArray(plan.removedWins)||!Array.isArray(plan.removedAttempts))throw Error('History removal plan is invalid. No history was changed.');
    const current=planArchive(board,plan.taskId,plan.beforeDate),winIds=new Set(plan.removedWins.map(x=>x.id)),attemptIds=new Set(plan.removedAttempts.map(x=>x.id));
    const removedWins=current.removedWins.filter(x=>winIds.has(x.id)),removedAttempts=current.removedAttempts.filter(x=>attemptIds.has(x.id));
    if(!board.features.taskDataArchives)board.features.taskDataArchives=[];
    const groups=new Map(),put=(key,row)=>{if(!groups.has(key))groups.set(key,row);else{const g=groups.get(key);g.count++;g.points+=row.points||0;g.minutes+=row.minutes||0;g.validCount+=row.validCount||0;g.noteCount+=row.noteCount||0;}};
    for(const w of removedWins){const period=periodOf(w.at),key=['completion',w.taskId,w.rootId||plan.rootId,w.room||'',period,w.person||''].join('|');put(key,{kind:'completion',taskId:w.taskId,rootId:w.rootId||plan.rootId,title:w.title||'',room:w.room||'',person:w.person||'Unattributed',period,count:1,points:Number.isFinite(Number(w.points))?Number(w.points):1,minutes:Number(w.minutes)||0,validCount:0,noteCount:0});}
    for(const r of removedAttempts){const period=periodOf(r.at),excluded=!!r.excludedFromLearning,key=['attempt',r.taskId,plan.rootId,r.owner||'',period,r.kind||'unknown',excluded].join('|');put(key,{kind:'attempt',taskId:r.taskId,rootId:plan.rootId,title:'',room:'',owner:r.owner||'Unattributed',period,attemptKind:r.kind||'unknown',excludedFromLearning:excluded,count:1,points:0,minutes:0,validCount:r.kind==='valid'&&!excluded?1:0,noteCount:r.note?1:0});}
    for(const [key,row] of groups){const safe=key.replace(/[^a-z0-9_-]+/gi,'-').slice(0,56);board.features.taskDataArchives.push({id:'tda-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)+'-'+safe,...row});}
    const removedWinSet=new Set(removedWins);const removedAttemptSet=new Set(removedAttempts);
    board.features.wins=board.features.wins.filter(w=>!removedWinSet.has(w));board.features.questTimings=board.features.questTimings.filter(r=>!removedAttemptSet.has(r));
    return {winsRemoved:removedWins.length,attemptsRemoved:removedAttempts.length,pointsPreserved:removedWins.reduce((n,w)=>n+(Number.isFinite(Number(w.points))?Number(w.points):1),0)};
  }
  return Object.freeze({summarize,perQuest,planArchive,applyArchive});
});
