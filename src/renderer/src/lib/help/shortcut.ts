import type { InlineNode, MarkdownExtension } from '@tanstack/markdown'
import { currentPlatform, type Platform } from '../platform'

/** The custom tag the renderer maps to its keyboard shortcut component. */
export const SHORTCUT_TAG = 'md-kbd'

/** Only code spans written as `Mod+…` become keyboard shortcuts; every other span stays code. */
const SHORTCUT_PREFIX = 'Mod+'

const MODIFIERS = ['Mod', 'Shift', 'Alt'] as const

type Modifier = (typeof MODIFIERS)[number]

interface ModifierLabels {
  label: Record<Modifier, string>
  aria: Record<Modifier, string>
  join: string
}

const LABELS: Record<Platform, ModifierLabels> = {
  darwin: {
    label: { Mod: '⌘', Shift: '⇧', Alt: '⌥' },
    aria: { Mod: 'Meta', Shift: 'Shift', Alt: 'Alt' },
    join: ''
  },
  win32: {
    label: { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt' },
    aria: { Mod: 'Control', Shift: 'Shift', Alt: 'Alt' },
    join: '+'
  },
  linux: {
    label: { Mod: 'Ctrl', Shift: 'Shift', Alt: 'Alt' },
    aria: { Mod: 'Control', Shift: 'Shift', Alt: 'Alt' },
    join: '+'
  }
}

/** macOS glyphs read ⌥⇧⌘ regardless of the order the author typed them. */
const MAC_LABEL_ORDER: readonly Modifier[] = ['Alt', 'Shift', 'Mod']

/** Windows labels and every screen reader name lead with the primary modifier. */
const PRIMARY_FIRST_ORDER: readonly Modifier[] = ['Mod', 'Alt', 'Shift']

function isModifier(part: string): part is Modifier {
  return MODIFIERS.some((modifier) => modifier === part)
}

export interface Shortcut {
  /** What the user sees, such as ⇧⌘O or Ctrl+Shift+O. */
  label: string
  /** What a screen reader hears, such as Meta+Shift+O. */
  aria: string
}

export function isShortcutToken(code: string): boolean {
  return code.startsWith(SHORTCUT_PREFIX) && code.length > SHORTCUT_PREFIX.length
}

/** Null means the span is not a well formed shortcut and should render as ordinary code. */
export function formatShortcut(
  token: string,
  platform: Platform = currentPlatform()
): Shortcut | null {
  if (!isShortcutToken(token)) return null
  const parts = token.split('+')
  const key = parts.pop()
  if (!key || key.length === 0 || parts.some((part) => !isModifier(part))) return null
  const labelOrder = platform === 'darwin' ? MAC_LABEL_ORDER : PRIMARY_FIRST_ORDER
  const { label, aria, join } = LABELS[platform]
  return {
    label: [
      ...labelOrder.filter((modifier) => parts.includes(modifier)).map((m) => label[m]),
      key
    ].join(join),
    aria: [
      ...PRIMARY_FIRST_ORDER.filter((modifier) => parts.includes(modifier)).map((m) => aria[m]),
      key
    ].join('+')
  }
}

function toShortcutNode(node: InlineNode): InlineNode {
  if (node.type === 'inlineCode') {
    if (!isShortcutToken(node.value)) return node
    return {
      type: 'inlineComponent',
      name: 'shortcut',
      tagName: SHORTCUT_TAG,
      attributes: { token: node.value },
      properties: { token: node.value },
      children: []
    }
  }
  if (
    node.type === 'strong' ||
    node.type === 'emphasis' ||
    node.type === 'strike' ||
    node.type === 'link' ||
    node.type === 'inlineComponent'
  ) {
    return { ...node, children: node.children.map(toShortcutNode) }
  }
  return node
}

/** Classifies shortcut spans while parsing, so the renderer never inspects code text. */
export const shortcutExtension: MarkdownExtension = {
  name: 'shortcut',
  transformInline: (nodes) => nodes.map(toShortcutNode)
}
