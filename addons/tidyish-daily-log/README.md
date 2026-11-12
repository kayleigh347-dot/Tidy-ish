# Tidy-ish Daily Log add-on

This is a fresh, standalone package for the Task Data and laundry re-wash features. It does not import code from another app and does not modify the existing Tidy-ish files. It is dormant until the host app explicitly loads and mounts it.

Files in this package:

- core.mjs contains independent record, snapshot, merge, and statistics logic.
- mount.mjs exposes the Task Data panel, a Calendar snapshot renderer, and the laundry re-wash button.
- addon.css contains styles scoped to this package.

## Current boundary

The add-on stores its records under tidyish.daily-log-addon.v1 in browser local storage by default. It does not modify task records, completion IDs, points, Undo state, Focus timing, or laundry-cycle progress.

The current app's backup and household-sync model has explicit feature allowlists. This separate storage key is therefore local to one browser and is not included in the app's existing backup, restore, or sync flows. Showing these records inside the built-in Task Data or Calendar also requires a later host-app integration. No existing app file has been changed as part of this package.

For a future sync-aware adapter, provide loadState and saveState callbacks backed by the host's approved data model and call mergeStates when reconciling copies. Do not assume that adding an unknown property to the host board will make it persist or sync.

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

## Later host integration points

Load the module and stylesheet only in a separately reviewed integration change:

    import {
      mountTaskDataAddon,
      mountLaundryRewashButton,
      renderDailySnapshot
    } from "./addons/tidyish-daily-log/mount.mjs";
    import "./addons/tidyish-daily-log/addon.css";

Mount the Task Data panel into a new container with:

    const taskDataAddon = mountTaskDataAddon(container, {
      getBoardSnapshot,
      storageKey: "tidyish.daily-log-addon.v1"
    });

When a Calendar date is selected, call renderDailySnapshot(container, state, selectedDate, getBoardSnapshot()). The state value comes from the add-on storage adapter; it is separate from the household board until the host is deliberately changed.

Add the re-wash button only to an actual active laundry-load card with a positive slot number:

    const rewash = mountLaundryRewashButton(loadCard, load.slot, {
      label: "Load " + load.slot,
      loadId: String(load.slot),
      storageKey: "tidyish.daily-log-addon.v1"
    });

The button writes only a dated re-wash event to the add-on state. The daily snapshot shows that event under “Laundry re-washes.” It does not advance, undo, or award points for the laundry cycle.

## Adapter options

mountTaskDataAddon and mountLaundryRewashButton accept one of:

- storageAdapter: { load(), save(state) }
- storageApi and optional storageKey
- loadState() and saveState(state) callbacks

These calls are synchronous. For Task Data and laundry to share their local add-on state, use the same adapter or storage key. A custom adapter is responsible for persistence and, if later approved, household syncing and backup inclusion.

## Exports

core.mjs exports validation and storage helpers, addAchievement, setDailyTotal, addDistraction, editDistraction, deleteDistraction, capturePlannedDay, correctCompletionDate, completionDate, effectiveCompletions, recordLaundryRewash, snapshot, statistics, revisionGroups, resolveRecord, and mergeStates.

Conflicting edits remain visible as separate heads after a merge. The UI asks the user to choose a version before changing that record; resolving creates a new revision and keeps its history.
