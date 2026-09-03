import { Button, Sidebar as KumoSidebar } from '@cloudflare/kumo'
import { HouseIcon } from '@phosphor-icons/react'
import { LocationSwitcher } from '../LocationSwitcher'
import type { Props } from './interface'
import './Toolbar.css'

export function Toolbar({ root, isHome, onHome, onLocationChanged }: Props): React.JSX.Element {
  return (
    <header className="toolbar relative z-30 shrink-0 border-b border-kumo-line bg-kumo-base">
      <div className="toolbar-content flex h-full items-center gap-2">
        <Button
          icon={HouseIcon}
          variant="ghost"
          title="Go home"
          aria-current={isHome ? 'page' : undefined}
          className="relative z-10 !w-9 justify-center px-0 [app-region:no-drag]"
          onClick={onHome}
        />
        <div className="relative z-10 w-64 max-w-[40vw] min-w-0 [app-region:no-drag]">
          <LocationSwitcher root={root} onChanged={onLocationChanged} />
        </div>
        <KumoSidebar.Trigger className="relative z-10 ml-auto [app-region:no-drag]" />
      </div>
    </header>
  )
}
