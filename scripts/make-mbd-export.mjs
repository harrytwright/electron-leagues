// Write a synthetic MBD bowler export for trying Sync from MBD… and Add from export…
// by hand. Nothing in it is a real person; a seed always gives the same file.
//
//   npm run make:mbd-export -- path/to/MBDExport.xlsx [bowlers] [seed] [leagues]
import { writeFileSync } from 'node:fs'
import { mbdExportWorkbook, syntheticMbdExport } from '../src/main/lib/tests/fixtures/mbd-export.ts'

const [out, bowlers = '500', seed = '1', leagues = '6'] = process.argv.slice(2)
if (!out) {
  console.error('usage: npm run make:mbd-export -- <out.xlsx> [bowlers] [seed] [leagues]')
  process.exit(1)
}
const source = syntheticMbdExport({
  seed: Number(seed),
  bowlers: Number(bowlers),
  leagues: Number(leagues)
})
writeFileSync(out, mbdExportWorkbook(source))
const { placeholders, respelt, doubled, repeated } = source.quirks
console.log(
  `wrote ${out}: ${source.rows.length} rows for ${source.bowlers} bowlers ` +
    `(${placeholders.length} placeholders, ${respelt.length} respelt, ${doubled.length} doubled, ${repeated.length} repeated)`
)
