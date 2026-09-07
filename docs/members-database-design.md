# League members database — design

Status: proposal, not implemented. Baseline: branch `claude/league-members-database-3jt90g`
at `321fd9f` (Polish desktop task dialogs and location toolbar).

## Goal

Make this app the centre's **membership system**: a register of everyone who bowls here (name,
email, phone, member number, status) together with which leagues, seasons and teams they bowl
in. Populate it in bulk from BLS (Bowling League Secretary) exports rather than by hand. Use it
to generate the season's sign-in sheet instead of the blank `Sign-In Sheet.docx` template, and
later to issue member ID cards and link members to the POS so visits and purchases can be
tracked against a member.

Two systems, two jobs:

|            | BLS + MBD                                                                                                               | This app                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owns       | Scoring: averages, handicaps, standings, and the shared bowler list that ties a bowler's scores together across leagues | Membership: who the member is to the centre, their number and card, status, contact preferences, which leagues and teams they are in, documents and sign-in sheets, the POS link |
| Data flows | Out, as per-league exports                                                                                              | In, by bulk import; onwards to cards and the POS                                                                                                                                 |
| Key        | MBD ID                                                                                                                  | Member number, with the MBD ID kept as the link back to scoring                                                                                                                  |

The exports are the feed from scoring to membership. Nothing flows the other way: the app never
writes to BLS or the MBD.

Three questions any design has to answer:

1. **Where does the data live?** The app's whole model is "the OneDrive folder tree is the
   source of truth; the app scans it and only adds files". Members data has to fit that.
2. **What is the unit of truth?** BLS has one database per league, so an export is naturally
   _per league per season_. But a person bowls in several leagues, so the _directory_ is global.
3. **How do we recognise the same person across exports?** BLS bowler numbers are per league.
   The Master Bowler Database (MBD) gives linked leagues a shared **MBD ID**; that is the key
   to lean on where it exists, with fallbacks for leagues and rosters that don't carry one.

## Where the data comes from: BLS and the MBD

BLS keeps one database per league. CDE's Master Bowler Database (MBD) sits beside it as a
centre-wide bowler directory: each league is linked to it (BLS → _File → Program Preferences →
Master Bowler Database_, then per league _Database → Linked to the Master Bowler Database_),
bowlers are added to a league from the MBD rather than retyped, and each bowler carries an
**MBD ID** that is the same in every linked league. Keeping bowlers in step across leagues is
manual work in the MBD, but once done the ID is the one reliable cross-league key BLS offers.

Two exports are possible: **per league** (that league's bowlers, with their MBD IDs) and
**all bowlers** (the whole MBD). This design uses the per-league export only. It is the
unit that maps onto a season folder, it carries the team and position facts the sign-in
sheet needs, and it keeps the app from ever holding a copy of the MBD it then has to keep in
sync. The all-bowlers export is not needed; if it were ever wanted it would only be a way to
refresh contact details in the ledger, never a roster.

What this means for the design:

- The MBD is the master for a bowler's _scoring_ identity: the MBD ID is what ties a person's
  scores together across leagues, and it is the key this app matches exports on. This app is
  the master for _membership_: the member number, card, status and the contact details as the
  centre knows them. Exports seed and refresh contact details; a value the user has corrected
  in the register wins over any later export.
- The register mints its own member numbers rather than reusing the MBD ID, because the
  number goes on a card and into the POS, a member can exist before they bowl in a linked
  league (or without ever bowling in one), and re-keying a directory later is worse than
  carrying two columns.
- Column names in the export are unverified: CDE's site and knowledge base are not reachable
  from where this was written. The import is designed as a column-mapping step for that
  reason, and one real per-league export pins it down.

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
member_id,mbd_id,first_name,last_name,email,phone,association_no,team_no,team_name,position,role,average,handicap,bls_bowler_id
```

| Column                             | Required | Notes                                                                                                                             |
| ---------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `member_id`                        | no       | Written by the import once the ledger has assigned one. Hand-made files can leave it blank; those rows fall back to key matching. |
| `mbd_id`                           | no       | The Master Bowler Database ID from a linked league's export. Same person, same value, in every linked league.                     |
| `first_name`, `last_name`          | yes      | Kept split because BLS exports them split and sign-in sheets sort by surname.                                                     |
| `email`, `phone`                   | no       | Stored as exported. Normalised copies are computed, not stored.                                                                   |
| `association_no`                   | no       | BTBA / USBC card number when BLS has it. Second-best global key after `mbd_id`.                                                   |
| `team_no`, `team_name`, `position` | no       | Per-season facts. Drive sign-in sheet grouping.                                                                                   |
| `role`                             | no       | `bowler` (default) or `sub`.                                                                                                      |
| `average`, `handicap`              | no       | Snapshot at export time; optional on the sign-in sheet.                                                                           |
| `bls_bowler_id`                    | no       | BLS's per-league number, kept for round-tripping and debugging.                                                                   |

Rules: header row required; unknown extra columns are preserved in an `extra` map (mirrors
`LeagueMeta.extra`); rows missing both names are skipped and reported; parsing is RFC 4180
(quoted fields, embedded commas, CRLF) with a hand-written parser (~60 lines, unit-tested) so
no new dependency is needed.

### `_members/members.csv` — the membership register

This is the file the app owns and the one the rest of the design hangs off. "Ledger" elsewhere
in this doc means this file.

```
id,mbd_id,first_name,last_name,email,phone,association_no,status,joined,card_issued,consent_marketing,merged_into,notes,first_seen,last_seen
```

- **`id` is the member number.** Six digits, random within 100000–999999 and checked against
  the register when minted, never sequential: two machines importing at the same time must
  not hand out the same number, and a sequential scheme can't promise that. Six digits is
  short enough to read out at the desk and to type into a POS, and encodes cleanly in a Code
  128 barcode or a QR code for the card. A number is never reused, even after a merge.
- **App-owned columns** (rewritten by the scan): `first_seen`, `last_seen`, `mbd_id` _when
  blank_, and the contact columns _when blank_. The scan fills them from the person's rosters
  with this precedence: a row that carries an `mbd_id` beats one that doesn't (a linked
  league's export reflects the MBD), then newest season wins.
- **User-owned columns** (the scan never touches): `status`, `joined`, `card_issued`,
  `consent_marketing`, `merged_into`, `notes`, and any contact column the user has typed over.
  Overrides are detected the same way `meta.json` keeps `name`: the prior file's value survives
  unless it is empty. `status` is `active` or `lapsed`; the scan proposes `lapsed` in the
  duplicates/problems list when someone hasn't appeared in a live season for a full season,
  but never sets it.
- `merged_into` points at another `id`. The merged row stays (so its number in old
  `players.csv` files, and on an old card, still resolves) but everything is reported under
  the target.
- If OneDrive produces a conflict copy of the register, the worst case is a duplicate person
  that the user merges, not a corrupted number space.
- Written only when the serialised content differs from what was read, exactly as the scanner
  does for `meta.json`.

### Identity resolution

Each `players.csv` row is resolved to a ledger id by the first rule that matches:

1. `member_id` present and known.
2. `mbd_id` equal.
3. `association_no` equal.
4. Normalised email equal (lower-case, trimmed).
5. Normalised name equal **and** last six digits of phone equal.
6. Normalised name equal and unique in the ledger, **and** neither side has a conflicting
   `mbd_id`.
7. Otherwise: new person, new id.

Normalised name = lower-case, diacritics stripped, punctuation and double spaces removed,
`first last`. Rule 6 is the one that can be wrong (two John Smiths); the directory view lists
"possible duplicates" (same normalised name, different ids) so the user can merge or ignore
them. Two ledger rows with _different_ `mbd_id` values are never proposed as duplicates: the
MBD says they are different people. A row whose `mbd_id` matches a ledger entry but whose
name differs is still matched (rule 2), and reported, because that is usually a rename or a
typo fixed in the MBD rather than a different person. Nothing is merged automatically beyond
these rules.

### In-memory model

New shared module `src/shared/members.ts`:

```ts
export interface MemberRef {
  id: string // member number
  mbdId?: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  associationNo?: string
  status: 'active' | 'lapsed'
  joined?: string
  cardIssued?: string
  consentMarketing: boolean
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

The per-league export (CSV or tab-delimited) carries the bowler's MBD ID, name, contact
details, association number, team number and name, position, average and handicap, but the
exact header names vary between BLS versions and CDE's documentation could not be checked
from here. So the importer is a **column-mapping** step, not a fixed parser:

1. `previewRosterImport` reads the header row, proposes a mapping from a table of known BLS
   header spellings to the canonical columns, and returns the first few mapped rows plus any
   unmapped columns.
2. The dialog shows the preview; the user can re-point any column. The mapping is remembered
   per location (electron-store) so the second import is one click.
3. `importRoster` writes `players.csv` into the season folder with canonical headers and
   `member_id` filled from the ledger. If `players.csv` already exists it writes
   `players (2).csv` (the `importFiles` numbering) and says so; it never overwrites.

The preview flags an export with no recognisable MBD ID column, since that usually means the
league isn't linked yet; the import still goes ahead and those rows use the fallback rules.

**Needed from you:** one real per-league export from an MBD-linked league (personal data
redacted is fine). It becomes a fixture under `src/main/lib/tests/fixtures/bls/` and the
mapping table, including the MBD ID header, is locked against it. Until then the mapping
table is a best guess and the preview step is what makes that safe.

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

- **Home → Members tab** (alongside Shared documents and Templates): the register. Columns:
  member number, name, email, phone, status, leagues (badges, one per current membership),
  last seen. Row menu: copy email, show possible duplicates, merge into…, print card. Filter
  box reuses the season filter styling and matches on number as well as name, so a scanned
  or typed card number finds the member.
- **League → season row**: an item count already exists; add a "Roster · 24" badge when
  `players.csv` is present.
- **Season root toolbar** (next to _Sync with templates_): _Import roster…_ (opens the
  mapping dialog on a picked or dropped file) and _Generate sign-in sheet…_ (date defaults
  to the next league night computed from the weekday, week number defaults to the count of
  sheets already in `Sign-In Sheets/` plus one). Both disabled in archives, same as sync.
- Dropping a `.csv` onto a season root offers "Import as roster" instead of plain copy; any
  other file keeps the current copy-in behaviour.

### Member cards

A card is a print job from the register: name, member number, the centre's name, and the
number as a barcode. Rendered as HTML and printed with Electron's `webContents.printToPDF`
onto a card-sheet layout, so there is no document to keep and nothing new in the folder tree
beyond an optional PDF the user chooses to save. Code 128 is a small enough encoder to write
and test in-repo (bars as SVG rects); QR would mean one small dependency. Printing a card sets
`card_issued` on the member. Which of barcode or QR depends on what the POS scanner reads,
which is one of the open questions.

### The POS link

The app is a desktop file organiser; it is not online and has no server, and the register is
a CSV in OneDrive. A POS can't query that live, and it shouldn't have to. The realistic shape
is the same one the BLS side uses: **exchange files keyed on the member number.**

1. **Out: members → POS customers.** An export from the register in whatever customer-import
   format the POS takes (most take CSV), with the member number as the customer reference.
   Re-exporting is idempotent on that reference. The POS becomes the place where a card is
   scanned and a sale is recorded against a member.
2. **In: POS sales → the app.** A POS sales-by-customer report imported the same way a BLS
   roster is: dropped on the app, mapped once, and joined to the register on member number.
   That gives visits, spend and last-seen per member for reports, without the app storing
   every transaction.

Only if the POS has to look up a member against _our_ data rather than its own customer list
does the app need a live service and a real database. If that day comes, the register becomes
the import/export format of that database and the member numbers carry over unchanged; nothing
in this design has to be re-keyed. The decisions that keep that door open are made now: stable
random member numbers, the MBD ID kept as a separate column, no personal data in analytics,
and a `schemaVersion`-style header comment on the register so a migrator can tell what it is
reading.

Transaction-level data stays in the POS. The app only ever holds per-member roll-ups from the
imported reports, and those live in memory from the imported file, not in a growing CSV.

## Privacy

`_members/members.csv` and every `players.csv` hold personal data in a shared OneDrive folder,
and the POS link adds behavioural data on top. Things worth doing from the start: leave
`_members` out of archive zips unless the user ticks it; don't send member fields to analytics
or Sentry (the snapshot never leaves main except over IPC; `capture` calls only carry counts);
keep `consent_marketing` in the register so a mailing export can filter on it; and keep
purchase history in the POS rather than copying it into the folder tree.

## Phased delivery

1. **Read side.** `src/shared/members.ts`, CSV parser, `players.csv` discovery in the
   scanner, ledger healing, `members:snapshot`, Members tab and the roster badge. Tests: parser
   edge cases, resolution rules 1–7, ledger healing preserves user columns and ids, snapshot
   caching by mtime, scanner unaffected when no CSVs exist.
2. **Import.** Preview + mapping dialog, `members:import`, remembered mapping, BLS fixture.
   Tests: mapping against the fixture, never-overwrite numbering, ids back-filled.
3. **Sign-in sheet.** `docx.ts`, `signin:generate`, the season toolbar action, "previous
   season" copying `players.csv` verified. Tests: unzip the output and assert names, team
   order and file naming.
4. **Membership management.** Status, joined and consent columns in the UI, edit a member
   in-app (until then: edit `members.csv` in Excel and rescan), lapsed-member proposals,
   mailing export filtered on consent.
5. **Cards.** Card print layout, barcode encoder, `card_issued`.
6. **POS.** Customer export in the POS's format, sales-report import and per-member roll-ups
   in the Members tab. Format work waits on knowing the POS.
7. **Later, if wanted.** Merge UI polish, token-based custom sign-in templates.

Phase 1 is useful on its own: a hand-made `players.csv` in a season folder immediately shows
up in the directory.

## Open questions

- Which BLS version and export screen do you use? One per-league sample settles the mapping
  and the MBD ID header name.
- Are all leagues linked to the MBD, or only some? Unlinked leagues are where the fallback
  rules and the duplicates list will actually be exercised.
- Is the association number (BTBA) recorded in BLS for your leagues? It is the second key for
  bowlers in unlinked leagues.
- What does the current paper sign-in sheet look like: per team, per lane, averages shown,
  space for subs? A photo of one is enough to pin down the generated layout.
- Should subs be tracked as members at all, or only named on the sheet?
- Which POS, and what do its customer import and sales-by-customer report look like? That
  decides the two file formats in phase 6 and whether the card needs a barcode or a QR.
- Will there be members who never bowl in a league (casual members, juniors, social)? If so
  the register needs an "add member" path that doesn't start from a roster import; the
  design allows it, phase 4 would include it.
- What goes on the card besides name and number: photo, expiry, centre logo?
