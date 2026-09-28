# Renderer structure

The renderer lives in `src/renderer/src`. Its folders separate window roots, screens, reusable UI
and state wiring:

| Folder       | Responsibility                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app`        | Window roots: `App` for the workspace and `HelpApp` for the help window. Each composes its providers, boundaries and views.                  |
| `views`      | Screens: `HomeView`, `LeagueView`, `MembersView`, `HelpView` and `FirstRun`. Views compose components and connect them to application state. |
| `components` | Reusable UI such as the sidebar, toolbar, file browsers, dialogs and error boundaries.                                                       |
| `providers`  | Provider components that create, manage or supply state, plus `AppProviders` for their shared composition.                                   |
| `contexts`   | React context definitions and their value types. Both providers and consumers import these definitions.                                      |
| `hooks`      | Consumer hooks and reusable stateful behaviour. Context consumers read the definitions in `contexts`.                                        |
| `lib`        | Utilities, stores and services independent of the component hierarchy.                                                                       |
| `queries`    | Query definitions and keys.                                                                                                                  |
| `tests`      | Shared test setup, fixtures, API fakes and render helpers.                                                                                   |

`main.tsx` and `help.tsx` remain the renderer entry points. They initialise the window and mount
the corresponding root from `app`.

Each app, view, provider and context has a named folder:

```text
providers/
  QueryRefreshProvider/
    index.ts
    interface.ts
    QueryRefreshProvider.tsx
    QueryRefreshProvider.spec.tsx
```

`index.ts` exports the element and its public types. `interface.ts` holds its props or context value
types, re-exporting existing domain types when appropriate. The named `.tsx` file contains the
implementation. Existing tests live alongside the element they exercise.

Import individual elements through their folders, for example
`@renderer/providers/QueryRefreshProvider`. There are no category-wide index files.

Keep view-specific UI inside that view's `components` folder, as with `HomeView/components/FolderPane`.
Move UI into the top-level `components` folder when it becomes reusable across views. Window-level
composition belongs in `app`; new screens belong in `views`.
