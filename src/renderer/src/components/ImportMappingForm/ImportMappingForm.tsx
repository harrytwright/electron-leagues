import { Select, Table, Text } from '@cloudflare/kumo'
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ImportField,
  type ImportMapping,
  type MappingPreview
} from '@shared/imports'

const NOT_IN_FILE = ''

export interface ImportMappingFormProps {
  preview: MappingPreview
  mapping: ImportMapping
  onChange: (mapping: ImportMapping) => void
  /** Fields the import reads; the rest are left out of the form. */
  fields?: readonly ImportField[]
}

/** Which column feeds each field, checked against the first rows of the file. */
export function ImportMappingForm({
  preview,
  mapping,
  onChange,
  fields = IMPORT_FIELDS
}: ImportMappingFormProps): React.JSX.Element {
  const columnItems = {
    [NOT_IN_FILE]: 'Not in this file',
    ...Object.fromEntries(
      preview.columns.map((column, index) => [String(index), column || `Column ${index + 1}`])
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {fields.map((field) => (
          <Select
            key={field}
            label={IMPORT_FIELD_LABELS[field]}
            value={mapping[field] === null ? NOT_IN_FILE : String(mapping[field])}
            items={columnItems}
            onValueChange={(value) =>
              onChange({ ...mapping, [field]: value ? Number(value) : null })
            }
          />
        ))}
      </div>
      <div className="grid gap-1.5">
        <Text variant="secondary" size="sm">
          First {preview.sample.length} of {preview.rowCount} rows in {preview.fileName}
        </Text>
        <div className="max-h-48 overflow-auto rounded-md border border-kumo-line">
          <Table aria-label="Sample rows" className="text-sm">
            <Table.Header>
              <Table.Row>
                {preview.columns.map((column, index) => (
                  <Table.Head key={index} className="whitespace-nowrap">
                    {column || `Column ${index + 1}`}
                  </Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {preview.sample.map((row, rowIndex) => (
                <Table.Row key={rowIndex}>
                  {preview.columns.map((_, index) => (
                    <Table.Cell key={index} className="whitespace-nowrap">
                      {row[index] ?? ''}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </div>
    </div>
  )
}
