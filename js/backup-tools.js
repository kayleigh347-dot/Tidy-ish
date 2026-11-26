/* Tidyish local-backup preflight: NO account requests, storage writes, or task presets.
 * Accept only the new Tidyish v1 format. Never guess how to import Android/older exports.
 * UI confirmation is required before merge or full local restore.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TidyBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES = 15 * 1024 * 1024;
  const COLLECTIONS = ['rooms', 'tasks', 'items', 'wins', 'completionSummaries', 'templates', 'routines', 'dailyLogRecords', 'dailyLogRewashes', 'customLaundryCycles', 'customLaundryLoads', 'careDefinitions', 'occasionTemplates', 'occasionOccurrences', 'gifts', 'giftPeople'];
  const FEATURE_KEYS = new Set(['items', 'wins', 'completionSummaries', 'templates', 'routines', 'dailyLogRecords', 'dailyLogRewashes', 'customLaundryCycles', 'customLaundryLoads', 'careDefinitions', 'occasionTemplates', 'occasionOccurrences', 'gifts', 'giftPeople']);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function ids(records, collection) {
    const seen = new Set();
    for (const entry of records) {
      if (!isObject(entry) || typeof entry.id !== 'string' || !entry.id.trim() || seen.has(entry.id)) {
        throw Error(`Backup has missing or repeated identities in ${collection}. No data was changed.`);
      }
      seen.add(entry.id);
    }
    return seen;
  }

  function validate(raw, model) {
    if (!model || typeof model.normalize !== 'function' || typeof model.merge !== 'function') {
      throw Error('The Tidyish data model is not available. No data was changed.');
    }
    if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.rooms) || !Array.isArray(raw.tasks)) {
      throw Error('This is not a Tidyish v1 backup. Older Android/HTML backups need a reviewed converter; nothing was imported.');
    }
    if ('authSession' in raw || 'access_token' in raw) {
      throw Error('This file includes account credentials. Review it separately; nothing was imported.');
    }
    // Older app exports attached the previous household sync base here. It is
    // neither needed nor safe to merge. Restore imports only board data and drops
    // account-specific bindings; merge adds only supported missing identities.
    const safeRaw = {...raw};
    delete safeRaw.sharedSnapshot;
    // Account/household bindings belong to this browser, never to a portable backup.
    delete safeRaw.browserSync;delete safeRaw.householdSync;delete safeRaw.connectedHouse;delete safeRaw.seasonalSharedHouse;
    const copy = model.normalize(safeRaw);
    // The app stores these links inside features; discard them in either location.
    delete copy.features.browserSync;delete copy.features.householdSync;delete copy.features.connectedHouse;delete copy.features.seasonalSharedHouse;
    for (const group of COLLECTIONS) {
      const records = FEATURE_KEYS.has(group) ? copy.features[group] : copy[group];
      if (!Array.isArray(records)) throw Error(`Invalid backup ${group} records. Nothing was imported.`);
      ids(records, group);
    }
    const rooms = ids(copy.rooms, 'rooms');
    for (const task of copy.tasks) {
      if (task.room && !rooms.has(task.room)) {
        throw Error(`Task “${task.title}” refers to an unknown room. Nothing was imported.`);
      }
    }
    return copy;
  }

  function fromText(text, model) {
    if (typeof text !== 'string' || !text.trim()) throw Error('The backup file is empty. Nothing was imported.');
    // Browser File.size is checked separately; enforce the same cap for direct API calls.
    if (text.length > MAX_BYTES) throw Error('Choose a backup smaller than 15 MB. Nothing was imported.');
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw Error('This file is not valid JSON. Nothing was imported.'); }
    return validate(parsed, model);
  }

  function collection(board, name) { return FEATURE_KEYS.has(name) ? board.features[name] : board[name]; }

  function unresolvedSeasonalLinks(board,model){
    return board.features.occasionOccurrences.reduce((count,o)=>{
      const s=model.occasionLinkStatus(board,o);
      return count+[...s.tasks,...s.gifts,...s.recipients].filter(l=>l.status!=='linked').length;
    },0);
  }

  function prepare(current, text, model) {
    const original = JSON.stringify(current);
    if (typeof original !== 'string') throw Error('The current board is unavailable. Nothing was imported.');
    const base = model.normalize(current);
    const incoming = fromText(text, model);
    const merged = model.merge(base, incoming, {backupGifts:true}); // PURE: does not mutate the current board
    const changes = {}, skipped = {};
    for (const name of COLLECTIONS) {
      const now = collection(base, name), incomingRows = collection(incoming, name);
      const result = collection(merged, name), currentIds = ids(now, name);
      changes[name] = result.filter(record => !currentIds.has(record.id)).length;
      skipped[name] = incomingRows.filter(record => currentIds.has(record.id)).length;
      if (['occasionTemplates','occasionOccurrences','gifts','giftPeople'].includes(name)) {
        // Also count logical duplicates and conflicting references skipped by merge.
        skipped[name] = incomingRows.length - changes[name];
      }
    }
    // Room labels, matched tasks, existing wins and other saved personal state are not overwritten.
    const notes = [];
    try { if (Object.prototype.hasOwnProperty.call(JSON.parse(text), 'sharedSnapshot')) notes.push('The saved household sync snapshot is ignored; only the backup board data is considered.'); } catch {}
    if (skipped.tasks) notes.push(`${skipped.tasks} matching task ID(s) will stay as they are.`);
    if (skipped.rooms) notes.push('Rooms with matching IDs keep their current settings and artwork.');
    if (skipped.occasionTemplates || skipped.occasionOccurrences) notes.push(`Seasonal merge keeps current records: ${skipped.occasionTemplates} template(s) and ${skipped.occasionOccurrences} occurrence(s) not added because of matching IDs, logical duplicates, conflicting templates or missing/conflicting linked records. Full restore is a separate replacement option.`);
    if (skipped.gifts || skipped.giftPeople) notes.push(`Gift merge keeps current records: ${skipped.gifts} gift(s) and ${skipped.giftPeople} person record(s) not added because of matching IDs, conflicting recipients or duplicate names. Full restore is a separate replacement option.`);
    if(incoming.features.seasonalNotes?.length||incoming.features.seasonalGiftHistory?.length)notes.push('Seasonal notes and gift history are copied only for newly imported occasions; matching current occasions keep their content. Full restore is a separate replacement option.');
    // A confirmed backup may restore a previously absent identity. Surface
    // links that become usable again; no implicit activation or completion.
    let restoredLinks=0;
    for(const o of base.features.occasionOccurrences){
      const next=merged.features.occasionOccurrences.find(row=>row.id===o.id);
      if(!next)continue;
      const before=model.occasionLinkStatus(base,o),after=model.occasionLinkStatus(merged,next);
      for(const k of ['tasks','gifts','recipients'])restoredLinks+=after[k].filter((l,i)=>l.status==='linked'&&before[k][i]?.status!=='linked').length;
    }
    const unresolved=unresolvedSeasonalLinks(merged,model);
    if(unresolved)notes.push(`${unresolved} Seasonal link(s) remain unresolved; their identities are retained, not reassigned.`);
    if(restoredLinks)notes.push(`${restoredLinks} existing Seasonal link(s) become available again because missing records will be restored by this confirmed merge. Review before confirming.`);
    if (changes.gifts || changes.giftPeople) notes.push('Merge adds missing gift/person identities from this backup, including records previously removed locally. Review these counts before confirming.');
    if (!Object.values(changes).some(Boolean)) notes.push('This backup contains no new supported records.');
    const summary = {changes, skipped, existingTasks:base.tasks.length, importedTasks:incoming.tasks.length, notes};
    return {summary, source:incoming, original};
  }

  function prepareRestore(current,text,model){
    const original=JSON.stringify(current);
    if(typeof original!=='string')throw Error('The current board is unavailable. Nothing was restored.');
    const source=fromText(text,model);
    return {original,source,summary:{rooms:source.rooms.length,tasks:source.tasks.length,wins:source.features.wins.length,items:source.features.items.length,templates:source.features.templates.length,routines:source.features.routines.length,customLaundryCycles:source.features.customLaundryCycles.length,customLaundryLoads:source.features.customLaundryLoads.length,careDefinitions:source.features.careDefinitions.length,occasionTemplates:source.features.occasionTemplates.length,occasionOccurrences:source.features.occasionOccurrences.length,gifts:source.features.gifts.length,giftPeople:source.features.giftPeople.length,unresolvedSeasonalLinks:unresolvedSeasonalLinks(source,model)}};
  }

  function applyRestore(current,prepared,model){
    if(!prepared||typeof prepared.original!=='string'||!prepared.source)throw Error('The restore preview has expired. Choose the file again; no data was changed.');
    if(JSON.stringify(current)!==prepared.original)throw Error('The board changed since the restore preview. Choose the file again. No data was changed.');
    return validate(prepared.source,model);
  }

  function describeRestore(summary){
    return `Replace this browser’s entire local board with ${summary.rooms} rooms, ${summary.tasks} task families, ${summary.wins} completion records, ${summary.items} saved items, ${summary.templates} reusable definitions and ${summary.routines} routines, ${summary.customLaundryCycles||0} custom laundry cycles, ${summary.customLaundryLoads||0} custom loads and ${summary.careDefinitions||0} care definitions, ${summary.occasionTemplates||0} Seasonal templates and ${summary.occasionOccurrences||0} Seasonal occurrences, plus ${summary.gifts||0} gifts and ${summary.giftPeople||0} gift recipients. Current local board data will be replaced. The restore does not write to a live household.${summary.unresolvedSeasonalLinks?` ${summary.unresolvedSeasonalLinks} Seasonal link(s) will remain unresolved; their identities are retained, not reassigned.`:''}`;
  }

  function apply(current, prepared, model) {
    if (!prepared || typeof prepared.original !== 'string' || !prepared.source) {
      throw Error('The backup preview has expired. Choose the file again; no data changed.');
    }
    if (JSON.stringify(current) !== prepared.original) {
      throw Error('The board changed since the preview. Choose the file again before importing. No data changed.');
    }
    const source = validate(prepared.source, model);
    return model.merge(current, source, {backupGifts:true}); // Returns a new board. Caller makes the confirmed save.
  }

  function describe(summary) {
    const c = summary.changes;
    const fragments = [
      ['rooms','rooms'], ['tasks','task families'], ['wins','completion records'],
      ['items','saved items'], ['completionSummaries','completion summaries'],
      ['templates','reusable definitions'], ['routines','saved routines'],
      ['customLaundryCycles','custom laundry cycles'], ['customLaundryLoads','custom laundry loads'], ['careDefinitions','care definitions'], ['occasionTemplates','Seasonal templates'], ['occasionOccurrences','Seasonal occurrences'], ['gifts','gifts'], ['giftPeople','gift recipients']
    ].map(([key,label])=>`${c[key]} new ${label}`);
    return fragments.join(' · ') + '. Existing matching identities, household settings and history stay unchanged. ' + summary.notes.join(' ');
  }

  return Object.freeze({MAX_BYTES, fromText, prepare, apply, describe, prepareRestore, applyRestore, describeRestore});
});
