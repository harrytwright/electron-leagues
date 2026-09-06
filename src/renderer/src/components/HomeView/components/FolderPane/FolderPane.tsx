import { useCrumbs } from '@renderer/hooks/use-crumbs'
import { useDirListing } from '@renderer/hooks/use-dir-listing'
import { useImportFiles } from '@renderer/hooks/use-import-files'
import { ImportFilesButton } from '@renderer/components/FileBrowser/components/ImportFilesButton'
import { CrumbTrail } from '@renderer/components/CrumbTrail'
import { DirectoryBrowser } from '@renderer/components/DirectoryBrowser'
import { TreeFileBrowser } from '@renderer/components/TreeFileBrowser'
import type { Props } from './interface'

export function FolderPane({
  baseDir,
  label,
  present,
  onChanged,
  onCurrentDirChange
}: Props): React.JSX.Element {
  const trail = useCrumbs(baseDir, onCurrentDirChange)
  const listing = useDirListing(present ? trail.currentDir : null)
  const importer = useImportFiles(present ? trail.currentDir : undefined, async () => {
    listing.reload()
    await onChanged()
  })

  const jumpTo = trail.jumpTo

  return (
    <div role="tabpanel" aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-4 border-b border-kumo-line px-4 py-1">
        <CrumbTrail
          names={[label, ...trail.crumbs.map((crumb) => crumb.name)]}
          onNavigate={jumpTo}
        />
        <ImportFilesButton importer={importer} disabled={!present} />
      </div>
      {present ? (
        <TreeFileBrowser
          key={trail.currentDir}
          name={trail.crumbs.at(-1)?.name ?? label}
          listing={listing}
          readOnly={false}
          onNavigate={trail.enterMany}
          onDropFiles={importer.importPaths}
          onBack={{ label: `Back to ${label}`, action: () => jumpTo(0) }}
        />
      ) : (
        <DirectoryBrowser
          name={label}
          heading="Files"
          rows={[]}
          metadataColumn="modified"
          readOnly={false}
          onRefresh={() => void onChanged()}
          onNavigate={() => {}}
          emptyTitle={`No ${label.toLocaleLowerCase()} folder`}
          emptyDescription="The app couldn’t repair this reserved folder. Refresh to try again."
        />
      )}
    </div>
  )
}
