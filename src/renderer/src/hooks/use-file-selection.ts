import { useRef, useState, type ComponentPropsWithRef, type KeyboardEvent } from 'react'

interface Selection {
  selected: string | null
  focus: (path: string | undefined) => boolean
  focusFirstRow: () => boolean
  rowProps: (path: string) => ComponentPropsWithRef<'tr'>
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, index: number, open: () => void) => void
}

/** Roving row focus shared by flat and tree grids; tree-specific keys stay with the tree. */
export function useFileSelection(currentDir: string, paths: readonly string[]): Selection {
  const [state, setState] = useState<{ dir: string; selected: string | null }>({
    dir: currentDir,
    selected: null
  })
  if (state.dir !== currentDir) setState({ dir: currentDir, selected: null })
  const elements = useRef(new Map<string, HTMLTableRowElement>())
  const selected = state.dir === currentDir ? state.selected : null
  const focusPath = selected !== null && paths.includes(selected) ? selected : paths[0]
  const focus = (path: string | undefined): boolean => {
    const element = path === undefined ? undefined : elements.current.get(path)
    element?.focus()
    return element !== undefined
  }
  return {
    selected,
    focus,
    focusFirstRow: () => focus(paths[0]),
    rowProps: (path) => ({
      ref: (element) => {
        if (element) elements.current.set(path, element)
        else elements.current.delete(path)
      },
      'aria-selected': selected === path,
      tabIndex: focusPath === path ? 0 : -1,
      onFocus: () => setState({ dir: currentDir, selected: path }),
      onClick: () => focus(path)
    }),
    onKeyDown: (event, index, open) => {
      if (event.target !== event.currentTarget) return
      switch (event.key) {
        case 'ArrowDown':
          focus(paths[index + 1])
          break
        case 'ArrowUp':
          focus(paths[index - 1])
          break
        case 'Home':
          focus(paths[0])
          break
        case 'End':
          focus(paths.at(-1))
          break
        case 'Enter':
          open()
          break
        default:
          return
      }
      event.preventDefault()
    }
  }
}
