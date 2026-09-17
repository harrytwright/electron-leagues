---
title: Getting started
description: Open or create a leagues folder, switch between locations and learn what the app will never touch.
section: Basics
order: 1
status: draft
updated: 2026-09-17
version: 0.2.3
---

# Getting started

GoBowling Leagues is a desktop organiser for bowling league documents stored in a OneDrive folder. The folder tree is the source of truth: the app scans it, adopts folders you create by hand, opens documents in their default program, generates new season folders and archives old seasons.

## Locations

A location is a leagues folder. The startup panel offers three ways in:

- **Open location…** picks an existing leagues folder.
- **New location…** picks a parent folder and creates the reserved folders inside it, seeding the bundled `Rules.docx` and `Sign-In Sheet.docx` templates where they are missing.
- **Recent locations** returns you to a folder you have used before.

After startup, **Home** in the title bar returns you to shared documents and templates. The location switcher beside it changes, creates or reveals locations. Press `Mod+Shift+O` to open a location from anywhere.

## Repairing a location

**Repair location…** in the location switcher recreates the `_templates`, `_shared` and `_archives` folders and reseeds the bundled templates where they are missing. It leaves edited defaults and custom templates alone. Neither repair nor a new location recreates the selected root itself if it has moved or become unavailable.

## When a folder cannot be read

If the app cannot read the leagues folder it says so and offers to try again or choose another folder. On macOS a OneDrive folder can be blocked by the system rather than by the folder itself. The app then reports that folder access is blocked and offers **Open System Settings**. Grant access under Privacy & Security, Files and Folders, then try again.

## What the app never does

> [!NOTE]
> The app never overwrites an existing document.

Template and import workflows only add new copies. The only files the app owns are `meta.json` and the archive zips you request. Scans may update `meta.json`, but they never create reserved folders, copy bundled templates or touch your documents.

## Finding your way around

Home is a single pane browser with **Shared documents**, **Templates** and, when needed, **Other items** tabs. Changing tabs starts again at that tab's root. The sidebar holds the Leagues list grouped under collapsible days.

The status bar shows the current path, any pending activity and the installed app version. Completion toasts report whether an action succeeded or failed. The app remembers your last opened league and collapsed days per location.

## Updates

Installed apps check for updates when they open and every few hours, and download them in the background. Once an update has downloaded, the version tag in the status bar reads **Ready to install**. Quit and reopen the app to apply it.
