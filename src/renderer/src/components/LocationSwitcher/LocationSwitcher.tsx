import { useState } from 'react'
import { Button, DropdownMenu, useKumoToastManager } from '@cloudflare/kumo'
import {
  CaretUpDownIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  WrenchIcon
} from '@phosphor-icons/react'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import { revealLabel } from '@renderer/lib/reveal-label'
import { useLocationOperation } from '@renderer/hooks/use-location-operation'
import { LocationRow } from '../LocationRow/LocationRow'
import { useRecentRoots } from '@renderer/hooks/use-recent-roots'
import type { Props } from './interface'
import { appShortcutLabel } from '@renderer/lib/app-shortcut-label'

/** Select-styled menu of the current and recent leagues folders. */
export function LocationSwitcher({ root }: Props): React.JSX.Element {
  const [opened, setOpened] = useState(false)
  const { roots, error, reload } = useRecentRoots({ enabled: opened })
  const recents = roots ?? []
  const [repairing, setRepairing] = useState(false)
  const { add } = useKumoToastManager()

  // A dev override (LEAGUES_ROOT) may not be in the stored list yet.
  const locations = recents.includes(root) ? recents : [root, ...recents]
  const locationOperation = useLocationOperation()
  const openLocation = (): void => void locationOperation.choose('select')

  const reveal = async (): Promise<void> => {
    try {
      await window.api.revealFile(root)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const repair = async (): Promise<void> => {
    if (repairing) return
    setRepairing(true)
    try {
      const result = await window.api.repairLocation()
      add({
        title:
          result.repaired.length === 0
            ? 'Nothing to repair'
            : `Repaired ${result.repaired.join(', ')}`,
        variant: 'success'
      })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      setRepairing(false)
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open: boolean) => {
        if (open) {
          if (opened) reload()
          else setOpened(true)
        }
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
              if (chosen) {
                void locationOperation.switchTo(chosen)
              }
            }}
          >
            {locations.map((path) => (
              <DropdownMenu.RadioItem key={path} value={path} disabled={locationOperation.busy}>
                <LocationRow path={path} />
                <DropdownMenu.RadioItemIndicator />
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {error ? <DropdownMenu.Item disabled>{error}</DropdownMenu.Item> : null}
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
        <DropdownMenu.Item icon={WrenchIcon} disabled={repairing} onClick={() => void repair()}>
          Repair location…
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
