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

function isInside(path: string, directory: string): boolean {
  const prefix = directory.replace(/[\\/]+$/, '')
  return path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}\\`)
}

export function useTreeFolders(currentDir: string): TreeFolders {
  const [branches, setBranches] = useState(new Map<string, Branch>())
  const [expanded, setExpanded] = useState(new Set<string>())
  const requests = useRef(new Map<string, object>())
  const scope = useRef(currentDir)
  const reloadScope = useRef({ currentDir, expanded })

  if (scope.current !== currentDir) {
    scope.current = currentDir
    // Navigation drops unrelated branches so filesystem events cannot keep polling abandoned paths.
    for (const path of requests.current.keys()) {
      if (!isInside(path, currentDir)) requests.current.delete(path)
    }
    setBranches((current) => new Map([...current].filter(([path]) => isInside(path, currentDir))))
    setExpanded((current) => new Set([...current].filter((path) => isInside(path, currentDir))))
  }
  reloadScope.current = { currentDir, expanded }

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
    // Collapsed caches do not drive watcher I/O; reopening refreshes their contents instead.
    const current = reloadScope.current
    for (const path of current.expanded) {
      if (isInside(path, current.currentDir)) void load(path)
    }
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
      const opening = !expanded.has(path)
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      if (opening) void load(path)
    },
    collapse: () => setExpanded(new Set()),
    reload,
    load
  }
}
