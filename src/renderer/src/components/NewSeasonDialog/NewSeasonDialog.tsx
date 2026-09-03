import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Input, Select, Text } from '@cloudflare/kumo'
import { parseSeasonName, suggestSeasonName, type SeasonType } from '@shared/season'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import type { Props, SeasonTypeOption, Source } from './interface'

const TYPES: ReadonlyArray<SeasonTypeOption> = [
  { value: 'cross-year', label: 'Cross-year', example: '2025-26' },
  { value: 'full-year', label: 'Full year', example: '2025' },
  { value: 'quarter', label: 'Quarter', example: '2026-Q1' }
]

const TYPE_ITEMS = TYPES.map((item) => ({
  value: item.value,
  label: `${item.label} (e.g. ${item.example})`
}))

const SOURCES = ['templates', 'previous', 'empty'] as const

const RUNNING_SOURCE_ITEMS = {
  templates: 'Copy from templates',
  previous: 'Copy from previous season',
  empty: 'Start empty'
}

const STOPPED_SOURCE_ITEMS = {
  templates: 'Copy from templates',
  previous: {
    label: 'Copy from previous season',
    disabled: true
  },
  empty: 'Start empty'
}

function isSeasonType(value: string): value is SeasonType {
  return TYPES.some((type) => type.value === value)
}

function isSource(value: string): value is Source {
  return SOURCES.some((source) => source === value)
}

export function NewSeasonDialog({
  league,
  open,
  onOpenChange,
  onCreated
}: Props): React.JSX.Element {
  const latestSeasonName = league.seasons.at(-1)?.name
  const current = latestSeasonName ? parseSeasonName(latestSeasonName) : null
  const initialType = current?.type ?? 'cross-year'
  const [type, setType] = useState<SeasonType>(initialType)
  const [name, setName] = useState(() => suggestSeasonName(initialType, current, new Date()))
  const [source, setSource] = useState<Source>(league.running ? 'previous' : 'templates')
  const [archiveOldest, setArchiveOldest] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const wasOpen = useRef(false)
  // Bumped on every open so a create left pending across close/reopen can
  // never write its stale outcome onto the fresh form.
  const submission = useRef(0)

  useEffect(() => {
    // Reset only on the closed→open transition — a tree refresh while the
    // dialog is open must not wipe what the user has typed.
    const justOpened = open && !wasOpen.current
    wasOpen.current = open
    if (!justOpened) return
    submission.current += 1
    const latest = latestSeasonName ? parseSeasonName(latestSeasonName) : null
    const nextType = latest?.type ?? 'cross-year'
    setType(nextType)
    setName(suggestSeasonName(nextType, latest, new Date()))
    setSource(league.running ? 'previous' : 'templates')
    setArchiveOldest(true)
    setError(null)
    setBusy(false)
  }, [league.running, latestSeasonName, open])

  const parsed = parseSeasonName(name)
  const oldest = league.seasons[0]
  const willArchive = league.seasons.length >= 2 ? oldest : null

  const changeType = (nextType: SeasonType): void => {
    setType(nextType)
    setName(suggestSeasonName(nextType, current, new Date()))
    setError(null)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    if (!parsed || parsed.type !== type) {
      const typeLabel = TYPES.find((item) => item.value === type)?.label.toLowerCase() ?? type
      setError(`Not a valid ${typeLabel} season name`)
      nameRef.current?.focus()
      return
    }

    const ticket = (submission.current += 1)
    setBusy(true)
    setError(null)
    try {
      await window.api.createSeason({
        day: league.day,
        leagueFolder: league.folderName,
        seasonName: parsed.name,
        source,
        // Never ask main to archive when the option was never shown.
        archiveOldest: willArchive ? archiveOldest : false
      })
      if (submission.current !== ticket) return
      setBusy(false)
      onCreated()
    } catch (caught) {
      if (submission.current !== ticket) return
      setError(ipcErrorMessage(caught))
      setBusy(false)
      nameRef.current?.focus()
    }
  }

  const handleOpenChange = (next: boolean): void => {
    if (busy && !next) return
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog size="lg" className="p-6">
        <div className="mb-6 grid gap-1.5">
          <Dialog.Title>New season — {league.meta.name}</Dialog.Title>
          <Dialog.Description className="text-kumo-subtle">
            Choose the season name and starting documents.
          </Dialog.Description>
        </div>

        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Select
            label="Season type"
            value={type}
            items={TYPE_ITEMS}
            onValueChange={(value) => {
              if (value && isSeasonType(value)) changeType(value)
            }}
          />

          <Input
            ref={nameRef}
            label="Season name"
            name="season-name"
            autoComplete="off"
            autoFocus
            value={name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-season-error' : undefined}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
          />

          <Select
            label="Starting documents"
            value={source}
            items={league.running ? RUNNING_SOURCE_ITEMS : STOPPED_SOURCE_ITEMS}
            onValueChange={(value) => {
              if (value && isSource(value)) setSource(value)
            }}
          />

          {willArchive ? (
            <Checkbox
              label={`Archive “${willArchive.name}” (moves it to _archives)`}
              checked={archiveOldest}
              onCheckedChange={setArchiveOldest}
            />
          ) : null}

          {error ? (
            <Text id="new-season-error" variant="error" role="alert">
              {error}
            </Text>
          ) : null}

          <div className="flex justify-end gap-2">
            <Dialog.Close
              render={(props) => (
                <Button {...props} type="button" variant="secondary" disabled={busy}>
                  Cancel
                </Button>
              )}
            />
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create season'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  )
}
