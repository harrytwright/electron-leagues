---
title: Seasons
description: Season naming rules, live and archived seasons, the new season wizard and syncing with templates.
section: Working with leagues
order: 2
status: draft
updated: 2026-09-17
version: 0.2.3
---

# Seasons

Each league keeps two live seasons, the active one and the previous one. Older seasons move to the archive.

## Season names

Season folders use one of three names. The app shows any folder that does not match as a plain browsable folder and never guesses at it.

| Type       | Example   | Rule                                                                           |
| ---------- | --------- | ------------------------------------------------------------------------------ |
| Cross year | `2025-26` | Four digit start year, a dash, then the last two digits of the following year. |
| Full year  | `2025`    | Four digit year.                                                               |
| Quarter    | `2026-Q1` | Four digit year, a dash, then `Q1` to `Q4`.                                    |

The new season wizard suggests the next name in the same style as the league's latest season.

## Creating a season

**New season…** in a league asks for the season type, the name and the starting documents:

- **Copy from templates** copies every visible, direct file in `_templates`.
- **Copy from previous season** takes the previous season's direct files first, then fills missing names from templates, so previous filenames always win. It is only offered while the league has a running season.
- **Start empty** copies nothing.

Every copy is a snapshot, not a live link. Editing a template later never changes a season that already copied it.

## Archiving

When a league already has two live seasons, the wizard offers a pre ticked **Archive** option that moves the oldest live season into `_archives`. Archived seasons stay browsable under the league's Archive folder.

From the Archive folder you can zip a season on demand. A zip sits beside the season folder and can be made again later.

## Syncing with templates

At the root of any live season, **Sync with templates** adds only the template filenames that are missing. It never creates numbered duplicates, never overwrites an edited copy, and archives and subfolders do not offer it.

## Deleting a season

Deleting a season asks you to type its name, then moves the whole folder, including unmanaged files, to the OS trash.
