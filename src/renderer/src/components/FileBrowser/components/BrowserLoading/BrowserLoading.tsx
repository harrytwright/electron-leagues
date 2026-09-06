import { Loader } from '@cloudflare/kumo'

export function BrowserLoading(): React.JSX.Element {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-kumo-subtle">
      <Loader />
      Loading files…
    </div>
  )
}
