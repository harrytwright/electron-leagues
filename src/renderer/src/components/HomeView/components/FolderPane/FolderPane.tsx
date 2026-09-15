import { useState } from 'react'
import { useCrumbs } from '@renderer/hooks/use-crumbs'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import { useImportFiles } from '@renderer/hooks/use-import-files'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useTreeFolders } from '@renderer/hooks/use-tree-folders'
import { ImportFilesButton } from '@renderer/components/FileBrowser/components/ImportFilesButton'
import { CrumbTrail } from '@renderer/components/CrumbTrail'
import { DirectoryBrowser } from '@renderer/components/DirectoryBrowser'
import { TreeFileBrowser } from '@renderer/components/TreeFileBrowser'
import type { Sort } from '@renderer/components/TreeFileBrowser/interface'
import type { Props } from './interface'

export function FolderPane({
  baseDir,
  label,
  present,
  onCurrentDirChange
}: Props): React.JSX.Element {
  const trail = useCrumbs(baseDir, onCurrentDirChange)
  const listing = useDirListing(present ? trail.currentDir : null)
  const tree = useTreeFolders(trail.currentDir)
  const [sort, setSort] = useState<Sort>({ column: 'name', direction: 'ascending' })
  const importer = useImportFiles(present ? trail.currentDir : undefined)
  const coordinator = useQueryRefresh()

  return (
    <div role="tabpanel" aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-4 border-b border-kumo-line px-4 py-1">
        <CrumbTrail
          names={[label, ...trail.crumbs.map((crumb) => crumb.name)]}
          onNavigate={trail.jumpTo}
        />
        <ImportFilesButton importer={importer} disabled={!present} />
      </div>
      {present ? (
        <TreeFileBrowser
          currentDir={trail.currentDir}
          name={trail.crumbs.at(-1)?.name ?? label}
          listing={listing}
          tree={tree}
          sort={sort}
          onSortChange={setSort}
          readOnly={false}
          onNavigate={trail.enterMany}
          consumeFocusRequest={trail.consumeFocusRequest}
          onDropFiles={importer.importPaths}
          onBack={{ label: `Back to ${label}`, action: () => trail.jumpTo(0) }}
        />
      ) : (
        <DirectoryBrowser
          currentDir={baseDir}
          name={label}
          heading="Files"
          rows={[]}
          metadataColumn="modified"
          readOnly={false}
          onRefresh={() => void coordinator.refresh()}
          onNavigate={() => {}}
          emptyTitle={`No ${label.toLocaleLowerCase()} folder`}
          emptyDescription="Use Repair location… in the location menu to restore this folder."
        />
      )}
    </div>
  )
}
