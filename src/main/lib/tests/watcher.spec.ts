import { EventEmitter } from 'node:events'
import type { ChokidarOptions } from 'chokidar'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createRootWatcher,
  type RootWatcherOptions,
  type WatchFactory,
  type WatchSource
} from '../watcher'

class FakeWatcher extends EventEmitter implements WatchSource {
  close = vi.fn<() => Promise<void>>(() => Promise.resolve())
}

type WatchCall = {
  root: string
  options: ChokidarOptions
}

type Harness = {
  calls: WatchCall[]
  factory: ReturnType<typeof vi.fn<WatchFactory>>
  watchers: FakeWatcher[]
  onChange: ReturnType<typeof vi.fn<() => void>>
  onError: ReturnType<typeof vi.fn<RootWatcherOptions['onError']>>
}

function createHarness(): Harness {
  const calls: WatchCall[] = []
  const watchers: FakeWatcher[] = []
  const onChange = vi.fn<() => void>()
  const onError = vi.fn<RootWatcherOptions['onError']>()
  const factory = vi.fn<WatchFactory>((root, options) => {
    calls.push({ root, options })
    const watcher = new FakeWatcher()
    watchers.push(watcher)
    return watcher
  })
  return { calls, factory, watchers, onChange, onError }
}

function requiredWatcher(watchers: FakeWatcher[], index: number): FakeWatcher {
  const watcher = watchers[index]
  if (!watcher) throw new Error(`Missing fake watcher at index ${index}`)
  return watcher
}

function permissionError(): NodeJS.ErrnoException {
  return Object.assign(new Error('EPERM: operation not permitted, watch x'), { code: 'EPERM' })
}

describe('createRootWatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('falls back to polling after a native permission error', async () => {
    const harness = createHarness()
    createRootWatcher('/leagues', {
      watch: harness.factory,
      onChange: harness.onChange,
      onError: harness.onError
    })
    const nativeWatcher = requiredWatcher(harness.watchers, 0)

    nativeWatcher.emit('error', permissionError())
    await vi.runAllTimersAsync()

    expect(harness.calls).toHaveLength(2)
    expect(harness.calls[1]).toEqual({
      root: '/leagues',
      options: {
        ignoreInitial: true,
        depth: 6,
        usePolling: true,
        interval: 2000,
        ignorePermissionErrors: true
      }
    })
    expect(nativeWatcher.close).toHaveBeenCalledOnce()
    expect(harness.onError).not.toHaveBeenCalled()

    nativeWatcher.emit('error', new Error('Late native error'))
    expect(harness.calls).toHaveLength(2)
    expect(harness.onError).not.toHaveBeenCalled()
  })

  test('reports a polling permission error without retrying', async () => {
    const harness = createHarness()
    createRootWatcher('/leagues', {
      watch: harness.factory,
      onChange: harness.onChange,
      onError: harness.onError
    })
    requiredWatcher(harness.watchers, 0).emit('error', permissionError())
    await vi.runAllTimersAsync()

    const pollingError = permissionError()
    requiredWatcher(harness.watchers, 1).emit('error', pollingError)

    expect(harness.onError).toHaveBeenCalledOnce()
    expect(harness.onError).toHaveBeenCalledWith(pollingError, 'polling')
    expect(harness.calls).toHaveLength(2)
  })

  test('reports a native non-permission error without retrying', () => {
    const harness = createHarness()
    createRootWatcher('/leagues', {
      watch: harness.factory,
      onChange: harness.onChange,
      onError: harness.onError
    })
    const error = Object.assign(new Error('No space for watches'), { code: 'ENOSPC' })

    requiredWatcher(harness.watchers, 0).emit('error', error)

    expect(harness.onError).toHaveBeenCalledOnce()
    expect(harness.onError).toHaveBeenCalledWith(error, 'native')
    expect(harness.calls).toHaveLength(1)
  })

  test('debounces bursts of change events', async () => {
    const harness = createHarness()
    createRootWatcher('/leagues', {
      watch: harness.factory,
      onChange: harness.onChange,
      onError: harness.onError,
      debounceMs: 500
    })
    const nativeWatcher = requiredWatcher(harness.watchers, 0)

    nativeWatcher.emit('all')
    await vi.advanceTimersByTimeAsync(200)
    nativeWatcher.emit('all')
    await vi.advanceTimersByTimeAsync(200)
    nativeWatcher.emit('all')
    await vi.advanceTimersByTimeAsync(499)
    expect(harness.onChange).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.onChange).toHaveBeenCalledOnce()

    nativeWatcher.emit('all')
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.onChange).toHaveBeenCalledTimes(2)
  })

  test('resolves close and reports an underlying close rejection', async () => {
    const harness = createHarness()
    const closeError = new Error('Failed to close')
    const rootWatcher = createRootWatcher('/leagues', {
      watch: harness.factory,
      onChange: harness.onChange,
      onError: harness.onError
    })
    requiredWatcher(harness.watchers, 0).close.mockRejectedValue(closeError)
    requiredWatcher(harness.watchers, 0).emit('all')

    await expect(rootWatcher.close()).resolves.toBeUndefined()
    await vi.runAllTimersAsync()
    expect(harness.onError).toHaveBeenCalledWith(closeError, 'native')
    expect(harness.onChange).not.toHaveBeenCalled()
  })

  test('does not start polling when closed during the fallback switch', async () => {
    const harness = createHarness()
    const nativeClose = Promise.withResolvers<void>()
    const rootWatcher = createRootWatcher('/leagues', {
      watch: harness.factory,
      onChange: harness.onChange,
      onError: harness.onError
    })
    const nativeWatcher = requiredWatcher(harness.watchers, 0)
    nativeWatcher.close.mockReturnValue(nativeClose.promise)

    nativeWatcher.emit('error', permissionError())
    const closing = rootWatcher.close()
    nativeClose.resolve()
    await closing

    expect(harness.calls).toHaveLength(1)
    expect(nativeWatcher.close).toHaveBeenCalledOnce()
  })
})
