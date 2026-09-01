import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeaguesTree } from '@shared/tree'
import { Button, Loader, Sidebar as KumoSidebar, Text, ToastProvider } from '@cloudflare/kumo'
import FirstRun from './components/FirstRun'
import LeagueView from './components/LeagueView'
import SharedView from './components/SharedView'
import Sidebar, { type Selection } from './components/Sidebar'
import { ipcErrorMessage } from './lib/ipc-error'

type Phase = 'loading' | 'no-root' | 'ready' | 'error'

interface ScanErrorProps {
  message: string | null
  onRetry: () => Promise<void>
  onChooseAnother: () => Promise<void>
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
  const [selection, setSelection] = useState<Selection>({ kind: 'shared' })

  // Concurrent refreshes (watcher + retry click) settle in any order; only the
  // most recently started one may write state.
  const scanGeneration = useRef(0)

  const refresh = useCallback(async () => {
    const ticket = (scanGeneration.current += 1)
    try {
      const scanned = await window.api.scan()
      if (scanGeneration.current !== ticket) return
      if (scanned) {
        setTree(scanned)
        setPhase('ready')
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
    setScanError(null)
    setTree(null)
    setPhase('no-root')
  }, [])

  useEffect(() => {
    // refresh() only touches state after awaiting the IPC scan, never synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    return window.api.onTreeChanged(() => void refresh())
  }, [refresh])

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

  const selectedLeague =
    selection.kind === 'league'
      ? (tree.days[selection.day].find((l) => l.folderName === selection.folderName) ?? null)
      : null

  return (
    <KumoSidebar.Provider
      defaultOpen
      collapsible="icon"
      resizable={false}
      className="flex h-full min-h-0"
    >
      <Sidebar tree={tree} selection={selection} onSelect={setSelection} onChanged={refresh} />
      <main className="h-full min-w-0 flex-1 overflow-auto">
        {selection.kind === 'shared' || !selectedLeague ? (
          <SharedView tree={tree} />
        ) : (
          <LeagueView league={selectedLeague} onChanged={() => void refresh()} />
        )}
      </main>
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
