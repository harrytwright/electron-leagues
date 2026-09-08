import { currentPlatform } from './platform'

export function appShortcutLabel(key: 'O' | 'R' | 'F'): string {
  if (currentPlatform() === 'darwin') return key === 'O' ? '⇧⌘O' : `⌘${key}`
  return key === 'O' ? 'Ctrl+Shift+O' : `Ctrl+${key}`
}

export function appShortcutAria(key: 'O' | 'R' | 'F'): string {
  const primary = currentPlatform() === 'darwin' ? 'Meta' : 'Control'
  return key === 'O' ? `${primary}+Shift+${key}` : `${primary}+${key}`
}
