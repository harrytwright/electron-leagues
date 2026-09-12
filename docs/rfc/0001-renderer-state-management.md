# RFC 0001: Renderer state management and TanStack dependencies

| Field    | Value                                                                                                                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status   | Ready for review                                                                                                                                                                                     |
| Author   | Harry Wright (drafted with Claude)                                                                                                                                                                   |
| Drafted  | 2026-09-08                                                                                                                                                                                           |
| Revised  | 2026-09-12, after three review passes over the code                                                                                                                                                  |
| Baseline | `claude/sidebar-treeview-redesign-8thsrj` at `6741de6`                                                                                                                                               |
| Scope    | The state migration is renderer-only and changes no IPC contract or on-disk format. The cleanup catalogue below also names main-process duplication, which is separate work and separately optional. |

## Summary

Adopt **TanStack Query** as the cache for everything the renderer reads over IPC, and **Zustand**
for the small amount of cross-cutting UI state that has to be shared between panes or survive a
remount. Add **TanStack Table** and **TanStack Form** only when the members database lands, since
that is the first feature with a real data grid and a multi-step form. Do not adopt TanStack
Router, TanStack DB, TanStack Virtual or a query persister.

The desktop polish plan that governed the preceding UI passes set a "no new dependencies"
boundary for them. That plan was removed from the repository in `0fa7118` as orchestration
rather than product documentation, and survives in git history; its boundary is quoted here
because this RFC is the deliberate place to lift it, with the reasons written down.

Because #3 stacks the dependency PR on top of the UI work, this document also lists the
non-state additions that PR should carry: one runtime package (`react-error-boundary`) and one
lint ratchet (`@vitest/eslint-plugin`), plus a set of in-house cleanups that are cheaper than
any package. Three further tooling packages were proposed in an earlier draft and cut on
evidence; their verdicts are kept below so the question is not reopened from intuition.

## Motivation

The renderer has grown a consistent pattern, hand-written three times, for "read something from
main, keep it fresh, and don't let a slow response overwrite a newer one":

| Reader                      | Race guard                         | Refresh trigger                  |
| --------------------------- | ---------------------------------- | -------------------------------- |
| `App.tsx` (`scan`)          | `scanGeneration` ref               | Own `onTreeChanged` subscription |
| `hooks/use-dir-listing.ts`  | `generation` ref                   | Own `onTreeChanged` subscription |
| `hooks/use-tree-folders.ts` | `requests` map of per-path tickets | Own `onTreeChanged` subscription |

Each is correct and each is tested, but the cost shows up in the code around them:

- **Invalidation is manual and duplicated.** After a mutation, `LeagueView` calls
  `listing.reload()` _and_ `await onChanged()`, which re-scans the whole tree; the file watcher
  then fires `tree:changed` and every subscriber fetches again. Three subscribers today become
  four with the members snapshot (its design says it is "re-requested on `tree:changed`").
- **Refresh callbacks are drilled.** `refresh` travels `App → LeagueView → NewSeasonDialog`,
  `App → HomeView → NewLeagueDialog`, and `Toolbar → LocationSwitcher` as `onChanged` props, purely
  so a leaf can ask the root to re-fetch. The application menu adds two more entry points: the
  `refresh` command reaches each pane's `onRefresh` through `FileBrowserFrame`, and `App`
  registers the `open-location` / `new-location` commands, whose `onChanged` is again `refresh`.
- **Race guards have multiplied, but only some are cached reads.** Nine ticket or generation
  counters now exist: in `App`, `use-dir-listing`, `use-tree-folders`, `use-import-files`,
  `LocationSwitcher`, `FirstRun` and all three dialogs. Four guard reads from main and are
  Query's job. The other five guard imperative user actions against unmount and stay.
- **Navigation state is reported upward for one consumer.** `LeagueView` and `HomeView` call
  `onCurrentDirChange` so that `App` can hold `leagueNavigation` / `homeNavigation` with
  owner-path guards, all so `StatusBar` can print the current folder.
- **Caches die with their owner.** Since `5ab115e` the browser panes stay mounted across folder
  changes and `LeagueView` owns the `useTreeFolders` cache and tree sort, so they survive
  navigation inside a league. They are still lost when you switch leagues, because `LeagueView`
  is keyed on the league path, and re-fetched when you come back.
- **UI memory is a bespoke store.** `lib/local-store.ts` hand-rolls per-location localStorage
  reads with zod guards; `App` tracks `restoredRoot` in a ref to know when to re-hydrate.
- **Feedback plumbing is hand-rolled too.** `OperationFeedbackProvider` keeps a pending map and
  each async flow calls `begin` / `finish` itself.

Main has the same shape at a larger scale: its hand-rolled error channel is used roughly 56
times against 33 rejection handlers, and a review pass over it found duplication worth its own
row below, plus defects that are being raised separately from this RFC.

None of this is wrong. It is the point at which a library that does exactly this job, well
tested, pays for itself, and the members database is about to add a fourth copy of the pattern
plus a data grid and an import wizard.

## Goals

1. One subscription to `tree:changed`; one place where "the disk changed" becomes "refetch".
2. No hand-written generation counters in the hooks that read from main. The guards around
   imperative submissions remain; they are not a caching concern.
3. Mutations invalidate by key instead of by drilled callback.
4. Cross-pane state (selection, current folder, collapsed days) is readable by selector and
   persisted per location without a custom localStorage layer.
5. Every behaviour the existing specs pin down keeps passing, with `installMockApi` and
   `emitTreeChanged` unchanged as the test seam.
6. The state migration itself touches nothing in `src/main`, `src/preload` or `src/shared`.
   The optional cleanups catalogued later do touch main, and are scoped and sequenced
   separately so this guarantee holds for phases 0 to 5.

## Non-goals

- Replacing view-local `useState` for filter text, crumbs, row selection or dialog open flags.
  That state is deliberately reset when the folder changes, either by `key` or by the guarded
  keyed-state pattern `useFileSelection(currentDir, …)` now uses, and should stay local. The tree
  sort that `LeagueView` lifted in `5ab115e` is owner state, not app state, and stays where it is.
- Turning the one-shot focus request (`pendingFocusDir` and `consumeFocusRequest`) into store
  state. It is an imperative signal consumed once by the next mount, and a ref is the right tool.
  The ref is right; its placement is not, and the cleanup table below folds the three copies into
  `useCrumbs`, which already owns the base directory they each re-derive.
- Moving UI memory into `electron-store` in main. Worth a separate discussion (see open
  questions); this RFC keeps it in the renderer.
- Rewriting `DirectoryBrowser` / `TreeFileBrowser` onto TanStack Table. Possible later; not
  required by anything here. That is not the same as leaving them alone: they share roughly a
  hundred duplicated lines today, and the cleanup table treats that as its own work.

## Proposal

### Dependencies

All packages go in `devDependencies`, following the Kumo migration rule (electron-vite bundles
the renderer; ESM-only packages break as externalised CJS requires). Versions are the latest
published on the date of this RFC and are pinned with a caret.

**Adopt now**

| Package                          | Version  | Role                                                                                                                                                                                                                                                                             |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-query`          | ^5.102.8 | Cache and lifecycle for every IPC read; mutations with keyed invalidation                                                                                                                                                                                                        |
| `@tanstack/react-query-devtools` | ^5.102.8 | Dev-only inspector, rendered behind `import.meta.env.DEV`                                                                                                                                                                                                                        |
| `@tanstack/eslint-plugin-query`  | ^5.102.8 | `exhaustive-deps` for query keys, which is the one footgun that makes newly adopted Query serve stale data. Kept where the general-purpose lint plugins were cut, because it guards what this RFC introduces rather than code that already exists, and CI on `main` enforces it. |
| `zustand`                        | ^5.0.15  | One `workspace` store for cross-pane UI state, with the `persist` middleware                                                                                                                                                                                                     |

**Adopt with the members database**

| Package                 | Version | Role                                                                                         |
| ----------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `@tanstack/react-table` | ^9.2.4  | Register and roster grids: sorting, text filter, column visibility                           |
| `@tanstack/react-form`  | ^1.33.5 | Import column-mapping wizard and member edit forms, validated with the zod already installed |

**Not adopted, and why**

| Package                                  | Reason                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-router`                 | Single-window app with no URLs. `Selection` is already a typed, per-location persisted value; a router would add URL semantics with nothing to attach them to. |
| `@tanstack/react-db`                     | Built for sync engines and live collections. The members snapshot is one JSON document over IPC; in-memory joins from it are a few `Map`s.                     |
| `@tanstack/react-virtual`                | No list is long enough yet. Adopt when a folder or the register measurably janks; it is a drop-in around a table body and needs no other change.               |
| `@tanstack/query-sync-storage-persister` | Persisting the IPC cache would show yesterday's disk state on launch. The scan is fast and the folder is the source of truth.                                  |
| `@tanstack/react-pacer`                  | Debouncing one filter input does not need a package.                                                                                                           |
| `@tanstack/react-store`                  | See alternatives. It is a 0.x internal of Form and Router with no persist middleware.                                                                          |

Approximate cost in the production renderer bundle: Query about 13 kB min+gz, Zustand about
1 kB. Devtools and the lint plugins never ship. Kumo already pulls in `use-sync-external-store`,
which both libraries build on.

**The canonical install list.** Packages are named across three sections of this document for
different reasons. This is the whole set the dependency PR adds, and nothing else:

```
npm i -D @tanstack/react-query@^5.102.8 \
         @tanstack/react-query-devtools@^5.102.8 \
         @tanstack/eslint-plugin-query@^5.102.8 \
         zustand@^5.0.15 \
         react-error-boundary@^6.1.5 \
         @vitest/eslint-plugin@^1.6.27
```

Six packages. `@tanstack/react-table` and `@tanstack/react-form` are deliberately absent and
arrive with the members database. `devDependencies` is correct for all six despite four of them
shipping in the bundle: electron-vite bundles the renderer, and this repository puts runtime
renderer packages there on purpose. Do not "fix" that.

### TanStack Query: the IPC cache

**Client configuration** (`src/renderer/src/lib/query-client.ts`):

```ts
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Chromium reports navigator.onLine = false with no network interface up.
        // This app reads a local disk and must work offline; never pause on that.
        networkMode: 'always',
        // IPC errors are real filesystem errors, not transient network ones.
        retry: false,
        // The file watcher tells us when data is stale; do not guess from focus.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
      },
      mutations: { networkMode: 'always', retry: false }
    }
  })
}
```

`networkMode: 'always'` is the one setting that is not optional. Query's default pauses fetches
while the browser reports offline, and a laptop with Wi-Fi off would otherwise never scan.

**Query definitions** live in `src/renderer/src/queries/`, one file per IPC domain, using
`queryOptions()` so keys and types are declared once:

```ts
// queries/tree.ts
export const treeQuery = queryOptions({
  queryKey: ['tree'],
  queryFn: () => window.api.scan() // LeaguesTree | null; null means "no root chosen"
})

// queries/dir.ts
export const dirListingQuery = (path: string) =>
  queryOptions({ queryKey: ['dir', path], queryFn: () => window.api.listDir(path) })

// queries/recents.ts, later queries/members.ts
```

Keys that are not path-addressed (the future `['members']`) include the root, so switching
location can never serve the previous location's data.

**One invalidation point.** `App` (or the bootstrap in `main.tsx`) owns the only
`onTreeChanged` subscription:

```ts
useEffect(() => window.api.onTreeChanged(() => void queryClient.invalidateQueries()), [])
```

Everything the renderer caches is derived from the folder tree, so a blanket invalidation is
correct. Query refetches active queries immediately and marks inactive ones stale, so a collapsed
tree branch is refetched on re-expand rather than eagerly. That is cheaper than today's
`useTreeFolders.reload()`, which refetches every folder ever opened, and the user cannot tell the
difference.

**What replaces what**

| Today                                                    | With Query                                                                                                                                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase` state machine in `App`                           | Derived: `isPending` → loading, `isError` → error, `data === null` → no-root, else ready                                                                                                                        |
| `scanGeneration`, `generation`, `requests` race guards   | Query deduplicates in-flight fetches per key and drops results for a key no longer observed. `use-dir-listing.spec.ts`'s "slow earlier folder" case is a Query invariant. Applies to the four read guards only. |
| "Keep old rows during re-list, never across folders"     | Query's default: same key refetch keeps `data` with `isFetching`; a new key starts with no data. No `placeholderData` needed.                                                                                   |
| `useDirListing(dir)`                                     | Same signature, implemented as `useQuery({ ...dirListingQuery(dir), enabled: dir !== null })`. Components do not change in that phase.                                                                          |
| `useTreeFolders().branches`                              | `useQueries` over the expanded paths; `branches` becomes a derived `Map`. `LeagueView` still owns the hook and passes the same `TreeFolders` shape down, so `TreeFileBrowser` is untouched.                     |
| `refresh` app command → `onRefresh` → `listing.reload()` | `queryClient.invalidateQueries()`, the same call the watcher makes. A pane-scoped variant (`['dir', currentDir]`) is available if a full refresh ever proves too broad.                                         |
| `onChanged` / `refresh` props                            | `useMutation` with `onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tree'] })`. `await`ing the invalidation preserves today's "dialog closes after the new season is visible" timing.              |
| `begin` / `finish` calls in each flow                    | A `MutationCache` with `onMutate` / `onSuccess` / `onError` reading `mutation.meta.label`, feeding the existing `OperationFeedbackContext`.                                                                     |
| `forgetAndRestart`                                       | `queryClient.setQueryData(treeQuery.queryKey, null)` plus `removeQueries` for `['dir']`.                                                                                                                        |

Structural sharing is a quiet win: `LeaguesTree` is plain JSON from IPC, so an unchanged league
keeps its object identity across scans and memoised children stop re-rendering on every
watcher tick.

### Zustand: the workspace store

The state that genuinely spans panes is small: the chosen location, the selection, the folder
being viewed (for the status bar) and the collapsed sidebar days. Today it lives in `App` and is
either drilled down or reported up. The diagnostics preference is deliberately excluded: it is
already an external store read through `useSyncExternalStore` in `use-diagnostics-preference.ts`,
with its own change event and a mirror into main. Moving it would be a lateral rewrite.

```ts
interface WorkspaceState {
  root: string | null
  selection: Selection
  currentDir: string | null
  collapsedDays: ReadonlySet<Weekday>
  setRoot: (root: string | null) => void // hydrates selection and collapsedDays for that root
  select: (next: Selection) => void
  setCurrentDir: (dir: string) => void
  toggleDay: (day: Weekday) => void
}
```

- **Persistence** uses the `persist` middleware with `partialize` so only
  `{ locations: Record<root, { selection, collapsedDays }> }` is written, under one
  versioned key. A custom `merge` validates the stored shape with the zod schemas that already
  exist in `lib/selection.ts` and `lib/local-store.ts`, keeping today's guarantee that corrupt or
  missing storage can never break the app. `lib/local-store.ts` then goes away.
- **Restoration becomes derivation.** Instead of `restoreSelection` writing `HOME` into state
  when a league is missing from one scan, the render reads `findLeague(tree, selection) ?? HOME`.
  The stored selection survives a sync-lag scan, and the league re-selects itself when it
  reappears. This is a bug fix, not merely a behaviour change. Today the recovery never happens:
  a scan that transiently loses a league writes `HOME` into state, and because the stored value
  is only written when the user selects, every later scan re-derives from `HOME` and the league
  stays deselected even once it returns. The comment in `App.tsx` describes an intent the code
  does not currently deliver.
- **Selectors, not props.** `StatusBar` reads `currentDir` directly; `Sidebar` reads
  `collapsedDays`; `Toolbar` reads `selection.kind`. `App` stops holding `leagueNavigation` and
  `homeNavigation` and their owner guards.
- **Testability under the anti-slop rules.** `.oxlintrc.json` forbids module mocking, so a
  module-level singleton store would be awkward to isolate. The store is built by a
  `createWorkspaceStore({ storage })` factory and provided through a small context; `useWorkspace(selector)`
  reads it. `TestProviders` creates a fresh store with an in-memory storage per test. Production
  creates one in `main.tsx` backed by `localStorage`.

Rule of thumb for what goes in the store: only state that two components without a shared
parent both need, or that must survive a remount or a restart. Everything else stays `useState`.

### Sidebar tree view

This branch is the sidebar tree-view redesign. The expanded set and branch cache already moved
one level up, from `TreeFileBrowser` to `LeagueView`, in `5ab115e`. If the sidebar and the
season browser end up showing the same expanded folders, the next step is one more level: the
`expanded` set moves into the workspace store and both read it, while the branch data itself is
already shared through the Query cache. If they stay independent, it stays in `LeagueView`. The
RFC does not decide that; it only makes either choice cheap.

### TanStack Table and Form, when members lands

The members design describes a register (name, email, phone, number, status), per-season rosters
grouped by team, a text filter over names and contact details, and an import dialog whose
preview shows the first rows under a user-adjustable column mapping.

- **Table** gives sorting, global filter and column visibility over the in-memory snapshot
  without a second hand-rolled sort/filter implementation beside the two file browsers. The
  `Table` primitives from Kumo remain the rendering layer; TanStack Table is headless.
- **Form** handles the mapping wizard (one select per canonical column, cross-field validation
  that a column is not mapped twice, a preview that reacts to every change) and member edits.
  It validates through Standard Schema, so the zod schemas the main process already uses for
  `players.csv` rows are reused as-is. The existing two-field dialogs (`NewLeagueDialog`,
  `NewSeasonDialog`) are not worth migrating and stay as they are.

Both are added in the members PR, not before, so this RFC's own PR stays a docs change and the
first code PR stays about Query.

## Beyond state: other dependencies and cleanups

This RFC is the single list of what the dependency PR installs once the UI work in #3 is done,
so the rest of the survey belongs here too. The bar is the same: a package earns its place only
where the codebase already repeats something by hand. Most of what repeats is cheaper to fix
with a small in-house hook than with a dependency, and those cleanups are listed so they are not
mistaken for missing packages.

### Runtime

| Package                | Version | Why                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-error-boundary` | ^6.1.5  | The renderer has no error boundary. A render-time throw anywhere below `App` blanks the window with nothing to click. One boundary around `AppContent` with a "Reload" fallback, and one around each `main` pane so a broken browser leaves the sidebar usable. `@sentry/electron/renderer` does not ship a boundary of its own; the boundary's `onError` forwards to Sentry. |

### Tooling

A review pass measured each proposed package against the code rather than against intuition,
and **only one of the five survived as an adopt-now**: three were cut outright and one
deferred. They are kept here with their verdicts because the
reasoning matters more than the list. One correction to that pass: it reported that the project
has no CI, which is true of this branch but not of the project. `main` carries workflows running
lint, typecheck and the suite across an OS matrix on every pull request, and this branch predates
them. The gate exists, so each verdict below rests on what the rule would actually catch here.

| Package                               | Verdict                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint-plugin-jsx-a11y`              | **Cut**                          | The renderer is almost entirely Kumo components, which the plugin does not inspect without a hand-maintained component map. The accessible-name, tab-order and popup-naming fixes cited as justification are `aria-labelledby`, `aria-controls`, `aria-level` and `role="status"`, and no rule covers any of them. What it would report is four deliberate modal `autoFocus` sites and one false positive. Instead, enable oxlint's built-in jsx-a11y rules, which are off only by omission and cost nothing.                                                                                                                                                    |
| `eslint-plugin-testing-library`       | **Cut**                          | The headline justification was enforcing `findBy` over `waitFor` plus `getBy`. There are 51 `waitFor` sites and every one wraps an assertion, so that rule fires zero times; the suite already uses `findBy` correctly throughout. Across every other rule the yield is nine flags, all deliberate, chiefly fake-timer and synchronous double-activation tests that `userEvent` cannot express. Nine flags, nine suppressions.                                                                                                                                                                                                                                   |
| `@vitest/eslint-plugin`               | **Adopt**, with expectations set | All four cited justifications return zero today: no focused tests, no missing `await` on a settled assertion, no duplicate titles within a scope, no test without an assertion. So it finds nothing now. It is still worth taking, because it is a cheap ratchet against the one class that silently guts a suite, a committed `.only`, and CI on `main` actually enforces it. Adopt it for what it prevents, not for what it would find.                                                                                                                                                                                                                        |
| `knip`                                | **Cut** for now                  | Hand-running its three analyses found no unused files, one unused dependency, and roughly four genuinely unused exports among thirty-three reports. The two rewrites left no residue. Its promised confirmation about `echarts` was wrong: `echarts` is an **optional** peer of Kumo, so nothing would ever report it. The original objection was that it had nothing to gate; with CI on `main` that is wrong, so the honest reason is simply that the yield is too small to be worth the configuration. Do not run it in production mode here, which would flag every runtime dependency as misplaced under this repository's deliberate devDependencies rule. |
| `@ianvs/prettier-plugin-sort-imports` | **Defer** until the stack merges | The disorder is real and one file interleaves four groups. The cost is the problem: the one-off diff touches 86 files and 573 import lines while a 98-file stacked PR is in flight, which turns clean merges into conflicts that cannot be resolved by reading, since every hunk looks alike. Land it alone as the first commit after the stack, recorded in `.git-blame-ignore-revs`.                                                                                                                                                                                                                                                                           |

**What the review found instead, in descending order of value.** These are worth more than the
cut packages combined.

1. **The anti-slop plugin enforces fifteen error-level rules and is itself unguarded.** Its
   twenty-one TypeScript files are excluded from ESLint, from oxlint, from Prettier and from
   both tsconfigs, and have no tests. Nothing type-checks the code that gates every other file,
   and its own style has already drifted from the repository's. Adding a tools tsconfig and rule
   fixtures protects an existing investment for less work than any package migration here.
2. **The test harness needs widening before phase 1, not after.** `TestProviders` exposes only a
   component renderer, so five spec files re-nest the provider tree by hand at roughly twenty
   sites. Phase 1 adds `QueryClientProvider` to that tree, and those sites would not pick it up.
   Adding a hook renderer and an optional location key to the shared helper is a prerequisite of
   this RFC rather than an optional cleanup.
3. **Vitest config hygiene.** The renderer project sets no `restoreMocks`, `unstubEnvs` or
   `unstubGlobals`, so two spec files re-implement that cleanup by hand and one leaks a spy when
   it fails early. Three config lines remove all of it.

One package does survive unchanged, and it is the runtime one: `react-error-boundary`. A
separate pass confirmed the renderer has no boundary, no `componentDidCatch` and no global
handler, so a render-time throw below `App` blanks the window.

Unrelated to any of the above, the review found a real accessibility defect that no linter here
would have caught: the renderer's HTML document has no `lang` attribute.

### Cleanups that need no dependency

These are the repeated patterns the survey found. Each is a hook or helper of well under fifty
lines, and pulling a library in for any of them would cost more surface than it saves.

| Pattern                                                                                                                                                                          | Where                                                                                                                                                                                                                                                                                                                          | Cleanup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task-dialog lifecycle: reset every field on open, bump a `submission` ticket, `busy` flag, `error` string, refocus the field on failure, refuse close while busy                 | `NewLeagueDialog` and `NewSeasonDialog`                                                                                                                                                                                                                                                                                        | One `useDialogTask({ open, onOpenChange, run })` returning `{ busy, error, submit, handleOpenChange }`. Scoped to these two on purpose: `DeleteResourceDialog` looks like a third copy but also carries a `moved` flag and promotes a pending error toast on teardown, so forcing it through the hook would need an escape hatch. Two of the repository's four `set-state-in-effect` lint disables go with it.                                                                                         |
| `${n} item${n === 1 ? '' : 's'}`                                                                                                                                                 | 9 occurrences on 8 lines in `LeagueView`, `DirectoryBrowser`, `TreeFileBrowser` and `use-import-files`, over the nouns item, folder, file and template, plus two hard-coded "N of M" plurals beside them                                                                                                                       | `plural(n, noun)` in `lib/plural.ts` over `Intl.PluralRules`. The sign-in sheet work will want the same helper for bowlers and teams.                                                                                                                                                                                                                                                                                                                                                                  |
| `try { await window.api.x() } catch (caught) { add({ title: ipcErrorMessage(caught), variant: 'error' }) }`                                                                      | 8 sites in 5 files, of which only 4 are mutations                                                                                                                                                                                                                                                                              | Partly covered by the `MutationCache` in phase 4. Counted honestly: the wider population is 19 `ipcErrorMessage` call sites across 12 files, but 11 of those feed inline dialog error state rather than a toast and are untouched by any cache. See the write-orchestration row and the risk on refresh failure.                                                                                                                                                                                       |
| IPC channel shapes declared four times over: a zod schema, the `handle` signature, the preload method, and the renderer mock                                                     | 7 of 10 input-taking channels now parse at the boundary through two separate parser modules, which disagree with each other: the sync parser validates the season name and the create parser leaves that to the operation. `dir:list`, `folder:trash` and `root:choose` still take a trusted typed parameter                   | Declare each channel once in `src/shared/ipc.ts` as channel, input schema and output type, using the zod already installed. Main parses from the table, preload derives its method types from it, and the mock iterates it so a new channel cannot be missed. Note the premise has improved since this RFC was drafted: input is no longer merely trusted. The duplication argument is now stronger rather than weaker, because validation added a fourth declaration site and a second parser module. |
| Platform branching on `currentPlatform()`                                                                                                                                        | `reveal-label.ts` and `trash-label.ts` switch; `app-shortcut-label.ts` instead tests for darwin twice across two exported functions                                                                                                                                                                                            | One `lib/os-labels.ts` with a `Record<Platform, …>`. The spec `os-labels.spec.ts` already imports all three and drives them from a single platform table, so the tests are ahead of the source.                                                                                                                                                                                                                                                                                                        |
| `DirectoryBrowser` and `TreeFileBrowser` are the same component differing only in how a row exposes its path and name                                                            | Roughly 110 lines: the keyed filter state, the id and ref preamble, the focus-request effect, the context-menu opener and the actions-menu block are byte-identical, comments included                                                                                                                                         | Give the tree's row type flat `path` and `name` accessors, then extract `useBrowserGrid({ currentDir, paths })` plus a `BrowserState` component for the error, loading, no-matches and empty ladder. This is the largest single duplication in the renderer and is independent of Query, so it should land first.                                                                                                                                                                                      |
| One-shot focus request: a `pendingFocusDir` ref, a `consumeFocusRequest` callback and `enter` / `enterMany` / `jumpTo` wrappers                                                  | Three copies in `LeagueView`, `FolderPane` and `OtherPane`, identical except for the base-directory identifier                                                                                                                                                                                                                 | Move the ref into `useCrumbs`, which already takes `baseDir`, and let the navigation methods take the focus flag. Removes the prop from both browser interfaces.                                                                                                                                                                                                                                                                                                                                       |
| "Reset this state when its owner key changes"                                                                                                                                    | Six different spellings: a state object holding the directory in `use-file-selection` and in both browsers, a derived re-base in `use-crumbs`, a mirrored location in `OperationFeedbackProvider`, a scope ref in `use-tree-folders`, a membership test in `use-row-actions-menu`                                              | A six-line `useKeyedState(key, initial)` fits the first four. The last two keep their bespoke logic. Worth doing because reviewers have now re-derived this idiom six times.                                                                                                                                                                                                                                                                                                                           |
| Write orchestration: guard a busy flag, `begin` the feedback, await the write, reload the listing, await the refresh, qualify the message if the refresh failed, toast, `finish` | Four copies in `LeagueView.zip`, `LeagueView.syncTemplates`, `use-import-files` and `DeleteResourceDialog`, with the refresh-failure sentence duplicated four times                                                                                                                                                            | One `useWriteOperation({ label, run, onChanged, successMessage, noun })`. This is also the reason the `MutationCache` cannot own all feedback; see the risks.                                                                                                                                                                                                                                                                                                                                          |
| Recent locations: a ticket-guarded fetch and a two-line row of basename over full path                                                                                           | Two copies in `FirstRun` and `LocationSwitcher`, byte-identical JSX but with different and undocumented failure policies, one showing an inline error and one silently swallowing                                                                                                                                              | A `LocationRow` component and one `useRecentRoots()` hook, which is also the natural seam for the phase 3 recents query. Converging them forces one deliberate failure policy.                                                                                                                                                                                                                                                                                                                         |
| Main-process helpers reimplemented rather than shared                                                                                                                            | The "is this path inside that one" predicate is written four times, "is this a single path segment" three times, reading a filesystem error code three times each with its own lint suppression, the archive folder path computed at five sites of which one validates it, and the `meta.json` serialise-and-write three times | One exported predicate, one segment check, one error-code reader, and a `writeLeagueMeta` helper. The archive-path duplication is not cosmetic: the site that validates is the zip path, and the site that moves a season during archiving does not, which is how one of the separately raised defects arises.                                                                                                                                                                                         |
| Interval plus `visibilitychange` polling, `matchMedia` listener, document-level `dragover`/`drop` refusal                                                                        | `use-renderer-metrics.ts`, `theme.ts`, `App.tsx`                                                                                                                                                                                                                                                                               | Three effects, each different enough that a generic `useEventListener` would save a dozen lines in total. Leave them.                                                                                                                                                                                                                                                                                                                                                                                  |

### Considered and not proposed

| Package                                        | Reason                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usehooks-ts`, `@react-hookz/web`, `react-use` | The candidate call sites are the three effects above plus localStorage, which the Zustand `persist` middleware already replaces. A hooks grab-bag would be imported in four places and shadow the project's own `hooks/` folder for everything else.                                    |
| `es-toolkit`, `remeda`, `lodash-es`            | The renderer's collection code is `Map` and `Set` copies, one `filter`, one `sort` with a comparator. Nothing here is a `groupBy` or `debounce` that a utility library would shorten. The members snapshot joins are a few `Map`s and are better read as plain code than as a pipeline. |
| `ts-pattern`                                   | Exhaustive `switch` on `Selection['kind']`, `SeasonNode['status']` and `Platform` already type-checks through the return type. A pattern library adds a runtime for what the compiler already gives.                                                                                    |
| `date-fns`, `dayjs`                            | One `Intl.DateTimeFormat` in `format-date.ts`. The sign-in sheet's week numbering may want more; decide then.                                                                                                                                                                           |
| `pathe`, `path-browserify`                     | `pathBasename` is one regex split because the renderer cannot import `node:path`. A path library would be adopted for one function.                                                                                                                                                     |
| `async-mutex`, `p-limit`, `p-queue`            | `withTemplateLock` in `operations.ts` is an eighteen-line per-root promise chain with its own concurrency spec. A queue package would replace tested code with configuration.                                                                                                           |
| `@sentry/react`                                | Only needed for Sentry's own error boundary; `react-error-boundary` plus `Sentry.captureException` in `onError` is smaller and keeps `@sentry/electron/renderer` as the single Sentry entry point.                                                                                      |
| `@vitest/coverage-v8`                          | Coverage is not part of the review gates today. If it becomes one, add it at the same major as `vitest` (currently 4); the published 5.x line does not match.                                                                                                                           |
| `typescript-eslint` strict configs             | Not a new package: `@electron-toolkit/eslint-config-ts` already carries `typescript-eslint`. Switching from `recommended` to `strictTypeChecked` is a config change worth trying in its own PR, since the anti-slop rules already push in that direction.                               |

## Alternatives considered

**Keep the hand-rolled pattern.** Cheapest today. The members snapshot would be the fourth copy,
and every future IPC read (sign-in sheet history, POS exports) the fifth and sixth. The
per-component caches and drilled `onChanged` callbacks do not improve with repetition.

**SWR or RTK Query instead of TanStack Query.** SWR is smaller but has weaker mutation and
invalidation primitives and no devtools. RTK Query drags in Redux Toolkit and a store the app
does not otherwise want. Query's `queryOptions`, `useQueries` and `MutationCache` map directly
onto the three things this codebase needs.

**Jotai instead of Zustand.** Atoms suit fine-grained derived state; the workspace state here is
one small record that changes a few times a minute. Zustand's `persist` middleware and
selector API cover the whole need in one file, and its vanilla store is trivial to inject for
tests.

**`@tanstack/react-store` instead of Zustand.** Keeps everything in one family, but it is 0.x,
has no persistence middleware, and its React binding is the internal used by Form and Router
rather than an application store with a settled API.

**React context plus `useReducer`, no library.** Feasible for the workspace state alone, but it
re-creates the persist layer and gives every consumer the whole context value, so `StatusBar`
re-renders on every selection change. Zustand costs about 1 kB and removes both problems.

## Migration plan

Each phase is one PR that keeps `npm test`, `npm run typecheck` and `npm run lint` green and can
be reverted alone. CI on `main` runs all three across an OS matrix, so a phase is not done until
it is green there. The hand-rolled hooks and Query can coexist mid-phase, because the extra
subscription is harmless.

**Phase 0 — widen the test harness.** Add a hook renderer and an optional location key to the
shared test helper so the provider tree has exactly one definition, then move the roughly twenty
hand-nested provider sites onto it. No production code changes.
_Done when:_ no spec file constructs a provider tree inline, except the provider's own spec.
_Why first:_ phase 1 adds a provider to that tree, and the hand-nested sites would not pick it up.

**Phase 1 — install.** Add the six packages from the canonical list, wire `QueryClientProvider`
in `main.tsx` and the shared test helper, mount the error boundaries, and enable both lint
plugins. No behaviour change beyond the boundaries.
_Done when:_ a test asserts the client is built with `networkMode: 'always'`, and the devtools
import is behind `import.meta.env.DEV` with the production bundle checked.

**Phase 2 — directory listings.** Reimplement `useDirListing` on `useQuery` behind its current
signature. Move the `onTreeChanged` subscription to the single invalidation point.
_Done when:_ the two existing cases in `use-dir-listing.spec.ts` pass against the new
implementation, rewritten to assert behaviour rather than generation-ref call counts.

**Phase 3 — tree and recents.** Move `scan` into `treeQuery` and derive `phase` from it. Move
`recentRoots` onto a query, which is also where the two divergent recents fetches converge.
Reimplement `useTreeFolders` as `useQueries` over the expanded set.
_Done when:_ the `TreeFolders` interface is byte-identical, so `TreeFileBrowser` is untouched;
and navigation still evicts abandoned branches, which needs an explicit `removeQueries` because
Query only marks them stale. The pruning spec is the acceptance test and must not be weakened.

**Phase 4 — mutations and feedback.** Convert the writes to `useMutation` with `meta.label` and
route `begin` / `finish` through a `MutationCache`. Point the `refresh` and location app-command
handlers at the query client. Remove the drilled `onChanged` props once no caller needs them.
_Decide before starting, not during:_ the four write flows that report "succeeded, but could not
be refreshed" either keep their own `try`/`catch` with only the feedback moving into the cache,
or adopt the `useWriteOperation` hook from the cleanup catalogue. A `MutationCache` alone cannot
express that outcome. See the risk below.
_Done when:_ location-scoped feedback still clears on a location switch while application-scoped
feedback survives, which an existing spec pins.

**Phase 5 — workspace store.** Introduce `createWorkspaceStore`, migrate the location, selection,
current folder and collapsed days, and delete `lib/local-store.ts` along with the navigation
state in `App`. The diagnostics preference stays where it is; it is already an external store.
_Done when:_ the roughly twenty raw-key storage assertions are ported to the store's `merge`
guards rather than deleted, and the PR description states plainly that restoration by derivation
is a bug fix, since today a league lost to one scan never re-selects itself.

**Phase 6 — members (later).** Table and Form arrive with that feature, not before.

### Sequencing the cleanups

The cleanups need no dependency and are independent of the phases, so they are ordered by what
they unblock rather than by size. The first two pay for themselves immediately:

1. `useBrowserGrid` and a `BrowserState` component for the two file browsers. The largest
   single duplication in the renderer, and it should land before Query touches those files.
2. `useCrumbs` absorbs the one-shot focus ref, deleting three copies and a prop from two
   interfaces.
3. `useDialogTask` for the two dialogs it fits, and `useWriteOperation`, which phase 4 may
   depend on.
4. `useKeyedState`, `plural` and `os-labels`. Small, safe, do them while passing.
5. The shared IPC table and the main-process helper consolidation. These touch main and are the
   only cleanups outside this RFC's renderer scope, so they belong in their own PR with their
   own review. The archive-path duplication among them is the root cause of a filed bug.

### What this plan does not promise

Test rewriting is real work in phases 2, 3 and 5, not an afterthought. `installMockApi` and
`emitTreeChanged` remain the seam, because the single subscriber still registers through
`window.api.onTreeChanged`, but the specs that assert generation-ref call counts, raw storage
keys or `restoreSelection` directly are rewritten rather than carried across. The risks section
names where that cost falls.

## Risks

- **Offline pause.** Covered by `networkMode: 'always'`; a test in phase 1 should assert the
  client is built with it.
- **A successful write whose refresh fails is a third outcome, and the cache cannot express
  it.** Four flows today report "zipped, but the league could not be refreshed", which means the
  write succeeded and the invalidation did not. A rejected `invalidateQueries` inside `onSuccess`
  does not reject the mutation, so it never reaches `MutationCache.onError` and the user would
  see a plain success. `DeleteResourceDialog` is the sharpest case: it must keep its `moved` flag
  so the delete is not retried, and promote the message to a toast if the dialog has closed.
  Either these four keep their own `try`/`catch` with only `begin` and `finish` moving into the
  cache, or they adopt the `useWriteOperation` hook instead. Decide this in phase 4, not during it.
- **Operation feedback is location-scoped and Query is not.** `OperationFeedbackProvider` drops
  pending location-scoped operations when the location changes while keeping application-scoped
  ones, and a spec pins that. A `MutationCache` feeding the same context has no notion of that
  scope, so an in-flight mutation would keep announcing across a location switch.
- **Tree pruning is deliberate, not an artifact of hand-rolling.** `use-tree-folders` deletes
  branches and pending tickets outside the current directory on navigation, so that filesystem
  events cannot keep polling abandoned paths. Query's equivalent marks them stale and leaves
  eviction to `gcTime`. Preserving today's behaviour needs an explicit `removeQueries` on
  navigation, which is hand-written code of roughly the size being deleted. Name it in phase 3
  so it is not found later as a regression.
- **The suite pins some of what these phases change, and that cost is concentrated.** Roughly
  twenty assertions across four spec files read or seed raw localStorage keys and their exact
  bodies, all of which the `persist` middleware's versioned envelope invalidates in phase 5.
  Three tests target `restoreSelection` directly, including one asserting the very fallback that
  derivation removes. Four tests in the directory-listing spec are about generation-ref
  semantics and become Query invariants, so they are rewritten rather than kept. The sharpest
  one is a tree-browser test asserting that navigating away clears the expanded set, which is
  the deliberate pruning named above: Query offers no equivalent, so that test goes red unless
  the pruning is reimplemented. Budget test rewriting into each phase rather than treating the
  suite as a fixed backstop.
- **Blanket invalidation cost.** Every `tree:changed` refetches every _active_ query. Today's
  code already refetches every subscriber on that event, so this is not a regression; the
  watcher's 500 ms debounce still applies. If a very large folder makes it noticeable, narrow
  to `['tree']` plus `['dir']` prefixes.
- **Cross-location cache.** Path-keyed queries are safe across roots; anything keyed without a
  path must include the root in its key (phase 3 review item).
- **Lazy branch refresh.** A collapsed cached branch now refreshes on re-expand rather than in
  the background. Rows shown while that refetch runs are the cached ones, as today.
- **Dev-only devtools.** Must be imported behind `import.meta.env.DEV` so nothing ships;
  phase 1 checks the production bundle.
- **Version drift.** TanStack Table 9 is a recent major; confirm its API against the docs at
  adoption time rather than from memory.

## Open questions

These are for the reviewer to settle. Everything else in this document is decided.

1. **Zustand, or Query only?** Defer the store and stop after phase 4 is a legitimate shape. The
   review strengthened the case for the store rather than weakening it: the current folder has
   two reporters and three layers of guarding, all to print one string in the status bar. But
   Query is the larger win and could ship alone.
2. **Should per-location UI memory live in `electron-store` in main** instead of persisting in
   the renderer, next to recent locations? The now-removed polish plan rejected a second renderer
   store for recents, and the same argument may apply. This changes phase 5's shape, so answer it
   before phase 5 rather than during.
3. **Do the four refresh-failure write flows keep their own error handling, or move to
   `useWriteOperation`?** Phase 4 cannot start without an answer. My recommendation is the hook,
   because it also deletes three other copies.
4. **Do the main-process cleanups belong to this RFC at all,** or to the issues already filed
   against those files? They are catalogued here because the survey found them, but they are
   outside the renderer scope this document otherwise keeps.

Answered by the review and no longer open: whether to ship the devtools (yes, they never reach
the bundle), and whether to migrate the browsers to TanStack Table (no, but they do need the
shared grid hook first).
