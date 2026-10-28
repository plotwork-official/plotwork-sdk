#!/usr/bin/env node
/**
 * Copies the public `/v1` operations of the Plotwork API into `spec/openapi.json`: every `/v1` path but the boards, and only the
 * component schemas they reach. The source is the API's generated document in the Plotwork app repository
 * (`apps/docs/content/reference/openapi.json`). Every SDK, in any language, is generated from `spec/openapi.json`, so this is the
 * one step that brings an API change into the SDKs.
 *
 *   node scripts/sync-openapi.mjs ../plotwork-app/apps/docs/content/reference/openapi.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const from = process.argv[2]
if (from === undefined) {
  process.stderr.write('Usage: node scripts/sync-openapi.mjs <path to the API openapi.json>\n')
  process.exit(2)
}

const source = JSON.parse(readFileSync(from, 'utf8'))
const schemas = source.components?.schemas ?? {}
const paths = Object.fromEntries(
  Object.entries(source.paths)
    .filter(([path]) => path.startsWith('/v1/') && !path.startsWith('/v1/boards'))
    .sort(([a], [b]) => a.localeCompare(b)),
)

const reached = new Set()
function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk)
  if (node === null || typeof node !== 'object') return
  if (typeof node.$ref === 'string') {
    const name = node.$ref.split('/').pop()
    if (!reached.has(name)) {
      reached.add(name)
      walk(schemas[name])
    }
  }
  for (const value of Object.values(node)) walk(value)
}
walk(paths)

const spec = {
  openapi: source.openapi,
  info: { ...source.info, description: 'The public /v1 operations of the Plotwork API, as every Plotwork SDK reads them. Copied from the API by scripts/sync-openapi.mjs; never edited by hand.' },
  servers: [{ url: 'https://api.plotwork.dev', description: 'Production' }],
  security: [{ ApiKey: [] }, { Bearer: [] }],
  paths,
  components: {
    securitySchemes: { ApiKey: source.components.securitySchemes.ApiKey, Bearer: source.components.securitySchemes.Bearer },
    schemas: Object.fromEntries([...reached].sort().map((name) => [name, schemas[name]])),
  },
}

const out = join(import.meta.dirname, '..', 'spec', 'openapi.json')
writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`)
process.stdout.write(`wrote spec/openapi.json: ${Object.keys(paths).length} paths, ${reached.size} schemas\n`)
