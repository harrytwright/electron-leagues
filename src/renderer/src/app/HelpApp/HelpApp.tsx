import { AppErrorBoundary } from '@renderer/components/AppErrorBoundary'
import { HelpView } from '@renderer/views/HelpView'
import { useAppCommands } from '@renderer/hooks/use-app-commands'
import type { Props } from './interface'

/** The help window's root: the same error boundary and menu command subscription as the app. */
export function HelpApp(props: Props): React.JSX.Element {
  useAppCommands()
  return (
    <AppErrorBoundary>
      <HelpView {...props} />
    </AppErrorBoundary>
  )
}
