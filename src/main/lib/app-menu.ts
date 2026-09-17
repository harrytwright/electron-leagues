import type { MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '../../shared/app-command'

type CommandHandler = (command: AppCommand) => void

export const DIAGNOSTICS_MENU_ID = 'show-diagnostics'

export const HELP_MENU_LABEL = 'GoBowling Leagues Help'

/** ⌘? is the macOS convention for an app's help item; everywhere else it is F1. */
export function helpAccelerator(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'Command+?' : 'F1'
}

const editMenu: MenuItemConstructorOptions = {
  label: 'Edit',
  submenu: [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' }
  ]
}

function commandItem(
  label: string,
  command: AppCommand,
  onCommand: CommandHandler,
  accelerator?: string
): MenuItemConstructorOptions {
  return { label, accelerator, click: () => onCommand(command) }
}

/** Build the platform-native application menu without touching Electron globals. */
export function buildAppMenuTemplate(
  platform: NodeJS.Platform,
  development: boolean,
  onCommand: CommandHandler,
  onHelp: () => void
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = []
  if (platform === 'darwin') {
    template.push({
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }
  const viewSubmenu: MenuItemConstructorOptions[] = [
    commandItem('Focus filter', 'focus-filter', onCommand, 'CmdOrCtrl+F'),
    {
      id: DIAGNOSTICS_MENU_ID,
      label: 'Show diagnostics',
      type: 'checkbox',
      checked: false,
      click: (item) => {
        // Undo Electron's optimistic toggle: localStorage owns the preference,
        // including when a modal prevents the renderer from accepting a command.
        item.checked = !item.checked
        onCommand('toggle-diagnostics')
      }
    }
  ]
  if (development) {
    viewSubmenu.push(
      { type: 'separator' },
      {
        label: 'Toggle developer tools',
        role: 'toggleDevTools',
        accelerator: platform === 'darwin' ? 'Alt+Command+I' : 'F12'
      }
    )
  }
  template.push(
    {
      label: 'File',
      submenu: [
        // Plain Cmd/Ctrl+O remains available for opening the selected browser row.
        commandItem('Open location…', 'open-location', onCommand, 'CmdOrCtrl+Shift+O'),
        commandItem('New location…', 'new-location', onCommand),
        { type: 'separator' },
        commandItem('Refresh', 'refresh', onCommand, 'CmdOrCtrl+R'),
        ...(platform === 'darwin'
          ? []
          : ([{ type: 'separator' }, { role: 'quit' }] satisfies MenuItemConstructorOptions[]))
      ]
    },
    editMenu,
    {
      label: 'View',
      submenu: viewSubmenu
    },
    {
      role: 'windowMenu',
      submenu:
        platform === 'darwin'
          ? [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]
          : [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      // The help role places the menu where each platform expects it and adds
      // macOS's menu search field.
      role: 'help',
      submenu: [
        { label: HELP_MENU_LABEL, accelerator: helpAccelerator(platform), click: () => onHelp() }
      ]
    }
  )
  return template
}

interface EditFlags {
  canCut?: boolean
  canCopy?: boolean
  canPaste?: boolean
  canSelectAll?: boolean
}

/** Standard editable-field context menu with Electron-provided enablement. */
export function buildEditableContextMenuTemplate(
  editFlags: EditFlags
): MenuItemConstructorOptions[] {
  return [
    { role: 'cut', enabled: editFlags.canCut },
    { role: 'copy', enabled: editFlags.canCopy },
    { role: 'paste', enabled: editFlags.canPaste },
    { type: 'separator' },
    { role: 'selectAll', enabled: editFlags.canSelectAll }
  ]
}
