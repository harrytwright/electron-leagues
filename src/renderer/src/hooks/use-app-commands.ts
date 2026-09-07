import { useEffect, useRef } from 'react'
import type { AppCommand, AppCommandEvent } from '@shared/app-command'

type Handler = () => void

const handlers = new Map<AppCommand, Handler>()

function isEditable(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

function overlayOpen(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')
  )
}

/** Register the currently mounted surface handler without adding another IPC subscription. */
export function useAppCommandHandler(command: AppCommand, handler: Handler): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const current = (): void => handlerRef.current()
    handlers.set(command, current)
    return () => {
      if (handlers.get(command) === current) handlers.delete(command)
    }
  }, [command])
}

/** The app's sole renderer command subscription. */
export function useAppCommands(): void {
  useEffect(
    () =>
      window.api.onAppCommand((event: AppCommandEvent) => {
        if (
          event.repeat ||
          event.composing ||
          overlayOpen() ||
          isEditable(document.activeElement)
        ) {
          return
        }
        handlers.get(event.command)?.()
      }),
    []
  )
}
