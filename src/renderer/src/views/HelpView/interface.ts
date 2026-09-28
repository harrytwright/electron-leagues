import type { HelpTarget } from '@shared/help'
import type { HelpTopic } from '@renderer/lib/help/topics'

export interface Props {
  topics: readonly HelpTopic[]
  /** From the window's query string; later targets arrive over `onHelpNavigate`. */
  initialTarget: HelpTarget | null
  onTopicViewed?: (topic: string) => void
}
