import { describe, expect, it, vi } from 'vitest'
import { HELP_LAUNCH_FLAG, helpRequested } from '../../../shared/help'
import { createHelpWindowController, helpJumpListTasks, type HelpSurface } from '../help-window'

interface FakeSurface extends HelpSurface {
  closed: () => void
  destroyed: boolean
  navigate: ReturnType<typeof vi.fn<HelpSurface['navigate']>>
  focus: ReturnType<typeof vi.fn<HelpSurface['focus']>>
}

function fakeSurface(): FakeSurface {
  const surface: FakeSurface = {
    destroyed: false,
    closed: () => undefined,
    focus: vi.fn<HelpSurface['focus']>(),
    navigate: vi.fn<HelpSurface['navigate']>(),
    close() {
      surface.destroyed = true
      surface.closed()
    },
    isDestroyed: () => surface.destroyed,
    onClosed(listener) {
      surface.closed = listener
    }
  }
  return surface
}

describe('createHelpWindowController', () => {
  it('opens one window and forwards later targets to it instead of opening another', () => {
    const surfaces: FakeSurface[] = []
    const openSurface = vi.fn(() => {
      const surface = fakeSurface()
      surfaces.push(surface)
      return surface
    })
    const controller = createHelpWindowController(openSurface)

    controller.open(null)
    controller.open({ topic: 'seasons', anchor: 'season-names' })
    controller.open(null)

    expect(openSurface).toHaveBeenCalledExactlyOnceWith(null)
    expect(surfaces[0]?.focus).toHaveBeenCalledTimes(2)
    expect(surfaces[0]?.navigate).toHaveBeenCalledExactlyOnceWith({
      topic: 'seasons',
      anchor: 'season-names'
    })
    expect(controller.isOpen()).toBe(true)
  })

  it('opens a fresh window once the previous one has closed, carrying the target', () => {
    const surfaces: FakeSurface[] = []
    const controller = createHelpWindowController((initial) => {
      const surface = fakeSurface()
      surface.navigate(initial ?? { topic: 'none' })
      surfaces.push(surface)
      return surface
    })

    controller.open(null)
    surfaces[0]?.close()
    expect(controller.isOpen()).toBe(false)

    controller.open({ topic: 'leagues' })
    expect(surfaces).toHaveLength(2)
    expect(surfaces[1]?.navigate).toHaveBeenCalledWith({ topic: 'leagues' })
  })

  it('closes the live window on request and tolerates a window destroyed behind its back', () => {
    const surfaces: FakeSurface[] = []
    const controller = createHelpWindowController(() => {
      const surface = fakeSurface()
      surfaces.push(surface)
      return surface
    })

    controller.open(null)
    controller.close()
    expect(surfaces[0]?.destroyed).toBe(true)

    controller.open(null)
    const second = surfaces[1]
    if (!second) throw new Error('expected a second window')
    second.destroyed = true
    expect(controller.isOpen()).toBe(false)
    controller.open(null)
    expect(surfaces).toHaveLength(3)
  })
})

describe('help launch plumbing', () => {
  it('recognises the jump list flag anywhere in argv', () => {
    expect(helpRequested(['app.exe', HELP_LAUNCH_FLAG])).toBe(true)
    expect(helpRequested(['app.exe', '--some-chromium-flag'])).toBe(false)
  })

  it('builds a single Help task that relaunches the executable with the flag', () => {
    expect(helpJumpListTasks('C:\\\\Apps\\\\Leagues.exe')).toEqual([
      expect.objectContaining({
        program: 'C:\\\\Apps\\\\Leagues.exe',
        arguments: HELP_LAUNCH_FLAG,
        title: 'Help'
      })
    ])
  })
})
