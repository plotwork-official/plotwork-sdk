#!/usr/bin/env node
/**
 * Generates `packages/sdk/src/generated.ts` from `spec/openapi.json`: a TypeScript type for every component schema, and the
 * operations as a typed tree (`diagrams.validate`, `icons.search`, ...), each a call to the client's one `request` function. It
 * reads the subset of JSON Schema the API's document uses (types with null, objects, arrays, enums, references, allOf and anyOf)
 * and fails on anything else, so a new keyword is noticed rather than typed as `unknown` in silence.
 *
 *   node scripts/gen-sdk.mjs          write it
 *   node scripts/gen-sdk.mjs --check  fail when it differs from what is committed
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SPEC = JSON.parse(readFileSync(join(ROOT, 'spec', 'openapi.json'), 'utf8'))
const OUT = join(ROOT, 'packages', 'sdk', 'src', 'generated.ts')

/** The keywords the generator understands; the rest only document a value (`maxLength`) and do not change its type. */
const TYPED = new Set(['type', 'properties', 'required', 'items', 'enum', '$ref', 'additionalProperties', 'allOf', 'anyOf', 'oneOf', 'const'])
const DOCUMENTING = new Set(['description', 'maxLength', 'minLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'default', 'format', 'maxItems', 'minItems', 'example', 'examples', 'pattern', 'deprecated', 'title', 'uniqueItems'])

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const key = (name) => (IDENTIFIER.test(name) ? name : JSON.stringify(name))
const camel = (text) => text.replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase())
const pad = (depth) => '  '.repeat(depth)

function doc(schema, depth) {
  const text = typeof schema?.description === 'string' ? schema.description.replaceAll('*/', '*\\/').trim() : ''
  if (text === '') return ''
  const lines = text.split('\n')
  if (lines.length === 1) return `${pad(depth)}/** ${lines[0]} */\n`
  return `${pad(depth)}/**\n${lines.map((line) => `${pad(depth)} * ${line}`.trimEnd()).join('\n')}\n${pad(depth)} */\n`
}

function check(schema, where) {
  for (const word of Object.keys(schema)) {
    if (!TYPED.has(word) && !DOCUMENTING.has(word)) throw new Error(`${where}: the generator does not understand "${word}"`)
  }
}

function literal(value) {
  return JSON.stringify(value)
}

/** The TypeScript type of a schema. */
function typeOf(schema, depth, where) {
  if (schema === undefined || schema === true || (typeof schema === 'object' && Object.keys(schema).every((word) => DOCUMENTING.has(word)))) return 'unknown'
  if (schema === false) return 'never'
  check(schema, where)
  if (schema.$ref !== undefined) return schema.$ref.split('/').pop()
  if (schema.const !== undefined) return literal(schema.const)
  if (schema.enum !== undefined) return schema.enum.map(literal).join(' | ')
  if (schema.allOf !== undefined) return schema.allOf.map((part, index) => wrap(typeOf(part, depth, `${where}.allOf[${index}]`))).join(' & ')
  const union = schema.anyOf ?? schema.oneOf
  if (union !== undefined) return union.map((part, index) => wrap(typeOf(part, depth, `${where}.anyOf[${index}]`))).join(' | ')
  const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [schema.properties === undefined ? 'unknown' : 'object'] : [schema.type]
  return types.map((type) => wrap(single(type, schema, depth, where))).join(' | ')
}

function wrap(type) {
  return /[|&]/.test(type) && !type.startsWith('{') ? `(${type})` : type
}

function single(type, schema, depth, where) {
  switch (type) {
    case 'string':
      return 'string'
    case 'integer':
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'unknown':
      return 'unknown'
    case 'array':
      return `${wrap(typeOf(schema.items, depth, `${where}.items`))}[]`
    case 'object':
      return objectOf(schema, depth, where)
    default:
      throw new Error(`${where}: unknown type "${type}"`)
  }
}

function objectOf(schema, depth, where) {
  const properties = Object.entries(schema.properties ?? {})
  const extra = schema.additionalProperties
  if (properties.length === 0) {
    if (extra === undefined || extra === true) return 'Record<string, unknown>'
    if (extra === false) return 'Record<string, never>'
    return `Record<string, ${typeOf(extra, depth, `${where}.additionalProperties`)}>`
  }
  const required = new Set(schema.required ?? [])
  const lines = properties.map(([name, property]) => `${doc(property, depth + 1)}${pad(depth + 1)}${key(name)}${required.has(name) ? '' : '?'}: ${typeOf(property, depth + 1, `${where}.${name}`)}`)
  if (extra !== undefined && extra !== false) lines.push(`${pad(depth + 1)}[key: string]: unknown`)
  return `{\n${lines.join('\n')}\n${pad(depth)}}`
}

/** Where an operation sits in the client's tree: `/v1/diagrams/convert-mermaid` is `diagrams.convertMermaid`. */
function placeOf(method, path) {
  const parts = path.replace(/^\/v1\//, '').split('/')
  if (parts.length === 1) {
    const [only] = parts
    if (only === 'import') return ['importSource']
    if (only === 'icons' && method === 'get') return ['icons', 'search']
    return [camel(only)]
  }
  return parts.map(camel)
}

function jsonSchema(content) {
  return content?.['application/json']?.schema
}

const lines = [
  '/* Generated by scripts/gen-sdk.mjs from spec/openapi.json. Do not edit by hand: run `pnpm gen:sdk`. */',
  '/* eslint-disable */',
  '',
  "import type { CallOptions, Request } from './request.js'",
  '',
]

for (const [name, schema] of Object.entries(SPEC.components.schemas)) {
  lines.push(`${doc(schema, 0)}export type ${name} = ${typeOf(schema, 0, name)}`, '')
}

const tree = {}
const operations = []
for (const [path, item] of Object.entries(SPEC.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    const place = placeOf(method, path)
    const body = jsonSchema(operation.requestBody?.content)
    const success = Object.entries(operation.responses).filter(([status]) => /^2\d\d$/.test(status))
    const response = [...new Set(success.map(([status, answer]) => typeOf(jsonSchema(answer.content), 1, `${path} ${status}`)))].join(' | ') || 'void'
    const query = (operation.parameters ?? []).filter((parameter) => parameter.in === 'query')
    const queryType = query.length === 0 ? null : `{ ${query.map((parameter) => `${key(parameter.name)}${parameter.required ? '' : '?'}: ${typeOf(parameter.schema, 1, `${path} ?${parameter.name}`)}`).join('; ')} }`
    const input = body !== undefined ? typeOf(body, 1, `${path} body`) : queryType
    const idempotent = method === 'get' || !/\/publish$/.test(path)
    const summary = typeof operation.summary === 'string' ? operation.summary : `${method.toUpperCase()} ${path}`
    const inputOptional = body === undefined && query.every((parameter) => parameter.required !== true)
    operations.push({ place, method: method.toUpperCase(), path, input, inputIn: body !== undefined ? 'body' : 'query', inputOptional, response, idempotent, summary })
    let node = tree
    for (const part of place.slice(0, -1)) node = node[part] ??= {}
    node[place.at(-1)] = operations.at(-1)
  }
}

function emit(node, depth) {
  const out = []
  for (const [name, value] of Object.entries(node)) {
    if (value.path !== undefined) {
      const argument = value.input === null ? '' : `input${value.inputOptional ? '?' : ''}: ${value.input}, `
      const pass = value.input === null ? '' : `, ${value.inputIn}: input`
      out.push(`${pad(depth)}/** ${value.summary.replaceAll('*/', '*\\/')} \`${value.method} ${value.path}\` */`)
      out.push(`${pad(depth)}${key(name)}: (${argument}options?: CallOptions): Promise<${value.response}> =>`)
      out.push(`${pad(depth + 1)}request<${value.response}>({ method: '${value.method}', path: '${value.path}', idempotent: ${value.idempotent}${pass} }, options),`)
    } else {
      out.push(`${pad(depth)}${key(name)}: {`, ...emit(value, depth + 1), `${pad(depth)}},`)
    }
  }
  return out
}

lines.push(
  '/** Every `/v1` operation, as a tree of calls that each send one request through `request`. */',
  'export function operations(request: Request) {',
  '  return {',
  ...emit(tree, 2),
  '  }',
  '}',
  '',
  'export type Operations = ReturnType<typeof operations>',
  '',
  `/** The operations' addresses, for a test or a tool that lists them. */`,
  `export const OPERATION_PATHS = ${JSON.stringify(operations.map((operation) => `${operation.method} ${operation.path}`), null, 2).replaceAll('"', "'")} as const`,
  '',
)

const text = lines.join('\n')
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(OUT, 'utf8')
  } catch {
    // No file yet: it differs.
  }
  if (current !== text) {
    process.stderr.write('packages/sdk/src/generated.ts is stale: run pnpm gen:sdk\n')
    process.exit(1)
  }
  process.stdout.write('packages/sdk/src/generated.ts is current\n')
} else {
  writeFileSync(OUT, text)
  process.stdout.write(`wrote packages/sdk/src/generated.ts: ${Object.keys(SPEC.components.schemas).length} types, ${operations.length} operations\n`)
}
