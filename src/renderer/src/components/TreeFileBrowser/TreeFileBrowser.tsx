import { BrowserState } from '../FileBrowser/components/BrowserState'
import { FileActionsMenu } from '../FileBrowser/components/FileActionsMenu'
import { FileActionsButton } from '../FileBrowser/components/FileActionsButton'
import { FileModified } from '../FileBrowser/components/FileModified'
import { useBrowserGrid } from '@renderer/hooks/use-browser-grid'
import { useFileActions } from '@renderer/hooks/use-file-actions'
import { useKeyedState } from '@renderer/hooks/use-keyed-state'
import { Fragment } from 'react'
import { Button, cn, Loader, Table } from '@cloudflare/kumo'
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { IconButton } from '../IconButton'
import { FileBrowserFrame } from '../FileBrowser/components/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/components/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import { fileRows } from './file-tree'
import type { FileRow, Props, RowDecoration, SortColumn } from './interface'
import { plural } from '@renderer/lib/plural'
import { revealLabel } from '@renderer/lib/os-labels'
import type { RowMenuItem } from '../FileBrowser/row'

export function TreeFileBrowser({
  currentDir,
  name,
  listing,
  tree,
  sort,
  onSortChange,
  readOnly,
  onNavigate,
  consumeFocusRequest,
  onDropFiles,
  onBack,
  pendingEntries = [],
  decorate
}: Props): React.JSX.Element {
  const [query, setQuery] = useKeyedState(currentDir, '')
  const { openFile, revealFile } = useFileActions()
  const filter = query.trim().toLocaleLowerCase()
  const entries = listing.entries
    ? [
        ...listing.entries,
        ...pendingEntries.filter((pending) =>
          listing.entries?.every((entry) => entry.name !== pending.name)
        )
      ]
    : null
  const rows = fileRows(entries ?? [], tree.branches, tree.expanded, sort, filter)
  // A pending row stands for output that does not exist yet, so it has no date and nothing to reveal.
  const pendingNames = new Set(pendingEntries.map((entry) => entry.name))
  const isPending = (row: FileRow): boolean =>
    row.ancestors.length === 0 && pendingNames.has(row.entry.name)
  const decorationOf = (row: FileRow): RowDecoration | undefined =>
    row.ancestors.length === 0 ? decorate?.(row.entry) : undefined
  const grid = useBrowserGrid({
    currentDir,
    paths: rows.map((row) => row.entry.path),
    loaded: listing.entries !== null,
    consumeFocusRequest
  })
  const { selection, rowMenu } = grid
  const selectedRow = rows.find((row) => row.entry.path === selection.selected)
  const folderCount = entries?.filter((entry) => entry.kind === 'folder').length ?? 0
  const fileCount = (entries?.length ?? 0) - folderCount

  const focus = (row: FileRow | undefined): void => {
    if (row) selection.focus(row.entry.path)
  }

  const open = async (row: FileRow, focusFirstRow = false): Promise<void> => {
    if (row.entry.kind === 'folder') {
      onNavigate([...row.ancestors, row.entry], focusFirstRow)
      return
    }
    const decoration = decorationOf(row)
    if (decoration?.open) await decoration.open()
    else await openFile(row.entry.path)
  }

  const actions = (row: FileRow | undefined): RowMenuItem[] =>
    row
      ? [
          // Menu navigation cannot restore its old row, so the destination owns the focus hand-off.
          { label: 'Open', onSelect: () => void open(row, true) },
          ...(isPending(row)
            ? []
            : [{ label: revealLabel(), onSelect: () => void revealFile(row.entry.path) }])
        ]
      : []

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    row: FileRow,
    index: number
  ): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      grid.openContextMenu(event, row.entry.path)
      return
    }
    switch (event.key) {
      case 'ArrowRight':
        if (row.entry.kind === 'folder' && !filter) {
          if (!row.expanded) tree.toggle(row.entry.path)
          else if (rows[index + 1]?.ancestors.at(-1)?.path === row.entry.path)
            focus(rows[index + 1])
        }
        break
      case 'ArrowLeft':
        if (row.entry.kind === 'folder' && row.expanded && !filter) tree.toggle(row.entry.path)
        else {
          const parent = row.ancestors.at(-1)
          if (parent) selection.focus(parent.path)
        }
        break
      default:
        selection.onKeyDown(event, index, () => void open(row, true))
        return
    }
    event.preventDefault()
  }

  const sortBy = (column: SortColumn): void => {
    onSortChange({
      column,
      direction:
        sort.column === column && sort.direction === 'ascending' ? 'descending' : 'ascending'
    })
  }

  const refresh = (): void => {
    listing.reload()
    tree.reload()
  }

  return (
    <FileBrowserFrame
      name={name}
      heading="Files"
      readOnly={readOnly}
      query={query}
      filterLabel="Filter loaded files"
      filterRef={grid.filterRef}
      onQueryChange={setQuery}
      onRefresh={refresh}
      onDropFiles={onDropFiles}
      selection={selectedRow?.entry.name}
      summary={
        entries
          ? filter
            ? `${plural(rows.length, 'item')} shown · Loaded folders only`
            : `${plural(folderCount, 'folder')}, ${plural(fileCount, 'file')}`
          : '—'
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-base"
          disabled={tree.expanded.size === 0 || Boolean(filter)}
          onClick={tree.collapse}
        >
          Collapse all
        </Button>
      }
    >
      <p id={grid.instructions} className="sr-only">
        Use the up and down arrow keys to select files, right and left to expand or collapse
        folders, and Enter to open. Double-click a row to open it. Filtering searches only folders
        already loaded.
      </p>
      <Table
        role="treegrid"
        aria-label={name}
        aria-describedby={grid.instructions}
        layout="fixed"
        className={FILE_TABLE_CLASS}
      >
        <Table.Header sticky>
          <Table.Row>
            {(['name', 'mtime', 'type'] as const).map((column) => (
              <Table.Head
                key={column}
                aria-sort={sort.column === column ? sort.direction : 'none'}
                className={column === 'name' ? 'w-auto' : column === 'mtime' ? 'w-36' : 'w-40'}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-sm text-left text-kumo-subtle hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-kumo-focus"
                  onClick={() => sortBy(column)}
                >
                  {column === 'name' ? 'Name' : column === 'mtime' ? 'Modified' : 'Kind'}
                  {sort.column === column ? (
                    sort.direction === 'ascending' ? (
                      <ArrowUpIcon aria-hidden size={12} />
                    ) : (
                      <ArrowDownIcon aria-hidden size={12} />
                    )
                  ) : null}
                </button>
              </Table.Head>
            ))}
            <Table.Head className="w-12">
              <span className="sr-only">Actions</span>
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {listing.error || listing.entries === null || rows.length === 0 ? (
            <BrowserState
              level={1}
              error={listing.error}
              loading={listing.entries === null}
              filter={filter}
              onRetry={refresh}
              onBack={onBack}
              onClearFilter={() => setQuery('')}
              noMatches={{
                title: 'No matching files',
                description:
                  'Only loaded folders are included. Try a different name or clear the filter.'
              }}
              empty={{
                title: 'This folder is empty',
                description: readOnly
                  ? undefined
                  : 'Drop files here or use Add files to import them.'
              }}
            />
          ) : (
            rows.map((row, index) => {
              const { entry, ancestors, expanded } = row
              const nameId = `${grid.rowNames}-${index}-name`
              const decoration = decorationOf(row)
              const badgeId = decoration?.badge ? `${grid.rowNames}-${index}-badge` : undefined
              const branch = tree.branches.get(entry.path)
              const branchMessage =
                expanded &&
                entry.kind === 'folder' &&
                (!branch?.entries || branch.entries.length === 0)
              return (
                <Fragment key={entry.path}>
                  <Table.Row
                    {...selection.rowProps(entry.path)}
                    aria-level={ancestors.length + 1}
                    aria-labelledby={[nameId, badgeId].filter(Boolean).join(' ')}
                    aria-posinset={row.position}
                    aria-setsize={row.siblings}
                    aria-expanded={entry.kind === 'folder' ? expanded : undefined}
                    className={FILE_ROW_CLASS}
                    onDoubleClick={() => void open(row)}
                    onContextMenu={(event) => grid.openContextMenu(event, row.entry.path)}
                    onKeyDown={(event) => onKeyDown(event, row, index)}
                  >
                    <Table.Cell className="relative">
                      {ancestors.map((ancestor, depth) => (
                        <span
                          key={ancestor.path}
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 border-l border-kumo-line"
                          style={{ left: 24 + depth * 24 }}
                        />
                      ))}
                      <div
                        className="flex min-w-0 items-center gap-2"
                        style={{ paddingLeft: ancestors.length * 24 }}
                      >
                        {entry.kind === 'folder' ? (
                          <IconButton
                            tabIndex={-1}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
                            variant="ghost"
                            size="xs"
                            className="size-6 shrink-0"
                            disabled={Boolean(filter)}
                            icon={
                              expanded ? (
                                <CaretDownIcon aria-hidden size={12} />
                              ) : (
                                <CaretRightIcon aria-hidden size={12} />
                              )
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              tree.toggle(entry.path)
                              focus(row)
                            }}
                            onDoubleClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <span aria-hidden className="w-6 shrink-0" />
                        )}
                        <span className="shrink-0">
                          <FileEntryIcon entry={row.entry} expanded={row.expanded} />
                        </span>
                        <span
                          id={nameId}
                          title={entry.name}
                          className={cn('truncate', entry.kind === 'folder' && 'font-medium')}
                        >
                          {entry.name}
                        </span>
                        {decoration?.badge ? <span id={badgeId}>{decoration.badge}</span> : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                      {isPending(row) ? (
                        <FileModified mtime={undefined} />
                      ) : (
                        <FileModified
                          mtime={entry.mtime}
                          title={new Date(entry.mtime).toLocaleString('en-GB')}
                        />
                      )}
                    </Table.Cell>
                    <Table.Cell className="truncate text-kumo-subtle">{fileType(entry)}</Table.Cell>
                    <FileActionsButton
                      name={entry.name}
                      menuId={rowMenu.id}
                      expanded={rowMenu.target === entry.path}
                      onClick={(event) => grid.openActionsMenu(event, entry.path)}
                    />
                  </Table.Row>
                  {branchMessage ? (
                    <Table.Row aria-level={ancestors.length + 2} className="even:bg-transparent">
                      <Table.Cell colSpan={4}>
                        <div
                          role={branch?.error ? 'alert' : 'status'}
                          className="flex items-center gap-2 py-1 text-kumo-subtle"
                          style={{ paddingLeft: (ancestors.length + 1) * 24 + 32 }}
                        >
                          {branch?.error ? (
                            <>
                              <WarningCircleIcon aria-hidden size={16} />
                              <span>{branch.error}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void tree.load(entry.path)}
                              >
                                Try again
                              </Button>
                            </>
                          ) : branch?.entries ? (
                            'Empty folder'
                          ) : (
                            <>
                              <Loader />
                              Loading…
                            </>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ) : null}
                </Fragment>
              )
            })
          )}
        </Table.Body>
      </Table>
      <FileActionsMenu
        id={rowMenu.id}
        label={`Actions for ${rows.find((row) => row.entry.path === rowMenu.target)?.entry.name ?? 'file'}`}
        open={rowMenu.target !== null && rows.some((row) => row.entry.path === rowMenu.target)}
        anchor={rowMenu.anchor}
        actions={actions(rows.find((row) => row.entry.path === rowMenu.target))}
        focusScope={currentDir}
        onOpenChange={rowMenu.onOpenChange}
        onRestoreFocus={grid.restoreFocus}
      />
    </FileBrowserFrame>
  )
}
