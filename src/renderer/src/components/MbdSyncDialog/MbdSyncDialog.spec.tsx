import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi, type Mock } from 'vitest'
import type { MappingPreview, SyncPlan } from '@shared/imports'
import { MbdSyncDialog } from './index'
import { makeMember, makeSnapshot } from '../../tests/fixtures'
import { installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'

const PATH = 'C:\\Exports\\all-bowlers.csv'

const PREVIEW: MappingPreview = {
  path: PATH,
  fileName: 'all-bowlers.csv',
  columns: ['ID', 'First', 'Last', 'Sex'],
  sample: [['10', 'Ann', 'Lee', 'F']],
  rowCount: 4,
  choices: [],
  mapping: {
    mbdId: 0,
    firstName: 1,
    lastName: 2,
    fullName: null,
    gender: 3,
    team: null,
    league: null
  },
  remembered: false
}

const PLAN: SyncPlan = {
  rows: [
    {
      row: { line: 2, mbdId: '10', firstName: 'Annie', lastName: 'Lee' },
      match: { kind: 'known', memberId: 1, newSpelling: true }
    },
    {
      row: { line: 3, mbdId: '30', firstName: 'Cy', lastName: 'Dee' },
      match: {
        kind: 'similar',
        candidates: [{ ref: { kind: 'member', memberId: 2 }, name: 'Cy Dee', exact: true }]
      }
    },
    { row: { line: 4, mbdId: '40', firstName: 'New', lastName: 'Person' }, match: { kind: 'new' } }
  ],
  invalid: [{ line: 5, message: 'No MBD ID' }]
}

interface DialogHarness {
  onOpenChange: Mock<(open: boolean) => void>
}

function renderDialog(): DialogHarness {
  const onOpenChange = vi.fn<(open: boolean) => void>()
  renderWithProviders(
    <MbdSyncDialog
      snapshot={makeSnapshot({
        nextId: 3,
        revision: 'members-r4',
        members: [
          makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee', mbdIds: ['10'] }),
          makeMember({ id: 2, firstName: 'Cy', lastName: 'Dee' })
        ]
      })}
      path={PATH}
      onOpenChange={onOpenChange}
    />
  )
  return { onOpenChange }
}

it('walks from the mapping to the decisions and syncs with them', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    previewImport: vi.fn().mockResolvedValue(PREVIEW),
    planMbdSync: vi
      .fn()
      .mockResolvedValue({ plan: PLAN, revision: 'members-r4', sourceRevision: 'export-r1' }),
    syncMbd: vi.fn().mockResolvedValue({
      rows: 4,
      created: 1,
      matched: 1,
      merged: 1,
      aliased: 1,
      restored: 0,
      skipped: 0,
      failed: [{ line: 5, message: 'No MBD ID' }],
      log: [
        {
          line: 2,
          mbdId: '10',
          name: 'Annie Lee',
          action: 'renamed',
          detail: 'Already Ann Lee (1); renamed to Annie Lee'
        },
        {
          line: 3,
          mbdId: '30',
          name: 'Cy Dee',
          action: 'merged',
          detail: 'Id added to Cy Dee (2)'
        },
        { line: 4, mbdId: '40', name: 'New Person', action: 'created', detail: 'New member 3' },
        { line: 5, mbdId: '', name: '', action: 'unreadable', detail: 'No MBD ID' }
      ]
    })
  })
  const user = userEvent.setup()
  const { onOpenChange } = renderDialog()

  expect(await screen.findByText(/First 1 of 4 rows in all-bowlers.csv/)).toBeInTheDocument()
  expect(screen.getByLabelText('MBD ID')).toHaveTextContent('ID')
  expect(screen.getByLabelText('Gender')).toHaveTextContent('Sex')
  expect(screen.queryByLabelText('Team')).not.toBeInTheDocument()
  expect(
    within(screen.getByRole('table', { name: 'Sample rows' })).getByText('Ann')
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() =>
    expect(api.planMbdSync).toHaveBeenCalledExactlyOnceWith(PATH, PREVIEW.mapping)
  )
  expect(
    await screen.findByText('4 rows: 1 already known, 1 new, 2 to decide, 1 unreadable')
  ).toBeInTheDocument()
  const review = screen.getByRole('table', { name: 'Rows to sync' })
  expect(within(review).getAllByRole('row')).toHaveLength(5)
  expect(within(review).getByText('Unreadable: No MBD ID')).toBeInTheDocument()
  expect(within(review).getByRole('checkbox', { name: 'Sync New Person' })).toBeChecked()

  // The exact match is proposed as a merge; the spelling question defaults to the name on file.
  expect(screen.getByRole('radio', { name: 'Merge into 000002 Cy Dee (same name)' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Keep 000001 Ann Lee' })).toBeChecked()
  await user.click(screen.getByRole('radio', { name: 'Rename to Annie Lee' }))
  await user.click(screen.getByRole('button', { name: 'Sync 3 rows' }))

  await waitFor(() =>
    expect(api.syncMbd).toHaveBeenCalledExactlyOnceWith(
      PATH,
      PREVIEW.mapping,
      [
        { kind: 'spelling', line: 2, keep: 'export' },
        { kind: 'merge', line: 3, into: { kind: 'member', memberId: 2 } }
      ],
      'members-r4',
      'export-r1'
    )
  )
  // The result stays open with the log until the desk has read it.
  expect(
    await screen.findByText('4 rows: 1 created, 1 matched, 1 merged, 0 skipped, 1 failed')
  ).toBeInTheDocument()
  const log = screen.getByRole('table', { name: 'Sync log' })
  expect(
    within(log)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent)
  ).toEqual([
    '2Annie Lee10RenamedAlready Ann Lee (1); renamed to Annie Lee',
    '3Cy Dee30MergedId added to Cy Dee (2)',
    '4New Person40CreatedNew member 3',
    '5UnreadableNo MBD ID'
  ])
  expect(onOpenChange).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

it('leaves a bowler with no surname out unless ticked, and sends skips for anyone unticked', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    previewImport: vi.fn().mockResolvedValue(PREVIEW),
    planMbdSync: vi.fn().mockResolvedValue({
      plan: {
        rows: [
          {
            row: { line: 2, mbdId: '70', firstName: 'Team 1', lastName: '' },
            match: { kind: 'new' }
          },
          {
            row: { line: 3, mbdId: '80', firstName: 'New', lastName: 'Person' },
            match: { kind: 'new' }
          },
          {
            row: { line: 4, mbdId: '90', firstName: 'Other', lastName: 'Person' },
            match: { kind: 'new' }
          }
        ],
        invalid: []
      },
      revision: 'members-r4',
      sourceRevision: 'export-r1'
    })
  })
  const user = userEvent.setup()
  renderDialog()

  await screen.findByText(/First 1 of 4 rows/)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('3 rows: 0 already known, 3 new, 0 to decide, 1 left out')
  expect(screen.getByRole('checkbox', { name: 'Sync Team 1' })).not.toBeChecked()
  expect(screen.getByText('(no surname)')).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: 'Sync Other Person' }))
  expect(screen.getByRole('button', { name: 'Sync 1 row' })).toBeEnabled()

  // Back and Continue: the desk's own ticks survive, and a row that has lost its surname
  // through a changed mapping starts unticked like any other placeholder.
  await user.click(screen.getByRole('button', { name: 'Back' }))
  vi.mocked(api.planMbdSync).mockResolvedValueOnce({
    plan: {
      rows: [
        {
          row: { line: 2, mbdId: '70', firstName: 'Team 1', lastName: '' },
          match: { kind: 'new' }
        },
        { row: { line: 3, mbdId: '80', firstName: 'New', lastName: '' }, match: { kind: 'new' } },
        {
          row: { line: 4, mbdId: '90', firstName: 'Other', lastName: 'Person' },
          match: { kind: 'new' }
        }
      ],
      invalid: []
    },
    revision: 'members-r4',
    sourceRevision: 'export-r1'
  })
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('3 rows: 0 already known, 3 new, 0 to decide, 3 left out')
  expect(screen.getByRole('checkbox', { name: 'Sync New' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Sync Other Person' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Sync 0 rows' })).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: 'Sync New' }))
  await user.click(screen.getByRole('button', { name: 'Sync 1 row' }))

  await waitFor(() =>
    expect(api.syncMbd).toHaveBeenCalledExactlyOnceWith(
      PATH,
      PREVIEW.mapping,
      [
        { kind: 'skip', line: 2 },
        { kind: 'skip', line: 4 }
      ],
      'members-r4',
      'export-r1'
    )
  )
})

it('leaves a row with two exact twins undecided until the desk chooses', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    previewImport: vi.fn().mockResolvedValue(PREVIEW),
    planMbdSync: vi.fn().mockResolvedValue({
      plan: {
        rows: [
          {
            row: { line: 2, mbdId: '30', firstName: 'Cy', lastName: 'Dee' },
            match: {
              kind: 'similar',
              candidates: [
                { ref: { kind: 'member', memberId: 1 }, name: 'Cy Dee', exact: true },
                { ref: { kind: 'member', memberId: 2 }, name: 'Cy Dee', exact: true }
              ]
            }
          }
        ],
        invalid: []
      },
      revision: 'members-r4',
      sourceRevision: 'export-r1'
    })
  })
  const user = userEvent.setup()
  renderDialog()

  await screen.findByText(/First 1 of 4 rows/)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('1 row: 0 already known, 0 new, 1 to decide')
  for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Sync 1 row' })).toBeDisabled()

  await user.click(screen.getByRole('radio', { name: 'Create a new member' }))
  expect(screen.getByRole('button', { name: 'Sync 1 row' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Sync 1 row' }))
  await waitFor(() =>
    expect(api.syncMbd).toHaveBeenCalledExactlyOnceWith(
      PATH,
      PREVIEW.mapping,
      [{ kind: 'create', line: 2 }],
      'members-r4',
      'export-r1'
    )
  )
})

it('refuses to continue without the columns a sync needs, and shows a preview failure', async () => {
  const api = installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    previewImport: vi.fn().mockResolvedValue({
      ...PREVIEW,
      remembered: true,
      mapping: { ...PREVIEW.mapping, mbdId: null }
    })
  })
  const user = userEvent.setup()
  renderDialog()

  expect(await screen.findByText(/Using the mapping from the last export/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose the column holding the MBD ID')
  expect(api.planMbdSync).not.toHaveBeenCalled()
})

it('reports an export it cannot read', async () => {
  installMockApi({
    getRoot: vi.fn().mockResolvedValue('/root'),
    previewImport: vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'import:preview': Error: Exports are read from .csv, .tsv or .txt files"
        )
      )
  })
  renderDialog()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Exports are read from .csv, .tsv or .txt files'
  )
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
})
