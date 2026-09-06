import { useState } from 'react'
import type { Crumb } from '@renderer/lib/crumb'

export interface Trail {
  crumbs: Crumb[]
  /** The folder being viewed: the last crumb, or the base. */
  currentDir: string
  atBase: boolean
  enter: (folder: Crumb) => void
  enterMany: (folders: Crumb[]) => void
  /** Keep this many crumbs (0 = back to the base). */
  jumpTo: (depth: number) => void
}

interface State {
  baseDir: string
  crumbs: Crumb[]
}

/** The drill-down position below a base folder; a different base starts over. */
export function useCrumbs(baseDir: string, onCurrentDirChange?: (path: string) => void): Trail {
  const [state, setState] = useState<State>({ baseDir, crumbs: [] })
  const crumbs = state.baseDir === baseDir ? state.crumbs : []
  const update = (change: (current: Crumb[]) => Crumb[]): void =>
    setState((current) => ({
      baseDir,
      crumbs: change(current.baseDir === baseDir ? current.crumbs : [])
    }))

  return {
    crumbs,
    currentDir: crumbs.at(-1)?.path ?? baseDir,
    atBase: crumbs.length === 0,
    enter: (folder) => {
      update((current) => [...current, folder])
      onCurrentDirChange?.(folder.path)
    },
    enterMany: (folders) => {
      update((current) => [...current, ...folders])
      const destination = folders.at(-1)
      if (destination) onCurrentDirChange?.(destination.path)
    },
    jumpTo: (depth) => {
      update((current) => current.slice(0, depth))
      onCurrentDirChange?.(depth === 0 ? baseDir : crumbs[depth - 1].path)
    }
  }
}
