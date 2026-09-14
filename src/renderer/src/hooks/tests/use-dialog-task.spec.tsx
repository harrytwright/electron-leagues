import { useRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import { expect, it, vi, type Mock } from 'vitest'
import {
  dialogTaskReducer,
  useDialogTask,
  type DialogTask,
  type DialogTaskPhase,
  type DialogTaskState
} from '../use-dialog-task'

const PHASES: DialogTaskPhase[] = ['idle', 'busy', 'failed', 'moved']

function stateFor(phase: DialogTaskPhase, error: string | null = null): DialogTaskState {
  return { phase, error }
}

it.each(PHASES)('opened resets %s to idle with no error', (phase) => {
  expect(dialogTaskReducer(stateFor(phase, 'stale'), { type: 'opened' })).toEqual({
    phase: 'idle',
    error: null
  })
})

it.each(PHASES)('submitted moves %s to busy with no error', (phase) => {
  expect(dialogTaskReducer(stateFor(phase, 'stale'), { type: 'submitted' })).toEqual({
    phase: 'busy',
    error: null
  })
})

it.each(PHASES)('failed moves %s to failed carrying the message', (phase) => {
  expect(dialogTaskReducer(stateFor(phase), { type: 'failed', error: 'boom' })).toEqual({
    phase: 'failed',
    error: 'boom'
  })
})

it.each(PHASES)('completed moves %s to idle with no error', (phase) => {
  expect(dialogTaskReducer(stateFor(phase, 'stale'), { type: 'completed' })).toEqual({
    phase: 'idle',
    error: null
  })
})

it.each(PHASES)('moved carries a null error from %s', (phase) => {
  expect(dialogTaskReducer(stateFor(phase), { type: 'moved', error: null })).toEqual({
    phase: 'moved',
    error: null
  })
})

it.each(PHASES)('moved carries a qualified refresh error from %s', (phase) => {
  expect(dialogTaskReducer(stateFor(phase), { type: 'moved', error: 'refresh failed' })).toEqual({
    phase: 'moved',
    error: 'refresh failed'
  })
})

it('edited clears a failure back to idle', () => {
  expect(dialogTaskReducer(stateFor('failed', 'boom'), { type: 'edited' })).toEqual({
    phase: 'idle',
    error: null
  })
})

it.each<DialogTaskPhase>(['idle', 'busy', 'moved'])(
  'edited clears the error but leaves the %s phase alone',
  (phase) => {
    expect(dialogTaskReducer(stateFor(phase, 'stray'), { type: 'edited' })).toEqual({
      phase,
      error: null
    })
  }
)

interface HarnessProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resetKey?: string | null
}

function Harness({
  open,
  onOpenChange,
  resetKey,
  capture
}: HarnessProps & { capture: (task: DialogTask) => void }): React.JSX.Element {
  const fieldRef = useRef<HTMLInputElement>(null)
  const task = useDialogTask({ open, onOpenChange, fieldRef, resetKey })
  capture(task)
  return <input ref={fieldRef} aria-label="field" />
}

type RenderTaskOptions = Partial<Omit<HarnessProps, 'onOpenChange'>> & {
  onOpenChange?: Mock<HarnessProps['onOpenChange']>
}

class TaskHolder {
  #task: DialogTask | null = null

  capture = (task: DialogTask): void => {
    this.#task = task
  }

  get task(): DialogTask {
    if (!this.#task) throw new Error('Harness has not captured a task yet')
    return this.#task
  }
}

interface TaskHarness {
  holder: TaskHolder
  onOpenChange: Mock<HarnessProps['onOpenChange']>
  input: HTMLInputElement
  rerender: (next: Partial<HarnessProps>) => void
}

function renderTask(overrides: RenderTaskOptions = {}): TaskHarness {
  const holder = new TaskHolder()
  const onOpenChange = overrides.onOpenChange ?? vi.fn<HarnessProps['onOpenChange']>()
  const props: HarnessProps = { open: true, onOpenChange, resetKey: undefined, ...overrides }
  const view = render(<Harness {...props} capture={holder.capture} />)
  return {
    holder,
    onOpenChange,
    // SAFETY: the Harness always renders a single <input> for this label.
    input: screen.getByLabelText('field') as HTMLInputElement,
    rerender: (next) => {
      const merged = { ...props, ...next }
      view.rerender(<Harness {...merged} capture={holder.capture} />)
    }
  }
}

it('resets to idle when the dialog transitions from closed to open', () => {
  const { holder, rerender } = renderTask({ open: true })
  act(() => holder.task.reject('bad name'))
  expect(holder.task.phase).toBe('failed')

  rerender({ open: false })
  rerender({ open: true })

  expect(holder.task.phase).toBe('idle')
  expect(holder.task.error).toBeNull()
})

it('bumps the ticket on a resetKey change so a stale settle is ignored', () => {
  const { holder, rerender } = renderTask({ resetKey: 'a' })
  let ticket!: number
  act(() => {
    ticket = holder.task.begin()
  })

  rerender({ resetKey: 'b' })
  expect(holder.task.isCurrent(ticket)).toBe(false)

  act(() => holder.task.settle(ticket, { type: 'failed', error: 'stale' }))

  expect(holder.task.phase).toBe('idle')
  expect(holder.task.error).toBeNull()
})

it('reject records a failed phase and focuses the field', () => {
  const { holder, input } = renderTask()

  act(() => holder.task.reject('bad name'))

  expect(holder.task.phase).toBe('failed')
  expect(holder.task.error).toBe('bad name')
  expect(input).toHaveFocus()
})

it('a failed settle focuses the field', () => {
  const { holder, input } = renderTask()
  let ticket!: number
  act(() => {
    ticket = holder.task.begin()
  })

  act(() => holder.task.settle(ticket, { type: 'failed', error: 'boom' }))

  expect(holder.task.phase).toBe('failed')
  expect(holder.task.error).toBe('boom')
  expect(input).toHaveFocus()
})

it('refuses to close while busy but allows it once settled', () => {
  const onOpenChange = vi.fn()
  const { holder } = renderTask({ onOpenChange })
  let ticket!: number
  act(() => {
    ticket = holder.task.begin()
  })

  act(() => holder.task.handleOpenChange(false))
  expect(onOpenChange).not.toHaveBeenCalled()

  act(() => holder.task.handleOpenChange(true))
  expect(onOpenChange).toHaveBeenCalledWith(true)

  act(() => holder.task.settle(ticket, { type: 'completed' }))
  act(() => holder.task.handleOpenChange(false))

  expect(onOpenChange).toHaveBeenCalledWith(false)
})
