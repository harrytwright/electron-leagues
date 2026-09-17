import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { parseHelpTopic } from '@renderer/lib/help/topics'
import { renderWithProviders } from '../../tests/render-helpers'
import { Markdown, resolveMarkdownLink } from './index'

const source = `---
title: Seasons
description: Test.
section: Basics
order: 1
status: verified
updated: 2026-09-17
version: 0.2.3
---

# Seasons

Press \`Mod+Shift+O\` to open, edit \`meta.json\` by hand, see [Leagues](leagues.md#creating-a-league), [names](#season-names) and [TanStack](https://tanstack.com).

## Season names

> [!NOTE]
> Never guessed at.

\`\`\`text
/leagues/
\`\`\`

| Type | Example |
| ---- | ------- |
| Full | \`2025\` |
`

describe('resolveMarkdownLink', () => {
  it('classifies external, anchor, topic and other links', () => {
    expect(resolveMarkdownLink('https://tanstack.com')).toEqual({
      kind: 'external',
      href: 'https://tanstack.com'
    })
    expect(resolveMarkdownLink('#season-names')).toEqual({ kind: 'anchor', anchor: 'season-names' })
    expect(resolveMarkdownLink('leagues.md')).toEqual({
      kind: 'topic',
      target: { topic: 'leagues' }
    })
    expect(resolveMarkdownLink('leagues.md#creating-a-league')).toEqual({
      kind: 'topic',
      target: { topic: 'leagues', anchor: 'creating-a-league' }
    })
    expect(resolveMarkdownLink('mailto:x@y.z')).toEqual({ kind: 'other', href: 'mailto:x@y.z' })
    expect(resolveMarkdownLink('Bad Topic.md')).toEqual({ kind: 'other', href: 'Bad Topic.md' })
  })
})

describe('Markdown', () => {
  it('renders headings with ids, shortcut kbds for the platform and plain code otherwise', () => {
    const topic = parseHelpTopic('seasons', source)
    renderWithProviders(<Markdown document={topic.document} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Seasons' })).toHaveAttribute(
      'id',
      'seasons'
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Season names' })).toHaveAttribute(
      'id',
      'season-names'
    )
    // Tests read the platform as linux, so the label is Ctrl+Shift+O.
    const kbd = screen.getByText('Ctrl+Shift+O').closest('kbd')
    expect(kbd).toHaveTextContent('Control+Shift+O')
    expect(screen.getByText('meta.json').tagName).toBe('CODE')
    expect(screen.getByText('meta.json').closest('kbd')).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent('Never guessed at.')
    expect(screen.getByText(/\/leagues\//, { selector: 'code' }).closest('pre')).toHaveClass(
      'overflow-x-auto'
    )
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument()
  })

  it('routes topic and anchor links through navigation and opens external links in a new window', async () => {
    const topic = parseHelpTopic('seasons', source)
    const navigate = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <Markdown document={topic.document} navigation={{ topic: 'seasons', navigate }} />
    )

    await user.click(screen.getByRole('link', { name: 'Leagues' }))
    expect(navigate).toHaveBeenCalledWith({ topic: 'leagues', anchor: 'creating-a-league' })

    await user.click(screen.getByRole('link', { name: 'names' }))
    expect(navigate).toHaveBeenCalledWith({ topic: 'seasons', anchor: 'season-names' })

    const external = screen.getByRole('link', { name: 'TanStack' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('href', 'https://tanstack.com')
  })

  it('leaves topic links as plain anchors without navigation', () => {
    const topic = parseHelpTopic('seasons', source)
    renderWithProviders(<Markdown document={topic.document} />)
    expect(screen.getByRole('link', { name: 'Leagues' })).toHaveAttribute(
      'href',
      'leagues.md#creating-a-league'
    )
  })
})
