import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import emdash, { local } from 'emdash/astro'
import { sqlite } from 'emdash/db'
import { d1, r2 } from '@emdash-cms/cloudflare'
import { bentoEmail } from './src/plugins/bento-email.ts'
import { workersCache } from './src/cache/workers-cache.ts'

// Every Astro command here runs under @astrojs/cloudflare, which executes dev,
// build, prerender, and `astro check` inside workerd — not Node. The native
// `better-sqlite3` SQLite adapter cannot load in workerd (it references the
// CommonJS `module` global and a native addon), so always use the Cloudflare
// D1/R2 bindings. During `astro dev`/`astro check` these are served locally by
// miniflare from wrangler.jsonc; production builds use the real bindings.
const useCloudflareBindings = true

// Aggressive edge HTML caching. EmDash invalidates Cache-Tags on content
// publish/update/delete, which our workersCache provider maps to cache.purge().
const PAGE_MAX_AGE = 3600 // 1 hour fresh at the edge
const PAGE_SWR = 86400 // serve stale up to 1 day while revalidating

export default defineConfig({
  site: 'https://johnathan.org',
  output: 'server',
  adapter: cloudflare({
    prerenderEnvironment: 'node',
  }),
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // Astro 6 + @astrojs/cloudflare run dev SSR/prerender inside workerd,
        // which has no CommonJS `module` global. The transitive `debug`
        // package references `module.exports` at load time and crashes the
        // dev runner ("module is not defined"). Alias it to a pure-ESM shim
        // backed by `obug`. Mirrors withastro/astro#16569.
        debug: fileURLToPath(new URL('./src/shims/debug.js', import.meta.url)),
      },
    },
  },
  integrations: [
    react(),
    emdash({
      // Shared HTML cache cannot vary on session cookies — use the client
      // toolbar bootstrap so editors still get an Edit pill on cached pages.
      toolbar: 'client',
      database: useCloudflareBindings
        ? d1({ binding: 'DB' })
        : sqlite({ url: 'file:./data.db' }),
      storage: useCloudflareBindings
        ? r2({
            binding: 'MEDIA',
            publicUrl: process.env.PUBLIC_MEDIA_URL,
          })
        : local({
            directory: './uploads',
            baseUrl: '/_emdash/api/media/file',
          }),
      plugins: [
        // `from` must be a Bento Author (Emails → Authors). No no-reply addresses.
        bentoEmail({ from: 'johnathan@johnathan.org' }),
      ],
    }),
  ],
  experimental: {
    cache: {
      provider: workersCache({ browserMaxAge: 60 }),
    },
    routeRules: {
      // Homepage lists recent posts and site chrome.
      '/': {
        maxAge: PAGE_MAX_AGE,
        swr: PAGE_SWR,
        tags: ['posts', 'pages', 'site'],
      },
      '/blog': {
        maxAge: PAGE_MAX_AGE,
        swr: PAGE_SWR,
        tags: ['posts', 'site'],
      },
      '/blog/[slug]': {
        maxAge: PAGE_MAX_AGE,
        swr: PAGE_SWR,
        tags: ['posts', 'site'],
      },
      '/projects': {
        maxAge: PAGE_MAX_AGE,
        swr: PAGE_SWR,
        tags: ['projects', 'site'],
      },
      '/projects/[slug]': {
        maxAge: PAGE_MAX_AGE,
        swr: PAGE_SWR,
        tags: ['projects', 'site'],
      },
      '/[slug]': {
        maxAge: PAGE_MAX_AGE,
        swr: PAGE_SWR,
        // Pages can embed resume blocks from these collections.
        tags: ['pages', 'work_experience', 'certifications', 'site'],
      },
      '/links': {
        maxAge: 300,
        swr: 3600,
        tags: ['pages', 'site'],
      },
      // Query-keyed; short TTL is enough.
      '/search': {
        maxAge: 60,
        swr: 300,
        tags: ['posts', 'pages', 'projects'],
      },
      '/rss.xml': {
        maxAge: 600,
        swr: PAGE_SWR,
        tags: ['posts'],
      },
      '/sitemap.xml': {
        maxAge: 600,
        swr: PAGE_SWR,
        tags: ['posts', 'pages', 'projects'],
      },
      '/api/raindrop': {
        maxAge: 300,
        swr: 600,
      },
      '/404': {
        maxAge: 300,
        swr: 3600,
      },
    },
  },
})
