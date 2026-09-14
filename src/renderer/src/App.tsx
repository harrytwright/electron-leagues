import { useCallback, useEffect, useState } from 'react'
import { skipToken, useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import { AppProviders } from './components/AppProviders'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { PaneErrorBoundary } from './components/PaneErrorBoundary'
import type { LeaguesTree } from '@shared/tree'
import { Button, Loader, Sidebar as KumoSidebar, Text } from '@cloudflare/kumo'
import { FirstRun } from './components/FirstRun'
import { HomeView } from './components/HomeView'
import { LeagueView } from './components/LeagueView'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { OperationFeedbackProvider } from './components/OperationFeedbackProvider'
import { LocationOperationProvider } from './components/LocationOperationProvider'
import { ipcErrorMessage } from './lib/ipc-error'
import { loadSelection, saveSelection } from './lib/local-store'
import { findLeague, HOME, restoreSelection, type Selection } from './lib/selection'
import { useAppCommandHandler, useAppCommands } from './hooks/use-app-commands'
import { useLocationOperation } from './hooks/use-location-operation'
import { useOperationFeedback } from './hooks/use-operation-feedback'
import { useDiagnosticsCommands } from './hooks/use-diagnostics-preference'
import { rootQuery } from './queries/root'
import { treeQuery, treeQueryKey } from './queries/tree'
import { useQueryRefresh } from './hooks/use-query-refresh'

interface ScanErrorProps {
  message: string | null
  onRetry: () => Promise<void>
  onChooseAnother: () => Promise<void>
}

interface LeagueNavigation {
  ownerPath: string
  currentDir: string
}

interface HomeNavigation {
  ownerRoot: string
  currentDir: string
}

function AppCommandHandlers(): null {
  const locationOperation = useLocationOperation()
  useAppCommandHandler('open-location', () => void locationOperation.choose('select'))
  useAppCommandHandler('new-location', () => void locationOperation.choose('init'))
  return null
}

function ApplicationActivity({ visible }: { visible: boolean }): React.JSX.Element {
  const { activity } = useOperationFeedback()
  return (
    // A live region that mounts with its message already present is not reliably announced.
    <span
      role="status"
      aria-label="Application activity"
      aria-live="polite"
      className={visible ? 'fixed inset-x-0 bottom-3 text-center text-base' : 'sr-only'}
    >
      {activity ? `${activity.label}…` : null}
    </span>
  )
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
  const root = useQuery(rootQuery)
  return (
    <OperationFeedbackProvider locationKey={root.data ?? ''}>
      <LocationOperationProvider>
        <LocationContent root={root} />
      </LocationOperationProvider>
    </OperationFeedbackProvider>
  )
}

function LocationContent({ root }: { root: UseQueryResult<string | null> }): React.JSX.Element {
  useAppCommands()
  useDiagnosticsCommands()
  const locationOperation = useLocationOperation()
  const coordinator = useQueryRefresh()
  const rootPath = root.data ?? null
  const tree = useQuery({
    ...treeQuery(rootPath ?? ''),
    queryFn: rootPath !== null ? treeQuery(rootPath).queryFn : skipToken
  })
  const [seenTree, setSeenTree] = useState<LeaguesTree>()
  const [selection, setSelection] = useState<Selection>(HOME)
  const [leagueNavigation, setLeagueNavigation] = useState<LeagueNavigation | null>(null)
  const [homeNavigation, setHomeNavigation] = useState<HomeNavigation | null>(null)

  if (seenTree !== tree.data) {
    setSeenTree(tree.data)
    if (tree.data) {
      const changedRoot = seenTree?.root !== tree.data.root
      setSelection(
        restoreSelection(tree.data, changedRoot ? loadSelection(tree.data.root) : selection)
      )
      if (changedRoot) {
        setHomeNavigation(null)
        setLeagueNavigation(null)
      }
    }
  }

  const refreshAfterWrite = useCallback(
    () => coordinator.refresh({ throwOnError: true }),
    [coordinator]
  )
  const refreshForReading = useCallback(() => coordinator.refresh(), [coordinator])

  // Remember user choices without erasing a league that is temporarily missing from a scan.
  const select = useCallback(
    (next: Selection) => {
      setLeagueNavigation(null)
      // A redundant Home click keeps the mounted pane and its reported directory together.
      if (next.kind !== 'home') setHomeNavigation(null)
      setSelection(next)
      if (rootPath !== null) saveSelection(rootPath, next)
    },
    [rootPath]
  )

  const homeRoot = root.data
  const updateHomeCurrentDir = useCallback(
    (currentDir: string) => {
      if (
        homeRoot &&
        (currentDir === homeRoot ||
          currentDir.startsWith(`${homeRoot}/`) ||
          currentDir.startsWith(`${homeRoot}\\`))
      ) {
        setHomeNavigation({ ownerRoot: homeRoot, currentDir })
      }
    },
    [homeRoot]
  )

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

  let content: React.JSX.Element | null = null
  if (root.isPending || (!root.isError && rootPath !== null && tree.isPending && !tree.data)) {
    content = (
      <div className="flex h-full items-center justify-center gap-2 bg-kumo-base">
        <Loader />
        <Text>Loading…</Text>
      </div>
    )
  } else if (root.isError) {
    content = (
      <ScanError
        message={ipcErrorMessage(root.error)}
        onRetry={async () => {
          await root.refetch()
        }}
        onChooseAnother={locationOperation.forget}
      />
    )
  } else if (root.data === null) {
    content = <FirstRun />
  } else if (tree.isError) {
    content = (
      <ScanError
        message={ipcErrorMessage(tree.error)}
        onRetry={() => coordinator.refresh({ queryKey: treeQueryKey(rootPath ?? '') })}
        onChooseAnother={locationOperation.forget}
      />
    )
  } else if (tree.data) {
    const scanned = tree.data
    const selectedLeague = findLeague(scanned, selection)
    const statusPath = selectedLeague
      ? leagueNavigation?.ownerPath === selectedLeague.path
        ? leagueNavigation.currentDir
        : selectedLeague.path
      : homeNavigation?.ownerRoot === scanned.root
        ? homeNavigation.currentDir
        : scanned.sharedPath

    // Keyed on the location / league so each view's local state starts fresh
    // when they change.
    content = (
      <KumoSidebar.Provider
        defaultOpen
        collapsible="icon"
        resizable={false}
        contained
        className="flex h-full flex-col"
      >
        <Toolbar
          root={scanned.root}
          isHome={selection.kind === 'home'}
          onHome={() => select(HOME)}
        />
        <div className="flex min-h-0 w-full flex-1">
          <Sidebar key={scanned.root} tree={scanned} selection={selection} onSelect={select} />
          <main className="h-full min-w-0 flex-1 overflow-auto">
            <PaneErrorBoundary resetKeys={[selectedLeague?.path ?? scanned.root]}>
              {selectedLeague ? (
                <LeagueView
                  key={selectedLeague.path}
                  league={selectedLeague}
                  onChanged={refreshAfterWrite}
                  onRefresh={refreshForReading}
                  onCurrentDirChange={(currentDir) =>
                    setLeagueNavigation({ ownerPath: selectedLeague.path, currentDir })
                  }
                />
              ) : (
                <HomeView
                  key={scanned.root}
                  tree={scanned}
                  onSelect={select}
                  onChanged={refreshAfterWrite}
                  onRefresh={refreshForReading}
                  onCurrentDirChange={updateHomeCurrentDir}
                />
              )}
            </PaneErrorBoundary>
          </main>
        </div>
        <StatusBar path={statusPath} />
      </KumoSidebar.Provider>
    )
  }

  return (
    <>
      <AppCommandHandlers />
      {content}
      <ApplicationActivity
        visible={root.isPending || root.isError || root.data === null || !tree.data || tree.isError}
      />
    </>
  )
}

function App({ queryClient }: { queryClient: QueryClient }): React.JSX.Element {
  return (
    <AppProviders queryClient={queryClient}>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </AppProviders>
  )
}

export default App
