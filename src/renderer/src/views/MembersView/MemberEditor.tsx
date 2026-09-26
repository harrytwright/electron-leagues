import { useEffect, useId, useRef, useState } from 'react'
import { Button, Text } from '@cloudflare/kumo'
import { memberDisplayName, type Member, type MembersSnapshot } from '@shared/members'
import {
  MemberForm,
  memberDraftFrom,
  memberInputFromDraft,
  type MemberDraft
} from '@renderer/components/MemberForm'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathTail } from '@renderer/lib/path-basename'
import { membersQueryKey } from '@renderer/queries/members'

interface FormError {
  message: string
  invalidNames: { firstName: boolean; lastName: boolean } | null
}

type SaveState =
  | { kind: 'editing'; error: FormError | null }
  | { kind: 'written'; saved: Member; refreshError: string; refreshing: boolean }

interface Props {
  snapshot: MembersSnapshot
  member: Member | null
  compact: boolean
  root: string
  onCancel: () => void
  onSaved: (member: Member) => void
  onBackgroundError: (message: string) => void
  onBackgroundSuccess: (message: string) => void
}

export function MemberEditor({
  snapshot,
  member,
  compact,
  root,
  onCancel,
  onSaved,
  onBackgroundError,
  onBackgroundSuccess
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<MemberDraft>(() => memberDraftFrom(member))
  const [revision] = useState(snapshot.revision)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'editing', error: null })
  const firstNameRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const active = useRef(true)
  const errorId = useId()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: () => (member ? `Saving ${memberDisplayName(member)}` : 'Adding member'),
    write: (input: ReturnType<typeof memberInputFromDraft>) =>
      window.api.saveMember(input, revision),
    refreshQueryKey: membersQueryKey
  })

  useEffect(() => {
    active.current = true
    firstNameRef.current?.focus()
    return () => {
      active.current = false
    }
  }, [])

  const update = <Key extends keyof MemberDraft>(key: Key, value: MemberDraft[Key]): void => {
    if (saveState.kind === 'written') return
    setDraft((current) => ({ ...current, [key]: value }))
    setSaveState({ kind: 'editing', error: null })
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (operation.pending || saveState.kind === 'written') return
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setSaveState({
        kind: 'editing',
        error: {
          message: 'A member needs a first and last name',
          invalidNames: {
            firstName: !draft.firstName.trim(),
            lastName: !draft.lastName.trim()
          }
        }
      })
      return
    }
    const attemptedName = `${draft.firstName.trim()} ${draft.lastName.trim()}`
    try {
      const outcome = await operation.run(memberInputFromDraft(draft, member))
      if (!active.current) {
        if (outcome.status === 'refresh-failed') {
          onBackgroundError(
            `Saved ${attemptedName} in ${pathTail(root)}, but the members list could not be refreshed: ${outcome.refreshError}`
          )
        } else {
          onBackgroundSuccess(`Saved ${attemptedName} in ${pathTail(root)}`)
        }
        return
      }
      if (outcome.status === 'refresh-failed') {
        setSaveState({
          kind: 'written',
          saved: outcome.result,
          refreshError: outcome.refreshError,
          refreshing: false
        })
        return
      }
      onSaved(outcome.result)
    } catch (caught) {
      const message = ipcErrorMessage(caught)
      if (!active.current) {
        onBackgroundError(`Couldn’t save ${attemptedName} in ${pathTail(root)}: ${message}`)
        return
      }
      setSaveState({
        kind: 'editing',
        error: { message, invalidNames: null }
      })
      void coordinator.refresh()
    }
  }

  const retryRefresh = async (): Promise<void> => {
    if (saveState.kind !== 'written' || saveState.refreshing) return
    const saved = saveState.saved
    setSaveState({ ...saveState, refreshing: true })
    try {
      await coordinator.refresh({ queryKey: membersQueryKey(root), throwOnError: true })
      if (active.current) onSaved(saved)
    } catch (caught) {
      if (!active.current) return
      setSaveState({
        kind: 'written',
        saved,
        refreshError: ipcErrorMessage(caught),
        refreshing: false
      })
    }
  }

  const error = saveState.kind === 'editing' ? saveState.error : null
  const busy = operation.pending || (saveState.kind === 'written' && saveState.refreshing)

  useEffect(() => {
    if (!error && saveState.kind !== 'written') return
    bodyRef.current?.scrollTo?.({ top: 0 })
    alertRef.current?.focus()
  }, [error, saveState.kind])

  return (
    <form
      aria-label={member ? `Edit ${memberDisplayName(member)}` : 'New member'}
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => void submit(event)}
    >
      <header
        className={`z-10 flex shrink-0 items-start justify-between gap-3 border-b border-kumo-line bg-kumo-base ${compact ? 'px-3 py-2' : 'px-5 py-4'}`}
      >
        <div className="grid min-w-0 gap-1">
          <Text as="h2" variant="heading" size="lg">
            {member ? `Edit ${memberDisplayName(member)}` : 'New member'}
          </Text>
          {compact ? null : (
            <Text variant="secondary" size="sm">
              {member
                ? 'Update this member’s details.'
                : 'The next member number is given out when you save.'}
            </Text>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={operation.pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={busy || saveState.kind === 'written'}
          >
            {operation.pending ? 'Saving…' : member ? 'Save member' : 'Add member'}
          </Button>
        </div>
      </header>

      <div
        ref={bodyRef}
        className={`min-h-0 flex-1 overflow-auto ${compact ? 'px-3 py-3' : 'px-5 py-4'}`}
      >
        {error ? (
          <div
            ref={alertRef}
            className="mb-4 grid gap-2 rounded-md bg-kumo-tint px-3 py-2 ring ring-kumo-line"
            role="alert"
            id={errorId}
            tabIndex={-1}
          >
            <Text variant="error">{error.message}</Text>
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
                Discard changes
              </Button>
            </div>
          </div>
        ) : null}
        {saveState.kind === 'written' ? (
          <div
            ref={alertRef}
            className="mb-4 grid gap-2 rounded-md bg-kumo-tint px-3 py-2 ring ring-kumo-line"
            role="alert"
            tabIndex={-1}
          >
            <Text variant="error">
              Saved {memberDisplayName(saveState.saved)}, but the list could not be refreshed:{' '}
              {saveState.refreshError}
            </Text>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saveState.refreshing}
                onClick={() => void retryRefresh()}
              >
                {saveState.refreshing ? 'Refreshing…' : 'Retry refresh'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
        <fieldset disabled={busy || saveState.kind === 'written'}>
          <MemberForm
            ref={firstNameRef}
            draft={draft}
            errorId={errorId}
            invalidNames={error?.invalidNames ?? undefined}
            onChange={update}
          />
        </fieldset>
      </div>
    </form>
  )
}
