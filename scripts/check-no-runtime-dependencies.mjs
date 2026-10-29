#!/usr/bin/env node
/**
 * Fails when a published package of the SDK declares a runtime dependency. Every package ships with nothing to install beside it, so
 * the only code a user takes on is ours: a framework the user already has (React) may be a peer dependency, never a dependency.
 * Run by `pnpm check` and by CI.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..', 'packages')
const problems = []
for (const name of readdirSync(root)) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (manifest.private === true) continue
  for (const field of ['dependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies']) {
    const declared = manifest[field]
    const names = Array.isArray(declared) ? declared : Object.keys(declared ?? {})
    if (names.length > 0) problems.push(`${manifest.name}: ${field} names ${names.join(', ')}`)
  }
  for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (manifest.peerDependenciesMeta?.[peer]?.optional !== true) problems.push(`${manifest.name}: peer ${peer}@${range} is not optional`)
  }
}

/**
 * The Python package (`python/pyproject.toml`): `[project] dependencies` must be the empty list, and there are no extras. Read line by
 * line, since Node has no TOML reader; a `dependencies` key written another way (over several lines, or not as `[]`) fails too.
 */
const pyproject = join(import.meta.dirname, '..', 'python', 'pyproject.toml')
let toml = null
try {
  toml = readFileSync(pyproject, 'utf8')
} catch {
  // No Python package in this checkout.
}
if (toml !== null) {
  let table = ''
  let declared = false
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line)
    if (header !== null) {
      table = header[1]
      if (table === 'project.optional-dependencies') problems.push('plotwork (PyPI): [project.optional-dependencies] declares extras')
      continue
    }
    if (table === 'project.optional-dependencies' && line !== '') problems.push(`plotwork (PyPI): extra ${line}`)
    if (table !== 'project') continue
    const dependencies = /^(dependencies|optional-dependencies)\s*=\s*(.*)$/.exec(line)
    if (dependencies === null) continue
    if (dependencies[1] === 'dependencies' && dependencies[2] === '[]') declared = true
    else problems.push(`plotwork (PyPI): [project] ${dependencies[1]} = ${dependencies[2]}`)
  }
  if (!declared && !problems.some((problem) => problem.startsWith('plotwork (PyPI)'))) problems.push('plotwork (PyPI): [project] has no `dependencies = []`')
}

if (problems.length > 0) {
  process.stderr.write(`Published packages must have no runtime dependencies:\n${problems.map((line) => `  ${line}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write('No runtime dependencies in any published package.\n')
