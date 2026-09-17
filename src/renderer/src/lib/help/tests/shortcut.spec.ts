import { describe, expect, it } from 'vitest'
import { formatShortcut, isShortcutToken } from '../shortcut'

describe('isShortcutToken', () => {
  it('only accepts spans that start with Mod+ and name a key', () => {
    expect(isShortcutToken('Mod+F')).toBe(true)
    expect(isShortcutToken('Mod+')).toBe(false)
    expect(isShortcutToken('meta.json')).toBe(false)
    expect(isShortcutToken('Ctrl+F')).toBe(false)
  })
})

describe('formatShortcut', () => {
  it('renders macOS glyphs in the conventional order without separators', () => {
    expect(formatShortcut('Mod+Shift+O', 'darwin')).toEqual({ label: '⇧⌘O', aria: 'Meta+Shift+O' })
    expect(formatShortcut('Mod+Shift+Alt+O', 'darwin')).toEqual({
      label: '⌥⇧⌘O',
      aria: 'Meta+Alt+Shift+O'
    })
    expect(formatShortcut('Mod+F', 'darwin')).toEqual({ label: '⌘F', aria: 'Meta+F' })
  })

  it('renders Ctrl first with plus separators on Windows and Linux', () => {
    expect(formatShortcut('Mod+Shift+O', 'win32')).toEqual({
      label: 'Ctrl+Shift+O',
      aria: 'Control+Shift+O'
    })
    expect(formatShortcut('Mod+Shift+Alt+O', 'linux')?.label).toBe('Ctrl+Alt+Shift+O')
  })

  it('returns null for spans that are not shortcuts or use unknown modifiers', () => {
    expect(formatShortcut('meta.json', 'darwin')).toBeNull()
    // The prefix is the contract: a span that starts with any other key stays code.
    expect(formatShortcut('Shift+Mod+O', 'darwin')).toBeNull()
    expect(formatShortcut('Mod+Hyper+F', 'darwin')).toBeNull()
    expect(formatShortcut('Mod+', 'win32')).toBeNull()
  })

  it('defaults to the current platform, which tests read as linux', () => {
    expect(formatShortcut('Mod+R')?.label).toBe('Ctrl+R')
  })
})
