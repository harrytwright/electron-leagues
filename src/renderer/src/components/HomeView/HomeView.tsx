import { useEffect, useState } from 'react'
import { Button, Tabs, Text } from '@cloudflare/kumo'
import { FolderPlusIcon } from '@phosphor-icons/react/dist/csr/FolderPlus'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import type { FileEntry } from '@shared/tree'
import { useCrumbs } from '@renderer/lib/use-crumbs'
import { useDirListing } from '@renderer/lib/use-dir-listing'
import { useImportFiles } from '@renderer/lib/use-import-files'
import { CrumbTrail } from '../CrumbTrail'
import { DirectoryBrowser } from '../DirectoryBrowser/DirectoryBrowser'
import { NewLeagueDialog } from '../NewLeagueDialog'
import { TreeFileBrowser } from '../TreeFileBrowser'
import type { Props } from './interface'

type HomeTab = 'shared' | 'templates' | 'other'

function isHomeTab(value: string): value is HomeTab {
  return value === 'shared' || value === 'templates' || value === 'other'
}

interface FolderPaneProps {
  baseDir: string
  label: string
  present: boolean
  onChanged: () => void | Promise<void>
  onCurrentDirChange: (path: string) => void
}

function FolderPane({
  baseDir,
  label,
  present,
  onChanged,
  onCurrentDirChange
}: FolderPaneProps): React.JSX.Element {
  const trail = useCrumbs(baseDir)
  const listing = useDirListing(present ? trail.currentDir : null)
  const importer = useImportFiles(present ? trail.currentDir : undefined, async () => {
    listing.reload()
    await onChanged()
  })

  const jumpTo = (depth: number): void => {
    trail.jumpTo(depth)
    onCurrentDirChange(depth === 0 ? baseDir : trail.crumbs[depth - 1].path)
  }

  return (
    <div role="tabpanel" aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-4 border-b border-kumo-line px-4 py-1">
        <CrumbTrail
          names={[label, ...trail.crumbs.map((crumb) => crumb.name)]}
          onNavigate={jumpTo}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-base"
          disabled={!present || importer.importing}
          icon={<PlusIcon aria-hidden size={14} />}
          onClick={() => void importer.pickFiles()}
        >
          {importer.importing ? 'Importing…' : 'Add files…'}
        </Button>
      </div>
      {present ? (
        <TreeFileBrowser
          key={trail.currentDir}
          name={trail.crumbs.at(-1)?.name ?? label}
          listing={listing}
          readOnly={false}
          onNavigate={(folders) => {
            for (const folder of folders) trail.enter(folder)
            const destination = folders.at(-1)
            if (destination) onCurrentDirChange(destination.path)
          }}
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

interface OtherPaneProps {
  entries: FileEntry[]
  root: string
  onChanged: () => void | Promise<void>
}

function OtherPane({ entries, root, onChanged }: OtherPaneProps): React.JSX.Element {
  return (
    <div role="tabpanel" aria-label="Other items" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center border-b border-kumo-line px-4 py-1">
        <CrumbTrail names={['Other items']} onNavigate={() => {}} />
      </div>
      <DirectoryBrowser
        name="Other items"
        heading="Other items"
        rows={entries.map((entry) => ({ ...entry, key: entry.path }))}
        metadataColumn="contents"
        readOnly={false}
        onRefresh={() => void onChanged()}
        onNavigate={(row) => void window.api.revealFile(row.path)}
        emptyTitle="No other items"
        emptyDescription={`Only items directly inside ${root} appear here.`}
      />
    </div>
  )
}

export function HomeView({
  tree,
  onSelect,
  onChanged,
  onCurrentDirChange
}: Props): React.JSX.Element {
  const [creating, setCreating] = useState(false)
  const [active, setActive] = useState<HomeTab>('shared')
  const tabs = [
    { value: 'shared', label: 'Shared documents' },
    { value: 'templates', label: 'Templates' },
    ...(tree.unrecognisedRootEntries.length > 0 ? [{ value: 'other', label: 'Other items' }] : [])
  ]
  const activeTab =
    active === 'other' && tree.unrecognisedRootEntries.length === 0 ? 'shared' : active
  const activePath =
    activeTab === 'shared'
      ? tree.sharedPath
      : activeTab === 'templates'
        ? tree.templatesPath
        : tree.root

  useEffect(() => {
    onCurrentDirChange(activePath)
  }, [activePath, onCurrentDirChange])

  const changeTab = (value: string): void => {
    if (isHomeTab(value)) setActive(value)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 shrink-0 border-b border-kumo-line bg-kumo-base">
        <div className="flex items-start justify-between gap-4 px-4 pt-3 pb-2">
          <Text as="h1" variant="heading" size="lg">
            Home
          </Text>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="text-base"
            icon={<FolderPlusIcon aria-hidden size={14} />}
            onClick={() => setCreating(true)}
          >
            New league…
          </Button>
        </div>
        <Tabs
          tabs={tabs}
          value={activeTab}
          onValueChange={changeTab}
          activateOnFocus
          variant="underline"
          size="base"
          className="px-4"
        />
      </div>

      {activeTab === 'shared' ? (
        <FolderPane
          key="shared"
          baseDir={tree.sharedPath}
          label="Shared documents"
          present={tree.hasShared}
          onChanged={onChanged}
          onCurrentDirChange={onCurrentDirChange}
        />
      ) : activeTab === 'templates' ? (
        <FolderPane
          key="templates"
          baseDir={tree.templatesPath}
          label="Templates"
          present={tree.hasTemplates}
          onChanged={onChanged}
          onCurrentDirChange={onCurrentDirChange}
        />
      ) : (
        <OtherPane entries={tree.unrecognisedRootEntries} root={tree.root} onChanged={onChanged} />
      )}

      <NewLeagueDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(day, folderName) => {
          setCreating(false)
          void (async () => {
            await onChanged()
            onSelect({ kind: 'league', day, folderName })
          })()
        }}
      />
    </div>
  )
}
