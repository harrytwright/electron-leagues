import type { Task } from 'electron'
import { HELP_LAUNCH_FLAG, type HelpTarget } from '../../shared/help'

/** The subset of a BrowserWindow the controller needs, so tests can stand in a fake. */
export interface HelpSurface {
  focus(): void
  close(): void
  isDestroyed(): boolean
  navigate(target: HelpTarget): void
  onClosed(listener: () => void): void
}

export interface HelpWindowController {
  /** Open the singleton help window, or focus it and move it to `target` when already open. */
  open(target: HelpTarget | null): void
  close(): void
  isOpen(): boolean
}

export function createHelpWindowController(
  openSurface: (initial: HelpTarget | null) => HelpSurface
): HelpWindowController {
  let current: HelpSurface | null = null

  const live = (): HelpSurface | null => (current && !current.isDestroyed() ? current : null)

  return {
    open(target) {
      const existing = live()
      if (existing) {
        existing.focus()
        if (target) existing.navigate(target)
        return
      }
      const surface = openSurface(target)
      current = surface
      surface.onClosed(() => {
        if (current === surface) current = null
      })
    },
    close() {
      live()?.close()
      current = null
    },
    isOpen() {
      return live() !== null
    }
  }
}

/** Windows taskbar right-click entries; each launches a second instance that forwards the flag. */
export function helpJumpListTasks(execPath: string): Task[] {
  return [
    {
      program: execPath,
      arguments: HELP_LAUNCH_FLAG,
      iconPath: execPath,
      iconIndex: 0,
      title: 'Help',
      description: 'Open GoBowling Leagues Help'
    }
  ]
}
