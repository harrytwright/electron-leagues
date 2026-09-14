import { useCallback, useRef } from 'react'
import type { Crumb } from '@renderer/lib/crumb'
import { useKeyedState } from './use-keyed-state'

export interface Trail {
  crumbs: Crumb[]
  /** The folder being viewed: the last crumb, or the base. */
  currentDir: string
  atBase: boolean
  enter: (folder: Crumb, focusFirstRow?: boolean) => void
  enterMany: (folders: Crumb[], focusFirstRow?: boolean) => void
  /** Keep this many crumbs (0 = back to the base); the destination is asked to take focus. */
  jumpTo: (depth: number) => void
  /** True once for the directory whose first row should take focus after it loads. */
  consumeFocusRequest: (currentDir: string) => boolean
}

/** The drill-down position below a base folder; a different base starts over. */
export function useCrumbs(baseDir: string, onCurrentDirChange?: (path: string) => void): Trail {
  const [crumbs, setCrumbs] = useKeyedState<string, Crumb[]>(baseDir, [])
  // A one-shot signal for the next directory to mount; a ref because it is consumed once.
  const pendingFocusDir = useRef<string | null>(null)

  const consumeFocusRequest = useCallback((currentDir: string): boolean => {
    if (pendingFocusDir.current !== currentDir) return false
    pendingFocusDir.current = null
    return true
  }, [])

  return {
    crumbs,
    currentDir: crumbs.at(-1)?.path ?? baseDir,
    atBase: crumbs.length === 0,
    enter: (folder, focusFirstRow = false) => {
      pendingFocusDir.current = focusFirstRow ? folder.path : null
      setCrumbs([...crumbs, folder])
      onCurrentDirChange?.(folder.path)
    },
    enterMany: (folders, focusFirstRow = false) => {
      const destination = folders.at(-1)
      pendingFocusDir.current = focusFirstRow && destination ? destination.path : null
      setCrumbs([...crumbs, ...folders])
      if (destination) onCurrentDirChange?.(destination.path)
    },
    jumpTo: (depth) => {
      pendingFocusDir.current = depth === 0 ? baseDir : crumbs[depth - 1].path
      setCrumbs(crumbs.slice(0, depth))
      onCurrentDirChange?.(depth === 0 ? baseDir : crumbs[depth - 1].path)
    },
    consumeFocusRequest
  }
}
