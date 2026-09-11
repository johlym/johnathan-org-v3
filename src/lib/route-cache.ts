/**
 * Helpers for tagging SSR responses so EmDash content writes can selectively
 * purge Cloudflare Workers Caching via Astro's route-cache API.
 */

export type RouteCache = {
  enabled: boolean
  set: (
    options:
      | false
      | {
          maxAge?: number
          swr?: number
          tags?: string[]
          lastModified?: Date
          etag?: string
        },
  ) => void
}

export type CacheHintLike = {
  tags?: string[]
  lastModified?: Date
} | null | undefined

/**
 * Merge content cache hints (collection + entry tags from EmDash) onto the
 * current response. No-op when caching is disabled (dev / no provider).
 *
 * `Astro.cache` is `undefined` under `astro dev` (the Workers cache provider is
 * only wired up at the edge), so `cache` may be nullish here.
 */
export function applyCacheHints(
  cache: RouteCache | null | undefined,
  ...hints: CacheHintLike[]
): void {
  if (!cache || !cache.enabled) return
  for (const hint of hints) {
    if (!hint) continue
    if (!hint.tags?.length && !hint.lastModified) continue
    cache.set({
      ...(hint.tags?.length ? { tags: hint.tags } : {}),
      ...(hint.lastModified ? { lastModified: hint.lastModified } : {}),
    })
  }
}

/**
 * Tag a single content entry so publish/update/delete of that row purges this
 * page. EmDash invalidates `[collection, id]` on writes.
 */
export function tagContentEntry(
  cache: RouteCache | null | undefined,
  collection: string,
  id: string | null | undefined,
  extraTags: string[] = [],
): void {
  if (!cache || !cache.enabled || !id) return
  cache.set({ tags: [collection, id, ...extraTags] })
}
