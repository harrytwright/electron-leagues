import { useState } from 'react'
import { Button, Checkbox, Dialog, Select, Text, useKumoToastManager } from '@cloudflare/kumo'
import {
  mappingProblem,
  type ImportMapping,
  type ImportSummary,
  type RosterPlan
} from '@shared/imports'
import {
  isSingles,
  memberDisplayName,
  normaliseName,
  resolveMember,
  type MembersSnapshot,
  type RosterSeason
} from '@shared/members'
import { useImportPreview } from '@renderer/hooks/use-import-preview'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { plural } from '@renderer/lib/plural'
import { ImportMappingForm } from '../ImportMappingForm'
import { TaskDialog } from '../TaskDialog'

export interface RosterImportDialogProps {
  season: RosterSeason
  snapshot: MembersSnapshot
  /** The export to add players from; null keeps the dialog closed. */
  path: string | null
  onOpenChange: (open: boolean) => void
}

const ROSTER_FIELDS = [
  'mbdId',
  'firstName',
  'lastName',
  'fullName',
  'league',
  'team',
  'gender'
] as const

/** A singles season has no teams, so the team column is never asked for. */
const SINGLES_FIELDS = ROSTER_FIELDS.filter((field) => field !== 'team')

/** The league in the dump named most like this one, or the first when none is. */
function suggestLeague(choices: readonly string[], leagueName: string): string | null {
  const wanted = normaliseName(leagueName, '')
  const exact = choices.find((choice) => normaliseName(choice, '') === wanted)
  const partial = choices.find((choice) => {
    const name = normaliseName(choice, '')
    return name.includes(wanted) || wanted.includes(name)
  })
  return exact ?? partial ?? choices[0] ?? null
}

type Step =
  | { kind: 'mapping'; error: string | null }
  | { kind: 'planning' }
  | {
      kind: 'review'
      plan: RosterPlan
      mapping: ImportMapping
      league: string | null
      membersRevision: string
      seasonRevision: string
      sourceRevision: string
      /** Lines of unknown MBD IDs to create members for. */
      create: number[]
    }

interface ImportVariables {
  mapping: ImportMapping
  league: string | null
  create: number[]
  membersRevision: string
  seasonRevision: string
  sourceRevision: string
}

function summarise(summary: ImportSummary): string {
  const parts = [
    `${summary.added} added`,
    ...(summary.created > 0 ? [`${summary.created} new`] : []),
    ...(summary.restored > 0 ? [`${summary.restored} restored`] : []),
    ...(summary.teamsCreated > 0 ? [`${plural(summary.teamsCreated, 'team')} created`] : []),
    ...(summary.skipped > 0 ? [`${summary.skipped} already on the roster`] : []),
    ...(summary.unknown > 0 ? [`${summary.unknown} left out`] : [])
  ]
  return `Imported ${plural(summary.rows, 'row')}: ${parts.join(', ')}`
}

export function RosterImportDialog({
  season,
  snapshot,
  path,
  onOpenChange
}: RosterImportDialogProps): React.JSX.Element {
  const preview = useImportPreview(path)
  const [step, setStep] = useState<Step>({ kind: 'mapping', error: null })
  const [openedFor, setOpenedFor] = useState(path)
  const { add } = useKumoToastManager()
  const ref = { day: season.day, leagueFolder: season.leagueFolder, seasonName: season.season }
  const importer = useWriteOperation({
    label: () => `Adding players to ${season.leagueName} ${season.season}`,
    write: (variables: ImportVariables) =>
      window.api.addPlayersFromExport(
        ref,
        path ?? '',
        variables.mapping,
        variables.league,
        variables.create,
        variables.membersRevision,
        variables.seasonRevision,
        variables.sourceRevision
      )
  })
  const [lastCreate, setLastCreate] = useState<number[]>([])
  const [chosenLeague, setChosenLeague] = useState<string | null>(null)

  if (openedFor !== path) {
    setOpenedFor(path)
    setStep({ kind: 'mapping', error: null })
    setLastCreate([])
    setChosenLeague(null)
  }

  // A dump of several leagues needs one picked; the season's own league is the first guess.
  const leagueChoices =
    preview.state.status === 'ready' && preview.state.mapping.league !== null
      ? (preview.state.preview.choices[preview.state.mapping.league] ?? [])
      : []
  const league =
    leagueChoices.length === 0
      ? null
      : chosenLeague !== null && leagueChoices.includes(chosenLeague)
        ? chosenLeague
        : suggestLeague(leagueChoices, season.leagueName)

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
      const result = await window.api.planPlayersImport(ref, path, mapping, league)
      setStep({
        kind: 'review',
        plan: result.plan,
        mapping,
        league,
        membersRevision: result.membersRevision,
        seasonRevision: result.seasonRevision,
        sourceRevision: result.sourceRevision,
        // Unknown ids are offered, never assumed; ticks made before a Back are kept.
        create: result.plan.rows.flatMap(({ row, match }) =>
          match.kind === 'unknown' && lastCreate.includes(row.line) ? [row.line] : []
        )
      })
    } catch (caught) {
      setStep({ kind: 'mapping', error: ipcErrorMessage(caught) })
    }
  }

  const run = async (): Promise<void> => {
    if (step.kind !== 'review' || importer.pending) return
    try {
      const outcome = await importer.run({
        mapping: step.mapping,
        league: step.league,
        create: step.create,
        membersRevision: step.membersRevision,
        seasonRevision: step.seasonRevision,
        sourceRevision: step.sourceRevision
      })
      const summary = outcome.result
      const failed = summary.failed
        .map((problem) => `Line ${problem.line}: ${problem.message}`)
        .join('. ')
      add({
        title:
          outcome.status === 'refresh-failed'
            ? `${summarise(summary)}, but the season could not be refreshed: ${outcome.refreshError}`
            : summarise(summary),
        description: failed || undefined,
        variant: outcome.status === 'refresh-failed' ? 'error' : failed ? undefined : 'success'
      })
      onOpenChange(false)
    } catch (caught) {
      // A refused write means a file moved on; the plan has to be made again from the mapping.
      setLastCreate(step.create)
      setStep({ kind: 'mapping', error: ipcErrorMessage(caught) })
    }
  }

  const toggleCreate = (line: number, checked: boolean): void => {
    if (step.kind !== 'review') return
    const others = step.create.filter((candidate) => candidate !== line)
    const create = checked ? [...others, line] : others
    setLastCreate(create)
    setStep({ ...step, create })
  }

  const busy = step.kind === 'planning' || importer.pending

  return (
    <TaskDialog open={path !== null} onOpenChange={(open) => !busy && onOpenChange(open)} size="lg">
      <TaskDialog.Header
        title={`Add players to ${season.season} from an export`}
        description={
          step.kind === 'review'
            ? `Bowlers${step.league ? ` in ${step.league}` : ''} are matched by MBD ID. The file itself is not kept.`
            : `Choose which columns hold the MBD ID, the name and, if the export has ${isSingles(season.file) ? 'it, the league' : 'them, the league and the team'}.`
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
              fields={isSingles(season.file) ? SINGLES_FIELDS : ROSTER_FIELDS}
            />
            {leagueChoices.length > 0 ? (
              <Select
                label="League to take from this export"
                value={league ?? ''}
                items={Object.fromEntries(leagueChoices.map((choice) => [choice, choice]))}
                onValueChange={(value) => {
                  if (value) setChosenLeague(value)
                }}
              />
            ) : null}
            {step.kind === 'mapping' && step.error ? (
              <Text variant="error" role="alert">
                {step.error}
              </Text>
            ) : null}
          </>
        ) : step.kind === 'review' ? (
          <RosterReview
            plan={step.plan}
            create={step.create}
            snapshot={snapshot}
            onToggle={toggleCreate}
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
                setLastCreate(step.create)
                setStep({ kind: 'mapping', error: null })
              }}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={busy || preview.state.status !== 'ready'}
          >
            {step.kind === 'review'
              ? importer.pending
                ? 'Adding…'
                : 'Add players'
              : step.kind === 'planning'
                ? 'Matching…'
                : 'Continue'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}

interface RosterReviewProps {
  plan: RosterPlan
  create: number[]
  snapshot: MembersSnapshot
  onToggle: (line: number, checked: boolean) => void
}

function RosterReview({ plan, create, snapshot, onToggle }: RosterReviewProps): React.JSX.Element {
  const adding = plan.rows.filter(({ match }) => match.kind === 'add')
  const onRoster = plan.rows.filter(({ match }) => match.kind === 'on-roster')
  const unknown = plan.rows.filter(({ match }) => match.kind === 'unknown')
  const nameOf = (id: number): string => {
    const member = resolveMember(snapshot.members, id)
    return member ? memberDisplayName(member) : `member ${id}`
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-0.5">
        <li>
          {plural(adding.length, 'player')} to add
          {adding.length > 0
            ? `: ${adding.map(({ match }) => (match.kind === 'add' ? nameOf(match.memberId) : '')).join(', ')}`
            : ''}
        </li>
        {onRoster.length > 0 ? <li>{onRoster.length} already on the roster</li> : null}
        {plan.newTeams.length > 0 ? (
          <li>
            {plural(plan.newTeams.length, 'team')} to create: {plan.newTeams.join(', ')}
          </li>
        ) : null}
        {plan.invalid.length > 0 ? (
          <li className="text-kumo-subtle">
            {plural(plan.invalid.length, 'row')} could not be read:{' '}
            {plan.invalid.map((problem) => `line ${problem.line} (${problem.message})`).join(', ')}
          </li>
        ) : null}
      </ul>
      {unknown.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-kumo-subtle">
            {plural(unknown.length, 'MBD ID')} not in the members list. Tick the bowlers to create
            as members with their name and id; the rest are left out.
          </legend>
          <div className="grid max-h-56 gap-1.5 overflow-auto pr-1">
            {unknown.map(({ row }) => (
              <Checkbox
                key={row.line}
                label={`${row.firstName} ${row.lastName}`.trim() + ` (MBD ${row.mbdId})`}
                checked={create.includes(row.line)}
                onCheckedChange={(checked) => onToggle(row.line, checked === true)}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  )
}
