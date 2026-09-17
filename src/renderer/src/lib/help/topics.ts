import type { MarkdownDocument, MarkdownHeading } from '@tanstack/markdown'
import { docsMarkdownExtensions } from '@tanstack/markdown/extensions/docs'
import { parseMarkdown } from '@tanstack/markdown/parser'
import type { HelpTarget } from '@shared/help'
import {
  HELP_SECTIONS,
  parseHelpFrontmatter,
  type HelpFrontmatter,
  type HelpSection
} from './frontmatter'
import { shortcutExtension } from './shortcut'

export interface HelpTopic extends HelpFrontmatter {
  id: string
  document: MarkdownDocument
  headings: MarkdownHeading[]
}

export interface HelpSectionGroup {
  section: HelpSection
  topics: HelpTopic[]
}

export interface HelpTopicSource {
  path: string
  source: string
}

export interface HelpTopicOptions {
  includeDrafts: boolean
}

const extensions = [...docsMarkdownExtensions(), shortcutExtension]

/** `../resources/docs/seasons.md` names the topic `seasons`, the id links and targets use. */
export function helpTopicId(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.endsWith('.md') ? file.slice(0, -'.md'.length) : file
}

export function parseHelpTopic(id: string, source: string): HelpTopic {
  const document = parseMarkdown(source, { frontmatter: true, headingIds: true, extensions })
  if (document.frontmatter === undefined) throw new Error(`Help topic "${id}" has no frontmatter`)
  let frontmatter: HelpFrontmatter
  try {
    frontmatter = parseHelpFrontmatter(document.frontmatter)
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught)
    throw new Error(`Help topic "${id}" has invalid frontmatter: ${reason}`)
  }
  return { id, ...frontmatter, document, headings: document.headings ?? [] }
}

function bySectionThenOrder(a: HelpTopic, b: HelpTopic): number {
  const section = HELP_SECTIONS.indexOf(a.section) - HELP_SECTIONS.indexOf(b.section)
  return section !== 0 ? section : a.order - b.order
}

/** Every topic must parse, and no two topics may share a slot, before any of them is shown. */
export function buildHelpTopics(
  sources: readonly HelpTopicSource[],
  options: HelpTopicOptions
): HelpTopic[] {
  const topics = sources.map((entry) => parseHelpTopic(helpTopicId(entry.path), entry.source))
  for (const topic of topics) {
    const clash = topics.find(
      (other) => other !== topic && other.section === topic.section && other.order === topic.order
    )
    if (clash) {
      throw new Error(
        `Help topics "${topic.id}" and "${clash.id}" share order ${topic.order} in ${topic.section}`
      )
    }
  }
  return topics
    .filter((topic) => options.includeDrafts || topic.status === 'verified')
    .sort(bySectionThenOrder)
}

export function groupHelpTopics(topics: readonly HelpTopic[]): HelpSectionGroup[] {
  return HELP_SECTIONS.map((section) => ({
    section,
    topics: topics.filter((topic) => topic.section === section)
  })).filter((group) => group.topics.length > 0)
}

export function findHelpTopic(topics: readonly HelpTopic[], id: string): HelpTopic | null {
  return topics.find((topic) => topic.id === id) ?? null
}

export function hasHelpTarget(topics: readonly HelpTopic[], target: HelpTarget): boolean {
  const topic = findHelpTopic(topics, target.topic)
  if (!topic) return false
  return target.anchor === undefined || topic.headings.some((h) => h.id === target.anchor)
}

/** Vite inlines the markdown at build time, so the packaged app carries no docs folder. */
const bundledSources: HelpTopicSource[] = Object.entries(
  import.meta.glob<string>('../../../../../resources/docs/*.md', {
    query: '?raw',
    import: 'default',
    eager: true
  })
).map(([path, source]) => ({ path, source }))

export function bundledHelpSources(): readonly HelpTopicSource[] {
  return bundledSources
}

let cached: { includeDrafts: boolean; topics: HelpTopic[] } | null = null

/** Drafts show during development with a badge and are filtered out of packaged builds. */
export function helpTopics(includeDrafts: boolean = import.meta.env.DEV): HelpTopic[] {
  if (cached === null || cached.includeDrafts !== includeDrafts) {
    cached = { includeDrafts, topics: buildHelpTopics(bundledSources, { includeDrafts }) }
  }
  return cached.topics
}
