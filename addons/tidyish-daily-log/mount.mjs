import {
  addAchievement,
  addDistraction,
  capturePlannedDay,
  completionDate,
  correctCompletionDate,
  createLocalStorageAdapter,
  deleteDistraction,
  editDistraction,
  emptyState,
  isDay,
  localDay,
  normalizeState,
  recordLaundryRewash,
  resolveRecord,
  revisionGroups,
  setDailyTotal,
  snapshot,
  statistics
} from './core.mjs?v=20261112-connected1';

function element(tag, className = '', value = '') {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined && value !== null) item.textContent = String(value);
  return item;
}

function append(parent, ...children) {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

function button(label, action, data = {}) {
  const item = element('button', 'tdl-button', label);
  item.type = 'button';
  item.dataset.action = action;
  for (const [key, value] of Object.entries(data)) item.dataset[key] = String(value);
  return item;
}

function labeled(label, control, className = '') {
  const wrapper = element('label', 'tdl-field ' + className);
  append(wrapper, element('span', 'tdl-label', label), control);
  return wrapper;
}

function input(type, name, value = '', attrs = {}) {
  const control = element('input', 'tdl-input');
  control.type = type;
  control.name = name;
  if (value !== undefined && value !== null) control.value = String(value);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'required' || key === 'disabled' || key === 'checked') control[key] = !!val;
    else if (key === 'min' || key === 'max' || key === 'step' || key === 'placeholder' || key === 'autocomplete') control[key] = val;
    else control.setAttribute(key, String(val));
  }
  return control;
}

function textarea(name, value = '', attrs = {}) {
  const control = element('textarea', 'tdl-input');
  control.name = name;
  control.value = String(value ?? '');
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'required' || key === 'rows' || key === 'maxLength') control[key] = val;
    else control.setAttribute(key, String(val));
  }
  return control;
}

function select(name, choices, selected = '') {
  const control = element('select', 'tdl-input');
  control.name = name;
  for (const choice of choices) {
    const option = element('option', '', choice.label);
    option.value = choice.value;
    option.selected = String(choice.value) === String(selected);
    control.append(option);
  }
  return control;
}

function heading(text, level = 2) {
  return element('h' + level, '', text);
}

function section(title, content, className = '') {
  const wrapper = element('section', 'tdl-section ' + className);
  append(wrapper, heading(title, 2), content);
  return wrapper;
}

function formatMinutes(value) {
  const total = Number(value) || 0;
  if (total < 60) return total + ' min';
  const hours = Math.floor(total / 60), remainder = total % 60;
  return remainder ? hours + ' hr ' + remainder + ' min' : hours + (hours === 1 ? ' hr' : ' hrs');
}

function durationInMinutes(values) {
  if (values.unit !== 'minutes' && values.unit !== 'hours') throw Error('Choose minutes or hours for the distraction duration.');
  const amount = Number(values.minutes);
  const total = amount * (values.unit === 'hours' ? 60 : 1);
  if (!Number.isInteger(amount) || amount < 1 || !Number.isInteger(total) || total > 1440) {
    throw Error('Enter a distraction duration from 1 minute to 24 hours.');
  }
  return { ...values, minutes: String(total) };
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value + 'T12:00:00');
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date) : value;
}

function roomName(row) {
  return row.roomName || row.room || row.roomId || 'General';
}

function listOrEmpty(rows, emptyMessage) {
  const list = element('ul', 'tdl-list');
  if (!rows.length) {
    const empty = element('p', 'tdl-empty', emptyMessage);
    return empty;
  }
  for (const row of rows) list.append(row);
  return list;
}

function metric(label, value) {
  const wrapper = element('div', 'tdl-metric');
  append(wrapper, element('dt', '', label), element('dd', '', value));
  return wrapper;
}

function conflictDescription(row) {
  if (row.kind === 'distraction') return row.deleted ? 'Deleted distraction' : row.description + ' · ' + formatMinutes(row.minutes);
  if (row.kind === 'daily-total') return 'Daily total: ' + row.total;
  if (row.kind === 'planned') return row.tasks.length ? 'Planned: ' + row.tasks.map(task => task.title).join(', ') : 'No tasks planned';
  if (row.kind === 'achievement') return row.description ? row.title + ' · ' + row.description : row.title;
  if (row.kind === 'completion-date') return 'Completion date: ' + formatDate(row.date);
  return row.kind;
}

function renderConflicts(container, state, date, completionConflictIds = new Set()) {
  const conflicts = revisionGroups(state).filter(group => group.conflict && (
    group.kind === 'completion-date' ? completionConflictIds.has(group.recordId) : group.heads.some(row => row.date === date)
  ));
  if (!conflicts.length) return;
  const wrapper = section('Needs review', element('p', 'tdl-hint', 'Choose which version to keep. The add-on preserves both versions in its history.'));
  const list = element('div', 'tdl-conflicts');
  for (const group of conflicts) {
    const card = element('article', 'tdl-conflict');
    append(card, element('h3', '', group.kind === 'completion-date' ? 'Completion date changed on another device' : 'This record has two versions'));
    for (const head of group.heads) {
      const choice = element('div', 'tdl-conflict-choice');
      append(choice, element('p', '', conflictDescription(head)), button('Keep this version', 'resolve', {
        recordId: group.recordId, revisionId: head.id
      }));
      card.append(choice);
    }
    list.append(card);
  }
  wrapper.append(list);
  container.append(wrapper);
}

export function renderDailySnapshot(root, stateValue, date, host = {}) {
  const state = normalizeState(stateValue || emptyState());
  const data = snapshot(state, date, host);
  root.replaceChildren();
  root.classList.add('tidyish-daily-log-snapshot');
  append(root, heading('Daily snapshot · ' + formatDate(date), 2));

  const summary = element('dl', 'tdl-metrics');
  summary.append(
    metric('Recorded completed activities', data.recordedActivities),
    metric('Completed tasks', data.taskCount),
    metric('Manual task total', data.manualTotal === null ? 'Not entered' : data.manualTotal),
    metric('Unspecified completions', data.unspecified),
    metric('Overall completed activities', data.overallActivities),
    metric('Distraction time', formatMinutes(data.distractionMinutes)),
    metric('Completed work time', data.workMinutes ? formatMinutes(data.workMinutes) : 'Not recorded')
  );
  root.append(summary);
  if (data.needsReview) {
    root.append(element('p', 'tdl-review', 'Some figures need review. Your recorded completions have been kept.'));
  }

  const planned = data.planned.map(item => {
    const row = element('li', 'tdl-list-row');
    append(row, element('span', '', item.title), element('span', item.completed ? 'tdl-status tdl-done' : 'tdl-status', item.completed ? 'Completed' : 'Not completed'));
    return row;
  });
  const plannedContent = element('div', 'tdl-stack');
  plannedContent.append(listOrEmpty(planned, 'No planned tasks were saved for this date.'));
  const planConflict = revisionGroups(state).some(group => group.kind === 'planned' && group.conflict && group.heads.some(row => row.date === date));
  const hasSavedPlan = revisionGroups(state, 'planned').some(group => group.recordId === 'planned:' + date);
  if (!planConflict && !hasSavedPlan) plannedContent.append(element('p', 'tdl-hint', 'Save a copy of this plan to keep it unchanged if the task list changes later.'));
  root.append(section('Planned tasks', plannedContent));

  const completed = data.wins.map(win => {
    const detail = [roomName(win), win.minutes ? formatMinutes(win.minutes) : ''].filter(Boolean).join(' · ');
    const row = element('li', 'tdl-list-row');
    append(row, element('span', '', win.title || 'Completed task'), element('span', 'tdl-detail', detail));
    return row;
  });
  root.append(section('Things completed', listOrEmpty(completed, 'No individual task completions were recorded for this date.')));

  const achievements = data.achievements.map(activity => {
    const row = element('li', 'tdl-list-row');
    const detail = [roomName(activity), activity.minutes ? formatMinutes(activity.minutes) : ''].filter(Boolean).join(' · ');
    append(row, element('span', '', activity.title), element('span', 'tdl-detail', detail));
    if (activity.description) row.append(element('p', 'tdl-description', activity.description));
    return row;
  });
  root.append(section('Extra things I did', listOrEmpty(achievements, 'No extra activities were logged for this date.')));

  const distractions = data.distractions.map(item => {
    const row = element('li', 'tdl-list-row');
    append(row, element('span', '', item.description), element('span', 'tdl-detail', formatMinutes(item.minutes)));
    return row;
  });
  const distractionContent = element('div', 'tdl-stack');
  distractionContent.append(listOrEmpty(distractions, 'No distractions were logged for this date.'));
  distractionContent.append(element('p', 'tdl-total-line', 'Total distraction time: ' + formatMinutes(data.distractionMinutes)));
  root.append(section('Distractions', distractionContent));

  const rewashes = data.rewashes.map(row => {
    const item = element('li', 'tdl-list-row');
    append(item, element('span', '', row.label), element('span', 'tdl-detail', 'Re-washed · ' + formatDate(row.date)));
    return item;
  });
  if (rewashes.length) root.append(section('Laundry re-washes', listOrEmpty(rewashes, '')));

  if (data.completionConflicts.length) {
    const rows = data.completionConflicts.map(win => {
      const item = element('li', 'tdl-list-row');
      const candidates = (win._dateCandidates || []).map(formatDate).join(' or ');
      append(item, element('span', '', win.title || 'Completed task'), element('span', 'tdl-detail', 'Possible dates: ' + candidates));
      return item;
    });
    root.append(section('Completion dates to review', listOrEmpty(rows, '')));
  }
  renderConflicts(root, state, date, new Set(data.completionConflicts.map(win => 'completion-date:' + win.id)));
  return data;
}

function chart(title, field, timeline, unit, colorClass) {
  const figure = element('figure', 'tdl-chart');
  figure.append(heading(title, 3));
  const max = Math.max(1, ...timeline.map(row => Number(row[field]) || 0));
  const list = element('ol', 'tdl-bars');
  for (const row of timeline) {
    const value = Number(row[field]) || 0;
    const item = element('li', 'tdl-bar-row');
    const label = element('span', 'tdl-bar-label', row.label);
    const track = element('span', 'tdl-bar-track');
    const bar = element('span', 'tdl-bar ' + colorClass);
    bar.style.width = Math.max(value ? 2 : 0, value / max * 100) + '%';
    track.append(bar);
    append(item, label, track, element('span', 'tdl-bar-value', String(value) + (unit ? ' ' + unit : '')));
    list.append(item);
  }
  figure.append(list);
  return figure;
}

function getStorage(options) {
  if (options.storageAdapter) {
    if (typeof options.storageAdapter.load !== 'function' || typeof options.storageAdapter.save !== 'function') {
      throw Error('The storage adapter must provide load() and save(state).');
    }
    return options.storageAdapter;
  }
  const storage = options.storageApi || globalThis.localStorage;
  return createLocalStorageAdapter(storage, options.storageKey);
}

function getStateAccess(options) {
  if ((options.loadState !== undefined && typeof options.loadState !== 'function') ||
      (options.saveState !== undefined && typeof options.saveState !== 'function')) {
    throw Error('loadState and saveState must be functions.');
  }
  if (Boolean(options.loadState) !== Boolean(options.saveState)) {
    throw Error('Provide both loadState and saveState, or neither.');
  }
  const storage = getStorage(options);
  return {
    load: options.loadState || (() => storage.load()),
    save: options.saveState || (value => storage.save(value))
  };
}

function hostSnapshot(options, date) {
  const value = typeof options.getBoardSnapshot === 'function' ? options.getBoardSnapshot(date) : {};
  if (!value || typeof value !== 'object') return { completions: [], planned: [], rooms: [] };
  return {
    completions: Array.isArray(value.completions) ? value.completions : [],
    planned: Array.isArray(value.planned) ? value.planned : [],
    rooms: Array.isArray(value.rooms) ? value.rooms : []
  };
}

function completionChoiceLabel(state, win) {
  const date = completionDate(state, win);
  const when = date.conflict ? 'date needs review' : formatDate(date.date);
  return (win.title || 'Completed task') + ' · ' + when;
}

export function mountTaskDataAddon(root, options = {}) {
  if (!root || typeof root.replaceChildren !== 'function') throw Error('Choose a container for the Task Data add-on.');
  const stateAccess = getStateAccess(options);
  let state = normalizeState(stateAccess.load());
  const viewState = options.viewState && typeof options.viewState === 'object' ? options.viewState : {};
  const defaultDate = isDay(options.initialDate) ? options.initialDate : localDay(typeof options.now === 'function' ? options.now() : options.now || new Date());
  let selectedDate = isDay(viewState.selectedDate) ? viewState.selectedDate : defaultDate;
  let period = ['7', '30', '90', '365', 'all'].includes(String(viewState.period)) ? String(viewState.period) : '30';
  let selectedCompletionId = typeof viewState.selectedCompletionId === 'string' ? viewState.selectedCompletionId : '';
  let correctionDate = isDay(viewState.correctionDate) ? viewState.correctionDate : selectedDate;
  let editingDistractionId = typeof viewState.editingDistractionId === 'string' ? viewState.editingDistractionId : '';
  let message = '';

  const now = () => typeof options.now === 'function' ? options.now() : options.now || new Date();
  const host = () => hostSnapshot(options, selectedDate);
  const write = next => {
    const validated = normalizeState(next);
    stateAccess.save(validated);
    state = validated;
  };

  function render() {
    const board = host();
    const data = snapshot(state, selectedDate, board);
    const wrapper = element('section', 'tidyish-daily-log');
    const top = element('header', 'tdl-header');
    append(top, heading('Task Data · Daily Log', 1), element('p', 'tdl-intro', 'Keep planned work, completed activities and distractions in separate records.'));
    const dateBar = element('div', 'tdl-toolbar');
    append(dateBar, labeled('Snapshot date', input('date', 'snapshotDate', selectedDate, { 'data-role': 'snapshot-date' })),
      button('Today', 'today'));
    wrapper.append(top, dateBar);

    const snapshotHost = element('div', 'tidyish-daily-log-snapshot-host');
    renderDailySnapshot(snapshotHost, state, selectedDate, board);
    const capture = element('div', 'tdl-plan-save');
    append(capture, element('p', 'tdl-hint', 'Save the plan for this date so later task-list changes do not rewrite it.'),
      button('Save this plan as a snapshot', 'capture-plan'));
    snapshotHost.append(capture);
    wrapper.append(snapshotHost);

    const activityForm = element('form', 'tdl-form');
    activityForm.dataset.kind = 'activity';
    const activityGrid = element('div', 'tdl-form-grid');
    append(activityGrid,
      labeled('What did you do?', input('text', 'title', '', { required: true, maxLength: 140, autocomplete: 'off' })),
      labeled('Room', select('roomId', [{ value: 'general', label: 'General' }, ...board.rooms.map(room => ({
        value: room.id || room.value || '', label: room.name || room.label || room.id || 'Room'
      }))], 'general')),
      labeled('Date', input('date', 'date', selectedDate, { required: true })),
      labeled('Time spent (optional, minutes)', input('number', 'minutes', '', { min: 1, max: 1440, step: 1 }))
    );
    activityForm.append(activityGrid);
    activityForm.append(labeled('Description (optional)', textarea('description', '', { rows: 2, maxLength: 600 })));
    activityForm.append(element('button', 'tdl-button tdl-primary', 'I did a thing!'));
    wrapper.append(section('Log something I did', activityForm));

    const totalForm = element('form', 'tdl-form tdl-inline-form');
    totalForm.dataset.kind = 'daily-total';
    append(totalForm,
      labeled('Total tasks completed', input('number', 'total', data.manualTotal ?? '', { min: 0, max: 9999, step: 1, required: true })),
      labeled('Date', input('date', 'date', selectedDate, { required: true })),
      element('button', 'tdl-button tdl-primary', 'Save daily total'));
    wrapper.append(section('Daily completion total', totalForm));

    const distractionForm = element('form', 'tdl-form');
    distractionForm.dataset.kind = 'distraction';
    const distractionGrid = element('div', 'tdl-form-grid');
    append(distractionGrid,
      labeled('What distracted you?', input('text', 'description', '', { required: true, maxLength: 220, autocomplete: 'off' })),
      labeled('Time spent', input('number', 'minutes', '', { required: true, min: 1, max: 1440, step: 1 })),
      labeled('Duration unit', select('unit', [{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }], 'minutes')),
      labeled('Date', input('date', 'date', selectedDate, { required: true })));
    distractionForm.append(distractionGrid, element('button', 'tdl-button tdl-primary', 'Log distraction'));
    wrapper.append(section('Log a distraction', distractionForm));

    const distractionList = element('div', 'tdl-stack');
    if (!data.distractions.length) distractionList.append(element('p', 'tdl-empty', 'There are no distractions for this date.'));
    for (const item of data.distractions) {
      const row = element('article', 'tdl-edit-row');
      const summary = element('div', 'tdl-edit-summary');
      append(summary, element('strong', '', item.description), element('span', 'tdl-detail', formatMinutes(item.minutes)));
      const controls = element('div', 'tdl-button-row');
      controls.append(button('Edit', 'edit-distraction', { recordId: item.recordId }));
      controls.append(button('Delete', 'delete-distraction', { recordId: item.recordId }));
      append(row, summary, controls);
      if (editingDistractionId === item.recordId) {
        const unit = item.minutes % 60 === 0 ? 'hours' : 'minutes';
        const amount = unit === 'hours' ? item.minutes / 60 : item.minutes;
        const editForm = element('form', 'tdl-form tdl-edit-form');
        editForm.dataset.kind = 'edit-distraction';
        editForm.dataset.recordId = item.recordId;
        append(editForm,
          labeled('Description', input('text', 'description', item.description, { required: true, maxLength: 220 })),
          labeled('Time spent', input('number', 'minutes', amount, { required: true, min: 1, max: 1440, step: 1 })),
          labeled('Duration unit', select('unit', [{ value: 'minutes', label: 'Minutes' }, { value: 'hours', label: 'Hours' }], unit)),
          labeled('Date', input('date', 'date', item.date, { required: true })),
          element('button', 'tdl-button tdl-primary', 'Save changes'),
          button('Cancel', 'cancel-edit'));
        row.append(editForm);
      }
      distractionList.append(row);
    }
    wrapper.append(section('Edit or remove distractions', distractionList));

    const completions = board.completions;
    const correctionForm = element('form', 'tdl-form tdl-inline-form');
    correctionForm.dataset.kind = 'completion-date';
    if (completions.length) {
      if (!selectedCompletionId || !completions.some(row => row.id === selectedCompletionId)) selectedCompletionId = completions[0].id;
      const choices = completions.map(row => ({ value: row.id, label: completionChoiceLabel(state, row) }));
      const selected = completions.find(row => row.id === selectedCompletionId);
      append(correctionForm,
        labeled('Completion record', select('completionId', choices, selectedCompletionId)),
        labeled('Correct date', input('date', 'date', correctionDate || completionDate(state, selected).date || selectedDate, { required: true })),
        element('button', 'tdl-button tdl-primary', 'Save corrected date'));
    } else {
      correctionForm.append(element('p', 'tdl-empty', 'There are no completion records available to correct.'));
    }
    wrapper.append(section('Correct a completion date', correctionForm));

    const graph = statistics(state, board, { period, today: localDay(now()) });
    const graphSection = element('section', 'tdl-section tdl-statistics');
    const graphToolbar = element('div', 'tdl-toolbar');
    append(graphToolbar, heading('Patterns over time', 2), labeled('Date range', select('period', [
      { value: '7', label: '7 days' }, { value: '30', label: '30 days' },
      { value: '90', label: '90 days' }, { value: '365', label: '12 months' }, { value: 'all', label: 'All recorded time' }
    ], period)));
    graphSection.append(graphToolbar);
    const charts = element('div', 'tdl-chart-grid');
    charts.append(
      chart('Overall task total', 'taskTotal', graph.timeline, 'tasks', 'tdl-task-bar'),
      chart('Individual task completions', 'recordedTasks', graph.timeline, 'tasks', 'tdl-recorded-bar'),
      chart('Manually entered daily totals', 'manualTotal', graph.timeline, 'tasks', 'tdl-manual-bar'),
      chart('Extra activities', 'extras', graph.timeline, 'activities', 'tdl-extra-bar'),
      chart('Distraction time', 'distractionMinutes', graph.timeline, 'min', 'tdl-distraction-bar'),
      chart('Completed work time', 'workMinutes', graph.timeline, 'min', 'tdl-work-bar')
    );
    graphSection.append(charts);
    const graphNote = element('p', 'tdl-hint', 'Task bars use the greater of individual completions or your manual task total. Unspecified completions are shown separately below.');
    graphSection.append(graphNote);
    const totals = element('dl', 'tdl-metrics tdl-graph-totals');
    totals.append(
      metric('Recorded tasks', graph.totals.recordedTasks),
      metric('Manual task totals', graph.totals.manualTotal),
      metric('Unspecified completions', graph.totals.unspecified),
      metric('Extra activities', graph.totals.extras),
      metric('Distraction time', formatMinutes(graph.totals.distractionMinutes)),
      metric('Completed work time', formatMinutes(graph.totals.workMinutes))
    );
    graphSection.append(totals);
    wrapper.append(graphSection);

    const status = element('p', 'tdl-message', message);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    wrapper.append(status);
    root.replaceChildren(wrapper);
  }

  function completeMutation(next, successMessage) {
    write(next);
    message = successMessage;
    render();
  }

  function onSubmit(event) {
    const form = event.target.closest('form[data-kind]');
    if (!form || !root.contains(form)) return;
    event.stopPropagation();
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const kind = form.dataset.kind;
    try {
      if (kind === 'activity') {
        completeMutation(addAchievement(state, values, { now: now() }), 'Activity saved.');
      } else if (kind === 'daily-total') {
        completeMutation(setDailyTotal(state, values.date, values.total, { now: now() }), 'Daily total saved.');
      } else if (kind === 'distraction') {
        completeMutation(addDistraction(state, durationInMinutes(values), { now: now() }), 'Distraction saved separately from completed tasks and Focus timing.');
      } else if (kind === 'edit-distraction') {
        const next = editDistraction(state, form.dataset.recordId, durationInMinutes(values), { now: now() });
        editingDistractionId = '';
        completeMutation(next, 'Distraction updated.');
      } else if (kind === 'completion-date') {
        const selected = host().completions.find(row => row.id === values.completionId);
        correctionDate = values.date;
        completeMutation(correctCompletionDate(state, selected, values.date, { now: now() }), 'Completion date corrected in the add-on record.');
      }
    } catch (error) {
      message = error instanceof Error ? error.message : 'The change could not be saved.';
      render();
    }
  }

  function onChange(event) {
    const target = event.target;
    if (!root.contains(target)) return;
    event.stopPropagation();
    if (target.matches('[data-role="snapshot-date"]')) {
      if (!target.value) return;
      selectedDate = target.value;
      correctionDate = selectedDate;
      message = '';
      render();
    } else if (target.name === 'period') {
      period = target.value;
      render();
    } else if (target.name === 'completionId') {
      selectedCompletionId = target.value;
      const chosen = host().completions.find(row => row.id === selectedCompletionId);
      correctionDate = completionDate(state, chosen).date || selectedDate;
      render();
    }
  }

  function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target || !root.contains(target)) return;
    event.stopPropagation();
    try {
      const action = target.dataset.action;
      if (action === 'today') {
        selectedDate = localDay(now());
        correctionDate = selectedDate;
        message = '';
        render();
      } else if (action === 'capture-plan') {
        const planned = host().planned.filter(row => row.date === selectedDate);
        completeMutation(capturePlannedDay(state, selectedDate, planned, { now: now() }), 'Planned tasks saved for this date.');
      } else if (action === 'edit-distraction') {
        editingDistractionId = target.dataset.recordId;
        render();
      } else if (action === 'cancel-edit') {
        event.preventDefault();
        editingDistractionId = '';
        render();
      } else if (action === 'delete-distraction') {
        completeMutation(deleteDistraction(state, target.dataset.recordId, { now: now() }), 'Distraction deleted.');
      } else if (action === 'resolve') {
        completeMutation(resolveRecord(state, target.dataset.recordId, target.dataset.revisionId, { now: now() }), 'Record conflict resolved; both versions remain in its history.');
      }
    } catch (error) {
      message = error instanceof Error ? error.message : 'The change could not be saved.';
      render();
    }
  }

  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  render();
  return Object.freeze({
    refresh: render,
    unmount() {
      root.removeEventListener('submit', onSubmit);
      root.removeEventListener('change', onChange);
      root.removeEventListener('click', onClick);
      root.replaceChildren();
    },
    getState() { return normalizeState(state); },
    getViewState() { return { selectedDate, period, selectedCompletionId, correctionDate, editingDistractionId }; }
  });
}

export function mountLaundryRewashButton(container, slot, options = {}) {
  if (!container || typeof container.append !== 'function') throw Error('Choose a container for the re-wash button.');
  const number = Number(slot);
  if (!Number.isInteger(number) || number < 1) throw Error('Choose an active laundry load.');
  const stateAccess = getStateAccess(options);
  const label = String(options.label || 'Load ' + number);
  const buttonElement = button('Re-washed', 'rewash');
  buttonElement.setAttribute('aria-label', 'Record ' + label + ' as re-washed');
  const status = element('span', 'tdl-rewash-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const onClick = event => {
    event.stopPropagation();
    buttonElement.disabled = true;
    try {
      const next = recordLaundryRewash(stateAccess.load(), number, typeof options.now === 'function' ? options.now() : options.now || new Date(), {
        loadId: options.loadId || '',
        label
      });
      stateAccess.save(next);
      const row = next.rewashes[next.rewashes.length - 1];
      status.textContent = 'Re-wash recorded for ' + formatDate(row.date) + '.';
      if (typeof options.onSaved === 'function') {
        try { options.onSaved(row, normalizeState(next)); }
        catch { status.textContent = 'Re-wash saved; the view could not refresh.'; }
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'The re-wash could not be saved.';
    } finally {
      buttonElement.disabled = false;
    }
  };
  buttonElement.addEventListener('click', onClick);
  container.append(buttonElement, status);
  return Object.freeze({
    button: buttonElement,
    unmount() {
      buttonElement.removeEventListener('click', onClick);
      buttonElement.remove();
      status.remove();
    }
  });
}
