import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildHelpTopics, type HelpTopicSource } from '@renderer/lib/help/topics'
import { emitAppCommand, emitHelpNavigate, installMockApi } from '@renderer/tests/mock-api'
import { renderWithProviders } from '@renderer/tests/render-helpers'
import { useAppCommands } from '@renderer/hooks/use-app-commands'
import { HelpView } from './index'

function source(
  id: string,
  title: string,
  section: string,
  order: number,
  status = 'verified'
): HelpTopicSource {
  return {
    path: `docs/${id}.md`,
    source: [
      '---',
      `title: ${title}`,
      `description: All about ${title.toLowerCase()}.`,
      `section: ${section}`,
      `order: ${order}`,
      `status: ${status}`,
      'updated: 2026-09-17',
      'version: 0.2.3',
      '---',
      '',
      `# ${title}`,
      '',
      `Intro to ${title.toLowerCase()}. See [Seasons](seasons.md#naming).`,
      '',
      '## Naming',
      '',
      'Naming rules.',
      '',
      '## Archiving',
      '',
      'Archive rules.'
    ].join('\n')
  }
}

const topics = buildHelpTopics(
  [
    source('getting-started', 'Getting started', 'Basics', 1),
    source('seasons', 'Seasons', 'Working with leagues', 1),
    source('shortcuts', 'Keyboard shortcuts', 'Reference', 1, 'draft')
  ],
  { includeDrafts: true }
)

function Commands(): null {
  useAppCommands()
  return null
}

describe('HelpView', () => {
  it('shows the first topic by default, grouped navigation and marks drafts', () => {
    const onTopicViewed = vi.fn()
    renderWithProviders(
      <HelpView topics={topics} initialTarget={null} onTopicViewed={onTopicViewed} />
    )

    const nav = screen.getByRole('navigation', { name: 'Help topics' })
    expect(
      within(nav)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
    ).toEqual(['Basics', 'Working with leagues', 'Reference'])
    expect(within(nav).getByRole('button', { name: /Getting started/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(within(nav).getByRole('button', { name: /Keyboard shortcuts/ })).toHaveTextContent(
      'Draft'
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Getting started' })).toBeInTheDocument()
    expect(onTopicViewed).toHaveBeenCalledWith('getting-started')
  })

  it('opens the initial target and follows navigation from main and from in-article links', async () => {
    const onTopicViewed = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <HelpView
        topics={topics}
        initialTarget={{ topic: 'seasons', anchor: 'archiving' }}
        onTopicViewed={onTopicViewed}
      />
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Seasons' })).toBeInTheDocument()
    expect(onTopicViewed).toHaveBeenLastCalledWith('seasons')

    act(() => emitHelpNavigate({ topic: 'getting-started' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Getting started' })).toBeInTheDocument()
    expect(onTopicViewed).toHaveBeenLastCalledWith('getting-started')

    await user.click(screen.getByRole('link', { name: 'Seasons' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Seasons' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Keyboard shortcuts/ }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Keyboard shortcuts' })
    ).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveTextContent('Draft')
  })

  it('lists level two headings on this page and jumps to them', async () => {
    const user = userEvent.setup()
    renderWithProviders(<HelpView topics={topics} initialTarget={{ topic: 'seasons' }} />)

    const onThisPage = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(onThisPage)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Naming', 'Archiving'])
    const target = screen.getByRole('heading', { level: 2, name: 'Archiving' })
    const scrollIntoView = vi.spyOn(target, 'scrollIntoView')
    await user.click(within(onThisPage).getByRole('link', { name: 'Archiving' }))
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('filters topics by title or description, focuses the filter on the menu command and explains no matches', async () => {
    installMockApi()
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <Commands />
        <HelpView topics={topics} initialTarget={null} />
      </>
    )

    act(() => emitAppCommand({ command: 'focus-filter', repeat: false, composing: false }))
    const filter = screen.getByRole('searchbox', { name: 'Filter topics' })
    expect(filter).toHaveFocus()

    await user.type(filter, 'season')
    const nav = screen.getByRole('navigation', { name: 'Help topics' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Seasons'])
    expect(within(nav).queryByRole('heading', { name: 'Basics' })).toBeNull()

    await user.clear(filter)
    await user.type(filter, 'zzz')
    expect(within(nav).getByText('No topics match')).toBeInTheDocument()
    // Filtering the list never changes the article being read.
    expect(screen.getByRole('heading', { level: 1, name: 'Getting started' })).toBeInTheDocument()
  })

  it('explains a target that is not available and an empty topic set', () => {
    const { unmount } = renderWithProviders(
      <HelpView topics={topics} initialTarget={{ topic: 'missing' }} />
    )
    expect(screen.getByText('This topic isn’t available')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Help topics' })).toBeInTheDocument()
    unmount()

    renderWithProviders(<HelpView topics={[]} initialTarget={null} />)
    expect(screen.getByText('No help topics yet')).toBeInTheDocument()
  })
})
