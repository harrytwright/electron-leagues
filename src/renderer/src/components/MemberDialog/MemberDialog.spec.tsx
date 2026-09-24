import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi, type Mock } from 'vitest'
import { MemberDialog, type MemberDialogProps } from './index'
import { makeMember, makeSnapshot } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

interface DialogHarness {
  onSaved: Mock<MemberDialogProps['onSaved']>
}

function renderDialog(props: Partial<MemberDialogProps> = {}): DialogHarness {
  const onSaved = vi.fn<MemberDialogProps['onSaved']>()
  renderWithProviders(
    <MemberDialog
      snapshot={makeSnapshot({ revision: 'rev-7' })}
      member={null}
      open
      onOpenChange={vi.fn()}
      onSaved={onSaved}
      {...props}
    />
  )
  return { onSaved }
}

it('adds a member with the fields shaped for main and the snapshot revision', async () => {
  const api = installMockApi()
  const { onSaved } = renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/first name/i), 'Ann')
  await user.type(screen.getByLabelText(/last name/i), 'Lee')
  await user.type(screen.getByLabelText('Date of birth'), '1990-05-04')
  await user.type(screen.getByLabelText(/email/i), 'ann@example.org')
  await user.type(screen.getByLabelText(/mbd ids/i), '10, 11')
  await user.click(screen.getByRole('button', { name: 'Add member' }))

  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  expect(api.saveMember).toHaveBeenCalledWith(
    {
      firstName: 'Ann',
      lastName: 'Lee',
      dob: '1990-05-04',
      email: 'ann@example.org',
      mbdIds: ['10', '11'],
      aliases: [],
      marketing: true
    },
    'rev-7'
  )
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 1, firstName: 'Ann' }))
})

it('offers a calendar beside the date of birth that fills the field', async () => {
  installMockApi()
  renderDialog()
  const user = userEvent.setup()

  await user.type(screen.getByLabelText('Date of birth'), '1990-05-04')
  await user.click(screen.getByRole('button', { name: 'Open the date of birth calendar' }))
  expect(await screen.findByRole('combobox', { name: 'Choose the Year' })).toHaveValue('1990')
  await user.click(screen.getByRole('button', { name: /May 6th, 1990/ }))

  expect(screen.getByLabelText('Date of birth')).toHaveValue('1990-05-06')
  await waitFor(() =>
    expect(screen.queryByRole('combobox', { name: 'Choose the Year' })).not.toBeInTheDocument()
  )
})

it('swaps contact fields for a guardian contact once the date of birth makes them a junior', async () => {
  installMockApi()
  renderDialog()
  const user = userEvent.setup()

  expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  const thisYear = new Date().getFullYear()
  await user.type(screen.getByLabelText('Date of birth'), `${thisYear - 10}-01-01`)

  expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  expect(screen.getByLabelText(/parent or guardian contact/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/youth updates/i, { selector: '[role="checkbox"]' })).toBeChecked()
})

it('edits an existing member from their current details and keeps their number', async () => {
  const api = installMockApi()
  const member = makeMember({
    id: 42,
    firstName: 'Bob',
    lastName: 'Kay',
    phone: '0770',
    aliases: ['Robert Kay'],
    cardIssued: '2026-01-02'
  })
  renderDialog({ member })
  const user = userEvent.setup()

  expect(screen.getByLabelText(/first name/i)).toHaveValue('Bob')
  expect(screen.getByLabelText(/other names or spellings/i)).toHaveValue('Robert Kay')
  await user.clear(screen.getByLabelText(/phone/i))
  await user.click(screen.getByRole('button', { name: 'Save member' }))

  await waitFor(() => expect(api.saveMember).toHaveBeenCalledOnce())
  expect(api.saveMember).toHaveBeenCalledWith(
    expect.objectContaining({ id: 42, firstName: 'Bob', cardIssued: '2026-01-02' }),
    'rev-7'
  )
  expect(vi.mocked(api.saveMember).mock.calls[0][0]).not.toHaveProperty('phone')
})

it('refuses a member without both names and shows main’s error inline', async () => {
  const api = installMockApi({
    saveMember: vi.fn().mockRejectedValue(new Error('That file changed on disk'))
  })
  renderDialog()
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Add member' }))
  expect(screen.getByRole('alert')).toHaveTextContent('A member needs a first and last name')
  expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText(/last name/i)).toHaveAttribute('aria-invalid', 'true')
  expect(api.saveMember).not.toHaveBeenCalled()

  await user.type(screen.getByLabelText(/first name/i), 'Ann')
  expect(screen.getByLabelText(/first name/i)).not.toHaveAttribute('aria-invalid')
  expect(screen.getByLabelText(/last name/i)).toHaveAttribute('aria-invalid', 'true')
  await user.type(screen.getByLabelText(/last name/i), 'Lee')
  await user.click(screen.getByRole('button', { name: 'Add member' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That file changed on disk')
  expect(screen.getByLabelText(/first name/i)).not.toHaveAttribute('aria-invalid')
  expect(screen.getByLabelText(/last name/i)).not.toHaveAttribute('aria-invalid')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
