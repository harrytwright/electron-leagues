import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar as KumoSidebar } from '@cloudflare/kumo'
import { expect, it, vi, type Mock } from 'vitest'
import { Toolbar, type Props } from './index'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

interface ToolbarHarnessProps {
  isHome: boolean
  onHome: Props['onHome']
}

interface ToolbarHarness {
  onHome: Mock<Props['onHome']>
  view: ReturnType<typeof renderWithProviders>
}

function ToolbarFixture({ isHome, onHome }: ToolbarHarnessProps): React.JSX.Element {
  return (
    <KumoSidebar.Provider contained defaultOpen collapsible="icon" className="flex-col">
      <Toolbar
        root="/root/My leagues"
        isHome={isHome}
        onHome={onHome}
        onLocationChanged={vi.fn()}
      />
      <KumoSidebar>Leagues</KumoSidebar>
    </KumoSidebar.Provider>
  )
}

function renderToolbar(isHome = true): ToolbarHarness {
  installMockApi()
  const onHome = vi.fn<Props['onHome']>()
  const view = renderWithProviders(<ToolbarFixture isHome={isHome} onHome={onHome} />)
  return { onHome, view }
}

it('marks Home as current if and only if Home is selected', () => {
  const { onHome, view } = renderToolbar()

  expect(screen.getByRole('button', { name: 'Go home' })).toHaveAttribute('aria-current', 'page')

  view.rerender(<ToolbarFixture isHome={false} onHome={onHome} />)

  expect(screen.getByRole('button', { name: 'Go home' })).not.toHaveAttribute('aria-current')
})

it('renders the title bar controls and goes Home', async () => {
  const { onHome } = renderToolbar()
  const user = userEvent.setup()

  expect(screen.getByRole('button', { name: 'Location: My leagues' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Go home' }))

  expect(onHome).toHaveBeenCalledOnce()
})

it('toggles the sidebar from the toolbar trigger', async () => {
  renderToolbar()
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: /collapse sidebar/i }))

  expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument()
})
