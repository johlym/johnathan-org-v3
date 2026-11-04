/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference path="../node_modules/emdash/locals.d.ts" />

/**
 * Runtime-only Cloudflare module. `astro check` does not load Wrangler's
 * generated worker types, and these imports are dynamic so the Worker bundle
 * is the only place they resolve.
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>
  export const cache: {
    purge(options: {
      tags?: string[]
      pathPrefixes?: string[]
    }): Promise<{ success?: boolean; errors?: unknown[] } | void>
  }
}

interface ImportMetaEnv {
  readonly RAINDROP_API_TEST_TOKEN?: string
  readonly PUBLIC_MEDIA_URL?: string
  readonly PUBLIC_IMAGE_HOST?: string
  readonly EMDASH_CLOUDFLARE?: string
  readonly BENTO_SITE_UUID?: string
  readonly BENTO_PUBLISHABLE_KEY?: string
  readonly BENTO_SECRET_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
