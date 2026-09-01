import { useRef, useState } from 'react'
import { cn, DropdownMenu, Empty, Table } from '@cloudflare/kumo'
import { DotsThreeIcon, FileIcon, FolderIcon, FolderOpenIcon } from '@phosphor-icons/react'
import { formatModified } from '../lib/format-date'
import { revealLabel } from '../lib/reveal-label'
import IconButton from './IconButton'
import { PANEL_CLASS } from './panel'

export interface RowMenuItem {
  label: string
  variant?: 'default' | 'danger'
  disabled?: boolean
  onSelect: () => void
}

export interface DirectoryRow {
  key: string
  name: string
  kind: 'file' | 'folder'
  path: string
  /** Epoch ms; omitted for synthetic rows, which show "—". */
  mtime?: number
  badge?: React.ReactNode
  /** Shown after the built-in Open / reveal actions. */
  menuItems?: RowMenuItem[]
}

interface Props {
  rows: DirectoryRow[]
  /** Folder rows navigate here; without it they reveal in the file manager. */
  onNavigate?: (row: DirectoryRow) => void
  /** Enables the drop target; receives absolute paths of the dropped files. */
  onDropFiles?: (paths: string[]) => void | Promise<void>
  emptyTitle?: string
  emptyDescription?: string
  'aria-label': string
}

function RowMenu({ row }: { row: DirectoryRow }): React.JSX.Element {
  const extra = row.menuItems ?? []
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <IconButton
            variant="ghost"
            size="sm"
            icon={<DotsThreeIcon aria-hidden weight="bold" />}
            aria-label={`Actions for ${row.name}`}
          />
        }
      />
      <DropdownMenu.Content>
        {row.kind === 'file' ? (
          <DropdownMenu.Item onClick={() => void window.api.openFile(row.path)}>
            Open
          </DropdownMenu.Item>
        ) : null}
        <DropdownMenu.Item onClick={() => void window.api.revealFile(row.path)}>
          {revealLabel()}
        </DropdownMenu.Item>
        {extra.length > 0 ? <DropdownMenu.Separator /> : null}
        {extra.map((item, index) => (
          <DropdownMenu.Item
            key={`${index}-${item.label}`}
            variant={item.variant}
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            {item.label}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}

function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function DirectoryTable({
  rows,
  onNavigate,
  onDropFiles,
  emptyTitle,
  emptyDescription,
  'aria-label': label
}: Props): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  // dragenter/dragleave fire for every child crossed; only depth 0 truly leaves.
  const dragDepth = useRef(0)
  const droppable = onDropFiles !== undefined
  // Synthetic listings (a league's seasons) carry no dates; don't show a column of dashes.
  const showModified = rows.some((row) => row.mtime !== undefined)

  const activate = (row: DirectoryRow): void => {
    if (row.kind === 'file') {
      void window.api.openFile(row.path)
    } else if (onNavigate) {
      onNavigate(row)
    } else {
      void window.api.revealFile(row.path)
    }
  }

  const onDrop = (event: React.DragEvent): void => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!onDropFiles) return
    void onDropFiles(Array.from(event.dataTransfer.files).map((f) => window.api.pathForFile(f)))
  }

  return (
    <div
      // Kumo's Empty brings its own border and radius, so only the table gets
      // the panel chrome.
      className={cn(
        rows.length > 0 ? `overflow-hidden ${PANEL_CLASS}` : 'rounded-xl',
        'data-[dragging]:bg-kumo-tint data-[dragging]:outline-2 data-[dragging]:outline-kumo-focus data-[dragging]:outline-dashed'
      )}
      data-dragging={dragging || undefined}
      onDragEnter={(e) => {
        if (!droppable || !carriesFiles(e)) return
        e.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (droppable && carriesFiles(e)) e.preventDefault()
      }}
      onDragLeave={() => {
        if (!droppable) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      {rows.length === 0 ? (
        <Empty
          size="sm"
          icon={<FolderOpenIcon size={32} className="text-kumo-inactive" />}
          title={emptyTitle ?? 'No documents yet'}
          description={emptyDescription}
        />
      ) : (
        <Table aria-label={label}>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              {showModified ? <Table.Head className="w-36">Modified</Table.Head> : null}
              <Table.Head className="w-12">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.key}>
                <Table.Cell>
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-2 rounded-sm text-left hover:text-kumo-interact focus-visible:outline-2 focus-visible:outline-kumo-focus"
                      onClick={() => activate(row)}
                    >
                      <span aria-hidden="true" className="flex h-lh shrink-0 items-center">
                        {row.kind === 'folder' ? <FolderIcon size={16} /> : <FileIcon size={16} />}
                      </span>
                      <span className="truncate">{row.name}</span>
                    </button>
                    {row.badge}
                  </div>
                </Table.Cell>
                {showModified ? (
                  <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                    {row.mtime === undefined ? '—' : formatModified(row.mtime)}
                  </Table.Cell>
                ) : null}
                <Table.Cell className="text-right">
                  <RowMenu row={row} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </div>
  )
}

export default DirectoryTable
