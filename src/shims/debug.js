/**
 * ESM-compatible drop-in replacement for the `debug` package.
 *
 * Astro 6 + `@astrojs/cloudflare` v13 run `astro dev` (SSR/prerender) inside
 * `workerd`, whose module runner has no CommonJS `module`/`require`/`exports`
 * globals. The real `debug` package (pulled in transitively via micromark,
 * express, babel, etc.) references `module.exports` at the top level, which
 * crashes the dev runner with "module is not defined".
 *
 * `obug` is a pure-ESM reimplementation of `debug`. This shim re-exports it
 * with a `debug`-compatible default export (the factory function with the
 * named helpers attached as properties) so existing `import debug from 'debug'`
 * / `require('debug')` call sites keep working unchanged.
 *
 * Aliased via `vite.resolve.alias` in `astro.config.mjs`. Mirrors the upstream
 * `@astrojs/cloudflare` fix (withastro/astro#16569).
 */
import { createDebug, disable, enable, enabled, namespaces } from 'obug'

function debug(...args) {
  return createDebug(...args)
}

debug.createDebug = createDebug
debug.enable = enable
debug.disable = disable
debug.enabled = enabled
debug.namespaces = namespaces
// Some consumers register custom formatters or call these helpers directly.
debug.formatters = {}
debug.humanize = (value) => String(value)
debug.coerce = (value) => value
debug.destroy = () => {}

export default debug
export { createDebug, disable, enable, enabled, namespaces }
