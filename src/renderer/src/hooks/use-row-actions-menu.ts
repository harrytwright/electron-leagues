import { useId, useRef, useState } from 'react'
interface State {
  anchor: { left: number; top: number }
  target: string | null
}

const CLOSED: State = { anchor: { left: 0, top: 0 }, target: null }

interface RowActionsMenu {
  id: string
  target: string | null
  anchor: State['anchor']
  onOpenChange: (open: boolean) => void
  restoreFocus: (previous?: HTMLElement | null) => void
  openAt: (target: string, anchor: State['anchor'], restoreFocus: HTMLElement) => void
}

export function useRowActionsMenu(paths: readonly string[]): RowActionsMenu {
  const id = useId()
  const opener = useRef<HTMLElement | null>(null)
  const dialogsAtOpen = useRef(new Set<Element>())
  const [state, setState] = useState<State>(CLOSED)
  // Clear the target, not just the popup's open prop: a returning row must not
  // resurrect a menu that disappeared during a refresh or filter change.
  if (state.target !== null && !paths.includes(state.target)) setState(CLOSED)
  const restoreFocus = (previous?: HTMLElement | null): void => {
    if (
      previous &&
      previous !== document.body &&
      previous.isConnected &&
      !previous.contains(opener.current) &&
      !document.getElementById(id)?.contains(previous)
    ) {
      previous.focus()
      if (document.activeElement === previous) return
    }
    const dialog = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="dialog"]:not([hidden]):not([aria-hidden="true"]), [role="alertdialog"]:not([hidden]):not([aria-hidden="true"])'
      )
    ).find((element) => !dialogsAtOpen.current.has(element))
    if (dialog) {
      // A menu action may have opened a dialog before the popup's exit finishes.
      if (dialog.contains(document.activeElement)) return
      for (const target of dialog.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]), button, select, textarea, [tabindex]'
      )) {
        target.focus()
        if (dialog.contains(document.activeElement)) return
      }
      dialog.focus()
      return
    }
    if (opener.current?.isConnected) opener.current.focus()
  }
  const close = (): void => {
    setState(CLOSED)
    queueMicrotask(() => {
      const active = document.activeElement
      // Outside clicks may already have focused another control.
      if (
        active &&
        active !== document.body &&
        active.id !== `${id}-trigger` &&
        !active.contains(opener.current) &&
        !document.getElementById(id)?.contains(active)
      )
        return
      restoreFocus()
    })
  }

  return {
    id,
    target: state.target,
    anchor: state.anchor,
    restoreFocus,
    onOpenChange: (open) => {
      if (!open) close()
    },
    openAt: (target, anchor, restoreTarget) => {
      opener.current = restoreTarget
      dialogsAtOpen.current = new Set(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]')
      )
      setState({ target, anchor })
    }
  }
}
