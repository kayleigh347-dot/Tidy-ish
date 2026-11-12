const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const B = require('../js/backup-tools.js');
const Shared = require('../js/sharing-model.js');

test('Daily Log records travel through board, backup, and household sync storage', async () => {
  const core = await import('../addons/tidyish-daily-log/core.mjs');
  let log = core.emptyState();
  log = core.addAchievement(log, { date: '2026-11-10', title: 'Cleaned the fridge', roomId: 'kitchen' });
  log = core.recordLaundryRewash(log, 2, new Date('2026-11-10T12:30:00Z'), { loadId: 'load-2', label: 'Load 2' });

  const incoming = M.board();
  incoming.features.dailyLogRecords = log.records;
  incoming.features.dailyLogRewashes = log.rewashes;
  const normalized = M.normalize(incoming);
  assert.deepEqual(normalized.features.dailyLogRecords, log.records);
  assert.deepEqual(normalized.features.dailyLogRewashes, log.rewashes);

  const current = M.board();
  const merged = M.merge(current, normalized);
  assert.deepEqual(merged.features.dailyLogRecords, log.records);
  assert.deepEqual(merged.features.dailyLogRewashes, log.rewashes);

  const backup = B.prepare(current, JSON.stringify(incoming), M);
  const backupMerged = B.apply(current, backup, M);
  assert.deepEqual(backupMerged.features.dailyLogRecords, log.records);
  assert.deepEqual(backupMerged.features.dailyLogRewashes, log.rewashes);
  const restore = B.prepareRestore(current, JSON.stringify(incoming), M);
  const restored = B.applyRestore(current, restore, M);
  assert.deepEqual(restored.features.dailyLogRecords, log.records);
  assert.deepEqual(restored.features.dailyLogRewashes, log.rewashes);

  const shared = Shared.project(incoming, {}, 'test-account');
  const imported = Shared.importRaw(shared);
  assert.deepEqual(imported.features.dailyLogRecords, log.records);
  assert.deepEqual(imported.features.dailyLogRewashes, log.rewashes);
  const accepted = Shared.accept(current, shared, { native: Shared.snapshot(current), hidden: [] });
  assert.deepEqual(accepted.features.dailyLogRecords, log.records);
  assert.deepEqual(accepted.features.dailyLogRewashes, log.rewashes);
});

test('Daily Log statistics use corrected completion dates and retain laundry re-wash dates', async () => {
  const core = await import('../addons/tidyish-daily-log/core.mjs');
  let log = core.emptyState();
  log = core.correctCompletionDate(log, {
    id: 'win-1', title: 'Wash dishes', taskId: 'task-1', rootId: 'task-1',
    at: '2026-11-11T11:00:00Z', room: 'kitchen', minutes: 20
  }, '2026-11-10', { now: new Date('2026-11-12T12:00:00Z') });
  log = core.setDailyTotal(log, '2026-11-10', 3, { now: new Date('2026-11-12T12:00:00Z') });
  log = core.addAchievement(log, { date: '2026-11-10', title: 'Wiped counters', minutes: 5 });
  log = core.addDistraction(log, { date: '2026-11-10', description: 'Phone', minutes: 15 }, { now: new Date('2026-11-12T12:00:00Z') });
  log = core.recordLaundryRewash(log, 2, new Date('2026-11-10T12:30:00Z'), { label: 'Load 2' });

  const host = { completions: [{
    id: 'win-1', title: 'Wash dishes', taskId: 'task-1', rootId: 'task-1',
    at: '2026-11-11T11:00:00Z', room: 'kitchen', minutes: 20
  }] };
  const snapshot = core.snapshot(log, '2026-11-10', host);
  assert.equal(snapshot.wins.length, 1);
  assert.equal(snapshot.rewashes.length, 1);
  assert.equal(snapshot.rewashes[0].date, '2026-11-10');
  const graph = core.statistics(log, host, { today: '2026-11-12', period: '7' });
  const day = graph.timeline.find(row => row.key === '2026-11-10');
  assert.equal(day.recordedTasks, 1);
  assert.equal(day.taskTotal, 3);
  assert.equal(day.extras, 1);
  assert.equal(day.distractionMinutes, 15);
  assert.equal(day.workMinutes, 25);
});
