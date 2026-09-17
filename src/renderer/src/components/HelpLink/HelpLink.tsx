import { Link } from '@cloudflare/kumo'
import { HELP_LINKS } from '@renderer/lib/help/links'
import { hasHelpTarget, helpTopics } from '@renderer/lib/help/topics'
import type { Props } from './interface'

/** A link into the help window that stays hidden while its topic is still a draft. */
export function HelpLink({ link, children }: Props): React.JSX.Element | null {
  const target = HELP_LINKS[link]
  if (!hasHelpTarget(helpTopics(), target)) return null
  return (
    <Link
      variant="inline"
      render={<button type="button" />}
      className="text-sm"
      onClick={() => void window.api.openHelp(target)}
    >
      {children}
    </Link>
  )
}
