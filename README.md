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
npm run build:mac     # DMG, arm64, signed + notarised (needs the env vars below)
npm run build:win     # NSIS installer (unsigned)
npm run build:linux   # AppImage
```

- **macOS**: builds are signed with the Developer ID in `CSC_LINK` /
  `CSC_KEY_PASSWORD` and notarised via the App Store Connect API key
  (`APPLE_API_KEY` pointing at the `.p8` file, plus `APPLE_API_KEY_ID` and
  `APPLE_API_ISSUER`). Without them the build fails rather than silently
  producing an unsigned app — an unsigned app cannot auto-update on macOS.
- **Windows**: the installer is unsigned — SmartScreen will warn on first run.
  Click **More info → Run anyway**.

## CI

`.github/workflows/checks.yml` holds the check suite — lint and typecheck on
Linux, the vitest matrix across Linux, macOS and Windows — and is called by both
of the other workflows so the gate is defined once. `ci.yml` runs it on pull
requests targeting `main` and on pushes to `main`.

## Releasing

```bash
npm run release -- patch    # or minor, major, or an explicit x.y.z
```

The script refuses to tag from anywhere but `main`, refuses if your `main` is
behind `origin/main`, then runs `npm version` and pushes the commit and tag.
Wait for `main` to go green before running it.

Pushing a `v*.*.*` tag triggers `release.yml`:

1. **verify** — the tag must match `package.json` and every required secret must
   be present. Fails here before any build minutes are spent.
2. **checks** — the full suite again, because the version-bump commit itself was
   never in the run you watched go green.
3. **build** — Linux, macOS and Windows in parallel, each publishing into the
   same _draft_ GitHub Release.
4. **promote** — flips the draft live once all three succeed, so the update feed
   and the installers it points at always appear together.

Repository Actions secrets, all six required:

| Secret              | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `SENTRY_AUTH_TOKEN` | Sourcemap upload for readable stack traces |
| `CSC_LINK`          | Base64 of the Developer ID `.p12`          |
| `CSC_KEY_PASSWORD`  | Password for that `.p12`                   |
| `APPLE_API_KEY`     | Base64 of the App Store Connect `.p8`      |
| `APPLE_API_KEY_ID`  | Key ID for that key                        |
| `APPLE_API_ISSUER`  | Issuer ID from App Store Connect           |

If a release fails after the tag exists, delete it (`git tag -d vX.Y.Z` and
`git push --delete origin vX.Y.Z`), fix, and tag again. Note that **verify**
only catches missing secrets, not invalid ones — an expired certificate surfaces
as a failed macOS leg.
