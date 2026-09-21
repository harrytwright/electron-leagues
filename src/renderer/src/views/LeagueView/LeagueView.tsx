import { useState } from 'react'
import { Badge, Button, DropdownMenu, Tabs, Text, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThreeIcon } from '@phosphor-icons/react'
import { SIGN_IN_SHEET_FILE, SIGN_IN_TEMPLATE_FILE } from '@shared/members'
import type { DirEntry, SeasonNode } from '@shared/tree'
import { joinPathLike } from '@renderer/lib/path-basename'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { plural } from '@renderer/lib/plural'
import { revealLabel } from '@renderer/lib/os-labels'
import { sentenceCase } from '@renderer/lib/sentence-case'
import { useCrumbs } from '@renderer/hooks/use-crumbs'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import { useImportFiles } from '@renderer/hooks/use-import-files'
import { useKeyedState } from '@renderer/hooks/use-keyed-state'
import { useMembers } from '@renderer/hooks/use-members'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useTreeFolders } from '@renderer/hooks/use-tree-folders'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ImportFilesButton } from '@renderer/components/FileBrowser/components/ImportFilesButton'
import { CreateRosterDialog } from '@renderer/components/CreateRosterDialog'
import { CrumbTrail } from '@renderer/components/CrumbTrail'
import { DeleteResourceDialog, type DeleteTarget } from '@renderer/components/DeleteResourceDialog'
import { DirectoryBrowser, type BrowserRow } from '@renderer/components/DirectoryBrowser'
import { IconButton } from '@renderer/components/IconButton'
import { NewSeasonDialog } from '@renderer/components/NewSeasonDialog'
import { RenameLeagueDialog } from '@renderer/components/RenameLeagueDialog'
import { SeasonRoster, type SeasonRosterTab } from '@renderer/components/SeasonRoster'
import { TreeFileBrowser } from '@renderer/components/TreeFileBrowser'
import type { Sort } from '@renderer/components/TreeFileBrowser/interface'
import type { Props } from './interface'

type SeasonTab = 'files' | SeasonRosterTab

const SEASON_TABS: { value: SeasonTab; label: string }[] = [
  { value: 'files', label: 'Files' },
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Teams' },
  { value: 'settings', label: 'Settings' }
]

function isSeasonTab(value: string): value is SeasonTab {
  return SEASON_TABS.some((tab) => tab.value === value)
}

function seasonBadgeVariant(status: SeasonNode['status']): 'success' | 'info' {
  switch (status) {
    case 'previous':
      return 'info'
    case 'active':
    case 'live':
      return 'success'
  }
}

export function LeagueView({ league, onCurrentDirChange, onRenamed }: Props): React.JSX.Element {
  const trail = useCrumbs(league.path, onCurrentDirChange)
  const [newSeason, setNewSeason] = useState(false)
  const [settingUpRoster, setSettingUpRoster] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const [syncingTemplates, setSyncingTemplates] = useState(false)
  const [treeSort, setTreeSort] = useState<Sort>({ column: 'name', direction: 'ascending' })
  // Each season opens on its files; the tab is not carried from one season to another.
  const [seasonTab, setSeasonTab] = useKeyedState<string, SeasonTab>(trail.currentDir, 'files')
  const tree = useTreeFolders(trail.currentDir)
  const members = useMembers()
  const { add } = useKumoToastManager()
  const coordinator = useQueryRefresh()
  const zipOperation = useWriteOperation({
    label: (name: string) => `Zipping ${name}`,
    write: (name) => window.api.zipArchive(league.folderName, [name])
  })
  const syncTemplatesOperation = useWriteOperation({
    label: () => 'Syncing templates',
    write: (seasonName: string) =>
      window.api.syncSeasonTemplates({
        day: league.day,
        leagueFolder: league.folderName,
        seasonName
      })
  })

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
  const importer = useImportFiles(inArchive ? undefined : trail.currentDir)
  // A season with a season file gains roster tabs; older seasons keep the plain file browser.
  const snapshot = members.data?.enabled ? members.data : null
  const rosterSeason =
    snapshot && inSeason
      ? (snapshot.seasons.find((season) => season.path === trail.currentDir) ?? null)
      : null
  const activeSeasonTab = rosterSeason ? seasonTab : 'files'
  // A season made before the database was on can be given a roster from its own menu.
  const canSetUpRoster = atLiveSeasonRoot && snapshot !== null && rosterSeason === null
  const seasonBefore = liveSeason
    ? league.seasons[league.seasons.findIndex((season) => season.path === liveSeason.path) - 1]
    : undefined
  const previousRoster = seasonBefore
    ? (snapshot?.seasons.find((season) => season.path === seasonBefore.path) ?? null)
    : null
  const liveRoster = rosterSeason && !rosterSeason.archived ? rosterSeason : null
  const signInSheet = useWriteOperation({
    label: () => 'Preparing the sign-in sheet',
    write: (seasonName: string) =>
      window.api.openSignInSheet({ day: league.day, leagueFolder: league.folderName, seasonName })
  })
  // The sheet is made from the roster on first open, so it is listed before it exists.
  const pendingEntries: DirEntry[] = liveRoster
    ? [
        {
          name: SIGN_IN_SHEET_FILE,
          path: joinPathLike(liveRoster.path, SIGN_IN_SHEET_FILE),
          kind: 'file',
          mtime: 0
        }
      ]
    : []
  const decorateSeasonRow = (
    entry: DirEntry
  ): { badge?: React.ReactNode; open?: () => Promise<void> } | undefined => {
    if (!liveRoster) return undefined
    if (entry.name === SIGN_IN_SHEET_FILE) {
      const seasonName = liveRoster.season
      return {
        badge: <Badge variant="info">Generated</Badge>,
        open: async () => {
          if (signInSheet.pending) return
          try {
            await signInSheet.run(seasonName)
          } catch (caught) {
            add({ title: ipcErrorMessage(caught), variant: 'error' })
          }
        }
      }
    }
    if (entry.name === SIGN_IN_TEMPLATE_FILE) {
      return {
        badge: (
          <span title={`Replaced by ${SIGN_IN_SHEET_FILE}, which is made from the roster`}>
            <Badge variant="secondary">Superseded</Badge>
          </span>
        )
      }
    }
    return undefined
  }
  const previousSeasonFormat = snapshot?.seasons.find(
    (season) => season.path === league.seasons.at(-1)?.path
  )?.file.format

  const zip = async (name: string): Promise<void> => {
    if (zipping) return
    setZipping(name)
    try {
      const outcome = await zipOperation.run(name)
      const message = `Zipped ${name}`
      if (outcome.status === 'refresh-failed') {
        add({
          title: `${message}, but the league could not be refreshed: ${outcome.refreshError}`,
          variant: 'error'
        })
        return
      }
      add({ title: message, variant: 'success' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      setZipping(null)
    }
  }

  const syncTemplates = async (): Promise<void> => {
    if (!atLiveSeasonRoot || syncingTemplates) return
    setSyncingTemplates(true)
    try {
      const outcome = await syncTemplatesOperation.run(liveSeason.name)
      const result = outcome.result
      const message =
        result.added.length === 0
          ? 'Templates already up to date'
          : `Added ${plural(result.added.length, 'template')}`
      if (outcome.status === 'refresh-failed') {
        add({
          title: `${message}, but the league could not be refreshed: ${outcome.refreshError}`,
          variant: 'error'
        })
        return
      }
      add({ title: message, variant: 'success' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
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
      contents: plural(season.files.length, 'item'),
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
            contents: plural(league.archiveItemCount, 'item'),
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
              onNavigate={trail.jumpTo}
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
                      {canSetUpRoster ? (
                        <DropdownMenu.Item onClick={() => setSettingUpRoster(true)}>
                          Set up roster…
                        </DropdownMenu.Item>
                      ) : null}
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
                  <DropdownMenu.Item onClick={() => setRenaming(true)}>
                    Rename league…
                  </DropdownMenu.Item>
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

      <div className="flex min-h-1 w-full flex-1 flex-col">
        <div className="w-full px-4 border-b border-kumo-line">
          {rosterSeason ? (
            <Tabs
              aria-label={`${rosterSeason.season} season`}
              tabs={SEASON_TABS}
              value={activeSeasonTab}
              onValueChange={(value) => {
                if (isSeasonTab(value)) setSeasonTab(value)
              }}
              activateOnFocus
              className="my-2 w-fit"
            />
          ) : null}
        </div>
        {rosterSeason && snapshot && activeSeasonTab !== 'files' ? (
          <SeasonRoster season={rosterSeason} snapshot={snapshot} tab={activeSeasonTab} />
        ) : inSeason ? (
          <TreeFileBrowser
            currentDir={trail.currentDir}
            name={trail.crumbs[trail.crumbs.length - 1].name}
            listing={listing}
            tree={tree}
            sort={treeSort}
            onSortChange={setTreeSort}
            readOnly={inArchive}
            onNavigate={trail.enterMany}
            consumeFocusRequest={trail.consumeFocusRequest}
            onDropFiles={inArchive ? undefined : importer.importPaths}
            onBack={{ label: `Back to ${league.meta.name}`, action: () => trail.jumpTo(0) }}
            pendingEntries={pendingEntries}
            decorate={decorateSeasonRow}
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
            onRefresh={() => void coordinator.refresh()}
            onNavigate={trail.enter}
            consumeFocusRequest={trail.consumeFocusRequest}
            onDropFiles={inArchive ? undefined : importer.importPaths}
            onBack={{ label: `Back to ${league.meta.name}`, action: () => trail.jumpTo(0) }}
            emptyTitle={trail.atBase ? 'No seasons yet' : 'This folder is empty'}
            emptyDescription={trail.atBase ? 'Create a season to start this league.' : undefined}
          />
        )}
      </div>

      <NewSeasonDialog
        league={league}
        roster={snapshot ? { defaultFormat: previousSeasonFormat } : null}
        open={newSeason}
        onOpenChange={setNewSeason}
        onCreated={() => setNewSeason(false)}
      />

      {liveSeason ? (
        <CreateRosterDialog
          season={{ day: league.day, leagueFolder: league.folderName, seasonName: liveSeason.name }}
          defaultFormat={previousRoster?.file.format}
          previousHasRoster={previousRoster !== null}
          open={settingUpRoster}
          onOpenChange={setSettingUpRoster}
          onCreated={() => setSettingUpRoster(false)}
        />
      ) : null}

      <RenameLeagueDialog
        league={league}
        open={renaming}
        onOpenChange={setRenaming}
        onRenamed={(day, folderName) => {
          setRenaming(false)
          onRenamed(day, folderName)
        }}
      />

      <DeleteResourceDialog
        target={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </div>
  )
}
