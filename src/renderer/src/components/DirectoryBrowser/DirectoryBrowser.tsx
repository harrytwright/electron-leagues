import { BrowserError } from '../FileBrowser/components/BrowserError'
import { BrowserLoading } from '../FileBrowser/components/BrowserLoading'
import { BrowserEmpty } from '../FileBrowser/components/BrowserEmpty'
import { BrowserNoMatches } from '../FileBrowser/components/BrowserNoMatches'
import { BrowserMessageRow } from '../FileBrowser/components/BrowserMessageRow'
import { FileActionsMenu } from '../FileBrowser/components/FileActionsMenu'
import { FileModified } from '../FileBrowser/components/FileModified'
import { useFileActions } from '@renderer/hooks/use-file-actions'
import { useFileSelection } from '@renderer/hooks/use-file-selection'
import { useId, useState } from 'react'
import { DropdownMenu, Table } from '@cloudflare/kumo'
import { FileBrowserFrame } from '../FileBrowser/components/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/components/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import type { BrowserRow, Props } from './interface'

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
  const selection = useFileSelection(visible.map((row) => row.path))
  const selectedRow = visible.find((row) => row.path === selection.selected)
  const loading = listing?.entries === null
  const error = listing?.error

  const open = async (row: BrowserRow): Promise<void> => {
    if (row.kind === 'folder') onNavigate(row)
    else await openFile(row.path)
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
                onKeyDown={(event) => selection.onKeyDown(event, index, () => void open(row))}
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
                <FileActionsMenu
                  name={row.name}
                  onOpen={() => void open(row)}
                  onReveal={() => void revealFile(row.path)}
                >
                  {row.menuItems?.length ? <DropdownMenu.Separator /> : null}
                  {row.menuItems?.map((item) => (
                    <DropdownMenu.Item
                      key={item.label}
                      variant={item.variant}
                      disabled={item.disabled}
                      onClick={item.onSelect}
                    >
                      {item.label}
                    </DropdownMenu.Item>
                  ))}
                </FileActionsMenu>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
    </FileBrowserFrame>
  )
}
