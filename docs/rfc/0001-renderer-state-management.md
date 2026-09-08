# RFC 0001: Renderer state management and TanStack dependencies

| Field    | Value                                                                                |
| -------- | ------------------------------------------------------------------------------------ |
| Status   | Proposed                                                                             |
| Author   | Harry Wright (drafted with Claude)                                                   |
| Date     | 2026-09-08                                                                           |
| Baseline | `claude/sidebar-treeview-redesign-8thsrj` at `8523525` (326 tests passing)           |
| Scope    | Renderer only. Main-process code, IPC contracts and the on-disk model are unchanged. |

## Summary

Adopt **TanStack Query** as the cache for everything the renderer reads over IPC, and **Zustand**
for the small amount of cross-cutting UI state that has to be shared between panes or survive a
remount. Add **TanStack Table** and **TanStack Form** only when the members database lands, since
that is the first feature with a real data grid and a multi-step form. Do not adopt TanStack
Router, TanStack DB, TanStack Virtual or a query persister.

The desktop polish plan set a "no new dependencies" boundary for its own passes. This RFC is the
deliberate place to lift that boundary, with the reasons written down.

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
  `refresh` command reaches each pane's `onRefresh` through `FileBrowserFrame`, and `App` mounts a
  second `useLocationOperation` for the `open-location` / `new-location` commands, whose
  `onChanged` is again `refresh`.
- **Single-flight guards are per instance.** `useLocationOperation` keeps its own `running` ref,
  so with one instance in `App` and one in `LocationSwitcher` the "only one location operation at
  a time" rule holds per caller rather than app-wide.
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

None of this is wrong. It is the point at which a library that does exactly this job, well
tested, pays for itself, and the members database is about to add a fourth copy of the pattern
plus a data grid and an import wizard.

## Goals

1. One subscription to `tree:changed`; one place where "the disk changed" becomes "refetch".
2. No hand-written generation counters or ticket maps in renderer hooks.
3. Mutations invalidate by key instead of by drilled callback.
4. Cross-pane state (selection, current folder, collapsed days) is readable by selector and
   persisted per location without a custom localStorage layer.
5. Every behaviour the existing specs pin down keeps passing, with `installMockApi` and
   `emitTreeChanged` unchanged as the test seam.
6. Nothing in `src/main`, `src/preload` or `src/shared` changes.

## Non-goals

- Replacing view-local `useState` for filter text, crumbs, row selection or dialog open flags.
  That state is deliberately reset when the folder changes, either by `key` or by the guarded
  keyed-state pattern `useFileSelection(currentDir, …)` now uses, and should stay local. The tree
  sort that `LeagueView` lifted in `5ab115e` is owner state, not app state, and stays where it is.
- Turning the one-shot focus request (`pendingFocusDir` and `consumeFocusRequest` in
  `LeagueView`) into store state. It is an imperative signal consumed once by the next mount and
  a ref is the right tool for it.
- Moving UI memory into `electron-store` in main. Worth a separate discussion (see open
  questions); this RFC keeps it in the renderer.
- Rewriting `DirectoryBrowser` / `TreeFileBrowser` onto TanStack Table. Possible later; not
  required by anything here.

## Proposal

### Dependencies

All packages go in `devDependencies`, following the Kumo migration rule (electron-vite bundles
the renderer; ESM-only packages break as externalised CJS requires). Versions are the latest
published on the date of this RFC and are pinned with a caret.

**Adopt now**

| Package                          | Version  | Role                                                                                     |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `@tanstack/react-query`          | ^5.102.8 | Cache and lifecycle for every IPC read; mutations with keyed invalidation                |
| `@tanstack/react-query-devtools` | ^5.102.8 | Dev-only inspector, rendered behind `import.meta.env.DEV`                                |
| `@tanstack/eslint-plugin-query`  | ^5.102.8 | `exhaustive-deps` for query keys and the other recommended rules; flat-config compatible |
| `zustand`                        | ^5.0.15  | One `workspace` store for cross-pane UI state, with the `persist` middleware             |

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
1 kB. Devtools and the ESLint plugin never ship. Kumo already pulls in
`use-sync-external-store`, which both libraries build on.

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

| Today                                                    | With Query                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase` state machine in `App`                           | Derived: `isPending` → loading, `isError` → error, `data === null` → no-root, else ready                                                                                                           |
| `scanGeneration`, `generation`, `requests` race guards   | Query deduplicates in-flight fetches per key and drops results for a key no longer observed. `use-dir-listing.spec.ts`'s "slow earlier folder" case is a Query invariant.                          |
| "Keep old rows during re-list, never across folders"     | Query's default: same key refetch keeps `data` with `isFetching`; a new key starts with no data. No `placeholderData` needed.                                                                      |
| `useDirListing(dir)`                                     | Same signature, implemented as `useQuery({ ...dirListingQuery(dir), enabled: dir !== null })`. Components do not change in that phase.                                                             |
| `useTreeFolders().branches`                              | `useQueries` over the expanded paths; `branches` becomes a derived `Map`. `LeagueView` still owns the hook and passes the same `TreeFolders` shape down, so `TreeFileBrowser` is untouched.        |
| `refresh` app command → `onRefresh` → `listing.reload()` | `queryClient.invalidateQueries()`, the same call the watcher makes. A pane-scoped variant (`['dir', currentDir]`) is available if a full refresh ever proves too broad.                            |
| `useLocationOperation`'s `busy` state and `running` ref  | `useMutation({ mutationKey: ['location'] })` for choose and switch, with `useIsMutating({ mutationKey: ['location'] })` as one app-wide guard shared by `App` and `LocationSwitcher`.              |
| `onChanged` / `refresh` props                            | `useMutation` with `onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tree'] })`. `await`ing the invalidation preserves today's "dialog closes after the new season is visible" timing. |
| `begin` / `finish` calls in each flow                    | A `MutationCache` with `onMutate` / `onSuccess` / `onError` reading `mutation.meta.label`, feeding the existing `OperationFeedbackContext`.                                                        |
| `forgetAndRestart`                                       | `queryClient.setQueryData(treeQuery.queryKey, null)` plus `removeQueries` for `['dir']`.                                                                                                           |

Structural sharing is a quiet win: `LeaguesTree` is plain JSON from IPC, so an unchanged league
keeps its object identity across scans and memoised children stop re-rendering on every
watcher tick.

### Zustand: the workspace store

The state that genuinely spans panes is small: the chosen location, the selection, the folder
being viewed (for the status bar), the collapsed sidebar days, and the diagnostics preference.
Today it lives in `App` and is either drilled down or reported up.

```ts
interface WorkspaceState {
  root: string | null
  selection: Selection
  currentDir: string | null
  collapsedDays: ReadonlySet<Weekday>
  diagnostics: boolean
  setRoot: (root: string | null) => void // hydrates selection and collapsedDays for that root
  select: (next: Selection) => void
  setCurrentDir: (dir: string) => void
  toggleDay: (day: Weekday) => void
}
```

- **Persistence** uses the `persist` middleware with `partialize` so only
  `{ locations: Record<root, { selection, collapsedDays }>, diagnostics }` is written, under one
  versioned key. A custom `merge` validates the stored shape with the zod schemas that already
  exist in `lib/selection.ts` and `lib/local-store.ts`, keeping today's guarantee that corrupt or
  missing storage can never break the app. `lib/local-store.ts` then goes away.
- **Restoration becomes derivation.** Instead of `restoreSelection` writing `HOME` into state
  when a league is missing from one scan, the render reads `findLeague(tree, selection) ?? HOME`.
  The stored selection survives a sync-lag scan, which is what the comment in `App.tsx` asks for,
  and the league re-selects itself when it reappears. That is a small behaviour change and is
  called out in the migration phase.
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

Each phase is one PR, keeps `npm test`, `npm run typecheck` and `npm run lint` green, and can be
reverted alone. The hand-rolled hooks and Query can coexist while a phase is in flight because
the extra subscription is harmless.

1. **Install.** Add the four "adopt now" packages and the lockfile changes, wire
   `QueryClientProvider` in `main.tsx` and `TestProviders`, enable the ESLint plugin. No behaviour
   change.
2. **Directory listings.** Reimplement `useDirListing` on `useQuery` behind the same signature.
   Move the `onTreeChanged` subscription to the single invalidation point. The two existing
   `use-dir-listing.spec.ts` cases become the acceptance test.
3. **Tree and recents.** Move `scan` into `treeQuery`; derive `phase`; delete `scanGeneration`.
   Move `recentRoots` (used by `LocationSwitcher` and `FirstRun`) onto a query.
   `useTreeFolders` becomes `useQueries` over the expanded set, keeping the `TreeFolders`
   interface that `LeagueView` passes to `TreeFileBrowser`.
4. **Mutations and feedback.** Convert create league, create season, sync templates, zip, trash,
   import and location switching to `useMutation` with `meta.label`. Route feedback through a
   `MutationCache`. Point the `refresh` and location app-command handlers at the query client.
   Remove the drilled `onChanged` props once no caller needs them.
5. **Workspace store.** Introduce `createWorkspaceStore`, migrate selection, current folder,
   collapsed days and diagnostics; delete `lib/local-store.ts` and the navigation state in
   `App`. Note the restoration-by-derivation behaviour change in the PR description.
6. **Members (later).** Add Table and Form with the feature.

Test impact per phase is confined to the specs of the hooks touched; `installMockApi` and
`emitTreeChanged` stay the seam because the single subscriber still registers through
`window.api.onTreeChanged`.

## Risks

- **Offline pause.** Covered by `networkMode: 'always'`; a test in phase 1 should assert the
  client is built with it.
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

1. Zustand, or defer the client store and do phases 1 to 4 only? Query is the larger win; the
   store is justified mostly by persistence and the status-bar plumbing.
2. Should per-location UI memory move to `electron-store` in main, next to recent locations,
   instead of persisting in the renderer? The polish plan rejected a second renderer store for
   recents; the same argument may apply here.
3. Ship the devtools at all, or rely on the ESLint plugin and tests?
4. Migrate the two file browsers to TanStack Table when members lands, or leave them?
