export function appShortcutLabel(key: 'O' | 'R' | 'F'): string {
  return navigator.userAgent.includes('Mac') ? `⌘${key}` : `Ctrl+${key}`
}

export function appShortcutAria(key: 'O' | 'R' | 'F'): string {
  return navigator.userAgent.includes('Mac') ? `Meta+${key}` : `Control+${key}`
}
