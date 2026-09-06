import { useRef, useState } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

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

  const run = async (operation: () => Promise<boolean>): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      if (await operation()) await onChanged()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const choose = async (mode: ChooseRootMode): Promise<void> => {
    await run(async () => Boolean(await window.api.chooseRoot(mode)))
  }

  const switchTo = async (path: string): Promise<void> => {
    if (path === root) return
    await run(async () => {
      const switched = await window.api.setRoot(path)
      if (switched !== null) return true
      add({ title: 'That folder is no longer available', variant: 'error' })
      await onMissingRecent()
      return false
    })
  }

  return { busy, choose, switchTo }
}
