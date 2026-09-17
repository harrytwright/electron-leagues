import type { MarkdownInput } from '@tanstack/markdown'
import type { HelpTarget } from '@shared/help'

export interface MarkdownNavigation {
  /** The topic the document belongs to, so a bare `#anchor` link resolves inside it. */
  topic: string
  navigate: (target: HelpTarget) => void
}

export interface MarkdownProps {
  document: MarkdownInput
  /** Without navigation, topic and anchor links render as plain anchors. */
  navigation?: MarkdownNavigation
  className?: string
}
