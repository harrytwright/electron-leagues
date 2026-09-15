# GoBowling Leagues

GoBowling Leagues is a desktop organiser for bowling league documents stored in a OneDrive folder. The folder tree is the source of truth: the app scans it, adopts folders you create by hand, opens documents in their default program, generates new season folders and archives old seasons. It never overwrites an existing document. Template and import workflows only add new copies, and the only files the app owns are `meta.json` and the archive zips you request.

## Folder layout

The leagues folder follows a fixed layout, and the app treats anything outside it as a plain browsable folder:

```text
/leagues/
  _templates/                        # season templates, copied into new seasons
  _shared/                           # general documents for every league
  _archives/{League Name}/{season}/  # archived seasons (plain folders); BLS backups live here
  monday/ … sunday/                  # league nights (lowercase on disk)
    {League Name}/
      meta.json                      # app-owned and auto-healed: the scan always wins
      2025-26/                       # seasons: 2025-26, 2025, or 2026-Q1
        Rules.docx, Sign-In Sheet.docx, …
```

Season folders use one of three names: cross-year `2025-26`, full-year `2025` or quarter `2026-Q1`. The app shows any folder that doesn't match as a plain browsable folder and never guesses at it.

Each league keeps two live seasons, the active one and the previous one. A template-based season copies every visible, direct file in `_templates`. A previous-season copy takes the previous season's direct files first, then fills missing names from templates, so previous filenames always win. Start empty copies nothing. Every copy is a snapshot, not a live link.

The wizard's pre-ticked archive option moves the oldest live season into `_archives`, where you can zip seasons on demand.

Scans may update app-owned `meta.json` files, but they never create reserved folders, copy bundled templates or touch your documents. **New location…** creates `_templates`, `_shared` and `_archives` and seeds the bundled `Rules.docx` and `Sign-In Sheet.docx` where they are missing. **Repair location…** does the same on demand. Both leave edited defaults and custom templates alone, and neither recreates the selected root itself if it has moved or become unavailable.

## Using the app

The startup panel opens existing leagues folders (“locations”), creates new ones or returns you to a recent location. After startup, **Home** in the title bar returns you to shared documents and templates. Use the location switcher beside it to change, create or reveal locations.

Home is a single-pane browser with **Shared documents**, **Templates** and, when needed, **Other items** tabs. Changing tabs starts again at that tab's root. The sidebar holds the Leagues list grouped under collapsible days.

A league opens as a file browser: seasons at the top, newest first with their status, then any other files and the Archive folder. The league, archive and season panes share a desktop-style file browser: click to select and double-click to open, with breadcrumbs leading back. The league overview adds season status badges, item counts and a filter for the current folder.

Within a season, disclosure arrows expand folders in place and column headings sort each folder's contents. The season filter searches loaded folders and keeps matching files' parents visible. Drop files into league roots, Shared documents, Templates or live season views to copy them in. The app remembers your last-opened league and collapsed days per location.

Right-click a row to open the same actions shown in its `…` menu: browse folders, open documents in their default app, or reveal items in Finder or Explorer. Deleting a league or season asks you to type its name, then moves the whole folder, including unmanaged files, to the OS trash. The same menus zip archived seasons.

On macOS, use ⇧⌘O to open a location, ⌘R to refresh and ⌘F to focus the filter. On Windows, use Ctrl+Shift+O, Ctrl+R and Ctrl+F. In file lists, press Enter to open the selected item and use the arrow keys to move between rows.

The status bar shows the current path and any pending activity. Completion toasts report whether an action succeeded or failed.

At the root of any live season, **Sync with templates** adds only the template filenames that are missing. It never creates numbered duplicates, and archives and subfolders don't offer it.

## Development

Install dependencies, then run the app or the checks:

```bash
npm install
npm run dev        # run the app with HMR
npm test           # vitest unit suite (scanner, season names, meta heal, operations)
npm run typecheck
npm run lint
```

Two environment variables change how the app runs:

- `LEAGUES_ROOT=/path/to/fixture`: override the stored leagues folder for development and testing
- `LEAGUES_POSTHOG_KEY=phc_your_project_key`: enable PostHog analytics; without it analytics are a no-op

`scripts/make-templates.mjs path/to/output_dir` regenerates the bundled seed templates in `resources/templates/`.

## Building installers

Each platform has its own build script:

```bash
npm run build:mac     # DMG, arm64, signed and notarised (needs the env vars below)
npm run build:win     # NSIS installer (unsigned)
npm run build:linux   # AppImage
```

- **macOS**: the build signs with the Developer ID in `CSC_LINK` and `CSC_KEY_PASSWORD`, then notarises through the App Store Connect API key (`APPLE_API_KEY` pointing at the `.p8` file, plus `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`). Without them the build fails rather than silently producing an unsigned app, because an unsigned app cannot auto-update on macOS.
- **Windows**: the installer is unsigned, so SmartScreen warns on first run. Click **More info**, then **Run anyway**.

## Continuous integration

`.github/workflows/checks.yml` holds the check suite: lint and typecheck on Linux, plus the vitest matrix across Linux, macOS and Windows. Both `ci.yml` and `release.yml` call it, so the gate lives in one place. `ci.yml` runs it on pull requests targeting `main` and on pushes to `main`.

## Releasing

One script tags a release from `main`:

```bash
npm run release -- patch    # or minor, major, or an explicit x.y.z
```

The script refuses to tag from anywhere but `main`, refuses if your `main` is behind `origin/main`, then runs `npm version` and pushes the commit and tag. Wait for `main` to go green before running it.

Pushing a `v*.*.*` tag triggers `release.yml`, which runs four jobs in order:

1. **verify**: the tag must match `package.json` and every required secret must be present, so a bad tag stops the run before it uses any build minutes.
2. **checks**: the full suite again, because the version-bump commit itself was never in the run you watched go green.
3. **build**: Linux, macOS and Windows in parallel, each publishing into the same draft GitHub Release.
4. **promote**: flips the draft live once all three succeed, so the update feed and the installers it points at always appear together.

The workflow needs six repository Actions secrets:

| Secret              | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `SENTRY_AUTH_TOKEN` | Sourcemap upload for readable stack traces |
| `CSC_LINK`          | Base64 of the Developer ID `.p12`          |
| `CSC_KEY_PASSWORD`  | Password for that `.p12`                   |
| `APPLE_API_KEY`     | Base64 of the App Store Connect `.p8`      |
| `APPLE_API_KEY_ID`  | Key ID for that key                        |
| `APPLE_API_ISSUER`  | Issuer ID from App Store Connect           |

If a release fails after the tag exists, delete the tag, fix the problem and tag again:

```bash
git tag -d v1.2.3
git push --delete origin v1.2.3
```

**verify** only catches missing secrets, not invalid ones. An expired certificate surfaces as a failed macOS leg.
