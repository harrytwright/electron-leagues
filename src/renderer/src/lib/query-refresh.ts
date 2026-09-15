import type { QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query'

const ROOT_QUERY_PREFIX = ['root'] as const

export interface RefreshOptions {
  /** Prefix filter; routine refreshes match everything except the root query. */
  queryKey?: QueryKey
  /** Whether a failed refetch rejects the caller. Defaults to false. */
  throwOnError?: boolean
}

export interface RefreshCoordinator {
  refresh(options?: RefreshOptions): Promise<void>
}

interface RefreshRun {
  promise: Promise<void>
}

function routineRefreshFilter(): QueryFilters {
  return {
    predicate: (query) => query.queryKey[0] !== ROOT_QUERY_PREFIX[0]
  }
}

export function createRefreshCoordinator(client: QueryClient): RefreshCoordinator {
  let latestRun: RefreshRun | null = null

  // Every run surfaces its own outcome; the caller's throwOnError decides at the end.
  // A superseded run's outcome is discarded so the caller adopts the newest one,
  // even when the newer caller itself asked not to throw.
  const awaitLatest = async (started: RefreshRun, throwOnError: boolean): Promise<void> => {
    let current = started
    for (;;) {
      try {
        await current.promise
      } catch (caught) {
        if (current === latestRun) {
          if (throwOnError) throw caught
          return
        }
      }

      const latest = latestRun
      if (!latest || current === latest) return
      current = latest
    }
  }

  return {
    refresh(options = {}) {
      const filter: QueryFilters = options.queryKey
        ? { queryKey: options.queryKey }
        : routineRefreshFilter()
      const run: RefreshRun = {
        promise: (async () => {
          // Invalidation alone reuses an in-flight initial fetch with no data, so cancel first.
          // Cancellation prevents obsolete renderer results; it does not stop main-process work.
          await client.cancelQueries(filter)
          await client.invalidateQueries(
            { ...filter, refetchType: 'active' },
            { throwOnError: true }
          )
        })()
      }
      latestRun = run
      return awaitLatest(run, options.throwOnError ?? false)
    }
  }
}
