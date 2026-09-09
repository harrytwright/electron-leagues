import { useRef, useState } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useOperationFeedback } from './use-operation-feedback'

type ChooseRootMode = 'select' | 'init'

interface Options {
  root: string
  onChanged: () => void | Promise<void>
  onMissingRecent: () => void | Promise<void>
}

interface LocationOperation {
  busy: boolean
  choose: (mode: ChooseRootMode) => Promise<void>
  switchTo: (path: string) => Promise<void>
}

export function useLocationOperation({
  root,
  onChanged,
  onMissingRecent
}: Options): LocationOperation {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const { add } = useKumoToastManager()
  const feedback = useOperationFeedback()

  const refreshMissingRecents = async (): Promise<void> => {
    try {
      await onMissingRecent()
    } catch {
      // The missing-location result is primary; refreshing its stale menu is best effort.
    }
  }

  const run = async (label: string, operation: () => Promise<boolean>): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(true)
    const operationId = feedback.begin(label, 'application')
    try {
      if (await operation()) {
        const message = label === 'Creating location' ? 'Created location' : 'Opened location'
        await onChanged()
        feedback.finish(operationId, 'success', message)
        add({ title: message, variant: 'success' })
      } else {
        feedback.finish(operationId, 'success')
      }
    } catch (caught) {
      const message = ipcErrorMessage(caught)
      feedback.finish(operationId, 'error', message)
      add({ title: message, variant: 'error' })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const choose = async (mode: ChooseRootMode): Promise<void> => {
    await run(mode === 'init' ? 'Creating location' : 'Opening location', async () =>
      Boolean(await window.api.chooseRoot(mode))
    )
  }

  const switchTo = async (path: string): Promise<void> => {
    if (path === root) return
    await run('Opening location', async () => {
      const switched = await window.api.setRoot(path)
      if (switched !== null) return true
      const message = 'That folder is no longer available'
      void refreshMissingRecents()
      throw new Error(message)
    })
  }

  return { busy, choose, switchTo }
}
