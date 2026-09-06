import { formatModified } from '@renderer/lib/format-date'
import type { Props } from './interface'

export function FileModified({ mtime, title }: Props): React.JSX.Element {
  return mtime === undefined ? (
    <>—</>
  ) : (
    <time dateTime={new Date(mtime).toISOString()} title={title}>
      {formatModified(mtime)}
    </time>
  )
}
