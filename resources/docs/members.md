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

## The members list

The Members page is a compact list of numbers and names beside a profile pane. Nothing is selected to begin with; click a row to read that member's details, contact, aliases, MBD ids, notes and the leagues they bowl in, with a link through to each roster. The list opens by surname. Click **Number** or **Member** to sort by that column, and again to turn it round. Drag the divider between the list and the profile to give either more room, or focus it and use the left and right arrow keys; the split is remembered on this machine, and a narrow window stacks the list above the profile instead. A small warning mark after a name means the record still needs details: a date of birth, a contact or a guardian's contact for a junior. Alias spellings are not shown in the list, but the search still finds them, and searching or filtering never closes the profile you are reading.

## Adding and editing members

**New member…** on the Members page opens a blank form in the profile pane; on a season's Players tab it opens the same form as a dialog. **Edit** on a profile, or **Edit…** in a row's menu, turns the profile into the form with **Save** and **Cancel**. A member under 18 keeps no email or phone of their own; the form asks for a parent or guardian contact instead. When they turn 18 they appear under _Needs details_ so their own contact can be collected. Unsaved changes are dropped without asking when you open another member, start another action or leave the page.

**Merge…** in a row's menu is for records that turn out to be the same person. It puts a tick box on every row and hands the profile pane over to the merge: tick as many records as belong together, including rows the search has hidden. The first record ticked is the main record and keeps its number; you can choose another ticked record instead. Where the records differ the pane shows each value with the record it came from, takes the main record's value by default, fills a blank from the only other record that has one and lets you type your own. Aliases and MBD ids are combined, and the notes are joined in order with a blank line between them, ready to edit. **Merge members** writes the result in one go and opens the survivor. The absorbed records keep their details, and anywhere an old number is still written points to the survivor.

The row menu also offers **Print card**, parked until there is a card template, and **Delete…**. A member who is on any roster is hidden rather than removed, so old seasons still read correctly.

## Rosters and teams

A season with a roster gains **Players**, **Teams** and **Settings** tabs. Teams keep their identity from season to season and take a new team number, the lane draw, each year. Players are added to a team or as subs, moved between teams and removed from the row menu. The **Files** tab lists a [generated sign-in sheet](seasons.md#sign-in-sheet) made from the roster.

Creating a new season offers to carry over the previous season's teams and players, so a returning league starts from last year's line-up.

## Syncing from the MBD

**Sync from MBD…** on the Members page reads the Master Bowler Database's bowler export, the `.xlsx` it produces, or you can drop the file onto the page. The columns are recognised from their headings and can be corrected; the mapping is remembered for the next export with the same columns. Only the MBD ID, the name and the gender are read. The MBD's birthdates are left alone, since it fills them with the day a bowler was entered, and contact details are entered here by hand. Each row is matched by MBD ID first and then by a similar name; a row that matches neither creates a member with just the name and id. Where the export spells a known bowler differently you choose which spelling to keep, and the other is stored as an alias so the question never comes back. Before anything is saved every row is listed with what will happen to it, and you can untick any row to leave it out; a row with no surname, which the MBD uses for placeholder entries, starts unticked. Afterwards the counts and a row by row log stay on screen until you close them, and the log can be copied. Nothing is written to the MBD, and the export itself is not kept.

The MBD's league export can fill a season's roster the same way: see [Players from an export](seasons.md#players-from-an-export).

## Cards and the POS

**Print card** on a member, and **Print cards** in the toolbar for everyone on the list, are parked until a card template can be chosen, and say so. Once they wake up they will make a PDF of cards with the member's name, number and a barcode and open it for printing, skipping hidden records. The barcode will carry the raw number, so the POS reads the member from a scan, printing will mark the member's record with the date the card was issued, and the sheet will sit in a folder only you can read under the system's temporary folder until the app closes.

## Exporting to a spreadsheet

**Export CSV…** writes the members on the list, in the order shown and without hidden records, to a file a spreadsheet opens wherever you choose to save it. Members under 18 are listed with their guardian's contact and never their own. Tick **Only members who accept marketing** for a mailing list that respects the opt-out.

## Privacy

Member details stay in the leagues folder. The only copies the app makes are the ones you ask for: a CSV export saved where you choose, and a card sheet in a private temporary folder that is cleared when the app closes. Nothing about a member is sent to the app's diagnostics.
