# GoBowling Leagues

Desktop organiser for bowling league documents stored in a OneDrive folder. The folder tree is
the source of truth — the app scans it (adopting folders you create by hand), opens documents in
their default program, generates new season folders, and archives old seasons. It never modifies
your documents; it only writes its own files (`meta.json`, zips).

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

Season lifecycle: two live seasons per league (active + previous). Creating a new season copies
starting documents from `_templates` or the previous season, and (pre-ticked in the wizard)
moves the oldest live season into `_archives`. Archived seasons can be zipped on demand from
the league's Archive section.

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
