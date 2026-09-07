import { describe, expect, it } from 'vitest'
import { appCommandForInput, installAppShortcuts, type ShortcutInput } from '../app-shortcuts'
import { vi } from 'vitest'

const input = (overrides: Partial<ShortcutInput> = {}): ShortcutInput => ({
  type: 'keyDown',
  key: 'r',
  control: true,
  meta: false,
  alt: false,
  shift: false,
  isAutoRepeat: false,
  isComposing: false,
  ...overrides
})

it('prevents the owned accelerator and forwards exactly one typed command', () => {
  let listener!: (event: { preventDefault: () => void }, input: ShortcutInput) => void
  const send = vi.fn()
  installAppShortcuts(
    {
      on: (_channel, next) => {
        listener = next
      },
      send
    },
    'linux'
  )
  const preventDefault = vi.fn()
  listener({ preventDefault }, input())
  listener({ preventDefault }, input({ type: 'keyUp' }))
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(send).toHaveBeenCalledExactlyOnceWith('app:command', {
    command: 'refresh',
    repeat: false,
    composing: false
  })
})

describe('appCommandForInput', () => {
  it('maps the three exact Windows/Linux application shortcuts', () => {
    expect(appCommandForInput(input({ key: 'O' }), 'win32')?.command).toBe('open-location')
    expect(appCommandForInput(input(), 'linux')?.command).toBe('refresh')
    expect(appCommandForInput(input({ key: 'f' }), 'win32')?.command).toBe('focus-filter')
  })

  it('uses Command alone on macOS', () => {
    expect(appCommandForInput(input({ control: false, meta: true }), 'darwin')?.command).toBe(
      'refresh'
    )
    expect(appCommandForInput(input(), 'darwin')).toBeNull()
  })

  it('rejects additional modifiers and unrelated native shortcuts', () => {
    expect(appCommandForInput(input({ shift: true }), 'linux')).toBeNull()
    expect(appCommandForInput(input({ alt: true }), 'linux')).toBeNull()
    expect(appCommandForInput(input({ key: 'x' }), 'linux')).toBeNull()
    expect(appCommandForInput(input({ type: 'keyUp' }), 'linux')).toBeNull()
  })

  it('preserves repeat and composition boundary state for renderer guards', () => {
    expect(
      appCommandForInput(input({ isAutoRepeat: true, isComposing: true }), 'linux')
    ).toMatchObject({ repeat: true, composing: true })
  })
})
