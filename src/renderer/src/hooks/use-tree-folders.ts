import { useCallback, useMemo, useReducer } from 'react'
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { DirEntry } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { dirListingQuery, dirQueryKey } from '@renderer/queries/dir'
import { useQueryRefresh } from './use-query-refresh'

export interface Branch {
  entries: DirEntry[] | null
  error: string | null
}

export interface TreeFolders {
  branches: Map<string, Branch>
  expanded: ReadonlySet<string>
  toggle: (path: string) => void
  collapse: () => void
  reload: () => void
  load: (path: string) => Promise<void>
}

export interface TreeFoldersState {
  scope: string
  visited: ReadonlySet<string>
  expanded: ReadonlySet<string>
}

export type TreeFoldersAction =
  | { type: 'navigated'; scope: string } // keeps only paths inside the new scope in both sets
  | { type: 'visited'; path: string }
  | { type: 'opened'; path: string } // visited and expanded
  | { type: 'closed'; path: string }
  | { type: 'collapsed' } // expanded cleared, visited kept

function isInside(path: string, directory: string): boolean {
  const prefix = directory.replace(/[\\/]+$/, '')
  return path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}\\`)
}

function pruneToScope(paths: ReadonlySet<string>, scope: string): ReadonlySet<string> {
  const kept = [...paths].filter((path) => isInside(path, scope))
  return kept.length === paths.size ? paths : new Set(kept)
}

export function treeFoldersReducer(
  state: TreeFoldersState,
  action: TreeFoldersAction
): TreeFoldersState {
  switch (action.type) {
    case 'navigated': {
      if (state.scope === action.scope) return state
      return {
        scope: action.scope,
        visited: pruneToScope(state.visited, action.scope),
        expanded: pruneToScope(state.expanded, action.scope)
      }
    }
    case 'visited': {
      if (state.visited.has(action.path)) return state
      return { ...state, visited: new Set(state.visited).add(action.path) }
    }
    case 'opened': {
      if (state.visited.has(action.path) && state.expanded.has(action.path)) return state
      return {
        ...state,
        visited: new Set(state.visited).add(action.path),
        expanded: new Set(state.expanded).add(action.path)
      }
    }
    case 'closed': {
      if (!state.expanded.has(action.path)) return state
      const expanded = new Set(state.expanded)
      expanded.delete(action.path)
      return { ...state, expanded }
    }
    case 'collapsed': {
      if (state.expanded.size === 0) return state
      return { ...state, expanded: new Set() }
    }
  }
}

export function useTreeFolders(currentDir: string): TreeFolders {
  const queryClient = useQueryClient()
  const coordinator = useQueryRefresh()
  const [state, dispatch] = useReducer(treeFoldersReducer, {
    scope: currentDir,
    visited: new Set<string>(),
    expanded: new Set<string>()
  })

  if (state.scope !== currentDir) {
    dispatch({ type: 'navigated', scope: currentDir })
  }

  const visitedPaths = useMemo(() => [...state.visited].sort(), [state.visited])
  const combineBranches = useCallback(
    (results: UseQueryResult<DirEntry[], Error>[]): Map<string, Branch> =>
      new Map(
        results.map((result, index) => [
          visitedPaths[index],
          {
            entries: result.data ?? null,
            error: result.error ? ipcErrorMessage(result.error) : null
          }
        ])
      ),
    [visitedPaths]
  )
  // A collapsed branch keeps a disabled observer. With staleTime Infinity and the default gcTime,
  // that subscription is the only thing keeping its rows alive for the loaded-files filter; drop
  // it and the data is collected five minutes after collapse.
  const branches = useQueries({
    queries: visitedPaths.map((path) => ({
      ...dirListingQuery(path),
      enabled: state.expanded.has(path)
    })),
    combine: combineBranches
  })

  const load = useCallback(
    async (path: string): Promise<void> => {
      dispatch({ type: 'visited', path })
      try {
        await queryClient.fetchQuery({ ...dirListingQuery(path), staleTime: 0 })
      } catch {
        // The observer exposes the error and load has never rejected.
      }
    },
    [queryClient]
  )

  const reload = useCallback(() => {
    for (const path of state.expanded) {
      if (isInside(path, currentDir)) void coordinator.refresh({ queryKey: dirQueryKey(path) })
    }
  }, [coordinator, currentDir, state.expanded])

  return {
    branches,
    expanded: state.expanded,
    toggle: (path) => {
      const opening = !state.expanded.has(path)
      dispatch(opening ? { type: 'opened', path } : { type: 'closed', path })
      if (opening) void load(path)
    },
    collapse: () => dispatch({ type: 'collapsed' }),
    reload,
    load
  }
}
