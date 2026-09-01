import { useState } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from './ipc-error'

export interface FileImporter {
  importing: boolean
  /** Copy the given absolute paths into the destination folder. */
  importPaths: (paths: string[]) => Promise<void>
  /** Open the native picker, then import whatever was chosen. */
  pickFiles: () => Promise<void>
}

/** Shared import flow (toasts, busy state) for drop targets and "Add files…" buttons. */
export function useImportFiles(
  dest: string | undefined,
  onImported?: () => void | Promise<void>
): FileImporter {
  const [importing, setImporting] = useState(false)
  const { add } = useKumoToastManager()

  const importPaths = async (paths: string[]): Promise<void> => {
    const usable = paths.filter(Boolean)
    if (!dest || usable.length === 0 || importing) return
    setImporting(true)
    let copied: string[]
    try {
      // Main reports what it actually copied — count that, not the request.
      copied = await window.api.importFiles(dest, usable)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
      return
    } finally {
      setImporting(false)
    }
    add({
      title:
        copied.length === usable.length
          ? `Imported ${copied.length} file${copied.length === 1 ? '' : 's'}`
          : `Imported ${copied.length} of ${usable.length} files`,
      variant: 'success'
    })
    await onImported?.()
  }

  const pickFiles = async (): Promise<void> => {
    if (importing) return
    let paths: string[]
    try {
      paths = await window.api.pickFiles()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
      return
    }
    await importPaths(paths)
  }

  return { importing, importPaths, pickFiles }
}
