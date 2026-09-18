import { lstat, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseLeagueMetaInput } from '../../shared/meta'
import {
  memberDisplayName,
  membersFileSchema,
  resolveMember,
  SIGN_IN_SHEET_FILE,
  sortTeams,
  type Member,
  type Player,
  type SeasonFile
} from '../../shared/members'
import type { SeasonSyncRequest } from '../../shared/season-create'
import { readAppJson } from './app-json'
import { isMissing, toUserFacing, UserFacingError } from './fs-errors'
import { META_FILE } from './league-meta'
import { membersFilePath, readSeasonFile, seasonFilePath } from './members'
import { assertInsideRoot, resolveLiveSeasonRoot } from './paths'
import { withRootLock } from './root-lock'

export interface SignInSheetInput {
  leagueName: string
  season: string
  file: SeasonFile
  members: readonly Member[]
}

/** Renders a page of HTML to PDF bytes; Electron provides the real one, tests a stub. */
export type PdfRenderer = (html: string) => Promise<Buffer>

const BLANK_ROWS_PER_TEAM = 2
const BLANK_ROWS_FOR_SUBS = 4

/** One entry per value `seasonFileSchema` allows for `format`. */
const FORMAT_NAMES = ['Singles', 'Doubles', 'Trios', 'Fours', 'Fives'] as const

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function playerName(player: Player, members: readonly Member[]): string {
  const member = resolveMember(members, player.memberId)
  return member ? memberDisplayName(member) : `Member ${player.memberId}`
}

function byPositionThenRoster(a: Player, b: Player): number {
  if (a.position === undefined) return b.position === undefined ? 0 : 1
  if (b.position === undefined) return -1
  return a.position - b.position
}

function block(title: string, names: readonly string[], blankRows: number): string {
  const rows = [...names.map((name) => escapeHtml(name)), ...Array<string>(blankRows).fill('')]
  return `<table>
<caption>${escapeHtml(title)}</caption>
<thead><tr><th>Player</th><th class="tick">Cash</th><th class="tick">Card</th></tr></thead>
<tbody>
${rows.map((name) => `<tr><td>${name}</td><td></td><td></td></tr>`).join('\n')}
</tbody>
</table>`
}

/** The payment sheet for a league night: one block per team in lane-draw order, then subs. */
export function renderSignInSheetHtml(input: SignInSheetInput): string {
  const { file, members } = input
  const teams = sortTeams(file.teams)
  const teamBlocks = teams.map((team) =>
    block(
      `${team.teamNo}. ${team.name}`,
      file.players
        .filter((player) => player.teamId === team.id)
        .sort(byPositionThenRoster)
        .map((player) => playerName(player, members)),
      BLANK_ROWS_PER_TEAM
    )
  )
  const teamIds = new Set(teams.map((team) => team.id))
  const subs = file.players
    .filter((player) => player.teamId === null || !teamIds.has(player.teamId))
    .map((player) => playerName(player, members))
  const format = FORMAT_NAMES[file.format - 1]

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.leagueName)} sign-in sheet</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
body { margin: 0; font: 11pt system-ui, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 3mm; margin-bottom: 5mm; }
h1 { font-size: 16pt; margin: 0 0 1mm; }
.meta { font-size: 11pt; }
.blank { display: inline-block; min-width: 26mm; border-bottom: 1px solid #111; vertical-align: baseline; }
.columns { column-count: 2; column-gap: 8mm; }
table { width: 100%; border-collapse: collapse; break-inside: avoid; margin: 0 0 5mm; }
caption { text-align: left; font-weight: 600; background: #e8e8e8; padding: 1.5mm 2mm; border: 1px solid #111; border-bottom: 0; }
th, td { border: 1px solid #111; padding: 1.5mm 2mm; text-align: left; height: 6.5mm; }
th { font-weight: 600; background: #f5f5f5; }
.tick { width: 14mm; text-align: center; }
</style>
</head>
<body>
<header>
<div><h1>${escapeHtml(input.leagueName)}</h1><div class="meta">${escapeHtml(input.season)} · ${escapeHtml(format)}</div></div>
<div class="meta">Week <span class="blank"></span> &nbsp; Date <span class="blank"></span></div>
</header>
<div class="columns">
${[...teamBlocks, block('Subs', subs, BLANK_ROWS_FOR_SUBS)].join('\n')}
</div>
</body>
</html>
`
}

export function signInSheetPath(seasonPath: string): string {
  return join(seasonPath, SIGN_IN_SHEET_FILE)
}

export type SignInSheetState = 'missing' | 'stale' | 'fresh'

/**
 * The sheet is stamped with the roster file's own modification time, so a changed
 * roster reads as stale without comparing clocks across machines. Whole
 * milliseconds, which is all a stamp can carry on every filesystem.
 */
async function rosterStamp(seasonPath: string): Promise<number | null> {
  const info = await stat(seasonFilePath(seasonPath)).catch((err) => {
    if (isMissing(err)) return null
    throw toUserFacing(err)
  })
  return info ? Math.floor(info.mtimeMs) : null
}

/** Anything but a regular file at the sheet's path counts as missing, so it gets regenerated. */
export async function signInSheetState(seasonPath: string): Promise<SignInSheetState> {
  const sheet = await lstat(signInSheetPath(seasonPath)).catch((err) => {
    if (isMissing(err)) return null
    throw toUserFacing(err)
  })
  if (!sheet || !sheet.isFile()) return 'missing'
  const stamp = await rosterStamp(seasonPath)
  return stamp !== null && stamp !== Math.round(sheet.mtimeMs) ? 'stale' : 'fresh'
}

export interface GenerateSignInSheetOptions {
  root: string
  seasonPath: string
  leagueName: string
  season: string
  renderPdf: PdfRenderer
}

/**
 * Write the season's sheet from its roster; the file is app output and is always
 * replaced. The lock keeps the roster still while it is read, and the bytes land
 * through a rename so a failed write never passes for a finished sheet.
 */
export async function generateSignInSheet(options: GenerateSignInSheetOptions): Promise<string> {
  return withRootLock(options.root, async () => {
    const seasonFile = await readSeasonFile(options.seasonPath)
    if (seasonFile.status === 'missing') {
      throw new UserFacingError('This season has no roster to make a sign-in sheet from')
    }
    if (seasonFile.status === 'invalid') throw new UserFacingError(seasonFile.message)
    const master = await readAppJson(membersFilePath(options.root), membersFileSchema)
    const members = master.status === 'ok' ? master.value.members : []
    const stamp = await rosterStamp(options.seasonPath)
    const html = renderSignInSheetHtml({
      leagueName: options.leagueName,
      season: options.season,
      file: seasonFile.value,
      members
    })
    const pdf = await options.renderPdf(html)
    const target = await assertInsideRoot(options.root, signInSheetPath(options.seasonPath), {
      allowMissingLeaf: true
    })
    const partial = await assertInsideRoot(options.root, `${target}.partial`, {
      allowMissingLeaf: true
    })
    try {
      await writeFile(partial, pdf)
      if (stamp !== null) await utimes(partial, new Date(stamp), new Date(stamp))
      await rename(partial, target)
    } catch (err) {
      await rm(partial, { force: true }).catch(() => undefined)
      throw toUserFacing(err)
    }
    return target
  })
}

/** The heading inside the sheet is the league's display name from its `meta.json`. */
async function leagueDisplayName(root: string, ref: SeasonSyncRequest): Promise<string> {
  const path = join(root, ref.day, ref.leagueFolder, META_FILE)
  const raw = await readFile(path, 'utf8').catch(() => null)
  if (raw === null) return ref.leagueFolder
  try {
    return parseLeagueMetaInput(JSON.parse(raw))?.name || ref.leagueFolder
  } catch {
    return ref.leagueFolder
  }
}

/** Remake a live season's sheet; an archived season is history and is refused. */
export async function refreshSignInSheet(
  root: string,
  ref: SeasonSyncRequest,
  renderPdf: PdfRenderer
): Promise<string> {
  const seasonPath = await resolveLiveSeasonRoot(root, ref.day, ref.leagueFolder, ref.seasonName)
  return generateSignInSheet({
    root,
    seasonPath,
    leagueName: await leagueDisplayName(root, ref),
    season: ref.seasonName,
    renderPdf
  })
}
