import { useCallback, useEffect, useState } from 'react'
import type { LeaguesTree } from '@shared/tree'
import { Loader, Sidebar as KumoSidebar, Text, ToastProvider } from '@cloudflare/kumo'
import FirstRun from './components/FirstRun'
import LeagueView from './components/LeagueView'
import SharedView from './components/SharedView'
import Sidebar, { type Selection } from './components/Sidebar'

type Phase = 'loading' | 'no-root' | 'ready'

function AppContent(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [tree, setTree] = useState<LeaguesTree | null>(null)
  const [selection, setSelection] = useState<Selection>({ kind: 'shared' })

  const refresh = useCallback(async () => {
    const scanned = await window.api.scan()
    if (scanned) {
      setTree(scanned)
      setPhase('ready')
    } else {
      setTree(null)
      setPhase('no-root')
    }
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
