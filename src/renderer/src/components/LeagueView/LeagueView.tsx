import { useState } from 'react'
import { Badge, Button, DropdownMenu, Text, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThreeIcon, PlusIcon } from '@phosphor-icons/react'
import type { SeasonNode } from '@shared/tree'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { revealLabel } from '@renderer/lib/reveal-label'
import { sentenceCase } from '@renderer/lib/sentence-case'
import { trashLabel } from '@renderer/lib/trash-label'
import { useCrumbs } from '@renderer/lib/use-crumbs'
import { useDirListing } from '@renderer/lib/use-dir-listing'
import { useImportFiles } from '@renderer/lib/use-import-files'
import { CrumbTrail } from '../CrumbTrail'
import { DeleteResourceDialog, type DeleteTarget } from '../DeleteResourceDialog'
import { DirectoryTable, type DirectoryRow } from '../DirectoryTable'
import { IconButton } from '../IconButton'
import { ListingPanel } from '../ListingPanel'
import { NewSeasonDialog } from '../NewSeasonDialog'
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

export function LeagueView({ league, onChanged }: Props): React.JSX.Element {
  const trail = useCrumbs(league.path)
  const [newSeason, setNewSeason] = useState(false)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)
  const [zipping, setZipping] = useState<string | null>(null)
  const { add } = useKumoToastManager()

  // The league's own folder is presented from the scan (seasons carry status
  // badges, the archive lives elsewhere on disk); everything below it is listed
  // on demand. Archives are read-only from here.
  const inArchive = trail.crumbs[0]?.path === league.archivePath
  const atArchiveRoot = trail.currentDir === league.archivePath
  const listing = useDirListing(trail.atBase ? null : trail.currentDir)
  const importer = useImportFiles(inArchive ? undefined : trail.currentDir, async () => {
    listing.reload()
    await onChanged()
  })

  const enter = (row: DirectoryRow): void => trail.enter({ name: row.name, path: row.path })

  const zip = async (name: string): Promise<void> => {
    if (zipping) return
    setZipping(name)
    try {
      await window.api.zipArchive(league.folderName, [name])
      add({ title: `Zipped ${name}`, variant: 'success' })
      listing.reload()
      await onChanged()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      setZipping(null)
    }
  }

  const topRows: DirectoryRow[] = [
    ...[...league.seasons].reverse().map((season) => ({
      key: season.path,
      name: season.name,
      kind: 'folder' as const,
      path: season.path,
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
            badge: (
              <Badge variant="secondary">
                {`${league.archiveItemCount} item${league.archiveItemCount === 1 ? '' : 's'}`}
              </Badge>
            )
          }
        ]
      : [])
  ]

  const listed = listing.entries ?? []
  const listedRows: DirectoryRow[] = listed.map((entry) => {
    const zipped = listed.some((e) => e.name === `${entry.name}.zip`)
    const archivedSeason =
      atArchiveRoot && entry.kind === 'folder' && league.archivedSeasons.includes(entry.name)
    return {
      key: entry.path,
      name: entry.name,
      kind: entry.kind,
      path: entry.path,
      mtime: entry.mtime,
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
    <div className="grid content-start">
      <div className="sticky top-0 z-10 border-b border-kumo-line bg-kumo-base">
        <div className="mx-auto grid w-full max-w-5xl gap-3 px-6 pt-5 pb-3">
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
              <Text variant="secondary">
                {sentenceCase(league.day)}
                {league.running ? '' : ' · Create a season to start it'}
              </Text>
            </div>
            <Button type="button" variant="primary" onClick={() => setNewSeason(true)}>
              New season…
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <CrumbTrail
              names={[league.meta.name, ...trail.crumbs.map((c) => c.name)]}
              onNavigate={trail.jumpTo}
            />
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={inArchive || importer.importing}
                title={inArchive ? 'Archived seasons are read-only' : undefined}
                icon={<PlusIcon aria-hidden size={14} />}
                onClick={() => void importer.pickFiles()}
              >
                {importer.importing ? 'Importing…' : 'Add files…'}
              </Button>
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

      <div className="mx-auto w-full max-w-5xl p-6">
        {trail.atBase ? (
          <DirectoryTable
            aria-label={league.meta.name}
            rows={topRows}
            onNavigate={enter}
            onDropFiles={importer.importPaths}
            emptyTitle="No seasons yet"
            emptyDescription="Create a season to start this league."
          />
        ) : (
          <ListingPanel
            aria-label={trail.crumbs[trail.crumbs.length - 1].name}
            listing={listing}
            rows={listedRows}
            onNavigate={enter}
            onDropFiles={inArchive ? undefined : importer.importPaths}
            onBack={{ label: `Back to ${league.meta.name}`, action: () => trail.jumpTo(0) }}
            emptyTitle="This folder is empty"
          />
        )}
      </div>

      <NewSeasonDialog
        league={league}
        open={newSeason}
        onOpenChange={setNewSeason}
        onCreated={() => {
          setNewSeason(false)
          void onChanged()
        }}
      />

      <DeleteResourceDialog
        target={deleting}
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        onDeleted={async (target) => {
          setDeleting(null)
          add({ title: `Moved “${target.name}” to the ${trashLabel()}`, variant: 'success' })
          await onChanged()
        }}
      />
    </div>
  )
}
