# Help

The help system ships the user guide inside the app as a second window. This
document explains the pieces that span the main process, the renderer and the
markdown under `resources/docs`, and the contracts that hold them together.

## Where the words live

`resources/docs/*.md` is the only source of user documentation. The README
links to it rather than repeating it, so there is one copy to keep true. Each
file is one topic and its filename stem is the topic id that links and targets
use, for example `seasons.md` is the topic `seasons`.

Vite inlines every file through an `import.meta.glob` in
`src/renderer/src/lib/help/topics.ts`, so the packaged app carries no docs
folder and no IPC read. The same glob feeds the tests, which parse every
bundled topic and fail the suite on a broken one.

## Frontmatter

Every topic opens with flat `key: value` frontmatter. The parser accepts
nothing else, deliberately: no YAML dependency, no nesting, no quoting.

| Field         | Rule                                                   |
| ------------- | ------------------------------------------------------ |
| `title`       | Shown in the topic list and must match the `#` heading |
| `description` | One line, searched by the filter                       |
| `section`     | One of `Basics`, `Working with leagues`, `Reference`   |
| `order`       | Positive integer, unique within its section            |
| `status`      | `draft` or `verified`                                  |
| `updated`     | ISO date the words were last checked                   |
| `version`     | App version the words were last checked against        |

`updated` and `version` are information for whoever edits the markdown and are
never rendered. Nothing bumps them automatically.

## Drafts

A topic is a draft until a human has read it against the running app and set
`status: verified`. Drafts are still bundled but the loader filters them out of
packaged builds. In development they are listed with a Draft badge so the
rendered page can be checked without flipping the status back and forth.

A contextual link whose target topic is still a draft renders nothing in a
packaged build, so a half written topic can merge without a dead link.

## Links and anchors

Inside a topic, `[Seasons](seasons.md#season-names)` links to another topic
and `[names](#season-names)` to a heading in the same one. Both forms read
correctly on GitHub. `https` links open in the system browser through the
window open handler in main, and the help window refuses every other
navigation.

Heading ids come from the markdown package's slugger. The main window's
contextual links are registered in `src/renderer/src/lib/help/links.ts`, and a
test checks each one against the collected headings so that renaming a heading
fails the suite instead of stranding a link.

## Keyboard shortcuts in prose

A code span that starts with `Mod+`, such as `` `Mod+Shift+O` ``, renders as a
`<kbd>` reading ⇧⌘O on macOS and Ctrl+Shift+O elsewhere, with the modifier
names spelled out for screen readers. Any other code span stays code, so
filenames like `meta.json` are untouched. Shortcuts that differ by more than
the modifier, such as the help key itself, are written out for each platform.

## Rendering

`@tanstack/markdown` parses each topic once, with frontmatter capture, heading
ids and the docs extensions for GitHub-style callouts and heading collection.
Its React adapter renders through the `Markdown.*` compound components in
`src/renderer/src/components/Markdown`, which own all the prose styling in
Tailwind on Kumo's colour tokens. Raw HTML stays disabled.

## The window

`src/renderer/help.html` is a second renderer entry that mounts `HelpApp`, so
the help bundle carries none of the main app's query or workspace providers.
Main opens it through `createHelpWindowController` in
`src/main/lib/help-window.ts`, which keeps it a singleton: a second request
focuses the existing window and sends `help:navigate` with the new target. The
first target travels in the query string. The window closes with the main
window and remembers nothing between launches.

Entry points:

- The Help menu, on ⌘? for macOS and F1 elsewhere. Both accelerators reach
  main directly, so help opens even while a dialog is modal.
- The Windows taskbar jump list task, which launches a second instance with
  `--open-help`. The app therefore takes a single instance lock, and a second
  launch of any kind focuses the running app instead of opening another.
- Contextual links in New season, First run and the location switcher, which
  call `openHelp` over IPC with a registered target.

The filter shortcut is the one menu command routed to whichever window has
focus, so Cmd/Ctrl+F filters the topic list when the help window is in front.
