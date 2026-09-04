import { execFileSync } from 'node:child_process'

/**
 * Tag a release. Wraps `npm version` with the two guards npm does not provide:
 * that you are on main, and that your main is not behind the remote. npm
 * already refuses a dirty tree, so that case is left to it.
 *
 * Usage: npm run release -- <patch|minor|major|x.y.z>
 */

const bump = process.argv[2]

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function forward(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

if (!bump) {
  fail('Specify a bump: npm run release -- <patch|minor|major|x.y.z>')
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main') {
  fail(`Releases are tagged from main, not ${branch}. Merge first, then tag.`)
}

// The case npm cannot see: a clean main that is simply stale. Tagging here
// would ship a tree that no green CI run ever covered.
run('git', ['fetch', 'origin', 'main', '--quiet'])
const behind = Number(run('git', ['rev-list', '--count', 'HEAD..origin/main']))
if (behind > 0) {
  fail(`main is ${behind} commit(s) behind origin/main. Pull, wait for CI, then tag.`)
}

forward('npm', ['version', '-m', 'chore(bump): %s', bump])
forward('git', ['push', '--follow-tags'])

const version = run('node', ['-p', "require('./package.json').version"])
console.log(`\n✔ Pushed v${version}. Watch the release workflow for the build.`)
