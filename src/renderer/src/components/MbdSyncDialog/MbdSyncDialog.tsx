import { useState } from 'react'
import { Button, Dialog, Radio, Text, useKumoToastManager } from '@cloudflare/kumo'
import {
  mappingProblem,
  type ImportMapping,
  type SyncCandidate,
  type SyncDecision,
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

type Step =
  | { kind: 'mapping'; error: string | null }
  | { kind: 'planning' }
  | {
      kind: 'review'
      plan: SyncPlan
      revision: string
      sourceRevision: string
      mapping: ImportMapping
      choices: Choices
    }

/** One radio value per line that needs a decision. */
type Choices = ReadonlyMap<number, string>

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

function decisionsFrom(plan: SyncPlan, choices: Choices): SyncDecision[] {
  const decisions: SyncDecision[] = []
  for (const { row, match } of plan.rows) {
    const choice = choices.get(row.line)
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

function summarise(summary: SyncSummary): string {
  const parts = [
    `${summary.created} new`,
    `${summary.matched} already known`,
    ...(summary.merged > 0 ? [`${summary.merged} merged`] : []),
    ...(summary.restored > 0 ? [`${summary.restored} restored`] : []),
    ...(summary.skipped > 0 ? [`${summary.skipped} skipped`] : [])
  ]
  return `Synced ${plural(summary.rows, 'row')}: ${parts.join(', ')}`
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

  if (openedFor !== path) {
    setOpenedFor(path)
    setStep({ kind: 'mapping', error: null })
    setLastChoices(new Map())
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
        choices: defaultChoices(result.plan, lastChoices)
      })
    } catch (caught) {
      setStep({ kind: 'mapping', error: ipcErrorMessage(caught) })
    }
  }

  const run = async (): Promise<void> => {
    if (step.kind !== 'review' || sync.pending) return
    try {
      const outcome = await sync.run({
        mapping: step.mapping,
        revision: step.revision,
        sourceRevision: step.sourceRevision,
        decisions: decisionsFrom(step.plan, step.choices)
      })
      const summary = outcome.result
      const failed = summary.failed
        .map((problem) => `Line ${problem.line}: ${problem.message}`)
        .join('. ')
      add({
        title:
          outcome.status === 'refresh-failed'
            ? `${summarise(summary)}, but the list could not be refreshed: ${outcome.refreshError}`
            : summarise(summary),
        description: failed || undefined,
        variant: outcome.status === 'refresh-failed' ? 'error' : failed ? undefined : 'success'
      })
      onOpenChange(false)
    } catch (caught) {
      // A refused write means a file moved on; the plan has to be made again from the mapping.
      setLastChoices(step.choices)
      setStep({ kind: 'mapping', error: ipcErrorMessage(caught) })
    }
  }

  const choose = (line: number, value: string): void => {
    if (step.kind !== 'review') return
    const choices = new Map(step.choices).set(line, value)
    setLastChoices(choices)
    setStep({ ...step, choices })
  }

  const busy = step.kind === 'planning' || sync.pending
  const undecided =
    step.kind === 'review'
      ? step.plan.rows.filter(
          ({ row, match }) => needsDecision(match) && !step.choices.has(row.line)
        ).length
      : 0

  return (
    <TaskDialog open={path !== null} onOpenChange={(open) => !busy && onOpenChange(open)} size="lg">
      <TaskDialog.Header
        title="Sync from the Master Bowler Database"
        description={
          step.kind === 'review'
            ? 'Rows the export and the members list disagree on need a decision; everything else is applied as shown.'
            : 'Choose which columns hold the MBD ID, the name and the gender. Nothing is written back to the MBD.'
        }
      />
      <TaskDialog.Body
        onSubmit={(event) => {
          event.preventDefault()
          void (step.kind === 'review' ? run() : plan())
        }}
      >
        {preview.state.status === 'loading' ? (
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
          <SyncReview
            plan={step.plan}
            choices={step.choices}
            memberName={memberName}
            onChoose={choose}
          />
        ) : null}
        <TaskDialog.Actions>
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
              onClick={() => {
                setLastChoices(step.choices)
                setStep({ kind: 'mapping', error: null })
              }}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={busy || preview.state.status !== 'ready' || undecided > 0}
            title={undecided > 0 ? `${plural(undecided, 'row')} still need a decision` : undefined}
          >
            {step.kind === 'review'
              ? sync.pending
                ? 'Syncing…'
                : 'Sync'
              : step.kind === 'planning'
                ? 'Matching…'
                : 'Continue'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}

interface SyncReviewProps {
  plan: SyncPlan
  choices: Choices
  memberName: (id: number) => string
  onChoose: (line: number, value: string) => void
}

function SyncReview({ plan, choices, memberName, onChoose }: SyncReviewProps): React.JSX.Element {
  const known = plan.rows.filter(({ match }) => match.kind === 'known')
  const fresh = plan.rows.filter(({ match }) => match.kind === 'new')
  const questions = plan.rows.filter(({ match }) => needsDecision(match))
  const counts = [
    `${known.length} already known`,
    `${fresh.length} new`,
    `${questions.length} to decide`,
    ...(plan.invalid.length > 0 ? [`${plan.invalid.length} unreadable`] : [])
  ]

  return (
    <div className="grid gap-4">
      <Text>
        {plural(plan.rows.length + plan.invalid.length, 'row')}: {counts.join(', ')}
      </Text>
      {questions.length > 0 ? (
        <div className="grid max-h-80 gap-4 overflow-auto pr-1" role="list" aria-label="Decisions">
          {questions.map(({ row, match }) => (
            <div key={row.line} role="listitem">
              {match.kind === 'similar' ? (
                <Radio.Group
                  legend={`${rowName(row)} (MBD ${row.mbdId}, line ${row.line})`}
                  value={choices.get(row.line) ?? ''}
                  onValueChange={(value) => onChoose(row.line, value)}
                >
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
              ) : match.kind === 'known' ? (
                <Radio.Group
                  legend={`MBD ${row.mbdId} is ${memberName(match.memberId)}, spelt ${rowName(row)} in the export`}
                  value={choices.get(row.line) ?? KEEP_MEMBER}
                  onValueChange={(value) => onChoose(row.line, value)}
                >
                  <Radio.Item value={KEEP_MEMBER} label="Keep the name on file" />
                  <Radio.Item value={USE_EXPORT} label={`Rename to ${rowName(row)}`} />
                </Radio.Group>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {plan.invalid.length > 0 ? (
        <ul className="grid gap-0.5 text-sm text-kumo-subtle" aria-label="Unreadable rows">
          {plan.invalid.map((problem) => (
            <li key={problem.line}>
              Line {problem.line}: {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
