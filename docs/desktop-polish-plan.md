# Desktop polish plan

Baseline: `d7c4a9e331d6972c0f8216c585a5cc0481e00a2a` (274 tests passing).

## Boundaries

Keep Kumo primitives and the compact league/season file-browser design. Preserve
template policies, archive restrictions, deletion confirmations, IPC security,
and native window controls. No new dependencies or unrelated refactors.
Components use `Name/index.ts` and `Name/Name.tsx`; custom hooks live in
`src/renderer/src/hooks`. Compose shared layout without merging domain behavior
into a configurable mega-component.

## Pass 1: dialogs and toolbar

- Share compact task-dialog structure, keeping forms, descriptions, validation,
  focus behavior, busy guards and always-mounted controlled dialogs intact.
- Place the sidebar toggle beside the sidebar and retain usable drag space and
  native control insets on both platforms.
- Add Open location alongside New location. Share picker/recent-location busy,
  cancellation and error handling; only one location operation at a time.
- Test picker modes, cancellation, failures, duplicate activation and existing
  dialog behavior.

## Pass 2: file-browser commands

- Reuse row action definitions for ellipsis and right-click menus. Keep row
  selection, keyboard navigation, read-only restrictions and focus restoration.
- Support keyboard context-menu invocation, without invalid table markup.
- Add application-scoped Open location, refresh and focus-filter shortcuts with
  platform-aware labels. Share handlers with visible controls. Do not add global
  OS shortcuts or intercept text editing, composition, dialogs or nested menus.
- Test command parity, modifier/overlay guards, cleanup and exactly-once dispatch.
- Right-click selects its row first. Use one controlled row menu for all opening
  methods where supported. Resolve Electron's default Reload accelerator before
  assigning refresh; there must be only one accelerator owner.

## Pass 3: startup and status

- Compact startup panel with Open location, New location and recent locations.
  Handle cancelled pickers, missing locations, failures and rapid activation.
- Keep the current path visible and add scoped operation feedback. Stale or
  overlapping completions must not erase newer status or leak across locations.
- Make CPU/heap diagnostics opt-in and stop polling while disabled. Preserve
  diagnostic APIs; retain meaningful error feedback.
- Test startup recovery, operation lifetimes and diagnostics subscription cleanup.
- Reuse main's existing recent-location storage/pruning, not a second renderer
  store. Keep startup errors inline; pause diagnostic sampling while hidden.
- Keep activity tracking small: a location-scoped provider with operation IDs,
  pending labels and completion/error state. Finishing an older operation must
  not overwrite a newer result; changing location resets the visible activity.
  Instrument imports, template sync and archive zip, plus explicit refresh when
  its actual completion can be tracked. Do not announce watcher churn.
- Diagnostics default off, enabled through a discoverable status-bar menu, with
  a guarded versioned UI preference. Isolate ticking metrics from the app shell.

## Review and release gates

Fable reviews the plan before implementation. Sol implements each pass; a fresh
Astra reviewer receives its diff/status without implementation explanations.
Resolve actionable findings and run tests, typecheck, lint and diff whitespace
checks before a scoped commit. A fresh Fable reviews the cumulative diff after
all passes; fix and verify any remaining actionable findings.

Fable plan review completed. Accepted its warnings about accelerator collisions,
presentational dialog composition, synchronous duplicate guards, stale operation
feedback and diagnostics lifetime. Its references to an unseen commit/branch are
not evidence: the reviewer had only the plan. Existing typed-name deletion safety
and recent-root validation remain authoritative; do not add new backend policy or
a second recent-location store. Review fixes belong in each pass before committing;
any final-review fixes receive a separate verified corrective commit.

Record native visual checks separately: DOM tests cannot establish macOS traffic
light geometry, Windows caption controls or native focus/menu behavior. Do not
claim these checks passed unless actually run.

### Native acceptance checklist (not yet executed)

- On macOS and Windows, check the minimum 800×500 window in light/dark themes,
  sidebar expanded/collapsed, and maximized/fullscreen where supported. Verify
  caption controls remain clear and blank toolbar space still drags the window.
- Open each task dialog; verify initial focus, Tab containment, Escape, Enter,
  busy dismissal protection and focus return after closing.
- Cancel each native folder picker. Open a valid existing folder, create a test
  location, and choose a recent folder that has since been moved/deleted.
- Invoke row menus by mouse, keyboard and ellipsis, including bottom/right-edge
  rows. Check menu placement, action parity, row selection and focus restoration.
- In a packaged app, verify Cmd/Ctrl+O, R and F execute once without reloading the
  renderer. Check they do not escape a modal, hijack typing or fire on key repeat.
- Import/sync using disposable fixtures; switch views/locations during delayed
  work. Check path/activity remain coherent and errors remain discoverable.
- Toggle diagnostics, hide/restore the window, then disable them. Check status
  legibility with long paths and confirm normal navigation remains responsive.

## Progress

- Pass 1 implemented and cold-reviewed by a fresh Astra: no actionable findings.
  Independent verification: 277 tests passing, typecheck/lint and diff checks pass.
  Native geometry/focus checks remain outstanding.
- Pass 2 implemented and cold-reviewed by a fresh Astra. Fixed its visible
  actions-button accessibility finding and a stale-menu target edge case; Astra
  verified those fixes. Independent full suite: 288 tests passing. Typecheck,
  lint and diff checks pass. Native accelerator behavior remains on the checklist.
