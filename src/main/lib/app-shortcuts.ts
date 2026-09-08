import type { AppCommand, AppCommandEvent } from '../../shared/app-command'

export interface ShortcutInput {
  type: string
  code: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat: boolean
  isComposing: boolean
}

interface ShortcutEvent {
  preventDefault: () => void
}

interface ShortcutWebContents {
  on: (
    channel: 'before-input-event',
    listener: (event: ShortcutEvent, input: ShortcutInput) => void
  ) => void
  send: (channel: 'app:command', event: AppCommandEvent) => void
}

/** Match only the application commands main owns, leaving native Edit/Window keys alone. */
export function appCommandForInput(
  input: ShortcutInput,
  platform: NodeJS.Platform = process.platform
): AppCommandEvent | null {
  const primary =
    platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta
  if (!primary || input.alt) return null

  if (input.type !== 'keyDown') return null
  let command: AppCommand | undefined
  switch (input.code) {
    case 'KeyO':
      if (!input.shift) return null
      command = 'open-location'
      break
    case 'KeyR':
      if (input.shift) return null
      command = 'refresh'
      break
    case 'KeyF':
      if (input.shift) return null
      command = 'focus-filter'
      break
  }
  return command ? { command, repeat: input.isAutoRepeat, composing: input.isComposing } : null
}

export function installAppShortcuts(
  webContents: ShortcutWebContents,
  platform: NodeJS.Platform = process.platform
): void {
  webContents.on('before-input-event', (event, input) => {
    const command = appCommandForInput(input, platform)
    if (!command) return
    event.preventDefault()
    webContents.send('app:command', command)
  })
}
