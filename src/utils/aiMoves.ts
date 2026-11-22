/** Which of the legal moves PigeonAI may choose from: none that repeats a position, none that walks a piece back. */
import { createChess } from './variant'

/** A position as repetition counts it: the pieces, who is to move, castling, en passant. */
const positionOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/**
 * The legal moves (of the position `fen`, reached by `history` from the start) that lead to a position not
 * seen earlier in the game. When the history can't be replayed: all of them.
 */
export function movesNotRepeating<M extends { san: string }>(fen: string, history: string[], legal: M[]): M[] {
  const seen = new Set<string>()
  try {
    const replay = createChess()
    seen.add(positionOf(replay.fen()))
    for (const m of history) { if (!replay.move(m)) return legal; seen.add(positionOf(replay.fen())) }
  } catch { return legal }
  return legal.filter((m) => {
    const next = createChess(fen)
    try { next.move(m.san) } catch { return true }
    return !seen.has(positionOf(next.fen()))
  })
}

/**
 * The legal moves that don't take a piece back to a square it stood on in its last few moves. A position
 * can be new (the other side moved something else) while PigeonAI just walks one rook a8-b8-a8-b8: this is
 * what stops that. When the history can't be replayed: all of them.
 */
export function movesNotShuffling<M extends { san: string; from: string; to: string }>(fen: string, history: string[], legal: M[], back = 3): M[] {
  const played: { from: string; to: string }[] = []
  try {
    const replay = createChess()
    for (const m of history) {
      const done = replay.move(m) as { from: string; to: string } | null
      if (!done) return legal
      played.push({ from: done.from, to: done.to })
    }
  } catch { return legal }
  // This side's own moves, newest first (the side to move made every other move, the last of them two plies ago).
  const own = played.filter((_, i) => (played.length - 1 - i) % 2 === 1).reverse()
  return legal.filter((m) => {
    // Where the piece now on m.from was before its last `back` moves.
    const stood = new Set<string>()
    let square = m.from
    let moves = 0
    for (const p of own) {
      if (moves >= back) break
      if (p.to !== square) continue
      stood.add(p.from)
      square = p.from
      moves += 1
    }
    return !stood.has(m.to)
  })
}

