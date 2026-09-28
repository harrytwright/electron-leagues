import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { MergeMemberPane } from './MergeMemberPane'
import { makeMember, makeSnapshot, makeTree } from '@renderer/tests/fixtures'
import { installMockApi } from '@renderer/tests/mock-api'
import { renderWithProviders } from '@renderer/tests/render-helpers'

/** Renders the pane on its own, already opened with both records selected, so the pane's
 * own dirty tracking can be observed without the row-selection step also making it dirty. */
function renderPane(overrides: { onDirtyChange?: (dirty: boolean) => void } = {}): void {
  const snapshot = makeSnapshot({
    revision: 'rev-3',
    nextId: 3,
    members: [
      makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
      makeMember({ id: 2, firstName: 'Andrea', lastName: 'Lee' })
    ]
  })
  renderWithProviders(
    <MergeMemberPane
      snapshot={snapshot}
      openingSnapshot={snapshot}
      selectedIds={[1, 2]}
      mainId={1}
      compact={false}
      root={makeTree().root}
      selectionFrozen={false}
      onMainChange={vi.fn()}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
      onFreezeSelection={vi.fn()}
      onUnfreezeSelection={vi.fn()}
      onBusyChange={vi.fn()}
      onDirtyChange={overrides.onDirtyChange ?? vi.fn()}
      onBackgroundError={vi.fn()}
      onBackgroundSuccess={vi.fn()}
    />
  )
}

it('does not count choosing the alternative equal to the default as a change', async () => {
  installMockApi()
  const onDirtyChange = vi.fn()
  renderPane({ onDirtyChange })
  const user = userEvent.setup()
  // A pane dirty from the start would still pass a bare `not.toHaveBeenCalledWith(true)`
  // taken after clearing, since the effect never re-fires for an unchanged value.
  expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  onDirtyChange.mockClear()

  expect(screen.getByLabelText('First name')).toHaveValue('Ann')
  const firstNameSources = screen.getByLabelText('First name source values')
  await user.click(within(firstNameSources).getByRole('button', { name: /Ann Lee/ }))

  expect(screen.getByLabelText('First name')).toHaveValue('Ann')
  expect(onDirtyChange).not.toHaveBeenCalledWith(true)
})

it('does not count a field typed back to its original value as a change', async () => {
  installMockApi()
  const onDirtyChange = vi.fn()
  renderPane({ onDirtyChange })
  const user = userEvent.setup()
  expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  onDirtyChange.mockClear()

  const firstName = screen.getByLabelText('First name')
  await user.type(firstName, 'ie')
  expect(onDirtyChange).toHaveBeenCalledWith(true)
  await user.type(firstName, '{Backspace}{Backspace}')

  expect(firstName).toHaveValue('Ann')
  expect(onDirtyChange).toHaveBeenLastCalledWith(false)
})

it('counts a genuinely different choice as a change', async () => {
  installMockApi()
  const onDirtyChange = vi.fn()
  renderPane({ onDirtyChange })
  const user = userEvent.setup()
  expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  onDirtyChange.mockClear()

  const firstNameSources = screen.getByLabelText('First name source values')
  await user.click(within(firstNameSources).getByRole('button', { name: /Andrea Lee/ }))

  expect(screen.getByLabelText('First name')).toHaveValue('Andrea')
  expect(onDirtyChange).toHaveBeenCalledWith(true)
})

it('falls back to the default guardian once its source record is deselected', async () => {
  const api = installMockApi()
  const dob = `${new Date().getFullYear() - 10}-01-01`
  const grandad = makeMember({ id: 10, firstName: 'Gran', lastName: 'Lee' })
  const grandpop = makeMember({ id: 11, firstName: 'Pop', lastName: 'Lee' })
  const snapshot = makeSnapshot({
    revision: 'rev-3',
    nextId: 12,
    members: [
      grandad,
      grandpop,
      makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee', dob, email: undefined }),
      makeMember({
        id: 2,
        firstName: 'Annie',
        lastName: 'Lee',
        dob,
        email: undefined,
        guardianMemberId: 10
      }),
      makeMember({
        id: 3,
        firstName: 'Anne',
        lastName: 'Lee',
        dob,
        email: undefined,
        guardianMemberId: 11
      })
    ]
  })
  const props = {
    snapshot,
    openingSnapshot: snapshot,
    mainId: 1,
    compact: false,
    root: makeTree().root,
    selectionFrozen: false,
    onMainChange: vi.fn(),
    onCancel: vi.fn(),
    onSaved: vi.fn(),
    onFreezeSelection: vi.fn(),
    onUnfreezeSelection: vi.fn(),
    onBusyChange: vi.fn(),
    onDirtyChange: vi.fn(),
    onBackgroundError: vi.fn(),
    onBackgroundSuccess: vi.fn()
  }
  const view = renderWithProviders(<MergeMemberPane {...props} selectedIds={[1, 2, 3]} />)
  const user = userEvent.setup()

  await user.click(
    within(screen.getByLabelText('Linked guardian source values')).getByRole('button', {
      name: /000011 Pop Lee/
    })
  )
  expect(screen.getByText(/Linked guardian: Pop Lee \(000011\)/)).toBeInTheDocument()

  // Anne, who carried the chosen link, is deselected: the choice falls back to the
  // default rather than being written from a record no longer in the merge.
  view.rerender(<MergeMemberPane {...props} selectedIds={[1, 2]} />)
  expect(screen.getByRole('status')).toHaveTextContent(
    'The chosen source record was removed. The result now uses the default value.'
  )
  expect(screen.getByText(/Linked guardian: Gran Lee \(000010\)/)).toBeInTheDocument()
  expect(screen.queryByText(/Pop Lee/)).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Merge members' }))
  await waitFor(() => expect(api.mergeMemberGroup).toHaveBeenCalledOnce())
  expect(api.mergeMemberGroup).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceIds: [1, 2],
      result: expect.objectContaining({ guardianMemberId: 10 })
    })
  )
})

it('labels unusable guardian alternatives so the desk sees why a choice will be refused', () => {
  installMockApi()
  const dob = `${new Date().getFullYear() - 10}-01-01`
  const snapshot = makeSnapshot({
    revision: 'rev-3',
    nextId: 21,
    members: [
      makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
      makeMember({ id: 2, firstName: 'Bea', lastName: 'Lee', guardianMemberId: 10 }),
      makeMember({ id: 3, firstName: 'Cal', lastName: 'Lee', guardianMemberId: 11 }),
      makeMember({ id: 4, firstName: 'Di', lastName: 'Lee', guardianMemberId: 12 }),
      makeMember({ id: 5, firstName: 'Eli', lastName: 'Lee', guardianMemberId: 13 }),
      makeMember({ id: 10, firstName: 'Gone', lastName: 'Gran', deleted: true }),
      makeMember({ id: 11, firstName: 'Young', lastName: 'Gran', dob }),
      makeMember({ id: 12, firstName: 'Dup', lastName: 'One' }),
      makeMember({ id: 12, firstName: 'Dup', lastName: 'Two' }),
      makeMember({ id: 13, firstName: 'Old', lastName: 'Gran', mergedInto: 20 }),
      makeMember({ id: 20, firstName: 'Vic', lastName: 'Tor' })
    ]
  })
  renderWithProviders(
    <MergeMemberPane
      snapshot={snapshot}
      openingSnapshot={snapshot}
      selectedIds={[1, 2, 3, 4, 5]}
      mainId={1}
      compact={false}
      root={makeTree().root}
      selectionFrozen={false}
      onMainChange={vi.fn()}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
      onFreezeSelection={vi.fn()}
      onUnfreezeSelection={vi.fn()}
      onBusyChange={vi.fn()}
      onDirtyChange={vi.fn()}
      onBackgroundError={vi.fn()}
      onBackgroundSuccess={vi.fn()}
    />
  )
  const group = screen.getByLabelText('Linked guardian source values')
  expect(within(group).getByRole('button', { name: /000010.*\(removed\)/ })).toBeInTheDocument()
  expect(within(group).getByRole('button', { name: /000011.*\(under 18\)/ })).toBeInTheDocument()
  expect(
    within(group).getByRole('button', { name: /000012.*\(duplicated number\)/ })
  ).toBeInTheDocument()
  expect(
    within(group).getByRole('button', { name: /000013.*\(merged into 000020 Vic Tor\)/ })
  ).toBeInTheDocument()
})

it('shows no Linked guardian row for an adult merge with no links', () => {
  installMockApi()
  const snapshot = makeSnapshot({
    revision: 'rev-3',
    nextId: 3,
    members: [
      makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
      makeMember({ id: 2, firstName: 'Andrea', lastName: 'Lee' })
    ]
  })
  renderWithProviders(
    <MergeMemberPane
      snapshot={snapshot}
      openingSnapshot={snapshot}
      selectedIds={[1, 2]}
      mainId={1}
      compact={false}
      root={makeTree().root}
      selectionFrozen={false}
      onMainChange={vi.fn()}
      onCancel={vi.fn()}
      onSaved={vi.fn()}
      onFreezeSelection={vi.fn()}
      onUnfreezeSelection={vi.fn()}
      onBusyChange={vi.fn()}
      onDirtyChange={vi.fn()}
      onBackgroundError={vi.fn()}
      onBackgroundSuccess={vi.fn()}
    />
  )
  expect(screen.queryByText('Linked guardian')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Linked guardian source values')).not.toBeInTheDocument()
})
