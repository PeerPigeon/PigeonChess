/**
 * A seat: who you are in one game, by a key, not by a peer ID.
 *
 * Peer IDs change on every page load (PeerPigeon retires the old one), and
 * any peer can say anything. So each game has a key pair per player (ECDSA
 * P-256, made for that game): the two players swap public keys in the match
 * offer and answer, and from then on every message about the game goes
 * sealed, signed with the sender's seat key and numbered. The other side
 * acts only on sealed messages its opponent's key signed, with a number it
 * has not seen yet, whatever peer ID they came from:
 *
 *  - a forged move (or resign, or chat) from anyone else is dropped;
 *  - a replayed one is dropped;
 *  - after a reload (a new peer ID), the first sealed message from the new
 *    ID moves the game over to it: the signature shows it is the same player.
 *
 * The seat and the game's state are kept in this browser (localStorage), so a
 * reload, or a tap on a notification, picks the game back up.
 */

const STORE = 'pigeonchess:seat'
/** How far behind the newest a message may arrive (and still not twice). */
const REPLAY_WINDOW = 200

export interface SeatKeys { pub: string; priv: JsonWebKey }

export interface SavedGame {
  gameId: string
  myColor: 'white' | 'black'
  opponentId: string
  moves: string[]
  timeControl: { minutes: number; increment: number }
  whiteTime: number
  blackTime: number
  createdAt: number
  savedAt: number
  started: boolean
}

export interface Seat {
  gameId: string
  mine: SeatKeys
  theirs: string
  /** Number of the last message sent; the highest received, and the recent ones (messages can arrive out of order). */
  sent: number
  heard: number
  recent?: number[]
  game?: SavedGame
  /** The opponent's push subscription, when they gave one. */
  theirPush?: unknown
}

export interface Sealed { type: 'sealed'; gameId: string; n: number; body: string; sig: string }

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer)))
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

export async function makeSeatKeys(): Promise<SeatKeys> {
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])
  return {
    pub: b64(await crypto.subtle.exportKey('raw', pair.publicKey)),
    priv: await crypto.subtle.exportKey('jwk', pair.privateKey),
  }
}

const signed = (gameId: string, n: number, body: string) => new TextEncoder().encode(`pigeonchess-seat|${gameId}|${n}|${body}`)

export async function seal(seat: Seat, body: string): Promise<Sealed> {
  const n = ++seat.sent
  const key = await crypto.subtle.importKey('jwk', seat.mine.priv, ALG, false, ['sign'])
  const sig = await crypto.subtle.sign(SIGN, key, signed(seat.gameId, n, body))
  return { type: 'sealed', gameId: seat.gameId, n, body, sig: b64(sig) }
}

/** The message inside, if the opponent's seat key signed it and it is new; null otherwise. */
export async function open(seat: Seat, sealed: Sealed): Promise<string | null> {
  if (!sealed || sealed.gameId !== seat.gameId || typeof sealed.body !== 'string' || !Number.isInteger(sealed.n) || sealed.n < 1) return null
  // Out of order is fine; twice, or far behind, is not.
  const recent = seat.recent ?? []
  if (recent.includes(sealed.n) || sealed.n <= seat.heard - REPLAY_WINDOW) return null
  try {
    const key = await crypto.subtle.importKey('raw', unb64(seat.theirs), ALG, false, ['verify'])
    if (!await crypto.subtle.verify(SIGN, key, unb64(sealed.sig), signed(sealed.gameId, sealed.n, sealed.body))) return null
  } catch {
    return null
  }
  if ((seat.recent ?? []).includes(sealed.n)) return null // the same one, checked meanwhile
  seat.heard = Math.max(seat.heard, sealed.n)
  seat.recent = [...(seat.recent ?? []), sealed.n].filter((n) => n > seat.heard - REPLAY_WINDOW).slice(-REPLAY_WINDOW)
  return sealed.body
}

export function loadSeat(): Seat | null {
  try {
    const seat = JSON.parse(localStorage.getItem(STORE) || 'null') as Seat | null
    return seat && seat.gameId && seat.mine?.pub && seat.theirs ? seat : null
  } catch {
    return null
  }
}

export function saveSeat(seat: Seat | null): void {
  try {
    if (seat) localStorage.setItem(STORE, JSON.stringify(seat))
    else localStorage.removeItem(STORE)
  } catch { /* no storage here */ }
}
