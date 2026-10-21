/* Tidyish Stage 09A: read-only Task Data summaries. No storage or task writes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TidyTaskData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const allowed = new Set(['7', '30', '90', 'all']);
  const dateKey = date => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
  function summarize(board, opts={}) {
    const period = allowed.has(String(opts.period)) ? String(opts.period) : '30';
    const roomId = typeof opts.roomId === 'string' ? opts.roomId : 'all';
    const now = opts.now instanceof Date ? new Date(opts.now.getTime()) : new Date(opts.now === undefined ? Date.now() : opts.now);
    if (!Number.isFinite(now.getTime())) throw Error('Invalid Task Data reference date.');
    const days = period === 'all' ? null : Number(period);
    // A local calendar-day window avoids DST / 24-hour cutoff drift.
    const cutoff = days === null ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
    const all = Array.isArray(board?.features?.wins) ? board.features.wins : [];
    const filtered=[];
    let undated=0;
    for (const w of all) {
      if (!w || typeof w !== 'object') continue;
      const winRoom = w.room || 'general';
      if (roomId !== 'all' && winRoom !== roomId) continue;
      const timestamp = typeof w.at === 'string' && w.at.trim() ? Date.parse(w.at) : NaN;
      if (!Number.isFinite(timestamp)) {
        if (cutoff === null) {filtered.push(w);undated++;}
        continue;
      }
      if (cutoff !== null && (timestamp < cutoff.getTime() || timestamp > now.getTime())) continue;
      filtered.push(w);
    }
    const byRoom=new Map();let points=0,minutes=0;
    for (const w of filtered) {
      const id = w.room || 'general';
      const row = byRoom.get(id) || {id,count:0};row.count++;byRoom.set(id,row);
      const p=Number(w.points), m=Number(w.minutes);
      if (Number.isFinite(p) && p > 0) points += p;
      if (Number.isFinite(m) && m > 0) minutes += m;
    }
    const entries=[...byRoom.values()].sort((a,b)=>b.count-a.count || a.id.localeCompare(b.id));
    const sorted=filtered.slice().sort((a,b)=>{
      const at=Date.parse(a.at||'')||0,bt=Date.parse(b.at||'')||0;
      return bt-at;
    });
    const lastSeven = Array.from({length:7},(_,i)=>{
      const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()-(6-i));
      return {day:dateKey(day),count:0};
    });
    const daily=new Map(lastSeven.map(row=>[row.day,row]));
    for (const w of filtered) {
      const at=typeof w.at==='string' ? new Date(w.at) : new Date(NaN);
      if (!Number.isFinite(at.getTime()) || at.getTime()>now.getTime()) continue;
      const record=daily.get(dateKey(at));if(record)record.count++;
    }
    let archiveCount=0;
    for(const x of (Array.isArray(board?.features?.completionSummaries)?board.features.completionSummaries:[])){
      const count=Number(x?.count);if(Number.isFinite(count)&&count>0)archiveCount+=count;
    }
    return {period,roomId,count:filtered.length,points,minutes,entries,wins:sorted,trend:lastSeven,undated,archiveCount};
  }
  return Object.freeze({summarize});
});
