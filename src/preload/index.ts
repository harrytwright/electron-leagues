import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppCommandEvent } from '../shared/app-command'
import type { AppUpdateStatus } from '../shared/app-update'
import type { HelpTarget } from '../shared/help'
import {
  invokeDefinitions,
  type InvokeApi,
  type InvokeArguments,
  type InvokeName,
  type InvokeOutputs
} from '../shared/ipc'
import { getRendererMetrics } from './renderer-metrics'

export type { RendererMetrics } from './renderer-metrics'

export type { SeasonCreateRequest } from '../shared/season-create'

function invokeMethod<Name extends InvokeName>(name: Name): InvokeApi[Name] {
  const channel = invokeDefinitions[name].channel
  const invoke = (...args: InvokeArguments<Name>): Promise<InvokeOutputs[Name]> =>
    ipcRenderer.invoke(channel, ...args)
  // SAFETY: InvokeApi maps this same method name to these arguments and output.
  return invoke as InvokeApi[Name]
}

// SAFETY: every enumerable declaration key is an InvokeName by construction.
const invokeNames = Object.keys(invokeDefinitions) as InvokeName[]
// SAFETY: each entry retains the same name in its key and invokeMethod argument.
const invokeApi = Object.fromEntries(
  invokeNames.map((name) => [name, invokeMethod(name)])
) as InvokeApi

const api = {
  ...invokeApi,
  onAppUpdateChanged: (listener: (status: AppUpdateStatus) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus): void =>
      listener(status)
    ipcRenderer.on('app:update-changed', wrapped)
    return () => ipcRenderer.removeListener('app:update-changed', wrapped)
  },
  getRendererMetrics,
  diagnosticsChanged: (enabled: boolean): void => ipcRenderer.send('diagnostics:changed', enabled),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  onTreeChanged: (listener: () => void): (() => void) => {
    const wrapped = (): void => listener()
    ipcRenderer.on('tree:changed', wrapped)
    return () => ipcRenderer.removeListener('tree:changed', wrapped)
  },
  onAppCommand: (listener: (event: AppCommandEvent) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: AppCommandEvent): void =>
      listener(command)
    ipcRenderer.on('app:command', wrapped)
    return () => ipcRenderer.removeListener('app:command', wrapped)
  },
  onHelpNavigate: (listener: (target: HelpTarget) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, target: HelpTarget): void =>
      listener(target)
    ipcRenderer.on('help:navigate', wrapped)
    return () => ipcRenderer.removeListener('help:navigate', wrapped)
  }
}

export type LeaguesApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
