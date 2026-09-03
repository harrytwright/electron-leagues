import { useRef, useState } from 'react'
import { Button, DropdownMenu, useKumoToastManager } from '@cloudflare/kumo'
import { CaretUpDownIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon } from '@phosphor-icons/react'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import { revealLabel } from '@renderer/lib/reveal-label'
import type { Props } from './interface'

/** Select-styled menu of the current and recent leagues folders. */
export function LocationSwitcher({ root, onChanged }: Props): React.JSX.Element {
  const [recents, setRecents] = useState<string[]>([])
  const [switching, setSwitching] = useState(false)
  // Fetches settle in any order; only the most recent may land.
  const fetches = useRef(0)
  const { add } = useKumoToastManager()

  // Fetched each time the menu opens: main prunes locations that have gone
  // missing as part of answering. A failure is reported by main itself, and
  // the menu still offers the current root and "New location…".
  const loadRecents = async (): Promise<void> => {
    const ticket = (fetches.current += 1)
    const list = await window.api.recentRoots().catch(() => null)
    if (list && fetches.current === ticket) setRecents(list)
  }

  // A dev override (LEAGUES_ROOT) may not be in the stored list yet.
  const locations = recents.includes(root) ? recents : [root, ...recents]

  const switchTo = async (path: string): Promise<void> => {
    if (path === root || switching) return
    setSwitching(true)
    try {
      const switched = await window.api.setRoot(path)
      if (switched === null) {
        add({ title: 'That folder is no longer available', variant: 'error' })
        await loadRecents()
        return
      }
      await onChanged()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      setSwitching(false)
    }
  }

  const createNew = async (): Promise<void> => {
    try {
      const chosen = await window.api.chooseRoot('init')
      if (chosen) await onChanged()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const reveal = async (): Promise<void> => {
    try {
      await window.api.revealFile(root)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open: boolean) => {
        if (open) void loadRecents()
      }}
    >
      {/* Kumo's Button treats `title` as an accessible name, so the native
          tooltip with the full path goes on a wrapper. */}
      <span title={root} className="block min-w-0">
        <DropdownMenu.Trigger
          render={
            <Button
              variant="ghost"
              className="w-full justify-between overflow-hidden"
              aria-label={`Location: ${pathBasename(root)}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderIcon aria-hidden className="shrink-0" />
                <span className="truncate">{pathBasename(root)}</span>
              </span>
              <CaretUpDownIcon aria-hidden className="shrink-0 text-kumo-subtle" />
            </Button>
          }
        />
      </span>
      <DropdownMenu.Content>
        <DropdownMenu.Group>
          <DropdownMenu.Label>Location</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={root}
            onValueChange={(value) => {
              const chosen = locations.find((path) => path === value)
              if (chosen) void switchTo(chosen)
            }}
          >
            {locations.map((path) => (
              <DropdownMenu.RadioItem key={path} value={path} disabled={switching}>
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate">{pathBasename(path)}</span>
                  <span className="truncate text-sm text-kumo-subtle">{path}</span>
                </span>
                <DropdownMenu.RadioItemIndicator />
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={FolderPlusIcon} onClick={() => void createNew()}>
          New location…
        </DropdownMenu.Item>
        <DropdownMenu.Item icon={FolderOpenIcon} onClick={() => void reveal()}>
          {revealLabel()}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
