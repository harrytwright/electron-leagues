export type Platform = 'darwin' | 'win32' | 'linux'

/** The OS the app runs on, from the preload bridge (tests have no bridge and read as linux). */
export function currentPlatform(): Platform {
  const platform = window.electron?.process?.platform
  return platform === 'darwin' || platform === 'win32' ? platform : 'linux'
}
