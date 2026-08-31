# Kumo UI Migration Implementation Plan

> **For agentic workers:** This plan is executed **codex-first**: each task is handed to
> Codex CLI as a frozen work order; Claude verifies the diff and tests, then a **cold Opus 5
> reviewer** validates each task's commit using ONLY `git status` and `git diff` before the
> next task starts. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Electron renderer UI onto `@cloudflare/kumo` (Tailwind v4 mode) with
system dark mode, closing all 20 web-interface-guidelines findings, with renderer test coverage.

**Architecture:** Renderer-only rewrite plus two small main-process touches (window
background color, `files:pick` IPC) and one preload method. Filesystem/IPC domain logic is
untouched. Interim tasks leave not-yet-migrated components unstyled (legacy CSS is removed
up front); the app stays functional on the branch throughout.

**Tech Stack:** React 19, electron-vite 5, Tailwind CSS v4 (`@tailwindcss/vite`),
`@cloudflare/kumo` ^2.12.0, `@phosphor-icons/react`, Vitest 4 projects + jsdom +
Testing Library.

**Spec:** `docs/superpowers/plans/2026-09-01-kumo-ui-migration-spec.md`

## Global Constraints

- All new packages go in `devDependencies` (electron-vite bundling rule — never `dependencies`).
- Do NOT install `echarts`; the unmet-peer warning is expected and accepted.
- Kumo docs CLI is the API authority: run `npx @cloudflare/kumo doc <Component>` before first
  use of each component. Code sketches in this plan fix structure and behavior; exact prop
  names/variants come from the registry. If a sketch's prop doesn't exist, follow the registry
  and preserve the specified behavior.
- kumo-design rules apply to every task: sentence-case headings; content text 14px; never
  `font-bold` (use `font-semibold`/`font-medium`); never `tracking-*`; no color transitions
  on hover; `ring ring-kumo-line` instead of border+shadow; concentric radii; icons aligned
  with `h-lh flex items-center`; dialogs always mounted, visibility via `open` prop.
- Kumo wins over Vercel guidelines on conflict (sentence case, etc.).
- Copy stays sentence case; ellipsis character `…` not `...`; curly quotes.
- Existing domain code (`src/shared`, `src/main/lib`) must not change except where a task
  explicitly says so.
- Every task ends: `npm run lint && npm run typecheck && npm test` all green, then commit on
  branch `feat/kumo-ui` with the message given in the task. Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Test layout convention: colocated `tests/` folders, files named `*.spec.ts(x)`.

## Execution protocol (per task)

1. Claude writes the work order (task text + relevant spec lines) to a temp file and runs
   Codex: `command codex exec --yolo -C <repo> -c model_reasoning_effort="high" -m gpt-5.6-sol -o /tmp/codex-taskN.md - <"$P"`.
2. Claude reads `git status -sb` + full `git diff`, runs the task's test commands itself.
3. Claude dispatches the cold reviewer (Opus 5, fresh context, no plan): may run ONLY
   `git status` and `git diff HEAD~1`; instructed to review harshly as an outside contributor.
4. Blockers → fix via `codex exec resume` (or directly after 2 failed rounds) and re-review.
   Nits → fix if cheap, else note. Then next task.

---

### Task 1: Toolchain + renderer test harness

**Files:**
- Modify: `package.json` (devDependencies, prettier config if inline)
- Modify: `electron.vite.config.ts` (add `tailwindcss()` to renderer plugins)
- Modify: `vitest.config.ts` (projects split: node + renderer/jsdom)
- Rewrite: `src/renderer/src/assets/main.css` (Kumo/Tailwind imports only)
- Create: `src/renderer/src/tests/setup.ts` (jest-dom, cleanup, matchMedia stub)
- Create: `src/renderer/src/tests/mock-api.ts` (typed `window.api` mock installer)
- Create: `src/renderer/src/tests/smoke.spec.tsx`
- Create: `.prettierrc` addition: `"plugins": ["prettier-plugin-tailwindcss"]` (merge into existing prettier config wherever it lives — check `package.json` / `.prettierrc*`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `installMockApi(overrides?: Partial<LeaguesApi>): LeaguesApi` — installs a fully
  stubbed `window.api` (every method a `vi.fn()` with sensible resolved defaults: `scan` →
  `null`, `importFiles` → `[]`, `zipArchive` → `[]`, `createLeague` → `''`,
  `createSeason` → `{ seasonPath: '', archived: null }`, `chooseRoot` → `null`,
  `openFile` → `''`, `revealFile`/`forgetRoot` → `undefined`, `pathForFile` →
  `(f) => f.name`, `onTreeChanged` → returns `vi.fn()` unsubscribe,
  `getAnalyticsConfig` → `{ apiKey: null, sentryDSN: null, distinctId: 'test' }`,
  `getRoot` → `null`, `pickFiles` → `[]` — add `pickFiles` to the mock now; the real preload
  method lands in Task 6) and returns it for assertion. Also `setSystemDark(dark: boolean)`
  from setup for driving the matchMedia stub.

- [ ] **Step 1: Install packages**

```bash
npm i -D @cloudflare/kumo @phosphor-icons/react tailwindcss @tailwindcss/vite \
  prettier-plugin-tailwindcss @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Wire Tailwind + Kumo styles**

`electron.vite.config.ts` renderer plugins: `[react(), tailwindcss()]` with
`import tailwindcss from '@tailwindcss/vite'`.

`src/renderer/src/assets/main.css` becomes exactly (plus nothing else yet):

```css
@source "../../../../node_modules/@cloudflare/kumo/dist/**/*.{js,jsx,ts,tsx}";
@import '@cloudflare/kumo/styles/tailwind';
@import 'tailwindcss';
```

Import order is mandatory (Kumo before tailwindcss); the `@source` line is the documented
footgun — without it component styles (e.g. dialog centering) silently break. Verify the
relative path from the CSS file to the repo's `node_modules` and correct it if the sandbox
resolves differently.

- [ ] **Step 3: Vitest projects + setup**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'node', include: ['src/{main,shared,preload}/**/*.spec.ts'], environment: 'node' }
      },
      {
        resolve: {
          alias: {
            '@renderer': resolve('src/renderer/src'),
            '@shared': resolve('src/shared')
          }
        },
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.spec.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/renderer/src/tests/setup.ts']
        }
      }
    ]
  }
})
```

`setup.ts`: import `@testing-library/jest-dom/vitest`; `afterEach(cleanup)`; install a
configurable `window.matchMedia` stub (jsdom lacks it) exposing
`setSystemDark(dark: boolean)` that flips `matches` and fires registered `'change'`
listeners.

`mock-api.ts`: as specified in **Produces** above; assign to `window.api` via
`Object.defineProperty(window, 'api', { value, configurable: true })`. Type it against
`LeaguesApi` imported from `../../../preload/index` — extend locally with
`pickFiles: () => Promise<string[]>` until Task 6 adds it for real (define a
`RendererApi = LeaguesApi & { pickFiles(): Promise<string[]> }` type here and reuse it).

- [ ] **Step 4: Failing smoke test, then green**

`smoke.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@cloudflare/kumo'
import { installMockApi } from './mock-api'

it('renders a Kumo button', () => {
  installMockApi()
  render(<Button>Create league</Button>)
  expect(screen.getByRole('button', { name: 'Create league' })).toBeInTheDocument()
})
```

Run `npx vitest run --project renderer` — must pass. Run `npx vitest run --project node` —
existing 5 spec files still pass. `npm run dev` must boot (manual/`build` check acceptable:
`npm run build` succeeds).

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/kumo-ui
git add -A && git commit -m "chore: add Kumo, Tailwind v4 and renderer test harness"
```

---

### Task 2: System theme wiring

**Files:**
- Create: `src/renderer/src/theme.ts`
- Create: `src/renderer/src/tests/theme.spec.ts`
- Modify: `src/renderer/src/main.tsx` (call `watchSystemTheme()` before render)
- Modify: `src/main/index.ts:150-165` (themed `backgroundColor`)

**Interfaces:**
- Consumes: `setSystemDark` matchMedia stub (Task 1).
- Produces: `watchSystemTheme(root?: HTMLElement): () => void` — applies/removes
  `data-mode="dark"` on `document.documentElement`, follows OS changes, returns cleanup.

- [ ] **Step 1: Failing tests**

```ts
import { watchSystemTheme } from '../theme'
import { setSystemDark } from './setup'

describe('watchSystemTheme', () => {
  it('sets data-mode="dark" when the OS is dark', () => {
    setSystemDark(true)
    const stop = watchSystemTheme()
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark')
    stop()
  })

  it('removes data-mode when the OS is light', () => {
    setSystemDark(true)
    const stop = watchSystemTheme()
    setSystemDark(false)
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false)
    stop()
  })

  it('stops following changes after cleanup', () => {
    setSystemDark(false)
    const stop = watchSystemTheme()
    stop()
    setSystemDark(true)
    expect(document.documentElement.hasAttribute('data-mode')).toBe(false)
  })
})
```

Run: `npx vitest run --project renderer` → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
export function watchSystemTheme(root: HTMLElement = document.documentElement): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    if (query.matches) root.setAttribute('data-mode', 'dark')
    else root.removeAttribute('data-mode')
  }
  apply()
  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}
```

`main.tsx`: `watchSystemTheme()` before `createRoot(...)`.

`src/main/index.ts`: import `nativeTheme`; in `createWindow` set
`backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BG : LIGHT_BG`. Derive the two hex
values from Kumo's canvas token: `grep -m4 'color-kumo-base\|color-kumo-canvas' node_modules/@cloudflare/kumo/dist/styles/theme-kumo.css`
and convert the light/dark values to hex (approximation to ±1/255 per channel is fine —
this only prevents launch flash).

- [ ] **Step 3: Verify** — renderer + node projects green; `npm run typecheck`.

- [ ] **Step 4: Commit** — `feat: follow system dark mode via data-mode and themed window background`

---

### Task 3: App shell + FirstRun

**Files:**
- Rewrite: `src/renderer/src/components/FirstRun.tsx`
- Modify: `src/renderer/src/App.tsx` (ToastProvider wrapper, Kumo loading state; layout div
  stays until Task 5's sidebar)
- Create: `src/renderer/src/components/tests/FirstRun.spec.tsx`
- Create: `src/renderer/src/tests/App.spec.tsx`

**Interfaces:**
- Consumes: `installMockApi`; Kumo `Button`, `Text`, `Loader`, `Empty`, `ToastProvider`
  (check names: `npx @cloudflare/kumo doc Toast` — use the documented provider/manager,
  e.g. `createKumoToastManager`/`useKumoToastManager`).
- Produces: `FirstRun({ onChosen: () => void })` unchanged signature. App mounts
  ToastProvider at root — later tasks assume toasts can fire anywhere in the tree.
  Export nothing new from App.

- [ ] **Step 1: Failing tests**

FirstRun behavior:

```tsx
it('choosing an existing folder calls chooseRoot and onChosen on success', async () => {
  const api = installMockApi({ chooseRoot: vi.fn().mockResolvedValue('/root') })
  const onChosen = vi.fn()
  render(<FirstRun onChosen={onChosen} />)
  await userEvent.click(screen.getByRole('button', { name: /select existing folder/i }))
  expect(api.chooseRoot).toHaveBeenCalledWith('select')
  await waitFor(() => expect(onChosen).toHaveBeenCalled())
})

it('does not fire onChosen when the dialog is cancelled', async () => {
  installMockApi({ chooseRoot: vi.fn().mockResolvedValue(null) })
  const onChosen = vi.fn()
  render(<FirstRun onChosen={onChosen} />)
  await userEvent.click(screen.getByRole('button', { name: /initialise new folder/i }))
  await waitFor(() => expect(onChosen).not.toHaveBeenCalled())
})

it('shows a busy state while choosing', async () => {
  let resolve!: (v: string | null) => void
  installMockApi({ chooseRoot: vi.fn(() => new Promise((r) => (resolve = r))) })
  render(<FirstRun onChosen={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: /select existing folder/i }))
  expect(screen.getByText(/opening…/i)).toBeInTheDocument()
  resolve(null)
})
```

App phases:

```tsx
it('shows loading, then FirstRun when scan returns null', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(null) })
  render(<App />)
  expect(screen.getByText(/loading…/i)).toBeInTheDocument()
  expect(await screen.findByRole('button', { name: /select existing folder/i })).toBeInTheDocument()
})

it('shows the shared view when scan returns a tree', async () => {
  installMockApi({ scan: vi.fn().mockResolvedValue(makeTree()) })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Shared documents' })).toBeInTheDocument()
})
```

Add a `makeTree(overrides?)` fixture builder in `src/renderer/src/tests/fixtures.ts`
returning a minimal valid `LeaguesTree` (import the type from `@shared/tree`; empty days,
`sharedFiles: []`, `templateFiles: []`, `hasShared: true`, `hasTemplates: true`,
`root: '/root'` — match the real type's required fields exactly).

Run → FAIL.

- [ ] **Step 2: Implement**

FirstRun sketch (Kumo idioms; verify props via docs CLI):

```tsx
<div className="flex h-full flex-col items-center justify-center gap-6 bg-kumo-base">
  <div className="grid max-w-md gap-1.5 text-center">
    <Text as="h1" variant="heading2">Bowling league documents</Text>
    <Text variant="secondary">
      Pick the leagues folder inside your OneDrive to get started, or initialise a brand
      new one — the app creates the shared, templates and archive folders for you.
    </Text>
  </div>
  <div className="flex gap-3">
    <Button variant="primary" disabled={busy} onClick={() => void choose('select')}>
      {busy ? 'Opening…' : 'Select existing folder'}
    </Button>
    <Button disabled={busy} onClick={() => void choose('init')}>Initialise new folder</Button>
  </div>
</div>
```

App: wrap the tree in the Kumo toast provider; loading state becomes a centered Kumo
`Loader` + `Text` "Loading…". Keep phase logic identical.

- [ ] **Step 3: Verify** — all renderer specs green; `npm run lint && npm run typecheck && npm test`.

- [ ] **Step 4: Commit** — `feat: rebuild first-run and app shell on Kumo with toast provider`

---

### Task 4: Dialogs (NewLeagueDialog, NewSeasonDialog)

**Files:**
- Create: `src/renderer/src/components/NewLeagueDialog.tsx`
- Create: `src/renderer/src/components/NewSeasonDialog.tsx`
- Create: `src/renderer/src/components/tests/NewLeagueDialog.spec.tsx`
- Create: `src/renderer/src/components/tests/NewSeasonDialog.spec.tsx`
- Delete (deferred): old `NewLeagueModal.tsx`/`NewSeasonModal.tsx` are deleted in Tasks 5/7
  when their parents rewire — do NOT delete here.

**Interfaces:**
- Consumes: Kumo `Dialog` (Root/Trigger-less controlled usage, Title, Description, Close),
  `Field`/`Label`, `Input`, `Select`, `Checkbox`, `Button`, `Text`;
  `sanitiseFolderName`, `parseSeasonName`, `suggestSeasonName`, `WEEKDAYS`/`isWeekday`.
- Produces:
  - `NewLeagueDialog({ open: boolean; onOpenChange: (open: boolean) => void; onCreated: (day: Weekday, folderName: string) => void })`
  - `NewSeasonDialog({ league: LeagueNode; open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void })`
  - Both are **always mounted** by parents; parents own `open` state (Task 5/7 rely on this).

- [ ] **Step 1: Failing tests** (both files; league shown, season mirrors it plus its own cases)

```tsx
function renderDialog(props: Partial<Props> = {}) {
  const onCreated = vi.fn(); const onOpenChange = vi.fn()
  const view = render(
    <NewLeagueDialog open onOpenChange={onOpenChange} onCreated={onCreated} {...props} />
  )
  return { onCreated, onOpenChange, view }
}

it('is a real dialog with a form that submits on Enter', async () => {
  const api = installMockApi()
  const { onCreated } = renderDialog()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText(/league name/i), 'Mixed doubles{Enter}')
  expect(api.createLeague).toHaveBeenCalledWith('monday', 'Mixed doubles')
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith('monday', 'Mixed doubles'))
})

it('shows the sanitised folder hint when it differs', async () => {
  installMockApi()
  renderDialog()
  await userEvent.type(screen.getByLabelText(/league name/i), 'Mens: Triples')
  expect(screen.getByText(/folder will be named/i)).toHaveTextContent('Mens Triples')
})

it('surfaces createLeague failure inline and keeps the dialog open', async () => {
  installMockApi({ createLeague: vi.fn().mockRejectedValue(new Error('exists already')) })
  const { onOpenChange } = renderDialog()
  await userEvent.type(screen.getByLabelText(/league name/i), 'Trios{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('exists already')
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

it('resets its fields each time it opens', async () => {
  installMockApi()
  const { view } = renderDialog()
  await userEvent.type(screen.getByLabelText(/league name/i), 'Stale text')
  view.rerender(<NewLeagueDialog open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />)
  view.rerender(<NewLeagueDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />)
  expect(screen.getByLabelText(/league name/i)).toHaveValue('')
})

it('disables submit while name is empty and while busy', async () => { /* assert disabled attr before typing and during a pending createLeague promise */ })
```

NewSeasonDialog extra cases: suggested name recomputed on open from `league.seasons.at(-1)`;
changing season type re-suggests; invalid name → inline `role="alert"` naming the type;
"Copy from previous season" option disabled when `!league.running`; archive checkbox only
rendered when `league.seasons.length >= 2` and pre-checked; submit payload matches
`SeasonCreateRequest` exactly.

Run → FAIL (modules missing).

- [ ] **Step 2: Implement**

Shared shape (league dialog shown; season analogous):

```tsx
function NewLeagueDialog({ open, onOpenChange, onCreated }: Props): React.JSX.Element {
  const [day, setDay] = useState<Weekday>('monday')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setDay('monday'); setName(''); setError(null); setBusy(false) }
  }, [open])

  const folderName = sanitiseFolderName(name)

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!folderName) {
      setError('That name cannot be used as a folder name — try letters and numbers')
      nameRef.current?.focus()
      return
    }
    setBusy(true); setError(null)
    try {
      await window.api.createLeague(day, name)
      onCreated(day, folderName)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
      nameRef.current?.focus()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog>
        <Dialog.Title>New league</Dialog.Title>
        <Dialog.Description>Add a league night and its folder.</Dialog.Description>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          {/* Field/Label + Kumo Select for day (options from WEEKDAYS, sentence-cased) */}
          {/* Field/Label + Input: name="league-name", autoComplete="off",
              placeholder="e.g. Men's Triples…", ref=nameRef, autoFocus */}
          {name && folderName && folderName !== name.trim() && (
            <Text size="sm" variant="secondary">Folder will be named “{folderName}”</Text>
          )}
          {error && (
            <Text size="sm" role="alert" aria-live="polite" className="text-kumo-danger">
              {error}
            </Text>
          )}
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button type="button">Cancel</Button>} />
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create league'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  )
}
```

Escape/backdrop/focus-trap/`role=dialog` come from Kumo — do not reimplement. Check the
exact composition (`Dialog.Root`/`Dialog`/`Dialog.Close` render-prop style) with
`npx @cloudflare/kumo doc Dialog` and the Select label association with `doc Select`
(if Kumo Select can't associate a visible label accessibly, fall back to the Base UI
select primitive with an explicit `Label`, or `aria-label` as last resort — the test
`getByLabelText(/league night/i)` must pass honestly).

- [ ] **Step 3: Verify** — both spec files green; full gates.

- [ ] **Step 4: Commit** — `feat: add Kumo-based league and season dialogs`

---

### Task 5: Sidebar on the Kumo Sidebar suite

**Files:**
- Rewrite: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx` (Sidebar.Provider layout replaces `.layout` div)
- Delete: `src/renderer/src/components/NewLeagueModal.tsx`
- Create: `src/renderer/src/components/tests/Sidebar.spec.tsx`

**Interfaces:**
- Consumes: Kumo Sidebar suite (`npx @cloudflare/kumo doc Sidebar` — Provider, menu,
  menu button, collapsible/rail as documented), `NewLeagueDialog` (Task 4), `title()` helper
  (inline, sentence-cases weekday names), Phosphor icons for the two footer actions.
- Produces: `Sidebar({ tree, selection, onSelect, onChanged })` — same props as today;
  `Selection` type export unchanged. App renders `<Sidebar.Provider>`-based layout with
  `<main>` content pane (later tasks only render into `<main>`).

- [ ] **Step 1: Failing tests**

```tsx
it('lists leagues grouped under sentence-cased day headings, skipping empty days', ...)
it('marks the selected league and fires onSelect with the right selection', async () => {
  // click a league button → onSelect({ kind: 'league', day, folderName })
})
it('shows "Not running" on stopped leagues', ...)
it('opens the new-league dialog and forwards creation', async () => {
  // click "New league…" → dialog visible; fill + submit →
  // onChanged called and onSelect called with the new league selection
})
it('reveals the leagues root from the footer', async () => {
  // click "Show leagues folder" → api.revealFile(tree.root)
})
```

- [ ] **Step 2: Implement**

Structure: Kumo sidebar with collapse enabled, no resize handle. "Shared documents" as the
first menu item; day groups as the suite's group/label primitive; league items as menu
buttons with a `selected`/`active` prop per registry; the not-running note as
`Text size="sm" variant="secondary"` inside the button. Footer: "New league…" primary-ish
button + ghost "Show leagues folder". `NewLeagueDialog` mounted unconditionally at the
bottom with `open={creating}` — never `{creating && ...}`.

Sidebar chrome (nav only, not the content pane) gets `select-none` — this replaces the
body-wide `user-select: none` (finding 19; body rule already gone since Task 1).

- [ ] **Step 3: Verify** — sidebar + existing specs green; full gates. Manual `npm run dev`
  sanity: collapse works, selection highlights.

- [ ] **Step 4: Commit** — `feat: rebuild navigation on the Kumo sidebar suite`

---

### Task 6: FileList + add-files IPC + import toasts

**Files:**
- Rewrite: `src/renderer/src/components/FileList.tsx`
- Modify: `src/main/index.ts` (add `files:pick` handler near the other `ipcMain.handle`s)
- Modify: `src/preload/index.ts` (add `pickFiles`)
- Create: `src/renderer/src/components/tests/FileList.spec.tsx`

**Interfaces:**
- Consumes: Kumo `Button`, `Text`, toast manager hook (Task 3's provider), Phosphor
  `Folder`/`File` icons; `RendererApi.pickFiles` mock (Task 1).
- Produces:
  - `FileList({ files, emptyLabel?, dropInto?, onImported? })` — unchanged props.
  - Preload: `pickFiles: (): Promise<string[]> => ipcRenderer.invoke('files:pick')`.
  - Main: `ipcMain.handle('files:pick', ...)` → `dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })`, returns `[]` on cancel, `filePaths` otherwise.

- [ ] **Step 1: Failing tests**

```tsx
it('opens files and reveals folders from a real button via keyboard', async () => {
  const api = installMockApi()
  render(<FileList files={[fileEntry('a.xlsx', 'file'), fileEntry('sub', 'folder')]} />)
  const row = screen.getByRole('button', { name: /a\.xlsx/ })
  row.focus()
  await userEvent.keyboard('{Enter}')
  expect(api.openFile).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /sub/ }))
  expect(api.revealFile).toHaveBeenCalled()
})

it('imports via the add-files button and announces the result', async () => {
  const api = installMockApi({ pickFiles: vi.fn().mockResolvedValue(['/tmp/a.pdf', '/tmp/b.pdf']) })
  const onImported = vi.fn()
  render(<FileList files={[]} dropInto="/dest" onImported={onImported} />)
  await userEvent.click(screen.getByRole('button', { name: /add files…/i }))
  expect(api.importFiles).toHaveBeenCalledWith('/dest', ['/tmp/a.pdf', '/tmp/b.pdf'])
  await waitFor(() => expect(onImported).toHaveBeenCalled())
  // toast assertion: rendered via provider — wrap render in the app's ToastProvider and
  // assert the "Imported 2 files" text appears
})

it('does nothing when the picker is cancelled', ...)
it('still imports on drop', async () => {
  // fireEvent.drop with dataTransfer.files; pathForFile mock maps to names
})
it('shows a toast and keeps the list intact when import fails', async () => {
  // importFiles rejects → error toast text visible, onImported NOT called
})
it('hides the add-files button when dropInto is unset', ...)
it('renders the empty label', ...)
```

- [ ] **Step 2: Implement**

Row sketch:

```tsx
<li className="flex items-center gap-2 px-4 py-2">
  <button
    type="button"
    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-kumo-interact"
    onClick={() => (file.kind === 'file' ? void open(file) : void reveal(file))}
    onContextMenu={() => void reveal(file)}
    title={file.path}
  >
    <span aria-hidden="true" className="h-lh flex items-center">
      {file.kind === 'folder' ? <FolderIcon /> : <FileIcon />}
    </span>
    <span className="truncate">{file.name}</span>
  </button>
  <Button size="sm" variant="ghost" onClick={() => void reveal(file)}>Show in folder</Button>
</li>
```

List: `ring ring-kumo-line` container per kumo-design (no border+shadow), drop styling via
a `data-dragging` class toggling `bg-kumo-tint` + dashed outline; header row (when
`dropInto`) gains the `Add files…` ghost button with a Phosphor `Plus` icon (`aria-hidden`).
Import path (shared by drop + picker): on success `toast(`Imported ${n} file${n === 1 ? '' : 's'}`)`,
on failure error toast with the message; `onImported` only on success.

Main/preload additions exactly as in **Produces**.

- [ ] **Step 3: Verify** — FileList specs green; full gates; `npm run dev` manual: drop a
  file, use Add files…, both toast.

- [ ] **Step 4: Commit** — `feat: keyboard-accessible file list with add-files picker and import toasts`

---

### Task 7: LeagueView + SharedView

**Files:**
- Rewrite: `src/renderer/src/components/LeagueView.tsx`
- Rewrite: `src/renderer/src/components/SharedView.tsx`
- Delete: `src/renderer/src/components/NewSeasonModal.tsx`
- Create: `src/renderer/src/components/tests/LeagueView.spec.tsx`
- Create: `src/renderer/src/components/tests/SharedView.spec.tsx`

**Interfaces:**
- Consumes: `FileList` (Task 6), `NewSeasonDialog` (Task 4), Kumo `LayerCard`, `Badge`,
  `Text`, `Button`, `Checkbox`, toast hook.
- Produces: `LeagueView({ league, onChanged })`, `SharedView({ tree })` — unchanged props.

- [ ] **Step 1: Failing tests**

```tsx
it('renders seasons newest-first with status badges', ...)
it('opens the new-season dialog from the header button', ...)
it('archive rows: clicking the name label toggles the checkbox (single hit target)', async () => {
  render(<LeagueView league={leagueWithArchives(['2024-25'])} onChanged={vi.fn()} />)
  await userEvent.click(screen.getByText('2024-25'))
  expect(screen.getByRole('checkbox', { name: /2024-25/ })).toBeChecked()
})
it('reveals an archived season from its own button, not the label', ...)
it('zips selected archives, shows a toast, clears selection', async () => {
  // select one → "Zip 1 selected" appears → click → api.zipArchive(folderName, ['2024-25'])
  // → success toast → onChanged called
})
it('shows "Nothing archived yet" when empty', ...)
it('LeagueView sections match snapshot', () => {
  const { container } = render(<LeagueView league={fullLeague()} onChanged={vi.fn()} />)
  expect(container).toMatchSnapshot()
})
```

SharedView: two sections render, empty labels shown, reveal buttons call the right paths
(assert the `_shared`/`_templates` suffixes), drop targets only when `hasShared`/`hasTemplates`.

- [ ] **Step 2: Implement**

Sections become `LayerCard`s (never nested — heading + card per kumo-design), header
`Text as="h2"` + `Badge` for status (`active`→success-ish, `previous`→info-ish per registry
variants). Archive row:

```tsx
<li className="flex items-center gap-2 px-4 py-2">
  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
    <Checkbox checked={selected} onCheckedChange={() => toggleArchive(name)} />
    <span className="truncate">{name}</span>
  </label>
  <Button size="sm" variant="ghost"
    onClick={() => void window.api.revealFile(`${league.archivePath}/${name}`)}>
    Show in folder
  </Button>
</li>
```

Zip flow keeps `zipping` state ("Zipping…" label), adds success toast
(`Zipped ${n} season${…}`) and error toast on failure. `NewSeasonDialog` mounted
unconditionally with `open={newSeason}`. Sub-line copy unchanged ("Not running — create a
season to start it").

- [ ] **Step 3: Verify** — all specs green; full gates; snapshot committed.

- [ ] **Step 4: Commit** — `feat: rebuild league and shared views on Kumo cards`

---

### Task 8: Findings sweep + polish

**Files:**
- Modify: `src/renderer/src/assets/main.css` (confirm near-empty end-state)
- Modify: any file the sweep flags
- Modify: `docs/superpowers/plans/2026-09-01-kumo-ui-migration-spec.md` — tick the findings table

**Interfaces:** consumes everything; produces the finished branch.

- [ ] **Step 1: Sweep the findings table** — walk all 20 spec findings against the code;
  for each, note file:line proof it's closed. Specifically verify the ones delegated to Kumo:
  focus-visible rings on buttons/menu items, hover feedback on ghost + primary buttons,
  dialog `overscroll-behavior`/scroll containment, Escape + focus trap (manual `npm run dev`
  keyboard pass: Tab through sidebar → dialog open → Tab cycle stays inside → Escape closes).
  Any gap gets a targeted fix (e.g. a `focus-visible:ring-kumo-focus` utility).

- [ ] **Step 2: Dead code + CSS** — old modal components deleted (Tasks 5/7), no `.modal`/
  `.sidebar`/`.file-list` legacy classes referenced anywhere (`git grep -n 'modal-backdrop\|first-run\|drop-target'`
  returns nothing); `main.css` contains only imports + justified rules with a one-line
  comment each.

- [ ] **Step 3: Dark-mode manual pass** — toggle macOS appearance; verify no white flash on
  launch in dark, all views legible both modes, window background matches.

- [ ] **Step 4: Full gates** — `npm run lint && npm run typecheck && npm test && npm run build`.

- [ ] **Step 5: Commit** — `chore: close remaining UI review findings and gut legacy CSS`

---

## Self-review notes

- Spec coverage: all 20 findings map to Tasks 2–8 (table in spec); all 14 settled decisions
  have a home (theme→T2, toasts→T3/6/7, sidebar suite→T5, custom list→T6, dialogs→T4,
  tests/snapshots→T1+each, tooling→T1, sweep→T8).
- Type consistency: `Selection`, `LeaguesApi`/`RendererApi`, dialog prop shapes, and
  `pickFiles(): Promise<string[]>` are named identically across Tasks 1, 4, 5, 6.
- Known API risk: Kumo Sidebar/Select/Toast exact prop names — mitigated by the docs-CLI
  constraint; behavior (not prop spelling) is the acceptance bar.
