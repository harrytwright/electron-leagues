import { useCallback, useRef, useState } from 'react'
import { Badge, Button, DropdownMenu, Text, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThreeIcon } from '@phosphor-icons/react'
import type { SeasonNode } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { revealLabel } from '@renderer/lib/reveal-label'
import { sentenceCase } from '@renderer/lib/sentence-case'
import { useCrumbs } from '@renderer/hooks/use-crumbs'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import { useImportFiles } from '@renderer/hooks/use-import-files'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { useTreeFolders } from '@renderer/hooks/use-tree-folders'
import { ImportFilesButton } from '../FileBrowser/components/ImportFilesButton'
import { CrumbTrail } from '../CrumbTrail'
import { DeleteResourceDialog, type DeleteTarget } from '../DeleteResourceDialog'
import { DirectoryBrowser, type BrowserRow } from '../DirectoryBrowser'
import { IconButton } from '../IconButton'
import { NewSeasonDialog } from '../NewSeasonDialog'
import { TreeFileBrowser } from '../TreeFileBrowser'
import type { Sort } from '../TreeFileBrowser/interface'
import type { Props } from './interface'

function seasonBadgeVariant(status: SeasonNode['status']): 'success' | 'info' {
  switch (status) {
    case 'previous':
      return 'info'
    case 'active':
    case 'live':
      return 'success'
  }
}

export function LeagueView({
  league,
  onChanged,
  onRefresh,
  onCurrentDirChange
}: Props): React.JSX.Element {
  const trail = useCrumbs(league.path, onCurrentDirChange)
  const [newSeason, setNewSeason] = useState(false)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const [syncingTemplates, setSyncingTemplates] = useState(false)
  const [treeSort, setTreeSort] = useState<Sort>({ column: 'name', direction: 'ascending' })
  const tree = useTreeFolders(trail.currentDir)
  const pendingFocusDir = useRef<string | null>(null)
  const { add } = useKumoToastManager()
  const feedback = useOperationFeedback()

  // The league's own folder is presented from the scan (seasons carry status
  // badges, the archive lives elsewhere on disk); everything below it is listed
  // on demand. Archives are read-only from here.
  const inArchive = trail.crumbs[0]?.path === league.archivePath
  const atArchiveRoot = trail.currentDir === league.archivePath
  const inSeason =
    league.seasons.some((season) => season.path === trail.crumbs[0]?.path) ||
    (inArchive && league.archivedSeasons.includes(trail.crumbs[1]?.name))
  const liveSeason = league.seasons.find((season) => season.path === trail.currentDir)
  const atLiveSeasonRoot = trail.crumbs.length === 1 && liveSeason !== undefined
  const listing = useDirListing(trail.atBase ? null : trail.currentDir)
  const importer = useImportFiles(inArchive ? undefined : trail.currentDir, async () => {
    listing.reload()
    await onChanged()
  })

  const consumeFocusRequest = useCallback((currentDir: string): boolean => {
    if (pendingFocusDir.current !== currentDir) return false
    pendingFocusDir.current = null
    return true
  }, [])
  const enter = (row: BrowserRow, focusFirstRow: boolean): void => {
    pendingFocusDir.current = focusFirstRow ? row.path : null
    trail.enter(row)
  }
  const enterMany = (
    folders: Parameters<typeof trail.enterMany>[0],
    focusFirstRow: boolean
  ): void => {
    const destination = folders.at(-1)
    pendingFocusDir.current = focusFirstRow && destination ? destination.path : null
    trail.enterMany(folders)
  }
  const jumpTo = (depth: number): void => {
    pendingFocusDir.current = depth === 0 ? league.path : trail.crumbs[depth - 1].path
    trail.jumpTo(depth)
  }

  const zip = async (name: string): Promise<void> => {
    if (zipping) return
    setZipping(name)
    const operationId = feedback.begin(`Zipping ${name}`)
    try {
      await window.api.zipArchive(league.folderName, [name])
      const message = `Zipped ${name}`
      listing.reload()
      try {
        await onChanged()
      } catch (caught) {
        add({
          title: `${message}, but the league could not be refreshed: ${ipcErrorMessage(caught)}`,
          variant: 'error'
        })
        return
      }
      add({ title: message, variant: 'success' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      // Completion follows refresh so a successful write is never reported as a plain failure.
      feedback.finish(operationId)
      setZipping(null)
    }
  }

  const syncTemplates = async (): Promise<void> => {
    if (!atLiveSeasonRoot || syncingTemplates) return
    setSyncingTemplates(true)
    const operationId = feedback.begin('Syncing templates')
    try {
      const result = await window.api.syncSeasonTemplates({
        day: league.day,
        leagueFolder: league.folderName,
        seasonName: liveSeason.name
      })
      const message =
        result.added.length === 0
          ? 'Templates already up to date'
          : `Added ${result.added.length} template${result.added.length === 1 ? '' : 's'}`
      listing.reload()
      try {
        await onChanged()
      } catch (caught) {
        add({
          title: `${message}, but the league could not be refreshed: ${ipcErrorMessage(caught)}`,
          variant: 'error'
        })
        return
      }
      add({ title: message, variant: 'success' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      // Completion follows refresh so a successful write is never reported as a plain failure.
      feedback.finish(operationId)
      setSyncingTemplates(false)
    }
  }

  const topRows: BrowserRow[] = [
    ...[...league.seasons].reverse().map((season) => ({
      key: season.path,
      name: season.name,
      kind: 'folder' as const,
      path: season.path,
      typeLabel: 'Season',
      contents: `${season.files.length} item${season.files.length === 1 ? '' : 's'}`,
      badge: (
        <Badge variant={seasonBadgeVariant(season.status)}>{sentenceCase(season.status)}</Badge>
      ),
      menuItems: [
        {
          label: 'Delete season…',
          variant: 'danger' as const,
          onSelect: () => setDeleting({ kind: 'season', name: season.name, path: season.path })
        }
      ]
    })),
    ...league.otherEntries.map((entry) => ({
      key: entry.path,
      name: entry.name,
      kind: entry.kind,
      path: entry.path
    })),
    ...(league.archiveItemCount > 0
      ? [
          {
            key: league.archivePath,
            name: 'Archive',
            kind: 'folder' as const,
            path: league.archivePath,
            typeLabel: 'Archive folder',
            contents: `${league.archiveItemCount} item${league.archiveItemCount === 1 ? '' : 's'}`,
            badge: <Badge variant="secondary">Read-only</Badge>
          }
        ]
      : [])
  ]

  const listed = listing.entries ?? []
  const listedRows: BrowserRow[] = listed.map((entry) => {
    const zipped = listed.some((e) => e.name === `${entry.name}.zip`)
    const archivedSeason =
      atArchiveRoot && entry.kind === 'folder' && league.archivedSeasons.includes(entry.name)
    return {
      key: entry.path,
      name: entry.name,
      kind: entry.kind,
      path: entry.path,
      mtime: entry.mtime,
      typeLabel: archivedSeason ? 'Season' : undefined,
      badge: zipping === entry.name ? <Badge variant="secondary">Zipping…</Badge> : undefined,
      menuItems: archivedSeason
        ? [
            {
              label: zipped ? 'Zip season again' : 'Zip season',
              disabled: zipping !== null,
              onSelect: () => void zip(entry.name)
            }
          ]
        : undefined
    }
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 shrink-0 border-b border-kumo-line bg-kumo-base">
        <div className="grid w-full gap-1 px-4 pt-3 pb-1">
          <div className="flex items-start justify-between gap-4">
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <Text as="h1" variant="heading" size="lg" truncate>
                  {league.meta.name}
                </Text>
                <Badge variant={league.running ? 'success' : 'neutral'} appearance="dot">
                  {league.running ? 'Running' : 'Not running'}
                </Badge>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="text-base"
              onClick={() => setNewSeason(true)}
            >
              New season…
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <CrumbTrail
              names={[league.meta.name, ...trail.crumbs.map((c) => c.name)]}
              onNavigate={jumpTo}
            />
            <div className="flex shrink-0 items-center gap-2">
              <ImportFilesButton
                importer={importer}
                disabled={inArchive}
                title={inArchive ? 'Archived seasons are read-only' : undefined}
              />
              <DropdownMenu>
                <DropdownMenu.Trigger
                  render={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      icon={<DotsThreeIcon aria-hidden weight="bold" />}
                      aria-label="League actions"
                    />
                  }
                />
                <DropdownMenu.Content>
                  {atLiveSeasonRoot ? (
                    <>
                      <DropdownMenu.Item
                        disabled={syncingTemplates}
                        onClick={() => void syncTemplates()}
                      >
                        {syncingTemplates ? 'Syncing templates…' : 'Sync with templates'}
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                    </>
                  ) : null}
                  <DropdownMenu.Item onClick={() => void window.api.revealFile(trail.currentDir)}>
                    {revealLabel()}
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    variant="danger"
                    onClick={() =>
                      setDeleting({
                        kind: 'league',
                        name: league.meta.name,
                        path: league.path,
                        hasArchives: league.archiveItemCount > 0
                      })
                    }
                  >
                    Delete league…
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col">
        {inSeason ? (
          <TreeFileBrowser
            currentDir={trail.currentDir}
            name={trail.crumbs[trail.crumbs.length - 1].name}
            listing={listing}
            tree={tree}
            sort={treeSort}
            onSortChange={setTreeSort}
            readOnly={inArchive}
            onNavigate={enterMany}
            consumeFocusRequest={consumeFocusRequest}
            onDropFiles={inArchive ? undefined : importer.importPaths}
            onBack={{ label: `Back to ${league.meta.name}`, action: () => jumpTo(0) }}
          />
        ) : (
          <DirectoryBrowser
            currentDir={trail.currentDir}
            name={trail.atBase ? league.meta.name : trail.crumbs[trail.crumbs.length - 1].name}
            heading={
              trail.atBase ? 'Seasons and files' : atArchiveRoot ? 'Archived seasons' : 'Files'
            }
            listing={trail.atBase ? undefined : listing}
            rows={trail.atBase ? topRows : listedRows}
            metadataColumn={trail.atBase ? 'contents' : 'modified'}
            readOnly={inArchive}
            onRefresh={() => {
              if (trail.atBase) void onRefresh()
              else listing.reload()
            }}
            onNavigate={enter}
            consumeFocusRequest={consumeFocusRequest}
            onDropFiles={inArchive ? undefined : importer.importPaths}
            onBack={{ label: `Back to ${league.meta.name}`, action: () => jumpTo(0) }}
            emptyTitle={trail.atBase ? 'No seasons yet' : 'This folder is empty'}
            emptyDescription={trail.atBase ? 'Create a season to start this league.' : undefined}
          />
        )}
      </div>

      <NewSeasonDialog
        league={league}
        open={newSeason}
        onOpenChange={setNewSeason}
        onCreated={() => {
          setNewSeason(false)
          void onRefresh()
        }}
      />

      <DeleteResourceDialog
        target={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        onDeleted={async () => {
          await onChanged()
        }}
      />
    </div>
  )
}
