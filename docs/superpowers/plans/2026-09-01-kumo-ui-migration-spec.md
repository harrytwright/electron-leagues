# Kumo UI Migration — Spec

Agreed in grilling session 2026-08-31/2026-09-01 (Harry + Claude). This is the frozen design;
the implementation plan argues from this document.

## Goal

Full rewrite of the Electron renderer UI onto `@cloudflare/kumo` (Cloudflare's design system),
fixing all 20 findings from the web-interface-guidelines review in the process.

## Settled decisions

**Adoption**

- `@cloudflare/kumo` ^2.12.0 in **Tailwind v4 mode** (`tailwindcss` + `@tailwindcss/vite`,
  mandatory `@source` directive pointing at Kumo's dist, Kumo styles imported _before_
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

All 20 verified closed in the Task 8 sweep (2026-09-01):

| #   | Finding                                              | Closed by                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ No `color-scheme`/theme handling                  | `theme.ts` `data-mode` watcher (Kumo sets `color-scheme`), themed `BrowserWindow` background                                                                                                                                                              |
| 2   | ✅ FileList `<span onClick>` not keyboard-accessible | Real `<button>` rows with `focus-visible` outline (`FileList.tsx`), keyboard test                                                                                                                                                                         |
| 3   | ✅ 📁 emoji not `aria-hidden`                        | Phosphor `Folder`/`File` icons in `aria-hidden` wrappers                                                                                                                                                                                                  |
| 4   | ✅ Drag-drop only import path                        | "Add files…" button + `files:pick` IPC + `pickFiles()` preload                                                                                                                                                                                            |
| 5   | ✅ Import completes silently                         | Success/error toasts with honest copied counts (`aria-live` via Kumo Toast)                                                                                                                                                                               |
| 6   | ✅ Archive checkbox unlabeled / dead zones           | `ArchiveRow`: label wraps Checkbox + name, `useId`-based `aria-labelledby`                                                                                                                                                                                |
| 7   | ✅ Archive name `<span onClick>`                     | Label toggles; separate labelled reveal `Button`                                                                                                                                                                                                          |
| 8   | ✅ League modal dialog semantics/Escape/focus trap   | Kumo `Dialog` (`role=dialog`, Escape, trap) — `NewLeagueDialog.tsx`                                                                                                                                                                                       |
| 9   | ✅ Backdrop dismiss click-only                       | Kumo Dialog handles Escape + backdrop; both guarded while busy                                                                                                                                                                                            |
| 10  | ✅ No `<form>`/Enter submit (league)                 | Real `<form onSubmit>`, Enter test                                                                                                                                                                                                                        |
| 11  | ✅ League input `name`/`autocomplete`                | `name="league-name"` `autoComplete="off"`                                                                                                                                                                                                                 |
| 12  | ✅ Placeholder copy                                  | `"e.g. Men's Triples…"`                                                                                                                                                                                                                                   |
| 13  | ✅ League error a11y + focus                         | `role="alert"` + `aria-invalid`/`aria-describedby` + focus-on-error                                                                                                                                                                                       |
| 14  | ✅ Season modal same issues                          | `NewSeasonDialog.tsx`, same pattern                                                                                                                                                                                                                       |
| 15  | ✅ Season input `name`/`autocomplete`                | `name="season-name"` `autoComplete="off"`                                                                                                                                                                                                                 |
| 16  | ✅ Season error a11y                                 | Same alert + describedby pattern                                                                                                                                                                                                                          |
| 17  | ✅ Season fields in `<form>`                         | Real form, Enter test                                                                                                                                                                                                                                     |
| 18  | ✅ FirstRun busy state invisible                     | Per-button `loading` + "Opening…"/"Initialising…" labels                                                                                                                                                                                                  |
| 19  | ✅ Blanket `user-select: none`                       | Body rule removed with legacy CSS; `select-none` now only on app chrome (sidebar nav explicitly, Kumo controls via their own styles) — content panes are selectable                                                                                       |
| 20  | ✅ Hover/focus/overscroll gaps                       | Kumo buttons ship `hover:bg-kumo-tint` + `focus-visible:ring` (visible in the LeagueView snapshot); dialog scroll containment comes from Kumo/Base UI scroll lock (`overscroll-behavior` rules in Kumo's shipped CSS — not separately asserted by a test) |

Bonus (from cold review): failing `leagues:scan` no longer strands the loading spinner —
dedicated error phase with retry (`App.tsx`).

## Addendum — sidebar and file-browser redesign (2026-09-01, later)

Supersedes the **Sidebar** and **File list** bullets above.

- **Sidebar**: `Sidebar.Header` holds a location switcher (Kumo `DropdownMenu` styled as a
  select: current + recent leagues folders as radio items, "New location…", reveal). Then a
  "Home" `MenuButton` and one "Leagues" group whose days are `Sidebar.Collapsible` items with
  leagues as `MenuSub` buttons; empty days are hidden. Footer keeps only `Sidebar.Trigger`.
  League creation moved to Home. Collapsed days and the last selection are remembered per
  location in `localStorage` (`lib/local-store.ts`); recent locations live in `electron-store`.
- **Main pane**: S3/R2-style drill-down (not an inline tree). Kumo `Table` for every listing
  (`DirectoryTable`), Kumo `Breadcrumbs` routed through `LinkProvider` for in-app navigation
  (`CrumbTrail`), levels below the scan listed on demand via `dir:list`. A league's top level is
  synthetic from the scan (seasons with status badges, other files, an Archive folder row);
  everything deeper is the real directory. Row `…` menus: Open / reveal, plus Zip… on archived
  seasons and Delete… on seasons; the league header menu has Delete league….
- **Delete**: `folder:trash` moves league/season folders (and a league's `_archives` folder) to
  the OS trash, path-validated in main. The dialog mirrors Kumo's `DeleteResource` block
  (type the name to confirm) but with move-to-trash copy — the block's own copy claims
  permanent, irreversible deletion, which would be untrue here.
- Copy is platform-aware ("Show in Finder" / "Show in Explorer"; "Trash" / "Recycle Bin") from
  `window.electron.process.platform`.
