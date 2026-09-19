import type { MarkdownInput } from '@tanstack/markdown'
import type { MarkdownNavigation } from '@renderer/contexts/MarkdownNavigationContext'

export type { MarkdownNavigation } from '@renderer/contexts/MarkdownNavigationContext'

export interface MarkdownProps {
  document: MarkdownInput
  /** Without navigation, topic and anchor links render as plain anchors. */
  navigation?: MarkdownNavigation
  className?: string
}
