import { describe, expect, it } from 'vitest'
import {
  buildHelpTopics,
  bundledHelpSources,
  findHelpTopic,
  groupHelpTopics,
  hasHelpTarget,
  helpTopicId,
  helpTopics,
  type HelpTopicSource
} from '../topics'

function topic(id: string, fields: Partial<Record<string, string>> = {}): HelpTopicSource {
  const frontmatter = {
    title: id,
    description: `About ${id}.`,
    section: 'Basics',
    order: '1',
    status: 'verified',
    updated: '2026-09-17',
    version: '0.2.3',
    ...fields
  }
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`)
  return {
    path: `../resources/docs/${id}.md`,
    source: `---\n${lines.join('\n')}\n---\n\n# ${id}\n\n## First heading\n\nBody.\n`
  }
}

describe('helpTopicId', () => {
  it('uses the markdown filename stem', () => {
    expect(helpTopicId('../../../../../resources/docs/season-names.md')).toBe('season-names')
    expect(helpTopicId('/abs/getting-started.md')).toBe('getting-started')
  })
})

describe('buildHelpTopics', () => {
  it('orders topics by section then order and filters drafts unless asked to keep them', () => {
    const sources = [
      topic('shortcuts', { section: 'Reference', order: '1' }),
      topic('seasons', { section: 'Working with leagues', order: '2', status: 'draft' }),
      topic('leagues', { section: 'Working with leagues', order: '1' }),
      topic('layout', { section: 'Basics', order: '2' }),
      topic('start', { section: 'Basics', order: '1' })
    ]

    expect(buildHelpTopics(sources, { includeDrafts: false }).map((t) => t.id)).toEqual([
      'start',
      'layout',
      'leagues',
      'shortcuts'
    ])
    expect(buildHelpTopics(sources, { includeDrafts: true }).map((t) => t.id)).toEqual([
      'start',
      'layout',
      'leagues',
      'seasons',
      'shortcuts'
    ])
  })

  it('collects heading ids for anchors and exposes the parsed frontmatter', () => {
    const [built] = buildHelpTopics([topic('seasons')], { includeDrafts: true })
    expect(built).toMatchObject({
      id: 'seasons',
      title: 'seasons',
      section: 'Basics',
      order: 1,
      status: 'verified'
    })
    expect(built?.headings.map((h) => h.id)).toEqual(['seasons', 'first-heading'])
  })

  it('refuses topics that share an order in a section, even when one is a draft', () => {
    const sources = [topic('a', { order: '1' }), topic('b', { order: '1', status: 'draft' })]
    expect(() => buildHelpTopics(sources, { includeDrafts: false })).toThrow(
      /"a" and "b" share order 1 in Basics/
    )
  })

  it('names the topic when its frontmatter is missing or invalid', () => {
    expect(() =>
      buildHelpTopics([{ path: 'x/bare.md', source: '# No frontmatter\n' }], {
        includeDrafts: true
      })
    ).toThrow(/"bare" has no frontmatter/)
    expect(() =>
      buildHelpTopics([topic('broken', { status: 'published' })], { includeDrafts: true })
    ).toThrow(/"broken" has invalid frontmatter/)
  })
})

describe('groupHelpTopics and lookups', () => {
  const topics = buildHelpTopics(
    [
      topic('start', { section: 'Basics' }),
      topic('shortcuts', { section: 'Reference' }),
      topic('leagues', { section: 'Working with leagues' })
    ],
    { includeDrafts: true }
  )

  it('groups in section order and drops empty sections', () => {
    expect(groupHelpTopics(topics.filter((t) => t.section !== 'Reference'))).toEqual([
      { section: 'Basics', topics: [expect.objectContaining({ id: 'start' })] },
      { section: 'Working with leagues', topics: [expect.objectContaining({ id: 'leagues' })] }
    ])
  })

  it('finds topics by id and checks anchors against collected headings', () => {
    expect(findHelpTopic(topics, 'leagues')?.title).toBe('leagues')
    expect(findHelpTopic(topics, 'missing')).toBeNull()
    expect(hasHelpTarget(topics, { topic: 'leagues' })).toBe(true)
    expect(hasHelpTarget(topics, { topic: 'leagues', anchor: 'first-heading' })).toBe(true)
    expect(hasHelpTarget(topics, { topic: 'leagues', anchor: 'nowhere' })).toBe(false)
    expect(hasHelpTarget(topics, { topic: 'missing' })).toBe(false)
  })
})

describe('bundled docs', () => {
  it('every topic under resources/docs parses with valid frontmatter and a unique id', () => {
    const sources = bundledHelpSources()
    expect(sources.length).toBeGreaterThan(0)
    const ids = sources.map((entry) => helpTopicId(entry.path))
    expect(new Set(ids).size).toBe(ids.length)
    const all = buildHelpTopics(sources, { includeDrafts: true })
    expect(all.map((t) => t.id).sort()).toEqual([...ids].sort())
  })

  it('every topic opens with a level one heading matching its title', () => {
    for (const built of buildHelpTopics(bundledHelpSources(), { includeDrafts: true })) {
      expect(built.headings[0]).toMatchObject({ level: 1, text: built.title })
    }
  })

  it('caches per draft setting', () => {
    expect(helpTopics(true)).toBe(helpTopics(true))
    expect(helpTopics(false).every((t) => t.status === 'verified')).toBe(true)
  })
})
