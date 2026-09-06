import { useRef, useState, type ComponentPropsWithRef, type KeyboardEvent } from 'react'

interface Selection {
  selected: string | null
  focus: (path: string | undefined) => void
  rowProps: (path: string) => ComponentPropsWithRef<'tr'>
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>, index: number, open: () => void) => void
}

/** Roving row focus shared by flat and tree grids; tree-specific keys stay with the tree. */
export function useFileSelection(paths: readonly string[]): Selection {
  const [selected, setSelected] = useState<string | null>(null)
  const elements = useRef(new Map<string, HTMLTableRowElement>())
  const focusPath = selected !== null && paths.includes(selected) ? selected : paths[0]
  const focus = (path: string | undefined): void => {
    if (path !== undefined) elements.current.get(path)?.focus()
  }
  return {
    selected,
    focus,
    rowProps: (path) => ({
      ref: (element) => {
        if (element) elements.current.set(path, element)
        else elements.current.delete(path)
      },
      'aria-selected': selected === path,
      tabIndex: focusPath === path ? 0 : -1,
      onFocus: () => setSelected(path),
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
