---
title: Folder layout
description: The fixed layout the app expects inside a leagues folder and what it makes of anything else.
section: Basics
order: 2
status: draft
updated: 2026-09-17
version: 0.2.3
---

# Folder layout

The leagues folder follows a fixed layout. The app treats anything outside it as a plain browsable folder and never guesses at it.

```text
/leagues/
  _templates/                        # season templates, copied into new seasons
  _shared/                           # general documents for every league
  _archives/{League Name}/{season}/  # archived seasons (plain folders)
  monday/ … sunday/                  # league nights (lowercase on disk)
    {League Name}/
      meta.json                      # app-owned and auto-healed: the scan always wins
      2025-26/                       # seasons: 2025-26, 2025, or 2026-Q1
        Rules.docx, Sign-In Sheet.docx, …
```

## Reserved folders

| Folder       | Purpose                                                         |
| ------------ | --------------------------------------------------------------- |
| `_templates` | Documents copied into every new season.                         |
| `_shared`    | General documents that apply to every league.                   |
| `_archives`  | Archived seasons, one folder per league. BLS backups live here. |

The seven weekday folders hold league nights. They are lowercase on disk and the app shows them with their proper names.

## League folders

Each league night folder contains one folder per league. Inside it the app keeps a `meta.json` file that records the league's display name. That file is app owned and healed on every scan, so the folder tree always wins over anything stored in it. See [Leagues](leagues.md) for how leagues are created and renamed.

## Season folders

Season folders use one of three names: cross year `2025-26`, full year `2025` or quarter `2026-Q1`. Any folder that does not match is shown as a plain browsable folder. See [Seasons](seasons.md#season-names) for the rules in full.

## Other items

Files and folders at the root that the layout does not recognise appear under the **Other items** tab on Home. They are browsable but the app does nothing with them.
