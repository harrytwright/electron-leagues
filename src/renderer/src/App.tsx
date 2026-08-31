import { useCallback, useEffect, useState } from 'react'
import type { LeaguesTree } from '@shared/tree'
import FirstRun from './components/FirstRun'
import LeagueView from './components/LeagueView'
import SharedView from './components/SharedView'
import Sidebar, { type Selection } from './components/Sidebar'

type Phase = 'loading' | 'no-root' | 'ready'

function App(): React.JSX.Element {
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

  if (phase === 'loading') return <div className="first-run">Loading…</div>

  if (phase === 'no-root' || !tree) {
    return <FirstRun onChosen={() => void refresh()} />
  }

  const selectedLeague =
    selection.kind === 'league'
      ? (tree.days[selection.day].find((l) => l.folderName === selection.folderName) ?? null)
      : null

  return (
    <div className="layout">
      <Sidebar
        tree={tree}
        selection={selection}
        onSelect={setSelection}
        onChanged={() => void refresh()}
      />
      <main className="main">
        {selection.kind === 'shared' || !selectedLeague ? (
          <SharedView tree={tree} />
        ) : (
          <LeagueView league={selectedLeague} onChanged={() => void refresh()} />
        )}
      </main>
    </div>
  )
}

export default App
