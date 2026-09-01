import { Button, Empty, Loader } from '@cloudflare/kumo'
import { WarningCircleIcon } from '@phosphor-icons/react'
import type { DirListing } from '../lib/use-dir-listing'
import DirectoryTable, { type DirectoryRow } from './DirectoryTable'
import { PANEL_CLASS } from './panel'

interface Props {
  listing: DirListing
  rows: DirectoryRow[]
  onNavigate: (row: DirectoryRow) => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  /** Offered beside "Try again" when the folder can't be read. */
  onBack?: { label: string; action: () => void }
  emptyTitle?: string
  emptyDescription?: string
  'aria-label': string
}

/** The loading / unreadable / listed states of one folder in the browser. */
function ListingPanel({
  listing,
  rows,
  onNavigate,
  onDropFiles,
  onBack,
  emptyTitle,
  emptyDescription,
  'aria-label': label
}: Props): React.JSX.Element {
  if (listing.error) {
    return (
      <Empty
        size="sm"
        icon={<WarningCircleIcon size={32} className="text-kumo-inactive" />}
        title="Couldn’t read this folder"
        description={listing.error}
        contents={
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button type="button" size="sm" onClick={onBack.action}>
                {onBack.label}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={listing.reload}>
              Try again
            </Button>
          </div>
        }
      />
    )
  }

  if (listing.entries === null) {
    return (
      <div role="status" className={`flex items-center gap-2 px-4 py-3 ${PANEL_CLASS}`}>
        <Loader />
        <span className="text-kumo-subtle">Loading…</span>
      </div>
    )
  }

  return (
    <DirectoryTable
      aria-label={label}
      rows={rows}
      onNavigate={onNavigate}
      onDropFiles={onDropFiles}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  )
}

export default ListingPanel
