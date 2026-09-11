import { Menu } from '@cloudflare/kumo/primitives/menu'
import { DropdownMenu } from '@cloudflare/kumo'
import { Fragment, useCallback, useEffect, useRef } from 'react'
import type { Props } from './interface'
import { FILE_MENU_POPUP_CLASS } from '../../styles'

/** One controlled menu shared by every row and every invocation method in a browser. */
export function FileActionsMenu({
  id,
  label,
  open,
  anchor,
  actions,
  focusScope,
  onOpenChange,
  onRestoreFocus
}: Props): React.JSX.Element {
  const popup = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)
  const openedFocusScope = useRef(focusScope)
  const restoreAfterClose = useCallback((): void => {
    queueMicrotask(() => {
      const active = document.activeElement
      if (active === document.body || (active && popup.current?.contains(active))) {
        onRestoreFocus()
      }
    })
  }, [onRestoreFocus])

  useEffect(() => {
    if (!wasOpen.current && open) openedFocusScope.current = focusScope
    // Navigation has its own pending-focus contract; restoring the old row would race it.
    if (wasOpen.current && !open && openedFocusScope.current === focusScope) restoreAfterClose()
    wasOpen.current = open
  }, [focusScope, open, restoreAfterClose])

  return (
    <Menu.Root open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <Menu.Trigger
        id={`${id}-trigger`}
        render={
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            aria-label={label}
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: anchor.left, top: anchor.top }}
          />
        }
      />
      <Menu.Portal>
        <Menu.Positioner sideOffset={8}>
          <Menu.Popup
            ref={popup}
            id={id}
            // The positioning trigger is hidden, so every close path restores a visible browser target.
            finalFocus={false}
            className={FILE_MENU_POPUP_CLASS}
          >
            {actions.map((action, index) => (
              <Fragment key={`${action.label}-${index}`}>
                {action.separatorBefore ? <DropdownMenu.Separator /> : null}
                <DropdownMenu.Item
                  variant={action.variant}
                  disabled={action.disabled}
                  onClick={() => {
                    action.onSelect()
                  }}
                >
                  {action.label}
                </DropdownMenu.Item>
              </Fragment>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
