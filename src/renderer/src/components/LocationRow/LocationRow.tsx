import { pathBasename } from '@renderer/lib/path-basename'

export function LocationRow({ path }: { path: string }): React.JSX.Element {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="truncate">{pathBasename(path)}</span>
      <span className="truncate text-base text-kumo-subtle">{path}</span>
    </span>
  )
}
