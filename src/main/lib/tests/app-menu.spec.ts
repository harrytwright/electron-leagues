import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { buildAppMenuTemplate, buildEditableContextMenuTemplate } from '../app-menu'

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

describe('buildAppMenuTemplate', () => {
  it('builds conventional macOS and Windows menus and accelerators', () => {
    const mac = buildAppMenuTemplate('darwin', false, vi.fn())
    const windows = buildAppMenuTemplate('win32', false, vi.fn())

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
      const roles = items(buildAppMenuTemplate(platform, false, vi.fn())).map((item) => item.role)
      expect(roles).not.toContain('reload')
      expect(roles).not.toContain('forceReload')
      expect(roles).not.toContain('toggleDevTools')
    }
  )

  it('offers platform-native developer tools only in development', () => {
    const mac = items(buildAppMenuTemplate('darwin', true, vi.fn())).filter(
      (item) => item.role === 'toggleDevTools'
    )
    const windows = items(buildAppMenuTemplate('win32', true, vi.fn())).filter(
      (item) => item.role === 'toggleDevTools'
    )
    expect(mac.map((item) => item.accelerator)).toEqual(['Alt+Command+I', 'CmdOrCtrl+Shift+I'])
    expect(windows.map((item) => item.accelerator)).toEqual(['F12', 'CmdOrCtrl+Shift+I'])
  })

  it.each([false, true])('offers diagnostics independently of development=%s', (development) => {
    const onCommand = vi.fn()
    const template = buildAppMenuTemplate('win32', development, onCommand)
    const diagnostics = byLabel(template, 'Show diagnostics')
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
    const template = buildAppMenuTemplate('linux', false, onCommand)
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
