import { watch, type ChokidarOptions } from 'chokidar'
import { errorCode, isPermissionDenied } from './fs-errors'

export type WatchMode = 'native' | 'polling'

export type RootWatcher = {
  close(): Promise<void>
}

export type WatchSource = {
  on(event: 'all', listener: () => void): WatchSource
  on(event: 'error', listener: (error: Error) => void): WatchSource
  close(): Promise<void>
}

export type WatchFactory = (root: string, options: ChokidarOptions) => WatchSource

export type RootWatcherOptions = {
  onChange: () => void
  onError: (error: Error, mode: WatchMode) => void
  onFallback?: (message: string, data: { root: string; code: string | undefined }) => void
  watch?: WatchFactory
  debounceMs?: number
}

const nativeOptions: ChokidarOptions = {
  ignoreInitial: true,
  // Depth 6 reaches two levels below a season folder; edits deeper than that
  // won't auto-refresh until the user navigates.
  depth: 6
}

// fs.watch can fail with EPERM for OneDrive and other macOS ~/Library/CloudStorage folders.
// Polling still works there, so retry once with polling.
const pollingOptions: ChokidarOptions = {
  ...nativeOptions,
  usePolling: true,
  interval: 2000,
  ignorePermissionErrors: true
}

export function createRootWatcher(root: string, options: RootWatcherOptions): RootWatcher {
  const watchRoot: WatchFactory = options.watch ?? watch
  const debounceMs = options.debounceMs ?? 500
  let mode: WatchMode = 'native'
  let activeWatcher: WatchSource | null = null
  let debounceTimer: NodeJS.Timeout | null = null
  let fallbackPromise: Promise<void> | null = null
  let closePromise: Promise<void> | null = null
  let closed = false

  const closeSource = (source: WatchSource, sourceMode: WatchMode): Promise<void> =>
    Promise.resolve()
      .then(() => source.close())
      .catch((error: Error) => options.onError(error, sourceMode))

  const handleChange = (source: WatchSource): void => {
    if (closed || activeWatcher !== source) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (!closed && activeWatcher === source) options.onChange()
    }, debounceMs)
  }

  const startWatcher = (sourceMode: WatchMode, watcherOptions: ChokidarOptions): WatchSource => {
    mode = sourceMode
    const source = watchRoot(root, watcherOptions)
    activeWatcher = source
    source.on('all', () => handleChange(source))
    source.on('error', (error) => handleError(source, sourceMode, error))
    return source
  }

  const switchToPolling = async (nativeWatcher: WatchSource, error: Error): Promise<void> => {
    activeWatcher = null
    const code = errorCode(error)
    const message = `Native watcher permission failure for ${root}; switching to polling`
    options.onFallback?.(message, { root, code })

    await closeSource(nativeWatcher, 'native')
    if (closed) return
    startWatcher('polling', pollingOptions)
  }

  function handleError(source: WatchSource, sourceMode: WatchMode, error: Error): void {
    if (closed || activeWatcher !== source) return
    if (sourceMode === 'native' && isPermissionDenied(error) && !fallbackPromise) {
      fallbackPromise = switchToPolling(source, error).catch((fallbackError: Error) =>
        options.onError(fallbackError, 'polling')
      )
      return
    }
    options.onError(error, sourceMode)
  }

  startWatcher('native', nativeOptions)

  return {
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = null

      const source = activeWatcher
      const sourceMode = mode
      activeWatcher = null
      closePromise = (async () => {
        if (source) await closeSource(source, sourceMode)
        await fallbackPromise
      })()
      return closePromise
    }
  }
}
