import { currentPlatform } from './platform'

/** What the OS calls the thing `revealFile` opens. */
export function revealLabel(): string {
  switch (currentPlatform()) {
    case 'darwin':
      return 'Show in Finder'
    case 'win32':
      return 'Show in Explorer'
    case 'linux':
      return 'Show in file manager'
  }
}
