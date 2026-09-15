import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { useQueryClient } from '@tanstack/react-query'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import {
  LocationOperationContext,
  type LocationOperation
} from '@renderer/hooks/use-location-operation'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { ROOT_QUERY_KEY } from '@renderer/queries/root'
import { DIR_QUERY_PREFIX } from '@renderer/queries/dir'
import { TREE_QUERY_PREFIX, treeQuery } from '@renderer/queries/tree'
import { RECENTS_QUERY_KEY } from '@renderer/queries/recents'

export function LocationOperationProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const { add } = useKumoToastManager()
  const { begin, finish } = useOperationFeedback()

  const run = useCallback(
    async (
      label: string,
      completion: string,
      operation: () => Promise<string | null | void>,
      recentPath?: string
    ): Promise<void> => {
      if (running.current) return
      running.current = true
      setBusy(true)
      const operationId = begin(label, 'application')
      try {
        // Cancellation ignores obsolete renderer results; it does not stop main-process work.
        await queryClient.cancelQueries({
          predicate: (query) => query.queryKey[0] === 'tree' || query.queryKey[0] === 'dir'
        })
        let root: string | null | void
        try {
          root = await operation()
        } catch (caught) {
          await queryClient.invalidateQueries({ queryKey: ROOT_QUERY_KEY })
          throw caught
        }
        if (root === null) {
          if (!recentPath) return
          try {
            await queryClient.invalidateQueries({ queryKey: RECENTS_QUERY_KEY })
          } catch {
            // The missing-location error is primary; pruning stale recents is best effort.
          }
          throw new Error(`“${pathBasename(recentPath)}” is no longer available at ${recentPath}`)
        }
        if (root === undefined) {
          queryClient.setQueryData(ROOT_QUERY_KEY, null)
          queryClient.removeQueries({ queryKey: TREE_QUERY_PREFIX })
          queryClient.removeQueries({ queryKey: DIR_QUERY_PREFIX })
          return
        }
        queryClient.setQueryData(ROOT_QUERY_KEY, root)
        await queryClient.invalidateQueries({ queryKey: DIR_QUERY_PREFIX, refetchType: 'none' })
        await queryClient.invalidateQueries({ queryKey: TREE_QUERY_PREFIX, refetchType: 'none' })
        await queryClient.invalidateQueries({ queryKey: RECENTS_QUERY_KEY })
        try {
          await queryClient.fetchQuery(treeQuery(root))
        } catch {
          return
        }
        add({ title: completion, variant: 'success' })
      } catch (caught) {
        add({ title: ipcErrorMessage(caught), variant: 'error' })
      } finally {
        finish(operationId)
        running.current = false
        setBusy(false)
      }
    },
    [add, begin, finish, queryClient]
  )

  const value = useMemo<LocationOperation>(
    () => ({
      busy,
      choose: (mode) =>
        run(
          mode === 'init' ? 'Creating location' : 'Opening location',
          mode === 'init' ? 'Created location' : 'Opened location',
          () => window.api.chooseRoot(mode)
        ),
      switchTo: async (path) => {
        if (path === queryClient.getQueryData(ROOT_QUERY_KEY)) return
        await run('Opening location', 'Opened location', () => window.api.setRoot(path), path)
      },
      forget: () => run('Forgetting location', '', () => window.api.forgetRoot())
    }),
    [busy, queryClient, run]
  )

  return <LocationOperationContext value={value}>{children}</LocationOperationContext>
}
