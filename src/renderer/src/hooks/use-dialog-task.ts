import { useEffect, useReducer, useRef, useState, type RefObject } from 'react'

export type DialogTaskPhase = 'idle' | 'busy' | 'failed' | 'moved'

export interface DialogTaskState {
  phase: DialogTaskPhase
  error: string | null
}

export type DialogTaskAction =
  | { type: 'opened' }
  | { type: 'submitted' }
  | { type: 'failed'; error: string }
  | { type: 'completed' }
  // Delete only: the write is done, the dialog stays open; an error is the qualified refresh message.
  | { type: 'moved'; error: string | null }
  | { type: 'edited' }

const IDLE: DialogTaskState = { phase: 'idle', error: null }

export function dialogTaskReducer(
  state: DialogTaskState,
  action: DialogTaskAction
): DialogTaskState {
  switch (action.type) {
    case 'opened':
      return IDLE
    case 'submitted':
      return { phase: 'busy', error: null }
    case 'failed':
      return { phase: 'failed', error: action.error }
    case 'completed':
      return IDLE
    case 'moved':
      return { phase: 'moved', error: action.error }
    case 'edited':
      return state.phase === 'failed' ? IDLE : { ...state, error: null }
  }
}

export interface DialogTaskOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focused whenever a failure is recorded for the current submission. */
  fieldRef: RefObject<HTMLInputElement | null>
  /** Extra key whose change also resets the lifecycle, e.g. the delete target's path. */
  resetKey?: string | null
}

export interface DialogTask {
  phase: DialogTaskPhase
  busy: boolean
  moved: boolean
  error: string | null
  /** Marks a new submission and returns its ticket. */
  begin: () => number
  /** True while `ticket` is the latest submission for this open dialog. */
  isCurrent: (ticket: number) => boolean
  /** Applies an outcome for `ticket`; stale tickets are ignored; a failure focuses the field. */
  settle: (
    ticket: number,
    action: Exclude<DialogTaskAction, { type: 'opened' | 'submitted' | 'edited' }>
  ) => void
  /** Validation failure before any submission; focuses the field. */
  reject: (error: string) => void
  edited: () => void
  handleOpenChange: (next: boolean) => void
}

export function useDialogTask(options: DialogTaskOptions): DialogTask {
  const { open, onOpenChange, fieldRef, resetKey } = options
  const [state, dispatch] = useReducer(dialogTaskReducer, IDLE)
  const [trackedOpen, setTrackedOpen] = useState(open)
  const [trackedResetKey, setTrackedResetKey] = useState(resetKey)
  const submission = useRef(0)

  if (trackedOpen !== open || trackedResetKey !== resetKey) {
    setTrackedOpen(open)
    setTrackedResetKey(resetKey)
    dispatch({ type: 'opened' })
  }

  // The render-time reset above corrects the visible phase immediately; the ticket
  // only needs to invalidate a pending outcome before it is next read, so bumping it
  // once the transition has committed keeps this ref mutation out of the render body.
  useEffect(() => {
    submission.current += 1
  }, [open, resetKey])

  // A submission left pending when the dialog unmounts entirely (rather than just
  // closing) gets no further render to invalidate it through the effect above.
  useEffect(() => {
    return () => {
      submission.current += 1
    }
  }, [])

  const isCurrent = (ticket: number): boolean => submission.current === ticket

  const begin = (): number => {
    const ticket = (submission.current += 1)
    dispatch({ type: 'submitted' })
    return ticket
  }

  const settle: DialogTask['settle'] = (ticket, action) => {
    if (!isCurrent(ticket)) return
    dispatch(action)
    if (action.type === 'failed' || (action.type === 'moved' && action.error)) {
      fieldRef.current?.focus()
    }
  }

  const reject = (error: string): void => {
    dispatch({ type: 'failed', error })
    fieldRef.current?.focus()
  }

  const edited = (): void => dispatch({ type: 'edited' })

  const handleOpenChange = (next: boolean): void => {
    if (state.phase === 'busy' && !next) return
    onOpenChange(next)
  }

  return {
    phase: state.phase,
    busy: state.phase === 'busy',
    moved: state.phase === 'moved',
    error: state.error,
    begin,
    isCurrent,
    settle,
    reject,
    edited,
    handleOpenChange
  }
}
