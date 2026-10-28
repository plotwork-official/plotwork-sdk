import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Pictures drawn by the Plotwork engine from `spec/fixtures/checkout.diagram` with the command line: `checkout.svg` in both schemes
 * with its source, `checkout.dark.svg` dark only and without it. `spec/README.md` says how to draw them again.
 */
/* Tests run from the package's folder; the jsdom environment gives `import.meta.url` a `/@fs/` address, so the path starts there. */
const fixture = (name: string): string => readFileSync(resolve(process.cwd(), '../../spec/fixtures', name), 'utf8')

export const CHECKOUT_SOURCE = fixture('checkout.diagram')
export const CHECKOUT_SVG = fixture('checkout.svg')
export const CHECKOUT_DARK_SVG = fixture('checkout.dark.svg')
