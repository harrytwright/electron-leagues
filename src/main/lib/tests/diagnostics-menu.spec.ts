import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  registerDiagnosticsIpc,
  watchDiagnosticsLoads,
  type DiagnosticsIpc
} from '../diagnostics-menu'

const mocks = {
  item: { checked: false },
  currentItem: vi.fn(),
  on: vi.fn<DiagnosticsIpc['on']>()
}

function contents(): WebContents {
  // SAFETY: these handlers only use event subscription and WebContents identity, supplied by EventEmitter.
  return new EventEmitter() as WebContents
}

beforeEach(() => {
  mocks.on.mockReset()
  mocks.item.checked = false
  mocks.currentItem.mockReset().mockReturnValue(mocks.item)
})

it('validates diagnostics IPC sender and boolean before updating the menu', () => {
  const current = contents()
  registerDiagnosticsIpc(mocks, () => current, mocks.currentItem)
  expect(mocks.on).toHaveBeenCalledWith('diagnostics:changed', expect.any(Function))
  const report = mocks.on.mock.calls[0][1]
  report({ sender: contents() }, true)
  for (const invalid of ['true', 1, null]) report({ sender: current }, invalid)
  expect(mocks.currentItem).not.toHaveBeenCalled()
  report({ sender: current }, true)
  expect(mocks.item.checked).toBe(true)
  report({ sender: current }, false)
  expect(mocks.item.checked).toBe(false)
})

it('reapplies the renderer report on every load without accepting old-window reports', () => {
  const first = contents()
  let current = first
  registerDiagnosticsIpc(mocks, () => current, mocks.currentItem)
  watchDiagnosticsLoads(first, () => current, mocks.currentItem)
  const report = mocks.on.mock.calls[0][1]
  report({ sender: first }, true)
  mocks.item.checked = false
  first.emit('did-finish-load')
  expect(mocks.item.checked).toBe(true)
  mocks.item.checked = false
  first.emit('did-finish-load')
  expect(mocks.item.checked).toBe(true)

  current = contents()
  watchDiagnosticsLoads(current, () => current, mocks.currentItem)
  report({ sender: current }, false)
  first.emit('did-finish-load')
  report({ sender: first }, true)
  expect(mocks.item.checked).toBe(false)
})
