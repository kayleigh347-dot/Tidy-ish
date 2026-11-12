const KINDS = new Set(['achievement', 'daily-total', 'distraction', 'planned', 'completion-date']);
const LIMITS = Object.freeze({ title: 140, description: 600, distraction: 220, planTitle: 180, room: 100 });
const MAX_RECORDS = 50000;
const MAX_REWASHES = 10000;

export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
  return check.getUTCFullYear() === parts[0] && check.getUTCMonth() === parts[1] - 1 && check.getUTCDate() === parts[2];
}

export function localDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw Error('Choose a valid date.');
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function addDays(day, count) {
  if (!isDay(day) || !Number.isInteger(count)) throw Error('Choose a valid date.');
  const date = new Date(day + 'T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function emptyState() {
  return { schemaVersion: 1, records: [], rewashes: [] };
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function text(value, label, limit, required = false) {
  const result = String(value ?? '').trim();
  if (required && !result) throw Error('Enter ' + label + '.');
  if (result.length > limit) throw Error(label.charAt(0).toUpperCase() + label.slice(1) + ' must be ' + limit + ' characters or fewer.');
  return result;
}

function minutes(value, optional = false) {
  if ((value === undefined || value === null || value === '') && optional) return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 1440) throw Error('Enter a duration from 1 minute to 24 hours.');
  return result;
}

function uid(prefix) {
  const id = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  return prefix + '-' + id;
}

function isOptionalMinutes(value) {
  return value === null || Number.isInteger(value) && value >= 1 && value <= 1440;
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id ||
      typeof record.recordId !== 'string' || !record.recordId || !KINDS.has(record.kind) || !isDay(record.date) ||
      !Array.isArray(record.parents) || record.parents.some(id => typeof id !== 'string' || !id) ||
      new Set(record.parents).size !== record.parents.length || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) {
    throw Error('Invalid Daily Log data; saved data was not replaced.');
  }
  if (record.deleted !== undefined && record.deleted !== true) throw Error('Invalid Daily Log deletion; saved data was not replaced.');
  if (record.deleted && record.kind !== 'distraction') throw Error('Only distractions can be deleted.');
  if (record.kind === 'achievement' && (!record.recordId.startsWith('achievement:') ||
      typeof record.title !== 'string' || !record.title.trim() || record.title.length > LIMITS.title ||
      typeof record.description !== 'string' || record.description.length > LIMITS.description ||
      typeof record.roomId !== 'string' || record.roomId.length > LIMITS.room || !isOptionalMinutes(record.minutes))) {
    throw Error('Invalid extra activity; saved data was not replaced.');
  }
  if (record.kind === 'daily-total' && (record.recordId !== 'daily-total:' + record.date ||
      !Number.isInteger(record.total) || record.total < 0 || record.total > 9999)) {
    throw Error('Invalid daily total; saved data was not replaced.');
  }
  if (record.kind === 'distraction' && (!record.recordId.startsWith('distraction:') ||
      typeof record.description !== 'string' || !record.description.trim() || record.description.length > LIMITS.distraction ||
      !Number.isInteger(record.minutes) || record.minutes < 1 || record.minutes > 1440)) {
    throw Error('Invalid distraction; saved data was not replaced.');
  }
  if (record.kind === 'planned' && (record.recordId !== 'planned:' + record.date || !Array.isArray(record.tasks) ||
      record.tasks.length > 1000 || record.tasks.some(task =>
        !task || typeof task.taskId !== 'string' || !task.taskId ||
        typeof task.title !== 'string' || !task.title.trim() || task.title.length > LIMITS.planTitle ||
        typeof task.roomId !== 'string' || task.roomId.length > LIMITS.room ||
        !Array.isArray(task.sources) || task.sources.some(source => typeof source !== 'string') ||
        !Array.isArray(task.completionTaskIds) || task.completionTaskIds.some(id => typeof id !== 'string' || !id) ||
        !isOptionalMinutes(task.minutes)) ||
      new Set(record.tasks.map(task => task.taskId)).size !== record.tasks.length)) {
    throw Error('Invalid planned day; saved data was not replaced.');
  }
  if (record.kind === 'completion-date' && (typeof record.completionId !== 'string' || !record.completionId ||
      record.recordId !== 'completion-date:' + record.completionId ||
      typeof record.previousDate !== 'string' || record.previousDate && !isDay(record.previousDate))) {
    throw Error('Invalid completion date; saved data was not replaced.');
  }
}

export function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schemaVersion !== 1 ||
      !Array.isArray(state.records) || state.records.length > MAX_RECORDS ||
      !Array.isArray(state.rewashes) || state.rewashes.length > MAX_REWASHES) {
    throw Error('Unsupported Daily Log data; saved data was not replaced.');
  }
  const ids = new Map();
  for (const record of state.records) {
    validateRecord(record);
    if (ids.has(record.id)) throw Error('Duplicate Daily Log revision; saved data was not replaced.');
    ids.set(record.id, record);
  }
  for (const record of state.records) for (const parentId of record.parents) {
    const parent = ids.get(parentId);
    if (!parent || parent.recordId !== record.recordId || parent.kind !== record.kind || parent.id === record.id) {
      throw Error('Incomplete Daily Log history; saved data was not replaced.');
    }
  }
  const visiting = new Set(), visited = new Set();
  const visit = record => {
    if (visiting.has(record.id)) throw Error('Daily Log history has a cycle; saved data was not replaced.');
    if (visited.has(record.id)) return;
    visiting.add(record.id);
    for (const parentId of record.parents) visit(ids.get(parentId));
    visiting.delete(record.id);
    visited.add(record.id);
  };
  for (const record of state.records) visit(record);

  const rewashIds = new Set();
  for (const row of state.rewashes) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id ||
        rewashIds.has(row.id) || !Number.isInteger(row.slot) || row.slot < 1 || !isDay(row.date) ||
        typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at)) ||
        typeof row.loadId !== 'string' || typeof row.label !== 'string' || row.label.length > LIMITS.title) {
      throw Error('Invalid re-wash history; saved data was not replaced.');
    }
    rewashIds.add(row.id);
  }
  return state;
}

export function normalizeState(value) {
  if (value === null || value === undefined) return emptyState();
  return validateState(clone(value));
}

export function createLocalStorageAdapter(storage = globalThis.localStorage, key = 'tidyish.daily-log-addon.v1') {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw Error('Provide a working storage adapter.');
  return Object.freeze({
    load() {
      const raw = storage.getItem(key);
      if (raw === null) return emptyState();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw Error('The add-on data could not be read; the original was left untouched.'); }
      return normalizeState(parsed);
    },
    save(value) {
      const state = normalizeState(value);
      storage.setItem(key, JSON.stringify(state));
      return state;
    }
  });
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function revisionGroups(state, kind) {
  const grouped = new Map();
  for (const row of state?.records || []) {
    if (kind && row.kind !== kind) continue;
    if (!grouped.has(row.recordId)) grouped.set(row.recordId, []);
    grouped.get(row.recordId).push(row);
  }
  return [...grouped].map(([recordId, versions]) => {
    const ids = new Set(versions.map(row => row.id)), superseded = new Set();
    for (const row of versions) for (const parent of row.parents) if (ids.has(parent)) superseded.add(parent);
    const heads = versions.filter(row => !superseded.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
    return { recordId, kind: versions[0].kind, versions, heads, current: heads.length === 1 && !heads[0].deleted ? heads[0] : null, conflict: heads.length > 1 };
  });
}

export function mergeStates(left, right) {
  const a = normalizeState(left), b = normalizeState(right), records = new Map(), rewashes = new Map();
  for (const row of [...a.records, ...b.records]) {
    const old = records.get(row.id);
    if (old && canonical(old) !== canonical(row)) throw Error('A Daily Log revision ID was reused; neither copy was changed.');
    records.set(row.id, row);
  }
  for (const row of [...a.rewashes, ...b.rewashes]) {
    const old = rewashes.get(row.id);
    if (old && canonical(old) !== canonical(row)) throw Error('A re-wash ID was reused; neither copy was changed.');
    rewashes.set(row.id, row);
  }
  return validateState({ schemaVersion: 1, records: [...records.values()], rewashes: [...rewashes.values()] });
}

function findGroup(state, recordId) {
  return revisionGroups(state).find(group => group.recordId === recordId) || null;
}

function append(stateValue, recordId, kind, date, fields, options = {}) {
  const state = normalizeState(stateValue), group = findGroup(state, recordId);
  if (group && group.kind !== kind) throw Error('This record has incompatible history. Nothing was changed.');
  if (group?.conflict && !options.resolve) throw Error('This record changed on another device. Resolve its versions first.');
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) throw Error('Choose a valid save time.');
  const row = {
    id: uid('dlr'), recordId, kind, date,
    parents: group ? group.heads.map(head => head.id) : [],
    updatedAt: now.toISOString(),
    ...fields,
    ...(options.deleted ? { deleted: true } : {})
  };
  const next = { ...state, records: [...state.records, row] };
  validateState(next);
  return next;
}

export function addAchievement(state, input = {}, options = {}) {
  const date = input.date || localDay(options.now || new Date());
  if (!isDay(date)) throw Error('Choose a valid activity date.');
  return append(state, 'achievement:' + uid('event'), 'achievement', date, {
    title: text(input.title, 'activity', LIMITS.title, true),
    description: text(input.description, 'description', LIMITS.description),
    roomId: text(input.roomId, 'room', LIMITS.room),
    minutes: minutes(input.minutes, true)
  }, options);
}

export function setDailyTotal(state, date, total, options = {}) {
  if (!isDay(date)) throw Error('Choose a valid date.');
  const value = Number(total);
  if (!Number.isInteger(value) || value < 0 || value > 9999) throw Error('Enter a whole-number daily total from 0 to 9,999.');
  const group = findGroup(state, 'daily-total:' + date);
  if (group?.current && Number(group.current.total) === value) return normalizeState(state);
  return append(state, 'daily-total:' + date, 'daily-total', date, { total: value }, options);
}

export function addDistraction(state, input = {}, options = {}) {
  const date = input.date || localDay(options.now || new Date());
  if (!isDay(date)) throw Error('Choose a valid distraction date.');
  return append(state, 'distraction:' + uid('event'), 'distraction', date, {
    description: text(input.description, 'distraction', LIMITS.distraction, true),
    minutes: minutes(input.minutes)
  }, options);
}

export function editDistraction(state, recordId, input = {}, options = {}) {
  const group = findGroup(state, recordId);
  if (!group || group.kind !== 'distraction' || !group.current) throw Error('This distraction is unavailable or needs conflict review.');
  const date = input.date || group.current.date;
  if (!isDay(date)) throw Error('Choose a valid distraction date.');
  return append(state, recordId, 'distraction', date, {
    description: text(input.description ?? group.current.description, 'distraction', LIMITS.distraction, true),
    minutes: minutes(input.minutes ?? group.current.minutes)
  }, options);
}

export function deleteDistraction(state, recordId, options = {}) {
  const group = findGroup(state, recordId);
  if (!group) return normalizeState(state);
  if (group.kind !== 'distraction' || group.conflict) throw Error('Resolve this distraction before deleting it.');
  if (!group.current) return normalizeState(state);
  return append(state, recordId, 'distraction', group.current.date, {
    description: group.current.description, minutes: group.current.minutes
  }, { ...options, deleted: true });
}

export function resolveRecord(state, recordId, revisionId, options = {}) {
  const group = findGroup(state, recordId), chosen = group?.heads.find(row => row.id === revisionId);
  if (!group?.conflict || !chosen) throw Error('This record no longer has the selected conflict.');
  const { id, recordId: ignoredId, kind, date, parents, updatedAt, deleted, ...fields } = chosen;
  return append(state, recordId, kind, date, fields, { ...options, resolve: true, deleted: !!deleted });
}

export function capturePlannedDay(state, date, tasks = [], options = {}) {
  if (!isDay(date)) throw Error('Choose a valid planned date.');
  if (!Array.isArray(tasks)) throw Error('Choose a valid planned task list.');
  const recordId = 'planned:' + date, group = findGroup(state, recordId);
  if (group?.conflict) throw Error('This planned day changed on another device. Resolve its versions first.');
  const captured = tasks.filter(item => item && typeof item.taskId === 'string' && item.taskId).map(item => {
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const completionTaskIds = Array.isArray(item.completionTaskIds) ? item.completionTaskIds : [item.taskId];
    return {
      taskId: item.taskId,
      title: text(item.title, 'planned task', LIMITS.planTitle, true),
      roomId: text(item.roomId || item.room || '', 'room', LIMITS.room),
      sources: [...new Set([...sources, ...(item.source ? [String(item.source)] : [])].filter(value => typeof value === 'string'))],
      completionTaskIds: [...new Set(completionTaskIds.filter(id => typeof id === 'string' && id))],
      minutes: item.minutes == null ? null : minutes(item.minutes)
    };
  });
  if (new Set(captured.map(item => item.taskId)).size !== captured.length) throw Error('A planned task appears more than once. Nothing was changed.');
  if (group?.current && canonical(group.current.tasks) === canonical(captured)) return normalizeState(state);
  return append(state, recordId, 'planned', date, { tasks: captured }, options);
}

function findCompletionGroup(state, completion, index) {
  const id = completion?.id ? 'completion-date:' + completion.id : '';
  return id ? index?.byRecord?.get(id) || findGroup(state, id) : null;
}

export function completionDate(state, completion, index) {
  const fallback = isDay(completion?.date) ? completion.date : (() => { try { return localDay(completion?.at); } catch { return null; } })();
  const group = findCompletionGroup(state, completion, index);
  if (!group) return { date: fallback, conflict: false, candidates: fallback ? [fallback] : [] };
  if (group.conflict) return {
    date: null, conflict: true,
    candidates: [...new Set([fallback, ...group.heads.map(row => row.date)].filter(isDay))].sort(),
    heads: group.heads
  };
  if (group.current) return { date: group.current.date, conflict: false, candidates: [group.current.date], heads: group.heads };
  return { date: fallback, conflict: false, candidates: fallback ? [fallback] : [], heads: group.heads };
}

export function correctCompletionDate(state, completion, date, options = {}) {
  if (!completion || typeof completion.id !== 'string' || !completion.id) throw Error('Choose a recorded completion.');
  if (!isDay(date)) throw Error('Choose a valid completion date.');
  const current = completionDate(state, completion);
  if (current.conflict) throw Error('This completion changed on another device. Resolve its date versions first.');
  if (current.date === date) return normalizeState(state);
  return append(state, 'completion-date:' + completion.id, 'completion-date', date, {
    completionId: completion.id, previousDate: current.date || ''
  }, options);
}

export function effectiveCompletions(state, completions = [], index) {
  return completions.map(completion => {
    const correction = completionDate(state, completion, index);
    return correction.conflict ? { ...completion, _dateConflict: true, _dateCandidates: correction.candidates } :
      correction.date ? { ...completion, _effectiveDate: correction.date } : { ...completion };
  });
}

export function recordLaundryRewash(stateValue, slot, now = new Date(), metadata = {}) {
  const number = Number(slot), instant = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isInteger(number) || number < 1 || !Number.isFinite(instant.getTime())) throw Error('Choose an active laundry load.');
  const state = normalizeState(stateValue);
  const row = {
    id: uid('rewash'), slot: number, date: localDay(instant), at: instant.toISOString(),
    loadId: text(metadata.loadId, 'load ID', 160),
    label: text(metadata.label || 'Load ' + number, 'load label', LIMITS.title, true)
  };
  return validateState({ ...state, rewashes: [...state.rewashes, row] });
}

function groupIndex(state) {
  const byKindDay = new Map(), byRecord = new Map();
  for (const group of revisionGroups(state)) {
    byRecord.set(group.recordId, group);
    for (const date of new Set(group.heads.map(head => head.date))) {
      const key = group.kind + '\0' + date;
      if (!byKindDay.has(key)) byKindDay.set(key, []);
      byKindDay.get(key).push(group);
    }
  }
  return { byKindDay, byRecord };
}

function groupsForDay(index, kind, date) {
  return (index.byKindDay.get(kind + '\0' + date) || []).filter(group => group.heads.some(head => head.date === date));
}

function dailySnapshot(state, date, host, index, filters, effective, rewashesForDate) {
  if (!isDay(date)) throw Error('Choose a valid snapshot date.');
  const conflicts = [], wins = [];
  for (const win of effective) {
    if (filters.roomId && filters.roomId !== 'all' && (win.roomId || win.room || 'general') !== filters.roomId) continue;
    if (filters.personId && filters.personId !== 'all' && (win.completedBy || win.person || '') !== filters.personId) continue;
    if (win._dateConflict) {
      if ((win._dateCandidates || []).includes(date)) conflicts.push(win);
    } else if (win._effectiveDate === date) wins.push(win);
  }
  const byKind = kind => groupsForDay(index, kind, date);
  const totalGroup = byKind('daily-total')[0] || null;
  const manualTotal = totalGroup?.current ? Number(totalGroup.current.total) : null;
  const achievementGroups = byKind('achievement');
  const distractionGroups = byKind('distraction');
  const planGroup = byKind('planned')[0] || null;
  const achievements = achievementGroups.filter(group => group.current).map(group => group.current);
  const distractions = distractionGroups.filter(group => group.current).map(group => group.current);
  const plans = planGroup ? planGroup.current?.tasks || [] : (host.planned || []).filter(item => item.date === date);
  const completed = new Set(wins.flatMap(win => [win.taskId, win.rootId].filter(Boolean)));
  const planned = plans.map(item => ({
    ...item,
    completed: (item.completionTaskIds || []).length ?
      item.completionTaskIds.every(id => completed.has(id)) : completed.has(item.taskId)
  }));
  const taskCount = wins.length;
  const effectiveTaskTotal = manualTotal === null ? taskCount : Math.max(taskCount, manualTotal);
  const extrasCount = achievements.length;
  const extraMinutes = achievements.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
  const workMinutes = wins.reduce((sum, win) => sum + (Number(win.minutes) || 0), 0) + extraMinutes;
  const distractionMinutes = distractions.reduce((sum, item) => sum + item.minutes, 0);
  const rewashes = (rewashesForDate || state.rewashes.filter(row => row.date === date)).slice().sort((a, b) => a.at.localeCompare(b.at));
  const recordConflicts = [totalGroup, planGroup, ...achievementGroups, ...distractionGroups].filter(group => group?.conflict).length + conflicts.length;
  return {
    date, wins, planned, achievements, distractions, rewashes, completionConflicts: conflicts,
    taskCount, manualTotal, unspecified: manualTotal === null ? 0 : Math.max(0, manualTotal - taskCount),
    effectiveTaskTotal, extrasCount,
    recordedActivities: taskCount + extrasCount,
    overallActivities: effectiveTaskTotal + extrasCount,
    workMinutes, distractionMinutes, totalConflict: !!totalGroup?.conflict,
    needsReview: recordConflicts > 0 || manualTotal !== null && taskCount > manualTotal,
    recordConflicts
  };
}

export function snapshot(stateValue, date, host = {}, filters = {}) {
  const state = normalizeState(stateValue), index = groupIndex(state);
  const effective = effectiveCompletions(state, host.completions || [], index);
  return dailySnapshot(state, date, host, index, filters, effective);
}

function mondayOf(day) {
  const weekday = new Date(day + 'T12:00:00.000Z').getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

function firstOfMonth(day) {
  return day.slice(0, 7) + '-01';
}

function nextMonth(day) {
  const date = new Date(day.slice(0, 7) + '-01T12:00:00.000Z');
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function newBucket(key) {
  return {
    key, label: key, taskTotal: 0, recordedTasks: 0, manualTotal: 0, unspecified: 0,
    extras: 0, recordedActivities: 0, overallActivities: 0, distractionMinutes: 0,
    workMinutes: 0, reviewDays: 0, days: 0
  };
}

export function statistics(stateValue, host = {}, options = {}) {
  const state = normalizeState(stateValue), today = options.today || localDay(options.now || new Date());
  if (!isDay(today)) throw Error('Choose a valid graph date.');
  const period = ['7', '30', '90', '365', 'all'].includes(String(options.period)) ? String(options.period) : '30';
  const initialIndex = groupIndex(state);
  const effective = effectiveCompletions(state, host.completions || [], initialIndex);
  const effectiveByDate = new Map(), rewashesByDate = new Map();
  for (const row of effective) {
    const rowDates = row._dateConflict ? row._dateCandidates || [] : row._effectiveDate ? [row._effectiveDate] : [];
    for (const day of rowDates) {
      if (!effectiveByDate.has(day)) effectiveByDate.set(day, []);
      effectiveByDate.get(day).push(row);
    }
  }
  for (const row of state.rewashes) {
    if (!rewashesByDate.has(row.date)) rewashesByDate.set(row.date, []);
    rewashesByDate.get(row.date).push(row);
  }
  const dates = [
    ...state.records.map(row => row.date),
    ...state.rewashes.map(row => row.date),
    ...effective.flatMap(row => row._dateConflict ? row._dateCandidates || [] : row._effectiveDate ? [row._effectiveDate] : [])
  ].filter(day => day <= today);
  const start = period === 'all' ? dates.slice().sort()[0] || today : addDays(today, 1 - Number(period));
  const groupSize = period === '7' || period === '30' ? 'day' : period === '90' ? 'week' : 'month';
  const buckets = new Map();

  if (groupSize === 'day') {
    for (let day = start; day <= today; day = addDays(day, 1)) buckets.set(day, newBucket(day));
  } else if (groupSize === 'week') {
    for (let day = mondayOf(start); day <= mondayOf(today); day = addDays(day, 7)) buckets.set(day, newBucket(day));
    for (const row of buckets.values()) {
      const first = row.key < start ? start : row.key;
      const last = addDays(row.key, 6) > today ? today : addDays(row.key, 6);
      row.days = Math.max(0, Math.floor((Date.parse(last + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86400000) + 1);
    }
  } else {
    for (let month = firstOfMonth(start); month <= firstOfMonth(today); month = nextMonth(month)) {
      const row = newBucket(month);
      const monthEnd = addDays(nextMonth(month), -1);
      const first = month < start ? start : month;
      const last = monthEnd > today ? today : monthEnd;
      row.days = Math.max(0, Math.floor((Date.parse(last + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86400000) + 1);
      buckets.set(month, row);
    }
  }

  const indexedDates = [...new Set(dates)].filter(day => day >= start).sort();
  for (const day of indexedDates) {
    const item = dailySnapshot(state, day, host, initialIndex, options, effectiveByDate.get(day) || [], rewashesByDate.get(day) || []);
    const key = groupSize === 'day' ? day : groupSize === 'week' ? mondayOf(day) : day.slice(0, 7);
    const row = buckets.get(key);
    if (!row) continue;
    row.taskTotal += item.effectiveTaskTotal;
    row.recordedTasks += item.taskCount;
    row.manualTotal += item.manualTotal ?? 0;
    row.unspecified += item.unspecified;
    row.extras += item.extrasCount;
    row.recordedActivities += item.recordedActivities;
    row.overallActivities += item.overallActivities;
    row.distractionMinutes += item.distractionMinutes;
    row.workMinutes += item.workMinutes;
    row.reviewDays += Number(item.needsReview);
  }
  const timeline = [...buckets.values()];
  const totals = timeline.reduce((sum, row) => {
    for (const key of ['taskTotal', 'recordedTasks', 'manualTotal', 'unspecified', 'extras', 'recordedActivities', 'overallActivities', 'distractionMinutes', 'workMinutes', 'reviewDays']) sum[key] += row[key];
    return sum;
  }, { taskTotal: 0, recordedTasks: 0, manualTotal: 0, unspecified: 0, extras: 0, recordedActivities: 0, overallActivities: 0, distractionMinutes: 0, workMinutes: 0, reviewDays: 0 });
  return { period, start, today, groupSize, timeline, totals };
}
