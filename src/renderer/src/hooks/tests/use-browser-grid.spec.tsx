import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useBrowserGrid } from '../use-browser-grid'

const paths = ['/root/a.pdf', '/root/b.pdf']

function Grid({
  consumeFocusRequest
}: {
  consumeFocusRequest?: (dir: string) => boolean
}): React.JSX.Element {
  const grid = useBrowserGrid({ currentDir: '/root', paths, loaded: true, consumeFocusRequest })
  const { selection, filterRef, rowMenu } = grid
  return (
    <>
      <input ref={filterRef} aria-label="Filter" />
      <table>
        <tbody>
          {paths.map((path) => (
            <tr key={path} {...selection.rowProps(path)}>
              <td>
                {path}
                <button onClick={(event) => grid.openActionsMenu(event, path)}>Actions</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={grid.restoreFocus}>Restore</button>
      <output>{rowMenu.target ?? 'closed'}</output>
    </>
  )
}

it('focuses the first row once for a consumed focus request', () => {
  const consumeFocusRequest = vi.fn((dir: string) => dir === '/root')
  render(<Grid consumeFocusRequest={consumeFocusRequest} />)
  expect(screen.getByRole('row', { name: /a\.pdf/ })).toHaveFocus()
  expect(consumeFocusRequest).toHaveBeenCalledWith('/root')
})

it('restores focus to the menu target, then the first row, then the filter', () => {
  render(<Grid />)
  const second = screen.getByRole('row', { name: /b\.pdf/ })
  act(() => screen.getAllByRole('button', { name: 'Actions' })[1].click())
  expect(screen.getByRole('status')).toHaveTextContent('/root/b.pdf')
  act(() => screen.getByRole('button', { name: 'Restore' }).click())
  expect(second).toHaveFocus()
})
