import { Button } from '@cloudflare/kumo'
import { PlusIcon } from '@phosphor-icons/react'
import { useCrumbs } from '../lib/use-crumbs'
import { useDirListing } from '../lib/use-dir-listing'
import { useImportFiles } from '../lib/use-import-files'
import CrumbTrail from './CrumbTrail'
import type { DirectoryRow } from './DirectoryTable'
import ListingPanel from './ListingPanel'

interface Props {
  baseDir: string
  baseLabel: string
  /** Allow dropping and picking files into whichever folder is being viewed. */
  canImport?: boolean
  onImported?: () => void | Promise<void>
  /** Copy for an empty base folder; subfolders get a neutral message. */
  emptyTitle?: string
  emptyDescription?: string
}

/** Drill-down view of one directory tree: breadcrumbs above, a table of the current folder below. */
function FolderBrowser({
  baseDir,
  baseLabel,
  canImport = false,
  onImported,
  emptyTitle,
  emptyDescription
}: Props): React.JSX.Element {
  const trail = useCrumbs(baseDir)
  const listing = useDirListing(trail.currentDir)
  const importer = useImportFiles(canImport ? trail.currentDir : undefined, async () => {
    // The watcher will notice too, but not instantly and not arbitrarily deep.
    listing.reload()
    await onImported?.()
  })

  const rows: DirectoryRow[] = (listing.entries ?? []).map((entry) => ({
    key: entry.path,
    name: entry.name,
    kind: entry.kind,
    path: entry.path,
    mtime: entry.mtime
  }))

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <CrumbTrail
          names={[baseLabel, ...trail.crumbs.map((c) => c.name)]}
          onNavigate={trail.jumpTo}
        />
        {canImport ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={importer.importing}
            icon={<PlusIcon aria-hidden size={14} />}
            onClick={() => void importer.pickFiles()}
          >
            {importer.importing ? 'Importing…' : 'Add files…'}
          </Button>
        ) : null}
      </div>

      <ListingPanel
        aria-label={trail.crumbs.at(-1)?.name ?? baseLabel}
        listing={listing}
        rows={rows}
        onNavigate={(row) => trail.enter({ name: row.name, path: row.path })}
        onDropFiles={canImport ? importer.importPaths : undefined}
        onBack={
          trail.atBase
            ? undefined
            : { label: `Back to ${baseLabel}`, action: () => trail.jumpTo(0) }
        }
        emptyTitle={trail.atBase ? emptyTitle : 'This folder is empty'}
        emptyDescription={trail.atBase ? emptyDescription : undefined}
      />
    </div>
  )
}

export default FolderBrowser
