import { useState } from 'react'
import { Sidebar, Text, useSidebar } from '@cloudflare/kumo'

import { sentenceCase } from '@renderer/lib/sentence-case'
import { loadCollapsedDays, saveCollapsedDays } from '@renderer/lib/local-store'
import { WEEKDAYS, type Weekday } from '@shared/weekday'

import type { Props } from './interface'

const WEEKDAY_ABBREVIATIONS: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun'
}

function toggled(days: ReadonlySet<Weekday>, day: Weekday): Set<Weekday> {
  const next = new Set(days)
  if (next.has(day)) next.delete(day)
  else next.add(day)
  return next
}

export function Content({ tree, selection, onSelect }: Props): React.JSX.Element {
  const { state, setOpen } = useSidebar()

  // Remembered per location; App remounts this component when the location
  // changes, so the initialiser reads the right one.
  const [collapsedDays, setCollapsedDays] = useState(
    () => new Set<Weekday>(loadCollapsedDays(tree.root))
  )
  const daysWithLeagues = WEEKDAYS.filter((day) => tree.days[day].length > 0)
  const rail = state === 'collapsed'

  return (
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.GroupLabel>Leagues</Sidebar.GroupLabel>
        {daysWithLeagues.length === 0 ? (
          <div className="px-2 py-1">
            <Text variant="secondary" size="sm">
              No leagues yet — create one from Home.
            </Text>
          </div>
        ) : (
          <Sidebar.Menu>
            {daysWithLeagues.map((day) => (
              <Sidebar.MenuItem key={day}>
                <Sidebar.Collapsible
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
                  <Sidebar.CollapsibleTrigger
                    render={
                      <Sidebar.MenuButton
                        icon={
                          <span
                            aria-hidden="true"
                            className="inline-flex w-6 shrink-0 items-center justify-center text-[11px]/none font-medium text-kumo-subtle"
                          >
                            {WEEKDAY_ABBREVIATIONS[day]}
                          </span>
                        }
                        tooltip={sentenceCase(day)}
                        onClick={() => {
                          if (rail) setOpen(true)
                          else saveCollapsedDays(tree.root, [...toggled(collapsedDays, day)])
                        }}
                      >
                        {sentenceCase(day)}
                        <Sidebar.MenuChevron />
                      </Sidebar.MenuButton>
                    }
                  />
                  <Sidebar.CollapsibleContent>
                    <Sidebar.MenuSub>
                      {tree.days[day].map((league) => {
                        const active =
                          selection.kind === 'league' &&
                          selection.day === day &&
                          selection.folderName === league.folderName

                        return (
                          <Sidebar.MenuSubButton
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
                            {league.meta.name}
                            {!league.running ? (
                              <Sidebar.MenuBadge>Not running</Sidebar.MenuBadge>
                            ) : null}
                          </Sidebar.MenuSubButton>
                        )
                      })}
                    </Sidebar.MenuSub>
                  </Sidebar.CollapsibleContent>
                </Sidebar.Collapsible>
              </Sidebar.MenuItem>
            ))}
          </Sidebar.Menu>
        )}
      </Sidebar.Group>
    </Sidebar.Content>
  )
}
