import type { HelpTarget } from '@shared/help'

/**
 * Every place the main window links into help. Each anchor is a heading id in
 * `resources/docs`, and a test holds the two in step so renaming a heading
 * cannot silently strand a link.
 */
export const HELP_LINKS = {
  seasonNames: { topic: 'seasons', anchor: 'season-names' },
  archiving: { topic: 'seasons', anchor: 'archiving' },
  locations: { topic: 'getting-started', anchor: 'locations' }
} as const satisfies Record<string, HelpTarget>

export type HelpLinkId = keyof typeof HELP_LINKS
