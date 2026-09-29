import type { MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '../../shared/app-command'
import type { AppUpdatePhase } from '../../shared/app-update'

type CommandHandler = (command: AppCommand) => void

export const DIAGNOSTICS_MENU_ID = 'show-diagnostics'

export const CHECK_FOR_UPDATES_MENU_ID = 'check-for-updates'

export const HELP_MENU_LABEL = 'GoBowling Leagues Help'

/** ⌘? is the macOS convention for an app's help item; everywhere else it is F1. */
export function helpAccelerator(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'Command+?' : 'F1'
}

export interface AppMenuOptions {
  platform: NodeJS.Platform
  development: boolean
  onCommand: CommandHandler
  onHelp: () => void
  /** Omitted where the build cannot update itself. */
  update?: {
    phase: AppUpdatePhase
    onCheck: () => void
    onInstall: () => void
  }
  diagnosticsChecked?: boolean
}

function updateMenuItem({
  phase,
  onCheck,
  onInstall
}: NonNullable<AppMenuOptions['update']>): MenuItemConstructorOptions {
  switch (phase.kind) {
    case 'idle':
      return { id: CHECK_FOR_UPDATES_MENU_ID, label: 'Check for updates…', click: () => onCheck() }
    case 'checking':
      return { id: CHECK_FOR_UPDATES_MENU_ID, label: 'Checking for updates…', enabled: false }
    case 'downloading':
      return { id: CHECK_FOR_UPDATES_MENU_ID, label: 'Downloading update…', enabled: false }
    case 'ready':
      return { id: CHECK_FOR_UPDATES_MENU_ID, label: 'Restart to update', click: () => onInstall() }
  }
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
export function buildAppMenuTemplate({
  platform,
  development,
  onCommand,
  onHelp,
  update,
  diagnosticsChecked = false
}: AppMenuOptions): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = []
  const checkForUpdatesItem: MenuItemConstructorOptions[] = update ? [updateMenuItem(update)] : []
  if (platform === 'darwin') {
    template.push({
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        ...checkForUpdatesItem,
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
      checked: diagnosticsChecked,
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
        { label: HELP_MENU_LABEL, accelerator: helpAccelerator(platform), click: () => onHelp() },
        ...(platform !== 'darwin' && update
          ? [{ type: 'separator' } as const, ...checkForUpdatesItem]
          : [])
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
