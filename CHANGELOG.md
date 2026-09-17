## [0.2.4](https://github.com/harrytwright/electron-leagues/compare/v0.2.3...v0.2.4) (2026-09-17)

### Features

- Explain permission-denied folder access ([e12617f](https://github.com/harrytwright/electron-leagues/commit/e12617f8b120e1500823cf8aabf33fd962aa6a73))
- Rename leagues from the league menu ([826d78a](https://github.com/harrytwright/electron-leagues/commit/826d78ad07de6a82b85af4882e6cf0e2199b7c5e))
- Show app version and update readiness ([dde7c73](https://github.com/harrytwright/electron-leagues/commit/dde7c73c674c6d9fdb616347c51f35ffa95ca6e8))

## [0.2.3](https://github.com/harrytwright/electron-leagues/compare/v0.2.2...v0.2.3) (2026-09-16)

## [0.2.2](https://github.com/harrytwright/electron-leagues/compare/v0.2.1...v0.2.2) (2026-09-16)

### Bug Fixes

- **ci:** Adjust release.yml to handle signing certificate ([d6af644](https://github.com/harrytwright/electron-leagues/commit/d6af644485f4fbc1cfbd7838e23557f88237ab99))
- Fall back to polling when fs.watch hits EPERM ([58d3da4](https://github.com/harrytwright/electron-leagues/commit/58d3da4c51fab0a55bb2d7a8f1e7b35ea82bdab9)), closes [#1](https://github.com/harrytwright/electron-leagues/issues/1) [#11](https://github.com/harrytwright/electron-leagues/issues/11)
- Guard season archive and meta.json writes ([d0ababf](https://github.com/harrytwright/electron-leagues/commit/d0ababfeeb2c3267fca88731331df3c3f484e278)), closes [#6](https://github.com/harrytwright/electron-leagues/issues/6) [#8](https://github.com/harrytwright/electron-leagues/issues/8) [#9](https://github.com/harrytwright/electron-leagues/issues/9) [#11](https://github.com/harrytwright/electron-leagues/issues/11)
- Report partial results from batch operations ([0600284](https://github.com/harrytwright/electron-leagues/commit/0600284502bcabcc54abf34eecc88d96a6381859)), closes [#11](https://github.com/harrytwright/electron-leagues/issues/11)
- Trash league first and surface open errors ([b19ff20](https://github.com/harrytwright/electron-leagues/commit/b19ff2011dff3aae21e2eb09d20ab5116f6cf046)), closes [#7](https://github.com/harrytwright/electron-leagues/issues/7) [#10](https://github.com/harrytwright/electron-leagues/issues/10) [#11](https://github.com/harrytwright/electron-leagues/issues/11)

## [0.2.1](https://github.com/harrytwright/electron-leagues/compare/v0.2.0...v0.2.1) (2026-09-16)

# [0.2.0](https://github.com/harrytwright/electron-leagues/compare/d137add9d15e3f58f72c02e3324ddcbb3225337e...v0.2.0) (2026-09-16)

### Bug Fixes

- **app:** close filesystem and desktop interaction review gaps ([26c5547](https://github.com/harrytwright/electron-leagues/commit/26c5547a2b9aa3a1d7fdb6ca54f006810cec0a86))
- **app:** finish path validation and feedback cleanup ([9c9f93a](https://github.com/harrytwright/electron-leagues/commit/9c9f93abf81d7f63fdc5815968c53a277a3aed3a))
- **build:** Set one Sentry release name ([e7e4480](https://github.com/harrytwright/electron-leagues/commit/e7e44809d55dc1774cd441ff71f37b00da1ee321))
- desktop review focus and status feedback findings ([89a9d43](https://github.com/harrytwright/electron-leagues/commit/89a9d43caea42a306d968771a937b96235b16e8b))
- **main:** align import paths and stale-file errors ([6741de6](https://github.com/harrytwright/electron-leagues/commit/6741de685686181e75887b839c8ff2c9c3998988))
- **main:** preserve macOS title bar safe area ([a3931d0](https://github.com/harrytwright/electron-leagues/commit/a3931d06c6f59b2d7669e3e950e9ff552b4d0feb))
- **main:** Refuse dangling links on Windows imports ([021f035](https://github.com/harrytwright/electron-leagues/commit/021f0352ea1d67e90da2b93d4970953253220fec))
- **main:** sync title bar overlay with theme ([d720e64](https://github.com/harrytwright/electron-leagues/commit/d720e64cd8cd37375c793ab1f01314e832caf2b8))
- **main:** take reserved-folder repair off the scan path ([50b6b62](https://github.com/harrytwright/electron-leagues/commit/50b6b62a16699a8e64de88a2974366fb7bc4677b))
- **main:** validate and contain document operations ([6488f2a](https://github.com/harrytwright/electron-leagues/commit/6488f2ad1c6d7b9b1d46933af7b342bf7bcd9ce4))
- **main:** validate season:create input before touching disk ([cb1e393](https://github.com/harrytwright/electron-leagues/commit/cb1e3932424300bbb428fbbfa8fd5a790ea43435))
- **preload:** report the renderer heap in the unit Electron gives us ([eaf857f](https://github.com/harrytwright/electron-leagues/commit/eaf857fc509399c821ce114d08decc492eb8feb4))
- **renderer:** accessible names and tab order in the file browsers ([e11f9fe](https://github.com/harrytwright/electron-leagues/commit/e11f9febb50bec82d8815edf110d6c746f180bbe))
- **renderer:** application shortcuts must survive toasts and work on the startup screen ([1e366fd](https://github.com/harrytwright/electron-leagues/commit/1e366fd46ffd2dd24cafc428c7c5c53d33a583a7))
- **renderer:** enlarge weekday badges ([b9bf17f](https://github.com/harrytwright/electron-leagues/commit/b9bf17fb74e4a759259fb961b4934583817584d8))
- **renderer:** FirstRun copy and typography ([630bfc1](https://github.com/harrytwright/electron-leagues/commit/630bfc13bf4a1d706c1dad45e2563e6e4820790d))
- **renderer:** keep keyboard focus and tree state across folder navigation ([5ab115e](https://github.com/harrytwright/electron-leagues/commit/5ab115e16d728e749d696409c9c050e7c1478b7b))
- **renderer:** one feedback hierarchy for operations ([932db34](https://github.com/harrytwright/electron-leagues/commit/932db34e78bc5ae0085d32e9498eea8ccd92d11b))
- **renderer:** Other items behaves like every other pane ([b27d90b](https://github.com/harrytwright/electron-leagues/commit/b27d90b76fca7ef5c2db6b077ff9c2b71a38407b))
- **renderer:** restore browser focus and bound tree reloads ([d998b10](https://github.com/harrytwright/electron-leagues/commit/d998b1071fb0bc9a5a89c21a5a830e5f2ec1b7ab))
- **renderer:** status bar path and diagnostics toggle ([7138d7c](https://github.com/harrytwright/electron-leagues/commit/7138d7cbdddfb4e5ee51634741ddaaa69a919408))
- **renderer:** unify operation feedback and diagnostics controls ([f7e6f8f](https://github.com/harrytwright/electron-leagues/commit/f7e6f8f88e6401f4d80d677d7621d39576082b5c))

### Features

- Add desktop file menus and application shortcuts ([da34b86](https://github.com/harrytwright/electron-leagues/commit/da34b867bd0d3c7fe74e660e2fd84a072809d8a5))
- add Kumo-based league and season dialogs ([92be2a6](https://github.com/harrytwright/electron-leagues/commit/92be2a653b1fb963ccf0892560e1dbb1e6baba92))
- Add Sentry ([c4227ee](https://github.com/harrytwright/electron-leagues/commit/c4227eeee0fb229665861e8760f1ad7eca2df84c))
- Create base app ([d137add](https://github.com/harrytwright/electron-leagues/commit/d137add9d15e3f58f72c02e3324ddcbb3225337e))
- follow system dark mode via data-mode and themed window background ([a767114](https://github.com/harrytwright/electron-leagues/commit/a767114e8c8b54b489bcb0b3b83d773057f7b9ba))
- initialise posthog-js in the renderer for Session Replay and Error Tracking ([db9b806](https://github.com/harrytwright/electron-leagues/commit/db9b8067c598167529007c193198af15a5c3d9f3))
- keyboard-accessible file list with add-files picker and import toasts ([36da38d](https://github.com/harrytwright/electron-leagues/commit/36da38df7b86dabb65d6ae25d68b311dc3d2e4c9))
- **main:** add path-safety helpers, recents MRU and on-demand directory listing ([5ef9bce](https://github.com/harrytwright/electron-leagues/commit/5ef9bce9bc91f27b57ee727ad5628a8cec946060))
- **main:** IPC for switching locations, listing folders and trashing leagues/seasons ([8eab5e1](https://github.com/harrytwright/electron-leagues/commit/8eab5e1bc44f450b1fdd1fd32993f5f5880e874f))
- **main:** real application menu owning the accelerators ([8523525](https://github.com/harrytwright/electron-leagues/commit/8523525d76206f7c5c881d81e5b7c90a2c1679dc))
- Migrate home to new file browser styling ([cff3305](https://github.com/harrytwright/electron-leagues/commit/cff33058837b151e3b17cbb7427f62cf22719af2))
- Polish desktop task dialogs and location toolbar ([321fd9f](https://github.com/harrytwright/electron-leagues/commit/321fd9fdee6aedfc94274068ef1c67807c43711a))
- Polish startup and add scoped operation feedback ([9a4d1d7](https://github.com/harrytwright/electron-leagues/commit/9a4d1d7eaadba192300bd69d005f0424ced446f4))
- **preload:** expose location switching, folder listing and trashing to the renderer ([6f3fd83](https://github.com/harrytwright/electron-leagues/commit/6f3fd83e1d368b9b785481f5b79071a1b92567f3))
- rebuild first-run and app shell on Kumo with toast provider ([f514302](https://github.com/harrytwright/electron-leagues/commit/f514302857e8792e5e7234b1f69bce721179f73c))
- rebuild league and shared views on Kumo cards ([79868d2](https://github.com/harrytwright/electron-leagues/commit/79868d2a8a8e474589292fd46e2bbd9a2bea1081))
- rebuild navigation on the Kumo sidebar suite ([eba25b1](https://github.com/harrytwright/electron-leagues/commit/eba25b1815052cf6e379266a256bdd9b68f036e0))
- **renderer:** Add the Zustand workspace store ([c43f401](https://github.com/harrytwright/electron-leagues/commit/c43f401e0324547c538b2acbffa78c40c63efc64))
- **renderer:** drill-down folder browser built on Kumo Table and Breadcrumbs ([6e9d8fa](https://github.com/harrytwright/electron-leagues/commit/6e9d8fac65dc928c968c9bf750428958de1da889))
- **renderer:** Home view replaces the shared-documents page ([ccf9102](https://github.com/harrytwright/electron-leagues/commit/ccf91026eebcd8f1359320e75c36dd899e08813e))
- **renderer:** Install the Query foundation ([604ca4e](https://github.com/harrytwright/electron-leagues/commit/604ca4ebe0c8dbc664bd423c441959182e729008))
- **renderer:** league view as a drill-down browser with delete and per-season zip ([e7af8f8](https://github.com/harrytwright/electron-leagues/commit/e7af8f884ab8808f6a953b9553a6cdd6ccf232b0))
- **renderer:** Move listings onto TanStack Query ([f6fa5b0](https://github.com/harrytwright/electron-leagues/commit/f6fa5b06c871ae269c9c716c89ecdc1ca01490b1))
- **renderer:** Move root and tree onto Query ([094ec7b](https://github.com/harrytwright/electron-leagues/commit/094ec7b16aefd090d4e01b03b28e1093fb20e090))
- **renderer:** Move tree branches onto Query observers ([d885a15](https://github.com/harrytwright/electron-leagues/commit/d885a150254e2f66f9fa56c9ca77e71b0f60440a))
- **renderer:** remember the last selection per location ([a8cfeef](https://github.com/harrytwright/electron-leagues/commit/a8cfeef2ece86bf169f896127fc60468b73e674e))
- **renderer:** Run writes through useWriteOperation ([435855b](https://github.com/harrytwright/electron-leagues/commit/435855b7daab3e5043c0a36cb2af2854fdbde5b5))
- **renderer:** sidebar with a location switcher and collapsible days ([f40a795](https://github.com/harrytwright/electron-leagues/commit/f40a795227cac71a46d5a7e0cd4964f5a363d649))
- **tests:** Update testing harness ([df0986b](https://github.com/harrytwright/electron-leagues/commit/df0986bd9865847d97dc9fb8a8e050b8c6d7b0eb))
