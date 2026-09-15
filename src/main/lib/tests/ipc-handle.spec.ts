import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, test, vi } from 'vitest'
import { UserFacingError } from '../fs-errors'
import { registerInvokeHandler } from '../ipc-handle'

type RegisteredListener = Parameters<IpcMain['handle']>[1]

interface FakeIpcMain {
  ipc: Pick<IpcMain, 'handle'>
  registeredListener: () => RegisteredListener
}

function fakeIpcMain(): FakeIpcMain {
  let listener: RegisteredListener | null = null
  return {
    ipc: {
      handle: (_channel, registered) => {
        listener = registered
      }
    },
    registeredListener: () => {
      if (!listener) throw new Error('No IPC listener was registered')
      return listener
    }
  }
}

// SAFETY: the registered listeners under test do not inspect the Electron event.
const event = {} as IpcMainInvokeEvent

describe('registerInvokeHandler', () => {
  test('rejects parse failures with a user-facing error', async () => {
    const fake = fakeIpcMain()
    const report = vi.fn()
    registerInvokeHandler(fake.ipc, 'setRoot', (_event, path) => path, report)

    await expect(fake.registeredListener()(event, '')).rejects.toEqual(
      new UserFacingError('Invalid location request')
    )
    expect(report).not.toHaveBeenCalled()
  })

  test('reports and rethrows unexpected listener errors', async () => {
    const fake = fakeIpcMain()
    const report = vi.fn()
    const fault = new Error('disk on fire')
    registerInvokeHandler(
      fake.ipc,
      'getRoot',
      () => {
        throw fault
      },
      report
    )

    await expect(fake.registeredListener()(event)).rejects.toBe(fault)
    expect(report).toHaveBeenCalledExactlyOnceWith(fault, 'root:get')
  })

  test('rethrows user-facing listener errors without reporting', async () => {
    const fake = fakeIpcMain()
    const report = vi.fn()
    const fault = new UserFacingError('Choose another folder')
    registerInvokeHandler(
      fake.ipc,
      'getRoot',
      () => {
        throw fault
      },
      report
    )

    await expect(fake.registeredListener()(event)).rejects.toBe(fault)
    expect(report).not.toHaveBeenCalled()
  })
})
