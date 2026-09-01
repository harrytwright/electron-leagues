import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import SharedView from '../SharedView'
import { makeTree } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

it('renders Shared and Templates sections with their empty labels', () => {
  installMockApi()
  renderWithProviders(<SharedView tree={makeTree()} />)

  expect(screen.getByRole('heading', { level: 2, name: 'Shared' })).toBeInTheDocument()
  expect(
    screen.getByText('Drop general documents here — opening times, lane prices…')
  ).toBeVisible()
  expect(screen.getByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument()
  expect(screen.getByText('Documents here are copied into every new season')).toBeVisible()
})

it('reveals the shared and templates folders from their own buttons', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<SharedView tree={makeTree({ root: '/leagues' })} />)
  const sharedSection = screen.getByRole('heading', { level: 2, name: 'Shared' }).closest('section')
  const templatesSection = screen
    .getByRole('heading', { level: 2, name: 'Templates' })
    .closest('section')

  expect(sharedSection).not.toBeNull()
  expect(templatesSection).not.toBeNull()
  await user.click(within(sharedSection!).getByRole('button', { name: 'Show in folder — shared' }))
  await user.click(within(templatesSection!).getByRole('button', { name: 'Show in folder — templates' }))

  expect(api.revealFile).toHaveBeenNthCalledWith(1, '/leagues/_shared')
  expect(api.revealFile).toHaveBeenNthCalledWith(2, '/leagues/_templates')
})

it('only enables file drop targets for folders that exist', () => {
  installMockApi()
  const view = renderWithProviders(
    <SharedView tree={makeTree({ hasShared: false, hasTemplates: false })} />
  )

  expect(screen.queryByRole('button', { name: 'Add files…' })).not.toBeInTheDocument()

  view.rerender(<SharedView tree={makeTree({ hasShared: true, hasTemplates: false })} />)

  const sharedSection = screen.getByRole('heading', { level: 2, name: 'Shared' }).closest('section')
  const templatesSection = screen
    .getByRole('heading', { level: 2, name: 'Templates' })
    .closest('section')
  expect(within(sharedSection!).getByRole('button', { name: 'Add files…' })).toBeInTheDocument()
  expect(
    within(templatesSection!).queryByRole('button', { name: 'Add files…' })
  ).not.toBeInTheDocument()

  view.rerender(<SharedView tree={makeTree({ hasShared: false, hasTemplates: true })} />)

  expect(
    within(sharedSection!).queryByRole('button', { name: 'Add files…' })
  ).not.toBeInTheDocument()
  expect(within(templatesSection!).getByRole('button', { name: 'Add files…' })).toBeInTheDocument()
})
