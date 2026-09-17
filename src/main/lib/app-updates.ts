import type { AppUpdater, UpdateDownloadedEvent } from 'electron-updater'
import type { AppUpdateStatus } from '../../shared/app-update'

interface UpdateSource {
  checkForUpdates: AppUpdater['checkForUpdates']
  on(event: 'update-downloaded', listener: (update: UpdateDownloadedEvent) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  removeListener(
    event: 'update-downloaded',
    listener: (update: UpdateDownloadedEvent) => void
  ): void
  removeListener(event: 'error', listener: (error: Error) => void): void
}

export interface AppUpdates {
  getStatus: () => AppUpdateStatus
  start: (updater: UpdateSource) => () => void
}

export function createAppUpdates(
  version: string,
  onChange: (status: AppUpdateStatus) => void,
  onError: (error: Error) => void
): AppUpdates {
  let status: AppUpdateStatus = { version, readyVersion: null }

  return {
    getStatus: () => status,
    start(updater) {
      let checking = false
      const reportError = (error: Error): void => {
        if (status.readyVersion) {
          status = { version, readyVersion: null }
          onChange(status)
        }
        onError(error)
      }
      const onDownloaded = (update: UpdateDownloadedEvent): void => {
        status = { version, readyVersion: update.version }
        onChange(status)
      }
      const check = async (): Promise<void> => {
        if (checking || status.readyVersion) return
        checking = true
        try {
          const result = await updater.checkForUpdates()
          await result?.downloadPromise
        } catch (error) {
          reportError(error instanceof Error ? error : new Error(String(error)))
        } finally {
          checking = false
        }
      }

      updater.on('update-downloaded', onDownloaded)
      updater.on('error', reportError)
      void check()
      const interval = setInterval(() => void check(), 4 * 60 * 60 * 1000)
      interval.unref()

      return () => {
        clearInterval(interval)
        updater.removeListener('update-downloaded', onDownloaded)
        updater.removeListener('error', reportError)
      }
    }
  }
}
