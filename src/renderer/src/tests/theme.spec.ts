import { describe, expect, it } from 'vitest'
import { watchSystemTheme } from '../theme'
import { setSystemDark } from './setup'

describe('watchSystemTheme', () => {
  it('sets data-mode="dark" when the OS is dark', () => {
    setSystemDark(true)
    const stop = watchSystemTheme()
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark')
    stop()
  })

  it('removes data-mode when the OS turns light', () => {
    setSystemDark(true)
    const stop = watchSystemTheme()
    setSystemDark(false)
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false)
    stop()
  })

  it('follows a light-to-dark change', () => {
    setSystemDark(false)
    const stop = watchSystemTheme()
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false)
    setSystemDark(true)
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark')
    stop()
  })

  it('stops following changes after cleanup', () => {
    setSystemDark(false)
    const stop = watchSystemTheme()
    stop()
    setSystemDark(true)
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false)
  })
})
