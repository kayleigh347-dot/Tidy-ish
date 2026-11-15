# Tidy-ish: Hoover autocomplete dropdown patch

**Scope:** Add Task editor only. Based on the previously reviewed autocomplete patch, itself built from isolated feature files. Prior seven-file patch was reported validated on published `53a71d6`; this extra change (settings copy helper and one regression) must be retested against the **current** publish checkout before publishing. Nothing written to the user's Mac or GitHub.

## Release files

- `js/app.js` — in-place dropdown under the Task name input, capped at six suggestions; tap/click or keyboard selection; Escape/click-outside dismissal; choosing a suggestion copies reusable fields without opening or closing **More options** / **Add subtask**; retain Save confirmation and duplicate protection.
- `js/quest-library.js` — bounded read-only autocomplete over saved Quests and templates. Finds literal substrings anywhere, known aliases (including vacuum/Hoover), and close spellings. Results prefer the selected room.
- `css/hoover-autocomplete.css` — responsive purple/gold dropdown, 44px tap targets, keyboard focus indicator.
- `index.html` — adds the stylesheet and bumps cache versions only for modified app/library JavaScript.
- `tests/quest-library.test.cjs`, `tests/task-editor-save-regression.test.cjs` — matcher/interaction regressions, including ensuring copied estimate and mess impact stay under collapsed More options.

**Not changed:** the Base Schedule, stored task titles, completed history, Task Data logic, saved data, Focus, Home, task timers, or Just One Move / Finish Line prototypes.

A suggestion is optional. Choosing it fills the title and reusable settings (including estimate and mess impact) into existing editor fields without expanding **More options** or **Add subtask**. The user can open those sections to review and edit the values. Choosing it does **not** save the Quest itself. The regular Add Task button must still be pressed to save. Same-room existing task duplicates (including completed tasks) remain blocked.

## Verification

- `node --check js/app.js` — pass.
- `node --check js/quest-library.js` — pass.
- `node --test tests/quest-library.test.cjs tests/task-editor-save-regression.test.cjs` — 32 pass, 0 fail (including collapsed-settings regression) (with current model/base dependency copies in QA workspace).
- Full available QA snapshot with latest patch — **212 passed**, 1 expected backup-dependent skip, 0 failed (213 total). This snapshot is not the latest published checkout. The previous seven-file version, without this settings-helper refactor, was user-reported as **217 passed**, 1 expected skip, 0 failed (218 total) on `53a71d6`.
- Previous patch: headless Chromium component QA at 320px, 390px, 430px — passed dropdown placement and interaction. Latest revision: direct Chromium DOM component check at 390px passed for copying **15 minutes** and **big** mess impact while leaving More options closed, and keeping a manually opened More options open. This is not a normal-root browser smoke test.

**Not verified for this updated patch:** full current 53a71d6 checkout suite and normal-root browser smoke. Local Playwright navigation to `127.0.0.1` returned `ERR_BLOCKED_BY_ADMINISTRATOR`; direct DOM component checks succeeded. Run both full current checkout tests and normal-root browser smoke before release.

## Publishing status

Not published. GitHub's integration denied branch creation with 403, so this is a ready-to-review release patch, not a deployed change.
