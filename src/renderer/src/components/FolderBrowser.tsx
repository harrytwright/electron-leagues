import { useState } from 'react'
import { Button } from '@cloudflare/kumo'
import { PlusIcon } from '@phosphor-icons/react'
import type { Crumb } from '../lib/crumb'
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

interface Trail {
  baseDir: string
  crumbs: Crumb[]
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
  // Crumbs belong to the base they were drilled from; a new base starts over.
  const [trail, setTrail] = useState<Trail>({ baseDir, crumbs: [] })
  const crumbs = trail.baseDir === baseDir ? trail.crumbs : []
  const setCrumbs = (update: (current: Crumb[]) => Crumb[]): void =>
    setTrail((current) => ({
      baseDir,
      crumbs: update(current.baseDir === baseDir ? current.crumbs : [])
    }))

  const currentDir = crumbs.at(-1)?.path ?? baseDir
  const listing = useDirListing(currentDir)
  const importer = useImportFiles(canImport ? currentDir : undefined, async () => {
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
          names={[baseLabel, ...crumbs.map((c) => c.name)]}
          onNavigate={(depth) => setCrumbs((current) => current.slice(0, depth))}
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
        aria-label={crumbs.at(-1)?.name ?? baseLabel}
        listing={listing}
        rows={rows}
        onNavigate={(row) =>
          setCrumbs((current) => [...current, { name: row.name, path: row.path }])
        }
        onDropFiles={canImport ? importer.importPaths : undefined}
        onBack={
          crumbs.length > 0
            ? { label: `Back to ${baseLabel}`, action: () => setCrumbs(() => []) }
            : undefined
        }
        emptyTitle={crumbs.length === 0 ? emptyTitle : 'This folder is empty'}
        emptyDescription={crumbs.length === 0 ? emptyDescription : undefined}
      />
    </div>
  )
}

export default FolderBrowser
