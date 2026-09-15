import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import { updateDiagnosticsMenu } from '../diagnostics-menu'

const mocks = {
  item: { checked: false },
  currentItem: vi.fn()
}

function contents(): WebContents {
  // SAFETY: the updater compares WebContents identity only; no Electron methods are called.
  return new EventEmitter() as WebContents
}

beforeEach(() => {
  mocks.item.checked = false
  mocks.currentItem.mockReset().mockReturnValue(mocks.item)
})

it('validates diagnostics IPC sender and boolean before updating the menu', () => {
  const current = contents()
  updateDiagnosticsMenu(contents(), current, true, mocks.currentItem)
  for (const invalid of ['true', 1, null])
    updateDiagnosticsMenu(current, current, invalid, mocks.currentItem)
  expect(mocks.currentItem).not.toHaveBeenCalled()
  updateDiagnosticsMenu(current, current, true, mocks.currentItem)
  expect(mocks.item.checked).toBe(true)
  updateDiagnosticsMenu(current, current, false, mocks.currentItem)
  expect(mocks.item.checked).toBe(false)
})
