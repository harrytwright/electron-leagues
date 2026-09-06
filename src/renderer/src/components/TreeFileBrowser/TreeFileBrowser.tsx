import { SeasonFiles } from '../SeasonFiles'
import type { Props } from '../SeasonFiles/interface'

/** Neutral entry point for the reusable, expandable file-tree browser. */
export function TreeFileBrowser(props: Props): React.JSX.Element {
  return <SeasonFiles {...props} />
}
