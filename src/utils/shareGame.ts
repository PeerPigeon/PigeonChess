/**
 * Links to a played game, for anyone (signed in or not, on any device).
 *
 * A link names the game where it is kept: the player's own room on the storage
 * servers (PigeonFS), a frozen record signed by the player (`by`: their key),
 * so what it shows is the game as it was played and kept, unchangeable. It also
 * carries the game itself, packed (in the #part, which is not sent to any
 * server), so it still opens when the storage servers can't be reached; then
 * the page says the moves come from the link alone, unchecked.
 */
import type { GameHistoryEntry } from '@/types'
import { createChess } from '@/utils/variant'

type Packed = {
  g: string; c: 'white' | 'black'; r: GameHistoryEntry['result']; d: number; m: string
  w?: string; b?: string; u?: string; o?: string; op?: string; ai?: 1; ad?: number; ae?: 'standard' | 'pigeonai'; p?: string
}

const toB64 = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function squeeze(bytes: Uint8Array, how: 'compress' | 'decompress'): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(how === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
const canSqueeze = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

/** A game, packed for a link: 'z' + deflated JSON, or 'j' + JSON where the browser can't deflate. */
export async function packGame(game: GameHistoryEntry): Promise<string> {
  const p: Packed = { g: game.gameId, c: game.myColor, r: game.result, d: game.date, m: game.moves.join(' ') }
  if (game.whitePlayer) p.w = game.whitePlayer
  if (game.blackPlayer) p.b = game.blackPlayer
  if (game.myUsername?.trim()) p.u = game.myUsername.trim()
  if (game.opponentUsername?.trim()) p.o = game.opponentUsername.trim()
  if (game.opening) p.op = game.opening
  if (game.isAI) { p.ai = 1; if (game.aiDifficulty !== undefined) p.ad = game.aiDifficulty; if (game.aiEngine) p.ae = game.aiEngine }
  if (game.opponent && !game.isAI) p.p = game.opponent
  const json = new TextEncoder().encode(JSON.stringify(p))
  return canSqueeze() ? `z${toB64(await squeeze(json, 'compress'))}` : `j${toB64(json)}`
}

/** A game packed by packGame, or null when the text isn't one (or its moves aren't a game of chess). */
export async function unpackGame(text: string): Promise<GameHistoryEntry | null> {
  try {
    const raw = text[0] === 'z' ? await squeeze(fromB64(text.slice(1)), 'decompress') : text[0] === 'j' ? fromB64(text.slice(1)) : null
    if (!raw) return null
    const p = JSON.parse(new TextDecoder().decode(raw)) as Packed
    if (typeof p.g !== 'string' || (p.c !== 'white' && p.c !== 'black') || typeof p.m !== 'string') return null
    const game: GameHistoryEntry = {
      gameId: p.g, myColor: p.c, result: p.r, date: Number(p.d) || 0, moves: p.m ? p.m.split(' ') : [],
      opponent: p.p ?? (p.ai ? 'AI' : ''), whitePlayer: p.w, blackPlayer: p.b, myUsername: p.u, opponentUsername: p.o, opening: p.op,
      ...(p.ai ? { isAI: true, aiDifficulty: p.ad, aiEngine: p.ae } : {}),
    }
    return movesPlay(game.moves) ? game : null
  } catch {
    return null
  }
}

/** Whether these moves can be played, in order, from the start. */
export function movesPlay(moves: string[]): boolean {
  const board = createChess()
  try { for (const m of moves) if (!board.move(m)) return false } catch { return false }
  return true
}

/** The link to a game kept by the player whose key is `signer`. */
export async function shareUrl(game: GameHistoryEntry, signer: string): Promise<string> {
  const url = new URL(location.origin + location.pathname)
  url.searchParams.set('game', game.gameId)
  url.searchParams.set('by', signer)
  url.hash = `m=${await packGame(game)}`
  return url.toString()
}

/** The game a link on this page names: its id, the player's key, and the game it carries (if any). */
export function sharedGameInUrl(): { gameId: string; signer: string; packed: string | null } | null {
  const q = new URLSearchParams(location.search)
  const gameId = q.get('game'), signer = q.get('by')
  if (!gameId || !signer) return null
  const packed = new URLSearchParams(location.hash.slice(1)).get('m')
  return { gameId, signer, packed }
}

/** Take the shared game out of the page's address (when leaving it). */
export function forgetSharedGameInUrl(): void {
  const url = new URL(location.href)
  if (!url.searchParams.has('game') && !url.hash.includes('m=')) return
  url.searchParams.delete('game')
  url.searchParams.delete('by')
  url.hash = ''
  history.replaceState(history.state, '', url.toString())
}

/** Give the link to the player: the system's share sheet where there is one, else the clipboard. */
/**
 * Copy a game's link (the link may still be in the making: it needs the player's key, and the game packed).
 * Safari copies only inside the tap itself, so the copy is started at once, with the link to come
 * (ClipboardItem with a promise); elsewhere it is copied once ready. Where nothing can be copied: the
 * share sheet, if there is one.
 */
export async function offerLink(url: string | Promise<string>, title: string): Promise<'shared' | 'copied' | 'failed'> {
  const link = Promise.resolve(url)
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': link.then((u) => new Blob([u], { type: 'text/plain' })) })])
      return 'copied'
    }
  } catch { /* the plain way, below */ }
  try { await navigator.clipboard.writeText(await link); return 'copied' } catch { /* the share sheet, below */ }
  try {
    if (navigator.share) { await navigator.share({ title, url: await link }); return 'shared' }
  } catch { /* nothing more to try */ }
  return 'failed'
}
