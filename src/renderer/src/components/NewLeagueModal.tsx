import { useState } from 'react'
import { sanitiseFolderName } from '@shared/sanitise'
import { WEEKDAYS, type Weekday } from '@shared/weekday'

interface Props {
  onClose: () => void
  onCreated: (day: Weekday, folderName: string) => void
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function NewLeagueModal({ onClose, onCreated }: Props): React.JSX.Element {
  const [day, setDay] = useState<Weekday>('monday')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const folderName = sanitiseFolderName(name)

  const create = async (): Promise<void> => {
    if (!folderName) {
      setError('That name cannot be used as a folder name')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await window.api.createLeague(day, name)
      onCreated(day, folderName)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New league</h2>
        <label>
          League night
          <select value={day} onChange={(e) => setDay(e.target.value as Weekday)}>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {title(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          League name
          <input
            type="text"
            value={name}
            autoFocus
            placeholder="e.g. Mens Triples"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {name && folderName && folderName !== name.trim() && (
          <div className="hint">Folder will be named “{folderName}”</div>
        )}
        {error && <div className="error">{error}</div>}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !name.trim()} onClick={() => void create()}>
            Create league
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewLeagueModal
