import { useRef, useState } from 'react'
import { Button, DropdownMenu, useKumoToastManager } from '@cloudflare/kumo'
import { CaretUpDownIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon } from '@phosphor-icons/react'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import { revealLabel } from '@renderer/lib/reveal-label'
import { useLocationOperation } from '@renderer/hooks/use-location-operation'
import type { Props } from './interface'
import { useAppCommandHandler } from '@renderer/hooks/use-app-commands'
import { appShortcutLabel } from '@renderer/lib/app-shortcut-label'

/** Select-styled menu of the current and recent leagues folders. */
export function LocationSwitcher({ root, onChanged }: Props): React.JSX.Element {
  const [recents, setRecents] = useState<string[]>([])
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
  const locationOperation = useLocationOperation({ root, onChanged, onMissingRecent: loadRecents })
  const openLocation = (): void => void locationOperation.choose('select')
  useAppCommandHandler('open-location', openLocation)

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
              if (chosen) void locationOperation.switchTo(chosen)
            }}
          >
            {locations.map((path) => (
              <DropdownMenu.RadioItem key={path} value={path} disabled={locationOperation.busy}>
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
        <DropdownMenu.Item
          icon={FolderOpenIcon}
          disabled={locationOperation.busy}
          onClick={openLocation}
        >
          Open location…
          <DropdownMenu.Shortcut aria-hidden>{appShortcutLabel('O')}</DropdownMenu.Shortcut>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          icon={FolderPlusIcon}
          disabled={locationOperation.busy}
          onClick={() => void locationOperation.choose('init')}
        >
          New location…
        </DropdownMenu.Item>
        <DropdownMenu.Item icon={FolderOpenIcon} onClick={() => void reveal()}>
          {revealLabel()}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
