import { useState } from 'react'
import type { LeaguesTree } from '@shared/tree'
import { WEEKDAYS, type Weekday } from '@shared/weekday'
import NewLeagueModal from './NewLeagueModal'

export type Selection = { kind: 'shared' } | { kind: 'league'; day: Weekday; folderName: string }

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

interface Props {
  tree: LeaguesTree
  selection: Selection
  onSelect: (selection: Selection) => void
  onChanged: () => void
}

function Sidebar({ tree, selection, onSelect, onChanged }: Props): React.JSX.Element {
  const [creating, setCreating] = useState(false)

  return (
    <nav className="sidebar">
      <button
        className={`item ${selection.kind === 'shared' ? 'selected' : ''}`}
        onClick={() => onSelect({ kind: 'shared' })}
      >
        Shared documents
      </button>

      {WEEKDAYS.map((day) => {
        const leagues = tree.days[day]
        if (leagues.length === 0) return null
        return (
          <div key={day}>
            <div className="day">{title(day)}</div>
            {leagues.map((league) => (
              <button
                key={league.folderName}
                className={`item ${
                  selection.kind === 'league' &&
                  selection.day === day &&
                  selection.folderName === league.folderName
                    ? 'selected'
                    : ''
                }`}
                onClick={() => onSelect({ kind: 'league', day, folderName: league.folderName })}
              >
                {league.meta.name}
                {!league.running && <span className="note">Not running</span>}
              </button>
            ))}
          </div>
        )
      })}

      <div className="footer">
        <button onClick={() => setCreating(true)}>New league…</button>
        <button className="link" onClick={() => void window.api.revealFile(tree.root)}>
          Show leagues folder
        </button>
      </div>

      {creating && (
        <NewLeagueModal
          onClose={() => setCreating(false)}
          onCreated={(day, folderName) => {
            setCreating(false)
            onChanged()
            onSelect({ kind: 'league', day, folderName })
          }}
        />
      )}
    </nav>
  )
}

export default Sidebar
