// Write a synthetic MBD bowler export for trying Sync from MBD… and Add from export…
// by hand. Nothing in it is a real person; a seed always gives the same file.
//
//   npm run make:mbd-export -- path/to/MBDExport.xlsx [bowlers] [seed] [leagues]
import { writeFileSync } from 'node:fs'
import { mbdExportWorkbook, syntheticMbdExport } from '../src/main/lib/tests/fixtures/mbd-export.ts'

const USAGE = 'usage: npm run make:mbd-export -- <out.xlsx> [bowlers] [seed] [leagues]'

function positiveInteger(name, value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`${USAGE}\n${name} must be a positive integer, got "${value}"`)
    process.exit(1)
  }
  return parsed
}

const [out, bowlersArg = '500', seedArg = '1', leaguesArg = '6'] = process.argv.slice(2)
if (!out) {
  console.error(USAGE)
  process.exit(1)
}
const bowlers = positiveInteger('bowlers', bowlersArg)
const seed = positiveInteger('seed', seedArg)
const leagues = positiveInteger('leagues', leaguesArg)
const source = syntheticMbdExport({ seed, bowlers, leagues })
writeFileSync(out, mbdExportWorkbook(source))
const { placeholders, respelt, doubled, repeated } = source.quirks
console.log(
  `wrote ${out}: ${source.rows.length} rows for ${source.bowlers} bowlers ` +
    `(${placeholders.length} placeholders, ${respelt.length} respelt, ${doubled.length} doubled, ${repeated.length} repeated)`
)
