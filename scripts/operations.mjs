/**
 * What every language's client generator shares: where an operation sits in the client's tree, and which operations are safe to
 * send twice. `gen-sdk.mjs` (TypeScript) and `gen-python.mjs` (Python) both read these, so the two clients cannot place or retry
 * an operation differently.
 */

/** `convert-mermaid` as `convertMermaid`. */
export const camel = (text) => text.replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase())

/** Where an operation sits in the client's tree: `/v1/diagrams/convert-mermaid` is `diagrams.convertMermaid`. */
export function placeOf(method, path) {
  const parts = path.replace(/^\/v1\//, '').split('/')
  if (parts.length === 1) {
    const [only] = parts
    if (only === 'import') return ['importSource']
    if (only === 'icons' && method === 'get') return ['icons', 'search']
    return [camel(only)]
  }
  return parts.map(camel)
}

/** True when sending the request twice does nothing more than once: every operation but publishing. */
export function isIdempotent(method, path) {
  return method === 'get' || !/\/publish$/.test(path)
}

/** The JSON schema of a request or response body. */
export function jsonSchema(content) {
  return content?.['application/json']?.schema
}
