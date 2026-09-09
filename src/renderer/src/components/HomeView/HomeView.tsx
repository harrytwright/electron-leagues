import { useEffect, useState } from 'react'
import { Button, Tabs, Text } from '@cloudflare/kumo'
import { FolderPlusIcon } from '@phosphor-icons/react/dist/csr/FolderPlus'
import { FolderPane } from './components/FolderPane'
import { OtherPane } from './components/OtherPane'
import { NewLeagueDialog } from '../NewLeagueDialog'
import type { Props } from './interface'

type HomeTab = 'shared' | 'templates' | 'other'

function isHomeTab(value: string): value is HomeTab {
  return value === 'shared' || value === 'templates' || value === 'other'
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
        <OtherPane
          entries={tree.unrecognisedRootEntries}
          root={tree.root}
          onChanged={onChanged}
          onCurrentDirChange={onCurrentDirChange}
        />
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
