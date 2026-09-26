# Members workspace

## Purpose and decisions

The Members page is a membership workspace: a compact bowler list beside a readable profile,
with editing, creation and merging performed in the profile pane. This plan was agreed through
the 21 September 2026 design interview and approved for implementation on 22 September.

The original temporary review document is no longer on disk. This document restores its decisions
and implementation brief from the conversation, and records progress for subsequent sessions.

### Layout and list

- Start with approximately one-third of the workspace width for the member list and two-thirds
  for the detail pane. Provide a draggable, keyboard-accessible divider and remember its width.
- Measure the available Members width, including the effect of the application sidebar. At small
  widths, stack a bounded, independently scrolling list above the detail pane.
- Initially display a Kumo Empty State asking the user to select a member. Do not select the
  first result automatically.
- List columns are member number, name, a compact status indicator and the `…` menu.
- Normal row clicks open the profile; `… → Edit` opens that record directly in edit mode.
- Preserve name/number sorting, search, existing quick filters and the live-league filter.
- Search and filters do not replace the selected profile, even when its row is hidden.
- Checkboxes appear only after entering merge mode through a row's `… → Merge` action.

### Profile, editing and creation

The profile presents a header with name, number, status and actions, followed by personal details,
contact details, record information (aliases and MBD IDs), notes, current leagues and previous
seasons. Current leagues include team and season; previous seasons are collapsible. Membership
entries navigate to the corresponding roster.

Edit switches the pane into a form with Save and Cancel. New member opens a blank form in that
same pane. A successful save displays the saved member's profile, including when the new or
updated record does not match the active filters.

Unsaved edits are discarded without prompting when switching records, starting another pane
action or leaving Members. There is no draft storage or autosave. Searching, filtering, scrolling
and resizing do not count as leaving the record. Cancel editing returns to the saved profile;
cancel creation returns to the previous profile or initial Empty State.

Keep current name/date validation, guardian-contact and under-18 contact rules. Preserve the
separate SeasonRoster creation workflow: MemberDialog can retain a wrapper around shared form
code where other screens still need a dialog.

### Merge mode

Choosing a row's Merge action selects that member, reveals the far-left checkboxes on all rows
and dedicates the detail pane to merging. Row clicks now toggle inclusion instead of opening a
profile. Selections persist across search/filter changes, including hidden rows.

All merge controls live in the detail pane: the selected records/count, main-record choice,
comparison, editable result, Merge members and Cancel. There is no separate merge toolbar over
the list or merge dialog on this page. Two or more eligible records can be selected.

The first selected member defaults to main. The user can choose another selected member as main.
That identity supplies the surviving number; choosing field values does not change the number.
If main is unticked, the earliest remaining selection becomes main. With fewer than two selected,
keep the workspace open with instructions and disable merging.

Merging owns the pane until Merge, Cancel, another explicit action such as New/Edit, or navigation
away. Starting another action discards the merge draft. Selection changes within the merge should
not unnecessarily wipe manually edited result fields. Successful merging opens the survivor's
profile. Cancel restores the previously open profile when available.

### Merge comparison

The user delegated the detailed visual design. Use a rich comparison organised by field, rather
than squeezing one full profile column per source into the pane.

- Matching values appear once with little emphasis.
- Differing alternatives identify their source by name and number, with text as well as colour.
- Each result field can use a source alternative or an explicitly edited value.
- Conflicting fields default to main. A blank field can take the sole distinct non-empty value
  supplied by the other records. Multiple competing gap-fill values are shown for review.
- Show the resulting values before the final merge. The comparison must also work for three or
  more records and in the vertical layout.
- Combine aliases and MBD IDs without duplicates, including original names where they differ from
  the resulting name.
- Combine distinct non-empty notes, main first, separated by blank lines. Keep the result editable
  and source notes visible. Source labels belong to the UI, not the saved notes.
- Marketing and card-issued metadata default to main. Validate the resulting member and apply
  the normal age/contact rules.

### Existing data and exceptional states

Members are location-specific. Keep current filters, filtered CSV export, MBD file picking/drop,
delete semantics, disabled/loading/error states and duplicate-number resolution accessible.
Deleted, absorbed or ambiguous duplicate-number records are not eligible merge targets.

Duplicate numbers cannot uniquely identify physical member records. Preserve distinct row
identity and require number conflict resolution before normal writes. If a selected record
disappears on refresh, replace its stale profile with an appropriate unavailable/empty state.

Save failures keep the active form and show an inline error. Navigation can still discard it.
A successful write followed by a failed refresh must report success separately and offer refresh
recovery rather than repeating the write.

## Batch merge implementation

The original API accepts two member IDs and a master revision. Group selection and an edited
result require one batch request carrying ordered source IDs, main ID, reviewed values and the
expected revision. Extend the shared schema, main handler and renderer contract together.

Validate all participants before mutation and hold the existing root lock. Do not simulate a
group merge using renderer-driven pairwise calls: each changes the revision and can leave a
partially processed selection. Compute required identifier unions and validate results in the
main/shared layer, not only in the renderer.

Absorbed records retain their details with `mergedInto` linking to the survivor. Live roster
entries migrate; archived files keep old numbers which resolve through those links. Deduplicate
the surviving player within each live roster and preserve unrelated entries.

Where several sources appear on one live roster, prefer main's existing player entry. Otherwise,
prefer the earliest selected source entry. Show differing team/position assignments in the merge
review so users can understand the result.

The existing code saves the master before roster writes and lacks complete rollback across those
files. Inspect existing write/recovery helpers, prepare changes before writing and accurately
handle/report partial filesystem failures. A root lock alone does not make several writes atomic.

### Group merge contract

`window.api.mergeMemberGroup` accepts `sourceIds`, `mainId`, `result` and `expectedRevision`,
returning the surviving `Member`. `src/shared/member-merge.ts` validates the request, builds
source-labelled field alternatives and roster differences, and enforces identifier/name unions
and age rules. Pass all snapshot members to `buildMemberMergePreview` so old absorbed numbers
resolve consistently with the main process. The legacy pair API remains during phase 4.

`src/main/lib/member-group-merge.ts` validates participants and reads live rosters under the root
lock before preparing writes. It preserves unrelated roster bytes and archived files. A direct
main roster entry takes priority over old numbers resolving to main, followed by the earliest
selected source. Renaming main also touches unchanged rosters that contain main so generated
sign-in sheets become stale.

Before writing, every prepared target is checked for symlinks and compared with its original
contents. Roster writes precede the master update. A failed write triggers restoration of every
attempted target, including a partly written file; recovery failures identify the affected paths.
This provides recovery from reported write failures, not crash-atomic multi-file transactions.

## Implementation phases

Each phase uses Sol for code implementation. The orchestrator reviews scope and verification,
requests an independent cold review, routes valid findings back for fixes, then commits after
all required checks pass. Phase 1 used Claude Fable; subsequent cold reviews use Claude Opus 5.5,
without the implementer's conversation. Each review receives a bounded source packet, has no
tools and retains a JSON usage receipt. Sol runs through Codex's agent tool. The repository's
`.claude/skills/codex-first/SKILL.md` explicitly skips its CLI delegation route in a Codex session.

| Phase | Deliverable                                                                                                                                                  | Status   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1     | Compact selectable list, resizable/stacked layout, readable profile and roster links. Existing editing/merge dialogs remain transitional until their phases. | Complete |
| 2     | Shared member form and creation/editing in the detail pane, including save/refresh behaviour and navigation discard.                                         | Complete |
| 3     | Validated group merge contract, shared preview rules and main-process roster/file handling. Keep old callers working until phase 4.                          | Complete |
| 4     | Merge selection mode, editable comparison, final integration, responsive/keyboard visual verification and removal of obsolete Members dialog paths.          | Complete |

Use focused components for layout, list, profile, form and merge comparison. Represent mutually
exclusive pane actions explicitly instead of accumulating boolean flags. Preserve responsive
filtering and avoid rerendering every row for each divider pointer movement.

## Verification

- Initial empty profile, explicit selection and stable selection across filters.
- Correct record identity for duplicate numbers, and eligibility restrictions on writes/merges.
- Pointer and keyboard row/menu/divider interaction; remembered widths and bounded small layout.
- Current and historical league links, including archived rosters.
- In-pane create/edit, required fields and age rules, Save/Cancel and discard on navigation.
- Failed writes versus successful writes with failed refresh, without accidental duplicate saves.
- Two-, three- and larger-member merges; ordered main selection and hidden selections.
- Source alternatives and manual result edits; deterministic notes/identifier unions.
- Live roster deduplication and precedence, archived identity resolution and unrelated players.
- Revision conflicts and filesystem failure recovery/reporting for the whole group operation.
- Visual inspection at the initial 1100 × 720 and minimum 800 × 500 windows, accounting for the
  app sidebar, with both colour modes where practical.

Before every commit: `npm run format`, `npm test`, `npm run typecheck` and `npm run lint`.
Inspect the diff and exclude unrelated formatting changes. Cold-review fixes belong in the
same phase commit. Follow AGENTS.md's commit subjects, unsigned commits and attribution rules.

## Starting points and handoff

Implementation began on branch `league-members-database` at `e5f024c` on 22 September 2026.
That commit contains the earlier AddPlayerDialog Combobox change, already committed and pushed.
The new phase work is separate. The user has authorised implementation and a commit after each
reviewed phase; this document also serves as the continuation record.

Existing untracked `.agents/skills/grill-me/`, `.agents/skills/grilling/` and
`docs/rfc/0002-renderer-layout-slots.md` are unrelated and must remain intact.

Relevant files:

- `src/renderer/src/views/MembersView/MembersView.tsx` and its tests: list, filters and actions.
- `src/renderer/src/components/MemberDialog/MemberDialog.tsx`: current forms and draft conversion.
- `src/renderer/src/components/MergeMemberDialog/MergeMemberDialog.tsx`: current pair merge UI.
- `src/renderer/src/components/SeasonRoster/SeasonRoster.tsx`: separate member-dialog consumer.
- `src/renderer/src/lib/members-filter.ts` and `members-table-store.ts`: search and preferences.
- `src/renderer/src/app/App/App.tsx`, `lib/selection.ts` and navigation hooks: roster navigation.
- `src/renderer/src/hooks/use-write-operation.ts`: writes and refresh coordination.
- `src/renderer/src/tests/mock-api.ts`: renderer test doubles.
- `src/shared/members.ts` and tests: schemas, age rules, merging and membership derivation.
- `src/shared/ipc.ts`: IPC contract and validation.
- `src/main/index.ts`: handler registration and main window dimensions.
- `src/main/lib/members.ts` and tests: filesystem mutation, locks and revision checks.

Recheck repository state and the applicable Kumo/React skills when resuming. The plan is approved;
do not repeat the design interview. Record phase commits, reviewer findings and verification
outcomes as implementation progresses.

## Review record

Phase 1's first independent Claude Fable review found clipped profile scrolling, incorrect stacked
grid placement, profile actions bypassing duplicate-number restrictions, weak selection styling,
Windows archive navigation failures and redundant row focus stops. These findings were accepted.
Browser inspection also found that sizing the stacked list against viewport height left too little
room for the profile at 800 × 500. These fixes passed source review, regression tests and browser checks.

Work resumed on 23 September after a usage interruption. Repository changes survived; temporary
review files and browser fixtures did not. The approved design and phase boundaries are unchanged.

Phase 1 verification: `npm run format`, `npm test` (90 files, 874 tests), `npm run typecheck`
and `npm run lint` passed. Browser checks covered the initial empty state, profile selection,
independent scrolling at 1100 × 720 and 800 × 500, duplicate action guards and live roster
navigation to Players. Windows archive navigation has regression coverage. The corrected narrow
layout gives the list 88px and profile 164px at minimum size with the sidebar and problem banner.
A second Fable invocation returned usage-credit exhaustion, so it produced no further verdict.
The first Fable review and its required fixes are complete.

Phase 1 committed as `a4d38c3` (`feat: add the members profile workspace`).
Phase 2 committed as `b3db82a` (`feat: edit members in the profile pane`).

Phase 2 adds a shared `MemberForm`, a keyed `MemberEditor` and explicit pane actions. SeasonRoster
retains its dialog wrapper. The editor captures the opening revision, discards drafts on navigation
and prevents late saves from changing a newer selection. A completed write with failed refresh
freezes the saved form and offers refresh-only recovery. Cached parent views stay mounted during
background read failures so an active draft survives.

The phase 2 Opus 5.5 review identified three required fixes: expose cached members read failures,
notify the user when a save fails after its editor closes and associate name validation with the
correct fields. All three are resolved. Menu triggers preserve drafts; renumbering discards them.
The review is retained in `.temp/members-workspace/phase2-opus-review.md`; do not rerun it on resume.

Browser verification before those final fixes covered creation under an excluding search filter,
refresh-only recovery without a second save, navigation during a held save and visible focused
errors after scrolling. The editor remained bounded at 800 × 500 in dark mode. The final browser check confirmed that
closing a saved form leaves its refresh warning visible and retrying reads the saved member
without a second write. Final checks passed: format, 90 test files with 882 tests, type checking,
lint and diff checking. Lint reports only the existing anti-slop module-type warning.

The user requires conservative usage monitoring and a saved checkpoint before either model's
allowance runs out. Read `.temp/members-workspace/check-quota.py` output before and after agent
work, reviews and validation. Keep room for the commit and handoff before starting another phase.
Review receipts and the local usage policy are in the ignored `.temp/members-workspace` directory.

Temporary browser fixture: `/tmp/leagues-members-visual/launch.sh`, port 4179. It renders the real
App with an in-memory API, explicit Tailwind source scanning and `window.__membersHarness` controls
for failed saves, persistent failed refresh and held saves. No real league data is written. These
temporary files may disappear between sessions; do not rely on them as the only handoff.

Phase 3 implements the shared group merge contract and main-process recovery described above.
Root review corrected card metadata defaults, absorbed-number preview resolution, unrelated
roster rewrites and name-dependent sign-in sheet invalidation. The independent Opus 5.5 review
identified two further fixes: exclude untouched targets from rollback and compare trimmed field
alternatives. Both are resolved; the source-note alternatives added after the review packet were
checked locally. The existing resolver follows absorption chains and the scanner separates
archives, confirming the reviewer’s questions about those dependencies.

The review and receipt are retained in `.temp/members-workspace/phase3-opus-review.md` and
`phase3-opus-usage.json`. Do not repeat that paid review when resuming. The merge workspace UI
remains phase 4, with a design handoff in `.temp/members-workspace/phase4-brief.md`.

Phase 3 final verification passed: `npm run format`, `npm test` (92 files, 902 tests),
`npm run typecheck`, `npm run lint` and `git diff --check`. Lint retains only the existing
anti-slop module-type warning. The next implementation phase is the merge workspace UI;
phase 4 implementation began after the user approved continuation.

### Phase 4 completion

The Members page now uses ordered row selection and an in-pane merge comparison. The first
selected member supplies the main record; removing it selects the earliest remaining record.
Manual field edits survive main-record and selection changes. Source values can be reset to the
default, with a visible notice when a chosen source disappears. Notes have an explicit combined
default, while aliases and MBD identifiers combine automatically. The Members merge-dialog path
has been removed; other consumers retain their existing wrappers.

The bounded Opus 5.5 review identified missing source/default recovery and the wrong profile
being shown after closing a completed merge whose refresh failed. These findings are resolved.
The suggestion to retain a draft when Delete is chosen was declined because the approved design
discards drafts on another explicit action. The review's first finding was truncated in the CLI
result and could not be evaluated in full; no repeat paid review was run. Independently, the
completed-write state now suppresses the obsolete instruction to cancel and restart the merge.
The receipt records $0.9251122 API-equivalent usage across four internal CLI turns, below the $1
cap. Review and usage files remain in the ignored temporary review directory.

Browser checks covered 20 selections, hidden selections, manual edits, removing the main record,
clearing all selections then choosing different members, source fallback and a renamed survivor
shown after a completed write with failed refresh. Selection freezes during saving and recovery.
The 800 × 500 dark layout retains independently scrolling panes without horizontal overflow;
the 1100 × 720 light layout was also inspected. Tests cover combined-note/default recovery,
refresh-only retry with exactly one merge write and late failures after Cancel or New member.

Final verification passed: `npm run format`, `npm test` (92 files, 909 tests),
`npm run typecheck`, `npm run lint` and `git diff --check`. Lint reports only the existing
anti-slop module-type warning. All four implementation phases are complete.
