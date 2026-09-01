import { render, screen } from '@testing-library/react'
import { Button } from '@cloudflare/kumo'
import { expect, it } from 'vitest'
import { installMockApi } from './mock-api'

it('renders a Kumo button', () => {
  installMockApi()
  render(<Button>Create league</Button>)
  expect(screen.getByRole('button', { name: 'Create league' })).toBeInTheDocument()
})
