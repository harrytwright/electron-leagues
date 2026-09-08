import { CrumbTrail } from '@renderer/components/CrumbTrail'
import { DirectoryBrowser } from '@renderer/components/DirectoryBrowser'
import type { Props } from './interface'

export function OtherPane({ entries, root, onChanged }: Props): React.JSX.Element {
  return (
    <div role="tabpanel" aria-label="Other items" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-10 shrink-0 items-center border-b border-kumo-line px-4 py-1">
        <CrumbTrail names={['Other items']} onNavigate={() => {}} />
      </div>
      <DirectoryBrowser
        currentDir={root}
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
