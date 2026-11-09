/**
 * One game as a computer player (a wurl bot) plays it against a PigeonChess page: the same messages the
 * page sends its opponent, sealed with this game's seat key (composables/useSeat.ts), so the page takes
 * the bot for any other opponent.
 *
 * What it says: its moves ({ type: 'move', data: { from, to, promotion } }), pings and pongs, the moves so
 * far when asked (timer_sync, after the page reloads or wonders about a clock), and resign_ack. What it
 * acts on: moves, the moves so far, ping, resign, flag (a clock ran out), abandon and abort. It never
 * offers or accepts a draw or a take-back. Its own clock: when it runs out, it says so (flag), as a page does.
 */
import { createChess } from '../utils/variant'
import { open, seal, type Seat, type SeatKeys } from '../composables/useSeat'
import type { Result } from '../utils/tournament'

export interface BotMove { from: string; to: string; promotion?: string }

export interface BotGameOptions {
  gameId: string
  myColor: 'white' | 'black'
  /** The opponent's peer ID (it follows them to a new one after a reload). */
  opponent: string
  mySeat: SeatKeys
  theirSeat: string
  timeControl: { minutes: number; increment: number }
  send: (peerId: string, message: string) => Promise<unknown>
  /** The move to make in this position (FEN); `msLeft` is its clock (Infinity: none). */
  chooseMove: (fen: string, msLeft: number) => Promise<BotMove | null>
  /** The game is over: its result (white–black), or null when it ended without one (aborted). */
  onEnd: (result: Result | null, moves: string[], why: string) => void
  log?: (line: string) => void
}

const PING_MS = 3000
/** Nothing heard from the opponent for this long, on their move with no clock: they left. */
const GONE_MS = 5 * 60 * 1000

export class BotGame {
  private chess = createChess()
  private seat: Seat
  private over = false
  private thinking = false
  private ping: ReturnType<typeof setInterval> | null = null
  private myMs: number
  private turnStarted = Date.now()
  private lastHeard = Date.now()
  readonly moves: string[] = []

  constructor(private o: BotGameOptions) {
    this.seat = { gameId: o.gameId, mine: o.mySeat, theirs: o.theirSeat, sent: 0, heard: 0 }
    this.myMs = o.timeControl.minutes > 0 ? o.timeControl.minutes * 60_000 : Infinity
  }

  get gameId() { return this.o.gameId }
  get opponent() { return this.o.opponent }
  get finished() { return this.over }

  start(): void {
    this.ping = setInterval(() => this.tick(), PING_MS)
    this.maybeMove()
  }

  private myTurn() { return (this.chess.turn() === 'w') === (this.o.myColor === 'white') }

  private async say(inner: Record<string, unknown>): Promise<void> {
    const sealed = await seal(this.seat, JSON.stringify(inner))
    await this.o.send(this.o.opponent, JSON.stringify(sealed)).catch(() => {})
  }

  private tick(): void {
    if (this.over) return
    void this.say({ type: 'ping', t: Date.now() })
    // Its own clock ran out: it lost on time, and says so.
    if (this.myTurn() && this.myMs !== Infinity && this.myMs - (Date.now() - this.turnStarted) <= 0) {
      void this.say({ type: 'flag', gameId: this.o.gameId, loser: this.o.myColor })
      this.end(this.o.myColor === 'white' ? '0-1' : '1-0', 'its clock ran out')
      return
    }
    // The opponent went quiet on their move, in a game without a clock: they left.
    if (!this.myTurn() && this.myMs === Infinity && Date.now() - this.lastHeard > GONE_MS) {
      const theirs = this.o.myColor === 'white' ? 'black' : 'white'
      void this.say({ type: 'abandon', gameId: this.o.gameId, loser: theirs, reason: 'left' })
      this.end(theirs === 'white' ? '0-1' : '1-0', 'the opponent left')
    }
  }

  /** A message from the mesh: true when it was about this game. */
  handle(message: any, fromPeer: string): boolean {
    if (message?.type !== 'sealed' || message.gameId !== this.o.gameId) return false
    void (async () => {
      const body = await open(this.seat, message)
      if (!body || this.over) return
      // The same player on a new peer ID (they reloaded): follow them.
      if (fromPeer && fromPeer !== this.o.opponent) this.o.opponent = fromPeer
      this.lastHeard = Date.now()
      let inner: any
      try { inner = JSON.parse(body) } catch { return }
      this.onMessage(inner)
    })()
    return true
  }

  private onMessage(m: any): void {
    const theirs = this.o.myColor === 'white' ? 'black' : 'white'
    switch (m?.type) {
      case 'ping': void this.say({ type: 'pong', t: m.t }); return
      case 'time_check':
      case 'rejoin': void this.say({ type: 'timer_sync', gameId: this.o.gameId, moves: [...this.moves] }); return
      case 'move': {
        if (this.myTurn() || !m.data?.from || !m.data?.to) return
        if (!this.apply(m.data.from, m.data.to, m.data.promotion)) { this.o.log?.(`their move ${m.data.from}${m.data.to} did not fit the board`); return }
        this.maybeMove()
        return
      }
      case 'timer_sync': {
        // Moves of theirs this side missed: caught up.
        if (!Array.isArray(m.moves) || m.moves.length <= this.moves.length) return
        for (const san of m.moves.slice(this.moves.length)) {
          try { if (!this.chess.move(String(san))) break } catch { break }
          this.moves.push(String(san))
        }
        this.checkOver()
        this.maybeMove()
        return
      }
      case 'resign':
        void this.say({ type: 'resign_ack', gameId: this.o.gameId })
        this.end(this.o.myColor === 'white' ? '1-0' : '0-1', 'they resigned')
        return
      case 'flag': {
        const loser = m.loser === 'white' || m.loser === 'black' ? m.loser : theirs
        this.end(loser === 'white' ? '0-1' : '1-0', 'on time')
        return
      }
      case 'abandon': {
        if (m.reason === 'long_move') return
        const loser = m.loser === 'white' || m.loser === 'black' ? m.loser : theirs
        this.end(loser === 'white' ? '0-1' : '1-0', 'abandoned')
        return
      }
      case 'abort': this.end(null, 'aborted'); return
      case 'draw_accept': this.end('1/2-1/2', 'draw agreed'); return
      default: return
    }
  }

  private apply(from: string, to: string, promotion?: string): boolean {
    const piece = this.chess.get(from as any)
    const promotes = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
    const as = promotes ? (typeof promotion === 'string' && /^[qrbn]$/.test(promotion) ? promotion : 'q') : undefined
    let move: any
    try { move = this.chess.move({ from, to, ...(as ? { promotion: as } : {}) } as any) } catch { return false }
    if (!move) return false
    this.moves.push(move.san)
    this.turnStarted = Date.now()
    this.checkOver()
    return true
  }

  private checkOver(): void {
    if (this.over || !this.chess.isGameOver()) return
    if (this.chess.isCheckmate()) this.end(this.chess.turn() === 'w' ? '0-1' : '1-0', 'checkmate')
    else this.end('1/2-1/2', 'draw')
  }

  private maybeMove(): void {
    if (this.over || this.thinking || !this.myTurn()) return
    this.thinking = true
    void (async () => {
      const left = this.myMs === Infinity ? Infinity : this.myMs - (Date.now() - this.turnStarted)
      const move = await this.o.chooseMove(this.chess.fen(), left).catch(() => null)
      this.thinking = false
      if (this.over || !this.myTurn()) return
      const pick = move ?? this.anyMove()
      if (!pick) return
      // Its turn has run since the opponent's move arrived (thinking, and waiting to think).
      const used = Date.now() - this.turnStarted
      if (!this.apply(pick.from, pick.to, pick.promotion ?? 'q')) return
      if (this.myMs !== Infinity) this.myMs = this.myMs - used + this.o.timeControl.increment * 1000
      const last = this.chess.history({ verbose: true }).at(-1) as any
      await this.say({ type: 'move', gameId: this.o.gameId, data: { from: pick.from, to: pick.to, ...(last?.promotion ? { promotion: last.promotion } : {}) } })
    })()
  }

  /** Any legal move (the engine gave none). */
  private anyMove(): BotMove | null {
    const all = this.chess.moves({ verbose: true }) as any[]
    const m = all[Math.floor(Math.random() * all.length)]
    return m ? { from: m.from, to: m.to, promotion: m.promotion } : null
  }

  private end(result: Result | null, why: string): void {
    if (this.over) return
    this.over = true
    if (this.ping) clearInterval(this.ping)
    this.ping = null
    this.o.onEnd(result, [...this.moves], why)
  }

  /** Stop without a result (the bot is shutting down). */
  stop(): void {
    this.over = true
    if (this.ping) clearInterval(this.ping)
  }
}
