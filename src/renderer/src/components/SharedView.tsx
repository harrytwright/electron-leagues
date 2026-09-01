import { Button, Text } from '@cloudflare/kumo'
import type { LeaguesTree } from '@shared/tree'
import FileList from './FileList'

function SharedView({ tree }: { tree: LeaguesTree }): React.JSX.Element {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <header className="grid gap-1.5">
        <Text as="h1" variant="heading" size="lg">
          Shared documents
        </Text>
        <Text variant="secondary">General documents used by every league</Text>
      </header>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <Text as="h2" variant="heading">
            Shared
          </Text>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void window.api.revealFile(`${tree.root}/_shared`)}
            aria-label="Show in folder — shared"
          >
            Show in folder
          </Button>
        </div>
        <FileList
          files={tree.sharedFiles}
          dropInto={tree.hasShared ? `${tree.root}/_shared` : undefined}
          emptyLabel="Drop general documents here — opening times, lane prices…"
        />
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <Text as="h2" variant="heading">
            Templates
          </Text>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void window.api.revealFile(`${tree.root}/_templates`)}
            aria-label="Show in folder — templates"
          >
            Show in folder
          </Button>
        </div>
        <FileList
          files={tree.templateFiles}
          dropInto={tree.hasTemplates ? `${tree.root}/_templates` : undefined}
          emptyLabel="Documents here are copied into every new season"
        />
      </section>
    </div>
  )
}

export default SharedView
