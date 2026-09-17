import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Badge, Empty, Input, TableOfContents, useTableOfContentsActiveId } from '@cloudflare/kumo'
import { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen'
import type { HelpTarget } from '@shared/help'
import { findHelpTopic, groupHelpTopics, type HelpTopic } from '@renderer/lib/help/topics'
import { useAppCommandHandler } from '@renderer/hooks/use-app-commands'
import { Markdown } from '../Markdown'
import type { Props } from './interface'

function matchesFilter(topic: HelpTopic, filter: string): boolean {
  const needle = filter.trim().toLowerCase()
  if (needle === '') return true
  return (
    topic.title.toLowerCase().includes(needle) || topic.description.toLowerCase().includes(needle)
  )
}

function DraftBadge(): React.JSX.Element {
  return <Badge variant="secondary">Draft</Badge>
}

export function HelpView({ topics, initialTarget, onTopicViewed }: Props): React.JSX.Element {
  const [target, setTarget] = useState<HelpTarget | null>(initialTarget)
  const [filter, setFilter] = useState('')
  const [article, setArticle] = useState<HTMLElement | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const headingId = useId()

  useEffect(() => window.api.onHelpNavigate(setTarget), [])
  useAppCommandHandler('focus-filter', () => {
    filterRef.current?.focus()
    filterRef.current?.select()
  })

  const topic = target ? findHelpTopic(topics, target.topic) : (topics[0] ?? null)
  const anchor = target?.anchor
  const topicId = topic?.id

  useEffect(() => {
    if (topicId !== undefined) onTopicViewed?.(topicId)
  }, [topicId, onTopicViewed])

  useEffect(() => {
    if (!article) return
    const heading = anchor ? article.querySelector(`#${CSS.escape(anchor)}`) : null
    if (heading) heading.scrollIntoView({ block: 'start' })
    else article.scrollTo({ top: 0 })
  }, [article, topicId, anchor])

  const groups = useMemo(
    () => groupHelpTopics(topics.filter((entry) => matchesFilter(entry, filter))),
    [topics, filter]
  )
  const sections = useMemo(
    () => topic?.headings.filter((heading) => heading.level === 2) ?? [],
    [topic]
  )
  const { activeId, selectSection } = useTableOfContentsActiveId({
    ids: sections.map((heading) => heading.id),
    root: article,
    trackHash: false
  })

  return (
    <div className="flex h-full bg-kumo-base text-kumo-default">
      <nav
        aria-label="Help topics"
        className="flex w-60 shrink-0 flex-col border-r border-kumo-line bg-kumo-base"
      >
        <div className="p-3">
          <Input
            ref={filterRef}
            size="sm"
            type="search"
            placeholder="Filter topics"
            aria-label="Filter topics"
            autoComplete="off"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {topics.length === 0 ? null : groups.length === 0 ? (
            <p className="px-2 text-sm text-kumo-subtle">No topics match</p>
          ) : (
            groups.map((group) => (
              <section key={group.section} aria-labelledby={`${headingId}-${group.section}`}>
                <h2
                  id={`${headingId}-${group.section}`}
                  className="px-2 pt-3 pb-1 text-xs font-semibold tracking-wide text-kumo-subtle uppercase"
                >
                  {group.section}
                </h2>
                <ul>
                  {group.topics.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        aria-current={entry.id === topicId ? 'page' : undefined}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-kumo-elevated aria-[current=page]:bg-kumo-elevated aria-[current=page]:font-medium"
                        onClick={() => setTarget({ topic: entry.id })}
                      >
                        <span className="truncate">{entry.title}</span>
                        {entry.status === 'draft' ? <DraftBadge /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </nav>

      <main ref={setArticle} className="min-w-0 flex-1 overflow-y-auto">
        {topic ? (
          <article className="mx-auto max-w-3xl px-8 py-8">
            {topic.status === 'draft' ? (
              <div className="mb-4">
                <DraftBadge />
              </div>
            ) : null}
            <Markdown
              document={topic.document}
              navigation={{ topic: topic.id, navigate: setTarget }}
            />
          </article>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <Empty
              icon={<BookOpenIcon size={40} aria-hidden />}
              title={topics.length === 0 ? 'No help topics yet' : 'This topic isn’t available'}
              description={
                topics.length === 0
                  ? 'Topics appear here once they have been written and checked.'
                  : 'It hasn’t been checked for this version yet. Pick another topic from the list.'
              }
            />
          </div>
        )}
      </main>

      {topic && sections.length > 0 ? (
        <aside className="hidden w-52 shrink-0 overflow-y-auto border-l border-kumo-line px-4 py-8 md:block">
          <TableOfContents aria-label="On this page">
            <TableOfContents.Title>On this page</TableOfContents.Title>
            <TableOfContents.List>
              {sections.map((heading) => (
                <TableOfContents.Item
                  key={heading.id}
                  href={`#${heading.id}`}
                  active={activeId === heading.id}
                  onClick={(event) => {
                    event.preventDefault()
                    selectSection(heading.id)
                    setTarget({ topic: topic.id, anchor: heading.id })
                  }}
                >
                  {heading.text}
                </TableOfContents.Item>
              ))}
            </TableOfContents.List>
          </TableOfContents>
        </aside>
      ) : null}
    </div>
  )
}
