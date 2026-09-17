import { AppErrorBoundary } from './components/AppErrorBoundary'
import { HelpView, type HelpViewProps } from './components/HelpView'
import { useAppCommands } from './hooks/use-app-commands'

/** The help window's root: the same error boundary and menu command subscription as the app. */
export function HelpApp(props: HelpViewProps): React.JSX.Element {
  useAppCommands()
  return (
    <AppErrorBoundary>
      <HelpView {...props} />
    </AppErrorBoundary>
  )
}
