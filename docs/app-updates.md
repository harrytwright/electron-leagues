# App version and updates

The status bar shows the installed version as plain secondary text immediately before the
optional diagnostics. The version comes from Electron's `app.getVersion()`, which reads the
app's packaged version. Development builds show the version too.

## Update phase

The main process owns one `AppUpdateStatus`: the installed `version` and an `update` phase.

| Phase         | Meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| `idle`        | Nothing in progress. Also the state after a failure or no update.  |
| `checking`    | A check is running.                                                |
| `downloading` | An update was found. `percent` is null until progress is reported. |
| `ready`       | `update-downloaded` fired. The update installs on restart or quit. |

Transitions: a check start emits `checking`. `checkForUpdates` reporting an update emits
`downloading`, and no update emits `idle`. `update-downloaded` emits `ready`. Any updater
error or failed check or download is logged and returns the phase to `idle`, so nothing
keeps offering an update that failed to prepare. The scheduled check retries later.

Packaged apps check the existing GitHub release feed on launch and every four hours, and
`electron-updater` downloads updates in the background. Checks stop once an update is
ready. Linux checks run only inside an AppImage. Development builds never check or download.

## Progress

`download-progress` events arrive many times a second. The main process floors the percent
and calls `onChange` only when the whole number changes, so the renderer sees at most 100
progress updates per download. Progress is ignored outside the `downloading` phase.

The status bar shows `Downloading v0.5.0… 42%` (no percent while null) only after the phase
has been `downloading` for one second without a break. Fast downloads never flash the text.
The delay is the `useDelayedFlag` hook and restarts on each new download. The `ready` phase
shows only the installed version because the toast carries the call to action.

## Menu

The item sits under the app menu after About on macOS and at the end of Help elsewhere. It
is omitted in development and unsupported builds. Its label follows the phase and the
application menu is rebuilt when the phase kind changes, never on percent ticks.

| Phase         | Label                 | Enabled | Click               |
| ------------- | --------------------- | ------- | ------------------- |
| `idle`        | Check for updates…    | yes     | Runs a check        |
| `checking`    | Checking for updates… | no      |                     |
| `downloading` | Downloading update…   | no      |                     |
| `ready`       | Restart to update     | yes     | Installs the update |

Rebuilding reads the live diagnostics checkbox first, so its state survives. A manual check
shares the scheduled check's in-flight promise and resolves once the result is known, never
after the download. Native dialogs cover `up-to-date`, `failed` and `unavailable` only. When
an update is found or already ready there is no dialog: the status bar and toast take over.

## Restart toast

`UpdateReadyToast` is mounted once inside the operation feedback provider. When the phase
becomes `ready` for a version not yet toasted this session it shows a persistent toast:
**Update ready**, with **Restart now** and **Later**. **Later** dismisses it. The toast is
removed if the update stops being ready and is never repeated for the same version.

**Restart now** is disabled, with the reason in the description, while a file operation is
running (`useOperationFeedback().activity`). This is a deliberate cheap guard in place of a
full lock on the operation.

## Restart flow and `before-quit`

The renderer calls `window.api.installAppUpdate()` (typed IPC `app:install-update`) and the
menu item calls the same path. `installUpdate()` in `src/main/index.ts`:

1. Does nothing unless the phase is `ready`, and ignores repeat requests until the phase
   changes.
2. Awaits `flushBeforeQuit()`: close the root watcher, shut down analytics and clear card
   sheets. The promise is shared, so a concurrent quit waits for the same flush.
3. The flush marks itself done. The `before-quit` handler then returns without calling
   `preventDefault`.
4. Calls `autoUpdater.quitAndInstall()` through `AppUpdates.install()`, which refuses
   unless the phase is `ready`.

The order matters because `before-quit` defers the first quit while flushing. On Windows
(NSIS) `quitAndInstall` spawns the installer and then calls `app.quit()`. On macOS
(Squirrel) it hands off to Electron's native updater, which quits the app itself. If the
flush had not run first, the deferred quit would leave the app running after the installer
or Squirrel had started. Flushing first means the quit that follows goes straight through.

If installing fails after the flush, the watcher and analytics are already shut down, so
the app cannot carry on as normal. It shows an error dialog and quits; reopening the app
retries the update.

Releases include a macOS ZIP alongside the signed, notarised DMG because
[the macOS updater requires the ZIP payload](https://www.electron.build/v26/docs/features/auto-update/).
The existing release workflow publishes the feed only after all platform builds
succeed. Checking a signed, installed release against a later published release is
still required to verify the complete download and installation path.

## Renderer state

A typed IPC request supplies the initial snapshot and a preload subscription forwards
changes into the React Query cache. Incoming changes cancel pending snapshot requests so an
older response cannot hide a newer phase. Remounting requests a fresh snapshot.
