# League members database — design

Status: proposal, not implemented. Baseline: branch `claude/league-members-database-3jt90g`
at `321fd9f` (Polish desktop task dialogs and location toolbar).

## Goal

Keep a directory of everyone who bowls at the centre — name, email, phone — together with
which leagues, seasons and teams they bowl in. Populate it from BLS (Bowling League Secretary)
exports rather than by hand. Use it to generate the season's sign-in sheet instead of the blank
`Sign-In Sheet.docx` template.

Three questions any design has to answer:

1. **Where does the data live?** The app's whole model is "the OneDrive folder tree is the
   source of truth; the app scans it and only adds files". Members data has to fit that.
2. **What is the unit of truth?** BLS has one database per league, so an export is naturally
   _per league per season_. But a person bowls in several leagues, so the _directory_ is global.
3. **How do we recognise the same person across exports?** BLS bowler numbers are per league.
   Nothing in an export is guaranteed to be a global key.

## Constraints inherited from the current app

- Existing documents are never overwritten. App-owned output (`meta.json`, requested zips) is
  the only thing the app rewrites, and `meta.json` is _healed_: the scan wins for facts, the
  prior file wins for user-facing fields (`name`, `extra`, `createdAt`).
- Reserved folders are underscore-prefixed (`_templates`, `_shared`, `_archives`). League names
  can't start with `_` (`sanitiseFolderName`), so a new `_members` folder can't collide.
- Everything touching disk runs in main; the renderer only sees typed IPC results. Paths are
  checked with `assertInsideRoot`; season targets with `resolveLiveSeasonRoot`.
- The folder is OneDrive-synced and may be open on two machines. Anything the app writes must
  survive concurrent writers producing conflict copies, and must be human-readable so the
  secretary can fix it in Excel.
- The watcher (`chokidar`, depth 6, 500 ms debounce) already rescans on any change under the
  root, so a CSV dropped into a season folder triggers a refresh for free.

## Options considered

|                                | A. Per-season `players.csv`, roll-ups written as files (original idea) | **B. Per-season `players.csv` is truth; global directory derived + a healed ledger** | C. Normalised: global `members.csv` is truth; seasons hold `roster.csv` of ids | D. SQLite in the root         |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------- |
| Fits "folder is truth"         | Yes                                                                    | Yes                                                                                  | Partly: the global file becomes the thing you must edit                        | No                            |
| BLS import = drop one file     | Yes                                                                    | Yes                                                                                  | No: import must split rows into two files and upsert                           | No                            |
| Duplication of contact details | High: every roll-up file repeats it                                    | Only in the raw exports, which are snapshots anyway                                  | None                                                                           | None                          |
| Conflicts on OneDrive          | Each league roll-up is rewritten on every change                       | One append-mostly ledger, rewritten only when content changes (like `meta.json`)     | Global file is hot: every import rewrites it                                   | Binary file; sync corrupts it |
| Look-ups / joins               | Re-parse roll-ups                                                      | In-memory index built on scan                                                        | In-memory index built on scan                                                  | SQL                           |
| Editable in Excel              | Yes                                                                    | Yes                                                                                  | Yes                                                                            | No                            |
| History (who bowled 2023-24)   | Yes, if roll-ups keep old seasons                                      | Yes: archived seasons keep their `players.csv`                                       | Yes                                                                            | Yes                           |

**Recommendation: B.** It keeps your original shape (a `players.csv` in each season folder,
which is exactly what a BLS export becomes) and does the roll-ups in memory instead of as
files. Written roll-ups (A) are the part of the original idea that hurts: every league file
repeats every bowler's phone number, and two machines rewriting them is how OneDrive conflict
copies happen. C is the "proper database" shape but makes the import a two-file transaction
and turns the global file into a hot write target. D is out: SQLite under OneDrive is a
corruption story waiting to happen, and it isn't Excel-editable.

The one thing B needs beyond your idea is a small, app-owned **ledger** so that a person keeps
the same id across seasons and so that manual merges ("J Smith" on Mondays is "John Smith" on
Thursdays) have a home. That ledger is healed on scan exactly like `meta.json`.

## Recommended design

### On-disk layout

```
/leagues/
  _members/
    members.csv               # app-owned ledger, healed on scan (ids, match keys, overrides)
  monday/
    {League Name}/
      2025-26/
        players.csv           # per-season roster: the BLS export, mapped to canonical columns
        Sign-In Sheets/       # generated output; dated, never overwritten
          2025-09-15 Week 01.docx
  _archives/{League Name}/{season}/players.csv   # still scanned, for history
```

- `players.csv` is a document like any other: it shows in the season browser, opens in Excel,
  is copied by the "previous season" workflow (a sensible starting roster) and the archive
  keeps it. The app writes it only during an import, and never over an existing file.
- `_members/` is created lazily on first import or first manual merge, not by
  `repairReservedLocations`, so roots that don't use the feature don't grow a folder.
- `Sign-In Sheets/` is a plain subfolder; the browser already expands folders in place.

### `players.csv` — canonical columns

```
member_id,first_name,last_name,email,phone,association_no,team_no,team_name,position,role,average,handicap,bls_bowler_id
```

| Column                             | Required | Notes                                                                                                                             |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `member_id`                        | no       | Written by the import once the ledger has assigned one. Hand-made files can leave it blank; those rows fall back to key matching. |
| `first_name`, `last_name`          | yes      | Kept split because BLS exports them split and sign-in sheets sort by surname.                                                     |
| `email`, `phone`                   | no       | Stored as exported. Normalised copies are computed, not stored.                                                                   |
| `association_no`                   | no       | BTBA / USBC card number when BLS has it. Best global key when present.                                                            |
| `team_no`, `team_name`, `position` | no       | Per-season facts. Drive sign-in sheet grouping.                                                                                   |
| `role`                             | no       | `bowler` (default) or `sub`.                                                                                                      |
| `average`, `handicap`              | no       | Snapshot at export time; optional on the sign-in sheet.                                                                           |
| `bls_bowler_id`                    | no       | BLS's per-league number, kept for round-tripping and debugging.                                                                   |

Rules: header row required; unknown extra columns are preserved in an `extra` map (mirrors
`LeagueMeta.extra`); rows missing both names are skipped and reported; parsing is RFC 4180
(quoted fields, embedded commas, CRLF) with a hand-written parser (~60 lines, unit-tested) so
no new dependency is needed.

### `_members/members.csv` — the ledger

```
id,first_name,last_name,email,phone,association_no,merged_into,notes,first_seen,last_seen
```

- **App-owned columns** (rewritten by the scan): `first_seen`, `last_seen`, and the contact
  columns _when blank_. The scan fills them from the most recent season the person appears
  in, "newest season wins".
- **User-owned columns** (the scan never touches): `merged_into`, `notes`, and any contact
  column the user has typed over. Overrides are detected the same way `meta.json` keeps
  `name`: the prior file's value survives unless it is empty.
- `merged_into` points at another `id`. The merged row stays (so its `id` in old `players.csv`
  files still resolves) but everything is reported under the target.
- Ids are short random tokens (`m_7f3k2q`), never sequential, so two machines importing at
  the same time cannot mint the same id. If OneDrive produces a conflict copy of the ledger,
  the worst case is a duplicate person that the user merges, not a corrupted id space.
- Written only when the serialised content differs from what was read, exactly as the scanner
  does for `meta.json`.

### Identity resolution

Each `players.csv` row is resolved to a ledger id by the first rule that matches:

1. `member_id` present and known.
2. `association_no` equal.
3. Normalised email equal (lower-case, trimmed).
4. Normalised name equal **and** last six digits of phone equal.
5. Normalised name equal and unique in the ledger.
6. Otherwise: new person, new id.

Normalised name = lower-case, diacritics stripped, punctuation and double spaces removed,
`first last`. Rule 5 is the one that can be wrong (two John Smiths); the directory view lists
"possible duplicates" (same normalised name, different ids) so the user can merge or ignore
them. Nothing is merged automatically beyond these rules.

### In-memory model

New shared module `src/shared/members.ts`:

```ts
export interface MemberRef {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  associationNo?: string
  notes?: string
}

export interface Membership {
  memberId: string
  day: Weekday
  leagueFolder: string
  leagueName: string
  season: string
  archived: boolean
  teamNo?: string
  teamName?: string
  position?: string
  role: 'bowler' | 'sub'
  average?: number
  handicap?: number
}

export interface MembersSnapshot {
  members: MemberRef[] // ledger, merged rows collapsed into their target
  memberships: Membership[] // one per players.csv row
  duplicates: string[][] // groups of ids sharing a normalised name
  problems: RosterProblem[] // unparsable rows, missing headers, with file + line
}
```

Main builds the snapshot in `src/main/lib/members.ts`:

1. Collect every `players.csv` under `{day}/{league}/{season}` and
   `_archives/{league}/{season}` (the scanner already lists both; it gains one filter).
2. Parse each file, cached by path + mtime so a rescan re-reads only what changed.
3. Read the ledger, resolve every row, assign ids, heal the ledger, write it if changed.
4. Return `MembersSnapshot`. The renderer joins from it in memory: memberships grouped by
   member give "leagues they bowl"; grouped by league + season give the roster; a text filter
   over names, emails and phones gives look-up.

The whole thing is small (dozens of leagues × a few seasons × ~40 rows), so a single snapshot
over IPC is simpler than paged queries. It stays out of `LeaguesTree` so the existing scan and
its tests are untouched; it is requested separately and re-requested on `tree:changed`.

### IPC surface (preload additions)

```ts
membersSnapshot: () => Promise<MembersSnapshot | null> // 'members:snapshot'
previewRosterImport: (sourcePath: string) => Promise<ImportPreview> // 'members:preview-import'
importRoster: (opts: {
  day: Weekday
  leagueFolder: string
  seasonName: string
  sourcePath: string
}) => Promise<{ playersPath: string; added: number; matched: number; created: number }>
// 'members:import'
mergeMembers: (fromId: string, intoId: string) => Promise<void> // 'members:merge'
generateSignInSheet: (opts: {
  day: Weekday
  leagueFolder: string
  seasonName: string
  date: string
  week: number
}) => Promise<string> // 'signin:generate'
```

All season-targeting channels validate with `resolveLiveSeasonRoot`; `sourcePath` comes from
the existing `files:pick` dialog or a drop, and is read, never moved. Analytics: capture
`roster_imported { rows, created }`, `members_merged`, `signin_generated { rows }` following
the existing `capture` calls.

### BLS import

BLS is one database per league. Its bowler/team export (CSV or tab-delimited) carries the
bowler's name, contact details, association number, team number and name, position, average
and handicap, but the exact header names vary between BLS versions and I have not seen one
from this centre. So the importer is a **column-mapping** step, not a fixed parser:

1. `previewRosterImport` reads the header row, proposes a mapping from a table of known BLS
   header spellings to the canonical columns, and returns the first few mapped rows plus any
   unmapped columns.
2. The dialog shows the preview; the user can re-point any column. The mapping is remembered
   per location (electron-store) so the second import is one click.
3. `importRoster` writes `players.csv` into the season folder with canonical headers and
   `member_id` filled from the ledger. If `players.csv` already exists it writes
   `players (2).csv` (the `importFiles` numbering) and says so; it never overwrites.

**Needed from you:** one real BLS export (any league, personal data redacted is fine). It
becomes a fixture under `src/main/lib/tests/fixtures/bls/` and the mapping table is locked
against it. Until then the mapping table is a best guess and the preview step is what makes
that safe.

BLS `.bak` backups already live in `_archives`; they are opaque and stay untouched.

### Sign-in sheet generation

The current `Sign-In Sheet.docx` is a placeholder built in `scripts/make-templates.mjs` from
raw WordprocessingML with `adm-zip`. The generator uses the same approach in main
(`src/main/lib/docx.ts`), so there is still no new dependency:

- Input: the season's memberships from the snapshot, the league display name, season, sheet
  date and week number.
- Layout: heading (league, season, date, week), then one table per team ordered by team
  number: bowler name, optional average/handicap, and a blank signature cell; subs listed
  after their team; a few blank rows per team for walk-on subs.
- Output: `{season}/Sign-In Sheets/{date} Week {NN}.docx`. Existing names get the ` (2)`
  suffix rather than being overwritten, consistent with every other write in the app.
- The bundled `Sign-In Sheet.docx` template stays as it is for leagues without a roster. A
  later step can let a customised template carry tokens (`{{league}}`, `{{season}}`, a
  repeating row) that the generator fills, so centres keep their own layout; that is a
  separate piece of work and not needed for the first version.

If Word isn't a hard requirement, the same data rendered to HTML and printed with
`webContents.printToPDF` is an even smaller implementation; the docx route is proposed
because every other document in the tree is a docx and secretaries edit them.

### UI surfaces

- **Home → Members tab** (alongside Shared documents and Templates): the global directory.
  Columns: name, email, phone, leagues (badges, one per current membership), last seen. Row
  menu: copy email, show possible duplicates, merge into… Filter box reuses the season
  filter styling.
- **League → season row**: an item count already exists; add a "Roster · 24" badge when
  `players.csv` is present.
- **Season root toolbar** (next to _Sync with templates_): _Import roster…_ (opens the
  mapping dialog on a picked or dropped file) and _Generate sign-in sheet…_ (date defaults
  to the next league night computed from the weekday, week number defaults to the count of
  sheets already in `Sign-In Sheets/` plus one). Both disabled in archives, same as sync.
- Dropping a `.csv` onto a season root offers "Import as roster" instead of plain copy; any
  other file keeps the current copy-in behaviour.

## Privacy

`_members/members.csv` and every `players.csv` hold personal data in a shared OneDrive folder.
Two small things worth doing from the start: leave `_members` out of archive zips unless the
user ticks it, and don't send member fields to analytics or Sentry (the snapshot never leaves
main except over IPC; `capture` calls only carry counts).

## Phased delivery

1. **Read side.** `src/shared/members.ts`, CSV parser, `players.csv` discovery in the
   scanner, ledger healing, `members:snapshot`, Members tab and the roster badge. Tests: parser
   edge cases, resolution rules 1–6, ledger healing preserves user columns and ids, snapshot
   caching by mtime, scanner unaffected when no CSVs exist.
2. **Import.** Preview + mapping dialog, `members:import`, remembered mapping, BLS fixture.
   Tests: mapping against the fixture, never-overwrite numbering, ids back-filled.
3. **Sign-in sheet.** `docx.ts`, `signin:generate`, the season toolbar action, "previous
   season" copying `players.csv` verified. Tests: unzip the output and assert names, team
   order and file naming.
4. **Later, if wanted.** Merge UI polish, token-based custom templates, editing a member
   in-app (today: edit `members.csv` in Excel and rescan).

Phase 1 is useful on its own: a hand-made `players.csv` in a season folder immediately shows
up in the directory.

## Open questions

- Which BLS version and export screen do you use? One sample file settles the mapping.
- Is the association number (BTBA) recorded in BLS for your leagues? It decides how much the
  matcher can rely on rule 2 versus the name-based rules.
- What does the current paper sign-in sheet look like: per team, per lane, averages shown,
  space for subs? A photo of one is enough to pin down the generated layout.
- Should subs be tracked as members at all, or only named on the sheet?
