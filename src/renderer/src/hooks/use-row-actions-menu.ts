import { useId, useState } from 'react'
interface State {
  anchor: { left: number; top: number }
  target: string | null
  restoreFocus: HTMLElement | null
}

const CLOSED: State = { anchor: { left: 0, top: 0 }, target: null, restoreFocus: null }

interface RowActionsMenu {
  id: string
  target: string | null
  anchor: State['anchor']
  onOpenChange: (open: boolean) => void
  openAt: (target: string, anchor: State['anchor'], restoreFocus: HTMLElement) => void
}

export function useRowActionsMenu(paths: readonly string[]): RowActionsMenu {
  const id = useId()
  const [state, setState] = useState<State>(CLOSED)
  // Clear the target, not just the popup's open prop: a returning row must not
  // resurrect a menu that disappeared during a refresh or filter change.
  if (state.target !== null && !paths.includes(state.target)) setState(CLOSED)
  const close = (): void => {
    const restoreFocus = state.restoreFocus
    setState(CLOSED)
    queueMicrotask(() => {
      if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) restoreFocus?.focus()
    })
  }

  return {
    id,
    target: state.target,
    anchor: state.anchor,
    onOpenChange: (open) => {
      if (!open) close()
    },
    openAt: (target, anchor, restoreFocus) => setState({ target, anchor, restoreFocus })
  }
}
