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
  onOpenChange
}: Props): React.JSX.Element {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
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
