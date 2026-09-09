---
Status: Accepted
Author: Claude
Created: 2026-09-06
Updated: 2026-09-09
Baseline: TBC
Reviewer: Harry Wright <haroldtomwright@gmail.com>
---

# RFC 0001: League members database

> Supersedes: The export-driven draft at `docs/members-database-design.md` (removed)

## Summary

Add an opt-in **league members database** to the app: a master list of members at the root of a
location, a per-season file holding settings, teams and roster, a Members page and season tabs
to edit them, a one-way sync from the BLS Master Bowler Database, a per-league export drop to
fill a roster, a generated sign-in sheet per season, and member numbers that print as a Code 128
barcode. All data is JSON in the OneDrive folder, app-owned and edited only in the UI. The app
never writes to BLS.

## Motivation

Today the app organises documents; who bowls in which league lives in BLS, one database per
league, and in the secretary's head. That makes three things hard: looking up a member's details
across leagues, producing the weekly payment sheet from anything but a hand-maintained Word
file, and giving members a number that a card and the POS can share. BLS's Master Bowler Database
(MBD) ties a bowler's scores together across leagues but is a scoring tool, awkward to keep in
step, and holds nothing the centre needs beyond names, ids and gender.

A future "SBC Members" system will own membership properly (social members, one-year validity,
API-minted numbers). This RFC gives it something to grow from and sync with, without building it.

## Detailed design

### Purpose and scope

A **league members database**: who bowls, in which leagues, seasons and teams, with the contact
details needed for look-ups and marketing, and a generated sign-in sheet per season. The app
becomes the editor of rosters; BLS (Bowling League Secretary) and its Master Bowler Database
(MBD) keep scoring and the shared bowler list, and the MBD ID is the link between the two.

|       | BLS + MBD                                                            | This app                                                                                      |
| ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Owns  | Scores, averages, handicaps, standings; the cross-league bowler list | Members, rosters, teams, season settings, documents, sign-in sheets, member numbers and cards |
| Flows | Out, as exports                                                      | In, via the MBD sync and per-league export drops; never back                                  |
| Key   | MBD ID                                                               | Member number, with MBD IDs kept as the link back                                             |

This is **not** the centre's full membership system. A future "SBC Members" system will grow
from the ideas here, take over membership rules (one-year validity, social members, API-minted
numbers) and sync from this app's files. Fields that exist only to bridge to it are marked
transitional in [Transitional fields](#transitional-fields).

The feature is **opt-in per location**. Enabling it creates `members.json` at the root; a
location without that file is the plain folder organiser the app is today, with the bundled
`Sign-In Sheet.docx` template. That keeps the app usable, and saleable, for centres that don't
want the database.

Out of scope, noted so nothing here blocks them: attendance via LeagueSecretary, the one-year
membership rule, social members via a merged spreadsheet, the SBC Members system, POS reports.

### Constraints inherited from the current app

- The OneDrive folder tree is the source of truth; the app scans it on open and on every
  change. Existing documents are never overwritten; app-owned files (`meta.json`, generated
  output) are the exception and are rewritten freely.
- Reserved folders are underscore-prefixed. League names can't start with `_`.
- Everything touching disk runs in main behind `assertInsideRoot` / `resolveLiveSeasonRoot`;
  the renderer only sees typed IPC results.
- Two machines, two users, rarely concurrent. Writes must survive the odd OneDrive conflict
  copy without corrupting anything; they don't need to prevent it.
- The watcher already rescans on any change under the root (depth 6, 500 ms debounce).

### Files

All members data is JSON, app-owned, edited only in the UI, and hidden from the file browser by
reserved name (plain names, not dotfiles: Windows Explorer shows dotfiles anyway, and the league
`meta.json` isn't one). Excel editing is not supported; a filtered CSV export from the Members
page covers spreadsheets. Older seasons are never backfilled.

#### `<root>/members.json` — the master list

```ts
interface MembersFile {
  schemaVersion: 1
  /** Next number to mint. Never decremented; deleted numbers are never reused. */
  nextId: number
  members: Member[]
}

interface Member {
  /** Member number, stored raw. Displayed zero-padded; see "Member numbers". */
  id: number
  firstName: string
  lastName: string
  /** ISO date. Drives the under-18 rules. */
  dob?: string
  /** From the MBD sync; BLS records it for prize categories. */
  gender?: 'male' | 'female' | 'other'
  /** Blank for under-18s. */
  email?: string
  phone?: string
  /** Free text: name and contact of a parent/guardian. Under-18s only. */
  guardianContact?: string
  /** Every MBD ID known for this person; the MBD itself can hold duplicates. */
  mbdIds: string[]
  /** Every spelling seen for this person, so the sync stops asking. */
  aliases: string[]
  /** Opt-out. Applies to the guardian contact while under 18, carries over at 18. */
  marketing: boolean
  /** TRANSITIONAL — see below. ISO date the card was printed. */
  cardIssued?: string
  notes?: string
  /** Set when this record was merged into another; the id keeps resolving. */
  mergedInto?: number
  /** Soft delete: hidden from pickers, kept because a roster references it. */
  deleted?: boolean
}
```

Members are created only by a person: _New member_ in the roster picker or on the Members page,
the MBD sync, or a league export drop. The scan never mints, merges or deletes.

#### `<season>/meta.json` — settings, teams and roster

One file per season so "copy from previous" moves teams and players together.

```ts
interface SeasonFile {
  schemaVersion: 1
  /** Players per team: 1 singles … 5 fives. */
  format: number
  startDate?: string
  startTime?: string
  weeks?: number
  /** Set on the Settings tab after creation. Not printed; kept for look-up. */
  fees?: { total: number; breakdown: { label: string; amount: number }[] }
  subFee?: number
  teams: Team[]
  players: Player[]
}

interface Team {
  /** Created once, carried across seasons even if the name changes. */
  id: string // 'team_<cuid>'
  /** This season's start position / lane draw. Set each year on the Teams tab. */
  teamNo: number
  name: string
}

interface Player {
  memberId: number
  /** null = sub for this league this season. */
  teamId: string | null
  position?: number
}
```

No `extra`: fields are added at a version bump, not ad hoc.

#### Reserved names and the file browser

- `members.json` at the root and `meta.json` in a season folder join the league `meta.json` as
  reserved: skipped by the scanner's listings and by `listDirEntries`, never shown as documents.
- Template workflows skip them: "copy from previous season" copies documents only; the season
  file is created by the app from the wizard's choices (below).
- `Sign-In Sheet.pdf` in a season root is app-generated output and is shown as a document even
  before it exists (see [Sign-in sheet](#sign-in-sheet)).
- Archived seasons keep their `meta.json`; it is read for history and never written.

#### Concurrency and healing

- Every write re-reads the file first and takes the in-process lock (the `withTemplateLock`
  pattern keyed on the root). If the file on disk changed since the editor loaded it, the
  editor reloads and says so rather than overwriting.
- The scan reads all members files on every run and reports, never repairs: duplicate member
  numbers (from a conflict copy), roster rows whose `memberId` is unknown ("Unlinked"), teams
  referenced by no player, members missing DoB or contact ("Needs details"). Each shows in the
  UI with an action; none is resolved silently.
- OneDrive conflict copies (`members-PC1.json`) are surfaced as an unrecognised root entry,
  which the existing Home view already lists.

### Member numbers

- Sequential integers from 1, minted from `nextId`, never reused, no vanity numbers.
- **Display**: zero-padded to `max(6, digits(nextId − 1))`, so `000042` today and, if the list
  ever passes a million, seven digits for everyone. It reads as a proper membership number.
- **Barcode and POS**: Code 128 (subset C, digit pairs, so it stays short) of the **unpadded**
  integer. The POS stores the scanned value as the customer card reference. Because padding is
  display-only, a change of display width never invalidates a printed card or a POS value.
- Minting cross-machine can't be locked; the scan flags a duplicate number and the Members page
  makes you choose which record keeps it and renumbers the other.

### Identity: MBD ids, aliases, merges, deletion

- A member may carry several `mbdIds` because the MBD has duplicates through misspellings, and
  several `aliases` because leagues spell names differently. Both are unioned on merge.
- **Merge** (Members page, _Merge into…_): for two saved records that are the same person. The
  survivor gains the other's ids and aliases; the other gets `mergedInto`. Live-season rosters
  are rewritten to the survivor; archived seasons resolve through `mergedInto` when read.
- **Delete**: hard delete only when the member is on no roster in any live or archived season;
  otherwise soft delete (`deleted: true`), hidden from pickers, still resolvable.
- Name normalisation for matching: lower-case, diacritics stripped, punctuation removed,
  `first last`. "Similar" means Levenshtein distance ≤ 2 on either name, swapped first/last, or
  an initial matching a first name.

### Season lifecycle

**New season dialog** (replaces today's source picker): season name, format (players per
team), start date, weeks played, and two ticks:

- _Copy documents from previous season_ — on by default when a previous season exists. Ticked
  runs today's `previous` workflow (previous files, then fill from templates); unticked runs
  `templates`. The `empty` workflow is removed.
- _Carry over teams and players_ — only offered when a previous season exists, on by default.
  Copies `teams` (ids, names and last year's `teamNo`) and `players` into the new season file.

Fees, team numbers and roster changes are made afterwards on the season's tabs. A team's `id`
is created once, when the team is created, and follows it across seasons; `teamNo` is set for
each season because it is the lane draw.

**Season view tabs**: Files · Players · Teams · Settings.

- _Players_: grouped by team in `teamNo` order, then Subs. _Add player_ searches the master
  list by name or number; _New member_ creates one (mints a number; under-18 rules apply).
  Rows move between teams by menu. Unlinked rows show _Link…_ / _Create member_.
- _Teams_: add, rename, remove (players of a removed team become subs), set `teamNo`.
- _Settings_: start date, time, weeks, format, fees and breakdown, sub fee.

Member details (contact, DoB, guardian, marketing, notes) are edited on the Members page only;
the roster row links across.

### Members page

Sidebar entry above the league days, peer of Home. A table of the master list: number, name,
DoB, contact, leagues (badges, one per live-season membership, derived in memory), with a text
filter that matches names, aliases and numbers, a league filter, and quick filters for _Needs
details_, _Possible duplicates_ (same normalised name, no shared MBD id), _Duplicate numbers_,
_MBD duplicates_ (more than one `mbdId`) and _Deleted_. Row actions: edit, merge into…, print
card, delete. Toolbar: _Sync with MBD export…_, _Export CSV_ (the current filter and sort,
with under-18s' guardian contact in place of personal contact).

### MBD sync

Input: the MBD **all-bowlers** export, picked or dropped on the Members page. Column names are
unverified (CDE's documentation is unreachable from where this was written), so the first step
is the column-mapping preview, remembered per location. Pulls **name, MBD ID, gender only**;
DoB and contact are entered afterwards, and new records land in _Needs details_.

Per row, in order:

1. MBD ID already in some member's `mbdIds` → that member. If the exported name isn't the
   member's name or one of their aliases, ask which spelling to keep; the other is stored as an
   alias so the question never repeats.
2. Otherwise a similar name exists (see normalisation above) → _Merge_ (add the id to that
   member) or _Create new_; exact single-candidate matches on normalised name are proposed
   pre-selected as Merge.
3. Otherwise → create, with the MBD ID and name.

One direction; nothing is written back. Results are an in-app summary, not a log file.

### League export drop

A per-league BLS/MBD export dropped on a season (or picked via _Add players from export…_ on
the Players tab) fills the roster in one go: rows are matched to the master by MBD ID; matched
members are added to the roster; a team name column, if the export has one, creates teams that
don't exist yet and assigns the row; rows already on the roster are skipped; unknown MBD IDs
offer _Create member_ (name and id only). The dropped file is processed in memory and **not**
copied into the folder. Any other dropped file keeps today's copy-in behaviour.

### Sign-in sheet

A payment sheet for the league night, one per season, printed weekly:

```
| Team name                |
| Player     | Cash | Card |
| John Doe   |      |      |
| Jane Doe   |      |      |
|            |      |      |   ← blank rows for subs
```

- Teams in `teamNo` order, a Subs block last, two columns per page. Header: league, season,
  `Week ____  Date ________`. Fees are not printed.
- `{season}/Sign-In Sheet.pdf`, rendered from HTML via `webContents.printToPDF`; no new
  dependency. Shown as a row (badge _Generated_) before it exists; opening it generates it.
  Regenerated after every roster or team save made in the app, and on open if the season file
  is newer than the PDF. Never generated for archived seasons.
- `Sign-In Sheet.docx` stays a bundled, required template for locations without the feature.
  Where a season has a roster, the docx row is badged _Superseded_ with a hint to the PDF.

### Cards and POS

_Print card_ on the Members page renders name, number and Code 128 barcode to a card-sheet PDF
via `printToPDF` and sets `cardIssued`. The barcode encoder is written and tested in-repo. The
POS sets its customer-card value from a scan; nothing else is integrated in this design.

### Safeguarding and privacy

- Under 18 on the day of creation or sync: `email` and `phone` are left blank and cannot be
  entered; `guardianContact` is offered instead. When a member turns 18 they appear in _Needs
  details_ so contact can be collected; nothing is automatic.
- `marketing` is opt-out (default on). While under 18 it governs the guardian contact (YBC and
  youth-tournament updates); it carries over unchanged at 18. CSV export respects it.
- Personal data stays in `members.json` and season files. Nothing member-level is sent to
  analytics or Sentry; `capture` calls carry counts only. Dropped exports are never kept.

### Transitional fields

These exist to bridge to the SBC Members system and are expected to move or go. Each carries a
`/** TRANSITIONAL */` comment in the schema and a note in the UI where relevant.

| Field / behaviour             | Today                                     | Later                                                      |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `Member.id` minting           | Local `nextId` counter in `members.json`  | Minted by the SBC API; this app receives numbers           |
| `Member.cardIssued`           | Set by _Print card_ here                  | Owned by SBC alongside social-member cards                 |
| `Member.marketing`            | Opt-out flag here                         | Consent record in SBC; this field becomes read-only mirror |
| `Sign-In Sheet.docx` template | Required, badged _Superseded_ with roster | Removed from the required list once the PDF is proven      |

`schemaVersion` on both files is what a migrator will read.

### IPC surface (preload additions)

```ts
membersEnabled: () => Promise<boolean>
enableMembers: () => Promise<void> // creates members.json
membersSnapshot: () => Promise<MembersSnapshot | null> // master + all season files, derived joins
saveMember: (member: MemberInput) => Promise<Member> // create (mints) or update
mergeMembers: (fromId: number, intoId: number) => Promise<void>
deleteMember: (id: number) => Promise<'hard' | 'soft'>
saveSeason: (target: SeasonRef, file: SeasonFile) => Promise<void>
previewMapping: (sourcePath: string) => Promise<MappingPreview>
syncMbd: (sourcePath: string, mapping: Mapping, decisions: SyncDecision[]) => Promise<SyncSummary>
addPlayersFromExport: (target: SeasonRef, sourcePath: string, mapping: Mapping) =>
  Promise<ImportSummary>
openSignInSheet: (target: SeasonRef) => Promise<string> // generates if missing/stale, returns path
printCards: (ids: number[]) => Promise<string>
exportMembersCsv: (filter: MembersFilter) => Promise<string>
```

`SeasonRef` is `{ day, leagueFolder, seasonName }`, validated by `resolveLiveSeasonRoot`. The
snapshot is small (hundreds of members, tens of seasons) so one object over IPC replaces
queries; the renderer groups and filters in memory. Analytics: `members_enabled`,
`member_created`, `members_merged`, `mbd_synced { rows, created, merged }`,
`players_imported { rows }`, `signin_generated`, `cards_printed { count }`.

### Phased delivery

1. **Files and read side.** `src/shared/members.ts` schemas (zod), reserved-name hiding,
   season file creation in the new-season dialog with the two ticks, `membersSnapshot`, the
   Members page (read-only) and the season Players/Teams/Settings tabs (read-only), opt-in
   toggle. Tests: schemas, hiding, workflow exclusion, snapshot joins, `mergedInto` resolution.
2. **Editing.** Member create/edit with minting and under-18 rules, roster and team editing,
   merge and delete, duplicate-number resolution, Needs-details and duplicate filters. Tests:
   mint under lock and re-read, padding, merge rewrites live seasons only, delete rules.
3. **Sign-in sheet.** HTML layout, `printToPDF`, virtual row, regenerate-on-save and stale-on-
   open, `Superseded` badge on the docx. Tests: generated text contains teams in `teamNo`
   order and the Subs block; archive never generates.
4. **MBD sync and export drop.** Column-mapping preview, matching rules, alias capture, drop
   handling. Needs one real all-bowlers export and one per-league export as fixtures. Tests:
   each rule, repeat-sync asks nothing new, unknown-id rows.
5. **Cards and CSV export.** Code 128 encoder, card sheet, `cardIssued`, filtered export.

Phase 1 stands alone: a location can enable the feature, create seasons with teams, and see the
empty structure; nothing in phases 2–5 changes the files' shape.

## Drawbacks

- **Two writers, no lock.** JSON files in OneDrive can't be locked across machines. The design
  accepts the rare conflict copy and surfaces it rather than preventing it. Fine for two users
  who rarely overlap; wrong for a busy office.
- **No spreadsheet editing.** Secretaries used to Excel lose that; the CSV export is one-way.
- **The app becomes a data editor.** Until now it only added files. Rosters, teams and members
  are now state the app owns and must migrate with `schemaVersion`.
- **Unverified export formats.** The MBD column names are guessed until a real export is
  available; the mapping dialog is the mitigation, not a fix.
- **Personal data in a shared folder.** Already true of BLS backups in `_archives`, but this
  adds DoB and guardian contacts. The under-18 rules and export filters limit what is held.

## Alternatives considered

| Alternative                                                               | Why not                                                                                                                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-season `players.csv` rolled up into per-league and per-root CSV files | Written roll-ups repeat every phone number in several places and two machines rewriting them is how conflict copies happen. Roll-ups are done in memory instead. |
| BLS per-league exports as the routine feed, app read-only                 | The app would never be the editor and every roster change would be an export-and-import round trip. Exports remain as a bootstrap tool and the MBD sync.         |
| Season files carrying copies of members' contact details                  | Copies drift between seasons; the season file holds only `memberId` and team facts, and the master list is the single place a detail lives.                      |
| SQLite in the OneDrive folder                                             | Binary file under sync corrupts; not inspectable.                                                                                                                |
| Separate `players.json` and `meta.json` per season                        | Copy-from-previous has to move both together or team references break. One file.                                                                                 |
| CSV for the master list and rosters                                       | Lists (`mbdIds`, `aliases`, teams) become semicolon strings; nobody hand-edits these anyway. JSON.                                                               |
| TOML for the app-owned files                                              | New parser dependency; arrays of tables are clumsy for players inside teams; no reader to benefit.                                                               |
| Dotfiles for the app-owned files                                          | Hidden on macOS, visible in Windows Explorer on the BLS machine; the league `meta.json` isn't one. Hidden by the app instead.                                    |
| Member id as a hash of the name                                           | Same name, same id; fixing a misspelling (the very thing the sync exists for) changes the id and invalidates cards and POS values.                               |
| Random short ids (`m_7f3k2q`)                                             | Fine technically, but a sequential number reads as a real membership number and packs into a shorter barcode.                                                    |
| MBD ID as the member number                                               | Not everyone has one, the MBD holds duplicates, and the number goes on cards and into the POS.                                                                   |
| Zero-padded id stored as a string                                         | Padding is presentation; storing the integer lets the display width grow without touching data or barcodes.                                                      |
| Teams as free text per player                                             | Names drift and the sheet groups by them. Teams are records with a stable id and a per-season number.                                                            |
| Dated weekly sign-in sheets                                               | Only useful if the app recorded attendance, which is out of scope. One sheet per season.                                                                         |
| Sign-in sheet as `.docx`                                                  | Editable output invites edits that the next regeneration discards. PDF via `printToPDF`, no dependency.                                                          |
| Two marketing exports (adults, guardians)                                 | One filtered export with the guardian contact substituted for under-18s covers both.                                                                             |
| A separate `guardianUpdates` consent flag                                 | One `marketing` flag that applies to the guardian while under 18 and carries over at 18.                                                                         |
| Status / lapsed / first-seen / last-seen fields                           | Derived in memory from rosters; membership rules belong to the SBC system.                                                                                       |
| Scan mints ids for unlinked roster rows                                   | Silent minting is how duplicates appear. Unlinked rows are surfaced for a person to link or create.                                                              |

## Unresolved questions

- The MBD all-bowlers and per-league export column names. One redacted sample of each fixes
  the mapping and becomes a test fixture.
- The exact gender values the MBD exports.
- What the POS scanner reads, to confirm Code 128 over EAN.
- Whether the sign-in sheet needs a second sub block per team or one Subs block per sheet;
  the design assumes one per sheet plus blank rows per team.
