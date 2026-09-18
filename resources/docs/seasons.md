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

**New season…** in a league asks for the season type and the name, then how to start it:

- **Copy documents from previous season**, ticked by default, takes the previous season's direct files first and fills missing names from templates, so previous filenames always win. Untick it to copy only the templates. A league with no running season always starts from the templates.
- Where the members database is on for the location, the dialog also asks for the **format** (players per team) and offers **Carry over teams and players**, which copies last season's teams and roster into the new season. Start date, weeks and fees are set afterwards on the season's Settings tab.

Every copy is a snapshot, not a live link. Editing a template later never changes a season that already copied it.

A season created while the members database is on carries its own settings, teams and roster in a file the app manages; that file is never shown among the season's documents and never copied between seasons.

## Sign-in sheet

Where a season has a roster, its files list a **Sign-In Sheet.pdf** marked _Generated_. The sheet is made from the roster the first time it is opened, and again whenever the roster or teams change, so it is always the current line-up: one block per team in lane-draw order with Cash and Card columns, blank rows for subs, and a space to write the week and date. Print it each league night. The bundled `Sign-In Sheet.docx` stays for leagues that fill a sheet in by hand and is marked _Superseded_ once a roster exists. Archived seasons keep whatever sheet they had.

## Archiving

When a league already has two live seasons, the wizard offers a pre ticked **Archive** option that moves the oldest live season into `_archives`. Archived seasons stay browsable under the league's Archive folder.

From the Archive folder you can zip a season on demand. A zip sits beside the season folder and can be made again later.

## Syncing with templates

At the root of any live season, **Sync with templates** adds only the template filenames that are missing. It never creates numbered duplicates, never overwrites an edited copy, and archives and subfolders do not offer it.

## Deleting a season

Deleting a season asks you to type its name, then moves the whole folder, including unmanaged files, to the OS trash.
