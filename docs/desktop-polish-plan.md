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

## Progress

- Pass 1 implemented and cold-reviewed by a fresh Astra: no actionable findings.
  Independent verification: 277 tests passing, typecheck/lint and diff checks pass.
  Native geometry/focus checks remain outstanding.
