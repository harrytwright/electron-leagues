# App version and updates

The status bar shows the installed version immediately before the optional diagnostics.
The version comes from Electron's `app.getVersion()`, which reads the app's packaged
version. Development builds show the version too.

Packaged apps check the existing GitHub release feed on launch and every four hours.
`electron-updater` downloads updates in the background and installs them on app quit.
Linux checks run only inside an AppImage. Development builds never check or download.

The tag adds **Ready to install** only after `update-downloaded` fires. Its tooltip
names the downloaded version and explains how to apply it by quitting and reopening
the app. The installed version remains visible until the updated app launches.
Checks stop once an update is ready. Failed checks and downloads are logged and can
retry at the next scheduled check. Errors while preparing a downloaded update clear
the ready indicator so the tag never keeps offering a failed update.

The main process retains the latest status. A typed IPC request supplies the initial
renderer snapshot and a preload subscription forwards subsequent changes into the
React Query cache. Incoming changes cancel pending snapshot requests so an older
response cannot hide a ready update. Remounting the tag requests a fresh snapshot.

Releases include a macOS ZIP alongside the signed, notarised DMG because
[the macOS updater requires the ZIP payload](https://www.electron.build/v26/docs/features/auto-update/).
The existing release workflow publishes the feed only after all platform builds
succeed. Checking a signed, installed release against a later published release is
still required to verify the complete download and installation path.
