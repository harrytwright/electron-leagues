import { useCallback, useMemo, useRef } from 'react'
import { CrumbTrail } from '@renderer/components/CrumbTrail'
import { DirectoryBrowser } from '@renderer/components/DirectoryBrowser'
import { useCrumbs } from '@renderer/hooks/use-crumbs'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import type { Props } from './interface'

export function OtherPane({
  entries,
  root,
  onRefresh,
  onCurrentDirChange
}: Props): React.JSX.Element {
  const trail = useCrumbs(root, onCurrentDirChange)
  const listing = useDirListing(trail.currentDir)
  const pendingFocusDir = useRef<string | null>(null)
  const visibleEntries = useMemo(() => {
    if (!trail.atBase) return listing.entries
    const rootPaths = new Set(entries.map((entry) => entry.path))
    return listing.entries?.filter((entry) => rootPaths.has(entry.path))
  }, [entries, listing.entries, trail.atBase])
  const visibleListing = { ...listing, entries: visibleEntries ?? null }

  const consumeFocusRequest = useCallback((currentDir: string): boolean => {
    if (pendingFocusDir.current !== currentDir) return false
    pendingFocusDir.current = null
    return true
  }, [])
  const enter = (row: Parameters<typeof trail.enter>[0], focusFirstRow: boolean): void => {
    pendingFocusDir.current = focusFirstRow ? row.path : null
    trail.enter(row)
  }
  const jumpTo = (depth: number): void => {
    pendingFocusDir.current = depth === 0 ? root : trail.crumbs[depth - 1].path
    trail.jumpTo(depth)
  }
  const refresh = (): void => {
    listing.reload()
    void onRefresh()
  }

  return (
    <div role="tabpanel" aria-label="Other items" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center border-b border-kumo-line px-4 py-1">
        <CrumbTrail
          names={['Other items', ...trail.crumbs.map((crumb) => crumb.name)]}
          onNavigate={jumpTo}
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
        onNavigate={enter}
        consumeFocusRequest={consumeFocusRequest}
        onBack={
          trail.atBase ? undefined : { label: 'Back to Other items', action: () => jumpTo(0) }
        }
        emptyTitle="No other items"
        emptyDescription={
          trail.atBase ? `Only items directly inside ${root} appear here.` : 'This folder is empty.'
        }
      />
    </div>
  )
}
