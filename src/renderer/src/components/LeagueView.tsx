import { useState } from 'react'
import type { LeagueNode } from '@shared/tree'
import FileList from './FileList'
import NewSeasonModal from './NewSeasonModal'

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

interface Props {
  league: LeagueNode
  onChanged: () => void
}

function LeagueView({ league, onChanged }: Props): React.JSX.Element {
  const [newSeason, setNewSeason] = useState(false)
  const [selectedArchives, setSelectedArchives] = useState<string[]>([])
  const [zipping, setZipping] = useState(false)

  const toggleArchive = (name: string): void => {
    setSelectedArchives((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    )
  }

  const zipSelected = async (): Promise<void> => {
    setZipping(true)
    try {
      await window.api.zipArchive(league.folderName, selectedArchives)
      setSelectedArchives([])
      onChanged()
    } finally {
      setZipping(false)
    }
  }

  return (
    <>
      <header>
        <div>
          <h1>{league.meta.name}</h1>
          <div className="sub">
            {title(league.day)}
            {league.running ? '' : ' · Not running — create a season to start it'}
          </div>
        </div>
        <button className="primary" onClick={() => setNewSeason(true)}>
          New season…
        </button>
      </header>

      {[...league.seasons].reverse().map((season) => (
        <section className="section" key={season.path}>
          <div className="section-head">
            <h2>
              {season.name}
              <span className={`badge ${season.status}`}>{title(season.status)}</span>
            </h2>
            <button className="link" onClick={() => void window.api.revealFile(season.path)}>
              Show in folder
            </button>
          </div>
          <FileList files={season.files} dropInto={season.path} onImported={onChanged} />
        </section>
      ))}

      {league.otherEntries.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              Other files<span className="badge">Not a season</span>
            </h2>
          </div>
          <FileList files={league.otherEntries} />
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>
            Archive
            <span className="badge">
              {league.archivedSeasons.length} season{league.archivedSeasons.length === 1 ? '' : 's'}
            </span>
          </h2>
          <div>
            {selectedArchives.length > 0 && (
              <button disabled={zipping} onClick={() => void zipSelected()}>
                {zipping ? 'Zipping…' : `Zip ${selectedArchives.length} selected`}
              </button>
            )}{' '}
            <button className="link" onClick={() => void window.api.revealFile(league.archivePath)}>
              Show in folder
            </button>
          </div>
        </div>
        <ul className="file-list">
          {league.archivedSeasons.length === 0 && (
            <li>
              <span className="empty">Nothing archived yet</span>
            </li>
          )}
          {league.archivedSeasons.map((name) => (
            <li key={name}>
              <input
                type="checkbox"
                checked={selectedArchives.includes(name)}
                onChange={() => toggleArchive(name)}
              />
              <span
                className="name"
                onClick={() => void window.api.revealFile(`${league.archivePath}/${name}`)}
              >
                {name}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {newSeason && (
        <NewSeasonModal
          league={league}
          onClose={() => setNewSeason(false)}
          onCreated={() => {
            setNewSeason(false)
            onChanged()
          }}
        />
      )}
    </>
  )
}

export default LeagueView
