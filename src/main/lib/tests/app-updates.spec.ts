import { EventEmitter } from 'node:events'
import type { AppUpdater, UpdateDownloadedEvent, UpdateCheckResult } from 'electron-updater'
import { afterEach, expect, it, vi } from 'vitest'
import { createAppUpdates } from '../app-updates'

class TestUpdater extends EventEmitter {
  checkForUpdates = vi.fn<AppUpdater['checkForUpdates']>().mockResolvedValue(null)
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
  expect(updates.getStatus()).toEqual({ version: '0.2.3', readyVersion: null })
  expect(onChange).not.toHaveBeenCalled()

  updater.emit('update-downloaded', update)
  expect(updates.getStatus()).toEqual({ version: '0.2.3', readyVersion: '0.2.4' })
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
  expect(updates.getStatus().readyVersion).toBeNull()
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)

  stop()
  expect(updater.listenerCount('update-downloaded')).toBe(0)
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
  expect(updates.getStatus().readyVersion).toBeNull()
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

  expect(updates.getStatus()).toEqual({ version: '0.2.3', readyVersion: null })
  expect(onChange).toHaveBeenLastCalledWith(updates.getStatus())
  expect(onError).toHaveBeenCalledWith(error)
  await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000)
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  stop()
})
