#!/usr/bin/env node
// npm run push-keys
//
// Makes the VAPID key pair chess.peer.ooo signs its notifications with, and
// stores both halves as secrets of the pigeonchess Worker (wrangler, with
// your Cloudflare login). The private key goes from memory straight to
// wrangler's input: it is never printed or written to a file.
//
// Run it once. Running it again makes a new pair: every subscription made
// with the old one stops working, and players' pages subscribe again.
import { spawnSync } from 'node:child_process'

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey))
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')

for (const [name, value] of [['VAPID_PRIVATE_JWK', privateJwk], ['VAPID_PUBLIC_KEY', publicKey]]) {
  const r = spawnSync('npx', ['--yes', 'wrangler@4', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] })
  if (r.status !== 0) { console.error(`[push-keys] storing ${name} failed`); process.exit(1) }
}
console.log('[push-keys] done: chess.peer.ooo can send notifications now.')
