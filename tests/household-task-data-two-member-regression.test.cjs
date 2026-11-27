const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../js/model.js');
const Time = require('../js/quest-time-core.js');
const Data = require('../js/task-data.js');
const Share = require('../js/sharing-model.js');
const Codec = require('../js/local-storage-codec.js');

const accountA = 'synthetic-account-a';
const accountB = 'synthetic-account-b';
const taskId = 'synthetic-dust-mantel';
const at = '2026-11-27T09:00:00.000Z';
const clone = value => JSON.parse(JSON.stringify(value));

function syncState(board, base, account) {
  return {
    account, house: 'synthetic-house', kind: 'legacy', base: clone(base),
    native: Share.snapshot(board), initial: false, hidden: [], choices: {},
    conflicts: [], retired: [], pendingUndos: []
  };
}

function memberBoard(baseBoard, basePayload, account, name, winId, timerId, durationMs) {
  const board = M.clone(baseBoard);
  board.features.displayName = name;
  board.features.browserSync = syncState(board, basePayload, account);
  board.features.wins.push({
    id: winId, taskId, rootId: taskId, title: 'Dust the mantel', room: 'general',
    at, minutes: 1, measured: true, points: 1, person: name, _actor: account
  });
  board.features.questTimings.push({
    id: timerId, taskId, taskTitle: 'Dust the mantel', owner: `${account}|member:${name}`,
    kind: 'valid', durationMs, at, completionWinIds: [winId]
  });
  return board;
}

function renderDataPage(board, view) {
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const rowStart = source.indexOf('function dataCompletionRow(');
  const rowEnd = source.indexOf('\nfunction editDataCompletion(', rowStart);
  const pageStart = source.indexOf('function dataPage(){');
  const pageEnd = source.indexOf('\nfunction giftPeopleWithLegacy(', pageStart);
  assert.ok(rowStart >= 0 && rowEnd > rowStart && pageStart >= 0 && pageEnd > pageStart);
  const room = id => board.rooms.find(item => item.id === id) || (id === 'general' ? { name: 'General' } : null);
  const context = {
    board, dataTaskId: '', dataView: view, dataPeriod: 'all', dataRoom: 'all', dataVisible: 12,
    dataDay: '2026-11-27', window: { TidyTaskData: Data }, TIME: Time, M,
    dailyLogHistoryBoard: () => board,
    dailyLogCompletionLabel: win => win?.at || 'Date not recorded',
    rooms: () => board.rooms, room,
    tabs: () => '<nav></nav>', card: html => html,
    button: (label, action, id = '') => `<button data-action="${action}" data-id="${id}">${label}</button>`,
    esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(rowStart, rowEnd)}\n${source.slice(pageStart, pageEnd)}\nglobalThis.renderPage = dataPage;`, context);
  return context.renderPage();
}

async function synchronize(board, account, getRemote, saveRemote) {
  return Share.synchronize(
    board,
    async house => ({ house, account, payload: clone(getRemote()) }),
    async (_remote, payload) => { saveRemote(clone(payload)); return true; }
  );
}

test('two synthetic household members retain completion and timing rows through sync, reload, and Task Data rendering', async () => {
  const baseBoard = M.board();
  M.add(baseBoard, M.task({ id: taskId, title: 'Dust the mantel', room: 'general' }));
  const base = Share.project(baseBoard, {}, accountA);
  let remote = clone(base);
  const memberA = memberBoard(baseBoard, base, accountA, 'Member A', 'synthetic-win-a', 'synthetic-timer-a', 60000);
  const memberB = memberBoard(baseBoard, base, accountB, 'Member B', 'synthetic-win-b', 'synthetic-timer-b', 90000);

  const first = await synchronize(memberA, accountA, () => remote, next => { remote = next; });
  assert.deepEqual(first.conflicts, []);
  assert.deepEqual(remote.wins.map(row => row.id), ['synthetic-win-a']);
  assert.deepEqual(remote.settings.filter(row => row.id.startsWith('tidy-timing:')).map(row => row.timing.id), ['synthetic-timer-a']);
  const second = await synchronize(memberB, accountB, () => remote, next => { remote = next; });
  assert.deepEqual(second.conflicts, []);
  assert.deepEqual(remote.wins.map(row => row.id).sort(), ['synthetic-win-a', 'synthetic-win-b']);
  assert.deepEqual(remote.settings.filter(row => row.id.startsWith('tidy-timing:')).map(row => row.timing.id).sort(), ['synthetic-timer-a', 'synthetic-timer-b']);
  const repeated = await synchronize(first.accepted, accountA, () => remote, next => { remote = next; });
  assert.deepEqual(repeated.conflicts, []);

  const winIds = remote.wins.map(row => row.id).sort();
  const timerRows = remote.settings.filter(row => row.id.startsWith('tidy-timing:'));
  const timerIds = timerRows.map(row => row.timing.id).sort();
  assert.deepEqual(winIds, ['synthetic-win-a', 'synthetic-win-b']);
  assert.deepEqual(timerIds, ['synthetic-timer-a', 'synthetic-timer-b']);
  assert.equal(new Set(winIds).size, 2, 'a repeated sync must not duplicate completion IDs');
  assert.equal(new Set(timerIds).size, 2, 'a repeated sync must not duplicate timing IDs');
  assert.deepEqual(timerRows.map(row => row.timing.completionWinIds[0]).sort(), winIds);
  const rawWinA = remote.wins.find(row => row.id === 'synthetic-win-a');
  const rawWinB = remote.wins.find(row => row.id === 'synthetic-win-b');
  assert.deepEqual([rawWinA.completedBy, rawWinB.completedBy], [accountA, accountB]);
  assert.deepEqual([rawWinA.completedByName, rawWinB.completedByName], ['Member A', 'Member B']);
  for (const win of [rawWinA, rawWinB]) {
    assert.equal(win.taskId, taskId);
    assert.equal(win.rootTaskId, taskId);
    assert.equal(win.at, at);
    assert.equal(win.points, 1);
  }
  const rawTimerA = timerRows.find(row => row.timing.id === 'synthetic-timer-a').timing;
  const rawTimerB = timerRows.find(row => row.timing.id === 'synthetic-timer-b').timing;
  assert.deepEqual([rawTimerA.owner, rawTimerB.owner], [`${accountA}|member:Member A`, `${accountB}|member:Member B`]);
  assert.deepEqual([rawTimerA.taskId, rawTimerB.taskId], [taskId, taskId]);
  assert.deepEqual([rawTimerA.durationMs, rawTimerB.durationMs], [60000, 90000]);
  assert.deepEqual([rawTimerA.completionWinIds, rawTimerB.completionWinIds], [['synthetic-win-a'], ['synthetic-win-b']]);

  const reloaded = M.normalize(Codec.decode(Codec.encode(repeated.accepted)));
  assert.deepEqual(reloaded.features.wins.map(row => row.id).sort(), winIds);
  assert.deepEqual(reloaded.features.questTimings.map(row => row.id).sort(), timerIds);
  assert.deepEqual(reloaded.features.wins.map(row => row._actor).sort(), [accountA, accountB].sort());
  assert.deepEqual(reloaded.features.wins.map(row => [row.at, row.points, row.person]).sort(), [[at, 1, 'Member A'], [at, 1, 'Member B']].sort());
  assert.deepEqual(reloaded.features.questTimings.map(row => [row.at, row.durationMs]).sort(), [[at, 60000], [at, 90000]].sort());
  assert.deepEqual(reloaded.features.questTimings.map(row => row.owner).sort(), [`${accountA}|member:Member A`, `${accountB}|member:Member B`].sort());

  const overview = renderDataPage(reloaded, 'overview');
  assert.match(overview, /<strong>2<\/strong><span>Completions<\/span>/);
  assert.match(overview, /<strong>2<\/strong><span>Points<\/span>/);
  assert.match(overview, /Dust the mantel/);
  assert.match(overview, /Member A/);
  assert.match(overview, /Member B/);

  // This uses synthetic-only data to trace the existing timer rendering path; it does not approve exposing private timing data.
  const focus = renderDataPage(reloaded, 'focus');
  assert.match(focus, /Member A/);
  assert.match(focus, /Member B/);
  assert.match(focus, /Valid timed attempts/);
  assert.ok(focus.includes(Time.format(60000)));
  assert.ok(focus.includes(Time.format(90000)));
});

test('a record absent from the synthetic remote payload stays absent after import, reload, and rendering', async () => {
  const baseBoard = M.board();
  M.add(baseBoard, M.task({ id: taskId, title: 'Dust the mantel', room: 'general' }));
  const base = Share.project(baseBoard, {}, accountA);
  let remote = clone(base);
  const memberA = memberBoard(baseBoard, base, accountA, 'Member A', 'negative-win-a', 'negative-timer-a', 60000);
  await synchronize(memberA, accountA, () => remote, next => { remote = next; });

  // Member B's records are intentionally missing at the remote-payload boundary.
  assert.deepEqual(remote.wins.map(row => row.id), ['negative-win-a']);
  assert.deepEqual(Share.importRaw(remote).features.questTimings.map(row => row.id), ['negative-timer-a']);
  const emptyMemberB = M.clone(baseBoard);
  emptyMemberB.features.browserSync = syncState(emptyMemberB, base, accountB);
  const result = await synchronize(emptyMemberB, accountB, () => remote, next => { remote = next; });
  assert.deepEqual(result.accepted.features.wins.map(row => row.id), ['negative-win-a']);
  assert.deepEqual(result.accepted.features.questTimings.map(row => row.id), ['negative-timer-a']);

  const reloaded = M.normalize(Codec.decode(Codec.encode(result.accepted)));
  const overview = renderDataPage(reloaded, 'overview');
  assert.match(overview, /Member A/);
  assert.doesNotMatch(overview, /Member B/);
  assert.match(overview, /<strong>1<\/strong><span>Completions<\/span>/);
});
