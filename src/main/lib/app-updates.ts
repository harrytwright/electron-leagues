import type { AppUpdater, ProgressInfo, UpdateDownloadedEvent } from 'electron-updater'
import type { AppUpdatePhase, AppUpdateStatus } from '../../shared/app-update'
import { recordEvent, traceOperation } from '../../shared/telemetry'

interface UpdateSource {
  checkForUpdates: AppUpdater['checkForUpdates']
  quitAndInstall: AppUpdater['quitAndInstall']
  on(event: 'update-downloaded', listener: (update: UpdateDownloadedEvent) => void): void
  on(event: 'download-progress', listener: (progress: ProgressInfo) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  removeListener(
    event: 'update-downloaded',
    listener: (update: UpdateDownloadedEvent) => void
  ): void
  removeListener(event: 'download-progress', listener: (progress: ProgressInfo) => void): void
  removeListener(event: 'error', listener: (error: Error) => void): void
}

export type UpdateCheckOutcome =
  | { kind: 'unavailable' }
  | { kind: 'up-to-date' }
  | { kind: 'downloading'; version: string }
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; error: Error }

type DialogOutcome = Extract<UpdateCheckOutcome, { kind: 'up-to-date' | 'failed' | 'unavailable' }>

export interface UpdateCheckMessage {
  type: 'info' | 'error'
  message: string
  detail: string
}

export interface AppUpdates {
  getStatus: () => AppUpdateStatus
  start: (updater: UpdateSource) => () => void
  checkNow: () => Promise<UpdateCheckOutcome>
  /** Quits and installs the downloaded update; returns false unless one is ready. */
  install: () => boolean
}

const APP_NAME = 'GoBowling Leagues'

export function updateCheckMessage(
  outcome: DialogOutcome,
  installedVersion: string
): UpdateCheckMessage {
  switch (outcome.kind) {
    case 'up-to-date':
      return {
        type: 'info',
        message: "You're up to date",
        detail: `${APP_NAME} ${installedVersion} is the latest version.`
      }
    case 'failed':
      return {
        type: 'error',
        message: 'Could not check for updates',
        detail: 'Check your internet connection and try again.'
      }
    case 'unavailable':
      return {
        type: 'info',
        message: 'Updates are unavailable',
        detail: `This build of ${APP_NAME} does not update automatically.`
      }
  }
}

const idle: AppUpdatePhase = { kind: 'idle' }

export function createAppUpdates(
  version: string,
  onChange: (status: AppUpdateStatus) => void,
  onError: (error: Error) => void
): AppUpdates {
  let status: AppUpdateStatus = { version, update: idle }
  let whileStarted: { check: () => Promise<UpdateCheckOutcome>; install: () => void } | null = null

  const setPhase = (update: AppUpdatePhase): void => {
    status = { version, update }
    onChange(status)
  }

  return {
    getStatus: () => status,
    checkNow: () => whileStarted?.check() ?? Promise.resolve({ kind: 'unavailable' }),
    install() {
      if (!whileStarted || status.update.kind !== 'ready') return false
      whileStarted.install()
      return true
    },
    start(updater) {
      let inFlight: Promise<UpdateCheckOutcome> | null = null
      let failureReported = false
      let checkStarted = performance.now()
      let downloadStarted: number | null = null
      const reportError = (error: Error): void => {
        if (failureReported) return
        failureReported = true
        recordEvent('app_update_failed', {
          phase: status.update.kind,
          duration_ms: Math.round(performance.now() - (downloadStarted ?? checkStarted))
        })
        if (status.update.kind !== 'idle') setPhase(idle)
        onError(error)
      }
      const onDownloaded = (update: UpdateDownloadedEvent): void => {
        recordEvent('app_update_downloaded', {
          available_version: update.version,
          duration_ms: Math.round(performance.now() - (downloadStarted ?? checkStarted))
        })
        setPhase({ kind: 'ready', version: update.version })
      }
      const onProgress = ({ percent }: ProgressInfo): void => {
        const { update } = status
        const wholePercent = Math.floor(percent)
        if (update.kind !== 'downloading' || update.percent === wholePercent) return
        setPhase({ ...update, percent: wholePercent })
      }
      const startCheck = (): Promise<UpdateCheckOutcome> => {
        failureReported = false
        checkStarted = performance.now()
        downloadStarted = null
        recordEvent('app_update_check_started')
        const outcome = Promise.withResolvers<UpdateCheckOutcome>()
        inFlight = outcome.promise
        setPhase({ kind: 'checking' })
        void (async () => {
          try {
            const result = await traceOperation('update.check', {}, () => updater.checkForUpdates())
            if (!failureReported)
              recordEvent('app_update_checked', {
                available: result?.isUpdateAvailable ?? false,
                duration_ms: Math.round(performance.now() - checkStarted)
              })
            if (!result?.isUpdateAvailable) {
              if (status.update.kind === 'checking') setPhase(idle)
              outcome.resolve({ kind: 'up-to-date' })
              return
            }
            const { version: available } = result.updateInfo
            downloadStarted = performance.now()
            if (status.update.kind === 'checking') {
              setPhase({ kind: 'downloading', version: available, percent: null })
            }
            outcome.resolve(
              status.update.kind === 'ready'
                ? { kind: 'ready', version: status.update.version }
                : { kind: 'downloading', version: available }
            )
            await traceOperation(
              'update.download',
              { available_version: available },
              async () => result.downloadPromise
            )
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error))
            reportError(failure)
            outcome.resolve({ kind: 'failed', error: failure })
          } finally {
            inFlight = null
            if (status.update.kind === 'checking' || status.update.kind === 'downloading') {
              setPhase(idle)
            }
          }
        })()
        return outcome.promise
      }
      const check = (): void => {
        if (inFlight || status.update.kind === 'ready') return
        void startCheck()
      }

      updater.on('update-downloaded', onDownloaded)
      updater.on('download-progress', onProgress)
      updater.on('error', reportError)
      whileStarted = {
        check: () =>
          status.update.kind === 'ready'
            ? Promise.resolve({ kind: 'ready', version: status.update.version })
            : (inFlight ?? startCheck()),
        install: () => {
          failureReported = false
          updater.quitAndInstall()
        }
      }
      check()
      const interval = setInterval(check, 4 * 60 * 60 * 1000)
      interval.unref()

      return () => {
        whileStarted = null
        clearInterval(interval)
        updater.removeListener('update-downloaded', onDownloaded)
        updater.removeListener('download-progress', onProgress)
        updater.removeListener('error', reportError)
      }
    }
  }
}
