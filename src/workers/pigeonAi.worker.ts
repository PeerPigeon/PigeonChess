/// <reference lib="webworker" />
import { PigeonChess, pickPigeonMove } from '@/utils/pigeonChess'

/**
 * The pigeon computer opponent thinks here, off the page, so the tab never
 * locks up while it searches.
 */
self.onmessage = (event: MessageEvent<{ id: number; fen: string; depth: number }>) => {
  const { id, fen, depth } = event.data
  let move: { from: string; to: string; promotion?: string } | null = null
  try {
    const found = pickPigeonMove(new PigeonChess(fen), depth)
    if (found) move = { from: found.from, to: found.to, promotion: found.promotion }
  } catch (err) {
    console.error('Pigeon search failed:', err)
  }
  self.postMessage({ id, move })
}
