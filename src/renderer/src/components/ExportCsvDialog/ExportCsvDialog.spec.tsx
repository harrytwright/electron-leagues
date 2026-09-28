import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ExportCsvDialog } from './index'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

it('exports the listed members in order, with the marketing tick, and reports what was written', async () => {
  const api = installMockApi({
    exportMembersCsv: vi
      .fn()
      .mockResolvedValue({ path: '/Users/desk/Documents/Members.csv', count: 1 })
  })
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<ExportCsvDialog ids={[3, 1, 2]} open onOpenChange={onOpenChange} />)

  expect(screen.getByRole('dialog')).toHaveTextContent(
    'The 3 members on the list, in the order shown'
  )
  await user.click(screen.getByRole('checkbox', { name: 'Only members who accept marketing' }))
  await user.click(screen.getByRole('button', { name: 'Choose where to save…' }))

  await waitFor(() =>
    expect(api.exportMembersCsv).toHaveBeenCalledExactlyOnceWith([3, 1, 2], { marketingOnly: true })
  )
  expect(
    await screen.findByText('Exported 1 member to /Users/desk/Documents/Members.csv')
  ).toBeInTheDocument()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('stays open and shows the reason when the export fails, and closes quietly on cancel', async () => {
  const api = installMockApi({
    exportMembersCsv: vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Error invoking remote method 'members:export-csv': Error: Disk full")
      )
      .mockResolvedValueOnce(null)
  })
  const onOpenChange = vi.fn()
  const user = userEvent.setup()
  renderWithProviders(<ExportCsvDialog ids={[1]} open onOpenChange={onOpenChange} />)

  await user.click(screen.getByRole('button', { name: 'Choose where to save…' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
  expect(onOpenChange).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Choose where to save…' }))
  await waitFor(() => expect(api.exportMembersCsv).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(screen.queryByText(/Exported/)).not.toBeInTheDocument()
})
