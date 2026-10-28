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
if (problems.length > 0) {
  process.stderr.write(`Published packages must have no runtime dependencies:\n${problems.map((line) => `  ${line}`).join('\n')}\n`)
  process.exit(1)
}
process.stdout.write('No runtime dependencies in any published package.\n')
