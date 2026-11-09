/**
 * Round-robin tournaments, worked out the same way on every page (and by the wurl bots) from the records
 * of the shared tournaments room. Every peer in it keeps them all (PeerPigeon's `replicate`, for keys
 * under KEYS), so they reach every page even with no storage server up; the storage servers keep them
 * too. Each record is in user space (only its writer changes it) and signed by whoever wrote it (storage
 * checks the signature, and says who signed: `signer`):
 *
 *  - `pc-t/t:<id>`               the tournament, by its creator;
 *  - `pc-t/j:<id>:<player>`      a sign-up, by that player (they can withdraw before it starts);
 *  - `pc-t/s:<id>:<writer>`      the start: the players, fixed. Written by the creator, or, when the
 *                                creator has not written one a while after it was due, by one of the players;
 *  - `pc-t/r:<gameId>:<player>`  a game's result, as one of its two players reports it.
 *
 * Everyone plays everyone once. The pairings and colours come from the frozen list of players (the
 * circle method), so every page agrees on them; games are played in any order, as both players are there.
 * Points: a win 1, a draw ½, a loss 0.
 */

export type TimeControl = { minutes: number; increment: number }

/** The prefix of every tournament record's key: what peers replicate (usePeerPigeon, the wurl bots). */
export const KEYS = 'pc-t/'

export interface Tournament {
  id: string
  name: string
  /** The creator's key (who signed it). */
  creator: string
  creatorName: string
  timeControl: TimeControl
  /** When it starts: at a time, or once this many players have signed up. */
  start: { kind: 'at'; at: number } | { kind: 'players'; players: number }
  /** The most who can play (round robin: everyone plays everyone). */
  maxPlayers: number
  createdAt: number
}

export interface Signup {
  tournament: string
  /** The player's key (who signed it). */
  player: string
  name: string
  /** Their public keys (to check what they sign: a post-quantum account signs with both). */
  keys?: { pub: string; qpub?: string }
  /** A computer player (a wurl bot), and its level. */
  bot?: { level: string }
  at: number
  withdrawn?: boolean
}

export interface Start {
  tournament: string
  /** The players, in their order (it decides the pairings). */
  players: string[]
  at: number
  /** Who wrote it (its signer). */
  by: string
}

export type Result = '1-0' | '0-1' | '1/2-1/2'

export interface Report {
  tournament: string
  gameId: string
  white: string
  black: string
  result: Result
  moves: string[]
  at: number
  /** Who reported it (its signer): one of the two players. */
  by: string
}

export interface Pairing {
  round: number
  white: string
  black: string
  gameId: string
}

/** How long after it was due the players wait for the creator's start before writing one themselves. */
export const START_GRACE_MS = 60_000
/** Round robin of more than this is too long to finish. */
export const MAX_PLAYERS = 12

const byJoinOrder = (a: Signup, b: Signup) => a.at - b.at || (a.player < b.player ? -1 : a.player > b.player ? 1 : 0)

/** The sign-ups still standing, in order of signing up. */
export function signedUp(signups: Signup[]): Signup[] {
  return signups.filter((s) => !s.withdrawn).sort(byJoinOrder)
}

/**
 * Whether it is due to start, and who plays: at its time (those signed up by then), or once enough have
 * signed up (the first that many). Null: not yet (or too few for a game at its time).
 */
export function dueStart(t: Tournament, signups: Signup[], now: number): { at: number; players: string[] } | null {
  const standing = signedUp(signups)
  const cap = Math.max(2, Math.min(MAX_PLAYERS, t.maxPlayers || MAX_PLAYERS))
  if (t.start.kind === 'at') {
    const at = t.start.at
    if (now < at) return null
    const players = standing.filter((s) => s.at <= at).slice(0, cap).map((s) => s.player)
    return players.length >= 2 ? { at, players } : null
  }
  const need = Math.max(2, Math.min(cap, t.start.players))
  if (standing.length < need) return null
  const first = standing.slice(0, need)
  return { at: first[need - 1].at, players: first.map((s) => s.player) }
}

/**
 * The start that counts, of those written: the creator's, else (once the creator had their grace) the
 * earliest by one of its own players. Null: not started.
 */
export function chosenStart(t: Tournament, starts: Start[]): Start | null {
  const valid = starts.filter((s) => s.tournament === t.id && Array.isArray(s.players) && s.players.length >= 2 && new Set(s.players).size === s.players.length)
  const creators = valid.filter((s) => s.by === t.creator).sort((a, b) => a.at - b.at)
  if (creators.length) return creators[0]
  const players = valid.filter((s) => s.players.includes(s.by)).sort((a, b) => a.at - b.at || (a.by < b.by ? -1 : 1))
  return players[0] ?? null
}

/** A game's id in a tournament: the same on every page. */
export function gameIdOf(tournament: string, round: number, white: string, black: string): string {
  return `t-${tournament}-${round}-${shortHash(`${white}|${black}`)}`
}

function shortHash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

/**
 * Everyone against everyone once (the circle method): rounds of pairings, colours alternating so each
 * player has about as many whites as blacks. An odd number of players: one sits out each round.
 */
export function schedule(tournament: string, players: string[]): Pairing[] {
  const list: (string | null)[] = [...players]
  if (list.length % 2) list.push(null)
  const n = list.length
  const out: Pairing[] = []
  // Colours: white to whichever of the two has had white less (then black more), so each player's are
  // as even as they can be; a tie goes by round and board, the same on every page.
  const whites = new Map<string, number>(), blacks = new Map<string, number>()
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i]
      if (!a || !b) continue
      const lean = (p: string) => (whites.get(p) ?? 0) - (blacks.get(p) ?? 0)
      const flip = lean(a) !== lean(b) ? lean(a) > lean(b) : (round + i) % 2 === 1
      const white = flip ? b : a, black = flip ? a : b
      whites.set(white, (whites.get(white) ?? 0) + 1)
      blacks.set(black, (blacks.get(black) ?? 0) + 1)
      out.push({ round: round + 1, white, black, gameId: gameIdOf(tournament, round + 1, white, black) })
    }
    // Rotate all but the first.
    list.splice(1, 0, list.pop()!)
  }
  return out
}

export type GameState =
  | { state: 'unplayed' }
  | { state: 'done'; result: Result; confirmed: boolean }
  | { state: 'disputed' }

/** A game's state from what its players reported: both agree, one reported (unconfirmed), or they disagree. */
export function gameState(p: Pairing, reports: Report[]): GameState {
  const mine = reports.filter((r) => r.gameId === p.gameId && r.white === p.white && r.black === p.black && (r.by === p.white || r.by === p.black))
  const fromWhite = mine.find((r) => r.by === p.white), fromBlack = mine.find((r) => r.by === p.black)
  if (fromWhite && fromBlack) return fromWhite.result === fromBlack.result ? { state: 'done', result: fromWhite.result, confirmed: true } : { state: 'disputed' }
  const one = fromWhite ?? fromBlack
  if (!one) return { state: 'unplayed' }
  // A loss (or draw) its loser reports counts as confirmed: nobody claims a loss they did not have.
  const admits = (one.by === p.white && one.result !== '1-0') || (one.by === p.black && one.result !== '0-1')
  return { state: 'done', result: one.result, confirmed: admits && one.result !== '1/2-1/2' }
}

export interface Standing {
  player: string
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  /** Sonneborn-Berger: the points of those beaten, plus half of those drawn with (the tie-break). */
  tiebreak: number
}

/** The table: by points, then tie-break, then name order. */
export function standings(players: string[], pairings: Pairing[], reports: Report[]): Standing[] {
  const rows = new Map(players.map((p) => [p, { player: p, played: 0, wins: 0, draws: 0, losses: 0, points: 0, tiebreak: 0 }]))
  const results: { white: string; black: string; result: Result }[] = []
  for (const p of pairings) {
    const g = gameState(p, reports)
    if (g.state !== 'done') continue
    results.push({ white: p.white, black: p.black, result: g.result })
    const w = rows.get(p.white), b = rows.get(p.black)
    if (!w || !b) continue
    w.played++; b.played++
    if (g.result === '1-0') { w.wins++; b.losses++; w.points += 1 }
    else if (g.result === '0-1') { b.wins++; w.losses++; b.points += 1 }
    else { w.draws++; b.draws++; w.points += 0.5; b.points += 0.5 }
  }
  for (const r of results) {
    const w = rows.get(r.white)!, b = rows.get(r.black)!
    if (r.result === '1-0') w.tiebreak += b.points
    else if (r.result === '0-1') b.tiebreak += w.points
    else { w.tiebreak += b.points / 2; b.tiebreak += w.points / 2 }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.tiebreak - a.tiebreak || (a.player < b.player ? -1 : 1))
}

export type Status = 'open' | 'running' | 'finished' | 'cancelled'

/** Long after its start, a tournament still not finished counts as over (games never played stay unplayed). */
export const RUNS_AT_MOST_MS = 24 * 60 * 60 * 1000

/** Where it stands: open for sign-ups, running, finished (every game played, or its day is over), cancelled. */
export function statusOf(t: Tournament, start: Start | null, pairings: Pairing[], reports: Report[], now: number, signups: Signup[]): Status {
  if (!start) {
    // Its time came and went with fewer than two players.
    if (t.start.kind === 'at' && now > t.start.at + START_GRACE_MS && signedUp(signups).filter((s) => s.at <= (t.start as { at: number }).at).length < 2) return 'cancelled'
    return 'open'
  }
  if (pairings.every((p) => gameState(p, reports).state !== 'unplayed')) return 'finished'
  if (now > start.at + RUNS_AT_MOST_MS) return 'finished'
  return 'running'
}

/** A player's games still to play, in round order. */
export function gamesToPlay(player: string, pairings: Pairing[], reports: Report[]): Pairing[] {
  return pairings.filter((p) => (p.white === player || p.black === player) && gameState(p, reports).state === 'unplayed')
}

export interface Leader {
  player: string
  tournaments: number
  /** Tournaments won (finished ones only; shared first place counts for each). */
  won: number
  games: number
  points: number
}

/** Across tournaments: tournaments won, then points, then games. */
export function leaderboard(entries: { status: Status; table: Standing[] }[]): Leader[] {
  const rows = new Map<string, Leader>()
  const row = (p: string) => rows.get(p) ?? rows.set(p, { player: p, tournaments: 0, won: 0, games: 0, points: 0 }).get(p)!
  for (const e of entries) {
    if (e.status !== 'running' && e.status !== 'finished') continue
    for (const s of e.table) {
      const r = row(s.player)
      r.tournaments++
      r.games += s.played
      r.points += s.points
    }
    if (e.status === 'finished' && e.table.length && e.table[0].played > 0) {
      const top = e.table[0]
      for (const s of e.table) if (s.points === top.points && s.tiebreak === top.tiebreak) row(s.player).won++
    }
  }
  return [...rows.values()].sort((a, b) => b.won - a.won || b.points - a.points || b.games - a.games || (a.player < b.player ? -1 : 1))
}

/** A short id for a new tournament. */
export function newTournamentId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
}

/** What a player signs to say they are on this peer, ready to play in this tournament (checked by their opponent). */
export function readyText(tournament: string, player: string, peerId: string, at: number): string {
  return `pigeonchess-tournament-ready-v1:${tournament}:${player}:${peerId}:${at}`
}
