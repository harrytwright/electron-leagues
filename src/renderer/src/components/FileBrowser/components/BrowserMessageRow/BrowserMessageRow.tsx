import { Table } from '@cloudflare/kumo'
import type { Props } from './interface'

export function BrowserMessageRow({ children }: Props): React.JSX.Element {
  return (
    <Table.Row className="even:bg-transparent">
      <Table.Cell colSpan={4}>{children}</Table.Cell>
    </Table.Row>
  )
}
