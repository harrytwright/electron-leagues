import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import {
  invokeFailureMessage,
  invokeDefinitions,
  type InvokeArguments,
  type InvokeName,
  type InvokeOutputs
} from '../../shared/ipc'
import { UserFacingError } from './fs-errors'

export type IpcErrorReporter = (error: Error, channel: string) => void

export type InvokeListener<Name extends InvokeName> = (
  event: IpcMainInvokeEvent,
  ...args: InvokeArguments<Name>
) => InvokeOutputs[Name] | Promise<InvokeOutputs[Name]>

export function registerInvokeHandler<Name extends InvokeName>(
  ipc: Pick<IpcMain, 'handle'>,
  name: Name,
  listener: InvokeListener<Name>,
  reportError: IpcErrorReporter
): void {
  const definition = invokeDefinitions[name]
  ipc.handle(definition.channel, async (event, ...rawArguments) => {
    const parsed = definition.args.safeParse(rawArguments)
    if (!parsed.success) {
      throw new UserFacingError(invokeFailureMessage(name, parsed.error.issues))
    }
    try {
      // SAFETY: safeParse used the argument schema belonging to this exact method name.
      const parsedArguments = parsed.data as InvokeArguments<Name>
      return await listener(event, ...parsedArguments)
    } catch (err) {
      if (!(err instanceof UserFacingError)) {
        reportError(err instanceof Error ? err : new Error(String(err)), definition.channel)
      }
      throw err
    }
  })
}
