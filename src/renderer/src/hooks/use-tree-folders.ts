import { useCallback, useEffect, useRef, useState } from 'react'
import type { DirEntry } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

export interface Branch {
  entries: DirEntry[] | null
  error: string | null
}

export interface TreeFolders {
  branches: Map<string, Branch>
  expanded: Set<string>
  toggle: (path: string) => void
  collapse: () => void
  reload: () => void
  load: (path: string) => Promise<void>
}

export function useTreeFolders(): TreeFolders {
  const [branches, setBranches] = useState(new Map<string, Branch>())
  const [expanded, setExpanded] = useState(new Set<string>())
  const requests = useRef(new Map<string, object>())

  const load = useCallback(async (path: string): Promise<void> => {
    const ticket = {}
    requests.current.set(path, ticket)
    setBranches((current) =>
      new Map(current).set(path, {
        entries: current.get(path)?.entries ?? null,
        error: null
      })
    )
    try {
      const entries = await window.api.listDir(path)
      if (requests.current.get(path) !== ticket) return
      setBranches((current) => new Map(current).set(path, { entries, error: null }))
    } catch (caught) {
      if (requests.current.get(path) !== ticket) return
      setBranches((current) =>
        new Map(current).set(path, { entries: null, error: ipcErrorMessage(caught) })
      )
    }
  }, [])

  const reload = useCallback(() => {
    // Refresh only folders the user has opened, including collapsed cached ones.
    for (const path of requests.current.keys()) void load(path)
  }, [load])

  useEffect(() => {
    const pending = requests.current
    const unsubscribe = window.api.onTreeChanged(reload)
    return () => {
      unsubscribe()
      pending.clear()
    }
  }, [reload])

  return {
    branches,
    expanded,
    toggle: (path) => {
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      if (!requests.current.has(path)) void load(path)
    },
    collapse: () => setExpanded(new Set()),
    reload,
    load
  }
}
