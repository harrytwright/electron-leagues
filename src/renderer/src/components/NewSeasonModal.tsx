import { useMemo, useState } from 'react'
import { parseSeasonName, suggestSeasonName, type SeasonType } from '@shared/season'
import type { LeagueNode } from '@shared/tree'

const TYPES: { value: SeasonType; label: string; example: string }[] = [
  { value: 'cross-year', label: 'Cross-year', example: '2025-26' },
  { value: 'full-year', label: 'Full year', example: '2025' },
  { value: 'quarter', label: 'Quarter', example: '2026-Q1' }
]

const SOURCES = ['templates', 'previous', 'empty'] as const
type Source = (typeof SOURCES)[number]

function isSeasonType(value: string): value is SeasonType {
  return TYPES.some((t) => t.value === value)
}

function isSource(value: string): value is Source {
  return SOURCES.some((s) => s === value)
}

interface Props {
  league: LeagueNode
  onClose: () => void
  onCreated: () => void
}

function NewSeasonModal({ league, onClose, onCreated }: Props): React.JSX.Element {
  const current = useMemo(() => {
    const active = league.seasons.at(-1)
    return active ? parseSeasonName(active.name) : null
  }, [league])

  const [type, setType] = useState<SeasonType>(current?.type ?? 'cross-year')
  const [name, setName] = useState(() => suggestSeasonName(type, current, new Date()))
  const [source, setSource] = useState<Source>(league.running ? 'previous' : 'templates')
  const [archiveOldest, setArchiveOldest] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsed = parseSeasonName(name)
  const oldest = league.seasons[0]
  const willArchive = league.seasons.length >= 2 ? oldest : null

  const changeType = (next: SeasonType): void => {
    setType(next)
    setName(suggestSeasonName(next, current, new Date()))
  }

  const create = async (): Promise<void> => {
    if (!parsed || parsed.type !== type) {
      setError(
        `Not a valid ${TYPES.find((t) => t.value === type)?.label.toLowerCase()} season name`
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.api.createSeason({
        day: league.day,
        leagueFolder: league.folderName,
        seasonName: parsed.name,
        source,
        archiveOldest
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New season — {league.meta.name}</h2>

        <label>
          Season type
          <select
            value={type}
            onChange={(e) => isSeasonType(e.target.value) && changeType(e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} (e.g. {t.example})
              </option>
            ))}
          </select>
        </label>

        <label>
          Season name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label>
          Starting documents
          <select
            value={source}
            onChange={(e) => isSource(e.target.value) && setSource(e.target.value)}
          >
            <option value="templates">Copy from templates</option>
            <option value="previous" disabled={!league.running}>
              Copy from previous season
            </option>
            <option value="empty">Start empty</option>
          </select>
        </label>

        {willArchive && (
          <label className="check">
            <input
              type="checkbox"
              checked={archiveOldest}
              onChange={(e) => setArchiveOldest(e.target.checked)}
            />
            Archive “{willArchive.name}” (moves it to _archives)
          </label>
        )}

        {error && <div className="error">{error}</div>}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !parsed} onClick={() => void create()}>
            Create season
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewSeasonModal
