import { BrowserState } from '../FileBrowser/components/BrowserState'
import { FileActionsMenu } from '../FileBrowser/components/FileActionsMenu'
import { FileActionsButton } from '../FileBrowser/components/FileActionsButton'
import { FileModified } from '../FileBrowser/components/FileModified'
import { useBrowserGrid } from '@renderer/hooks/use-browser-grid'
import { useFileActions } from '@renderer/hooks/use-file-actions'
import { useKeyedState } from '@renderer/hooks/use-keyed-state'
import { Table } from '@cloudflare/kumo'
import { FileBrowserFrame } from '../FileBrowser/components/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/components/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import type { BrowserRow, Props } from './interface'
import type { RowMenuItem } from '../FileBrowser/row'
import { plural } from '@renderer/lib/plural'
import { revealLabel } from '@renderer/lib/os-labels'

/** Flat directory pane for the league overview and its archive, preserving scan order. */
export function DirectoryBrowser({
  currentDir,
  name,
  heading,
  rows,
  metadataColumn,
  readOnly,
  listing,
  onRefresh,
  onNavigate,
  consumeFocusRequest,
  onDropFiles,
  onBack,
  emptyTitle,
  emptyDescription
}: Props): React.JSX.Element {
  const [query, setQuery] = useKeyedState(currentDir, '')
  const { openFile, revealFile } = useFileActions()
  const filter = query.trim().toLocaleLowerCase()
  const visible = rows.filter((row) => row.name.toLocaleLowerCase().includes(filter))
  const grid = useBrowserGrid({
    currentDir,
    paths: visible.map((row) => row.path),
    loaded: listing?.entries !== null,
    consumeFocusRequest
  })
  const { selection, rowMenu } = grid
  const selectedRow = visible.find((row) => row.path === selection.selected)
  const loading = listing?.entries === null
  const error = listing?.error

  const open = async (row: BrowserRow, focusFirstRow = false): Promise<void> => {
    if (row.kind === 'folder') onNavigate(row, focusFirstRow)
    else await openFile(row.path)
  }

  const actions = (row: BrowserRow | undefined): RowMenuItem[] =>
    row
      ? [
          // Menu navigation cannot restore its old row, so the destination owns the focus hand-off.
          { label: 'Open', onSelect: () => void open(row, true) },
          { label: revealLabel(), onSelect: () => void revealFile(row.path) },
          ...(row.menuItems ?? []).map((item, index) => ({
            ...item,
            separatorBefore: index === 0
          }))
        ]
      : []

  return (
    <FileBrowserFrame
      name={name}
      heading={heading}
      readOnly={readOnly}
      query={query}
      filterLabel="Filter this folder"
      filterRef={grid.filterRef}
      onQueryChange={setQuery}
      onRefresh={onRefresh}
      onDropFiles={onDropFiles}
      selection={selectedRow?.name}
      summary={
        loading || error
          ? '—'
          : filter
            ? `${visible.length} of ${rows.length} items`
            : plural(rows.length, 'item')
      }
    >
      <p id={grid.instructions} className="sr-only">
        Use the up and down arrow keys to select an item, and Enter to open. Double-click a row to
        open it.
      </p>
      <Table
        role="grid"
        aria-label={name}
        aria-describedby={grid.instructions}
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
            <BrowserState
              error={error}
              loading={loading}
              filter={filter}
              onRetry={onRefresh}
              onBack={onBack}
              onClearFilter={() => setQuery('')}
              noMatches={{
                title: 'No matching items',
                description: 'Try a different name or clear the filter.'
              }}
              empty={{ title: emptyTitle, description: emptyDescription }}
            />
          ) : (
            visible.map((row, index) => {
              const nameId = `${grid.rowNames}-${index}-name`
              const badgeId = row.badge ? `${grid.rowNames}-${index}-badge` : undefined
              return (
                <Table.Row
                  key={row.key}
                  {...selection.rowProps(row.path)}
                  aria-labelledby={[nameId, badgeId].filter(Boolean).join(' ')}
                  className={FILE_ROW_CLASS}
                  onDoubleClick={() => void open(row)}
                  onContextMenu={(event) => grid.openContextMenu(event, row.path)}
                  onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                      grid.openContextMenu(event, row.path)
                      return
                    }
                    selection.onKeyDown(event, index, () => void open(row, true))
                  }}
                >
                  <Table.Cell>
                    <div className="flex min-w-0 items-center gap-2 pl-8">
                      <span className="shrink-0">
                        <FileEntryIcon entry={row} />
                      </span>
                      <span id={nameId} title={row.name} className="truncate font-medium">
                        {row.name}
                      </span>
                      {row.badge ? <span id={badgeId}>{row.badge}</span> : null}
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
                    onClick={(event) => grid.openActionsMenu(event, row.path)}
                  />
                </Table.Row>
              )
            })
          )}
        </Table.Body>
      </Table>
      <FileActionsMenu
        id={rowMenu.id}
        label={`Actions for ${visible.find((row) => row.path === rowMenu.target)?.name ?? 'file'}`}
        open={rowMenu.target !== null && visible.some((row) => row.path === rowMenu.target)}
        anchor={rowMenu.anchor}
        actions={actions(visible.find((row) => row.path === rowMenu.target))}
        focusScope={currentDir}
        onOpenChange={rowMenu.onOpenChange}
        onRestoreFocus={grid.restoreFocus}
      />
    </FileBrowserFrame>
  )
}
