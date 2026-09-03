import { currentPlatform } from './platform'

/** What the OS calls the place `trashFolder` moves things to. */
export function trashLabel(): string {
  switch (currentPlatform()) {
    case 'darwin':
      return 'Trash'
    case 'win32':
      return 'Recycle Bin'
    case 'linux':
      return 'trash'
  }
}
