/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MAIN_VITE_SENTRY_DSN?: string
  readonly MAIN_VITE_POSTHOG_KEY?: string
}
