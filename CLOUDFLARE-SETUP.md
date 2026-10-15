# Cloudflare Setup — EmDash + Astro (single Worker)

Ops runbook after the Payload → EmDash migration. The public site and CMS
admin now live in **one** Worker: `johnathan-org-frontend`.

## Architecture

| Resource | Purpose |
|----------|---------|
| Worker `johnathan-org-frontend` | Astro SSR + EmDash (`/_emdash/admin`) |
| D1 `johnathan-org-emdash` | EmDash content/schema |
| R2 `johnathan-org-media` | Media library |
| Custom domains | `johnathan.org`, `www.johnathan.org` |

Admin: `https://johnathan.org/_emdash/admin`

Legacy Payload Worker `johnathan-org-cms` / `cms.johnathan.org` can be
kept briefly as rollback, then deleted.

## 1. Provision infrastructure

Infrastructure already provisioned (2026-07-30):

| Resource | ID / name |
|----------|-----------|
| D1 `johnathan-org-emdash` | `8656333c-aafb-4a71-9be2-c45fd43b92d9` |
| R2 `johnathan-org-media` | created |
| Worker | `johnathan-org-frontend` |
| workers.dev | `https://johnathan-org-frontend.jelyman1450.workers.dev` |
| Secret | `EMDASH_ENCRYPTION_KEY` set |
| KV | `SESSION` auto-provisioned by Astro adapter |

Bindings live in [`wrangler.jsonc`](wrangler.jsonc) at the repo root:
`DB` → D1, `MEDIA` → R2, cron `* * * * *`, `worker_loaders` for plugins.

Optional: enable public access on the R2 bucket (or attach `media.johnathan.org`)
and set `PUBLIC_MEDIA_URL` for the build.

Enable Cloudflare Image Resizing on the `johnathan.org` zone if not already on.

## 2. Secrets

```bash
# From the repo root (this is the Astro app; there is no astro-frontend/ subdir)

# EmDash plugin secret encryption (already set on the Worker)
# npx emdash secrets generate | pnpm exec wrangler secret put EMDASH_ENCRYPTION_KEY

# Raindrop proxy — still needed (copy from old Payload Worker secrets)
pnpm exec wrangler secret put RAINDROP_API_TEST_TOKEN

# Bento transactional email (magic links, invites, comment notifications)
pnpm exec wrangler secret put BENTO_SITE_UUID
pnpm exec wrangler secret put BENTO_PUBLISHABLE_KEY
pnpm exec wrangler secret put BENTO_SECRET_KEY
```

## 3. Deploy status

Worker is deployed. Custom domain already hits the EmDash Worker
(`server-timing` includes EmDash runtime). Admin redirects to setup:

`https://johnathan.org/_emdash/admin` → `/_emdash/admin/setup`

**Your next interactive step:** complete the Setup Wizard (create admin
user). Seed from `.emdash/seed.json` applies on first boot when the DB
is empty.

Redeploy after code changes:

```bash
pnpm run deploy
```

## 4. Import Payload content

With EmDash running locally or against production:

```bash
# Create an API token in EmDash admin (content + schema + menus + settings)

PAYLOAD_API_URL=https://cms.johnathan.org \
EMDASH_URL=https://johnathan.org \
EMDASH_TOKEN=... \
pnpm run migrate:payload

# Rehearse first with:
# DRY_RUN=1 pnpm run migrate:payload
```

Verify public URLs, `/links`, resume embeds, RSS, sitemap.

## 5. Domains

Dashboard → Workers → `johnathan-org-frontend` → Custom Domains → ensure
`johnathan.org` and `www.johnathan.org` are attached.

**Decommissioned (2026-07-30):** Worker `johnathan-org-cms` and D1
`johnathan-org` deleted. Custom domain `cms.johnathan.org` removed with
the Worker. R2 bucket `payload-d1` kept for now in case any migrated
content still references legacy media URLs.

## 6. Post-migration: import legacy Markdown posts

Done — MD posts were imported into EmDash and the file-based
`src/content/posts/` collection / dual-source blog layer was removed.
The import script remains under `scripts/import-md-posts/` (source tree
is in git history if you need to re-run from a checkout of that path).

## 7. Local development

Every Astro command (`dev`, `build`, `check`) runs under `@astrojs/cloudflare` / **workerd**, not Node (`astro.config.mjs` sets `useCloudflareBindings = true`). The native `better-sqlite3` adapter cannot load in workerd, so local D1 and R2 come from **miniflare** via `wrangler.jsonc`. Do not expect `./data.db` or `./uploads`.

```bash
pnpm install
pnpm dev
# → http://localhost:4321
# → http://localhost:4321/_emdash/admin
```

First boot runs the EmDash setup wizard. Seed from `.emdash/seed.json` applies when the D1 database is empty. Edge HTML cache (`Astro.cache` / Workers Caching) is **production-only** — `Astro.cache` is undefined under `astro dev` (`src/lib/route-cache.ts`). EmDash admin needs the Vite **7.3.6** pin in `package.json` (`pnpm.overrides`); a newer Vite breaks React refresh in the admin.

## Notes

- **Full-page edge cache:** Workers Caching is enabled (`cache.enabled` in
  `wrangler.jsonc`) with Astro route rules + `workersCache` provider
  (`src/cache/`). Anonymous HTML is cached at the edge (`Cf-Cache-Status: HIT`
  means the Worker did not run). Browser TTL stays short (60s); edge TTL is
  1 hour with stale-while-revalidate up to 1 day. Local `pnpm dev` does not
  exercise this path.
- **Automatic purge on EmDash writes:** publish / update / unpublish / delete
  already call Astro `cache.invalidate({ tags: [collection, id] })`. The
  provider maps that to Workers `cache.purge({ tags })`, so the post/page,
  blog index, home, RSS, and sitemap refresh without a Deploy Hook.
- Preview / `?_edit` responses are never cached (`private, no-store` / route
  cache opt-out). Visual editing uses `toolbar: "client"` so cached anonymous
  HTML still shows an Edit pill for logged-in editors.
- Scheduled publish requires the Worker cron trigger (already in wrangler);
  the scheduled handler also purges tags for anything it publishes.
- Optional later: KV object cache (`objectCache: kvCache(...)`), D1 read replicas.
- Email: `bentoEmail` plugin (`src/plugins/bento-email.ts`). After deploy,
  activate under **Admin → Extensions**, then select it under **Settings → Email**.
  `from` in `astro.config.mjs` must match a Bento Author.

### Verifying cache

```bash
# First request — miss (Worker runs)
curl -sI https://johnathan.org/ | grep -iE 'cf-cache-status|cache-control|cloudflare-cdn-cache-control|cache-tag'

# Second request — hit (Worker skipped)
curl -sI https://johnathan.org/ | grep -i cf-cache-status
```

After publishing a post in `/_emdash/admin`, the next request for that URL
(and list pages tagged `posts`) should miss once, then hit again.
