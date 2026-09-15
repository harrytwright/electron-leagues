import { act } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../../tests/render-helpers'
import { FileActionsMenu } from './FileActionsMenu'

function menu(focusScope: string, open: boolean, onRestoreFocus: () => void): React.JSX.Element {
  return (
    <FileActionsMenu
      id="file-actions"
      label="Actions for Rules.docx"
      open={open}
      anchor={{ left: 0, top: 0 }}
      actions={[]}
      focusScope={focusScope}
      onOpenChange={vi.fn()}
      onRestoreFocus={onRestoreFocus}
    />
  )
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

it('does not restore focus after the browser scope changes', async () => {
  const onRestoreFocus = vi.fn()
  const view = renderWithProviders(menu('a', true, onRestoreFocus))

  view.rerender(menu('b', false, onRestoreFocus))
  await flushMicrotasks()

  expect(onRestoreFocus).not.toHaveBeenCalled()
})

it('restores focus after closing within the same browser scope', async () => {
  const onRestoreFocus = vi.fn()
  const view = renderWithProviders(menu('a', true, onRestoreFocus))

  view.rerender(menu('a', false, onRestoreFocus))
  await flushMicrotasks()

  expect(onRestoreFocus).toHaveBeenCalledOnce()
})
