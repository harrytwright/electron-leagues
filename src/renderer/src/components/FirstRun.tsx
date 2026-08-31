import { useState } from 'react'

function FirstRun({ onChosen }: { onChosen: () => void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  const choose = async (mode: 'select' | 'init'): Promise<void> => {
    setBusy(true)
    try {
      const root = await window.api.chooseRoot(mode)
      if (root) onChosen()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="first-run">
      <h1>Bowling league documents</h1>
      <p>
        Pick the leagues folder inside your OneDrive to get started, or initialise a brand new one —
        the app will create the shared, templates and archive folders for you.
      </p>
      <div className="choices">
        <button className="primary" disabled={busy} onClick={() => void choose('select')}>
          Select existing folder
        </button>
        <button disabled={busy} onClick={() => void choose('init')}>
          Initialise new folder
        </button>
      </div>
    </div>
  )
}

export default FirstRun
