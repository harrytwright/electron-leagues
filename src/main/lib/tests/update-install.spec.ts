import { describe, expect, it, vi } from 'vitest'
import { createQuitFlush, createUpdateInstaller, type UpdateInstaller } from '../update-install'

interface Setup {
  calls: string[]
  state: { ready: boolean; busy: boolean }
  installer: UpdateInstaller
  onInstallFailed: () => void
}

function setup({ ready = true, busy = false, installs = true } = {}): Setup {
  const calls: string[] = []
  const state = { ready, busy }
  const onInstallFailed = vi.fn()
  const installer = createUpdateInstaller({
    isReady: () => state.ready,
    isFileOperationRunning: () => state.busy,
    flushBeforeQuit: () => {
      calls.push('flush')
      return Promise.resolve()
    },
    install: () => {
      calls.push('install')
      return installs
    },
    onInstallFailed
  })
  return { calls, state, installer, onInstallFailed }
}

describe('createUpdateInstaller', () => {
  it('does nothing when the update is not ready', async () => {
    const { calls, installer } = setup({ ready: false })
    expect(await installer.request()).toBe('not-ready')
    expect(calls).toEqual([])
  })

  it('does nothing while a file operation is running', async () => {
    const { calls, installer } = setup({ busy: true })
    expect(await installer.request()).toBe('busy')
    expect(calls).toEqual([])
  })

  it('installs once the operation has finished', async () => {
    const { calls, state, installer } = setup({ busy: true })
    await installer.request()
    state.busy = false
    expect(await installer.request()).toBe('installing')
    expect(calls).toEqual(['flush', 'install'])
  })

  it('flushes before installing', async () => {
    const { calls, installer } = setup()
    expect(await installer.request()).toBe('installing')
    expect(calls).toEqual(['flush', 'install'])
  })

  it('ignores repeat requests until the phase leaves ready', async () => {
    const { calls, state, installer } = setup()
    await installer.request()
    expect(await installer.request()).toBe('already-requested')
    expect(calls).toEqual(['flush', 'install'])

    state.ready = false
    installer.phaseChanged()
    state.ready = true
    expect(await installer.request()).toBe('installing')
    expect(calls).toEqual(['flush', 'install', 'flush', 'install'])
  })

  it('reports a refused install once', async () => {
    const { installer, onInstallFailed } = setup({ installs: false })
    expect(await installer.request()).toBe('failed')
    installer.updaterFailed()
    expect(onInstallFailed).toHaveBeenCalledOnce()
  })

  it('reports an updater error after the flush once', async () => {
    const { installer, onInstallFailed } = setup()
    await installer.request()
    installer.updaterFailed()
    installer.updaterFailed()
    expect(onInstallFailed).toHaveBeenCalledOnce()
  })

  it('ignores an updater error before any request', () => {
    const { installer, onInstallFailed } = setup()
    installer.updaterFailed()
    expect(onInstallFailed).not.toHaveBeenCalled()
  })

  it('ignores an updater error while the flush is still running', async () => {
    const onInstallFailed = vi.fn()
    let finishFlush = (): void => {}
    const installer = createUpdateInstaller({
      isReady: () => true,
      isFileOperationRunning: () => false,
      flushBeforeQuit: () =>
        new Promise<void>((resolve) => {
          finishFlush = resolve
        }),
      install: () => true,
      onInstallFailed
    })
    const request = installer.request()
    installer.updaterFailed()
    finishFlush()
    await request
    expect(onInstallFailed).not.toHaveBeenCalled()
  })
})

describe('createQuitFlush', () => {
  it('shares one flush between an install request and an ordinary quit', async () => {
    let finishShutDown = (): void => {}
    const shutDown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishShutDown = resolve
        })
    )
    const quitFlush = createQuitFlush(shutDown)
    const installer = createUpdateInstaller({
      isReady: () => true,
      isFileOperationRunning: () => false,
      flushBeforeQuit: quitFlush.flush,
      install: () => true,
      onInstallFailed: vi.fn()
    })
    const event = { preventDefault: vi.fn() }
    const quit = vi.fn()

    const request = installer.request()
    quitFlush.beforeQuit(event, quit)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()

    finishShutDown()
    expect(await request).toBe('installing')
    await Promise.resolve()
    expect(shutDown).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  })

  it('lets quits through once flushed', async () => {
    const shutDown = vi.fn(() => Promise.resolve())
    const quitFlush = createQuitFlush(shutDown)
    await quitFlush.flush()
    const event = { preventDefault: vi.fn() }
    const quit = vi.fn()

    quitFlush.beforeQuit(event, quit)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
    expect(shutDown).toHaveBeenCalledOnce()
  })
})
