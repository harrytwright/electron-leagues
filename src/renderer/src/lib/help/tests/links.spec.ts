import { describe, expect, it } from 'vitest'
import { HELP_LINKS } from '../links'
import { buildHelpTopics, bundledHelpSources, hasHelpTarget } from '../topics'

describe('HELP_LINKS', () => {
  // Drafts count here: a link may point at a topic still being verified, and
  // the link itself stays hidden until that topic ships.
  const topics = buildHelpTopics(bundledHelpSources(), { includeDrafts: true })

  it.each(Object.entries(HELP_LINKS))('%s points at a heading that exists', (_id, target) => {
    expect(hasHelpTarget(topics, target)).toBe(true)
  })
})
