const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/model.js');
const TD = require('../js/task-data.js');
const ACT = require('../js/activity-calendar-data.js');

const loadCore = () => import('../addons/tidyish-daily-log/core.mjs');

test('Calendar and Doing Now plans combine without duplicate tasks', async () => {
  const core = await loadCore();
  const date = '2026-11-14';
  const calendar = [{
    date, taskId: 'task-1', title: 'Clean shelf',
    roomId: 'living', source: 'Calendar',
    completionTaskIds: ['child-1'], minutes: 20
  }];
  const doing = [{
    date, taskId: 'task-1', title: 'Clean shelf',
    source: 'Doing Now', completionTaskIds: ['child-2']
  }, {
    date, taskId: 'task-2', title: 'Sort drawer',
    source: 'Doing Now', completionTaskIds: ['task-2']
  }];

  const merged = core.combinePlannedTasks(date, calendar, doing, date);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].sources, ['Calendar', 'Doing Now']);
  assert.deepEqual(merged[0].completionTaskIds, ['child-1', 'child-2']);
  assert.equal(merged[0].minutes, 20);
  assert.equal(merged[1].taskId, 'task-2');
  assert.equal(calendar[0].source, 'Calendar');
  assert.equal(calendar[0].completionTaskIds.length, 1);
});

test('Current Doing Now tasks are never inserted into past dates', async () => {
  const core = await loadCore();
  const result = core.combinePlannedTasks(
    '2026-11-13',
    [{ taskId: 'calendar-1', title: 'Planned', source: 'Calendar' }],
    [{ taskId: 'doing-1', title: 'Current task', source: 'Doing Now' }],
    '2026-11-14'
  );
  assert.deepEqual(result.map(row => row.taskId), ['calendar-1']);
});

test('Saved historical plans survive later task-list changes', async () => {
  const core = await loadCore();
  const date = '2026-11-10';
  const plan = core.combinePlannedTasks(
    date,
    [{ taskId: 'task-1', title: 'Original plan', source: 'Calendar' }],
    [],
    date
  );
  const saved = core.capturePlannedDay(core.emptyState(), date, plan);
  plan[0].title = 'Changed current task';

  const view = core.snapshot(saved, date, {
    completions: [],
    planned: [{ date, taskId: 'task-1', title: 'New live plan' }]
  });

  assert.equal(view.planned.length, 1);
  assert.equal(view.planned[0].title, 'Original plan');
  assert.deepEqual(view.planned[0].sources, ['Calendar']);
});

test('Without corrections, the history projection returns the original board', async () => {
  const core = await loadCore();
  const board = M.board();
  board.features.wins.push({
    id: 'win-1', at: '2026-11-11T12:00:00Z',
    taskId: 'task-1', room: 'kitchen', points: 2
  });
  assert.strictEqual(
    core.projectCompletionDates(board, core.emptyState()),
    board
  );
});

test('Corrected dates appear in Task Data and Activity Calendar without changing saved wins', async () => {
  const core = await loadCore();
  const board = M.board();
  const quest = M.task({
    id: 'task-1',
    title: 'Wash dishes',
    room: 'kitchen'
  });
  M.add(board, quest);

  const win = {
    id: 'win-1',
    taskId: 'task-1',
    rootId: 'task-1',
    title: 'Wash dishes',
    room: 'kitchen',
    at: '2026-11-11T11:30:00Z',
    points: 3,
    minutes: 15
  };
  board.features.wins.push(win);
  const original = JSON.stringify(board);

  const log = core.correctCompletionDate(
    core.emptyState(), win, '2026-11-10',
    { now: new Date('2026-11-12T12:00:00Z') }
  );

  const view = core.projectCompletionDates(board, log);
  assert.notStrictEqual(view, board);
  assert.equal(view.features.wins[0].at, '2026-11-10T12:00:00.000Z');
  assert.equal(view.features.wins[0]._dailyLogCorrectedDate, '2026-11-10');
  assert.equal(view.features.wins[0].points, 3);
  assert.equal(JSON.stringify(board), original);
  assert.strictEqual(board.features.wins[0], win);

  const taskData = TD.summarize(view, {
    period: 'all',
    now: new Date('2026-11-14T12:00:00Z')
  });
  assert.equal(taskData.count, 1);
  assert.equal(taskData.points, 3);
  assert.equal(taskData.trend.find(row => row.day === '2026-11-10').count, 1);
  assert.equal(taskData.trend.find(row => row.day === '2026-11-11').count, 0);

  const perQuest = TD.perQuest(view, 'task-1');
  assert.equal(perQuest.lastDone, '2026-11-10T12:00:00.000Z');
  assert.equal(perQuest.count, 1);

  const activity = ACT.analyze(view, { today: '2026-11-14' });
  assert.equal(activity.days['2026-11-10'].count, 1);
  assert.equal(activity.days['2026-11-10'].points, 3);
  assert.equal(activity.days['2026-11-11'], undefined);
});

test('UK summer-time boundary never moves a completion to the wrong day', async () => {
  const core = await loadCore();
  const board = M.board();
  const win = {
    id: 'summer-win',
    at: '2026-07-11T23:30:00Z',
    room: 'living',
    points: 1
  };
  board.features.wins.push(win);

  // 23:30 UTC is already 12 July in the United Kingdom.
  const log = core.correctCompletionDate(
    core.emptyState(), win, '2026-07-12'
  );
  const view = core.projectCompletionDates(board, log);
  assert.equal(view.features.wins[0].at, win.at);
});

test('Application uses the read-only projection only for display', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../js/app.js'), 'utf8'
  );
  assert.match(source, /core\.projectCompletionDates\(board,\s*dailyLogState\(\)\)/);
  assert.match(source, /core\.combinePlannedTasks\(date, calendarRows, doingRows, today\)/);
  assert.match(source, /TidyTaskData\.summarize\(historyBoard,/);
  assert.match(source, /TidyActivityHost\.monthSummary\(dailyLogHistoryBoard\(\),/);
  assert.match(source, /TidyActivityHost\?\.mount\([^;]+dailyLogHistoryBoard\(\),/);
  assert.match(source, /dailyLogCompletionLabel\(w\)/);
  assert.match(source, /M\.doing\(board\)/);
});
