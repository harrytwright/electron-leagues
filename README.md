# GoBowling Leagues

GoBowling Leagues is a desktop organiser for bowling league documents stored in a OneDrive folder. The folder tree is the source of truth: the app scans it, adopts folders you create by hand, opens documents in their default program, generates new season folders and archives old seasons. It never overwrites an existing document. Template and import workflows only add new copies, and the only files the app owns are `meta.json` and the archive zips you request.

## Help

The user guide lives in `resources/docs` as markdown topics and ships inside the app as the help
window. Open it from the Help menu, with ⌘? on macOS or F1 on Windows and Linux, or from the
**Learn more** links beside the season naming rules and the location picker. Each topic carries
frontmatter with a `status` of `draft` or `verified`; drafts are hidden in packaged builds and shown
with a badge during development. See [docs/help.md](docs/help.md) for the loader contract.

## Development

Install dependencies, then run the app or the checks:

```bash
npm install
npm run dev        # run the app with HMR
npm test           # vitest unit suite (scanner, season names, meta heal, operations)
npm run typecheck
npm run lint
```

On macOS, using `npm run dev` with a OneDrive-synced leagues folder requires folder access for your terminal app under System Settings, Privacy & Security, Files and Folders. Without it, reads fail with `EPERM`.

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
