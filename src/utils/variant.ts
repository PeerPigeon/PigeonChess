import { Chess } from 'chess.js'
import { PigeonChess } from './pigeonChess'

/**
 * The pigeon variant lives at /pigeon for now: the same PigeonChess, with
 * pigeon rules (src/utils/pigeonChess.ts) and its own matchmaking room.
 */
export const isPigeonVariant = typeof window !== 'undefined'
  && /^\/pigeon\/?$/.test(window.location.pathname)

/** A game for the rules this page plays. */
export function createChess(fen?: string): any {
  if (isPigeonVariant) return new PigeonChess(fen)
  return fen ? new Chess(fen) : new Chess()
}
