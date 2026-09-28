import { createStore, type StoreApi } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'
import { z } from 'zod'
import { WEEKDAYS, type Weekday } from '@shared/weekday'
import { HOME, selectionSchema, type Selection } from './selection'

/**
 * The workspace store holds everything that genuinely spans panes: the
 * confirmed root, per-root UI memory and owner-tagged navigation reports.
 * Only `locations` is persisted; everything else is live and reset when the
 * root changes.
 */

export interface WorkspaceLocation {
  selection: Selection
  collapsedDays: Weekday[]
}

export interface LeagueNavigation {
  ownerPath: string
  currentDir: string
  /** Opens a roster tab when navigation begins outside the league view. */
  tab?: 'players' | 'teams' | 'settings'
}

export interface HomeNavigation {
  ownerRoot: string
  currentDir: string
}

export interface WorkspaceState {
  root: string | null
  locations: Record<string, WorkspaceLocation>
  leagueNavigation: LeagueNavigation | null
  homeNavigation: HomeNavigation | null
  setRoot(root: string | null): void
  select(selection: Selection): void
  setCollapsedDays(days: readonly Weekday[]): void
  reportLeagueDir(report: LeagueNavigation): void
  reportHomeDir(report: HomeNavigation): void
}

export type WorkspaceStore = StoreApi<WorkspaceState>

/**
 * A synchronous key/value store the workspace store can persist to and
 * enumerate. `localStorage` is adapted to this shape in `main.tsx`; tests use
 * an in-memory implementation from `tests/memory-workspace-storage.ts`.
 */
export interface WorkspaceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

const WORKSPACE_STORAGE_KEY = 'leagues:workspace'
const LEGACY_PREFIX = 'leagues:'
const LEGACY_SELECTION_SUFFIX = ':selection'
const LEGACY_COLLAPSED_DAYS_SUFFIX = ':collapsed-days'

const workspaceLocationSchema = z.object({
  selection: selectionSchema,
  collapsedDays: z.array(z.enum(WEEKDAYS))
})

/** The partialized, persisted shape: `{ locations }` only, keyed by root. */
export const persistedWorkspaceStateSchema = z.object({
  locations: z.record(z.string(), workspaceLocationSchema)
})

/** The full envelope the persist middleware writes: `{ state, version }`. */
export const workspaceEnvelopeSchema = z.object({
  state: persistedWorkspaceStateSchema,
  version: z.number()
})

/** Every access is guarded so a throwing or unavailable storage never breaks navigation. */
function guardStorage(storage: WorkspaceStorage): WorkspaceStorage {
  return {
    getItem(key) {
      try {
        return storage.getItem(key)
      } catch {
        return null
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value)
      } catch {
        // Storage full or disabled — losing UI memory is acceptable.
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key)
      } catch {
        // Storage full or disabled — losing UI memory is acceptable.
      }
    },
    keys() {
      try {
        return storage.keys()
      } catch {
        return []
      }
    }
  }
}

function legacyRoot(storageKey: string): string | null {
  if (!storageKey.startsWith(LEGACY_PREFIX)) return null
  const withoutPrefix = storageKey.slice(LEGACY_PREFIX.length)
  if (withoutPrefix.endsWith(LEGACY_SELECTION_SUFFIX)) {
    return withoutPrefix.slice(0, -LEGACY_SELECTION_SUFFIX.length)
  }
  if (withoutPrefix.endsWith(LEGACY_COLLAPSED_DAYS_SUFFIX)) {
    return withoutPrefix.slice(0, -LEGACY_COLLAPSED_DAYS_SUFFIX.length)
  }
  return null
}

function readLegacy<T>(storage: WorkspaceStorage, key: string, schema: z.ZodType<T>): T | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Legacy `leagues:<root>:selection` and `leagues:<root>:collapsed-days` keys are read once at
 * store creation, so a remembered selection is available on the first render without a Home
 * flash. A root already present in the hydrated `locations` (a valid new-format record) always
 * wins; legacy keys are left in place in case the new save is later lost or rolled back.
 */
function migrateLegacyStorage(storage: WorkspaceStorage, store: WorkspaceStore): void {
  const roots = new Set<string>()
  for (const storageKey of storage.keys()) {
    const root = legacyRoot(storageKey)
    if (root) roots.add(root)
  }
  if (roots.size === 0) return

  const { locations } = store.getState()
  const migrated: Record<string, WorkspaceLocation> = {}
  for (const root of roots) {
    if (locations[root]) continue
    const selection = readLegacy(storage, `leagues:${root}:selection`, selectionSchema)
    const collapsedDays = readLegacy(
      storage,
      `leagues:${root}:collapsed-days`,
      z.array(z.enum(WEEKDAYS))
    )
    if (selection === null && collapsedDays === null) continue
    migrated[root] = { selection: selection ?? HOME, collapsedDays: collapsedDays ?? [] }
  }
  if (Object.keys(migrated).length === 0) return
  store.setState((state) => ({ locations: { ...migrated, ...state.locations } }))
}

export function createWorkspaceStore(options: { storage: WorkspaceStorage }): WorkspaceStore {
  const guarded = guardStorage(options.storage)

  const store = createStore<WorkspaceState>()(
    persist(
      (set) => ({
        root: null,
        locations: {},
        leagueNavigation: null,
        homeNavigation: null,
        setRoot(root) {
          set({ root, leagueNavigation: null, homeNavigation: null })
        },
        select(selection) {
          set((state) => ({
            leagueNavigation: null,
            // A redundant Home click keeps the mounted pane and its reported directory together.
            homeNavigation: selection.kind === 'home' ? state.homeNavigation : null,
            locations:
              state.root === null
                ? state.locations
                : {
                    ...state.locations,
                    [state.root]: {
                      selection,
                      collapsedDays: state.locations[state.root]?.collapsedDays ?? []
                    }
                  }
          }))
        },
        setCollapsedDays(days) {
          set((state) => {
            if (state.root === null) return state
            const current = state.locations[state.root] ?? { selection: HOME, collapsedDays: [] }
            return {
              locations: {
                ...state.locations,
                [state.root]: { ...current, collapsedDays: [...days] }
              }
            }
          })
        },
        reportLeagueDir(report) {
          set({ leagueNavigation: report })
        },
        reportHomeDir(report) {
          set({ homeNavigation: report })
        }
      }),
      {
        name: WORKSPACE_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(() => guarded),
        partialize: (state) => ({ locations: state.locations }),
        merge: (persisted, current) => {
          const parsed = persistedWorkspaceStateSchema.safeParse(persisted)
          return parsed.success ? { ...current, locations: parsed.data.locations } : current
        },
        migrate: () => ({ locations: {} })
      }
    )
  )

  migrateLegacyStorage(guarded, store)

  return store
}
