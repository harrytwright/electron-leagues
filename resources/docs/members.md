---
title: Members
description: The members database, member numbers and cards, rosters and teams, syncing from the MBD and exporting.
section: Working with leagues
order: 4
status: draft
updated: 2026-09-18
version: 0.3.0
---

# Members

The members database keeps one record per bowler across every league at a location: their number, name, date of birth, contact details, MBD ids and the seasons they bowl in. It is off until you turn it on, and it lives entirely inside the leagues folder, so it syncs with everything else.

## Turning it on

Open **Members** in the sidebar and choose **Enable members database**. That adds a `members.json` file at the root of the location. From then on every new season gets a roster, teams and settings of its own, kept in a `meta.json` file beside the season's documents. A live season made before that is left as it is until you choose **Set up roster…** from its menu, which can carry the previous season's teams and players over.

Both files are app owned. They never appear in the file browser and should not be edited by hand.

## Member numbers

Every member gets the next number when they are created, shown padded to six digits, and it never changes. The number is what a card carries and what the desk types to find someone. When two machines have both minted the same number before OneDrive caught up, the Members page shows _Duplicate numbers_ and lets one record keep it; the others take fresh numbers.

## Adding and editing members

**New member…** on the Members page, or on a season's Players tab, opens the member form. A member under 18 keeps no email or phone of their own; the form asks for a parent or guardian contact instead. When they turn 18 they appear under _Needs details_ so their own contact can be collected.

The row menu offers **Edit…**, **Merge into…** for two records that turn out to be the same person, **Print card** and **Delete…**. A member who is on any roster is hidden rather than removed, so old seasons still read correctly.

## Rosters and teams

A season with a roster gains **Players**, **Teams** and **Settings** tabs. Teams keep their identity from season to season and take a new team number, the lane draw, each year. Players are added to a team or as subs, moved between teams and removed from the row menu. The **Files** tab lists a [generated sign-in sheet](seasons.md#sign-in-sheet) made from the roster.

Creating a new season offers to carry over the previous season's teams and players, so a returning league starts from last year's line-up.

## Syncing from the MBD

**Sync from MBD…** on the Members page reads the Master Bowler Database's bowler export, the `.xlsx` it produces, or you can drop the file onto the page. The columns are recognised from their headings and can be corrected; the mapping is remembered for the next export with the same columns. Only the MBD ID, the name and the gender are read. The MBD's birthdates are left alone, since it fills them with the day a bowler was entered, and contact details are entered here by hand. Each row is matched by MBD ID first and then by a similar name; a row that matches neither creates a member with just the name and id. Where the export spells a known bowler differently you choose which spelling to keep, and the other is stored as an alias so the question never comes back. Nothing is written to the MBD, and the export itself is not kept.

The MBD's league export can fill a season's roster the same way: see [Players from an export](seasons.md#players-from-an-export).

## Cards and the POS

**Print card** on a member, or **Print cards** in the toolbar for everyone on the list, makes a PDF of cards with the member's name, number and a barcode and opens it for printing. Hidden records are skipped. The barcode carries the raw number, so the POS reads the member from a scan. Printing marks the member's record with the date the card was issued. The sheet is kept in a folder only you can read under the system's temporary folder and is removed when the app closes.

## Exporting to a spreadsheet

**Export CSV…** writes the members on the list, in the order shown and without hidden records, to a file a spreadsheet opens wherever you choose to save it. Members under 18 are listed with their guardian's contact and never their own. Tick **Only members who accept marketing** for a mailing list that respects the opt-out.

## Privacy

Member details stay in the leagues folder. The only copies the app makes are the ones you ask for: a CSV export saved where you choose, and a card sheet in a private temporary folder that is cleared when the app closes. Nothing about a member is sent to the app's diagnostics.
