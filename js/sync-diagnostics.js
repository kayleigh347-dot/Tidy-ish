(function(root){
 'use strict';
 let session=null,finalSummary=null;
 const reasons=new Set(['read-failed','save-failed','merge-failed','not-captured']);
 const statuses=new Set(['request-failed','response-received','parse-failed','save-acknowledged','rejected','not-needed','unverified','verified-present','missing-later','unavailable']);
 const asRows=value=>Array.isArray(value)?value:null;
 function shuffledLabels(){const labels=Array.from({length:26},(_,i)=>`Member ${String.fromCharCode(65+i)}`);for(let i=labels.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[labels[i],labels[j]]=[labels[j],labels[i]];}return labels;}
 function memberLabel(key){if(!session||key==null||key==='')return 'Unattributed';const id=String(key);if(!session.memberLabels.has(id)){const n=session.memberLabels.size,label=session.labelPool.pop()||`Member ${n+1}`;session.memberLabels.set(id,label);}return session.memberLabels.get(id);}
 function actorFor(type,row){if(/Completion|wins/i.test(type))return row?._actor||row?.completedBy||'';if(/Attempt/i.test(type))return row?.memberId||row?.ownerId||row?.createdById||'';return '';}
 function groups(data,kind){
  if(kind==='board'){
   const f=data?.features;if(!f||!Array.isArray(f.wins)||!Array.isArray(f.questTimings))return null;
   const archives=Array.isArray(f.taskDataArchives)?f.taskDataArchives:[];
   return {completions:f.wins,timerAttempts:f.questTimings,completionArchiveSummaries:[...(Array.isArray(f.completionSummaries)?f.completionSummaries:[]),...archives.filter(row=>row?.kind==='completion')],attemptArchiveSummaries:archives.filter(row=>row?.kind==='attempt')};
  }
  if(kind==='task-data'){
   const required=['sourceWins','selectedWins','displayedWins','sourceAttempts','selectedAttempts','displayedAttempts','completionArchives','attemptArchives'];
   if(!required.every(key=>Array.isArray(data?.[key])))return null;
   return {sourceCompletions:data.sourceWins,selectedCompletions:data.selectedWins,displayedCompletions:data.displayedWins,sourceAttempts:data.sourceAttempts,selectedAttempts:data.selectedAttempts,displayedAttempts:data.displayedAttempts,completionArchiveSummaries:data.completionArchives,attemptArchiveSummaries:data.attemptArchives};
  }
  if(!Array.isArray(data?.wins)||!Array.isArray(data?.settings))return null;
  const archives=data.settings.filter(row=>String(row?.id||'').startsWith('tidy-taskdata-archive:')&&row.archive).map(row=>row.archive);
  return {completions:data.wins,timerAttempts:data.settings.filter(row=>String(row?.id||'').startsWith('tidy-timing:')&&row.timing).map(row=>row.timing),completionArchiveSummaries:archives.filter(row=>row?.kind==='completion'),attemptArchiveSummaries:archives.filter(row=>row?.kind==='attempt')};
 }
 function takeSnapshot(data,kind){
  const source=groups(data,kind);if(!source)return null;
  const counts={},sets={},duplicates={},missingIds={},missingLinks={},totals={};
  for(const [type,value] of Object.entries(source)){
   const rows=asRows(value);if(!rows)return null;counts[type]={};sets[type]=new Map();duplicates[type]=0;missingIds[type]=0;missingLinks[type]=0;totals[type]=rows.length;
   for(const row of rows){const label=memberLabel(actorFor(type,row));counts[type][label]=(counts[type][label]||0)+1;const needsLink=/Completions?$|Attempts$/i.test(type);if(needsLink&&!String(row?.taskId||row?.rootTaskId||row?.rootId||''))missingLinks[type]++;const id=String(row?.id||'');if(!id){missingIds[type]++;continue;}const ids=sets[type].get(label)||new Set();if(ids.has(id))duplicates[type]++;ids.add(id);sets[type].set(label,ids);}
  }
  return {counts,sets,duplicates,missingIds,missingLinks,totals};
 }
 function compare(before,after){const out={};if(!before||!after)return out;for(const type of new Set([...Object.keys(before.sets),...Object.keys(after.sets)])){const missing={},added={},aByMember=before.sets[type]||new Map(),bByMember=after.sets[type]||new Map();for(const label of new Set([...aByMember.keys(),...bByMember.keys()])){const a=aByMember.get(label)||new Set(),b=bByMember.get(label)||new Set(),lost=[...a].filter(id=>!b.has(id)).length,gained=[...b].filter(id=>!a.has(id)).length;if(lost)missing[label]=lost;if(gained)added[label]=gained;}out[type]={missing,added};}return out;}
 function filteredCounts(before,after){const lost={},a=before?.sets?.completions||new Map(),b=after?.sets?.completions||new Map();for(const label of new Set([...a.keys(),...b.keys()])){const count=[...(a.get(label)||[])].filter(id=>!(b.get(label)||new Set()).has(id)).length;if(count)lost[label]=count;}return lost;}
 function safeReason(value){return reasons.has(value)?value:'not-captured';}
 function safeStatus(value){return statuses.has(value)?value:'unavailable';}
 function safeMeta(meta){const out={};if(Number.isFinite(meta?.attempt))out.attempt=meta.attempt;if(['overview','day','rooms','quests','focus','occasional','task-family'].includes(meta?.view))out.view=meta.view;if(['7','30','90','all'].includes(String(meta?.period)))out.period=String(meta.period);if(typeof meta?.roomFiltered==='boolean')out.roomFilter=meta.roomFiltered?'filtered':'all';if(meta?.selectedDate===true)out.dateFilter='selected-date';return out;}
 function publicRecord(record){return {stage:record.stage,availability:record.availability,reason:record.reason,status:record.status,kind:record.kind,counts:record.counts,totals:record.totals,duplicates:record.duplicates,missingIds:record.missingIds,missingLinks:record.missingLinks,changes:record.changes,filteredOut:record.filteredOut,displayLimited:record.displayLimited,persistence:record.persistence,meta:record.meta};}
 function capture(stage,data,meta={}){
  if(!session)return;
  try{
   if(meta.availability==='unavailable'){session.records.push({stage,availability:'unavailable',reason:safeReason(meta.reason),status:safeStatus(meta.status),meta:safeMeta(meta)});return;}
   const kind=['board','raw','delta','task-data'].includes(meta.kind)?meta.kind:'raw',snap=takeSnapshot(data,kind);
   if(!snap){session.records.push({stage,availability:'unavailable',reason:'not-captured',status:safeStatus(meta.status),meta:safeMeta(meta)});return;}
   const record={stage,availability:'observed',kind,counts:snap.counts,totals:snap.totals,duplicates:snap.duplicates,missingIds:snap.missingIds,missingLinks:snap.missingLinks,meta:safeMeta(meta)};if(meta.status!=null)record.status=safeStatus(meta.status);
   if(stage==='remote-snapshot'){
    record.changes=compare(session.latest.get('previous-shared-baseline'),snap);
    if(session.pendingPersist){const diff=compare(session.pendingPersist,snap),missing=Object.values(diff).some(row=>Object.keys(row.missing).length>0);record.persistence={status:missing?'missing-later':'verified-present',missing:missing?diff:{}};session.pendingPersist=null;}
   } else if(stage==='merged-data')record.changes=compare(session.latest.get('remote-snapshot'),snap);
   else if(stage==='accepted-board')record.changes=compare(session.latest.get('merged-data'),snap);
   else if(stage==='task-data'){
    const source=takeSnapshot(data,'task-data');
    record.filteredOut={completions:filteredCounts({sets:{completions:source.sets.sourceCompletions}},{sets:{completions:source.sets.selectedCompletions}}),timerAttempts:filteredCounts({sets:{completions:source.sets.sourceAttempts}},{sets:{completions:source.sets.selectedAttempts}})};
    record.displayLimited={completions:filteredCounts({sets:{completions:source.sets.selectedCompletions}},{sets:{completions:source.sets.displayedCompletions}}),timerAttempts:filteredCounts({sets:{completions:source.sets.selectedAttempts}},{sets:{completions:source.sets.displayedAttempts}})};
   }
   session.records.push(record);session.latest.set(stage,snap);
   if(stage==='save-result'&&record.status==='save-acknowledged')session.pendingPersist=snap;
  }catch{session.records.push({stage,availability:'unavailable',reason:'not-captured',status:'unavailable'});}
 }
 function start(){session={memberLabels:new Map(),labelPool:shuffledLabels(),records:[],latest:new Map(),pendingPersist:null};finalSummary=null;return true;}
 function stop(){if(session){finalSummary=session.records.map(publicRecord);session.latest.clear();session.memberLabels.clear();session.labelPool.length=0;session.pendingPersist=null;session.records.length=0;session=null;}return finalSummary||[];}
 function clear(){if(session){session.latest.clear();session.memberLabels.clear();session.labelPool.length=0;session.records.length=0;}session=null;finalSummary=null;}
 function activeObserver(){return session?(stage,data,meta)=>{try{capture(stage,data,meta);}catch{}}:null;}
 function captureTaskData(board,{selectedWins,displayedWins,selectedAttempts,displayedAttempts,sourceWins,sourceAttempts,archives,completionArchives,attemptArchives}={},meta={}){
  if(!session)return;
  try{const f=board?.features,allArchives=archives??f?.taskDataArchives??[];capture('task-data',{sourceWins:sourceWins??f?.wins,selectedWins,displayedWins,sourceAttempts:sourceAttempts??f?.questTimings,selectedAttempts,displayedAttempts,completionArchives:completionArchives??allArchives.filter(row=>row?.kind==='completion'),attemptArchives:attemptArchives??allArchives.filter(row=>row?.kind==='attempt')},{...meta,kind:'task-data'});}
  catch{capture('task-data',null,{availability:'unavailable',reason:'not-captured'});}
 }
 function escape(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
 function renderRecords(records){if(!records?.length)return '<p class="small">No ordinary sync checkpoints captured yet.</p>';return records.map(row=>{if(row.availability==='unavailable')return `<li><strong>${escape(row.stage)}</strong>: unavailable (${escape(row.reason||'not-captured')})</li>`;const totals=Object.entries(row.totals||{}).map(([type,total])=>`${escape(type)} ${total}${Object.entries(row.counts?.[type]||{}).length?` · ${Object.entries(row.counts[type]).map(([member,count])=>`${escape(member)} ${count}`).join(', ')}`:''}${row.missingLinks?.[type]!=null?` · missing task link ${row.missingLinks[type]}`:''}`).join(' · '),state=row.status?` · ${escape(row.status)}`:'',changes=row.changes?` · count changes: ${escape(JSON.stringify(row.changes))}`:'',filters=row.filteredOut?` · filtered out: ${escape(JSON.stringify(row.filteredOut))}`:'',limited=row.displayLimited?` · beyond initial display: ${escape(JSON.stringify(row.displayLimited))}`:'',persistence=row.persistence?` · later snapshot: ${escape(row.persistence.status)}`:'';return `<li><strong>${escape(row.stage)}</strong>: ${totals||'observed'}${state}${changes}${filters}${limited}${persistence}</li>`;}).join('');}
 function panel(){let enabled=false;try{enabled=new URLSearchParams(root.location?.search||'').has('sync-diagnostics');}catch{}if(!enabled)return '';const records=session?.records||finalSummary,controls=session?'<button type="button" data-sync-diagnostics="stop">Stop and review</button>':'<button type="button" data-sync-diagnostics="start">Start diagnostics</button>',clearButton=records?.length?'<button type="button" class="ghost" data-sync-diagnostics="clear">Clear summary</button>':'';return `<details class="sync-diagnostics-panel"><summary>Temporary sync diagnostics</summary><p class="small">Opt-in, local-only counts. This observes ordinary syncs only; it never starts or repeats one, and never shows record content.</p>${controls}${clearButton}<ol>${renderRecords(records)}</ol></details>`;}
 function notify(){try{root.dispatchEvent?.(new root.Event('tidy-sync-diagnostics-changed'));}catch{}}
 if(root.document?.addEventListener)root.document.addEventListener('click',event=>{const target=event.target?.closest?.('[data-sync-diagnostics]');if(!target)return;const action=target.getAttribute('data-sync-diagnostics');if(action==='start')start();else if(action==='stop')stop();else if(action==='clear')clear();else return;notify();});
 root.TidySyncDiagnostics=Object.freeze({start,stop,clear,activeObserver,captureTaskData,notify,panel,isActive:()=>!!session,summary:()=>session?session.records.map(publicRecord):finalSummary||[]});
 if(typeof module!=='undefined'&&module.exports)module.exports=root.TidySyncDiagnostics;
})(typeof globalThis!=='undefined'?globalThis:this);
