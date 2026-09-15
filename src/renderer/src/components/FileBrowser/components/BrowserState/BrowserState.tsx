import { BrowserEmpty } from '../BrowserEmpty'
import { BrowserError } from '../BrowserError'
import { BrowserLoading } from '../BrowserLoading'
import { BrowserMessageRow } from '../BrowserMessageRow'
import { BrowserNoMatches } from '../BrowserNoMatches'
import type { Props } from './interface'

/** The one message row a browser shows instead of rows: an error, loading, no matches or empty. */
export function BrowserState({
  level,
  error,
  loading,
  filter,
  onRetry,
  onBack,
  onClearFilter,
  noMatches,
  empty
}: Props): React.JSX.Element {
  return (
    <BrowserMessageRow level={level}>
      {error ? (
        <BrowserError message={error} onRetry={onRetry} onBack={onBack} />
      ) : loading ? (
        <BrowserLoading />
      ) : filter ? (
        <BrowserNoMatches
          title={noMatches.title}
          description={noMatches.description}
          onClear={onClearFilter}
        />
      ) : (
        <BrowserEmpty title={empty.title} description={empty.description} />
      )}
    </BrowserMessageRow>
  )
}
