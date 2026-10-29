/**
 * The customer's script the smoke test runs against a real deployment with the installed `@plotwork.official/sdk`.
 *
 *   node api.mjs checks      every read-only call, and a refused call with a wrong key
 *   node api.mjs publish a   publishes version a (or b) of the smoke diagram under the stable link `sdk-smoke`
 *
 * Reads PLOTWORK_BASE_URL and PLOTWORK_API_KEY. Prints `ok <name>` for each check, and the publish answer as one line of JSON.
 */
import { Plotwork, PlotworkApiError } from '@plotwork.official/sdk'

const baseUrl = process.env.PLOTWORK_BASE_URL
const apiKey = process.env.PLOTWORK_API_KEY
if (!baseUrl || !apiKey) throw new Error('PLOTWORK_BASE_URL and PLOTWORK_API_KEY are required')

const plotwork = new Plotwork({ apiKey, baseUrl })

const VALID = 'flow "SDK smoke"\nnode web service "Web tier"\nnode api service "Orders API"\nnode db database "Orders"\nweb -> api : "places order"\napi -> db : "writes"\n'
const INVALID = 'flow "SDK smoke"\nnode web service "Web tier"\nweb -> nowhere\n'
/** Two fixed versions, so the API keeps one hosted diagram for each however often the test runs. */
const VERSIONS = {
  a: VALID,
  b: `${VALID}node cache cache "Cache"\napi -> cache : "reads"\n`,
}
const ALIAS = 'sdk-smoke'

function ok(name, condition, detail) {
  if (!condition) throw new Error(`${name} failed${detail === undefined ? '' : `: ${JSON.stringify(detail).slice(0, 400)}`}`)
  process.stdout.write(`ok ${name}\n`)
}

async function checks() {
  try {
    // A key of the right shape that no account holds.
    await new Plotwork({ apiKey: ['pw', 'smoke', 'refused'].join('_'), baseUrl }).vocabulary()
    ok('a wrong key is refused', false)
  } catch (error) {
    ok('a wrong key is refused', error instanceof PlotworkApiError && error.status === 401 && error.errorCode.startsWith('auth.'), { status: error.status, errorCode: error.errorCode })
  }

  const vocabulary = await plotwork.vocabulary()
  ok('vocabulary answers', vocabulary !== null && typeof vocabulary === 'object' && Object.keys(vocabulary).length > 0)

  const valid = await plotwork.diagrams.validate({ source: VALID })
  ok('a valid diagram validates', valid.valid === true && valid.kind === 'flow', valid)

  const invalid = await plotwork.diagrams.validate({ source: INVALID })
  ok('a mistake is an answer with a line, not an exception', invalid.valid === false && typeof invalid.errors[0]?.line === 'number', invalid)

  const rendered = await plotwork.diagrams.render({ source: VALID, scheme: 'auto' })
  ok('render draws an SVG the viewer can read', rendered.svg.startsWith('<svg') && rendered.svg.includes('data-node'))

  const icons = await plotwork.icons.search({ q: 'aws lambda' })
  ok('icon search finds an icon', Array.isArray(icons.items) && icons.items.length > 0, icons)
}

async function publish(version) {
  const source = VERSIONS[version]
  if (source === undefined) throw new Error(`No version ${version}; use a or b`)
  const answer = await plotwork.diagrams.publish({ source, name: `SDK smoke ${version}`, alias: ALIAS, scheme: 'auto' })
  if (!('url' in answer)) throw new Error('The key publishes into an organisation library, which has no public link. Use a personal key.')
  if (answer.stableLink === undefined) throw new Error('The publish answer has no stable link for the alias')
  process.stdout.write(`${JSON.stringify({ url: answer.url, stableUrl: answer.stableLink.url })}\n`)
}

const [command, version] = process.argv.slice(2)
if (command === 'checks') await checks()
else if (command === 'publish') await publish(version ?? 'a')
else throw new Error('Usage: node api.mjs checks | publish a|b')
