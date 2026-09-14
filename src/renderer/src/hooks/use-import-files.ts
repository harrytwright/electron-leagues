import { useEffect, useRef, useState } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useWriteOperation } from './use-write-operation'

interface ImportVariables {
  destination: string
  paths: string[]
}

export interface FileImporter {
  importing: boolean
  /** Copy the given absolute paths into the destination folder. */
  importPaths: (paths: string[]) => Promise<void>
  /** Open the native picker, then import whatever was chosen. */
  pickFiles: () => Promise<void>
}

/** Shared import flow (toasts, busy state) for drop targets and "Add files…" buttons. */
export function useImportFiles(dest: string | undefined): FileImporter {
  const [importing, setImporting] = useState(false)
  const running = useRef(false)
  const lifecycle = useRef({ dest, generation: 0, mounted: true })
  const { add } = useKumoToastManager()
  const operation = useWriteOperation({
    label: ({ paths }: ImportVariables) =>
      `Importing ${paths.length} file${paths.length === 1 ? '' : 's'}`,
    write: ({ destination, paths }) => window.api.importFiles(destination, paths)
  })

  useEffect(() => {
    const current = lifecycle.current
    current.mounted = true
    return () => {
      current.mounted = false
      current.generation += 1
    }
  }, [])

  useEffect(() => {
    const current = lifecycle.current
    if (current.dest !== dest) {
      current.dest = dest
      current.generation += 1
    }
  }, [dest])

  const importPaths = async (paths: string[]): Promise<void> => {
    const usable = paths.filter(Boolean)
    if (!dest || usable.length === 0 || running.current) return
    running.current = true
    setImporting(true)
    const destination = dest
    const generation = lifecycle.current.generation
    try {
      // Main reports what it actually copied — count that, not the request.
      const outcome = await operation.run({ destination, paths: usable })
      const copied = outcome.result
      const message =
        copied.length === usable.length
          ? `Imported ${copied.length} file${copied.length === 1 ? '' : 's'}`
          : `Imported ${copied.length} of ${usable.length} files`
      if (outcome.status === 'refresh-failed' && lifecycle.current.generation === generation) {
        add({
          title: `${message}, but the folder could not be refreshed: ${outcome.refreshError}`,
          variant: 'error'
        })
        return
      }
      add({ title: message, variant: 'success' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      running.current = false
      setImporting(false)
    }
  }

  const pickFiles = async (): Promise<void> => {
    if (running.current) return
    running.current = true
    const generation = lifecycle.current.generation
    let paths: string[]
    try {
      paths = await window.api.pickFiles()
    } catch (caught) {
      if (lifecycle.current.generation === generation) {
        add({ title: ipcErrorMessage(caught), variant: 'error' })
      }
      return
    } finally {
      running.current = false
    }
    if (lifecycle.current.generation === generation) {
      await importPaths(paths)
    } else if (lifecycle.current.mounted && paths.length > 0) {
      // The picker result is irrelevant after unmount; only a visible destination change needs notice.
      add({ title: 'The folder changed. No files were imported.' })
    }
  }

  return { importing, importPaths, pickFiles }
}
