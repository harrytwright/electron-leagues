import { Sidebar as KumoSidebar } from '@cloudflare/kumo'
import { HouseIcon } from '@phosphor-icons/react'
import { IconButton } from '../IconButton'
import { LocationSwitcher } from '../LocationSwitcher'
import type { Props } from './interface'
import './Toolbar.css'

export function Toolbar({ root, isHome, onHome, onLocationChanged }: Props): React.JSX.Element {
  return (
    <header className="toolbar relative z-30 shrink-0 border-b border-kumo-line bg-kumo-base">
      <div className="toolbar-content flex h-full items-center gap-2">
        <KumoSidebar.Trigger className="relative z-10 [app-region:no-drag]" />
        <IconButton
          aria-label="Go home"
          variant="ghost"
          icon={<HouseIcon aria-hidden />}
          aria-current={isHome ? 'page' : undefined}
          className="relative z-10 [app-region:no-drag]"
          onClick={onHome}
        />
        <div className="relative z-10 w-64 max-w-[40vw] min-w-0 [app-region:no-drag]">
          <LocationSwitcher root={root} onChanged={onLocationChanged} />
        </div>
      </div>
    </header>
  )
}
