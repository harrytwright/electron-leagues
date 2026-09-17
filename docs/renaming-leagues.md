# Renaming leagues

A league carries its name in two places: the `name` field of its `meta.json`, which the app
displays, and the folder under its weekday, which also names its `_archives` folder. Creating a
league derives the folder from the display name through `sanitiseFolderName`, so a rename does the
same. Keeping the two in step is the point of the tool, so a rename never changes one without
checking the other.

## What a rename does

`renameLeague` in `src/main/lib/operations.ts` runs under the same per-root lock as season
creation, so a rename cannot interleave with a season being created or archived in the same
league. It then:

1. Validates the current league through `assertRealLayout`, confirms it is a folder and refuses a
   symlinked `meta.json` before anything moves.
2. Sanitises the new display name into a folder name. When that matches the current folder name,
   only `meta.json` is rewritten and the folders stay put.
3. Otherwise checks every destination first: the new league folder and, when the league has an
   archive folder, the new archive folder must both be free. A case-only rename on a
   case-insensitive volume is allowed because the destination resolves to the same entry.
4. Moves the live folder, then the archive folder. Both moves stay on one volume because a rename
   only changes the leaf name, so `fs.rename` is enough and no copy fallback is needed.
5. Writes `meta.json` in the new location with the new display name, healed against the seasons
   and archives found on disk, so a scan straight afterwards has nothing to correct.

## Partial failure

The live folder moves first and the archive second. If the archive move fails, the live folder is
moved back and the user sees the archive error. If that restore also fails, the error says the
league was renamed but its archived seasons stayed under the old name, so the user knows which
folder to fix by hand. A failed `meta.json` write after both moves reports itself in the same way:
the folders are renamed and the display name falls back to the folder name until the next edit.

On Windows a folder with an open document refuses to move with `EBUSY` or `EPERM`. Those map to a
message asking the user to close the document rather than to a generic permission error.

## Following the rename in the renderer

The sidebar and the remembered selection identify a league by day and folder name. After a
folder rename the old selection no longer matches anything in the scanned tree, which would drop
the user back to Home. `RenameLeagueDialog` therefore reports the new folder name, read back from
the path main returns, and `App` reselects the league under it once the tree has refreshed.
`LeagueView` is keyed on the league path, so the view remounts under the new folder with fresh
navigation state.
