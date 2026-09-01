import { afterEach, expect, test } from 'vitest'
import { revealLabel } from '../reveal-label'
import { trashLabel } from '../trash-label'

function pretendPlatform(platform: string): void {
  Object.defineProperty(window, 'electron', {
    value: { process: { platform } },
    configurable: true,
    writable: true
  })
}

afterEach(() => {
  // SAFETY: tests never define the bridge otherwise; removing it restores the default.
  delete (window as { electron?: unknown }).electron
})

test.each([
  ['darwin', 'Show in Finder', 'Trash'],
  ['win32', 'Show in Explorer', 'Recycle Bin'],
  ['linux', 'Show in file manager', 'trash']
])('labels for %s', (platform, reveal, trash) => {
  pretendPlatform(platform)
  expect(revealLabel()).toBe(reveal)
  expect(trashLabel()).toBe(trash)
})

test('reads as linux when the bridge is absent', () => {
  expect(revealLabel()).toBe('Show in file manager')
})
