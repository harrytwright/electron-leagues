import type { HelpTarget } from '@shared/help'

export type MarkdownLink =
  | { kind: 'external'; href: string }
  | { kind: 'topic'; target: HelpTarget }
  | { kind: 'anchor'; anchor: string }
  | { kind: 'other'; href: string }

const TOPIC_LINK = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md(?:#([a-z0-9]+(?:-[a-z0-9]+)*))?$/

/** Authors link between topics as `seasons.md#season-names`, which also works on GitHub. */
export function resolveMarkdownLink(href: string): MarkdownLink {
  if (/^https?:\/\//i.test(href)) return { kind: 'external', href }
  if (href.startsWith('#') && href.length > 1) return { kind: 'anchor', anchor: href.slice(1) }
  const topic = TOPIC_LINK.exec(href)
  if (topic?.[1]) {
    const anchor = topic[2]
    return { kind: 'topic', target: anchor ? { topic: topic[1], anchor } : { topic: topic[1] } }
  }
  return { kind: 'other', href }
}
