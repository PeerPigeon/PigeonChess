/**
 * Web Push from the app's own server: the payload encrypted to the browser
 * (RFC 8291, aes128gcm) and the request signed with the app's VAPID key
 * (RFC 8292). WebCrypto only, so it runs in a Cloudflare Worker.
 */

export interface PushSubscriptionJson { endpoint: string; keys: { p256dh: string; auth: string } }

const enc = new TextEncoder()

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = new Uint8Array(bytes as ArrayBuffer)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64url(text: string): Uint8Array {
  const s = text.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, bytes * 8))
}

/**
 * The encrypted body for one push (one record). `as` (the sender's one-time
 * ECDH pair) and `salt` are made fresh unless given (tests).
 */
export async function encryptPayload(sub: PushSubscriptionJson, payload: Uint8Array, given: { as?: CryptoKeyPair; salt?: Uint8Array } = {}): Promise<Uint8Array> {
  const uaPublic = unb64url(sub.keys.p256dh)
  const auth = unb64url(sub.keys.auth)
  if (uaPublic.length !== 65 || auth.length !== 16) throw new Error('bad subscription keys')
  const as = given.as ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const ua = await crypto.subtle.importKey('raw', uaPublic as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua } as EcdhKeyDeriveParams, as.privateKey, 256))
  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = given.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, concat(payload, Uint8Array.of(2)) as BufferSource))
  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, Uint8Array.of(asPublic.length), asPublic, sealed)
}

/** The VAPID Authorization header for a push service. */
export async function vapidHeader(endpoint: string, privateJwk: JsonWebKey, publicKey: string, subject: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`))
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${publicKey}`
}

/** Push services the browsers use: nothing else is ever sent to. */
export function isPushService(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return h === 'fcm.googleapis.com' || h === 'android.googleapis.com' || h.endsWith('.push.apple.com')
      || h === 'updates.push.services.mozilla.com' || h.endsWith('.push.services.mozilla.com') || h.endsWith('.notify.windows.com')
  } catch {
    return false
  }
}
