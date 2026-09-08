import { Menu } from '@cloudflare/kumo/primitives/menu'
import { DropdownMenu } from '@cloudflare/kumo'
import { Fragment, useRef } from 'react'
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
  const popup = useRef<HTMLDivElement>(null)

  return (
    <Menu.Root
      open={open}
      onOpenChange={(nextOpen, eventDetails) => onOpenChange(nextOpen, eventDetails.reason)}
    >
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
            aria-label={label}
            finalFocus={false}
            className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-h-[var(--available-height)] min-w-36 overflow-y-auto rounded-lg bg-kumo-control p-1.5 text-kumo-default shadow-lg ring ring-kumo-line"
          >
            {actions.map((action, index) => (
              <Fragment key={`${action.label}-${index}`}>
                {action.separatorBefore ? <DropdownMenu.Separator /> : null}
                <DropdownMenu.Item
                  variant={action.variant}
                  disabled={action.disabled}
                  onClick={() => {
                    action.onSelect()
                    queueMicrotask(() => {
                      const active = document.activeElement
                      if (active === document.body || (active && popup.current?.contains(active))) {
                        onRestoreFocus()
                      }
                    })
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
