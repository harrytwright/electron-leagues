import { Table } from '@cloudflare/kumo'
import type { Props } from './interface'

export function BrowserMessageRow({ children, level }: Props): React.JSX.Element {
  return (
    <Table.Row aria-level={level} className="even:bg-transparent">
      <Table.Cell colSpan={4}>{children}</Table.Cell>
    </Table.Row>
  )
}
