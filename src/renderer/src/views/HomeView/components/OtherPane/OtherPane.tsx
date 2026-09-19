import { useMemo } from 'react'
import { CrumbTrail } from '@renderer/components/CrumbTrail'
import { DirectoryBrowser } from '@renderer/components/DirectoryBrowser'
import { useCrumbs } from '@renderer/hooks/use-crumbs'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import type { Props } from './interface'

export function OtherPane({ entries, root, onCurrentDirChange }: Props): React.JSX.Element {
  const trail = useCrumbs(root, onCurrentDirChange)
  const listing = useDirListing(trail.currentDir)
  const coordinator = useQueryRefresh()
  const visibleEntries = useMemo(() => {
    if (!trail.atBase) return listing.entries
    const rootPaths = new Set(entries.map((entry) => entry.path))
    return listing.entries?.filter((entry) => rootPaths.has(entry.path))
  }, [entries, listing.entries, trail.atBase])
  const visibleListing = { ...listing, entries: visibleEntries ?? null }

  const refresh = (): void => {
    void coordinator.refresh()
  }

  return (
    <div role="tabpanel" aria-label="Other items" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center border-b border-kumo-line px-4 py-1">
        <CrumbTrail
          names={['Other items', ...trail.crumbs.map((crumb) => crumb.name)]}
          onNavigate={trail.jumpTo}
        />
      </div>
      <DirectoryBrowser
        currentDir={trail.currentDir}
        name={trail.crumbs.at(-1)?.name ?? 'Other items'}
        heading="Files"
        rows={(visibleEntries ?? []).map((entry) => ({ ...entry, key: entry.path }))}
        metadataColumn="modified"
        // Unmanaged root items are browse-only; importing here would bypass the app's folder model.
        readOnly
        listing={visibleListing}
        onRefresh={refresh}
        onNavigate={trail.enter}
        consumeFocusRequest={trail.consumeFocusRequest}
        onBack={
          trail.atBase ? undefined : { label: 'Back to Other items', action: () => trail.jumpTo(0) }
        }
        emptyTitle="No other items"
        emptyDescription={
          trail.atBase ? `Only items directly inside ${root} appear here.` : 'This folder is empty.'
        }
      />
    </div>
  )
}
