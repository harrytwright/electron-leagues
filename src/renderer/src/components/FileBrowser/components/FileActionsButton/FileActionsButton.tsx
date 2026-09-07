import { Table } from '@cloudflare/kumo'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { IconButton } from '../../../IconButton'
import type { Props } from './interface'

export function FileActionsButton({ name, menuId, expanded, onClick }: Props): React.JSX.Element {
  return (
    <Table.Cell
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <IconButton
        variant="ghost"
        size="sm"
        icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={expanded ? menuId : undefined}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.click()
        }}
        onClick={onClick}
      />
    </Table.Cell>
  )
}
