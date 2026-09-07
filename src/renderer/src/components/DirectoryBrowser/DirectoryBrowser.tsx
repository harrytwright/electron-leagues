import { BrowserError } from '../FileBrowser/components/BrowserError'
import { BrowserLoading } from '../FileBrowser/components/BrowserLoading'
import { BrowserEmpty } from '../FileBrowser/components/BrowserEmpty'
import { BrowserNoMatches } from '../FileBrowser/components/BrowserNoMatches'
import { BrowserMessageRow } from '../FileBrowser/components/BrowserMessageRow'
import { FileActionsMenu } from '../FileBrowser/components/FileActionsMenu'
import { FileActionsButton } from '../FileBrowser/components/FileActionsButton'
import { FileModified } from '../FileBrowser/components/FileModified'
import { useFileActions } from '@renderer/hooks/use-file-actions'
import { useFileSelection } from '@renderer/hooks/use-file-selection'
import { useId, useState } from 'react'
import { Table } from '@cloudflare/kumo'
import { FileBrowserFrame } from '../FileBrowser/components/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/components/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import type { BrowserRow, Props } from './interface'
import type { RowMenuItem } from '../FileBrowser/row'
import { revealLabel } from '@renderer/lib/reveal-label'
import { useRowActionsMenu } from '@renderer/hooks/use-row-actions-menu'

/** Flat directory pane for the league overview and its archive, preserving scan order. */
export function DirectoryBrowser({
  name,
  heading,
  rows,
  metadataColumn,
  readOnly,
  listing,
  onRefresh,
  onNavigate,
  onDropFiles,
  onBack,
  emptyTitle,
  emptyDescription
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const instructions = useId()
  const { openFile, revealFile } = useFileActions()
  const filter = query.trim().toLocaleLowerCase()
  const visible = rows.filter((row) => row.name.toLocaleLowerCase().includes(filter))
  const rowMenu = useRowActionsMenu(visible.map((row) => row.path))
  const selection = useFileSelection(visible.map((row) => row.path))
  const selectedRow = visible.find((row) => row.path === selection.selected)
  const loading = listing?.entries === null
  const error = listing?.error

  const open = async (row: BrowserRow): Promise<void> => {
    if (row.kind === 'folder') onNavigate(row)
    else await openFile(row.path)
  }

  const actions = (row: BrowserRow | undefined): RowMenuItem[] =>
    row
      ? [
          { label: 'Open', onSelect: () => void open(row) },
          { label: revealLabel(), onSelect: () => void revealFile(row.path) },
          ...(row.menuItems ?? []).map((item, index) => ({
            ...item,
            separatorBefore: index === 0
          }))
        ]
      : []

  const openContextMenu = (
    event: React.MouseEvent<HTMLTableRowElement> | React.KeyboardEvent<HTMLTableRowElement>,
    row: BrowserRow
  ): void => {
    event.preventDefault()
    selection.focus(row.path)
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointer = 'clientX' in event && event.clientX > 0
    rowMenu.openAt(
      row.path,
      pointer
        ? { left: event.clientX, top: event.clientY }
        : { left: bounds.right - 24, top: bounds.top },
      event.currentTarget
    )
  }

  return (
    <FileBrowserFrame
      name={name}
      heading={heading}
      readOnly={readOnly}
      query={query}
      filterLabel="Filter this folder"
      onQueryChange={setQuery}
      onRefresh={onRefresh}
      onDropFiles={onDropFiles}
      selection={selectedRow?.name}
      summary={
        loading || error
          ? '—'
          : filter
            ? `${visible.length} of ${rows.length} items`
            : `${rows.length} item${rows.length === 1 ? '' : 's'}`
      }
    >
      <p id={instructions} className="sr-only">
        Use the up and down arrow keys to select an item, and Enter to open. Double-click a row to
        open it.
      </p>
      <Table
        role="grid"
        aria-label={name}
        aria-describedby={instructions}
        layout="fixed"
        className={FILE_TABLE_CLASS}
      >
        <Table.Header sticky>
          <Table.Row className="text-kumo-subtle">
            <Table.Head>Name</Table.Head>
            <Table.Head className={metadataColumn === 'contents' ? 'w-28' : 'w-36'}>
              {metadataColumn === 'contents' ? 'Contents' : 'Modified'}
            </Table.Head>
            <Table.Head className={metadataColumn === 'contents' ? 'w-32' : 'w-40'}>
              Kind
            </Table.Head>
            <Table.Head className="w-12">
              <span className="sr-only">Actions</span>
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {error || loading || visible.length === 0 ? (
            <BrowserMessageRow>
              {error ? (
                <BrowserError message={error} onRetry={onRefresh} onBack={onBack} />
              ) : loading ? (
                <BrowserLoading />
              ) : filter ? (
                <BrowserNoMatches
                  title="No matching items"
                  description="Try a different name or clear the filter."
                  onClear={() => setQuery('')}
                />
              ) : (
                <BrowserEmpty title={emptyTitle} description={emptyDescription} />
              )}
            </BrowserMessageRow>
          ) : (
            visible.map((row, index) => (
              <Table.Row
                key={row.key}
                {...selection.rowProps(row.path)}
                aria-label={row.name}
                className={FILE_ROW_CLASS}
                onDoubleClick={() => void open(row)}
                onContextMenu={(event) => openContextMenu(event, row)}
                onKeyDown={(event) => {
                  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                    openContextMenu(event, row)
                    return
                  }
                  selection.onKeyDown(event, index, () => void open(row))
                }}
              >
                <Table.Cell>
                  <div className="flex min-w-0 items-center gap-2 pl-8">
                    <span className="shrink-0">
                      <FileEntryIcon entry={row} />
                    </span>
                    <span title={row.name} className="truncate font-medium">
                      {row.name}
                    </span>
                    {row.badge}
                  </div>
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                  {metadataColumn === 'contents' ? (
                    (row.contents ?? '—')
                  ) : (
                    <FileModified mtime={row.mtime} />
                  )}
                </Table.Cell>
                <Table.Cell className="truncate text-kumo-subtle">
                  {row.typeLabel ?? fileType(row)}
                </Table.Cell>
                <FileActionsButton
                  name={row.name}
                  menuId={rowMenu.id}
                  expanded={rowMenu.target === row.path}
                  onClick={(event) => {
                    selection.focus(row.path)
                    const bounds = event.currentTarget.getBoundingClientRect()
                    rowMenu.openAt(
                      row.path,
                      { left: bounds.right, top: bounds.bottom },
                      event.currentTarget
                    )
                  }}
                />
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      <FileActionsMenu
        id={rowMenu.id}
        label={`Actions for ${visible.find((row) => row.path === rowMenu.target)?.name ?? 'file'}`}
        open={rowMenu.target !== null && visible.some((row) => row.path === rowMenu.target)}
        anchor={rowMenu.anchor}
        actions={actions(visible.find((row) => row.path === rowMenu.target))}
        onOpenChange={rowMenu.onOpenChange}
      />
    </FileBrowserFrame>
  )
}
