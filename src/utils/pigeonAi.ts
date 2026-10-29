import { PigeonChess, pickPigeonMove } from './pigeonChess'

export type PigeonAiMove = { from: string; to: string; promotion?: string }

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (move: PigeonAiMove | null) => void>()

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/pigeonAi.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ id: number; move: PigeonAiMove | null }>) => {
      const resolve = pending.get(event.data.id)
      pending.delete(event.data.id)
      resolve?.(event.data.move)
    }
    worker.onerror = (err) => {
      console.error('Pigeon AI worker failed:', err)
      pending.forEach((resolve) => resolve(null))
      pending.clear()
      worker?.terminate()
      worker = null
    }
  } catch (err) {
    console.warn('No worker for the pigeon AI; thinking on the page instead', err)
    worker = null
  }
  return worker
}

/** The pigeon computer's move for this position, searched in a background worker. */
export function pigeonSearch(fen: string, depth: number): Promise<PigeonAiMove | null> {
  const w = getWorker()
  if (!w) {
    const found = pickPigeonMove(new PigeonChess(fen), depth)
    return Promise.resolve(found ? { from: found.from, to: found.to, promotion: found.promotion } : null)
  }
  const id = ++nextId
  return new Promise((resolve) => {
    pending.set(id, resolve)
    w.postMessage({ id, fen, depth })
  })
}
