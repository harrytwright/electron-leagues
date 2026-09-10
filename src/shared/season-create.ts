import type { Weekday } from './weekday'
import type { WorkflowId } from './workflows'

export interface SeasonCreateRequest {
  day: Weekday
  leagueFolder: string
  seasonName: string
  source: WorkflowId
  archiveOldest: boolean
}
