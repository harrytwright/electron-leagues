import { DropdownMenu } from '@cloudflare/kumo'
import { Fragment } from 'react'
import type { Props } from './interface'

/** One controlled menu shared by every row and every invocation method in a browser. */
export function FileActionsMenu({
  id,
  label,
  open,
  anchor,
  actions,
  onOpenChange,
  onRestoreFocus
}: Props): React.JSX.Element {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
        id={`${id}-trigger`}
        render={
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            aria-label={label}
            onFocus={(event) => {
              if (open) return
              // Base UI can return focus after the popup's exit animation.
              // Never leave it on this positioning-only trigger, and preserve
              // a newer focus target (such as a dialog opened by a menu action).
              onRestoreFocus(
                event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
              )
              if (document.activeElement === event.currentTarget) {
                // The original row can disappear during a watcher refresh.
                // Fall back to a visible control in this browser, never to the
                // hidden positioning button or a different pane.
                if (document.activeElement === event.currentTarget) {
                  const browser = event.currentTarget.closest('[data-file-drop-target]')
                  const fallback =
                    browser?.querySelector<HTMLElement>('tr[tabindex="0"]') ??
                    browser?.querySelector<HTMLInputElement>('input')
                  fallback?.focus()
                }
              }
            }}
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: anchor.left, top: anchor.top }}
          />
        }
      />
      <DropdownMenu.Content id={id}>
        {actions.map((action, index) => (
          <Fragment key={`${action.label}-${index}`}>
            {action.separatorBefore ? <DropdownMenu.Separator /> : null}
            <DropdownMenu.Item
              variant={action.variant}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.label}
            </DropdownMenu.Item>
          </Fragment>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
