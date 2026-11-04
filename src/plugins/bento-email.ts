/**
 * Bento Email Provider Plugin
 *
 * Delivers EmDash emails (magic links, invites, comment notifications)
 * through Bentonow via `@bentonow/bento-node-sdk`.
 *
 * Credentials come from Worker secrets / env:
 *   BENTO_SITE_UUID, BENTO_PUBLISHABLE_KEY, BENTO_SECRET_KEY
 *
 * Activate under Admin → Extensions, then select it under Settings → Email.
 */

import { fileURLToPath } from 'node:url'
import { Analytics } from '@bentonow/bento-node-sdk'
import { definePlugin } from 'emdash'
import type { PluginContext, PluginDescriptor, ResolvedPlugin } from 'emdash'
import type { EmailDeliverEvent } from 'emdash/plugin'

export interface BentoEmailConfig {
  /**
   * Sender address. Must be an Author in your Bento account
   * (Emails → Authors). Generic no-reply addresses are not supported.
   */
  from: string

  /** Optional site UUID override; defaults to `BENTO_SITE_UUID`. */
  siteUuid?: string

  /** Optional publishable key override; defaults to `BENTO_PUBLISHABLE_KEY`. */
  publishableKey?: string

  /** Optional secret key override; defaults to `BENTO_SECRET_KEY`. */
  secretKey?: string
}

type BentoCredentials = {
  siteUuid: string
  publishableKey: string
  secretKey: string
}

async function readEnv(name: string): Promise<string | undefined> {
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name]
  }
  try {
    const { env } = await import('cloudflare:workers')
    const value = (env as Record<string, string | undefined>)[name]
    if (value) return value
  } catch {
    // Local `astro dev` may not provide cloudflare:workers
  }
  return undefined
}

async function resolveCredentials(config: BentoEmailConfig): Promise<BentoCredentials> {
  const siteUuid = config.siteUuid ?? (await readEnv('BENTO_SITE_UUID'))
  const publishableKey = config.publishableKey ?? (await readEnv('BENTO_PUBLISHABLE_KEY'))
  const secretKey = config.secretKey ?? (await readEnv('BENTO_SECRET_KEY'))

  const missing = [
    !siteUuid && 'BENTO_SITE_UUID',
    !publishableKey && 'BENTO_PUBLISHABLE_KEY',
    !secretKey && 'BENTO_SECRET_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `[bento-email] Missing credentials: ${missing.join(', ')}. ` +
        `Set them with \`wrangler secret put <NAME>\` (production) or in \`.env\` / \`.dev.vars\` (local).`,
    )
  }

  return {
    siteUuid: siteUuid!,
    publishableKey: publishableKey!,
    secretKey: secretKey!,
  }
}

function toHtmlBody(message: EmailDeliverEvent['message']): string {
  if (message.html) return message.html
  const escaped = message.text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<pre style="font-family:inherit;white-space:pre-wrap">${escaped}</pre>`
}

/**
 * Bento's transactional API has no Cc header. SMTP delivery queues one email
 * per recipient, so Cc addresses are sent the same way. `reply_to` is the
 * field Bento's SMTP bridge writes for a Reply-To header.
 */
function bentoEmails(message: EmailDeliverEvent['message'], from: string) {
  const seen = new Set<string>()
  const recipients: string[] = []
  for (const address of [message.to, ...(message.cc ?? [])]) {
    const trimmed = address.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    recipients.push(trimmed)
  }

  return recipients.map((to) => ({
    to,
    from,
    subject: message.subject,
    html_body: toHtmlBody(message),
    transactional: true as const,
    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
  }))
}

export function createBentoEmailDeliver(
  config: BentoEmailConfig,
): (event: EmailDeliverEvent, ctx: PluginContext) => Promise<void> {
  return async (event, ctx) => {
    const { message } = event
    const credentials = await resolveCredentials(config)

    const bento = new Analytics({
      authentication: {
        publishableKey: credentials.publishableKey,
        secretKey: credentials.secretKey,
      },
      siteUuid: credentials.siteUuid,
    })

    const emails = bentoEmails(message, config.from)
    const queued = await bento.V1.Batch.sendTransactionalEmails({
      emails,
    })

    ctx.log.info('email delivered via Bento', {
      to: message.to,
      cc: message.cc,
      replyTo: message.replyTo,
      subject: message.subject,
      from: config.from,
      recipients: emails.length,
      queued,
    })
  }
}

function assertValidFrom(config: BentoEmailConfig): void {
  if (!config.from || !config.from.includes('@')) {
    throw new Error(
      '[bento-email] config.from is required and must be a Bento Author address ' +
        '(e.g. { from: "hello@johnathan.org" }).',
    )
  }
}

export function createPlugin(config: BentoEmailConfig): ResolvedPlugin {
  assertValidFrom(config)
  return definePlugin({
    id: 'bento-email',
    version: '1.0.0',
    capabilities: ['hooks.email-transport:register'],
    hooks: {
      'email:deliver': {
        exclusive: true,
        handler: createBentoEmailDeliver(config),
      },
    },
  })
}

/**
 * Create a Bento email provider plugin descriptor for `emdash({ plugins: [...] })`.
 */
export function bentoEmail(config: BentoEmailConfig): PluginDescriptor<BentoEmailConfig> {
  assertValidFrom(config)
  return {
    id: 'bento-email',
    version: '1.0.0',
    entrypoint: fileURLToPath(new URL('./bento-email.ts', import.meta.url)),
    format: 'native',
    options: config,
    capabilities: ['hooks.email-transport:register'],
  }
}

export default createPlugin
