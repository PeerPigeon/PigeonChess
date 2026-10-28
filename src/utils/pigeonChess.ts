/**
 * Pigeon chess: standard chess, except the knight is a pigeon.
 *
 * - A pigeon moves in a longer L: three squares one way and one square to the
 *   side (a knight's L made one square longer). It leaps, like a knight.
 * - Every opponent piece it jumps over gets pooped on: all pieces inside the
 *   rectangle its L spans, other than the squares it starts and lands on.
 *   Kings can't be pooped.
 * - On the pigeon side's next move, any of its pieces standing next to a
 *   pooped piece (one square in any direction) may capture it, however that
 *   piece normally moves. After that move the poop is gone; a pooped piece
 *   that moves away is clean.
 *
 * The class mirrors the parts of chess.js that PigeonChess uses (move, moves,
 * fen, turn, get, board, undo, history and the game-state checks), so the app
 * can use either. The pigeon is stored and written as a knight ('n', 'N').
 */

import { markRaw } from 'vue'

export type Color = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type Piece = { type: PieceType; color: Color }

export type Move = {
  color: Color
  from: string
  to: string
  piece: PieceType
  captured?: PieceType
  promotion?: PieceType
  flags: string
  san: string
  lan: string
  before: string
  after: string
  /** Opponent pieces this move pooped on (pigeon moves only). */
  pooped?: string[]
  /** True when this captured a pooped piece in a way the piece couldn't normally. */
  poopCapture?: boolean
}

type Castling = { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }
type State = {
  board: (Piece | null)[]
  turn: Color
  castling: Castling
  ep: number | null
  half: number
  full: number
  /** Squares holding enemy pieces each side may poop-capture on its next move. */
  poop: { w: number[]; b: number[] }
}
type Raw = {
  from: number
  to: number
  piece: PieceType
  color: Color
  captured?: PieceType
  promotion?: PieceType
  flags: string
  pooped?: number[]
  poopCapture?: boolean
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 -'
const FILES = 'abcdefgh'
const sqName = (i: number) => FILES[i & 7] + String((i >> 3) + 1)
const sqIndex = (s: string) => FILES.indexOf(s[0]) + (Number(s[1]) - 1) * 8
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

const PIGEON = [[1, 3], [3, 1], [3, -1], [1, -3], [-1, -3], [-3, -1], [-3, 1], [-1, 3]]
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

/** Squares inside the rectangle a pigeon's L spans, without its start and landing. */
export function jumpedSquares(from: number, to: number): number[] {
  const f0 = Math.min(from & 7, to & 7), f1 = Math.max(from & 7, to & 7)
  const r0 = Math.min(from >> 3, to >> 3), r1 = Math.max(from >> 3, to >> 3)
  const out: number[] = []
  for (let r = r0; r <= r1; r++) for (let f = f0; f <= f1; f++) {
    const i = r * 8 + f
    if (i !== from && i !== to) out.push(i)
  }
  return out
}

function cloneState(s: State): State {
  return { board: s.board.slice(), turn: s.turn, castling: { ...s.castling }, ep: s.ep, half: s.half, full: s.full, poop: { w: s.poop.w.slice(), b: s.poop.b.slice() } }
}

function parseFen(fen: string): State {
  const parts = fen.trim().split(/\s+/)
  const board: (Piece | null)[] = new Array(64).fill(null)
  const rows = parts[0].split('/')
  if (rows.length !== 8) throw new Error(`Invalid FEN: ${fen}`)
  rows.forEach((row, i) => {
    const r = 7 - i
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) { f += Number(ch); continue }
      const color: Color = ch === ch.toUpperCase() ? 'w' : 'b'
      board[r * 8 + f] = { type: ch.toLowerCase() as PieceType, color }
      f++
    }
  })
  const c = parts[2] || '-'
  const poop = { w: [] as number[], b: [] as number[] }
  // Seventh field: "w:c4,d5/b:e5", or "-"
  if (parts[6] && parts[6] !== '-') {
    for (const side of parts[6].split('/')) {
      const [who, list] = side.split(':')
      if ((who === 'w' || who === 'b') && list) poop[who] = list.split(',').filter(Boolean).map(sqIndex)
    }
  }
  return {
    board,
    turn: parts[1] === 'b' ? 'b' : 'w',
    castling: { wK: c.includes('K'), wQ: c.includes('Q'), bK: c.includes('k'), bQ: c.includes('q') },
    ep: parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : null,
    half: Number(parts[4] || 0),
    full: Number(parts[5] || 1),
    poop,
  }
}

function placement(s: State): string {
  const rows: string[] = []
  for (let r = 7; r >= 0; r--) {
    let row = '', empty = 0
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f]
      if (!p) { empty++; continue }
      if (empty) { row += empty; empty = 0 }
      row += p.color === 'w' ? p.type.toUpperCase() : p.type
    }
    if (empty) row += empty
    rows.push(row)
  }
  return rows.join('/')
}

function toFen(s: State): string {
  const c = (s.castling.wK ? 'K' : '') + (s.castling.wQ ? 'Q' : '') + (s.castling.bK ? 'k' : '') + (s.castling.bQ ? 'q' : '')
  const poopParts = (['w', 'b'] as Color[]).filter((x) => s.poop[x].length).map((x) => `${x}:${s.poop[x].map(sqName).join(',')}`)
  return `${placement(s)} ${s.turn} ${c || '-'} ${s.ep !== null ? sqName(s.ep) : '-'} ${s.half} ${s.full} ${poopParts.join('/') || '-'}`
}

/** A key for repetition: everything but the move counters. */
function positionKey(s: State): string {
  return toFen(s).split(' ').filter((_, i) => i !== 4 && i !== 5).join(' ')
}

function isAttacked(s: State, sq: number, by: Color): boolean {
  const f = sq & 7, r = sq >> 3
  const at = (ff: number, rr: number) => (onBoard(ff, rr) ? s.board[rr * 8 + ff] : null)
  // Pawns
  const dir = by === 'w' ? -1 : 1
  for (const df of [-1, 1]) {
    const p = at(f + df, r + dir)
    if (p && p.color === by && p.type === 'p') return true
  }
  // Pigeons and kings
  for (const [df, dr] of PIGEON) { const p = at(f + df, r + dr); if (p && p.color === by && p.type === 'n') return true }
  for (const [df, dr] of KING) { const p = at(f + df, r + dr); if (p && p.color === by && p.type === 'k') return true }
  // Sliders
  const slide = (dirs: number[][], types: PieceType[]) => {
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr
      while (onBoard(ff, rr)) {
        const p = s.board[rr * 8 + ff]
        if (p) { if (p.color === by && types.includes(p.type)) return true; break }
        ff += df; rr += dr
      }
    }
    return false
  }
  return slide(ROOK_DIRS, ['r', 'q']) || slide(BISHOP_DIRS, ['b', 'q'])
}

function kingSquare(s: State, c: Color): number {
  return s.board.findIndex((p) => p?.type === 'k' && p.color === c)
}

function inCheck(s: State, c: Color = s.turn): boolean {
  const k = kingSquare(s, c)
  return k >= 0 && isAttacked(s, k, other(c))
}

function pseudoMoves(s: State): Raw[] {
  const us = s.turn, them = other(us)
  const out: Raw[] = []
  const add = (from: number, to: number, flags: string, extra: Partial<Raw> = {}) => {
    const piece = s.board[from]!
    const target = s.board[to]
    const lastRank = us === 'w' ? 7 : 0
    const base: Raw = { from, to, piece: piece.type, color: us, flags, ...extra }
    if (target && !base.captured) base.captured = target.type
    if (piece.type === 'p' && (to >> 3) === lastRank) {
      for (const promotion of ['q', 'r', 'b', 'n'] as PieceType[]) out.push({ ...base, promotion, flags: base.flags + 'p' })
    } else {
      out.push(base)
    }
  }
  for (let i = 0; i < 64; i++) {
    const p = s.board[i]
    if (!p || p.color !== us) continue
    const f = i & 7, r = i >> 3
    if (p.type === 'p') {
      const dir = us === 'w' ? 1 : -1, startRank = us === 'w' ? 1 : 6
      const one = i + dir * 8
      if (onBoard(f, r + dir) && !s.board[one]) {
        add(i, one, 'n')
        const two = i + dir * 16
        if (r === startRank && !s.board[two]) add(i, two, 'b')
      }
      for (const df of [-1, 1]) {
        if (!onBoard(f + df, r + dir)) continue
        const t = (r + dir) * 8 + f + df
        if (s.board[t]?.color === them) add(i, t, 'c')
        else if (s.ep === t) add(i, t, 'e', { captured: 'p' })
      }
    } else if (p.type === 'n') {
      for (const [df, dr] of PIGEON) {
        if (!onBoard(f + df, r + dr)) continue
        const t = (r + dr) * 8 + f + df
        const target = s.board[t]
        if (target?.color === us) continue
        const pooped = jumpedSquares(i, t).filter((j) => s.board[j]?.color === them && s.board[j]?.type !== 'k')
        add(i, t, target ? 'c' : 'n', pooped.length ? { pooped } : {})
      }
    } else if (p.type === 'k') {
      for (const [df, dr] of KING) {
        if (!onBoard(f + df, r + dr)) continue
        const t = (r + dr) * 8 + f + df
        if (s.board[t]?.color !== us) add(i, t, s.board[t] ? 'c' : 'n')
      }
      // Castling
      const home = us === 'w' ? 4 : 60
      if (i === home && !inCheck(s, us)) {
        const k = us === 'w' ? s.castling.wK : s.castling.bK
        const q = us === 'w' ? s.castling.wQ : s.castling.bQ
        if (k && !s.board[home + 1] && !s.board[home + 2] && s.board[home + 3]?.type === 'r'
          && !isAttacked(s, home + 1, them) && !isAttacked(s, home + 2, them)) add(i, home + 2, 'k')
        if (q && !s.board[home - 1] && !s.board[home - 2] && !s.board[home - 3] && s.board[home - 4]?.type === 'r'
          && !isAttacked(s, home - 1, them) && !isAttacked(s, home - 2, them)) add(i, home - 2, 'q')
      }
    } else {
      const dirs = p.type === 'r' ? ROOK_DIRS : p.type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr
        while (onBoard(ff, rr)) {
          const t = rr * 8 + ff
          const target = s.board[t]
          if (target) { if (target.color === them) add(i, t, 'c'); break }
          add(i, t, 'n')
          ff += df; rr += dr
        }
      }
    }
  }
  // Poop captures: any of our pieces next to a pooped enemy piece may take it.
  for (const t of s.poop[us]) {
    const target = s.board[t]
    if (!target || target.color !== them || target.type === 'k') continue
    const f = t & 7, r = t >> 3
    for (const [df, dr] of KING) {
      if (!onBoard(f + df, r + dr)) continue
      const from = (r + dr) * 8 + f + df
      if (s.board[from]?.color !== us) continue
      if (out.some((m) => m.from === from && m.to === t)) continue // already an ordinary capture
      add(from, t, 'c', { poopCapture: true })
    }
  }
  return out
}

function applyRaw(s: State, m: Raw): State {
  const n = cloneState(s)
  const us = m.color, them = other(us)
  const piece = n.board[m.from]!
  n.board[m.from] = null
  if (m.flags.includes('e')) n.board[m.to + (us === 'w' ? -8 : 8)] = null
  n.board[m.to] = m.promotion ? { type: m.promotion, color: us } : piece
  if (m.flags.includes('k')) { n.board[m.from + 1] = n.board[m.from + 3]; n.board[m.from + 3] = null }
  if (m.flags.includes('q')) { n.board[m.from - 1] = n.board[m.from - 4]; n.board[m.from - 4] = null }
  // Castling rights
  if (piece.type === 'k') { if (us === 'w') { n.castling.wK = n.castling.wQ = false } else { n.castling.bK = n.castling.bQ = false } }
  const touch = (sq: number) => {
    if (sq === 0) n.castling.wQ = false
    if (sq === 7) n.castling.wK = false
    if (sq === 56) n.castling.bQ = false
    if (sq === 63) n.castling.bK = false
  }
  touch(m.from); touch(m.to)
  n.ep = m.flags.includes('b') ? (m.from + m.to) / 2 : null
  n.half = piece.type === 'p' || m.captured ? 0 : n.half + 1
  if (us === 'b') n.full += 1
  // Poop: ours is spent by this move and replaced by what this move pooped on;
  // theirs follows their pieces, so a piece we just took is no longer pooped.
  n.poop[us] = m.pooped ? m.pooped.slice() : []
  const vacated = [m.from, m.to]
  if (m.flags.includes('k')) vacated.push(m.from + 3)
  if (m.flags.includes('q')) vacated.push(m.from - 4)
  n.poop[them] = n.poop[them].filter((sq) => !vacated.includes(sq))
  n.turn = them
  return n
}

function legalRaw(s: State): Raw[] {
  return pseudoMoves(s).filter((m) => !inCheck(applyRaw(s, m), m.color))
}

function insufficient(s: State): boolean {
  const pieces = s.board.map((p, i) => (p ? { ...p, i } : null)).filter((p): p is Piece & { i: number } => Boolean(p) && p!.type !== 'k')
  if (pieces.length === 0) return true
  if (pieces.length === 1 && (pieces[0].type === 'b' || pieces[0].type === 'n')) return true
  if (pieces.every((p) => p.type === 'b')) {
    const shade = (i: number) => ((i & 7) + (i >> 3)) % 2
    return new Set(pieces.map((p) => shade(p.i))).size === 1
  }
  return false
}

export class PigeonChess {
  readonly variant = 'pigeon'
  /**
   * The game itself lives outside Vue's reactivity (markRaw): the app keeps this
   * object in a ref, and proxying every square read made move generation slow
   * enough that pieces drew late. `version` is the one reactive field; every
   * read touches it and every change bumps it, so views still update.
   */
  private version = 0
  private core: { state: State; stack: { state: State; move: Move }[]; seen: Map<string, number>; legal: { state: State; moves: Raw[] } | null }

  constructor(fen: string = START) {
    const state = parseFen(fen)
    this.core = markRaw({ state, stack: [], seen: new Map([[positionKey(state), 1]]), legal: null })
  }

  private get state(): State {
    void this.version
    return this.core.state
  }

  private set state(next: State) {
    this.core.state = next
    this.version++
  }

  private get stack() { void this.version; return this.core.stack }
  private get seen() { return this.core.seen }

  /** Legal moves of the current position, worked out once per position. */
  private legal(): Raw[] {
    const s = this.state
    if (this.core.legal?.state !== s) this.core.legal = { state: s, moves: legalRaw(s) }
    return this.core.legal.moves
  }

  load(fen: string) {
    const state = parseFen(fen)
    this.core.stack = []
    this.core.seen = new Map([[positionKey(state), 1]])
    this.state = state
  }

  reset() { this.load(START) }
  fen(): string { return toFen(this.state) }
  turn(): Color { return this.state.turn }

  get(square: string): Piece | undefined {
    const p = this.state.board[sqIndex(square)]
    return p ? { ...p } : undefined
  }

  board(): ({ square: string; type: PieceType; color: Color } | null)[][] {
    const rows = []
    for (let r = 7; r >= 0; r--) {
      const row = []
      for (let f = 0; f < 8; f++) {
        const p = this.state.board[r * 8 + f]
        row.push(p ? { square: sqName(r * 8 + f), type: p.type, color: p.color } : null)
      }
      rows.push(row)
    }
    return rows
  }

  /** Squares whose pieces the side to move may poop-capture now. */
  poopSquares(): string[] {
    const us = this.state.turn
    return this.state.poop[us].filter((sq) => this.state.board[sq]?.color === other(us)).map(sqName)
  }

  /** Every pooped square on the board, with which side may capture there. */
  allPoop(): { square: string; by: Color }[] {
    return (['w', 'b'] as Color[]).flatMap((by) =>
      this.state.poop[by].filter((sq) => this.state.board[sq]?.color === other(by)).map((sq) => ({ square: sqName(sq), by })))
  }

  private san(s: State, m: Raw, legal: Raw[]): string {
    let out: string
    if (m.flags.includes('k')) out = 'O-O'
    else if (m.flags.includes('q')) out = 'O-O-O'
    else {
      const capture = Boolean(m.captured)
      if (m.piece === 'p' && !m.poopCapture) {
        out = (capture ? FILES[m.from & 7] + 'x' : '') + sqName(m.to)
      } else {
        const letter = m.piece === 'p' ? FILES[m.from & 7] : m.piece.toUpperCase()
        const rivals = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from && (o.promotion || null) === (m.promotion || null))
        let dis = ''
        if (rivals.length && m.piece !== 'p') {
          const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7))
          const sameRank = rivals.some((o) => (o.from >> 3) === (m.from >> 3))
          dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String((m.from >> 3) + 1) : sqName(m.from)
        }
        out = letter + dis + (capture ? 'x' : '') + sqName(m.to)
      }
      if (m.promotion) out += '=' + m.promotion.toUpperCase()
    }
    const after = applyRaw(s, m)
    if (inCheck(after)) out += legalRaw(after).length ? '+' : '#'
    return out
  }

  private toMove(s: State, m: Raw, legal: Raw[]): Move {
    const after = applyRaw(s, m)
    const move: Move = {
      color: m.color, from: sqName(m.from), to: sqName(m.to), piece: m.piece, flags: m.flags,
      san: this.san(s, m, legal), lan: sqName(m.from) + sqName(m.to) + (m.promotion || ''),
      before: toFen(s), after: toFen(after),
    }
    if (m.captured) move.captured = m.captured
    if (m.promotion) move.promotion = m.promotion
    if (m.pooped?.length) move.pooped = m.pooped.map(sqName)
    if (m.poopCapture) move.poopCapture = true
    return move
  }

  moves(options: { square?: string; verbose?: boolean } = {}): any[] {
    const s = this.state
    const legal = this.legal()
    const list = options.square ? legal.filter((m) => m.from === sqIndex(options.square!)) : legal
    const verbose = list.map((m) => this.toMove(s, m, legal))
    return options.verbose ? verbose : verbose.map((m) => m.san)
  }

  move(input: string | { from: string; to: string; promotion?: string }): Move {
    const s = this.state
    const legal = this.legal()
    let found: Raw | undefined
    if (typeof input === 'string') {
      const text = input.trim()
      const lan = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(text)
      if (lan) {
        found = legal.find((m) => m.from === sqIndex(lan[1]) && m.to === sqIndex(lan[2]) && (m.promotion || 'q') === (lan[3] || m.promotion || 'q'))
      } else {
        const clean = (x: string) => x.replace(/[+#!?]/g, '')
        found = legal.find((m) => clean(this.san(s, m, legal)) === clean(text))
      }
    } else {
      const from = sqIndex(input.from), to = sqIndex(input.to)
      const promo = (input.promotion || 'q') as PieceType
      found = legal.find((m) => m.from === from && m.to === to && (!m.promotion || m.promotion === promo))
    }
    if (!found) throw new Error(`Invalid move: ${typeof input === 'string' ? input : JSON.stringify(input)}`)
    const move = this.toMove(s, found, legal)
    const next = applyRaw(s, found)
    this.core.stack.push({ state: s, move })
    const key = positionKey(next)
    this.seen.set(key, (this.seen.get(key) || 0) + 1)
    this.state = next
    return move
  }

  undo(): Move | null {
    const last = this.core.stack.pop()
    if (!last) return null
    const key = positionKey(this.core.state)
    this.seen.set(key, Math.max(0, (this.seen.get(key) || 1) - 1))
    this.state = last.state
    return last.move
  }

  history(options: { verbose?: boolean } = {}): any[] {
    return options.verbose ? this.stack.map((x) => x.move) : this.stack.map((x) => x.move.san)
  }

  isCheck(): boolean { return inCheck(this.state) }
  inCheck(): boolean { return this.isCheck() }
  isCheckmate(): boolean { return this.isCheck() && this.legal().length === 0 }
  isStalemate(): boolean { return !this.isCheck() && this.legal().length === 0 }
  isInsufficientMaterial(): boolean { return insufficient(this.state) }
  isThreefoldRepetition(): boolean { const s = this.state; return (this.seen.get(positionKey(s)) || 0) >= 3 }
  isDrawByFiftyMoves(): boolean { return this.state.half >= 100 }
  isDraw(): boolean { return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.isDrawByFiftyMoves() }
  isGameOver(): boolean { return this.isCheckmate() || this.isDraw() }
}

/** A small search for the computer opponent in the variant (Stockfish only knows chess). */
const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

function evaluate(g: PigeonChess, me: Color): number {
  let score = 0
  for (const row of g.board()) for (const p of row) if (p) score += (p.color === me ? 1 : -1) * VALUE[p.type]
  // Pieces it may poop-capture are worth a little to the side that may take them.
  for (const { square, by } of g.allPoop()) {
    const p = g.get(square)
    if (p) score += (by === me ? 1 : -1) * VALUE[p.type] * 0.3
  }
  return score
}

export function pickPigeonMove(g: PigeonChess, depth: number): Move | null {
  const me = g.turn()
  const search = (d: number, alpha: number, beta: number, maximizing: boolean): number => {
    if (g.isCheckmate()) return maximizing ? -100000 - d : 100000 + d
    if (g.isDraw()) return 0
    if (d === 0) return evaluate(g, me)
    const moves = g.moves({ verbose: true }) as Move[]
    moves.sort((a, b) => (b.captured ? VALUE[b.captured] : 0) - (a.captured ? VALUE[a.captured] : 0))
    if (maximizing) {
      let best = -Infinity
      for (const m of moves) {
        g.move(m.lan); best = Math.max(best, search(d - 1, alpha, beta, false)); g.undo()
        alpha = Math.max(alpha, best); if (alpha >= beta) break
      }
      return best
    }
    let best = Infinity
    for (const m of moves) {
      g.move(m.lan); best = Math.min(best, search(d - 1, alpha, beta, true)); g.undo()
      beta = Math.min(beta, best); if (alpha >= beta) break
    }
    return best
  }
  const moves = g.moves({ verbose: true }) as Move[]
  if (!moves.length) return null
  let bestScore = -Infinity
  let best: Move[] = []
  for (const m of moves) {
    g.move(m.lan)
    const score = search(depth - 1, -Infinity, Infinity, false)
    g.undo()
    if (score > bestScore) { bestScore = score; best = [m] } else if (score === bestScore) best.push(m)
  }
  return best[Math.floor(Math.random() * best.length)]
}
