import {
  render,
  renderHook,
  type RenderOptions,
  type RenderResult,
  type RenderHookOptions,
  type RenderHookResult
} from '@testing-library/react'
import { TestProviders } from './TestProviders'

interface ProviderOptions {
  locationKey?: string
}

type ProviderRenderOptions = RenderOptions & ProviderOptions
type ProviderRenderHookOptions<Props> = RenderHookOptions<Props> & ProviderOptions

function createWrapper(
  options: ProviderOptions & Pick<RenderOptions, 'wrapper'>
): NonNullable<RenderOptions['wrapper']> {
  const InnerWrapper = options.wrapper
  return function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
    return (
      <TestProviders locationKey={options.locationKey}>
        {InnerWrapper ? <InnerWrapper>{children}</InnerWrapper> : children}
      </TestProviders>
    )
  }
}

/**
 * Render a component under the same providers App mounts at its root.
 * RTL retains the wrapper created for this render across view.rerender() calls.
 * To change location without remounting, set options.locationKey before rerender().
 * An optional wrapper runs inside the shared providers, e.g. for feedback probes.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderRenderOptions = {}
): RenderResult {
  return render(ui, { ...options, wrapper: createWrapper(options) })
}

/**
 * Uses the same provider options and location-change pattern as renderWithProviders.
 * initialProps and rerender(props) reach the hook callback; RTL does not pass them
 * to the wrapper, which reads locationKey from the original options object.
 */
export function renderHookWithProviders<Result, Props>(
  callback: (props: Props) => Result,
  options: ProviderRenderHookOptions<Props> = {}
): RenderHookResult<Result, Props> {
  return renderHook(callback, { ...options, wrapper: createWrapper(options) })
}
