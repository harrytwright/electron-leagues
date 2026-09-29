export type AppUpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; version: string; percent: number | null }
  | { kind: 'ready'; version: string }

export interface AppUpdateStatus {
  version: string
  update: AppUpdatePhase
}
