import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import {
  LocationOperationContext,
  type LocationOperation
} from '@renderer/hooks/use-location-operation'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'

export function LocationOperationProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const { add } = useKumoToastManager()
  const { begin, finish } = useOperationFeedback()

  const run = useCallback(
    async (
      label: string,
      completion: string,
      operation: () => Promise<boolean>,
      onChanged: Parameters<LocationOperation['choose']>[1]
    ): Promise<void> => {
      if (running.current) return
      running.current = true
      setBusy(true)
      const operationId = begin(label, 'application')
      try {
        if (!(await operation())) return
        const result = await onChanged()
        if (result === 'ready') add({ title: completion, variant: 'success' })
        // FirstRun and ScanError already own non-ready outcomes; toasts would duplicate that state.
      } catch (caught) {
        add({ title: ipcErrorMessage(caught), variant: 'error' })
      } finally {
        finish(operationId)
        running.current = false
        setBusy(false)
      }
    },
    [add, begin, finish]
  )

  const value = useMemo<LocationOperation>(
    () => ({
      busy,
      choose: async (mode, onChanged) => {
        await run(
          mode === 'init' ? 'Creating location' : 'Opening location',
          mode === 'init' ? 'Created location' : 'Opened location',
          async () => Boolean(await window.api.chooseRoot(mode)),
          onChanged
        )
      },
      switchTo: async (path, options) => {
        // Re-selecting the active root is navigation, not a second location-opening operation.
        if (path === options.root) return
        await run(
          'Opening location',
          'Opened location',
          async () => {
            const switched = await window.api.setRoot(path)
            if (switched !== null) return true
            try {
              await options.onMissingRecent?.()
            } catch {
              // The missing-location error is primary; pruning stale recents is best effort.
            }
            throw new Error(`“${pathBasename(path)}” is no longer available at ${path}`)
          },
          options.onChanged
        )
      }
    }),
    [busy, run]
  )

  return <LocationOperationContext value={value}>{children}</LocationOperationContext>
}
