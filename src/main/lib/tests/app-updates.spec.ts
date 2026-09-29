import { EventEmitter } from 'node:events'
import type {
  AppUpdater,
  ProgressInfo,
  UpdateDownloadedEvent,
  UpdateCheckResult
} from 'electron-updater'
import { afterEach, expect, it, vi } from 'vitest'
import { createAppUpdates, updateCheckMessage } from '../app-updates'

class TestUpdater extends EventEmitter {
  checkForUpdates = vi.fn<AppUpdater['checkForUpdates']>().mockResolvedValue(null)
  quitAndInstall = vi.fn<AppUpdater['quitAndInstall']>()
}

function progress(percent: number): ProgressInfo {
  return { total: 100, delta: 1, transferred: percent, percent, bytesPerSecond: 1 }
}

const update: UpdateDownloadedEvent = {
  version: '0.2.4',
  files: [],
  releaseDate: '2026-09-17',
  path: 'update.zip',
  sha512: 'checksum',
  downloadedFile: '/tmp/update.zip'
}

afterEach(() => vi.useRealTimers())

it('keeps the installed version and marks an update ready only after download', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const onChange = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, vi.fn())
  const stop = updates.start(updater)

  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  updater.emit('update-available', update)
  expect(updates.getStatus().update).toEqual({ kind: 'checking' })

  updater.emit('update-downloaded', update)
  expect(updates.getStatus()).toEqual({
    version: '0.2.3',
    update: { kind: 'ready', version: '0.2.4' }
  })
  expect(onChange).toHaveBeenCalledWith(updates.getStatus())
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  stop()
})

it('retries failed checks on the schedule and removes listeners when stopped', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const error = new Error('Offline')
  updater.checkForUpdates.mockRejectedValueOnce(error)
  const onError = vi.fn()
  const updates = createAppUpdates('0.2.3', vi.fn(), onError)
  const stop = updates.start(updater)

  await vi.advanceTimersByTimeAsync(0)
  expect(onError).toHaveBeenCalledWith(error)
  expect(updates.getStatus().update).toEqual({ kind: 'idle' })
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)

  stop()
  expect(updater.listenerCount('update-downloaded')).toBe(0)
  expect(updater.listenerCount('download-progress')).toBe(0)
  expect(updater.listenerCount('error')).toBe(0)
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
})

it('waits for downloads and handles rejected downloads without reporting readiness', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const download = Promise.withResolvers<string[]>()
  const result: UpdateCheckResult = {
    isUpdateAvailable: true,
    versionInfo: update,
    updateInfo: update,
    downloadPromise: download.promise
  }
  updater.checkForUpdates.mockResolvedValueOnce(result)
  const onError = vi.fn()
  const updates = createAppUpdates('0.2.3', vi.fn(), onError)
  const stop = updates.start(updater)

  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  const error = new Error('Download interrupted')
  download.reject(error)
  await vi.advanceTimersByTimeAsync(0)
  expect(onError).toHaveBeenCalledWith(error)
  expect(updates.getStatus().update).toEqual({ kind: 'idle' })
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  stop()
})

it('clears readiness and retries if preparing the downloaded update fails', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const onChange = vi.fn()
  const onError = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, onError)
  const stop = updates.start(updater)

  updater.emit('update-downloaded', update)
  const error = new Error('Could not prepare the update')
  updater.emit('error', error)

  expect(updates.getStatus().update).toEqual({ kind: 'idle' })
  expect(onChange).toHaveBeenLastCalledWith(updates.getStatus())
  expect(onError).toHaveBeenCalledWith(error)
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  stop()
})

function availableResult(downloadPromise: Promise<string[]>): UpdateCheckResult {
  return { isUpdateAvailable: true, versionInfo: update, updateInfo: update, downloadPromise }
}

it('reports up to date when the check finds nothing newer', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const updates = createAppUpdates('0.2.3', vi.fn(), vi.fn())
  const stop = updates.start(updater)

  await expect(updates.checkNow()).resolves.toEqual({ kind: 'up-to-date' })
  const notAvailable: UpdateCheckResult = {
    isUpdateAvailable: false,
    versionInfo: update,
    updateInfo: update
  }
  updater.checkForUpdates.mockResolvedValueOnce(notAvailable)
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  await expect(updates.checkNow()).resolves.toEqual({ kind: 'up-to-date' })
  stop()
})

it('resolves a manual check as downloading before the download finishes', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const download = Promise.withResolvers<string[]>()
  updater.checkForUpdates.mockResolvedValueOnce(availableResult(download.promise))
  const updates = createAppUpdates('0.2.3', vi.fn(), vi.fn())
  const stop = updates.start(updater)

  await expect(updates.checkNow()).resolves.toEqual({ kind: 'downloading', version: '0.2.4' })
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  await expect(updates.checkNow()).resolves.toEqual({ kind: 'downloading', version: '0.2.4' })
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  download.resolve([])
  stop()
})

it('reports ready without checking again once an update has downloaded', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const updates = createAppUpdates('0.2.3', vi.fn(), vi.fn())
  const stop = updates.start(updater)
  await vi.advanceTimersByTimeAsync(0)

  updater.emit('update-downloaded', update)
  await expect(updates.checkNow()).resolves.toEqual({ kind: 'ready', version: '0.2.4' })
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  stop()
})

it('reports failed checks to the error handler and the manual caller', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const error = new Error('Offline')
  updater.checkForUpdates.mockRejectedValueOnce(error)
  const onError = vi.fn()
  const updates = createAppUpdates('0.2.3', vi.fn(), onError)
  const stop = updates.start(updater)

  await expect(updates.checkNow()).resolves.toEqual({ kind: 'failed', error })
  expect(onError).toHaveBeenCalledWith(error)
  stop()
})

it('shares one in-flight check between the scheduled and manual paths', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const check = Promise.withResolvers<UpdateCheckResult | null>()
  updater.checkForUpdates.mockReturnValueOnce(check.promise)
  const updates = createAppUpdates('0.2.3', vi.fn(), vi.fn())
  const stop = updates.start(updater)

  const first = updates.checkNow()
  const second = updates.checkNow()
  check.resolve(null)
  await expect(Promise.all([first, second])).resolves.toEqual([
    { kind: 'up-to-date' },
    { kind: 'up-to-date' }
  ])
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  stop()
})

it('is unavailable before start and after stop', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const updates = createAppUpdates('0.2.3', vi.fn(), vi.fn())

  await expect(updates.checkNow()).resolves.toEqual({ kind: 'unavailable' })
  const stop = updates.start(updater)
  stop()
  await expect(updates.checkNow()).resolves.toEqual({ kind: 'unavailable' })
  expect(updater.checkForUpdates).toHaveBeenCalledOnce()
})

it.each<[Parameters<typeof updateCheckMessage>[0], object]>([
  [
    { kind: 'up-to-date' },
    {
      type: 'info',
      message: "You're up to date",
      detail: 'GoBowling Leagues 0.2.3 is the latest version.'
    }
  ],
  [
    { kind: 'failed', error: new Error('Offline') },
    {
      type: 'error',
      message: 'Could not check for updates',
      detail: 'Check your internet connection and try again.'
    }
  ],
  [
    { kind: 'unavailable' },
    {
      type: 'info',
      message: 'Updates are unavailable',
      detail: 'This build of GoBowling Leagues does not update automatically.'
    }
  ]
])('describes the %j outcome for the dialog', (outcome, expected) => {
  expect(updateCheckMessage(outcome, '0.2.3')).toEqual(expected)
})

function phases(onChange: ReturnType<typeof vi.fn>): unknown[] {
  return onChange.mock.calls.map(([status]) => status.update)
}

it('moves through checking, downloading with progress and ready', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const download = Promise.withResolvers<string[]>()
  updater.checkForUpdates.mockResolvedValueOnce(availableResult(download.promise))
  const onChange = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, vi.fn())
  const stop = updates.start(updater)

  expect(updates.getStatus().update).toEqual({ kind: 'checking' })
  await vi.advanceTimersByTimeAsync(0)
  expect(updates.getStatus().update).toEqual({
    kind: 'downloading',
    version: '0.2.4',
    percent: null
  })
  updater.emit('download-progress', progress(42.6))
  expect(updates.getStatus().update).toEqual({
    kind: 'downloading',
    version: '0.2.4',
    percent: 42
  })
  updater.emit('update-downloaded', update)
  download.resolve([])
  await vi.advanceTimersByTimeAsync(0)

  expect(phases(onChange)).toEqual([
    { kind: 'checking' },
    { kind: 'downloading', version: '0.2.4', percent: null },
    { kind: 'downloading', version: '0.2.4', percent: 42 },
    { kind: 'ready', version: '0.2.4' }
  ])
  stop()
})

it('returns to idle when nothing newer exists', async () => {
  vi.useFakeTimers()
  const onChange = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, vi.fn())
  const stop = updates.start(new TestUpdater())
  await vi.advanceTimersByTimeAsync(0)

  expect(phases(onChange)).toEqual([{ kind: 'checking' }, { kind: 'idle' }])
  stop()
})

it('only reports progress when the whole-number percent changes', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const download = Promise.withResolvers<string[]>()
  updater.checkForUpdates.mockResolvedValueOnce(availableResult(download.promise))
  const onChange = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, vi.fn())
  const stop = updates.start(updater)
  await vi.advanceTimersByTimeAsync(0)
  onChange.mockClear()

  for (const percent of [0.1, 0.4, 0.9, 1.0, 1.7, 1.99, 2.0]) {
    updater.emit('download-progress', progress(percent))
  }

  expect(onChange.mock.calls.map(([status]) => status.update.percent)).toEqual([0, 1, 2])
  download.resolve([])
  stop()
})

it('ignores progress outside a download', () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const onChange = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, vi.fn())
  const stop = updates.start(updater)
  updater.emit('update-downloaded', update)
  onChange.mockClear()

  updater.emit('download-progress', progress(50))

  expect(onChange).not.toHaveBeenCalled()
  stop()
})

it('returns to idle when a download fails midway', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const download = Promise.withResolvers<string[]>()
  updater.checkForUpdates.mockResolvedValueOnce(availableResult(download.promise))
  const onChange = vi.fn()
  const updates = createAppUpdates('0.2.3', onChange, vi.fn())
  const stop = updates.start(updater)
  await vi.advanceTimersByTimeAsync(0)
  updater.emit('download-progress', progress(30))

  download.reject(new Error('Connection lost'))
  await vi.advanceTimersByTimeAsync(0)

  expect(updates.getStatus().update).toEqual({ kind: 'idle' })
  stop()
})

it('installs only once an update is ready', async () => {
  vi.useFakeTimers()
  const updater = new TestUpdater()
  const updates = createAppUpdates('0.2.3', vi.fn(), vi.fn())
  expect(updates.install()).toBe(false)
  const stop = updates.start(updater)
  await vi.advanceTimersByTimeAsync(0)

  expect(updates.install()).toBe(false)
  expect(updater.quitAndInstall).not.toHaveBeenCalled()
  updater.emit('update-downloaded', update)
  expect(updates.install()).toBe(true)
  expect(updater.quitAndInstall).toHaveBeenCalledOnce()

  stop()
  expect(updates.install()).toBe(false)
})
