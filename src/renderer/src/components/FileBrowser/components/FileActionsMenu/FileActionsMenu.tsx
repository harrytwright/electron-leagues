import { DropdownMenu, Table } from '@cloudflare/kumo'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { revealLabel } from '@renderer/lib/reveal-label'
import { IconButton } from '../../../IconButton'
import type { Props } from './interface'

/** Shared row actions; callers compose domain-specific actions after Open and Reveal. */
export function FileActionsMenu({ name, onOpen, onReveal, children }: Props): React.JSX.Element {
  return (
    <Table.Cell
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <IconButton
              variant="ghost"
              size="sm"
              icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
              aria-label={`Actions for ${name}`}
            />
          }
        />
        <DropdownMenu.Content>
          <DropdownMenu.Item onClick={onOpen}>Open</DropdownMenu.Item>
          <DropdownMenu.Item onClick={onReveal}>{revealLabel()}</DropdownMenu.Item>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu>
    </Table.Cell>
  )
}
