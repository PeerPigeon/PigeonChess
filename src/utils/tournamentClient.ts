/**
 * Taking part in tournaments: the same code on a page (useTournaments wraps it for Vue) and in a wurl bot.
 *
 * - Reads the shared tournaments room (records: utils/tournament.ts), and follows it as it changes.
 * - Creates tournaments, signs up and withdraws, and reports its games' results.
 * - Starts a tournament that is due: its creator writes the start; when the creator has not done so a
 *   while after it was due, one of its players does.
 * - Swiss: writes each round's pairings when it is due (the creator; or a player, a while after).
 * - Plays: while a tournament it plays in runs, it says it is ready (signed by the player, so nobody else
 *   can be them). Round robin and Swiss: of two players who owe each other a game and are both ready and
 *   free, the one with white offers and the other answers. Arena: anyone free offers a new game to whoever
 *   has waited longest (white to whoever has had it less); two offering each other: the lower key's
 *   offer stands. A player says when a game starts (t_busy), so nobody offers them one meanwhile. The game then starts
 *   through the page's (or bot's) own game code, exactly like a match from the lobby.
 */
import {
  arenaGameId, dueRound, dueStart, formatOf, gameState, gamesToPlay, isArenaGameOf, leaderboard, maxPlayersOf, newTournamentId, readyText, tournamentState,
  START_GRACE_MS, KEYS, MAX_PLAYERS,
  type Format, type Leader, type Pairing, type Report, type Result, type Round, type Signup, type Standing, type Start, type Status, type Tournament,
} from './tournament'

export interface Me {
  /** The key everything is signed with (the storage signer). */
  pub: string
  name: string
  /** Public keys to check what this player signs (a post-quantum account: both). */
  keys: { pub: string; qpub?: string }
  bot?: { level: string }
}

export interface TournamentMatch {
  tournament: string
  gameId: string
  /** The opponent's peer ID. */
  opponent: string
  opponentKey: string
  myColor: 'white' | 'black'
  timeControl: { minutes: number; increment: number }
  theirSeat?: string
}

export interface TournamentClientOptions {
  room: () => Promise<{ room: any; signer: string } | null>
  me: () => Me | null
  sign: (text: string) => Promise<string>
  verify: (text: string, sig: string, keys: { pub: string; qpub?: string }) => Promise<boolean>
  peerId: () => string | null | undefined
  broadcast: (message: string) => Promise<unknown>
  send: (peerId: string, message: string) => Promise<unknown>
  /** True while a game is being played (no new game starts). */
  isPlaying: () => boolean
  /** This player's seat key for the next game (as the lobby's matches send it). */
  seat?: () => string | null
  onMatched: (match: TournamentMatch) => void
  /** The tournaments changed (new records, or time moved one on). */
  onChange?: () => void
  now?: () => number
  /** Somewhere to keep the arena games being played across a reload (a page: localStorage). */
  keep?: { get: (key: string) => string | null; set: (key: string, value: string) => void }
}

export interface TournamentView {
  tournament: Tournament
  signups: Signup[]
  start: Start | null
  format: Format
  players: string[]
  /** Round robin: every game; Swiss: the rounds so far; arena: the games reported so far. */
  pairings: Pairing[]
  reports: Map<string, Report[]>
  status: Status
  table: Standing[]
  /** Swiss: the rounds so far, the one being played, and the byes. */
  rounds: Round[]
  round: number
  byes: string[]
  /** Arena: when it ends. */
  endsAt: number | null
  /** Names by key (from the sign-ups). */
  names: Map<string, string>
  bots: Set<string>
}

const READY_MS = 3000
/** How often a player says it is ready: more seldom in a big tournament (a hundred saying so every 3 s is a lot). */
const readyEvery = (players: number) => Math.max(READY_MS, players * 100)
const OFFER_MS = 10_000
const REFRESH_MS = 15_000
const ARENA_KEEP = 'pc-arena-games'

export class TournamentClient {
  private tournaments = new Map<string, Tournament>()
  private signups = new Map<string, Signup>()
  private starts = new Map<string, Start>()
  private reports = new Map<string, Report>()
  private rounds = new Map<string, Round>()
  /** Arena games begun here, not reported yet: game id → its tournament and players. */
  private arenaGames = new Map<string, { tournament: string; white: string; black: string }>()
  private lastReady = new Map<string, number>()
  private version = 0
  private cached: { version: number; second: number; views: TournamentView[] } | null = null
  /** Players seen ready: `${tournament}:${player}` → their peer and when (checked: they signed it). */
  private ready = new Map<string, { peerId: string; seenAt: number; since: number }>()
  /** Free since (no game being played): told with t_ready, so whoever waited longest is paired first. */
  private freeSince = 0
  private lastUnknown = 0
  private offer: { gameId: string; to: string; sentAt: number; match: Omit<TournamentMatch, 'theirSeat'> } | null = null
  private timers: ReturnType<typeof setInterval>[] = []
  private unsubscribe: (() => void) | null = null
  private room: any = null
  private refreshing: Promise<void> | null = null
  private wroteStart = new Set<string>()
  private wroteRound = new Set<string>()

  constructor(private o: TournamentClientOptions) {
    try { for (const [id, g] of JSON.parse(o.keep?.get(ARENA_KEEP) ?? '[]')) this.arenaGames.set(id, g) } catch {}
  }

  private keepArena() {
    try { this.o.keep?.set(ARENA_KEEP, JSON.stringify([...this.arenaGames].slice(-20))) } catch {}
  }

  private now() { return this.o.now?.() ?? Date.now() }

  /** Follow the room, start what is due, and play. */
  start(): void {
    if (this.timers.length) return
    void this.refresh()
    this.timers.push(setInterval(() => void this.refresh(), REFRESH_MS))
    this.timers.push(setInterval(() => { void this.tick() }, READY_MS))
  }

  stop(): void {
    this.timers.forEach(clearInterval)
    this.timers = []
    this.unsubscribe?.()
    this.unsubscribe = null
    this.offer = null
  }

  /** Read the room again (and follow its changes from now on). */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      const opened = await this.o.room().catch(() => null)
      if (!opened) return
      if (opened.room !== this.room) {
        this.unsubscribe?.()
        this.room = opened.room
        let pending: ReturnType<typeof setTimeout> | null = null
        // A change: read again shortly (several come together).
        this.unsubscribe = this.room.subscribe?.(() => {
          if (pending) return
          pending = setTimeout(() => { pending = null; void this.refresh() }, 500)
        }) ?? null
      }
      const records = await this.room.list('user').catch(() => [])
      this.take(records)
      this.o.onChange?.()
    })().finally(() => { this.refreshing = null })
    return this.refreshing
  }

  /** The records, each checked against who signed it. */
  private take(records: any[]): void {
    for (const r of records) {
      const v = r?.value, by = r?.signer, full: string = r?.key ?? ''
      if (!v || typeof v !== 'object' || typeof by !== 'string' || r.space !== 'user' || !full.startsWith(KEYS)) continue
      const key = full.slice(KEYS.length)
      if (key.startsWith('t:') && v.creator === by && key === `t:${v.id}` && validTournament(v)) this.tournaments.set(v.id, v)
      else if (key.startsWith('j:') && v.player === by && key === `j:${v.tournament}:${by}` && typeof v.name === 'string') this.signups.set(key, v)
      else if (key.startsWith('s:') && key === `s:${v.tournament}:${by}`) this.starts.set(key, { ...v, by })
      else if (key.startsWith('p:') && key === `p:${v.tournament}:${v.round}:${by}` && Number.isInteger(v.round)) this.rounds.set(key, { ...v, by })
      else if (key.startsWith('r:') && key === `r:${v.gameId}:${by}` && (v.white === by || v.black === by)) this.reports.set(key, { ...v, by })
    }
    this.version++
  }

  /** Each tournament as it stands now (worked out again when records change, or each second at most). */
  view(): TournamentView[] {
    const now = this.now()
    const second = Math.floor(now / 1000)
    if (this.cached && this.cached.version === this.version && this.cached.second === second) return this.cached.views
    const by = <R extends { tournament: string }>(m: Map<string, R>) => {
      const out = new Map<string, R[]>()
      for (const r of m.values()) { const l = out.get(r.tournament); if (l) l.push(r); else out.set(r.tournament, [r]) }
      return out
    }
    const signupsBy = by(this.signups), startsBy = by(this.starts), roundsBy = by(this.rounds), reportsBy = by(this.reports)
    const views: TournamentView[] = []
    for (const t of this.tournaments.values()) {
      const signups = signupsBy.get(t.id) ?? []
      const s = tournamentState(t, signups, startsBy.get(t.id) ?? [], roundsBy.get(t.id) ?? [], reportsBy.get(t.id) ?? [], now)
      const names = new Map(signups.map((x) => [x.player, x.name]))
      if (!names.has(t.creator)) names.set(t.creator, t.creatorName)
      views.push({
        tournament: t, signups, start: s.start, format: formatOf(t), players: s.players, pairings: s.pairings, reports: s.reports,
        status: s.status, table: s.table, rounds: s.rounds, round: s.round, byes: s.byes, endsAt: s.endsAt,
        names, bots: new Set(signups.filter((x) => x.bot).map((x) => x.player)),
      })
    }
    views.sort((a, b) => b.tournament.createdAt - a.tournament.createdAt)
    this.cached = { version: this.version, second, views }
    return views
  }

  /** Across every tournament. */
  leaders(): { leaders: Leader[]; names: Map<string, string>; bots: Set<string> } {
    const views = this.view()
    const names = new Map<string, string>(), bots = new Set<string>()
    for (const v of views) { v.names.forEach((n, k) => names.set(k, n)); v.bots.forEach((b) => bots.add(b)) }
    return { leaders: leaderboard(views.map((v) => ({ status: v.status, table: v.table }))), names, bots }
  }

  /** A record of this player's (user space: only they change it), under KEYS. */
  private async write(key: string, value: unknown): Promise<void> {
    const opened = await this.o.room()
    if (!opened) throw new Error('Not connected yet: try again in a moment')
    await opened.room.put('user', `${KEYS}${key}`, JSON.parse(JSON.stringify(value)))
    this.version++
    await this.refresh()
  }

  /** A new tournament (its creator signs up too unless `play` is false). */
  async create(input: { name: string; format?: Format; rounds?: number; minutes?: number; timeControl: { minutes: number; increment: number }; start: Tournament['start']; maxPlayers: number; play?: boolean }): Promise<string> {
    const me = this.o.me()
    if (!me) throw new Error('Sign in to create a tournament')
    const format = input.format ?? 'round-robin'
    const t: Tournament = {
      id: newTournamentId(), name: input.name.trim().slice(0, 60) || 'Tournament', creator: me.pub, creatorName: me.name,
      ...(format !== 'round-robin' ? { format } : {}),
      ...(format === 'swiss' ? { rounds: Math.max(1, Math.min(30, Math.round(input.rounds ?? 5))) } : {}),
      ...(format === 'arena' ? { minutes: Math.max(5, Math.min(24 * 60, Math.round(input.minutes ?? 60))) } : {}),
      timeControl: input.timeControl, start: input.start, maxPlayers: input.maxPlayers, createdAt: this.now(),
    }
    t.maxPlayers = maxPlayersOf(t)
    if (!validTournament(t)) throw new Error('That tournament does not add up')
    await this.write(`t:${t.id}`, t)
    if (input.play !== false) await this.join(t.id)
    return t.id
  }

  async join(tournament: string): Promise<void> {
    const me = this.o.me()
    if (!me) throw new Error('Sign in to play in a tournament')
    const signup: Signup = { tournament, player: me.pub, name: me.name, keys: me.keys, at: this.now(), ...(me.bot ? { bot: me.bot } : {}) }
    await this.write(`j:${tournament}:${me.pub}`, signup)
  }

  async leave(tournament: string): Promise<void> {
    const me = this.o.me()
    const mine = me && this.signups.get(`j:${tournament}:${me.pub}`)
    if (!me || !mine) return
    await this.write(`j:${tournament}:${me.pub}`, { ...mine, withdrawn: true })
  }

  /** The tournament game with this id, and its two players (an arena game: once begun here, or reported). */
  private gameOf(gameId: string): { v: TournamentView; white: string; black: string } | null {
    const views = this.view()
    const a = this.arenaGames.get(gameId)
    if (a) { const v = views.find((x) => x.tournament.id === a.tournament); return v ? { v, white: a.white, black: a.black } : null }
    for (const v of views) {
      const p = v.pairings.find((x) => x.gameId === gameId)
      if (p) return { v, white: p.white, black: p.black }
    }
    return null
  }

  /** A game of a tournament that ended (`result` as white–black). Not one of its games: nothing. */
  async report(gameId: string, result: Result, moves: string[]): Promise<boolean> {
    const me = this.o.me()
    if (!me) return false
    const g = this.gameOf(gameId)
    if (!g || (g.white !== me.pub && g.black !== me.pub)) return false
    const report: Omit<Report, 'by'> = { tournament: g.v.tournament.id, gameId, white: g.white, black: g.black, result, moves: moves.slice(0, 600), at: this.now() }
    await this.write(`r:${gameId}:${me.pub}`, report).catch(() => {})
    if (this.arenaGames.delete(gameId)) this.keepArena()
    return true
  }

  /** Whether this game is one of a tournament's. */
  isTournamentGame(gameId: string): boolean {
    return !!this.gameOf(gameId)
  }

  /** The name of the tournament a game belongs to. */
  tournamentOf(gameId: string): Tournament | null {
    return this.gameOf(gameId)?.v.tournament ?? null
  }

  /** Every few seconds: start what is due; say this player is ready; offer a game to a ready player. */
  private async tick(): Promise<void> {
    const me = this.o.me(), peerId = this.o.peerId()
    if (!me || !peerId) return
    const now = this.now()
    const views = this.view()
    for (const v of views) { await this.maybeStart(v, me, now); await this.maybeRound(v, me, now) }
    if (this.offer && now - this.offer.sentAt > OFFER_MS) this.offer = null
    if (this.o.isPlaying()) { this.freeSince = 0; return }
    if (!this.freeSince) this.freeSince = now
    for (const v of this.view()) {
      if (v.status !== 'running' || !v.players.includes(me.pub)) continue
      const arena = v.format === 'arena'
      const owed = arena ? [] : gamesToPlay(me.pub, v.format === 'swiss' ? v.pairings.filter((p) => p.round === v.round) : v.pairings, v.reports)
      if (!arena && !owed.length) continue
      if (arena && v.endsAt !== null && now >= v.endsAt - 30_000) continue
      const every = readyEvery(v.players.length)
      if (now - (this.lastReady.get(v.tournament.id) ?? 0) >= every - 500) {
        const sig = await this.o.sign(readyText(v.tournament.id, me.pub, peerId, now)).catch(() => null)
        if (!sig) continue
        this.lastReady.set(v.tournament.id, now)
        void this.o.broadcast(JSON.stringify({ type: 't_ready', tournament: v.tournament.id, player: me.pub, peerId, at: now, since: this.freeSince, sig })).catch(() => {})
      }
      if (this.offer) continue
      const gone = every * 3.5
      if (arena) { this.offerArena(v, me, now, gone); continue }
      // Not every time: of three players each offering the next a game, all would decline for ever.
      if (Math.random() < 0.3) continue
      // White offers the first game owed to someone who is there.
      for (const p of owed) {
        if (p.white !== me.pub) continue
        const there = this.ready.get(`${v.tournament.id}:${p.black}`)
        if (!there || now - there.seenAt > gone) continue
        const match = { tournament: v.tournament.id, gameId: p.gameId, opponent: there.peerId, opponentKey: p.black, myColor: 'white' as const, timeControl: v.tournament.timeControl }
        this.offer = { gameId: p.gameId, to: there.peerId, sentAt: now, match }
        void this.o.send(there.peerId, JSON.stringify({ type: 't_offer', tournament: v.tournament.id, gameId: p.gameId, player: me.pub, seat: this.o.seat?.() ?? undefined })).catch(() => {})
        break
      }
      if (this.offer) break
    }
  }

  /**
   * Arena: the free players in order of how long they have waited (then key), paired off in that order,
   * each with the next one who is not the opponent they just played; every page works out the same pairs
   * from the same t_ready messages. Of each pair, the one who waited less offers; the other waits for it.
   */
  private offerArena(v: TournamentView, me: Me, now: number, gone: number): void {
    const last = new Map<string, string>()
    let whites = 0, blacks = 0
    for (const p of v.pairings) {
      last.set(p.white, p.black); last.set(p.black, p.white)
      if (p.white === me.pub) whites++
      else if (p.black === me.pub) blacks++
    }
    const free = v.players
      .map((p) => ({ p, r: p === me.pub ? { peerId: '', seenAt: now, since: this.freeSince } : this.ready.get(`${v.tournament.id}:${p}`) }))
      .filter((x): x is { p: string; r: { peerId: string; seenAt: number; since: number } } => !!x.r && now - x.r.seenAt <= gone)
      .sort((a, b) => (a.r.since - b.r.since) || (a.p < b.p ? -1 : 1))
    const partner = new Map<string, string>()
    const left = free.map((x) => x.p)
    while (left.length > 1) {
      const a = left.shift()!
      let j = left.findIndex((b) => last.get(a) !== b && last.get(b) !== a)
      if (j < 0) j = 0
      const b = left.splice(j, 1)[0]
      partner.set(a, b); partner.set(b, a)
    }
    const them = partner.get(me.pub)
    if (!them) return
    // The one of the two who has waited longer is offered the game.
    const rank = new Map(free.map((x, i) => [x.p, i]))
    if (rank.get(them)! > rank.get(me.pub)!) return
    const r = free.find((x) => x.p === them)!.r
    const meWhite = whites !== blacks ? whites < blacks : Math.random() < 0.5
    const white = meWhite ? me.pub : them, black = meWhite ? them : me.pub
    const before = v.pairings.filter((x) => x.white === white && x.black === black).length
      + [...this.arenaGames.entries()].filter(([, g]) => g.white === white && g.black === black).length
    const gameId = arenaGameId(v.tournament.id, white, black, before)
    const match = { tournament: v.tournament.id, gameId, opponent: r.peerId, opponentKey: them, myColor: meWhite ? 'white' as const : 'black' as const, timeControl: v.tournament.timeControl }
    this.offer = { gameId, to: r.peerId, sentAt: now, match }
    void this.o.send(r.peerId, JSON.stringify({ type: 't_offer', tournament: v.tournament.id, gameId, player: me.pub, white, black, seat: this.o.seat?.() ?? undefined })).catch(() => {})
  }

  private async maybeStart(v: TournamentView, me: Me, now: number): Promise<void> {
    if (v.start || this.wroteStart.has(v.tournament.id)) return
    const due = dueStart(v.tournament, v.signups, now)
    if (!due) return
    const mine = v.tournament.creator === me.pub
    if (!mine && !(due.players.includes(me.pub) && now > due.at + START_GRACE_MS)) return
    this.wroteStart.add(v.tournament.id)
    const start: Omit<Start, 'by'> = { tournament: v.tournament.id, players: due.players, at: now }
    await this.write(`s:${v.tournament.id}:${me.pub}`, start).catch(() => this.wroteStart.delete(v.tournament.id))
  }

  /** Swiss: the next round's pairings, written when due (by the creator; by a player, a while after). */
  private async maybeRound(v: TournamentView, me: Me, now: number): Promise<void> {
    if (v.format !== 'swiss') return
    const s = { start: v.start, players: v.players, pairings: v.pairings, rounds: v.rounds, byes: v.byes, round: v.round, endsAt: v.endsAt, status: v.status, table: v.table, reports: v.reports }
    const due = dueRound(v.tournament, s, now)
    if (!due) return
    const key = `${v.tournament.id}:${due.round}`
    if (this.wroteRound.has(key)) return
    const mine = v.tournament.creator === me.pub
    if (!mine && !(v.players.includes(me.pub) && now > due.dueAt + START_GRACE_MS)) return
    this.wroteRound.add(key)
    const round: Omit<Round, 'by'> = { tournament: v.tournament.id, round: due.round, pairings: due.pairings, byes: due.byes, at: now }
    await this.write(`p:${v.tournament.id}:${due.round}:${me.pub}`, round).catch(() => this.wroteRound.delete(key))
  }

  /** Arena: a game started here, so nobody offers this player another meanwhile. */
  private sayBusy(tournament: string, me: Me): void {
    this.freeSince = 0
    this.lastReady.delete(tournament)
    void this.o.broadcast(JSON.stringify({ type: 't_busy', tournament, player: me.pub })).catch(() => {})
  }

  /** A tournament message: true when it was one (handled here). */
  handle(message: any, fromPeer: string): boolean {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('t_')) return false
    void this.onMessage(message, fromPeer)
    return true
  }

  private async onMessage(m: any, fromPeer: string): Promise<void> {
    const me = this.o.me()
    if (!me || typeof m.tournament !== 'string') return
    const v = this.view().find((x) => x.tournament.id === m.tournament)
    if (!v) return
    if (m.type === 't_ready') {
      // Checked: their own key signed it, for this peer, lately.
      if (typeof m.player !== 'string' || typeof m.peerId !== 'string' || typeof m.sig !== 'string') return
      if (!v.players.includes(m.player)) {
        // Someone who joined since this side last read the records (an arena takes players late): read again.
        if (v.status === 'running' && this.now() - this.lastUnknown > 10_000) { this.lastUnknown = this.now(); void this.refresh() }
        return
      }
      if (Math.abs(this.now() - Number(m.at)) > 60_000) return
      const keys = v.signups.find((s) => s.player === m.player)?.keys ?? { pub: m.player }
      if (!(await this.o.verify(readyText(m.tournament, m.player, m.peerId, Number(m.at)), m.sig, keys).catch(() => false))) return
      const since = Number(m.since)
      this.ready.set(`${m.tournament}:${m.player}`, { peerId: m.peerId, seenAt: this.now(), since: Number.isFinite(since) && since > 0 && since <= this.now() + 60_000 ? since : this.now() })
      return
    }
    if (m.type === 't_busy') {
      // They started a game: not free now (only from the peer they said they were ready on).
      const key = `${m.tournament}:${m.player}`
      if (this.ready.get(key)?.peerId === fromPeer) this.ready.delete(key)
      return
    }
    let p: { gameId: string; white: string; black: string } | undefined = v.pairings.find((x) => x.gameId === m.gameId)
    // Arena: a game not played yet, between two of its players, named as arena games are.
    if (!p && v.format === 'arena' && typeof m.gameId === 'string') {
      const sentOffer = this.offer
      const mine = sentOffer && sentOffer.gameId === m.gameId ? sentOffer.match : null
      const a = mine ? { white: mine.myColor === 'white' ? me.pub : mine.opponentKey, black: mine.myColor === 'white' ? mine.opponentKey : me.pub } : { white: m.white, black: m.black }
      if (typeof a.white === 'string' && typeof a.black === 'string' && a.white !== a.black && v.players.includes(a.white) && v.players.includes(a.black)
        && isArenaGameOf(v.tournament.id, m.gameId, a.white, a.black) && !v.reports.has(m.gameId)) p = { gameId: m.gameId, ...a }
    }
    if (!p) return
    if (m.type === 't_offer') {
      // From the white of a game owed to this player (arena: from the other player of a new game), on the
      // peer they said they are ready on.
      const arena = v.format === 'arena'
      const theirs = arena ? (p.white === me.pub ? p.black : p.white) : p.white
      const mineToo = arena ? (p.white === me.pub || p.black === me.pub) && m.player === theirs : p.black === me.pub && m.player === p.white
      if (!mineToo) return
      const there = this.ready.get(`${m.tournament}:${theirs}`)
      const owed = gameState({ round: 0, ...p }, v.reports).state === 'unplayed'
      const late = arena && v.endsAt !== null && this.now() >= v.endsAt - 30_000
      // Arena, both offering each other at once: the lower key's offer stands, the other is dropped.
      if (arena && this.offer && this.offer.to === fromPeer && theirs < me.pub) this.offer = null
      // Not now (busy, not sure it is them yet, or the game is done): said at once, so they don't wait on it.
      if (!there || there.peerId !== fromPeer || !owed || late || v.status !== 'running' || this.o.isPlaying() || this.offer) {
        void this.o.send(fromPeer, JSON.stringify({ type: 't_decline', tournament: m.tournament, gameId: p.gameId })).catch(() => {})
        return
      }
      const seat = this.o.seat?.() ?? undefined
      await this.o.send(fromPeer, JSON.stringify({ type: 't_accept', tournament: m.tournament, gameId: p.gameId, player: me.pub, seat })).catch(() => {})
      if (arena) { this.arenaGames.set(p.gameId, { tournament: m.tournament, white: p.white, black: p.black }); this.keepArena(); this.sayBusy(m.tournament, me) }
      this.o.onMatched({ tournament: m.tournament, gameId: p.gameId, opponent: fromPeer, opponentKey: theirs, myColor: p.white === me.pub ? 'white' : 'black', timeControl: v.tournament.timeControl, theirSeat: typeof m.seat === 'string' ? m.seat : undefined })
      return
    }
    if (m.type === 't_accept') {
      const o = this.offer
      if (!o || o.gameId !== m.gameId || o.to !== fromPeer || m.player !== o.match.opponentKey) return
      this.offer = null
      if (this.o.isPlaying()) return
      if (v.format === 'arena') { this.arenaGames.set(o.gameId, { tournament: v.tournament.id, white: p.white, black: p.black }); this.keepArena(); this.sayBusy(v.tournament.id, me) }
      this.o.onMatched({ ...o.match, theirSeat: typeof m.seat === 'string' ? m.seat : undefined })
      return
    }
    const sent = this.offer as TournamentClient['offer']
    if (m.type === 't_decline' && sent && sent.gameId === m.gameId && sent.to === fromPeer) this.offer = null
  }
}

function validTournament(t: any): t is Tournament {
  return typeof t?.id === 'string' && typeof t.name === 'string' && typeof t.creator === 'string'
    && typeof t.timeControl?.minutes === 'number' && typeof t.timeControl?.increment === 'number'
    && ((t.start?.kind === 'at' && typeof t.start.at === 'number') || (t.start?.kind === 'players' && Number.isInteger(t.start.players) && t.start.players >= 2))
    && Number.isInteger(t.maxPlayers) && t.maxPlayers >= 2 && t.maxPlayers <= MAX_PLAYERS
    && (t.format === undefined || t.format === 'round-robin' || t.format === 'swiss' || t.format === 'arena')
    && (t.format !== 'swiss' || (Number.isInteger(t.rounds) && t.rounds >= 1 && t.rounds <= 30))
    && (t.format !== 'arena' || (Number.isInteger(t.minutes) && t.minutes >= 5 && t.minutes <= 24 * 60))
}
