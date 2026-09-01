import { useState } from 'react'
import { Button, Sidebar as KumoSidebar, Text } from '@cloudflare/kumo'
import { FilesIcon, FolderOpenIcon, FolderPlusIcon, UsersThreeIcon } from '@phosphor-icons/react'
import type { LeaguesTree } from '@shared/tree'
import { WEEKDAYS } from '@shared/weekday'
import { HOME, type Selection } from '../lib/selection'
import NewLeagueDialog from './NewLeagueDialog'

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

interface Props {
  tree: LeaguesTree
  selection: Selection
  onSelect: (selection: Selection) => void
  /** May be async — creation waits for the rescan before selecting the new league. */
  onChanged: () => void | Promise<void>
}

function Sidebar({ tree, selection, onSelect, onChanged }: Props): React.JSX.Element {
  const [creating, setCreating] = useState(false)

  return (
    <KumoSidebar role="navigation" aria-label="Leagues" className="select-none">
      <KumoSidebar.Content>
        <KumoSidebar.Group>
          <KumoSidebar.Menu>
            <KumoSidebar.MenuButton
              icon={FilesIcon}
              tooltip="Shared documents"
              active={selection.kind === 'home'}
              aria-current={selection.kind === 'home' ? 'true' : undefined}
              onClick={() => onSelect(HOME)}
            >
              Shared documents
            </KumoSidebar.MenuButton>
          </KumoSidebar.Menu>
        </KumoSidebar.Group>

        {WEEKDAYS.map((day) => {
          const leagues = tree.days[day]
          if (leagues.length === 0) return null

          return (
            <KumoSidebar.Group key={day}>
              <KumoSidebar.GroupLabel>{title(day)}</KumoSidebar.GroupLabel>
              <KumoSidebar.Menu>
                {leagues.map((league) => {
                  const active =
                    selection.kind === 'league' &&
                    selection.day === day &&
                    selection.folderName === league.folderName

                  return (
                    <KumoSidebar.MenuButton
                      key={league.folderName}
                      icon={UsersThreeIcon}
                      tooltip={league.meta.name}
                      active={active}
                      aria-current={active ? 'true' : undefined}
                      aria-label={league.running ? undefined : `${league.meta.name}, not running`}
                      onClick={() =>
                        onSelect({ kind: 'league', day, folderName: league.folderName })
                      }
                    >
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <Text as="span" truncate>
                          {league.meta.name}
                        </Text>
                        {!league.running ? (
                          <Text as="span" size="sm" variant="secondary" aria-hidden="true">
                            Not running
                          </Text>
                        ) : null}
                      </span>
                    </KumoSidebar.MenuButton>
                  )
                })}
              </KumoSidebar.Menu>
            </KumoSidebar.Group>
          )
        })}
      </KumoSidebar.Content>

      <KumoSidebar.Footer className="h-auto flex-col items-stretch gap-2 p-3">
        <Button
          aria-label="New league"
          className="w-full justify-start overflow-hidden group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"
          icon={<FolderPlusIcon aria-hidden />}
          variant="primary"
          onClick={() => setCreating(true)}
        >
          <span className="truncate group-data-[state=collapsed]/sidebar:hidden">New league…</span>
        </Button>
        <Button
          aria-label="Show leagues folder"
          className="w-full justify-start overflow-hidden group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0"
          icon={<FolderOpenIcon aria-hidden />}
          variant="ghost"
          onClick={() => void window.api.revealFile(tree.root)}
        >
          <span className="truncate group-data-[state=collapsed]/sidebar:hidden">
            Show leagues folder
          </span>
        </Button>
        <KumoSidebar.Trigger className="self-start group-data-[state=collapsed]/sidebar:self-center" />
      </KumoSidebar.Footer>

      <NewLeagueDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(day, folderName) => {
          setCreating(false)
          // Wait for the rescan so the new league exists in the tree before it
          // becomes the selection — selecting early flashes the shared view.
          void (async () => {
            await onChanged()
            onSelect({ kind: 'league', day, folderName })
          })()
        }}
      />
    </KumoSidebar>
  )
}

export default Sidebar
