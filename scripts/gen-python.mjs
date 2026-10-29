#!/usr/bin/env node
/**
 * Generates `python/src/plotwork/_generated.py` from `spec/openapi.json`: a `TypedDict` for every object schema (nested objects get
 * a class of their own, named after where they sit), an alias for every other schema, and the operations as a tree of classes
 * (`diagrams.validate`, `icons.search`, ...) whose methods each send one request through the client's transport. It places and
 * retries operations exactly as the TypeScript generator does (`operations.mjs`), and fails on a keyword it does not understand,
 * like `gen-sdk.mjs`.
 *
 *   node scripts/gen-python.mjs          write it
 *   node scripts/gen-python.mjs --check  fail when it differs from what is committed
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isIdempotent, isJsonOperation, jsonSchema, placeOf } from './operations.mjs'

const ROOT = join(import.meta.dirname, '..')
const SPEC = JSON.parse(readFileSync(join(ROOT, 'spec', 'openapi.json'), 'utf8'))
const OUT = join(ROOT, 'python', 'src', 'plotwork', '_generated.py')
const SHOWN = 'python/src/plotwork/_generated.py'

const TYPED = new Set(['type', 'properties', 'required', 'items', 'enum', '$ref', 'additionalProperties', 'allOf', 'anyOf', 'oneOf', 'const'])
const DOCUMENTING = new Set(['description', 'maxLength', 'minLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'default', 'format', 'maxItems', 'minItems', 'example', 'examples', 'pattern', 'deprecated', 'title', 'uniqueItems'])
const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'])
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

const pythonName = (name) => IDENTIFIER.test(name) && !KEYWORDS.has(name)
const pascal = (text) => text.replace(/[^A-Za-z0-9]+(.)?/g, (_whole, letter) => (letter ?? '').toUpperCase()).replace(/^./, (letter) => letter.toUpperCase())
const snake = (text) => text.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
const pad = (depth) => '    '.repeat(depth)

function check(schema, where) {
  for (const word of Object.keys(schema)) {
    if (!TYPED.has(word) && !DOCUMENTING.has(word)) throw new Error(`${where}: the generator does not understand "${word}"`)
  }
}

/** A JSON value as a Python literal. */
function literal(value) {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  throw new Error(`no Python literal for ${JSON.stringify(value)}`)
}

function descriptionLines(schema) {
  const described = typeof schema?.description === 'string' ? schema : (schema?.allOf ?? []).find((part) => typeof part.description === 'string')
  const text = typeof described?.description === 'string' ? described.description.trim() : ''
  return text === '' ? [] : text.split('\n').map((line) => line.trimEnd())
}

const isDocumentationOnly = (schema) => schema === undefined || schema === true || (typeof schema === 'object' && Object.keys(schema).every((word) => DOCUMENTING.has(word)))
const isObject = (schema) => typeof schema === 'object' && (schema.properties !== undefined || schema.type === 'object') && schema.$ref === undefined
const refName = (ref) => ref.split('/').pop()

/** Every name the module defines, so a nested class never takes a schema's name. */
const taken = new Set(Object.keys(SPEC.components.schemas))
function freshName(hint) {
  let name = hint
  for (let n = 2; taken.has(name); n += 1) name = `${hint}${n}`
  taken.add(name)
  return name
}

/** `TypedDict` classes in the order they are defined (a base before the class that extends it), and the other schemas' aliases. */
const classes = new Map()
const aliases = new Map()

/** True when a component schema becomes a class rather than an alias. */
function becomesClass(schema) {
  if (schema.allOf !== undefined) return true
  if (schema.anyOf !== undefined || schema.oneOf !== undefined || schema.enum !== undefined || schema.const !== undefined) return false
  return !Array.isArray(schema.type) && isObject(schema) && schema.properties !== undefined
}

/** Defines a class for an object schema or an allOf of them, and returns its name. */
function defineClass(name, schema, where) {
  const bases = []
  const fields = []
  const parts = schema.allOf ?? [schema]
  parts.forEach((part, index) => {
    const at = schema.allOf === undefined ? where : `${where}.allOf[${index}]`
    check(part, at)
    if (part.$ref !== undefined) {
      const base = refName(part.$ref)
      if (!becomesClass(SPEC.components.schemas[base])) throw new Error(`${at}: allOf names ${base}, which is not an object`)
      bases.push(base)
      return
    }
    if (part.properties === undefined) throw new Error(`${at}: allOf part has no properties`)
    const required = new Set(part.required ?? [])
    for (const [key, property] of Object.entries(part.properties)) {
      fields.push({ key, required: required.has(key), type: typeOf(property, `${name}${pascal(key)}`, `${at}.${key}`), doc: descriptionLines(property) })
    }
  })
  const functional = fields.some((field) => !pythonName(field.key))
  if (functional && bases.length > 0) throw new Error(`${where}: a class with a base cannot have the key ${fields.find((field) => !pythonName(field.key)).key}`)
  classes.set(name, { name, bases, fields, doc: descriptionLines(schema), functional })
  return name
}

/** The Python type of a schema, as it is written in an annotation. `hint` names a nested class if one is needed. */
function typeOf(schema, hint, where) {
  if (isDocumentationOnly(schema)) return 'Any'
  if (schema === false) return 'NoReturn'
  check(schema, where)
  if (schema.$ref !== undefined) return refName(schema.$ref)
  if (schema.const !== undefined) return `Literal[${literal(schema.const)}]`
  if (schema.enum !== undefined) return `Literal[${schema.enum.map(literal).join(', ')}]`
  if (schema.allOf !== undefined) {
    // A part that only documents, or an object with no properties (how a nullable reference is written), does not need a class.
    const parts = schema.allOf.filter((part) => !isDocumentationOnly(part) && !(part.$ref === undefined && part.properties === undefined && part.allOf === undefined && (part.type === 'object' || (Array.isArray(part.type) && part.type.every((type) => type === 'object' || type === 'null')))))
    const nullable = schema.allOf.some((part) => Array.isArray(part.type) && part.type.includes('null') && part.properties === undefined)
    const type = parts.length === 1 ? typeOf(parts[0], hint, `${where}.allOf[0]`) : defineClass(freshName(hint), { ...schema, allOf: parts }, where)
    return nullable ? unionOf([type, 'None']) : type
  }
  const union = schema.anyOf ?? schema.oneOf
  if (union !== undefined) return unionOf(union.map((part, index) => typeOf(part, `${hint}Option${index + 1}`, `${where}.anyOf[${index}]`)))
  const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [schema.properties === undefined ? 'unknown' : 'object'] : [schema.type]
  return unionOf(types.map((type) => single(type, schema, types.length > 1 ? `${hint}Object` : hint, where)))
}

function unionOf(types) {
  const unique = [...new Set(types)]
  if (unique.includes('Any')) return 'Any'
  const others = unique.filter((type) => type !== 'None')
  if (others.length === unique.length) return others.length === 1 ? others[0] : `Union[${others.join(', ')}]`
  if (others.length === 0) return 'None'
  return others.length === 1 ? `Optional[${others[0]}]` : `Union[${others.join(', ')}, None]`
}

function single(type, schema, hint, where) {
  switch (type) {
    case 'string':
      return 'str'
    case 'integer':
      return 'int'
    case 'number':
      return 'float'
    case 'boolean':
      return 'bool'
    case 'null':
      return 'None'
    case 'unknown':
      return 'Any'
    case 'array':
      return `List[${typeOf(schema.items, `${hint}Item`, `${where}.items`)}]`
    case 'object': {
      if (schema.properties !== undefined && Object.keys(schema.properties).length > 0) return defineClass(freshName(hint), schema, where)
      const extra = schema.additionalProperties
      if (extra === undefined || extra === true || extra === false) return 'Dict[str, Any]'
      return `Dict[str, ${typeOf(extra, `${hint}Value`, `${where}.additionalProperties`)}]`
    }
    default:
      throw new Error(`${where}: unknown type "${type}"`)
  }
}

/** The names an alias's expression uses, so aliases are written after what they name. */
const namesIn = (expression) => [...expression.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(([name]) => name)

for (const [name, schema] of Object.entries(SPEC.components.schemas)) {
  check(schema, name)
  if (becomesClass(schema)) defineClass(name, schema, name)
  else aliases.set(name, { name, expression: typeOf(schema, name, name), doc: descriptionLines(schema) })
}

/** The operations, as a tree of groups and calls placed like the TypeScript client's. */
const tree = {}
const operations = []
for (const [path, item] of Object.entries(SPEC.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!isJsonOperation(operation)) continue
    const place = placeOf(method, path).map(snake)
    const body = jsonSchema(operation.requestBody?.content)
    const methodHint = pascal(place.join('_'))
    let bodyType = null
    if (body !== undefined) {
      bodyType = typeOf(body, `${methodHint}Body`, `${path} body`)
      if (!classes.has(bodyType)) throw new Error(`${path}: the request body must be an object schema with properties, not ${bodyType}`)
    }
    const query = (operation.parameters ?? []).filter((parameter) => parameter.in === 'query')
    for (const parameter of query) if (!pythonName(parameter.name)) throw new Error(`${path}: the query parameter ${parameter.name} is not a Python name`)
    const success = Object.entries(operation.responses).filter(([status]) => /^2\d\d$/.test(status))
    const response = unionOf(success.map(([status, answer]) => (answer.content === undefined ? 'None' : typeOf(jsonSchema(answer.content), `${methodHint}Response`, `${path} ${status}`))))
    const summary = typeof operation.summary === 'string' ? operation.summary : `${method.toUpperCase()} ${path}`
    const entry = {
      place,
      method: method.toUpperCase(),
      path,
      bodyType,
      query: query.map((parameter) => ({ name: parameter.name, required: parameter.required === true, type: typeOf(parameter.schema, `${methodHint}${pascal(parameter.name)}`, `${path} ?${parameter.name}`) })),
      response: success.length === 0 ? 'None' : response,
      idempotent: isIdempotent(method, path),
      summary,
    }
    operations.push(entry)
    let node = tree
    for (const part of place.slice(0, -1)) node = node[part] ??= {}
    node[place.at(-1)] = entry
  }
}

// ---- Writing ----

const pyString = (text) => JSON.stringify(text)

function docstring(lines, depth) {
  if (lines.length === 0) return []
  const escaped = lines.map((line) => line.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"'))
  if (escaped.length === 1) return [`${pad(depth)}"""${escaped[0]}"""`]
  return [`${pad(depth)}"""${escaped[0]}`, '', ...escaped.slice(1).map((line) => (line === '' ? '' : `${pad(depth)}${line}`)), `${pad(depth)}"""`]
}

const annotationOf = (field) => (field.required ? field.type : `NotRequired[${field.type}]`)

function writeClass(entry) {
  const out = []
  if (entry.functional) {
    for (const line of entry.doc) out.push(`# ${line}`.trimEnd())
    out.push(`${entry.name} = TypedDict(`, `${pad(1)}${pyString(entry.name)},`, `${pad(1)}{`)
    for (const field of entry.fields) {
      for (const line of field.doc) out.push(`${pad(2)}# ${line}`.trimEnd())
      out.push(`${pad(2)}${pyString(field.key)}: ${pyString(annotationOf(field))},`)
    }
    out.push(`${pad(1)}},`, ')')
    return out
  }
  out.push(`class ${entry.name}(${entry.bases.length === 0 ? 'TypedDict' : entry.bases.join(', ')}):`)
  out.push(...docstring(entry.doc, 1))
  if (entry.doc.length > 0 && entry.fields.length > 0) out.push('')
  for (const field of entry.fields) {
    for (const line of field.doc) out.push(`${pad(1)}#: ${line}`.trimEnd())
    out.push(`${pad(1)}${field.key}: ${annotationOf(field)}`)
  }
  if (entry.doc.length === 0 && entry.fields.length === 0) out.push(`${pad(1)}pass`)
  return out
}

/** Classes with their bases first, then aliases with what they name first. */
function ordered(map, dependsOn) {
  const done = new Set()
  const result = []
  const visit = (name) => {
    if (done.has(name) || !map.has(name)) return
    done.add(name)
    for (const other of dependsOn(map.get(name))) visit(other)
    result.push(map.get(name))
  }
  for (const name of map.keys()) visit(name)
  return result
}

function methodLines(name, entry, depth) {
  const out = []
  const parameters = ['self']
  let send = ''
  if (entry.bodyType !== null) {
    parameters.push(`**body: Unpack[${entry.bodyType}]`)
    send = ', body=body'
  } else if (entry.query.length > 0) {
    parameters.push('*', ...entry.query.map((parameter) => (parameter.required ? `${parameter.name}: ${parameter.type}` : `${parameter.name}: ${parameter.type === 'Any' ? 'Any' : `Optional[${parameter.type}]`} = None`)))
    send = `, query={${entry.query.map((parameter) => `${pyString(parameter.name)}: ${parameter.name}`).join(', ')}}`
  }
  out.push(`${pad(depth)}def ${name}(${parameters.join(', ')}) -> ${entry.response}:`)
  out.push(...docstring([`${entry.summary} \`\`${entry.method} ${entry.path}\`\``], depth + 1))
  out.push(`${pad(depth + 1)}return cast(${pyString(entry.response)}, self._transport.request(${pyString(entry.method)}, ${pyString(entry.path)}, idempotent=${entry.idempotent ? 'True' : 'False'}${send}))`)
  return out
}

const groupClass = (name) => `${pascal(name)}Operations`

function writeGroup(className, node, doc) {
  const out = [`class ${className}:`, ...docstring(doc, 1), '']
  const groups = Object.entries(node).filter(([, value]) => value.path === undefined)
  const calls = Object.entries(node).filter(([, value]) => value.path !== undefined)
  out.push(`${pad(1)}def __init__(self, transport: Transport) -> None:`, `${pad(2)}self._transport = transport`)
  for (const [name] of groups) out.push(`${pad(2)}self.${name} = ${groupClass(name)}(transport)`)
  for (const [name, value] of calls) out.push('', ...methodLines(name, value, 1))
  const nested = []
  for (const [name, value] of groups) nested.push(...writeGroup(groupClass(name), value, [`The \`\`${name}\`\` operations.`]), '', '')
  return [...nested, ...out]
}

const lines = [
  '# Generated by scripts/gen-python.mjs from spec/openapi.json. Do not edit by hand: run `pnpm gen:python`.',
  '"""Every schema of the Plotwork API as a ``TypedDict``, and every ``/v1`` operation as a typed method."""',
  '',
  'from __future__ import annotations',
  '',
  'import sys',
  'from typing import TYPE_CHECKING, Any, Dict, List, Literal, NoReturn, Optional, TypedDict, Union, cast',
  '',
  'from ._request import Transport',
  '',
  'if sys.version_info >= (3, 11):',
  '    from typing import NotRequired, Unpack',
  'elif TYPE_CHECKING:',
  '    from typing_extensions import NotRequired, Unpack',
  '',
  '',
]

for (const entry of ordered(classes, (entry) => entry.bases)) lines.push(...writeClass(entry), '', '')
for (const entry of ordered(aliases, (entry) => namesIn(entry.expression))) {
  for (const line of entry.doc) lines.push(`# ${line}`.trimEnd())
  lines.push(`${entry.name} = ${entry.expression}`, '', '')
}

lines.push(...writeGroup('Operations', tree, ['Every ``/v1`` operation, as groups of methods that each send one request through the transport.']), '', '')
lines.push(
  '#: The operations\' addresses, for a test or a tool that lists them.',
  'OPERATION_PATHS = (',
  ...operations.map((operation) => `${pad(1)}${pyString(`${operation.method} ${operation.path}`)},`),
  ')',
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
    process.stderr.write(`${SHOWN} is stale: run pnpm gen:python\n`)
    process.exit(1)
  }
  process.stdout.write(`${SHOWN} is current\n`)
} else {
  writeFileSync(OUT, text)
  process.stdout.write(`wrote ${SHOWN}: ${classes.size} classes, ${aliases.size} aliases, ${operations.length} operations\n`)
}
