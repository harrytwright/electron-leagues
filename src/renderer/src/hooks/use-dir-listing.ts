import { useCallback, useEffect, useRef, useState } from 'react'
import type { DirEntry } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

export interface DirListing {
  /** null while the first listing for this folder is loading. */
  entries: DirEntry[] | null
  error: string | null
  reload: () => void
}

interface Loaded {
  dir: string
  entries: DirEntry[]
}

interface Failed {
  dir: string
  message: string
}

/**
 * Lists `dir` on demand and re-lists whenever the tree changes on disk. Rows
 * for the previous folder are never shown against a new one, but a re-list of
 * the same folder keeps the old rows up until the fresh ones arrive.
 */
export function useDirListing(dir: string | null): DirListing {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState<Failed | null>(null)
  const [tick, setTick] = useState(0)
  // Listings settle in any order; only the most recently requested may land.
  const generation = useRef(0)

  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (dir === null) return
    const ticket = (generation.current += 1)
    window.api.listDir(dir).then(
      (entries) => {
        if (generation.current !== ticket) return
        setLoaded({ dir, entries })
        setFailed(null)
      },
      (caught: Error) => {
        if (generation.current !== ticket) return
        setFailed({ dir, message: ipcErrorMessage(caught) })
      }
    )
  }, [dir, tick])

  useEffect(() => window.api.onTreeChanged(reload), [reload])

  return {
    entries: dir !== null && loaded?.dir === dir ? loaded.entries : null,
    error: dir !== null && failed?.dir === dir ? failed.message : null,
    reload
  }
}
