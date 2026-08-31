# Kumo UI Migration — Spec

Agreed in grilling session 2026-08-31/2026-09-01 (Harry + Claude). This is the frozen design;
the implementation plan argues from this document.

## Goal

Full rewrite of the Electron renderer UI onto `@cloudflare/kumo` (Cloudflare's design system),
fixing all 20 findings from the web-interface-guidelines review in the process.

## Settled decisions

**Adoption**
- `@cloudflare/kumo` ^2.12.0 in **Tailwind v4 mode** (`tailwindcss` + `@tailwindcss/vite`,
  mandatory `@source` directive pointing at Kumo's dist, Kumo styles imported *before*
  `@import "tailwindcss"`).
- `@phosphor-icons/react` (required peer) replaces all emoji icons. Decorative icons get
  `aria-hidden`; icon-only buttons get `aria-label`.
- `zod ^4` peer already satisfied. **Do not install `echarts`** (charts unused; peer warning is fine).
- Base UI primitives via `@cloudflare/kumo/primitives/*` fill any component gap. No other UI deps.
- All new packages go in **devDependencies** (electron-vite bundles; ESM-only deps break as
  externalized CJS requires).
- `prettier-plugin-tailwindcss` for deterministic class order.
- `main.css` ends near-empty: the three import lines plus only rules utilities cannot express.

**Design language**
- Cloudflare look wholesale via Kumo tokens (`--color-kumo-*`). No custom palette survives.
- The `kumo-design` skill rules govern: sentence-case headings, no `font-bold`
  (use `font-semibold`/`font-medium`), no color transitions on hover, no `tracking-*`,
  concentric radii, `ring ring-kumo-line` not border+shadow, icons aligned via `h-lh`,
  related text grouped tighter than surrounding content, dialogs always mounted (open prop).
- Where Kumo and the Vercel web-interface-guidelines conflict, **Kumo wins** (e.g. sentence
  case beats Title Case). Vercel guidelines remain the base layer where Kumo is silent.

**Structure**
- Full renderer rewrite: every component in `src/renderer/src/components/` plus `App.tsx`.
- **Sidebar**: Kumo Sidebar suite with collapse enabled; no resize handle.
- **Dialogs**: both modals become Kumo `Dialog` — always mounted, `open` prop, real `<form>`
  (Enter submits), state resets when `open` becomes true, inline validation errors with
  `aria-live` and focus-on-error. Escape/focus-trap/`role=dialog` come from Kumo.
- **File list**: stays a custom list (NOT Kumo Table). Rows use real `<button>`s, truncation,
  Phosphor icons. Future idea (not built now): three-pane `Sidebar | FileTree | Viewer`.
- **Import**: "Add files…" button (main-process `dialog.showOpenDialog` via new `files:pick`
  IPC + `pickFiles()` preload method) as the click/keyboard alternative to drag-drop.
  Drag-drop retained.
- **Toasts**: Kumo ToastProvider at app root; toasts for import results, zip results, and
  errors outside dialogs (fixes the aria-live findings; failed imports are silent today).
- **FirstRun**: rebuilt with Kumo; busy state shows a spinner/label change, not just disabled.

**Theming**
- System-only dark mode, no picker. Renderer `matchMedia('(prefers-color-scheme: dark)')`
  listener toggles `data-mode="dark"` on `<html>` (Kumo has no `prefers-color-scheme` CSS —
  attribute is mandatory). Themed `BrowserWindow` `backgroundColor` from `nativeTheme` to
  prevent launch flash.

**Testing**
- Vitest **projects** split: existing node suite (`src/{main,shared}/**/tests/*.spec.ts`)
  unchanged; new `renderer` project with jsdom + @testing-library/react +
  @testing-library/user-event + jest-dom, `window.api` mocked via a typed helper.
- Behavioral tests are primary: dialogs (open/validate/submit/reset-on-reopen/Enter),
  FileList (keyboard activation, add-files flow, drag-drop, empty states), sidebar selection,
  App phase transitions, theme attribute toggling.
- Snapshots sparingly, for grouped/composed renders only (LeagueView sections). Never a
  substitute for a behavioral assertion.

**Process**
- Execution is **codex-first**: Claude freezes each task as a work order; Codex implements;
  Claude verifies diff + tests.
- After each task's commit, a **cold Opus 5 reviewer** subagent validates using ONLY
  `git status` and `git diff` output — no plan context, no bias. Blockers are fixed before
  the next task.
- Work happens on branch `feat/kumo-ui` off `main`.
- Kumo's docs CLI is the API authority: `npx @cloudflare/kumo ls` / `npx @cloudflare/kumo doc
  <Component>`. Plan code sketches show required structure and behavior; exact prop names come
  from the registry.

## Review findings to close (all in scope)

| # | Finding | Where fixed |
|---|---------|-------------|
| 1 | No `color-scheme`/theme handling (index.html) | Theme task |
| 2 | FileList `<span onClick>` not keyboard-accessible | FileList task |
| 3 | 📁 emoji not `aria-hidden` | FileList task (Phosphor) |
| 4 | Drag-drop only import path | FileList task (Add files…) |
| 5 | Import completes silently (no aria-live) | FileList task (toast) |
| 6 | Archive checkbox unlabeled / dead zones | LeagueView task |
| 7 | Archive name `<span onClick>` | LeagueView task |
| 8 | NewLeagueModal missing dialog semantics/Escape/focus trap | Dialogs task |
| 9 | Backdrop dismiss click-only | Dialogs task (Kumo) |
| 10 | No `<form>`/Enter submit (league) | Dialogs task |
| 11 | League input lacks `name`/`autocomplete="off"` | Dialogs task |
| 12 | Placeholder `"e.g. Mens Triples"` → `"e.g. Men's Triples…"` | Dialogs task |
| 13 | League error needs aria-live + focus-on-error | Dialogs task |
| 14 | NewSeasonModal same dialog issues | Dialogs task |
| 15 | Season input lacks `name`/`autocomplete="off"` | Dialogs task |
| 16 | Season error needs aria-live | Dialogs task |
| 17 | Season fields not in `<form>` | Dialogs task |
| 18 | FirstRun busy state invisible | FirstRun/App task |
| 19 | Blanket `user-select: none` on body | Sweep task (scope to nav chrome) |
| 20 | No hover feedback on `.link`/`.primary`; no `:focus-visible`; modal `overscroll-behavior` | Kumo components; verified in sweep task |
