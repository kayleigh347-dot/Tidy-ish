# Tidy-ish Daily Log add-on

This is a fresh, standalone package for the Task Data and laundry re-wash features. It does not import code from another app. Tidy-ish now loads and mounts this package from the host app.

Files in this package:

- core.mjs contains independent record, snapshot, merge, and statistics logic.
- mount.mjs exposes the Task Data panel, a Calendar snapshot renderer, and the laundry re-wash button.
- addon.css contains styles scoped to this package.

## Current boundary

The host stores add-on revisions in `board.features.dailyLogRecords` and re-wash events in `board.features.dailyLogRewashes`. Tidy-ish includes both arrays in local backup, restore, merge, and household sync. The standalone package still offers a browser local-storage adapter for independent use.

The feature does not modify task records, completion IDs, points, Undo state, Focus timing, or laundry-cycle progress. The laundry button records a separate dated event.

`js/daily-log-host.js` loads this package. The app mounts its Task Data panel, Calendar snapshots, and re-wash buttons through `mount.mjs`, using the host board as the storage adapter.

## Host snapshot shape

mountTaskDataAddon takes a getBoardSnapshot callback. It should return a new, read-only view of host data in this shape:

    {
      completions: [
        {
          id: "stable completion ID",
          title: "Task title",
          at: "2026-11-12T10:30:00.000Z",
          taskId: "task or subtask ID",
          rootId: "optional parent task ID",
          roomId: "room ID or general",
          completedBy: "optional household member ID",
          minutes: 12
        }
      ],
      planned: [
        {
          date: "2026-11-12",
          taskId: "stable task ID",
          title: "Task title at plan capture",
          roomId: "room ID or general",
          source: "optional task list or schedule name",
          completionTaskIds: ["leaf completion ID"],
          minutes: null
        }
      ],
      rooms: [{ id: "room ID", name: "Room name" }]
    }

completionTaskIds should contain all individual completion IDs needed to mark a planned parent task complete. The add-on reads this snapshot and does not mutate it.

## Host integration

The classic host script loads the package modules dynamically:

    import('../addons/tidyish-daily-log/core.mjs');
    import('../addons/tidyish-daily-log/mount.mjs');

The host passes `loadState` and `saveState` callbacks backed by the two board arrays. `getBoardSnapshot(date)` returns task completions, the selected date's scheduled tasks, and rooms. Planned parent tasks include the IDs of their leaf completions.

The Daily Log tab is inside Task Data. Selecting a date in the Calendar opens the same snapshot renderer and offers a link to that date in Task Data. Active laundry loads expose “Re-washed” once the load has started; finished one-off loads retain the control in the Finished loads list.

The date snapshot shows re-wash entries under “Laundry re-washes.” They do not advance, undo, or award points for the laundry cycle.

## Adapter options

mountTaskDataAddon and mountLaundryRewashButton accept one of:

- storageAdapter: { load(), save(state) }
- storageApi and optional storageKey
- loadState() and saveState(state) callbacks

These calls are synchronous. The host adapter persists the normalized state through the app's existing board mutation path so records are backed up and synchronized with the household.

## Exports

core.mjs exports validation and storage helpers, addAchievement, setDailyTotal, addDistraction, editDistraction, deleteDistraction, capturePlannedDay, correctCompletionDate, completionDate, effectiveCompletions, recordLaundryRewash, snapshot, statistics, revisionGroups, resolveRecord, and mergeStates.

Conflicting edits remain visible as separate heads after a merge. The UI asks the user to choose a version before changing that record; resolving creates a new revision and keeps its history.
