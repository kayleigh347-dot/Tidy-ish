const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../js/model.js');
const MEM = require('../js/quest-memory.js');

test('Clean Meter uses corrected dates without modifying saved history', async () => {
  const core = await import('../addons/tidyish-daily-log/core.mjs');
  const board = M.board();

  const quest = M.task({
    id: 'clean-meter-test',
    title: 'Clean test shelf',
    room: 'living',
    checkDays: 3
  });
  M.add(board, quest);

  const win = {
    id: 'win-clean-meter',
    taskId: quest.id,
    rootId: quest.id,
    title: quest.title,
    room: quest.room,
    at: '2026-11-13T12:00:00Z',
    points: 2
  };
  board.features.wins.push(win);

  const original = JSON.stringify(board);
  const now = new Date('2026-11-14T12:00:00Z');

  const log = core.correctCompletionDate(
    core.emptyState(),
    win,
    '2026-11-10',
    { now }
  );

  const projected = core.projectCompletionDates(board, log);
  const before = MEM.status(board, quest, now);
  const after = MEM.status(projected, quest, now);

  assert.equal(before.daysSince, 1);
  assert.equal(before.due, false);

  assert.equal(after.daysSince, 4);
  assert.equal(after.due, true);
  assert.equal(after.lastDone, '2026-11-10T12:00:00.000Z');

  assert.equal(projected.features.wins[0].points, 2);
  assert.equal(JSON.stringify(board), original);
  assert.strictEqual(board.features.wins[0], win);
});

test('Uncorrected history is unaffected', async () => {
  const core = await import('../addons/tidyish-daily-log/core.mjs');
  const board = M.board();

  assert.strictEqual(
    core.projectCompletionDates(board, core.emptyState()),
    board
  );
});

test('Quest Data and Clean Meter share the projected board', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../js/app.js'), 'utf8'
  );

  assert.match(
    source,
    /const historyBoard=dailyLogHistoryBoard\(\),d=window\.TidyTaskData\?\.perQuest\(historyBoard,t\.id,TIME\.ownerOf\(board\)\)/
  );

  assert.match(
    source,
    /MEM\?\.status\?\.\(historyBoard,t\)/
  );
});
