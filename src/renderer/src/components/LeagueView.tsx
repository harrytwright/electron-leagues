import { useId, useState } from 'react'
import { Badge, Button, Checkbox, LayerCard, Text, useKumoToastManager } from '@cloudflare/kumo'
import type { LeagueNode, SeasonNode } from '@shared/tree'
import { ipcErrorMessage } from '../lib/ipc-error'
import FileList from './FileList'
import NewSeasonDialog from './NewSeasonDialog'

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function seasonBadgeVariant(status: SeasonNode['status']): 'success' | 'info' {
  switch (status) {
    case 'previous':
      return 'info'
    case 'active':
    case 'live':
      return 'success'
  }
}

interface ArchiveRowProps {
  name: string
  checked: boolean
  onToggle: () => void
  onReveal: () => void
}

function ArchiveRow({ name, checked, onToggle, onReveal }: ArchiveRowProps): React.JSX.Element {
  // Archive names come from disk and may contain spaces — never use them as ids.
  const labelId = useId()
  return (
    <li className="flex items-center gap-2 px-4 py-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <Checkbox aria-labelledby={labelId} checked={checked} onCheckedChange={onToggle} />
        <span id={labelId} className="truncate">
          {name}
        </span>
      </label>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={`Show in folder — ${name}`}
        onClick={onReveal}
      >
        Show in folder
      </Button>
    </li>
  )
}

interface Props {
  league: LeagueNode
  onChanged: () => void | Promise<void>
}

function LeagueView({ league, onChanged }: Props): React.JSX.Element {
  const [newSeason, setNewSeason] = useState(false)
  const [selectedArchives, setSelectedArchives] = useState<string[]>([])
  const [zipping, setZipping] = useState(false)
  const { add } = useKumoToastManager()

  // The tree can change under us (watcher rescans); only names that still
  // exist are actionable, for both the button label and the IPC call.
  const actionable = selectedArchives.filter((name) => league.archivedSeasons.includes(name))

  const toggleArchive = (name: string): void => {
    setSelectedArchives((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    )
  }

  const zipSelected = async (): Promise<void> => {
    if (zipping || actionable.length === 0) return
    const selected = actionable
    setZipping(true)
    try {
      await window.api.zipArchive(league.folderName, selected)
      setSelectedArchives((current) => current.filter((name) => !selected.includes(name)))
      add({
        title: `Zipped ${selected.length} season${selected.length === 1 ? '' : 's'}`,
        variant: 'success'
      })
      await onChanged()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      setZipping(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <Text as="h1" variant="heading" size="lg" truncate>
            {league.meta.name}
          </Text>
          <Text variant="secondary">
            {sentenceCase(league.day)}
            {league.running ? '' : ' · Not running — create a season to start it'}
          </Text>
        </div>
        <Button type="button" variant="primary" onClick={() => setNewSeason(true)}>
          New season…
        </Button>
      </header>

      {[...league.seasons].reverse().map((season) => (
        <section className="grid gap-2" key={season.path}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <Text as="h2" variant="heading" truncate>
                {season.name}
              </Text>
              <Badge variant={seasonBadgeVariant(season.status)}>
                {sentenceCase(season.status)}
              </Badge>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void window.api.revealFile(season.path)}
              aria-label={`Show in folder — ${season.name}`}
            >
              Show in folder
            </Button>
          </div>
          <FileList files={season.files} dropInto={season.path} onImported={onChanged} />
        </section>
      ))}

      {league.otherEntries.length > 0 ? (
        <section className="grid gap-2">
          <div className="flex items-center gap-2">
            <Text as="h2" variant="heading">
              Other files
            </Text>
            <Badge variant="secondary">Not a season</Badge>
          </div>
          <FileList files={league.otherEntries} />
        </section>
      ) : null}

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Text as="h2" variant="heading">
              Archive
            </Text>
            <Badge variant="secondary">
              {`${league.archivedSeasons.length} season${league.archivedSeasons.length === 1 ? '' : 's'}`}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {actionable.length > 0 ? (
              <Button type="button" size="sm" disabled={zipping} onClick={() => void zipSelected()}>
                {zipping ? 'Zipping…' : `Zip ${actionable.length} selected`}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void window.api.revealFile(league.archivePath)}
              aria-label="Show in folder — archive"
            >
              Show in folder
            </Button>
          </div>
        </div>
        <LayerCard>
          <ul>
            {league.archivedSeasons.length === 0 ? (
              <li className="px-4 py-3">
                <Text as="span" variant="secondary">
                  Nothing archived yet
                </Text>
              </li>
            ) : null}
            {league.archivedSeasons.map((name) => (
              <ArchiveRow
                key={name}
                name={name}
                checked={selectedArchives.includes(name)}
                onToggle={() => toggleArchive(name)}
                onReveal={() => void window.api.revealFile(`${league.archivePath}/${name}`)}
              />
            ))}
          </ul>
        </LayerCard>
      </section>

      <NewSeasonDialog
        league={league}
        open={newSeason}
        onOpenChange={setNewSeason}
        onCreated={() => {
          setNewSeason(false)
          void onChanged()
        }}
      />
    </div>
  )
}

export default LeagueView
