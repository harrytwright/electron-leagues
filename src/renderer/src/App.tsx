import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeaguesTree } from '@shared/tree'
import { Button, Loader, Sidebar as KumoSidebar, Text, ToastProvider } from '@cloudflare/kumo'
import { FirstRun } from './components/FirstRun'
import { HomeView } from './components/HomeView'
import { LeagueView } from './components/LeagueView'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { ipcErrorMessage } from './lib/ipc-error'
import { loadSelection, saveSelection } from './lib/local-store'
import { findLeague, HOME, restoreSelection, type Selection } from './lib/selection'

type Phase = 'loading' | 'no-root' | 'ready' | 'error'

interface ScanErrorProps {
  message: string | null
  onRetry: () => Promise<void>
  onChooseAnother: () => Promise<void>
}

interface LeagueNavigation {
  ownerPath: string
  currentDir: string
}

function ScanError({ message, onRetry, onChooseAnother }: ScanErrorProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-kumo-base">
      <div role="alert" className="grid max-w-md gap-1.5 text-center">
        <Text as="h1" variant="heading">
          Couldn’t read the leagues folder
        </Text>
        <Text variant="secondary">{message}</Text>
      </div>
      <div className="flex gap-3">
        <Button
          variant="primary"
          autoFocus
          loading={busy}
          disabled={busy}
          onClick={() => void run(onRetry)}
        >
          {busy ? 'Retrying…' : 'Try again'}
        </Button>
        <Button disabled={busy} onClick={() => void run(onChooseAnother)}>
          Choose another folder
        </Button>
      </div>
    </div>
  )
}

function AppContent(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [tree, setTree] = useState<LeaguesTree | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(HOME)
  const [leagueNavigation, setLeagueNavigation] = useState<LeagueNavigation | null>(null)

  // Concurrent refreshes (watcher + retry click) settle in any order; only the
  // most recently started one may write state.
  const scanGeneration = useRef(0)
  // The location whose remembered selection has already been restored.
  const restoredRoot = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const ticket = (scanGeneration.current += 1)
    try {
      const scanned = await window.api.scan()
      if (scanGeneration.current !== ticket) return
      if (scanned) {
        setTree(scanned)
        setPhase('ready')
        if (restoredRoot.current !== scanned.root) {
          restoredRoot.current = scanned.root
          setSelection(restoreSelection(scanned, loadSelection(scanned.root)))
        } else {
          // A league deleted or renamed on disk must not strand the selection.
          setSelection((current) => restoreSelection(scanned, current))
        }
      } else {
        setTree(null)
        setPhase('no-root')
      }
      setScanError(null)
    } catch (caught) {
      if (scanGeneration.current !== ticket) return
      // Without this, a failing scan strands the app on the spinner forever.
      setScanError(ipcErrorMessage(caught) || 'Unknown error')
      setPhase('error')
    }
  }, [])

  const forgetAndRestart = useCallback(async () => {
    await window.api.forgetRoot()
    restoredRoot.current = null
    setScanError(null)
    setTree(null)
    setPhase('no-root')
  }, [])

  // Remembered per location, but only what the user chose: a league that is
  // merely missing from one scan (sync lag, mid-rename) must not erase it.
  const select = useCallback((next: Selection) => {
    setLeagueNavigation(null)
    setSelection(next)
    if (restoredRoot.current) saveSelection(restoredRoot.current, next)
  }, [])

  useEffect(() => {
    // refresh() only touches state after awaiting the IPC scan, never synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    return window.api.onTreeChanged(() => void refresh())
  }, [refresh])

  useEffect(() => {
    // A file dropped anywhere but a drop target would otherwise navigate the
    // whole window to it. Drop targets handle their own events first; here we
    // only refuse what nothing else accepted.
    const refuse = (event: DragEvent): void => {
      if (event.defaultPrevented) return
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      event.preventDefault()
    }
    document.addEventListener('dragover', refuse)
    document.addEventListener('drop', refuse)
    return () => {
      document.removeEventListener('dragover', refuse)
      document.removeEventListener('drop', refuse)
    }
  }, [])

  if (phase === 'loading') {
    return (
      <div role="status" className="flex h-full items-center justify-center gap-2 bg-kumo-base">
        <Loader />
        <Text>Loading…</Text>
      </div>
    )
  }

  if (phase === 'error') {
    return <ScanError message={scanError} onRetry={refresh} onChooseAnother={forgetAndRestart} />
  }

  if (phase === 'no-root' || !tree) {
    return <FirstRun onChosen={() => void refresh()} />
  }

  const selectedLeague = findLeague(tree, selection)
  const statusPath = selectedLeague
    ? leagueNavigation?.ownerPath === selectedLeague.path
      ? leagueNavigation.currentDir
      : selectedLeague.path
    : tree.root

  // Keyed on the location / league so each view's local state starts fresh
  // when they change.
  return (
    <KumoSidebar.Provider
      defaultOpen
      collapsible="icon"
      resizable={false}
      contained
      className="flex h-full flex-col"
    >
      <Toolbar
        root={tree.root}
        isHome={selection.kind === 'home'}
        onHome={() => select(HOME)}
        onLocationChanged={refresh}
      />
      <div className="flex min-h-0 w-full flex-1">
        <Sidebar key={tree.root} tree={tree} selection={selection} onSelect={select} />
        <main className="h-full min-w-0 flex-1 overflow-auto">
          {selectedLeague ? (
            <LeagueView
              key={selectedLeague.path}
              league={selectedLeague}
              onChanged={refresh}
              onCurrentDirChange={(currentDir) =>
                setLeagueNavigation({ ownerPath: selectedLeague.path, currentDir })
              }
            />
          ) : (
            <HomeView tree={tree} onSelect={select} onChanged={refresh} />
          )}
        </main>
      </div>
      <StatusBar path={statusPath} />
    </KumoSidebar.Provider>
  )
}

function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App
