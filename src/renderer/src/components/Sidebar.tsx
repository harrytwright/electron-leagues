import { useState } from 'react'
import { Sidebar as KumoSidebar, Text, useSidebar } from '@cloudflare/kumo'
import { CalendarBlankIcon, HouseIcon } from '@phosphor-icons/react'
import type { LeaguesTree } from '@shared/tree'
import { WEEKDAYS, type Weekday } from '@shared/weekday'
import { loadCollapsedDays, saveCollapsedDays } from '../lib/local-store'
import { HOME, type Selection } from '../lib/selection'
import { sentenceCase } from '../lib/sentence-case'
import LocationSwitcher from './LocationSwitcher'

interface Props {
  tree: LeaguesTree
  selection: Selection
  onSelect: (selection: Selection) => void
  /** The location or its contents changed; the caller rescans. */
  onChanged: () => void | Promise<void>
}

function toggled(days: ReadonlySet<Weekday>, day: Weekday): Set<Weekday> {
  const next = new Set(days)
  if (next.has(day)) next.delete(day)
  else next.add(day)
  return next
}

function Sidebar({ tree, selection, onSelect, onChanged }: Props): React.JSX.Element {
  const { state, setOpen } = useSidebar()
  // Remembered per location; App remounts this component when the location
  // changes, so the initialiser reads the right one.
  const [collapsedDays, setCollapsedDays] = useState(
    () => new Set<Weekday>(loadCollapsedDays(tree.root))
  )
  const daysWithLeagues = WEEKDAYS.filter((day) => tree.days[day].length > 0)
  const rail = state === 'collapsed'

  return (
    <KumoSidebar role="navigation" aria-label="Leagues" className="select-none">
      <KumoSidebar.Header className="px-2">
        <LocationSwitcher root={tree.root} onChanged={onChanged} />
      </KumoSidebar.Header>

      <KumoSidebar.Content>
        <KumoSidebar.Group>
          <KumoSidebar.Menu>
            <KumoSidebar.MenuButton
              icon={HouseIcon}
              tooltip="Home"
              active={selection.kind === 'home'}
              aria-current={selection.kind === 'home' ? 'true' : undefined}
              onClick={() => onSelect(HOME)}
            >
              Home
            </KumoSidebar.MenuButton>
          </KumoSidebar.Menu>
        </KumoSidebar.Group>

        <KumoSidebar.Group>
          <KumoSidebar.GroupLabel>Leagues</KumoSidebar.GroupLabel>
          {daysWithLeagues.length === 0 ? (
            <div className="px-2 py-1">
              <Text variant="secondary" size="sm">
                No leagues yet — create one from Home.
              </Text>
            </div>
          ) : (
            <KumoSidebar.Menu>
              {daysWithLeagues.map((day) => (
                <KumoSidebar.MenuItem key={day}>
                  {/* Kumo also toggles on focus traversal; only a click is a
                      choice worth remembering. In the icon rail the day can't
                      expand, so a click expands the sidebar instead. */}
                  <KumoSidebar.Collapsible
                    open={!collapsedDays.has(day)}
                    onOpenChange={(open) => {
                      if (rail) return
                      setCollapsedDays((current) => {
                        const next = new Set(current)
                        if (open) next.delete(day)
                        else next.add(day)
                        return next
                      })
                    }}
                  >
                    <KumoSidebar.CollapsibleTrigger
                      render={
                        <KumoSidebar.MenuButton
                          icon={CalendarBlankIcon}
                          tooltip={sentenceCase(day)}
                          onClick={() => {
                            if (rail) setOpen(true)
                            else saveCollapsedDays(tree.root, [...toggled(collapsedDays, day)])
                          }}
                        >
                          {sentenceCase(day)}
                          <KumoSidebar.MenuChevron />
                        </KumoSidebar.MenuButton>
                      }
                    />
                    <KumoSidebar.CollapsibleContent>
                      <KumoSidebar.MenuSub>
                        {tree.days[day].map((league) => {
                          const active =
                            selection.kind === 'league' &&
                            selection.day === day &&
                            selection.folderName === league.folderName
                          return (
                            <KumoSidebar.MenuSubButton
                              key={league.folderName}
                              active={active}
                              aria-current={active ? 'true' : undefined}
                              aria-label={
                                league.running ? undefined : `${league.meta.name}, not running`
                              }
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
                            </KumoSidebar.MenuSubButton>
                          )
                        })}
                      </KumoSidebar.MenuSub>
                    </KumoSidebar.CollapsibleContent>
                  </KumoSidebar.Collapsible>
                </KumoSidebar.MenuItem>
              ))}
            </KumoSidebar.Menu>
          )}
        </KumoSidebar.Group>
      </KumoSidebar.Content>

      <KumoSidebar.Footer>
        <KumoSidebar.Trigger />
      </KumoSidebar.Footer>
    </KumoSidebar>
  )
}

export default Sidebar
