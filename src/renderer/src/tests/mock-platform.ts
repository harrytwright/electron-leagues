import { afterEach } from 'vitest'

export function pretendPlatform(platform: string): void {
  Object.defineProperty(window, 'electron', {
    value: { process: { platform } },
    configurable: true,
    writable: true
  })
}

afterEach(() => {
  // SAFETY: tests only define the bridge through pretendPlatform; deletion restores the default.
  delete (window as { electron?: unknown }).electron
})
