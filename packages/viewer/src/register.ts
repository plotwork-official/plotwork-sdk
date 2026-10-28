/**
 * The side-effect entry: `import '@buun_group/plotwork-viewer/register'` registers `<plotwork-diagram>`. It is the only module of the
 * package with a side effect, and `sideEffects` in package.json names it, so a bundler keeps it and tree-shakes the rest.
 */
import { definePlotworkDiagram } from './element/define.js'

definePlotworkDiagram()
