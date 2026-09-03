import { Sidebar as KumoSidebar } from '@cloudflare/kumo'

import type { Props } from './interface'

import { Content } from './components/Content'

export function Sidebar({ tree, selection, onSelect }: Props): React.JSX.Element {
  return (
    <KumoSidebar role="navigation" aria-label="Leagues" className="select-none">
      <Content tree={tree} selection={selection} onSelect={onSelect} />
    </KumoSidebar>
  )
}
