import { useId, useState } from 'react'
interface State {
  anchor: { left: number; top: number }
  target: string | null
}

const CLOSED: State = { anchor: { left: 0, top: 0 }, target: null }

interface RowActionsMenu {
  id: string
  target: string | null
  anchor: State['anchor']
  onOpenChange: (open: boolean) => void
  openAt: (target: string, anchor: State['anchor']) => void
}

export function useRowActionsMenu(paths: readonly string[]): RowActionsMenu {
  const id = useId()
  const [state, setState] = useState<State>(CLOSED)
  // Clear the target, not just the popup's open prop: a returning row must not
  // resurrect a menu that disappeared during a refresh or filter change.
  if (state.target !== null && !paths.includes(state.target)) setState(CLOSED)
  return {
    id,
    target: state.target,
    anchor: state.anchor,
    onOpenChange: (open) => {
      if (!open) setState(CLOSED)
    },
    openAt: (target, anchor) => {
      setState({ target, anchor })
    }
  }
}
