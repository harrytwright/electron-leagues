import { ElectronAPI } from '@electron-toolkit/preload'
import type { LeaguesApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: LeaguesApi
  }
}
