import { useRef, useState } from 'react'
import { Button, Text } from '@cloudflare/kumo'
import { FolderIcon } from '@phosphor-icons/react/dist/csr/Folder'
import { LocationRow } from '../LocationRow/LocationRow'
import { useRecentRoots } from '@renderer/hooks/use-recent-roots'
import { useLocationOperation } from '@renderer/hooks/use-location-operation'
import type { Mode } from './interface'

export function FirstRun(): React.JSX.Element {
  const [mode, setMode] = useState<Mode | null>(null)
  const [openedPath, setOpenedPath] = useState<string | null>(null)
  const { roots: recents, error } = useRecentRoots({ enabled: true })
  // Context owns operation concurrency; this ref only keeps a rejected second click
  // from clearing the first click's row-specific loading indicator.
  const showingOperation = useRef(false)

  const locationOperation = useLocationOperation()

  const choose = async (mode: Mode): Promise<void> => {
    if (locationOperation.busy || showingOperation.current) return
    showingOperation.current = true
    setMode(mode)
    try {
      await locationOperation.choose(mode)
    } finally {
      showingOperation.current = false
      setMode(null)
    }
  }

  const openRecent = async (path: string): Promise<void> => {
    if (locationOperation.busy || showingOperation.current) return
    showingOperation.current = true
    setOpenedPath(path)
    try {
      await locationOperation.switchTo(path)
    } finally {
      showingOperation.current = false
      setOpenedPath(null)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-kumo-base px-6 py-5">
      <section className="grid max-h-full w-full max-w-lg gap-4 overflow-hidden rounded-lg bg-kumo-elevated px-5 py-4 ring ring-kumo-line">
        <div className="grid gap-1.5 text-left">
          <Text as="h1" variant="heading" size="lg">
            Bowling league documents
          </Text>
          <Text variant="secondary">
            Pick the leagues folder inside your OneDrive, or create a new one — the app creates the
            shared, templates and archive folders for you.
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
        {recents && recents.length > 0 ? (
          <div className="grid min-h-0 gap-1.5 overflow-hidden border-t border-kumo-line pt-3">
            <Text as="h2" variant="heading">
              Recent locations
            </Text>
            <div className="grid gap-1 overflow-auto">
              {recents.map((path) => (
                <Button
                  key={path}
                  variant="ghost"
                  className="h-auto items-start justify-start px-3 py-2 text-left"
                  loading={openedPath === path}
                  disabled={locationOperation.busy}
                  onClick={() => void openRecent(path)}
                >
                  <span className="flex h-lh items-center">
                    <FolderIcon aria-hidden className="shrink-0" />
                  </span>
                  <LocationRow path={path} />
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="overflow-auto">
            <Text role="alert" variant="error">
              {error}
            </Text>
          </div>
        ) : null}
      </section>
    </div>
  )
}
