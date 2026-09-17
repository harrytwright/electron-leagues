import { createContext, useContext, type ComponentPropsWithoutRef } from 'react'
import { Link } from '@cloudflare/kumo'
import { Markdown as TanStackMarkdown, type MarkdownComponents } from '@tanstack/markdown/react'
import { formatShortcut, SHORTCUT_TAG } from '@renderer/lib/help/shortcut'
import { resolveMarkdownLink } from './link'
import type { MarkdownNavigation, MarkdownProps } from './interface'

const NavigationContext = createContext<MarkdownNavigation | null>(null)

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

const HEADING_STYLES: Record<HeadingLevel, string> = {
  1: 'mb-4 text-2xl font-semibold tracking-tight',
  2: 'mt-9 mb-3 border-t border-kumo-line pt-6 text-lg font-semibold',
  3: 'mt-6 mb-2 text-base font-semibold',
  4: 'mt-5 mb-2 text-base font-medium',
  5: 'mt-4 mb-1 text-sm font-medium',
  6: 'mt-4 mb-1 text-sm font-medium text-kumo-subtle'
}

function join(...classes: Array<string | undefined>): string {
  return classes.filter((value) => value !== undefined && value !== '').join(' ')
}

function MarkdownHeading({
  level,
  className,
  ...props
}: ComponentPropsWithoutRef<'h1'> & { level: HeadingLevel }): React.JSX.Element {
  const Tag = `h${level}` as const
  return <Tag {...props} className={join('scroll-mt-6', HEADING_STYLES[level], className)} />
}

function MarkdownParagraph({
  className,
  ...props
}: ComponentPropsWithoutRef<'p'>): React.JSX.Element {
  const calloutTitle = className?.includes('markdown-alert-title') ?? false
  return <p {...props} className={join(calloutTitle ? 'mb-1 font-semibold' : 'my-3', className)} />
}

function MarkdownLink({
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<'a'>): React.JSX.Element {
  const navigation = useContext(NavigationContext)
  const resolved = href === undefined ? null : resolveMarkdownLink(href)
  if (resolved?.kind === 'external') {
    // The window open handler in main turns the new-window request into the system browser.
    return (
      <Link {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </Link>
    )
  }
  if (navigation && resolved && (resolved.kind === 'topic' || resolved.kind === 'anchor')) {
    const target =
      resolved.kind === 'topic'
        ? resolved.target
        : { topic: navigation.topic, anchor: resolved.anchor }
    return (
      <Link
        {...props}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          navigation.navigate(target)
        }}
      >
        {children}
      </Link>
    )
  }
  return (
    <Link {...props} href={href}>
      {children}
    </Link>
  )
}

function MarkdownKbd({ token }: { token: string }): React.JSX.Element | null {
  const shortcut = formatShortcut(token)
  if (!shortcut) return null
  return (
    <kbd className="inline-flex items-center rounded-sm border border-kumo-line bg-kumo-elevated px-1.5 py-0.5 align-baseline font-sans text-[0.85em] leading-none shadow-[0_1px_0_0_var(--color-kumo-line)]">
      <span aria-hidden>{shortcut.label}</span>
      <span className="sr-only">{shortcut.aria}</span>
    </kbd>
  )
}

/** Shortcut spans were already lifted out at parse time, so a fenced block is the only special case. */
function MarkdownCode({
  className,
  ...props
}: ComponentPropsWithoutRef<'code'>): React.JSX.Element {
  const isBlock = className?.startsWith('language-') ?? false
  if (isBlock) return <code {...props} className={join('font-mono', className)} />
  return (
    <code
      {...props}
      className={join(
        'rounded-sm bg-kumo-elevated px-1.5 py-0.5 font-mono text-[0.9em] ring-1 ring-kumo-line',
        className
      )}
    />
  )
}

function MarkdownCodeBlock({
  className,
  ...props
}: ComponentPropsWithoutRef<'pre'>): React.JSX.Element {
  return (
    <pre
      {...props}
      className={join(
        'my-4 overflow-x-auto rounded-md bg-kumo-elevated p-4 text-sm leading-relaxed ring-1 ring-kumo-line',
        className
      )}
    />
  )
}

function MarkdownList({ className, ...props }: ComponentPropsWithoutRef<'ul'>): React.JSX.Element {
  return <ul {...props} className={join('my-3 list-disc pl-6 [&>li+li]:mt-1.5', className)} />
}

function MarkdownOrderedList({
  className,
  ...props
}: ComponentPropsWithoutRef<'ol'>): React.JSX.Element {
  return <ol {...props} className={join('my-3 list-decimal pl-6 [&>li+li]:mt-1.5', className)} />
}

function MarkdownBlockquote({
  className,
  ...props
}: ComponentPropsWithoutRef<'blockquote'>): React.JSX.Element {
  return (
    <blockquote
      {...props}
      className={join('my-4 border-l-2 border-kumo-line pl-4 text-kumo-subtle', className)}
    />
  )
}

function MarkdownTable({
  className,
  ...props
}: ComponentPropsWithoutRef<'table'>): React.JSX.Element {
  return (
    <div className="my-4 overflow-x-auto">
      <table {...props} className={join('w-full border-collapse text-sm', className)} />
    </div>
  )
}

function MarkdownHeaderCell({
  className,
  ...props
}: ComponentPropsWithoutRef<'th'>): React.JSX.Element {
  return (
    <th
      {...props}
      className={join('border-b border-kumo-line px-3 py-2 text-left font-semibold', className)}
    />
  )
}

function MarkdownCell({ className, ...props }: ComponentPropsWithoutRef<'td'>): React.JSX.Element {
  return (
    <td {...props} className={join('border-b border-kumo-line px-3 py-2 align-top', className)} />
  )
}

function MarkdownRule({ className, ...props }: ComponentPropsWithoutRef<'hr'>): React.JSX.Element {
  return <hr {...props} className={join('my-8 border-kumo-line', className)} />
}

/** GitHub-style `> [!NOTE]` callouts arrive as classed divs; every other div passes through. */
function MarkdownCallout({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>): React.JSX.Element {
  const classes = className?.split(' ') ?? []
  if (classes.includes('markdown-alert')) {
    return (
      <aside
        {...props}
        role="note"
        className={join(
          'my-4 rounded-md border-l-4 border-kumo-brand bg-kumo-elevated px-4 py-3 [&_p]:my-0',
          className
        )}
      />
    )
  }
  return <div {...props} className={className} />
}

const components = {
  h1: (props) => <MarkdownHeading level={1} {...props} />,
  h2: (props) => <MarkdownHeading level={2} {...props} />,
  h3: (props) => <MarkdownHeading level={3} {...props} />,
  h4: (props) => <MarkdownHeading level={4} {...props} />,
  h5: (props) => <MarkdownHeading level={5} {...props} />,
  h6: (props) => <MarkdownHeading level={6} {...props} />,
  p: MarkdownParagraph,
  a: MarkdownLink,
  code: MarkdownCode,
  pre: MarkdownCodeBlock,
  ul: MarkdownList,
  ol: MarkdownOrderedList,
  blockquote: MarkdownBlockquote,
  table: MarkdownTable,
  th: MarkdownHeaderCell,
  td: MarkdownCell,
  hr: MarkdownRule,
  div: MarkdownCallout,
  [SHORTCUT_TAG]: MarkdownKbd
} satisfies MarkdownComponents

function MarkdownRoot({ document, navigation, className }: MarkdownProps): React.JSX.Element {
  return (
    <NavigationContext.Provider value={navigation ?? null}>
      <div className={join('text-base leading-relaxed text-kumo-default', className)}>
        <TanStackMarkdown components={components}>{document}</TanStackMarkdown>
      </div>
    </NavigationContext.Provider>
  )
}

export const Markdown = Object.assign(MarkdownRoot, {
  Heading: MarkdownHeading,
  Paragraph: MarkdownParagraph,
  Link: MarkdownLink,
  Code: MarkdownCode,
  CodeBlock: MarkdownCodeBlock,
  Kbd: MarkdownKbd,
  List: MarkdownList,
  OrderedList: MarkdownOrderedList,
  Blockquote: MarkdownBlockquote,
  Table: MarkdownTable,
  HeaderCell: MarkdownHeaderCell,
  Cell: MarkdownCell,
  Rule: MarkdownRule,
  Callout: MarkdownCallout
})
