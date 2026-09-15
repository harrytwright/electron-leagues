import { useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

interface FileActions {
  openFile: (path: string) => Promise<void>
  revealFile: (path: string) => Promise<void>
}

export function useFileActions(): FileActions {
  const { add } = useKumoToastManager()
  const run = async (action: () => Promise<string | void>): Promise<void> => {
    try {
      const error = await action()
      if (error) add({ title: error, variant: 'error' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }
  return {
    openFile: (path) => run(() => window.api.openFile(path)),
    revealFile: (path) => run(() => window.api.revealFile(path))
  }
}
