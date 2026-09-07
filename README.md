# GoBowling Leagues

Desktop organiser for bowling league documents stored in a OneDrive folder. The folder tree is
the source of truth — the app scans it (adopting folders you create by hand), opens documents in
their default program, generates new season folders, and archives old seasons. Existing documents
are never overwritten: template and import workflows only add new copies (`meta.json` and requested
archive zips are app-owned output).

## Folder layout

```
/leagues/
  _templates/                        # season templates, copied into new seasons
  _shared/                           # general documents for every league
  _archives/{League Name}/{season}/  # archived seasons (plain folders); BLS backups live here
  monday/ … sunday/                  # league nights (lowercase on disk)
    {League Name}/
      meta.json                      # app-owned, auto-healed — the scan always wins
      2025-26/                       # seasons: 2025-26, 2025, or 2026-Q1
        Rules.docx, Sign-In Sheet.docx, …
```

Season naming: cross-year `2025-26`, full-year `2025`, quarter `2026-Q1`. Any folder that
doesn't match is shown as a plain browsable folder, never guessed at.

Season lifecycle: two live seasons per league (active + previous). A template-based season copies
every visible, direct file in `_templates`. A previous-season copy takes the previous season's
direct files first, then fills missing names from templates; previous filenames always win. Start
empty copies nothing. These are snapshots, not live links. The pre-ticked wizard option moves the
oldest live season into `_archives`, where seasons can be zipped on demand.

Scans may update app-owned `meta.json` files, but never create reserved folders, copy bundled
templates, or touch user documents. **New location…** creates `_templates`, `_shared`, and
`_archives` and seeds missing bundled `Rules.docx` and `Sign-In Sheet.docx`; **Repair location…**
does the same on demand. Edited defaults and custom templates are left alone, and the selected root
itself is never recreated if it has moved or become unavailable.

## Using the app

The window title bar contains **Home** and the location switcher, which changes between leagues
folders ("locations"), creates a new one, or reveals the current one. Home is a single-pane browser
with Shared documents, Templates, and (when needed) Other items tabs; changing tabs starts again at
that tab's root. The current folder appears in the status bar. The sidebar holds the Leagues list
grouped under collapsible days.
A league opens as a file browser: seasons at the top (newest first, with their status), then any
other files and the Archive folder. The league, archive and season panes share a desktop-style
file browser: click to select, double-click or press Enter to open, and use the arrow keys to move
between rows. Breadcrumbs lead back. The league overview includes season status badges and item
counts, with a filter for the current folder. Within a season, disclosure arrows expand folders
in place and column headings sort each folder's contents. The season filter searches loaded
folders and keeps matching files' parents visible. Each row's `…` menu reveals it in the file manager,
zips archived seasons, or deletes a league or season — deletion asks you to type the name and
moves the folder (including files the app doesn't manage) to the OS trash. Drop files onto any
folder view to copy them in. Your last-opened league and collapsed days are remembered per
location.

At the root of any live season, **Sync with templates** adds only template filenames that are
missing. It never creates numbered duplicates and is unavailable in archives or subfolders.

## Development

```bash
npm install
npm run dev        # run the app with HMR
npm test           # vitest unit suite (scanner, season names, meta heal, operations)
npm run typecheck
npm run lint
```

Useful env vars:

- `LEAGUES_ROOT=/path/to/fixture` — override the stored leagues folder (dev/testing).
- `LEAGUES_POSTHOG_KEY=phc_…` — enable PostHog analytics; without it analytics are a no-op.

`scripts/make-templates.mjs <outDir>` regenerates the bundled seed templates in
`resources/templates/`.

## Building installers

```bash
npm run build:mac   # DMG (set notarize: true in electron-builder.yml + env vars below)
npm run build:win   # NSIS installer (unsigned)
```

- **macOS notarisation**: export `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
  and flip `mac.notarize` to `true` in `electron-builder.yml`.
- **Windows**: the installer is unsigned — SmartScreen will warn on first run. Click
  **More info → Run anyway**.

Releases publish to GitHub Releases (`publish.provider: github`).
