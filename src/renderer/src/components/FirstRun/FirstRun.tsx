import { useEffect, useRef, useState } from 'react'
import { Button, Text } from '@cloudflare/kumo'
import { FolderIcon } from '@phosphor-icons/react/dist/csr/Folder'
import { pathBasename } from '@renderer/lib/path-basename'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useLocationOperation } from '@renderer/hooks/use-location-operation'
import type { Mode, Props } from './interface'

export function FirstRun({ onChosen }: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode | null>(null)
  const [recents, setRecents] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const loads = useRef(0)

  const loadRecents = async (): Promise<void> => {
    const ticket = (loads.current += 1)
    try {
      const roots = await window.api.recentRoots()
      if (ticket === loads.current) setRecents(roots)
    } catch (caught) {
      if (ticket === loads.current) setError(ipcErrorMessage(caught))
    }
  }

  useEffect(() => {
    // The async call only updates state after its IPC promise settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecents()
    return () => {
      loads.current += 1
    }
  }, [])

  const locationOperation = useLocationOperation({
    root: '',
    onChanged: onChosen,
    onMissingRecent: loadRecents
  })

  const choose = async (mode: Mode): Promise<void> => {
    if (locationOperation.busy) return
    setError(null)
    setMode(mode)
    try {
      await locationOperation.choose(mode)
    } finally {
      setMode(null)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-kumo-base px-6 py-5">
      <section className="grid max-h-full w-full max-w-lg gap-4 overflow-hidden rounded-lg bg-kumo-elevated px-5 py-4 ring ring-kumo-line">
        <div className="grid gap-1.5 text-left">
          <Text as="h1" variant="heading">
            Bowling league documents
          </Text>
          <Text variant="secondary">
            Open your leagues folder, create a new location, or continue from a recent location.
          </Text>
        </div>
        <div className="flex gap-3">
          <Button
            variant="primary"
            loading={mode === 'select'}
            disabled={locationOperation.busy}
            onClick={() => void choose('select')}
          >
            {mode === 'select' ? 'Opening…' : 'Open location…'}
          </Button>
          <Button
            loading={mode === 'init'}
            disabled={locationOperation.busy}
            onClick={() => void choose('init')}
          >
            {mode === 'init' ? 'Creating…' : 'New location…'}
          </Button>
        </div>
        {recents.length > 0 ? (
          <div className="grid min-h-0 gap-1.5 overflow-hidden border-t border-kumo-line pt-3">
            <Text as="h2" variant="heading3">
              Recent locations
            </Text>
            <div className="grid gap-1 overflow-auto">
              {recents.map((path) => (
                <Button
                  key={path}
                  variant="ghost"
                  className="h-auto justify-start px-3 py-2 text-left"
                  disabled={locationOperation.busy}
                  onClick={() => {
                    setError(null)
                    void locationOperation.switchTo(path)
                  }}
                >
                  <FolderIcon aria-hidden className="shrink-0" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate">{pathBasename(path)}</span>
                    <span className="truncate text-sm text-kumo-subtle">{path}</span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {error ? (
          <Text role="alert" variant="error" DANGEROUS_className="overflow-auto">
            {error}
          </Text>
        ) : null}
      </section>
    </div>
  )
}
