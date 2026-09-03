import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

let systemDark = false

class MockMediaQueryListEvent extends Event implements MediaQueryListEvent {
  readonly matches: boolean
  readonly media: string

  constructor(matches: boolean, media: string) {
    super('change')
    this.matches = matches
    this.media = media
  }
}

type ChangeListener = (this: MediaQueryList, event: MediaQueryListEvent) => void

class MockMediaQueryList extends EventTarget implements MediaQueryList {
  readonly media: string
  onchange: ChangeListener | null = null
  readonly #legacyListeners = new Set<ChangeListener>()
  readonly #isDarkQuery: boolean

  constructor(query: string) {
    super()
    this.media = query
    this.#isDarkQuery = query.includes('prefers-color-scheme: dark')
  }

  get matches(): boolean {
    // Only the dark-scheme query is driven by setSystemDark; any other media
    // query honestly reports false rather than aliasing the dark flag.
    return this.#isDarkQuery && systemDark
  }

  addListener(listener: ChangeListener | null): void {
    if (listener) this.#legacyListeners.add(listener)
  }

  removeListener(listener: ChangeListener | null): void {
    if (listener) this.#legacyListeners.delete(listener)
  }

  emitChange(): void {
    const event = new MockMediaQueryListEvent(this.matches, this.media)
    this.dispatchEvent(event)
    this.onchange?.call(this, event)
    for (const listener of this.#legacyListeners) listener.call(this, event)
  }

  reset(): void {
    this.onchange = null
    this.#legacyListeners.clear()
  }
}

const darkQueryList = new MockMediaQueryList('(prefers-color-scheme: dark)')

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList =>
    query.includes('prefers-color-scheme: dark') ? darkQueryList : new MockMediaQueryList(query)
})

export function setSystemDark(dark: boolean): void {
  systemDark = dark
  darkQueryList.emitChange()
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  systemDark = false
  darkQueryList.reset()
  document.documentElement.removeAttribute('data-mode')
})
