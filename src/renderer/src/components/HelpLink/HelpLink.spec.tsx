import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { HELP_LINKS } from '@renderer/lib/help/links'
import * as topics from '@renderer/lib/help/topics'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'
import { HelpLink } from './index'

it('opens the help window at the registered target', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderWithProviders(<HelpLink link="seasonNames">How season names work</HelpLink>)

  await user.click(screen.getByRole('button', { name: 'How season names work' }))
  expect(api.openHelp).toHaveBeenCalledExactlyOnceWith(HELP_LINKS.seasonNames)
})

it('renders nothing while the target topic is not available', () => {
  vi.spyOn(topics, 'helpTopics').mockReturnValue([])
  renderWithProviders(<HelpLink link="seasonNames">How season names work</HelpLink>)
  expect(screen.queryByRole('button')).toBeNull()
})
