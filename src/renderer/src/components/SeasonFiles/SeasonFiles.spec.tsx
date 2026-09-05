import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { DirEntry } from '@shared/tree'
import { makeDirEntry } from '../../tests/fixtures'
import { emitTreeChanged, installMockApi } from '../../tests/mock-api'
import { renderWithProviders } from '../../tests/render-helpers'
import { SeasonFiles } from './SeasonFiles'
import type { Props } from './interface'

const season = '/leagues/monday/Triples/2025-26'
const weeks = makeDirEntry({
  name: 'Weekly results',
  kind: 'folder',
  path: `${season}/Weekly results`
})
const week1 = makeDirEntry({ name: 'Week 1', kind: 'folder', path: `${weeks.path}/Week 1` })
const results = makeDirEntry({ name: 'Results.xlsx', path: `${week1.path}/Results.xlsx` })
const rules = makeDirEntry({ name: 'Rules.pdf', path: `${season}/Rules.pdf` })

function renderFiles(overrides: Partial<Props> = {}): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <SeasonFiles
      name="2025-26"
      readOnly={false}
      listing={{ entries: [rules, weeks], error: null, reload: vi.fn() }}
      onNavigate={vi.fn()}
      onBack={{ label: 'Back to league', action: vi.fn() }}
      {...overrides}
    />
  )
}

function row(name: string): HTMLElement {
  return screen.getByRole('row', { name })
}

it('loads folders only when expanded, retaining the hierarchy and cached children', async () => {
  const api = installMockApi({ listDir: vi.fn().mockResolvedValue([week1]) })
  const user = userEvent.setup()
  renderFiles()
  expect(api.listDir).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Expand Weekly results' }))
  expect(await screen.findByRole('row', { name: 'Week 1' })).toHaveAttribute('aria-level', '2')
  expect(row('Weekly results')).toHaveAttribute('aria-expanded', 'true')
  expect(row('Rules.pdf')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Collapse Weekly results' }))
  expect(screen.queryByRole('row', { name: 'Week 1' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Expand Weekly results' }))
  expect(row('Week 1')).toBeInTheDocument()
  expect(api.listDir).toHaveBeenCalledExactlyOnceWith(weeks.path)
})

it('selects on click, opens files on double-click, and reports OS open errors', async () => {
  const api = installMockApi({
    openFile: vi.fn().mockResolvedValue('No application is associated with this file')
  })
  const user = userEvent.setup()
  renderFiles()

  await user.click(row('Rules.pdf'))
  expect(row('Rules.pdf')).toHaveAttribute('aria-selected', 'true')
  expect(api.openFile).not.toHaveBeenCalled()
  await user.dblClick(row('Rules.pdf'))
  expect(api.openFile).toHaveBeenCalledExactlyOnceWith(rules.path)
  expect(await screen.findByText('No application is associated with this file')).toBeInTheDocument()
})

it('supports arrow-key navigation and opens nested folders with their full breadcrumb trail', async () => {
  installMockApi({ listDir: vi.fn().mockResolvedValue([week1]) })
  const onNavigate = vi.fn()
  const user = userEvent.setup()
  renderFiles({ onNavigate })

  await user.click(row('Weekly results'))
  await user.keyboard('{ArrowRight}')
  await screen.findByRole('row', { name: 'Week 1' })
  await user.keyboard('{ArrowRight}')
  expect(row('Week 1')).toHaveFocus()
  await user.keyboard('{ArrowLeft}')
  expect(row('Weekly results')).toHaveFocus()
  await user.keyboard('{End}')
  expect(row('Rules.pdf')).toHaveFocus()
  await user.keyboard('{Home}{ArrowDown}{Enter}')
  expect(onNavigate).toHaveBeenCalledWith([weeks, week1])
})

it('filters loaded descendants while keeping their parents and restores the collapsed state', async () => {
  const api = installMockApi({
    listDir: vi.fn((path) => Promise.resolve(path === weeks.path ? [week1] : [results]))
  })
  const user = userEvent.setup()
  renderFiles()
  await user.click(screen.getByRole('button', { name: 'Expand Weekly results' }))
  await user.click(await screen.findByRole('button', { name: 'Expand Week 1' }))
  await screen.findByRole('row', { name: 'Results.xlsx' })
  await user.click(screen.getByRole('button', { name: 'Collapse all' }))

  await user.type(screen.getByRole('textbox', { name: 'Filter loaded files' }), 'results.xlsx')
  expect(row('Results.xlsx')).toHaveAttribute('aria-level', '3')
  expect(row('Weekly results')).toBeInTheDocument()
  expect(row('Week 1')).toBeInTheDocument()
  expect(screen.queryByRole('row', { name: 'Rules.pdf' })).not.toBeInTheDocument()
  expect(api.listDir).toHaveBeenCalledTimes(2)
  await user.click(screen.getByRole('button', { name: 'Clear filter' }))
  expect(row('Weekly results')).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('row', { name: 'Week 1' })).not.toBeInTheDocument()
})

it('sorts siblings naturally with folders first and keeps children under their parent', async () => {
  const week10 = makeDirEntry({ name: 'Week 10', kind: 'folder', path: `${weeks.path}/Week 10` })
  installMockApi({ listDir: vi.fn().mockResolvedValue([week10, week1]) })
  const user = userEvent.setup()
  renderFiles()
  await user.click(screen.getByRole('button', { name: 'Expand Weekly results' }))
  await screen.findByRole('row', { name: 'Week 10' })

  const names = (): Array<string | null> =>
    within(screen.getByRole('treegrid'))
      .getAllByRole('row')
      .slice(1)
      .map((entry) => entry.getAttribute('aria-label'))
  expect(names()).toEqual(['Weekly results', 'Week 1', 'Week 10', 'Rules.pdf'])
  await user.click(screen.getByRole('button', { name: 'Name' }))
  expect(names()).toEqual(['Weekly results', 'Week 10', 'Week 1', 'Rules.pdf'])
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'aria-sort',
    'descending'
  )
})

it('shows branch errors inline and retries without hiding sibling files', async () => {
  installMockApi({
    listDir: vi.fn().mockRejectedValueOnce(new Error('Folder is offline')).mockResolvedValueOnce([])
  })
  const user = userEvent.setup()
  renderFiles()
  await user.click(screen.getByRole('button', { name: 'Expand Weekly results' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Folder is offline')
  expect(row('Rules.pdf')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Empty folder')).toBeInTheDocument()
})

it('refreshes expanded folders on disk changes and ignores older responses', async () => {
  let finishOld!: (entries: DirEntry[]) => void
  const api = installMockApi({
    listDir: vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<DirEntry[]>((resolve) => {
            finishOld = resolve
          })
      )
      .mockResolvedValue([week1])
  })
  const user = userEvent.setup()
  renderFiles()
  await user.click(screen.getByRole('button', { name: 'Expand Weekly results' }))
  act(emitTreeChanged)
  await screen.findByRole('row', { name: 'Week 1' })
  await act(async () => finishOld([]))
  expect(row('Week 1')).toBeInTheDocument()
  expect(api.listDir).toHaveBeenCalledTimes(2)
})

it('imports dropped files into the visible folder and rejects drops in read-only seasons', async () => {
  installMockApi({ pathForFile: vi.fn((file: File) => `C:\\Imports\\${file.name}`) })
  const onDropFiles = vi.fn()
  const view = renderFiles({ onDropFiles })
  const files = [new File(['scores'], 'Scores.xlsx')]
  fireEvent.drop(screen.getByRole('region', { name: '2025-26 files' }), { dataTransfer: { files } })
  expect(onDropFiles).toHaveBeenCalledWith(['C:\\Imports\\Scores.xlsx'])
  view.rerender(
    <SeasonFiles
      name="2025-26"
      listing={{ entries: [weeks], error: null, reload: vi.fn() }}
      readOnly
      onNavigate={vi.fn()}
      onBack={{ label: 'Back', action: vi.fn() }}
      onDropFiles={onDropFiles}
    />
  )
  fireEvent.drop(screen.getByRole('region', { name: '2025-26 files' }), { dataTransfer: { files } })
  expect(onDropFiles).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Read-only')).toBeInTheDocument()
})

it('opens Windows paths verbatim using Enter', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  const path = 'C:\\Leagues\\Monday\\2025-26\\Rules.pdf'
  renderFiles({
    listing: { entries: [makeDirEntry({ name: 'Rules.pdf', path })], error: null, reload: vi.fn() }
  })
  await user.click(row('Rules.pdf'))
  await user.keyboard('{Enter}')
  await waitFor(() => expect(api.openFile).toHaveBeenCalledWith(path))
})
