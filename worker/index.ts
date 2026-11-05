/**
 * chess.peer.ooo: the static app (ASSETS), and one route, POST /api/push,
 * that sends a notification to a player who is away: "Your move" or "Your
 * game started". The opponent's page asks for it with the player's push
 * subscription (which only that opponent has, given over the game's
 * encrypted link). The text is fixed here, not sent by the page, so the
 * route cannot carry anything else; it sends only to the browsers' push
 * services, and at most once every few seconds per subscription.
 */
import { encryptPayload, isPushService, vapidHeader, type PushSubscriptionJson } from './push'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  /** The VAPID private key (JWK, JSON), a secret. */
  VAPID_PRIVATE_JWK: string
  VAPID_PUBLIC_KEY: string
}

const SUBJECT = 'https://chess.peer.ooo'
const MIN_GAP_MS = 4000
const lastSent = new Map<string, number>()

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function push(request: Request, env: Env): Promise<Response> {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return json({ ok: false, error: 'notifications are not set up here' }, 503)
  const text = await request.text()
  if (text.length > 4096) return json({ ok: false, error: 'too large' }, 413)
  let body: { sub?: PushSubscriptionJson; kind?: string; gameId?: string }
  try { body = JSON.parse(text) } catch { return json({ ok: false, error: 'bad JSON' }, 400) }
  const sub = body.sub
  const kind = body.kind === 'start' || body.kind === 'move' || body.kind === 'test' ? body.kind : null
  if (!kind || !sub || typeof sub.endpoint !== 'string' || !sub.keys || !isPushService(sub.endpoint)) return json({ ok: false, error: 'bad request' }, 400)
  const gameId = String(body.gameId ?? '').replace(/[^\w.-]/g, '').slice(0, 64)
  const now = Date.now()
  if (now - (lastSent.get(sub.endpoint) ?? 0) < MIN_GAP_MS) return json({ ok: false, error: 'too soon' }, 429)
  lastSent.set(sub.endpoint, now)
  if (lastSent.size > 10_000) lastSent.clear()
  let payload: Uint8Array
  try { payload = await encryptPayload(sub, new TextEncoder().encode(JSON.stringify({ kind, gameId }))) } catch { return json({ ok: false, error: 'bad subscription' }, 400) }
  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, JSON.parse(env.VAPID_PRIVATE_JWK), env.VAPID_PUBLIC_KEY, SUBJECT, now),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
      // A newer "your move" for the same game replaces one not yet delivered.
      ...(gameId ? { Topic: gameId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'game' } : {}),
    },
    body: payload,
  })
  // 404/410: the subscription is gone (the player turned notifications off, or uninstalled).
  return json({ ok: response.ok, status: response.status, gone: response.status === 404 || response.status === 410 }, response.ok ? 200 : 502)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/push') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
      // Only the app's own pages ask.
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin) return json({ ok: false, error: 'not from this app' }, 403)
      return push(request, env)
    }
    if (url.pathname === '/api/push-key') return json({ key: env.VAPID_PUBLIC_KEY ?? null })
    return env.ASSETS.fetch(request)
  },
}
