import { useState } from 'react'
import { Button, Text } from '@cloudflare/kumo'
import { FolderPlusIcon } from '@phosphor-icons/react'
import { DirectoryTable } from '../DirectoryTable'
import { FolderBrowser } from '../FolderBrowser'
import { NewLeagueDialog } from '../NewLeagueDialog'
import type { Props, SectionProps } from './interface'

function Section({ title, description, children }: SectionProps): React.JSX.Element {
  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <Text as="h2" variant="heading">
          {title}
        </Text>
        <Text variant="secondary">{description}</Text>
      </div>
      {children}
    </section>
  )
}

export function HomeView({ tree, onSelect, onChanged }: Props): React.JSX.Element {
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <Text as="h1" variant="heading" size="lg">
            Home
          </Text>
          <Text variant="secondary" truncate title={tree.root}>
            <span className="font-mono text-[0.9em]">{tree.root}</span>
          </Text>
        </div>
        <Button
          type="button"
          variant="primary"
          icon={<FolderPlusIcon aria-hidden />}
          onClick={() => setCreating(true)}
        >
          New league…
        </Button>
      </header>

      <Section title="Templates" description="Starting documents for new seasons.">
        {tree.hasTemplates ? (
          <FolderBrowser
            baseDir={tree.templatesPath}
            baseLabel="Templates"
            canImport
            onImported={onChanged}
            emptyTitle="No templates yet"
            emptyDescription="Add the documents a new season can start from."
          />
        ) : (
          <DirectoryTable
            aria-label="Templates"
            rows={[]}
            emptyTitle="No templates folder"
            emptyDescription="Create a _templates folder in this location to seed new seasons."
          />
        )}
      </Section>

      <Section title="Shared documents" description="General documents used by every league.">
        {tree.hasShared ? (
          <FolderBrowser
            baseDir={tree.sharedPath}
            baseLabel="Shared documents"
            canImport
            onImported={onChanged}
            emptyTitle="Nothing shared yet"
            emptyDescription="Drop general documents here — opening times, lane prices…"
          />
        ) : (
          <DirectoryTable
            aria-label="Shared documents"
            rows={[]}
            emptyTitle="No shared folder"
            emptyDescription="Create a _shared folder in this location for documents every league uses."
          />
        )}
      </Section>

      {tree.unrecognisedRootEntries.length > 0 ? (
        <Section
          title="Other items"
          description="Not managed by this app — leagues live inside the weekday folders."
        >
          <DirectoryTable
            aria-label="Other items"
            rows={tree.unrecognisedRootEntries.map((entry) => ({
              key: entry.path,
              name: entry.name,
              kind: entry.kind,
              path: entry.path
            }))}
          />
        </Section>
      ) : null}

      <NewLeagueDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(day, folderName) => {
          setCreating(false)
          // Wait for the rescan so the new league exists in the tree before it
          // becomes the selection — selecting early flashes home again.
          void (async () => {
            await onChanged()
            onSelect({ kind: 'league', day, folderName })
          })()
        }}
      />
    </div>
  )
}
