/**
 * Tournaments, worked out the same way on every page (and by the wurl bots) from the records of the
 * shared tournaments room. Every peer in it keeps them all (PeerPigeon's `replicate`, for keys under
 * KEYS), so they reach every page even with no storage server up; the storage servers keep them too. Each
 * record is in user space (only its writer changes it) and signed by whoever wrote it (storage checks the
 * signature, and says who signed: `signer`):
 *
 *  - `pc-t/t:<id>`                 the tournament, by its creator;
 *  - `pc-t/j:<id>:<player>`        a sign-up, by that player (they can withdraw before it starts);
 *  - `pc-t/s:<id>:<writer>`        the start: the players, fixed. Written by the creator, or, when the
 *                                  creator has not written one a while after it was due, by one of the players;
 *  - `pc-t/p:<id>:<round>:<writer>` a Swiss round's pairings, fixed the same way;
 *  - `pc-t/r:<gameId>:<player>`    a game's result, as one of its two players reports it.
 *
 * Formats:
 *  - round robin: everyone plays everyone once (up to 16). The pairings come from the players (the circle
 *    method); games are played in any order, as both players are there. Win 1, draw ½.
 *  - Swiss: a set number of rounds (up to 100 players). Each round pairs players with like scores, never
 *    the same two twice when it can be helped; an odd one out gets a bye (1). A round ends when its games
 *    are done, or at its time limit. Win 1, draw ½.
 *  - arena: for a set time (up to 100). Whoever is free is paired with another free player, again and
 *    again, and players can join late. Win 2, draw 1. A win counts once its loser has reported it too.
 */

export type TimeControl = { minutes: number; increment: number }

/** The prefix of every tournament record's key: what peers replicate (usePeerPigeon, the wurl bots). */
export const KEYS = 'pc-t/'

export type Format = 'round-robin' | 'swiss' | 'arena'

export interface Tournament {
  id: string
  name: string
  /** Absent: round robin (the first tournaments had no other). */
  format?: Format
  /** Swiss: how many rounds. */
  rounds?: number
  /** Arena: how long it runs, in minutes. */
  minutes?: number
  /** The creator's key (who signed it). */
  creator: string
  creatorName: string
  timeControl: TimeControl
  /** When it starts: at a time, or once this many players have signed up. */
  start: { kind: 'at'; at: number } | { kind: 'players'; players: number }
  /** The most who can play. */
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

/** A Swiss round, fixed: its pairings, and who sits it out (a bye: 1 point). */
export interface Round {
  tournament: string
  round: number
  pairings: { white: string; black: string }[]
  byes: string[]
  at: number
  by: string
}

/** How long after it was due the players wait for the creator's start (or round) before writing one themselves. */
export const START_GRACE_MS = 60_000
/** The most players: a round robin of more is too long to finish; Swiss and arena, up to 100. */
export const MAX_PLAYERS = 100
export const MAX_ROUND_ROBIN = 16

export const formatOf = (t: Tournament): Format => t.format ?? 'round-robin'
export const maxPlayersOf = (t: Tournament): number => Math.max(2, Math.min(formatOf(t) === 'round-robin' ? MAX_ROUND_ROBIN : MAX_PLAYERS, t.maxPlayers || MAX_PLAYERS))
/** Win, draw: arena 2 and 1; the others 1 and ½. */
export const pointsOf = (t: Tournament) => (formatOf(t) === 'arena' ? { win: 2, draw: 1 } : { win: 1, draw: 0.5 })

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
  const cap = maxPlayersOf(t)
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
  return chosen(t, valid, (s) => s.players)
}

/** Of records fixing the same thing (a start, a round): the creator's, else the earliest by one of its players. */
function chosen<R extends { at: number; by: string }>(t: Tournament, records: R[], players: (r: R) => string[]): R | null {
  const creators = records.filter((r) => r.by === t.creator).sort((a, b) => a.at - b.at)
  if (creators.length) return creators[0]
  const byPlayers = records.filter((r) => players(r).includes(r.by)).sort((a, b) => a.at - b.at || (a.by < b.by ? -1 : 1))
  return byPlayers[0] ?? null
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

/** Reports by game id: a tournament of 100 has thousands of games, each looked up often. */
export type Reports = Report[] | Map<string, Report[]>
export function indexReports(reports: Reports): Map<string, Report[]> {
  if (reports instanceof Map) return reports
  const m = new Map<string, Report[]>()
  for (const r of reports) { const l = m.get(r.gameId); if (l) l.push(r); else m.set(r.gameId, [r]) }
  return m
}

/** A game's state from what its players reported: both agree, one reported (unconfirmed), or they disagree. */
export function gameState(p: Pairing, reports: Reports): GameState {
  const forGame = reports instanceof Map ? (reports.get(p.gameId) ?? []) : reports
  const mine = forGame.filter((r) => r.gameId === p.gameId && r.white === p.white && r.black === p.black && (r.by === p.white || r.by === p.black))
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

/**
 * The table: by points, then tie-break, then name order. `win`/`draw`: what they are worth; `byes`: players
 * given a round off (1 point each); `onlyConfirmed`: count only games both sides (or the loser) reported.
 */
export function standings(players: string[], pairings: Pairing[], reports: Reports, o: { win?: number; draw?: number; byes?: string[]; onlyConfirmed?: boolean } = {}): Standing[] {
  const win = o.win ?? 1, draw = o.draw ?? 0.5
  const index = indexReports(reports)
  const rows = new Map(players.map((p) => [p, { player: p, played: 0, wins: 0, draws: 0, losses: 0, points: 0, tiebreak: 0 }]))
  for (const p of o.byes ?? []) { const r = rows.get(p); if (r) r.points += 1 }
  const results: { white: string; black: string; result: Result }[] = []
  for (const p of pairings) {
    const g = gameState(p, index)
    if (g.state !== 'done' || (o.onlyConfirmed && !g.confirmed && !(g.result === '1/2-1/2' && (index.get(p.gameId)?.length ?? 0) >= 2))) continue
    results.push({ white: p.white, black: p.black, result: g.result })
    const w = rows.get(p.white), b = rows.get(p.black)
    if (!w || !b) continue
    w.played++; b.played++
    if (g.result === '1-0') { w.wins++; b.losses++; w.points += win }
    else if (g.result === '0-1') { b.wins++; w.losses++; b.points += win }
    else { w.draws++; b.draws++; w.points += draw; b.points += draw }
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
export function statusOf(t: Tournament, start: Start | null, pairings: Pairing[], reports: Reports, now: number, signups: Signup[]): Status {
  if (!start) {
    // Its time came and went with fewer than two players.
    if (t.start.kind === 'at' && now > t.start.at + START_GRACE_MS && signedUp(signups).filter((s) => s.at <= (t.start as { at: number }).at).length < 2) return 'cancelled'
    return 'open'
  }
  const index = indexReports(reports)
  if (pairings.every((p) => gameState(p, index).state !== 'unplayed')) return 'finished'
  if (now > start.at + RUNS_AT_MOST_MS) return 'finished'
  return 'running'
}

/** A player's games still to play, in round order. */
export function gamesToPlay(player: string, pairings: Pairing[], reports: Reports): Pairing[] {
  const index = indexReports(reports)
  return pairings.filter((p) => (p.white === player || p.black === player) && gameState(p, index).state === 'unplayed')
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

// ---- Swiss -------------------------------------------------------------------------------------------

/** How long a Swiss round may run: time for both clocks to run out, and a margin; with no clock, 30 minutes. */
export function roundLimitMs(t: Tournament): number {
  const tc = t.timeControl
  if (!tc.minutes) return 30 * 60_000
  return (2 * tc.minutes * 60 + 2 * 60 * tc.increment) * 1000 + 5 * 60_000
}

/** A seed order for players with no rating: by a hash of the tournament and the key, the same on every page. */
function seeded(tournament: string, players: string[]): string[] {
  return [...players].sort((a, b) => shortHash(`${tournament}|${a}`).localeCompare(shortHash(`${tournament}|${b}`)) || (a < b ? -1 : 1))
}

/**
 * The pairings of the next Swiss round, from the rounds so far and their results: by score (then seed),
 * each paired with the next player of like score they have not met; an odd one out (the lowest without a
 * bye yet) sits out with a bye. Colours: white to whoever has had it less.
 */
export function swissPairings(tournament: string, players: string[], rounds: Round[], reports: Reports): { pairings: { white: string; black: string }[]; byes: string[] } {
  const index = indexReports(reports)
  const order = seeded(tournament, players)
  const seed = new Map(order.map((p, i) => [p, i]))
  const score = new Map(players.map((p) => [p, 0]))
  const met = new Set<string>(), hadBye = new Set<string>()
  const whites = new Map<string, number>(), blacks = new Map<string, number>()
  for (const r of rounds) {
    for (const b of r.byes) { hadBye.add(b); score.set(b, (score.get(b) ?? 0) + 1) }
    for (const pr of r.pairings) {
      met.add(`${pr.white}|${pr.black}`); met.add(`${pr.black}|${pr.white}`)
      whites.set(pr.white, (whites.get(pr.white) ?? 0) + 1); blacks.set(pr.black, (blacks.get(pr.black) ?? 0) + 1)
      const g = gameState({ round: r.round, white: pr.white, black: pr.black, gameId: gameIdOf(tournament, r.round, pr.white, pr.black) }, index)
      if (g.state !== 'done') continue
      if (g.result === '1-0') score.set(pr.white, (score.get(pr.white) ?? 0) + 1)
      else if (g.result === '0-1') score.set(pr.black, (score.get(pr.black) ?? 0) + 1)
      else { score.set(pr.white, (score.get(pr.white) ?? 0) + 0.5); score.set(pr.black, (score.get(pr.black) ?? 0) + 0.5) }
    }
  }
  const ranked = [...players].sort((a, b) => (score.get(b)! - score.get(a)!) || (seed.get(a)! - seed.get(b)!))
  const byes: string[] = []
  if (ranked.length % 2) {
    const sitter = [...ranked].reverse().find((p) => !hadBye.has(p)) ?? ranked[ranked.length - 1]
    byes.push(sitter)
    ranked.splice(ranked.indexOf(sitter), 1)
  }
  const pairings: { white: string; black: string }[] = []
  const left = [...ranked]
  while (left.length) {
    const a = left.shift()!
    let j = left.findIndex((b) => !met.has(`${a}|${b}`))
    if (j < 0) j = 0
    const b = left.splice(j, 1)[0]
    const lean = (p: string) => (whites.get(p) ?? 0) - (blacks.get(p) ?? 0)
    const aWhite = lean(a) !== lean(b) ? lean(a) < lean(b) : (pairings.length + rounds.length) % 2 === 0
    pairings.push(aWhite ? { white: a, black: b } : { white: b, black: a })
  }
  return { pairings, byes }
}

/** The round that counts of those written for round n. */
export function chosenRound(t: Tournament, players: string[], written: Round[], n: number): Round | null {
  const valid = written.filter((r) => r.tournament === t.id && r.round === n && Array.isArray(r.pairings) && Array.isArray(r.byes))
  return chosen(t, valid, () => players)
}

// ---- Arena -------------------------------------------------------------------------------------------

/** An arena game's id: the tournament, the two players (white first), and how many they had played before. */
export function arenaGameId(tournament: string, white: string, black: string, before: number): string {
  return `t-${tournament}-a-${shortHash(`${white}|${black}`)}-${before + 1}`
}
export const isArenaGameOf = (tournament: string, gameId: string, white: string, black: string): boolean =>
  new RegExp(`^t-${tournament}-a-${shortHash(`${white}|${black}`)}-[1-9]\\d{0,3}$`).test(gameId)

// ---- Where a tournament stands -----------------------------------------------------------------------

export interface TournamentState {
  start: Start | null
  players: string[]
  pairings: Pairing[]
  /** Swiss: the rounds fixed so far, and who had a bye. */
  rounds: Round[]
  byes: string[]
  /** Swiss: the round being played (1-based; 0 before). */
  round: number
  /** Arena: when it ends. */
  endsAt: number | null
  status: Status
  table: Standing[]
  reports: Map<string, Report[]>
}

/** Everything about one tournament, from its records. */
export function tournamentState(t: Tournament, signups: Signup[], starts: Start[], written: Round[], reports: Report[], now: number): TournamentState {
  const start = chosenStart(t, starts)
  const format = formatOf(t)
  const index = indexReports(reports)
  const { win, draw } = pointsOf(t)
  let players = start?.players ?? []
  let pairings: Pairing[] = []
  const rounds: Round[] = []
  let endsAt: number | null = null
  let status: Status
  if (!start) {
    status = statusOf(t, null, [], index, now, signups)
  } else if (format === 'round-robin') {
    pairings = schedule(t.id, players)
    status = statusOf(t, start, pairings, index, now, signups)
  } else if (format === 'swiss') {
    const total = Math.max(1, Math.min(30, t.rounds ?? 5))
    for (let n = 1; n <= total; n++) {
      const r = chosenRound(t, players, written, n)
      if (!r) break
      rounds.push(r)
      for (const pr of r.pairings) pairings.push({ round: n, white: pr.white, black: pr.black, gameId: gameIdOf(t.id, n, pr.white, pr.black) })
    }
    const last = rounds[rounds.length - 1]
    const lastDone = !!last && pairings.filter((p) => p.round === last.round).every((p) => gameState(p, index).state !== 'unplayed')
    const lastOver = !!last && (lastDone || now > last.at + roundLimitMs(t))
    status = rounds.length === total && lastOver ? 'finished' : now > start.at + RUNS_AT_MOST_MS ? 'finished' : 'running'
  } else {
    // Arena: the players at the start and those who joined since (up to the most); its games are those reported.
    const late = signedUp(signups).map((s) => s.player).filter((p) => !players.includes(p))
    players = [...players, ...late].slice(0, maxPlayersOf(t))
    endsAt = start.at + Math.max(5, Math.min(24 * 60, t.minutes ?? 60)) * 60_000
    const inIt = new Set(players)
    const seen = new Set<string>()
    for (const [gameId, rs] of index) {
      const r = rs[0]
      if (seen.has(gameId) || !inIt.has(r.white) || !inIt.has(r.black) || !isArenaGameOf(t.id, gameId, r.white, r.black)) continue
      seen.add(gameId)
      pairings.push({ round: 0, white: r.white, black: r.black, gameId })
    }
    pairings.sort((a, b) => (index.get(a.gameId)![0].at - index.get(b.gameId)![0].at))
    status = now >= endsAt ? 'finished' : 'running'
  }
  const byes = rounds.flatMap((r) => r.byes)
  const table = standings(players, pairings, index, { win, draw, byes, onlyConfirmed: format === 'arena' })
  return { start, players, pairings, rounds, byes, round: rounds.length, endsAt, status, table, reports: index }
}

/**
 * Swiss: the next round is due (the last one is done or out of time, and rounds are left), with its
 * pairings; or round 1 once started. Null: not now.
 */
export function dueRound(t: Tournament, s: TournamentState, now: number): { round: number; pairings: { white: string; black: string }[]; byes: string[]; dueAt: number } | null {
  if (formatOf(t) !== 'swiss' || !s.start || s.status !== 'running') return null
  const total = Math.max(1, Math.min(30, t.rounds ?? 5))
  const last = s.rounds[s.rounds.length - 1]
  if (s.rounds.length >= total) return null
  let dueAt = s.start.at
  if (last) {
    const games = s.pairings.filter((p) => p.round === last.round)
    const done = games.every((p) => gameState(p, s.reports).state !== 'unplayed')
    const limit = last.at + roundLimitMs(t)
    if (!done && now <= limit) return null
    dueAt = done ? Math.max(last.at, ...games.flatMap((p) => (s.reports.get(p.gameId) ?? []).map((r) => r.at))) : limit
  }
  return { round: s.rounds.length + 1, ...swissPairings(t.id, s.players, s.rounds, s.reports), dueAt }
}
