// A stand-in for the Plotwork command line's `render`, so the plugin is tested without the engine: it writes an SVG that names the
// file, the scheme and whether the source is kept, or fails like the command line does for a file that says BROKEN.
import { readFileSync, writeFileSync } from 'node:fs'

const [command, file, ...rest] = process.argv.slice(2)
const option = (name) => {
  const index = rest.indexOf(name)
  return index === -1 ? undefined : rest[index + 1]
}
if (command !== 'render') process.exit(2)
const text = readFileSync(file, 'utf8')
if (text.includes('BROKEN')) {
  process.stderr.write('error E100: Unexpected text after the end of the statement\n   2 | BROKEN\nhint: Write one edge per line.\n')
  process.exit(1)
}
const title = /"([^"]+)"/.exec(text)?.[1] ?? 'Diagram'
const kept = rest.includes('--no-embed-source') ? 'no' : 'yes'
writeFileSync(option('--out'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-scheme-asked="${option('--scheme')}" data-source="${kept}"><title>${title}</title></svg>`)
