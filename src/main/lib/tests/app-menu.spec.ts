import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { AppUpdatePhase } from '../../../shared/app-update'
import {
  type AppMenuOptions,
  buildAppMenuTemplate,
  buildEditableContextMenuTemplate,
  CHECK_FOR_UPDATES_MENU_ID,
  HELP_MENU_LABEL
} from '../app-menu'

function items(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? items(item.submenu) : [])
  ])
}

function byLabel(
  template: MenuItemConstructorOptions[],
  label: string
): MenuItemConstructorOptions {
  const item = items(template).find((candidate) => candidate.label === label)
  if (!item) throw new Error(`Missing menu item: ${label}`)
  return item
}

function updateItem(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions {
  const item = items(template).find((candidate) => candidate.id === CHECK_FOR_UPDATES_MENU_ID)
  if (!item) throw new Error('Missing update menu item')
  return item
}

function invoke(item: MenuItemConstructorOptions): void {
  // SAFETY: the update items install closures that ignore Electron's click arguments.
  const click = item.click as () => void
  click()
}

function build(
  platform: NodeJS.Platform,
  options: Partial<AppMenuOptions> = {}
): MenuItemConstructorOptions[] {
  return buildAppMenuTemplate({
    platform,
    development: false,
    onCommand: vi.fn(),
    onHelp: vi.fn(),
    ...options
  })
}

describe('buildAppMenuTemplate', () => {
  it('builds conventional macOS and Windows menus and accelerators', () => {
    const mac = build('darwin')
    const windows = build('win32')

    expect(mac[0]?.role).toBe('appMenu')
    expect(items(mac).some((item) => item.role === 'about')).toBe(true)
    expect(items(mac).some((item) => item.role === 'quit')).toBe(true)
    expect(windows[0]?.label).toBe('File')
    expect(byLabel(mac, 'Open location…').accelerator).toBe('CmdOrCtrl+Shift+O')
    expect(byLabel(windows, 'Open location…').accelerator).toBe('CmdOrCtrl+Shift+O')
    expect(byLabel(windows, 'New location…').accelerator).toBeUndefined()
    expect(byLabel(windows, 'Focus filter').accelerator).toBe('CmdOrCtrl+F')
    expect(items(windows).filter((item) => item.accelerator === 'CmdOrCtrl+R')).toEqual([
      expect.objectContaining({ label: 'Refresh' })
    ])
    expect(items(windows).some((item) => item.role === 'quit')).toBe(true)
    expect(items(windows).some((item) => item.role === 'zoom')).toBe(false)
    expect(items(mac).filter((item) => item.accelerator === 'CmdOrCtrl+R')).toEqual([
      expect.objectContaining({ label: 'Refresh' })
    ])
  })

  it.each(['darwin', 'win32'] as const)(
    'keeps reload and developer tools out of %s production',
    (platform) => {
      const roles = items(build(platform)).map((item) => item.role)
      expect(roles).not.toContain('reload')
      expect(roles).not.toContain('forceReload')
      expect(roles).not.toContain('toggleDevTools')
    }
  )

  it('offers platform-native developer tools only in development', () => {
    const mac = items(build('darwin', { development: true })).filter(
      (item) => item.role === 'toggleDevTools'
    )
    const windows = items(build('win32', { development: true })).filter(
      (item) => item.role === 'toggleDevTools'
    )
    expect(mac.map((item) => item.accelerator)).toEqual(['Alt+Command+I'])
    expect(windows.map((item) => item.accelerator)).toEqual(['F12'])
  })

  it.each([false, true])('offers diagnostics independently of development=%s', (development) => {
    const onCommand = vi.fn()
    const template = build('win32', { development, onCommand })
    const view = byLabel(template, 'View')
    if (!Array.isArray(view.submenu)) throw new Error('View must contain menu items')
    const diagnostics = byLabel(view.submenu, 'Show diagnostics')
    expect(diagnostics).toMatchObject({
      id: 'show-diagnostics',
      type: 'checkbox',
      checked: false
    })
    // SAFETY: this handler uses only MenuItem.checked; no Electron objects are constructed here.
    const invoke = diagnostics.click as (item: { checked: boolean }) => void
    const item = { checked: true }
    invoke(item)
    expect(item.checked).toBe(false)
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('toggle-diagnostics')
  })

  it('forwards native menu clicks as application commands', () => {
    const onCommand = vi.fn()
    const template = build('linux', { onCommand })
    for (const label of ['Open location…', 'New location…', 'Refresh', 'Focus filter']) {
      const click = byLabel(template, label).click
      // SAFETY: commandItem always installs a closure that ignores Electron's click arguments.
      const invoke = click as () => void
      invoke()
    }
    expect(onCommand.mock.calls).toEqual([
      ['open-location'],
      ['new-location'],
      ['refresh'],
      ['focus-filter']
    ])
  })

  it('adds a Help menu whose item uses the platform help accelerator and opens help', () => {
    const onHelp = vi.fn()
    const mac = build('darwin', { onHelp })
    const windows = build('win32', { onHelp })

    expect(mac.at(-1)?.role).toBe('help')
    expect(windows.at(-1)?.role).toBe('help')
    expect(byLabel(mac, HELP_MENU_LABEL).accelerator).toBe('Command+?')
    expect(byLabel(windows, HELP_MENU_LABEL).accelerator).toBe('F1')
    expect(byLabel(build('linux', { onHelp }), HELP_MENU_LABEL).accelerator).toBe('F1')

    // SAFETY: the help item installs a closure that ignores Electron's click arguments.
    const invoke = byLabel(windows, HELP_MENU_LABEL).click as () => void
    invoke()
    expect(onHelp).toHaveBeenCalledOnce()
  })

  it('places the update item after About on macOS and in Help elsewhere', () => {
    const update = { phase: { kind: 'idle' } as const, onCheck: vi.fn(), onInstall: vi.fn() }
    const mac = build('darwin', { update })
    const windows = build('win32', { update })

    const appMenu = mac[0]?.submenu
    if (!Array.isArray(appMenu)) throw new Error('App menu must contain menu items')
    expect(appMenu[0]?.role).toBe('about')
    expect(appMenu[1]).toMatchObject({ id: CHECK_FOR_UPDATES_MENU_ID, label: 'Check for updates…' })
    expect(appMenu[2]?.type).toBe('separator')

    const help = windows.at(-1)?.submenu
    if (!Array.isArray(help)) throw new Error('Help must contain menu items')
    expect(help.map((item) => item.label ?? item.type)).toEqual([
      HELP_MENU_LABEL,
      'separator',
      'Check for updates…'
    ])
    expect(items(windows).filter((item) => item.id === CHECK_FOR_UPDATES_MENU_ID)).toHaveLength(1)
  })

  it.each<[AppUpdatePhase, string, boolean]>([
    [{ kind: 'idle' }, 'Check for updates…', true],
    [{ kind: 'checking' }, 'Checking for updates…', false],
    [{ kind: 'downloading', version: '0.2.4', percent: 40 }, 'Downloading update…', false],
    [{ kind: 'ready', version: '0.2.4' }, 'Restart to update', true]
  ])('labels the update item for %j', (phase, label, enabled) => {
    const item = updateItem(
      build('win32', { update: { phase, onCheck: vi.fn(), onInstall: vi.fn() } })
    )
    expect(item.label).toBe(label)
    expect(item.enabled ?? true).toBe(enabled)
    expect(item.click !== undefined).toBe(enabled)
  })

  it('disables the restart item while a file operation is running', () => {
    const item = updateItem(
      build('win32', {
        update: {
          phase: { kind: 'ready', version: '0.2.4' },
          fileOperationRunning: true,
          onCheck: vi.fn(),
          onInstall: vi.fn()
        }
      })
    )
    expect(item.label).toBe('Restart to update')
    expect(item.enabled).toBe(false)
  })

  it('checks when idle and installs when ready', () => {
    const onCheck = vi.fn()
    const onInstall = vi.fn()
    const idle = updateItem(
      build('win32', { update: { phase: { kind: 'idle' }, onCheck, onInstall } })
    )
    const ready = updateItem(
      build('win32', { update: { phase: { kind: 'ready', version: '0.2.4' }, onCheck, onInstall } })
    )

    invoke(idle)
    expect(onCheck).toHaveBeenCalledOnce()
    expect(onInstall).not.toHaveBeenCalled()
    invoke(ready)
    expect(onInstall).toHaveBeenCalledOnce()
    expect(onCheck).toHaveBeenCalledOnce()
  })

  it.each(['darwin', 'win32'] as const)(
    'omits the update item without update support on %s',
    (platform) => {
      expect(items(build(platform)).some((item) => item.id === CHECK_FOR_UPDATES_MENU_ID)).toBe(
        false
      )
    }
  )

  it('preserves the diagnostics checkbox state across rebuilds', () => {
    expect(byLabel(build('win32', { diagnosticsChecked: true }), 'Show diagnostics').checked).toBe(
      true
    )
    expect(byLabel(build('win32'), 'Show diagnostics').checked).toBe(false)
  })
})

it('builds an editable context menu using Chromium edit flags', () => {
  const menu = buildEditableContextMenuTemplate({
    canCut: false,
    canCopy: true,
    canPaste: false,
    canSelectAll: true
  })
  expect(menu).toEqual([
    expect.objectContaining({ role: 'cut', enabled: false }),
    expect.objectContaining({ role: 'copy', enabled: true }),
    expect.objectContaining({ role: 'paste', enabled: false }),
    expect.objectContaining({ type: 'separator' }),
    expect.objectContaining({ role: 'selectAll', enabled: true })
  ])
})
