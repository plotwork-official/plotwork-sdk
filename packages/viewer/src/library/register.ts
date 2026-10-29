/**
 * The side-effect entry: `import '@plotwork.official/viewer/library/register'` registers `<plotwork-library>`. `sideEffects` in
 * package.json names it, so a bundler keeps it and tree-shakes the rest.
 */
import { definePlotworkLibrary } from './define.js'

definePlotworkLibrary()
