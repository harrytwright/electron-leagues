import { useCallback, useEffect, useState } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { isPermissionDeniedMessage } from '@shared/fs-messages'
import { AppProviders } from '@renderer/providers/AppProviders'
import { AppErrorBoundary } from '@renderer/components/AppErrorBoundary'
import { ErrorState } from '@renderer/components/ErrorState'
import { PaneErrorBoundary } from '@renderer/components/PaneErrorBoundary'
import { WorkspaceStoreProvider } from '@renderer/providers/WorkspaceStoreProvider'
import { Button, Loader, Sidebar as KumoSidebar, Text } from '@cloudflare/kumo'
import { FirstRun } from '@renderer/views/FirstRun'
import { HomeView } from '@renderer/views/HomeView'
import { LeagueView } from '@renderer/views/LeagueView'
import { MembersView } from '@renderer/views/MembersView'
import { Sidebar } from '@renderer/components/Sidebar'
import { StatusBar } from '@renderer/components/StatusBar'
import { Toolbar } from '@renderer/components/Toolbar'
import { OperationFeedbackProvider } from '@renderer/providers/OperationFeedbackProvider'
import { LocationOperationProvider } from '@renderer/providers/LocationOperationProvider'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { currentPlatform } from '@renderer/lib/platform'
import { findLeague, HOME, restoreSelection } from '@renderer/lib/selection'
import { useWorkspace } from '@renderer/hooks/use-workspace'
import { useAppCommandHandler, useAppCommands } from '@renderer/hooks/use-app-commands'
import { useLocationOperation } from '@renderer/hooks/use-location-operation'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { useDiagnosticsCommands } from '@renderer/hooks/use-diagnostics-preference'
import { rootQuery } from '@renderer/queries/root'
import { treeQuery, treeQueryKey } from '@renderer/queries/tree'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import type {
  ApplicationActivityProps,
  LocationContentProps,
  Props,
  ScanErrorProps
} from './interface'

function AppCommandHandlers(): null {
  const locationOperation = useLocationOperation()
  useAppCommandHandler('open-location', () => void locationOperation.choose('select'))
  useAppCommandHandler('new-location', () => void locationOperation.choose('init'))
  return null
}

function ApplicationActivity({ visible }: ApplicationActivityProps): React.JSX.Element {
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
  const onMac = currentPlatform() === 'darwin'
  const permissionDenied = message !== null && isPermissionDeniedMessage(message)
  const showPermissionSettings = permissionDenied && onMac
  const title = permissionDenied ? 'Folder access is blocked' : 'Couldn’t read the leagues folder'
  const description = permissionDenied
    ? onMac
      ? 'macOS is blocking this app from reading the folder. Grant access under Privacy & Security, Files and Folders, then try again.'
      : 'The folder’s permissions are blocking this app from reading it. Check the folder’s permissions, then try again.'
    : message

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <ErrorState>
      <ErrorState.Title>{title}</ErrorState.Title>
      <ErrorState.Message>{description}</ErrorState.Message>
      <ErrorState.Actions>
        {showPermissionSettings ? (
          <Button
            variant="primary"
            autoFocus
            onClick={() => {
              // The main process already reports failures to open System Settings.
              void window.api.openPermissionSettings().catch(() => {})
            }}
          >
            Open System Settings
          </Button>
        ) : null}
        <Button
          variant={showPermissionSettings ? 'secondary' : 'primary'}
          autoFocus={!showPermissionSettings}
          loading={busy}
          disabled={busy}
          onClick={() => void run(onRetry)}
        >
          {busy ? 'Retrying…' : 'Try again'}
        </Button>
        <Button disabled={busy} onClick={() => void run(onChooseAnother)}>
          Choose another folder
        </Button>
      </ErrorState.Actions>
    </ErrorState>
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

function LocationContent({ root }: LocationContentProps): React.JSX.Element {
  useAppCommands()
  useDiagnosticsCommands()
  const locationOperation = useLocationOperation()
  const coordinator = useQueryRefresh()
  const rootPath = root.data ?? null
  const tree = useQuery({
    ...treeQuery(rootPath ?? ''),
    queryFn: rootPath !== null ? treeQuery(rootPath).queryFn : skipToken
  })

  const setWorkspaceRoot = useWorkspace((workspace) => workspace.setRoot)
  const select = useWorkspace((workspace) => workspace.select)
  const reportLeagueDir = useWorkspace((workspace) => workspace.reportLeagueDir)
  const reportHomeDir = useWorkspace((workspace) => workspace.reportHomeDir)
  const leagueNavigation = useWorkspace((workspace) => workspace.leagueNavigation)
  const homeNavigation = useWorkspace((workspace) => workspace.homeNavigation)
  // The remembered selection is only ever written by an explicit select(); a league missing
  // from one scan is never overwritten, so it reselects itself once the scan finds it again.
  // Keyed on the displayed root rather than the store's, which follows it from an effect.
  const remembered = useWorkspace((workspace) =>
    rootPath !== null ? workspace.locations[rootPath]?.selection : undefined
  )

  useEffect(() => {
    setWorkspaceRoot(root.data ?? null)
  }, [root.data, setWorkspaceRoot])

  const homeRoot = root.data
  const updateHomeCurrentDir = useCallback(
    (currentDir: string) => {
      if (
        homeRoot &&
        (currentDir === homeRoot ||
          currentDir.startsWith(`${homeRoot}/`) ||
          currentDir.startsWith(`${homeRoot}\\`))
      ) {
        reportHomeDir({ ownerRoot: homeRoot, currentDir })
      }
    },
    [homeRoot, reportHomeDir]
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
    const effectiveSelection = restoreSelection(scanned, remembered ?? null)
    const selectedLeague = findLeague(scanned, effectiveSelection)
    const statusPath = selectedLeague
      ? leagueNavigation?.ownerPath === selectedLeague.path
        ? leagueNavigation.currentDir
        : selectedLeague.path
      : effectiveSelection.kind === 'members'
        ? scanned.root
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
          isHome={effectiveSelection.kind === 'home'}
          onHome={() => select(HOME)}
        />
        <div className="flex min-h-0 w-full flex-1">
          <Sidebar
            key={scanned.root}
            tree={scanned}
            selection={effectiveSelection}
            onSelect={select}
          />
          <main className="h-full min-w-0 flex-1 overflow-auto">
            <PaneErrorBoundary resetKeys={[selectedLeague?.path ?? scanned.root]}>
              {selectedLeague ? (
                <LeagueView
                  key={selectedLeague.path}
                  league={selectedLeague}
                  initialNavigation={
                    leagueNavigation?.ownerPath === selectedLeague.path
                      ? leagueNavigation
                      : undefined
                  }
                  onCurrentDirChange={(currentDir) =>
                    reportLeagueDir({ ownerPath: selectedLeague.path, currentDir })
                  }
                  onRenamed={(day, folderName) => select({ kind: 'league', day, folderName })}
                />
              ) : effectiveSelection.kind === 'members' ? (
                <MembersView key={scanned.root} tree={scanned} />
              ) : (
                <HomeView
                  key={scanned.root}
                  tree={scanned}
                  onSelect={select}
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

function App({ queryClient, workspaceStore }: Props): React.JSX.Element {
  return (
    <AppProviders queryClient={queryClient}>
      <WorkspaceStoreProvider store={workspaceStore}>
        <AppErrorBoundary>
          <AppContent />
        </AppErrorBoundary>
      </WorkspaceStoreProvider>
    </AppProviders>
  )
}

export default App
