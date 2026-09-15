import { currentPlatform, type Platform } from './platform'

export type AppShortcutKey = 'O' | 'R' | 'F'

interface PlatformLabels {
  /** What the OS calls the thing `revealFile` opens. */
  reveal: string
  /** What the OS calls the place `trashFolder` moves things to. */
  trash: string
  shortcut: (key: AppShortcutKey, shifted: boolean) => string
  primaryModifier: 'Meta' | 'Control'
}

const LABELS: Record<Platform, PlatformLabels> = {
  darwin: {
    reveal: 'Show in Finder',
    trash: 'Trash',
    shortcut: (key, shifted) => `${shifted ? '⇧' : ''}⌘${key}`,
    primaryModifier: 'Meta'
  },
  win32: {
    reveal: 'Show in Explorer',
    trash: 'Recycle Bin',
    shortcut: (key, shifted) => `Ctrl+${shifted ? 'Shift+' : ''}${key}`,
    primaryModifier: 'Control'
  },
  linux: {
    reveal: 'Show in file manager',
    trash: 'trash',
    shortcut: (key, shifted) => `Ctrl+${shifted ? 'Shift+' : ''}${key}`,
    primaryModifier: 'Control'
  }
}

/** Open location is shifted so plain Cmd/Ctrl+O stays free for opening the selected item. */
function shifted(key: AppShortcutKey): boolean {
  return key === 'O'
}

export function revealLabel(): string {
  return LABELS[currentPlatform()].reveal
}

export function trashLabel(): string {
  return LABELS[currentPlatform()].trash
}

export function appShortcutLabel(key: AppShortcutKey): string {
  return LABELS[currentPlatform()].shortcut(key, shifted(key))
}

export function appShortcutAria(key: AppShortcutKey): string {
  const { primaryModifier } = LABELS[currentPlatform()]
  return `${primaryModifier}+${shifted(key) ? 'Shift+' : ''}${key}`
}
