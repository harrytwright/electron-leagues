import { describe, expect, test } from 'vitest'
import { loadDiagnosticsEnabled, saveDiagnosticsEnabled } from '../diagnostics-store'

describe('diagnostics preference', () => {
  test('is default-off, versioned and guarded', () => {
    expect(loadDiagnosticsEnabled()).toBe(false)
    saveDiagnosticsEnabled(true)
    expect(localStorage.getItem('leagues:diagnostics:v1')).toBe('{"enabled":true}')
    expect(loadDiagnosticsEnabled()).toBe(true)
    localStorage.setItem('leagues:diagnostics:v1', JSON.stringify({ enabled: 'yes' }))
    expect(loadDiagnosticsEnabled()).toBe(false)
  })
})
