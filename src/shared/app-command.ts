export const APP_COMMANDS = ['open-location', 'new-location', 'refresh', 'focus-filter'] as const

export type AppCommand = (typeof APP_COMMANDS)[number]

export interface AppCommandEvent {
  command: AppCommand
  repeat: boolean
  composing: boolean
}
