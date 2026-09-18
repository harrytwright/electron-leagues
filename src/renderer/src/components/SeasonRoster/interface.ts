import type { MembersSnapshot, RosterSeason } from '@shared/members'

export type SeasonRosterTab = 'players' | 'teams' | 'settings'

export interface Props {
  season: RosterSeason
  snapshot: MembersSnapshot
  tab: SeasonRosterTab
}
