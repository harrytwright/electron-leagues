import { createContext, forwardRef, useContext } from 'react'
import { Breadcrumbs, LinkProvider, type LinkComponentProps } from '@cloudflare/kumo'
import type { Props } from './interface'

const NavigateContext = createContext<(depth: number) => void>(() => {})

// Kumo breadcrumbs render links through LinkProvider (passing the href as
// `to`); ours navigate in-app instead of following it.
const CrumbLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(function CrumbLink(
  { href, to, ...rest },
  ref
) {
  const navigate = useContext(NavigateContext)
  const target = href ?? to ?? ''
  const depth = Number(target.slice(1))
  return (
    <a
      ref={ref}
      href={target}
      {...rest}
      onClick={(event) => {
        event.preventDefault()
        if (Number.isInteger(depth) && depth >= 0) navigate(depth)
      }}
    />
  )
})

export function CrumbTrail({ names, onNavigate }: Props): React.JSX.Element {
  const last = names.length - 1
  // Kumo only collapses the trail on narrow widths when Link / Separator /
  // Current are its direct children, so build a flat list rather than nesting
  // them in fragments.
  const items = names.flatMap((name, index) =>
    index === last
      ? [<Breadcrumbs.Current key={`current-${index}`}>{name}</Breadcrumbs.Current>]
      : [
          <Breadcrumbs.Link key={`link-${index}`} href={`#${index}`}>
            {name}
          </Breadcrumbs.Link>,
          <Breadcrumbs.Separator key={`separator-${index}`} />
        ]
  )
  return (
    <NavigateContext.Provider value={onNavigate}>
      <LinkProvider component={CrumbLink}>
        <Breadcrumbs size="sm">{items}</Breadcrumbs>
      </LinkProvider>
    </NavigateContext.Provider>
  )
}
