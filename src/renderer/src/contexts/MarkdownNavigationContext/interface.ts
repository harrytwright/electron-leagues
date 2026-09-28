import type { HelpTarget } from '@shared/help'

export interface MarkdownNavigation {
  /** The topic the document belongs to, so a bare `#anchor` link resolves inside it. */
  topic: string
  navigate: (target: HelpTarget) => void
}
