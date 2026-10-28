// Type-checked by `tsc --noEmit`: the README's example, so it cannot drift from the generated types. Never run.
import { Plotwork, PlotworkApiError } from '../index.js'

export async function readmeExample(apiKey: string): Promise<void> {
  const plotwork = new Plotwork({ apiKey })
  const source = 'flow "Checkout"\nnode web service "Web tier"\nnode api service "Orders API"\nweb -> api : "places order"\n'
  const checked = await plotwork.diagrams.validate({ source })
  if (!checked.valid) console.log(checked.errors)
  const published = await plotwork.diagrams.publish({ source })
  if ('url' in published) console.log(published.url)
  try {
    await plotwork.diagrams.render({ source })
  } catch (error) {
    if (error instanceof PlotworkApiError) console.log(error.status, error.errorCode, error.requestId)
  }
}
