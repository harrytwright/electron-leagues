export type UpdateInstallOutcome =
  'installing' | 'failed' | 'not-ready' | 'busy' | 'already-requested'

export interface UpdateInstallerOptions {
  isReady: () => boolean
  isFileOperationRunning: () => boolean
  flushBeforeQuit: () => Promise<void>
  /** Returns false when the updater refuses to install. */
  install: () => boolean
  onInstallFailed: () => void
}

export interface UpdateInstaller {
  request: () => Promise<UpdateInstallOutcome>
  /** Lets a later ready phase be requested again once the update stops being ready. */
  phaseChanged: () => void
  /** Reports an updater error; it only counts once the flush has finished and install has started. */
  updaterFailed: () => void
}

/**
 * Flushes first so the updater's own quit is not deferred, then installs. The main process
 * is the only guard: menu and IPC requests both arrive here.
 */
export function createUpdateInstaller({
  isReady,
  isFileOperationRunning,
  flushBeforeQuit,
  install,
  onInstallFailed
}: UpdateInstallerOptions): UpdateInstaller {
  let installRequested = false
  let installingAfterFlush = false

  function failInstall(): void {
    if (!installingAfterFlush) return
    installingAfterFlush = false
    onInstallFailed()
  }

  return {
    async request() {
      if (installRequested) return 'already-requested'
      if (!isReady()) return 'not-ready'
      if (isFileOperationRunning()) return 'busy'
      installRequested = true
      await flushBeforeQuit()
      installingAfterFlush = true
      if (install()) return 'installing'
      failInstall()
      return 'failed'
    },
    phaseChanged() {
      if (!isReady()) installRequested = false
    },
    updaterFailed: failInstall
  }
}

interface QuitEvent {
  preventDefault: () => void
}

export interface QuitFlush {
  flush: () => Promise<void>
  /** Defers the first quit until the flush finishes; later quits go straight through. */
  beforeQuit: (event: QuitEvent, quit: () => void) => void
}

/** Runs the shutdown work once however many quits and installs ask for it. */
export function createQuitFlush(shutDown: () => Promise<void>): QuitFlush {
  let pending: Promise<void> | null = null
  let flushed = false

  function flush(): Promise<void> {
    pending ??= shutDown().then(() => {
      flushed = true
    })
    return pending
  }

  return {
    flush,
    beforeQuit(event, quit) {
      if (flushed) return
      event.preventDefault()
      void flush().then(quit)
    }
  }
}
