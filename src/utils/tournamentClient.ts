/**
 * Taking part in tournaments: the same code on a page (useTournaments wraps it for Vue) and in a wurl bot.
 *
 * - Reads the shared tournaments room (records: utils/tournament.ts), and follows it as it changes.
 * - Creates tournaments, signs up and withdraws, and reports its games' results.
 * - Starts a tournament that is due: its creator writes the start; when the creator has not done so a
 *   while after it was due, one of its players does.
 * - Plays: while a tournament it plays in runs, it says it is ready (signed by the player, so nobody else
 *   can be them), and of two players who owe each other a game and are both ready and free, the one with
 *   white offers and the other answers. The game then starts through the page's (or bot's) own game code,
 *   exactly like a match from the lobby.
 */
import {
  chosenStart, dueStart, gameState, gamesToPlay, leaderboard, newTournamentId, readyText, schedule, standings, statusOf, START_GRACE_MS, KEYS,
  type Leader, type Pairing, type Report, type Result, type Signup, type Standing, type Start, type Status, type Tournament,
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
}

export interface TournamentView {
  tournament: Tournament
  signups: Signup[]
  start: Start | null
  players: string[]
  pairings: Pairing[]
  reports: Report[]
  status: Status
  table: Standing[]
  /** Names by key (from the sign-ups). */
  names: Map<string, string>
  bots: Set<string>
}

const READY_MS = 3000
const READY_GONE_MS = 10_000
const OFFER_MS = 10_000
const REFRESH_MS = 15_000

export class TournamentClient {
  private tournaments = new Map<string, Tournament>()
  private signups = new Map<string, Signup>()
  private starts = new Map<string, Start>()
  private reports = new Map<string, Report>()
  /** Players seen ready: `${tournament}:${player}` → their peer and when (checked: they signed it). */
  private ready = new Map<string, { peerId: string; seenAt: number }>()
  private offer: { gameId: string; to: string; sentAt: number; match: Omit<TournamentMatch, 'theirSeat'> } | null = null
  private timers: ReturnType<typeof setInterval>[] = []
  private unsubscribe: (() => void) | null = null
  private room: any = null
  private refreshing: Promise<void> | null = null
  private wroteStart = new Set<string>()

  constructor(private o: TournamentClientOptions) {}

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
      else if (key.startsWith('r:') && key === `r:${v.gameId}:${by}` && (v.white === by || v.black === by)) this.reports.set(key, { ...v, by })
    }
  }

  /** Each tournament as it stands now. */
  view(): TournamentView[] {
    const now = this.now()
    const out: TournamentView[] = []
    for (const t of this.tournaments.values()) {
      const signups = [...this.signups.values()].filter((s) => s.tournament === t.id)
      const start = chosenStart(t, [...this.starts.values()].filter((s) => s.tournament === t.id))
      const players = start?.players ?? []
      const pairings = start ? schedule(t.id, players) : []
      const ids = new Set(pairings.map((p) => p.gameId))
      const reports = [...this.reports.values()].filter((r) => r.tournament === t.id && ids.has(r.gameId))
      const names = new Map(signups.map((s) => [s.player, s.name]))
      if (!names.has(t.creator)) names.set(t.creator, t.creatorName)
      out.push({
        tournament: t, signups, start, players, pairings, reports,
        status: statusOf(t, start, pairings, reports, now, signups),
        table: standings(players, pairings, reports),
        names, bots: new Set(signups.filter((s) => s.bot).map((s) => s.player)),
      })
    }
    return out.sort((a, b) => b.tournament.createdAt - a.tournament.createdAt)
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
    await this.refresh()
  }

  /** A new tournament (its creator signs up too unless `play` is false). */
  async create(input: { name: string; timeControl: { minutes: number; increment: number }; start: Tournament['start']; maxPlayers: number; play?: boolean }): Promise<string> {
    const me = this.o.me()
    if (!me) throw new Error('Sign in to create a tournament')
    const t: Tournament = { id: newTournamentId(), name: input.name.trim().slice(0, 60) || 'Tournament', creator: me.pub, creatorName: me.name, timeControl: input.timeControl, start: input.start, maxPlayers: input.maxPlayers, createdAt: this.now() }
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

  /** A game of a tournament that ended (`result` as white–black). Not one of its games: nothing. */
  async report(gameId: string, result: Result, moves: string[]): Promise<boolean> {
    const me = this.o.me()
    if (!me) return false
    const v = this.view().find((x) => x.pairings.some((p) => p.gameId === gameId))
    const p = v?.pairings.find((x) => x.gameId === gameId)
    if (!v || !p || (p.white !== me.pub && p.black !== me.pub)) return false
    const report: Omit<Report, 'by'> = { tournament: v.tournament.id, gameId, white: p.white, black: p.black, result, moves: moves.slice(0, 600), at: this.now() }
    await this.write(`r:${gameId}:${me.pub}`, report).catch(() => {})
    return true
  }

  /** Whether this game is one of a tournament's. */
  isTournamentGame(gameId: string): boolean {
    return this.view().some((v) => v.pairings.some((p) => p.gameId === gameId))
  }

  /** Every few seconds: start what is due; say this player is ready; offer a game owed to a ready player. */
  private async tick(): Promise<void> {
    const me = this.o.me(), peerId = this.o.peerId()
    if (!me || !peerId) return
    const now = this.now()
    const views = this.view()
    for (const v of views) await this.maybeStart(v, me, now)
    if (this.offer && now - this.offer.sentAt > OFFER_MS) this.offer = null
    if (this.o.isPlaying()) return
    for (const v of views) {
      if (v.status !== 'running' || !v.players.includes(me.pub)) continue
      const owed = gamesToPlay(me.pub, v.pairings, v.reports)
      if (!owed.length) continue
      const at = now
      const sig = await this.o.sign(readyText(v.tournament.id, me.pub, peerId, at)).catch(() => null)
      if (!sig) continue
      void this.o.broadcast(JSON.stringify({ type: 't_ready', tournament: v.tournament.id, player: me.pub, peerId, at, sig })).catch(() => {})
      // Not every time: of three players each offering the next a game, all would decline for ever.
      if (this.offer || Math.random() < 0.3) continue
      // White offers the first game owed to someone who is there.
      for (const p of owed) {
        if (p.white !== me.pub) continue
        const there = this.ready.get(`${v.tournament.id}:${p.black}`)
        if (!there || now - there.seenAt > READY_GONE_MS) continue
        const match = { tournament: v.tournament.id, gameId: p.gameId, opponent: there.peerId, opponentKey: p.black, myColor: 'white' as const, timeControl: v.tournament.timeControl }
        this.offer = { gameId: p.gameId, to: there.peerId, sentAt: now, match }
        void this.o.send(there.peerId, JSON.stringify({ type: 't_offer', tournament: v.tournament.id, gameId: p.gameId, player: me.pub, seat: this.o.seat?.() ?? undefined })).catch(() => {})
        break
      }
    }
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
      if (typeof m.player !== 'string' || typeof m.peerId !== 'string' || typeof m.sig !== 'string' || !v.players.includes(m.player)) return
      if (Math.abs(this.now() - Number(m.at)) > 60_000) return
      const keys = v.signups.find((s) => s.player === m.player)?.keys ?? { pub: m.player }
      if (!(await this.o.verify(readyText(m.tournament, m.player, m.peerId, Number(m.at)), m.sig, keys).catch(() => false))) return
      this.ready.set(`${m.tournament}:${m.player}`, { peerId: m.peerId, seenAt: this.now() })
      return
    }
    const p = v.pairings.find((x) => x.gameId === m.gameId)
    if (!p) return
    if (m.type === 't_offer') {
      // From the white of a game owed to this player, on the peer they said they are ready on.
      if (p.black !== me.pub || m.player !== p.white) return
      const there = this.ready.get(`${m.tournament}:${p.white}`)
      const owed = gameState(p, v.reports).state === 'unplayed'
      // Not now (busy, not sure it is them yet, or the game is done): said at once, so they don't wait on it.
      if (!there || there.peerId !== fromPeer || !owed || v.status !== 'running' || this.o.isPlaying() || this.offer) {
        void this.o.send(fromPeer, JSON.stringify({ type: 't_decline', tournament: m.tournament, gameId: p.gameId })).catch(() => {})
        return
      }
      const seat = this.o.seat?.() ?? undefined
      await this.o.send(fromPeer, JSON.stringify({ type: 't_accept', tournament: m.tournament, gameId: p.gameId, player: me.pub, seat })).catch(() => {})
      this.o.onMatched({ tournament: m.tournament, gameId: p.gameId, opponent: fromPeer, opponentKey: p.white, myColor: 'black', timeControl: v.tournament.timeControl, theirSeat: typeof m.seat === 'string' ? m.seat : undefined })
      return
    }
    if (m.type === 't_accept') {
      const o = this.offer
      if (!o || o.gameId !== m.gameId || o.to !== fromPeer || m.player !== p.black) return
      this.offer = null
      if (this.o.isPlaying()) return
      this.o.onMatched({ ...o.match, theirSeat: typeof m.seat === 'string' ? m.seat : undefined })
      return
    }
    if (m.type === 't_decline' && this.offer?.gameId === m.gameId && this.offer.to === fromPeer) this.offer = null
  }
}

function validTournament(t: any): t is Tournament {
  return typeof t?.id === 'string' && typeof t.name === 'string' && typeof t.creator === 'string'
    && typeof t.timeControl?.minutes === 'number' && typeof t.timeControl?.increment === 'number'
    && ((t.start?.kind === 'at' && typeof t.start.at === 'number') || (t.start?.kind === 'players' && Number.isInteger(t.start.players) && t.start.players >= 2))
    && Number.isInteger(t.maxPlayers) && t.maxPlayers >= 2
}
