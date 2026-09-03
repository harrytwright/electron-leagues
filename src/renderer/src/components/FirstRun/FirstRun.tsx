import { useState } from 'react'
import { Button, Text } from '@cloudflare/kumo'
import type { Mode, Props } from './interface'

export function FirstRun({ onChosen }: Props): React.JSX.Element {
  const [busy, setBusy] = useState<Mode | null>(null)

  const choose = async (mode: Mode): Promise<void> => {
    setBusy(mode)
    try {
      const root = await window.api.chooseRoot(mode)
      if (root) onChosen()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-kumo-base">
      <div className="grid max-w-md gap-1.5 text-center">
        <Text as="h1" variant="heading" size="lg">
          Bowling league documents
        </Text>
        <Text variant="secondary">
          Pick the leagues folder inside your OneDrive to get started, or initialise a brand new one
          — the app creates the shared, templates and archive folders for you.
        </Text>
      </div>
      <div className="flex gap-3">
        <Button
          variant="primary"
          loading={busy === 'select'}
          disabled={busy !== null}
          onClick={() => void choose('select')}
        >
          {busy === 'select' ? 'Opening…' : 'Select existing folder'}
        </Button>
        <Button
          loading={busy === 'init'}
          disabled={busy !== null}
          onClick={() => void choose('init')}
        >
          {busy === 'init' ? 'Initialising…' : 'Initialise new folder'}
        </Button>
      </div>
    </div>
  )
}
