/**
 * The type of a `.diagram` import. Add `"types": ["@plotwork.official/vite/client"]` to tsconfig.json, or
 * `/// <reference types="@plotwork.official/vite/client" />` to a declaration file.
 */
declare module '*.diagram' {
  /** The picture the Plotwork engine drew from the file, as SVG text. Give it to `<plotwork-diagram>`'s `svg`. */
  const svg: string
  /** `sha256-<hex>` of that text: what the viewer's `fingerprint` pins. */
  export const fingerprint: string
  export default svg
}
