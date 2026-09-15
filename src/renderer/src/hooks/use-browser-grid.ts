import { useEffect, useId, useRef, type RefObject } from 'react'
import { useFileSelection } from './use-file-selection'
import { useRowActionsMenu } from './use-row-actions-menu'

export interface BrowserGridOptions {
  currentDir: string
  /** The visible rows' paths, in display order. */
  paths: readonly string[]
  /** Listing entries are present; a pending focus request waits for them. */
  loaded: boolean
  consumeFocusRequest?: (currentDir: string) => boolean
}

export interface BrowserGrid {
  instructions: string
  rowNames: string
  filterRef: RefObject<HTMLInputElement | null>
  selection: ReturnType<typeof useFileSelection>
  rowMenu: ReturnType<typeof useRowActionsMenu>
  openContextMenu: (
    event: React.MouseEvent<HTMLTableRowElement> | React.KeyboardEvent<HTMLTableRowElement>,
    path: string
  ) => void
  openActionsMenu: (event: React.MouseEvent<HTMLButtonElement>, path: string) => void
  restoreFocus: () => void
}

/** The ids, roving selection, row menu and focus hand-offs shared by both file browsers. */
export function useBrowserGrid({
  currentDir,
  paths,
  loaded,
  consumeFocusRequest
}: BrowserGridOptions): BrowserGrid {
  const instructions = useId()
  // Explicit row names exclude the action button's label from selection announcements.
  const rowNames = useId()
  const filterRef = useRef<HTMLInputElement>(null)
  // rowMenu.target has already been cleared when the close effect restores focus.
  const menuTarget = useRef<string | null>(null)
  const rowMenu = useRowActionsMenu(paths)
  const selection = useFileSelection(currentDir, paths)

  useEffect(() => {
    if (loaded && consumeFocusRequest?.(currentDir)) {
      selection.focusFirstRow()
    }
  }, [consumeFocusRequest, currentDir, loaded, selection])

  const openContextMenu: BrowserGrid['openContextMenu'] = (event, path) => {
    event.preventDefault()
    selection.focus(path)
    menuTarget.current = path
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointer = 'clientX' in event && event.clientX > 0
    rowMenu.openAt(
      path,
      pointer
        ? { left: event.clientX, top: event.clientY }
        : { left: bounds.right - 24, top: bounds.top }
    )
  }

  const openActionsMenu: BrowserGrid['openActionsMenu'] = (event, path) => {
    selection.focus(path)
    menuTarget.current = path
    const bounds = event.currentTarget.getBoundingClientRect()
    rowMenu.openAt(path, { left: bounds.right, top: bounds.bottom })
  }

  const restoreFocus = (): void => {
    if (selection.focus(menuTarget.current ?? undefined)) return
    if (selection.focusFirstRow()) return
    filterRef.current?.focus()
  }

  return {
    instructions,
    rowNames,
    filterRef,
    selection,
    rowMenu,
    openContextMenu,
    openActionsMenu,
    restoreFocus
  }
}
