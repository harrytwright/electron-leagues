import { useState } from 'react'
import { Button, Dialog, Radio, Table, Text, useKumoToastManager } from '@cloudflare/kumo'
import {
  mappingProblem,
  type ImportMapping,
  type SyncAction,
  type SyncCandidate,
  type SyncDecision,
  type SyncLogEntry,
  type SyncMatch,
  type SyncPlan,
  type SyncPlanRow,
  type SyncRef,
  type SyncSummary
} from '@shared/imports'
import { formatMemberNumber, memberDisplayName, type MembersSnapshot } from '@shared/members'
import { useImportPreview } from '@renderer/hooks/use-import-preview'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { plural } from '@renderer/lib/plural'
import { ImportMappingForm } from '../ImportMappingForm'
import { TaskDialog } from '../TaskDialog'

export interface MbdSyncDialogProps {
  snapshot: MembersSnapshot
  /** The export to sync from; null keeps the dialog closed. */
  path: string | null
  onOpenChange: (open: boolean) => void
}

const SYNC_FIELDS = ['mbdId', 'firstName', 'lastName', 'fullName', 'gender'] as const

const CREATE = 'create'
const KEEP_MEMBER = 'member'
const USE_EXPORT = 'export'

/** One radio value per line that needs a decision. */
type Choices = ReadonlyMap<number, string>
/** Lines the desk has left out of the sync. */
type Skips = ReadonlySet<number>

interface Review {
  plan: SyncPlan
  revision: string
  sourceRevision: string
  mapping: ImportMapping
  choices: Choices
  skips: Skips
}

type Step =
  | { kind: 'mapping'; error: string | null }
  | { kind: 'planning' }
  | ({ kind: 'review' } & Review)
  | { kind: 'done'; summary: SyncSummary; refreshError: string | null }

interface SyncVariables {
  mapping: ImportMapping
  decisions: SyncDecision[]
  revision: string
  sourceRevision: string
}

function refValue(ref: SyncRef): string {
  return ref.kind === 'member' ? `member:${ref.memberId}` : `row:${ref.line}`
}

function refFromValue(value: string): SyncRef | null {
  const [kind, number] = value.split(':')
  if (kind === 'member') return { kind: 'member', memberId: Number(number) }
  if (kind === 'row') return { kind: 'row', line: Number(number) }
  return null
}

function rowName(row: SyncPlanRow['row']): string {
  return `${row.firstName} ${row.lastName}`.trim()
}

function needsDecision(match: SyncMatch): boolean {
  return match.kind === 'similar' || (match.kind === 'known' && match.newSpelling)
}

function allowedChoices(match: SyncMatch): string[] {
  if (match.kind === 'similar') {
    return [...match.candidates.map((candidate) => refValue(candidate.ref)), CREATE]
  }
  return [KEEP_MEMBER, USE_EXPORT]
}

/**
 * One exact match is proposed as a merge and a looser one as a new member; two
 * exact matches are the duplicates the Members page exists to show, so the desk
 * chooses. Choices made before a Back survive where the row still offers them.
 */
function defaultChoices(plan: SyncPlan, previous: Choices): Choices {
  const choices = new Map<number, string>()
  for (const { row, match } of plan.rows) {
    if (!needsDecision(match)) continue
    const kept = previous.get(row.line)
    if (kept !== undefined && allowedChoices(match).includes(kept)) {
      choices.set(row.line, kept)
    } else if (match.kind === 'similar') {
      const exact = match.candidates.filter((candidate) => candidate.exact)
      if (exact.length === 1) choices.set(row.line, refValue(exact[0].ref))
      else if (exact.length === 0) choices.set(row.line, CREATE)
    } else {
      choices.set(row.line, KEEP_MEMBER)
    }
  }
  return choices
}

/** A bowler with no surname is usually a placeholder in the MBD, so they start left out. */
function defaultSkips(plan: SyncPlan, previous: Skips | null): Skips {
  if (previous)
    return new Set(
      [...previous].filter((line) => plan.rows.some((entry) => entry.row.line === line))
    )
  return new Set(plan.rows.flatMap(({ row }) => (row.lastName ? [] : [row.line])))
}

function decisionsFrom(review: Review): SyncDecision[] {
  const decisions: SyncDecision[] = []
  for (const { row, match } of review.plan.rows) {
    if (review.skips.has(row.line)) {
      decisions.push({ kind: 'skip', line: row.line })
      continue
    }
    const choice = review.choices.get(row.line)
    if (choice === undefined) continue
    if (match.kind === 'similar') {
      if (choice === CREATE) decisions.push({ kind: 'create', line: row.line })
      else {
        const into = refFromValue(choice)
        if (into) decisions.push({ kind: 'merge', line: row.line, into })
      }
    } else if (match.kind === 'known' && match.newSpelling) {
      decisions.push({
        kind: 'spelling',
        line: row.line,
        keep: choice === USE_EXPORT ? 'export' : 'member'
      })
    }
  }
  return decisions
}

const ACTION_LABELS: Record<SyncAction, string> = {
  created: 'Created',
  matched: 'Matched',
  renamed: 'Renamed',
  merged: 'Merged',
  restored: 'Restored',
  skipped: 'Skipped',
  failed: 'Failed',
  unreadable: 'Unreadable'
}

function summaryLine(summary: SyncSummary): string {
  const parts = [
    `${summary.created} created`,
    `${summary.matched} matched`,
    `${summary.merged} merged`,
    `${summary.skipped} skipped`,
    ...(summary.restored > 0 ? [`${summary.restored} restored`] : []),
    ...(summary.failed.length > 0 ? [`${summary.failed.length} failed`] : [])
  ]
  return `${plural(summary.rows, 'row')}: ${parts.join(', ')}`
}

function logAsText(log: readonly SyncLogEntry[]): string {
  const lines = log.map((entry) =>
    [entry.line, entry.mbdId, entry.name, ACTION_LABELS[entry.action], entry.detail].join('\t')
  )
  return ['Line\tMBD ID\tName\tOutcome\tDetail', ...lines].join('\n')
}

function candidateLabel(candidate: SyncCandidate): string {
  return `Merge into ${candidate.name}${candidate.exact ? ' (same name)' : ''}`
}

export function MbdSyncDialog({
  snapshot,
  path,
  onOpenChange
}: MbdSyncDialogProps): React.JSX.Element {
  const preview = useImportPreview(path)
  const [step, setStep] = useState<Step>({ kind: 'mapping', error: null })
  const [openedFor, setOpenedFor] = useState(path)
  const { add } = useKumoToastManager()
  const sync = useWriteOperation({
    label: () => 'Syncing from the MBD',
    write: ({ mapping, decisions, revision, sourceRevision }: SyncVariables) =>
      window.api.syncMbd(path ?? '', mapping, decisions, revision, sourceRevision)
  })
  const [lastChoices, setLastChoices] = useState<Choices>(new Map())
  const [lastSkips, setLastSkips] = useState<Skips | null>(null)

  if (openedFor !== path) {
    setOpenedFor(path)
    setStep({ kind: 'mapping', error: null })
    setLastChoices(new Map())
    setLastSkips(null)
  }

  const memberName = (id: number): string => {
    const member = snapshot.members.find((candidate) => candidate.id === id)
    return member
      ? `${formatMemberNumber(member.id, snapshot.nextId)} ${memberDisplayName(member)}`
      : `member ${id}`
  }

  const plan = async (): Promise<void> => {
    if (preview.state.status !== 'ready' || path === null) return
    const { mapping } = preview.state
    const problem = mappingProblem(mapping)
    if (problem) {
      setStep({ kind: 'mapping', error: problem })
      return
    }
    setStep({ kind: 'planning' })
    try {
      const result = await window.api.planMbdSync(path, mapping)
      setStep({
        kind: 'review',
        plan: result.plan,
        revision: result.revision,
        sourceRevision: result.sourceRevision,
        mapping,
        choices: defaultChoices(result.plan, lastChoices),
        skips: defaultSkips(result.plan, lastSkips)
      })
    } catch (caught) {
      setStep({ kind: 'mapping', error: ipcErrorMessage(caught) })
    }
  }

  const backToMapping = (review: Review, error: string | null): void => {
    setLastChoices(review.choices)
    setLastSkips(review.skips)
    setStep({ kind: 'mapping', error })
  }

  const run = async (): Promise<void> => {
    if (step.kind !== 'review' || sync.pending) return
    try {
      const outcome = await sync.run({
        mapping: step.mapping,
        revision: step.revision,
        sourceRevision: step.sourceRevision,
        decisions: decisionsFrom(step)
      })
      setStep({
        kind: 'done',
        summary: outcome.result,
        refreshError: outcome.status === 'refresh-failed' ? outcome.refreshError : null
      })
    } catch (caught) {
      // A refused write means a file moved on; the plan has to be made again from the mapping.
      backToMapping(step, ipcErrorMessage(caught))
    }
  }

  const choose = (line: number, value: string): void => {
    if (step.kind !== 'review') return
    const choices = new Map(step.choices).set(line, value)
    setLastChoices(choices)
    setStep({ ...step, choices })
  }

  const setSkipped = (lines: readonly number[], skipped: boolean): void => {
    if (step.kind !== 'review') return
    const skips = new Set(step.skips)
    for (const line of lines) {
      if (skipped) skips.add(line)
      else skips.delete(line)
    }
    setLastSkips(skips)
    setStep({ ...step, skips })
  }

  const copyLog = async (log: readonly SyncLogEntry[]): Promise<void> => {
    try {
      await navigator.clipboard.writeText(logAsText(log))
      add({ title: 'Copied the sync log', variant: 'success' })
    } catch {
      add({ title: 'The log could not be copied', variant: 'error' })
    }
  }

  const busy = step.kind === 'planning' || sync.pending
  const undecided =
    step.kind === 'review'
      ? step.plan.rows.filter(
          ({ row, match }) =>
            !step.skips.has(row.line) && needsDecision(match) && !step.choices.has(row.line)
        ).length
      : 0
  const toSync = step.kind === 'review' ? step.plan.rows.length - step.skips.size : 0

  const description = (): string => {
    switch (step.kind) {
      case 'review':
        return 'Untick anyone to leave out. Rows the export and the members list disagree on need a decision.'
      case 'done':
        return 'What happened to each line of the export. Nothing was written back to the MBD.'
      default:
        return 'Choose which columns hold the MBD ID, the name and the gender. Nothing is written back to the MBD.'
    }
  }

  return (
    <TaskDialog open={path !== null} onOpenChange={(open) => !busy && onOpenChange(open)} size="lg">
      <TaskDialog.Header
        title={step.kind === 'done' ? 'Sync finished' : 'Sync from the Master Bowler Database'}
        description={description()}
      />
      <TaskDialog.Body
        onSubmit={(event) => {
          event.preventDefault()
          if (step.kind === 'done') onOpenChange(false)
          else void (step.kind === 'review' ? run() : plan())
        }}
      >
        {step.kind === 'done' ? (
          <SyncResult
            summary={step.summary}
            refreshError={step.refreshError}
            onCopy={() => void copyLog(step.summary.log)}
          />
        ) : preview.state.status === 'loading' ? (
          <Text variant="secondary">Reading the export…</Text>
        ) : preview.state.status === 'failed' ? (
          <Text variant="error" role="alert">
            {preview.state.error}
          </Text>
        ) : preview.state.status === 'ready' && step.kind !== 'review' ? (
          <>
            {preview.state.preview.remembered ? (
              <Text variant="secondary" size="sm">
                Using the mapping from the last export with these columns.
              </Text>
            ) : null}
            <ImportMappingForm
              preview={preview.state.preview}
              mapping={preview.state.mapping}
              onChange={preview.setMapping}
              fields={SYNC_FIELDS}
            />
            {step.kind === 'mapping' && step.error ? (
              <Text variant="error" role="alert">
                {step.error}
              </Text>
            ) : null}
          </>
        ) : step.kind === 'review' ? (
          <SyncReview review={step} memberName={memberName} onChoose={choose} onSkip={setSkipped} />
        ) : null}
        <TaskDialog.Actions>
          {step.kind === 'done' ? (
            <Button type="submit" variant="primary">
              Close
            </Button>
          ) : (
            <>
              <Dialog.Close
                render={(props) => (
                  <Button {...props} type="button" variant="secondary" disabled={busy}>
                    Cancel
                  </Button>
                )}
              />
              {step.kind === 'review' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => backToMapping(step, null)}
                >
                  Back
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                disabled={busy || preview.state.status !== 'ready' || undecided > 0}
                title={
                  undecided > 0 ? `${plural(undecided, 'row')} still need a decision` : undefined
                }
              >
                {step.kind === 'review'
                  ? sync.pending
                    ? 'Syncing…'
                    : `Sync ${plural(toSync, 'row')}`
                  : step.kind === 'planning'
                    ? 'Matching…'
                    : 'Continue'}
              </Button>
            </>
          )}
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}

interface SyncReviewProps {
  review: Review
  memberName: (id: number) => string
  onChoose: (line: number, value: string) => void
  onSkip: (lines: readonly number[], skipped: boolean) => void
}

function outcomeText(match: SyncMatch, memberName: (id: number) => string): string {
  switch (match.kind) {
    case 'new':
      return 'New member'
    case 'known':
      return `Already ${memberName(match.memberId)}`
    case 'similar':
      return 'Looks like someone on the list'
  }
}

function SyncReview({ review, memberName, onChoose, onSkip }: SyncReviewProps): React.JSX.Element {
  const { plan, choices, skips } = review
  const known = plan.rows.filter(({ match }) => match.kind === 'known')
  const fresh = plan.rows.filter(({ match }) => match.kind === 'new')
  const questions = plan.rows.filter(({ match }) => needsDecision(match))
  const counts = [
    `${known.length} already known`,
    `${fresh.length} new`,
    `${questions.length} to decide`,
    ...(plan.invalid.length > 0 ? [`${plan.invalid.length} unreadable`] : []),
    ...(skips.size > 0 ? [`${skips.size} left out`] : [])
  ]
  const allLines = plan.rows.map(({ row }) => row.line)
  const allOn = skips.size === 0
  const noneOn = plan.rows.length > 0 && skips.size === plan.rows.length

  return (
    <div className="grid gap-3">
      <Text>
        {plural(plan.rows.length + plan.invalid.length, 'row')}: {counts.join(', ')}
      </Text>
      <div className="max-h-[50vh] overflow-auto rounded-md border border-kumo-line">
        <Table aria-label="Rows to sync" className="text-sm">
          <Table.Header sticky>
            <Table.Row>
              <Table.CheckHead
                label="Sync every row"
                checked={allOn}
                indeterminate={!allOn && !noneOn}
                onCheckedChange={(checked) => onSkip(allLines, !checked)}
              />
              <Table.Head className="w-14">Line</Table.Head>
              <Table.Head>Name</Table.Head>
              <Table.Head className="w-24">MBD ID</Table.Head>
              <Table.Head>Outcome</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {plan.rows.map(({ row, match }) => {
              const skipped = skips.has(row.line)
              const name = rowName(row)
              return (
                <Table.Row key={row.line} className={skipped ? 'text-kumo-subtle' : undefined}>
                  <Table.CheckCell
                    label={`Sync ${name || `line ${row.line}`}`}
                    checked={!skipped}
                    onCheckedChange={(checked) => onSkip([row.line], !checked)}
                  />
                  <Table.Cell className="font-mono">{row.line}</Table.Cell>
                  <Table.Cell>
                    {name}
                    {row.lastName ? null : (
                      <span className="ml-1 text-xs text-kumo-subtle">(no surname)</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="font-mono">{row.mbdId}</Table.Cell>
                  <Table.Cell>
                    {skipped ? (
                      'Left out'
                    ) : match.kind === 'similar' ? (
                      <Radio.Group
                        value={choices.get(row.line) ?? ''}
                        onValueChange={(value) => onChoose(row.line, value)}
                      >
                        <Radio.Legend className="sr-only">{`Decision for ${name}`}</Radio.Legend>
                        {match.candidates.map((candidate) => (
                          <Radio.Item
                            key={refValue(candidate.ref)}
                            value={refValue(candidate.ref)}
                            label={
                              candidate.ref.kind === 'member'
                                ? candidateLabel({
                                    ...candidate,
                                    name: memberName(candidate.ref.memberId)
                                  })
                                : `${candidateLabel(candidate)} from line ${candidate.ref.line}`
                            }
                          />
                        ))}
                        <Radio.Item value={CREATE} label="Create a new member" />
                      </Radio.Group>
                    ) : match.kind === 'known' && match.newSpelling ? (
                      <Radio.Group
                        value={choices.get(row.line) ?? KEEP_MEMBER}
                        onValueChange={(value) => onChoose(row.line, value)}
                      >
                        <Radio.Legend className="sr-only">{`Spelling for ${name}`}</Radio.Legend>
                        <Radio.Item
                          value={KEEP_MEMBER}
                          label={`Keep ${memberName(match.memberId)}`}
                        />
                        <Radio.Item value={USE_EXPORT} label={`Rename to ${name}`} />
                      </Radio.Group>
                    ) : (
                      outcomeText(match, memberName)
                    )}
                  </Table.Cell>
                </Table.Row>
              )
            })}
            {plan.invalid.map((problem) => (
              <Table.Row key={`invalid-${problem.line}`} className="text-kumo-subtle">
                <Table.CheckCell
                  label={`Line ${problem.line} cannot be synced`}
                  checked={false}
                  disabled
                />
                <Table.Cell className="font-mono">{problem.line}</Table.Cell>
                <Table.Cell colSpan={3}>Unreadable: {problem.message}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </div>
  )
}

interface SyncResultProps {
  summary: SyncSummary
  refreshError: string | null
  onCopy: () => void
}

function SyncResult({ summary, refreshError, onCopy }: SyncResultProps): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Text>{summaryLine(summary)}</Text>
        <Button type="button" size="sm" variant="secondary" onClick={onCopy}>
          Copy log
        </Button>
      </div>
      {refreshError ? (
        <Text variant="error" role="alert">
          The list could not be refreshed: {refreshError}
        </Text>
      ) : null}
      <div className="max-h-[50vh] overflow-auto rounded-md border border-kumo-line">
        <Table aria-label="Sync log" className="text-sm">
          <Table.Header sticky>
            <Table.Row>
              <Table.Head className="w-14">Line</Table.Head>
              <Table.Head>Name</Table.Head>
              <Table.Head className="w-24">MBD ID</Table.Head>
              <Table.Head className="w-28">Outcome</Table.Head>
              <Table.Head>Detail</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {summary.log.map((entry) => (
              <Table.Row
                key={entry.line}
                className={
                  entry.action === 'failed' || entry.action === 'unreadable'
                    ? 'text-kumo-danger'
                    : entry.action === 'skipped'
                      ? 'text-kumo-subtle'
                      : undefined
                }
              >
                <Table.Cell className="font-mono">{entry.line}</Table.Cell>
                <Table.Cell>{entry.name}</Table.Cell>
                <Table.Cell className="font-mono">{entry.mbdId}</Table.Cell>
                <Table.Cell>{ACTION_LABELS[entry.action]}</Table.Cell>
                <Table.Cell>{entry.detail}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </div>
  )
}
