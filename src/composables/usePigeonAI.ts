/**
 * PigeonAI in PigeonChess: every page that joins PigeonChess is a PigeonAI peer.
 * It joins PigeonAI's mesh for chess (on the same relays as the game), holds its
 * share of the model (the 1-bit Bonsai, by default) on its GPU when it has one,
 * and the Computer can play as PigeonAI: a move is asked of the whole mesh.
 *
 * PigeonAI is an optional dependency (a private repository): a build without it
 * offers no PigeonAI (PIGEONAI_HERE false; see vite.config.ts).
 */
import { ref } from 'vue'
import { createChess } from '@/utils/variant'

declare const __PIGEONAI__: boolean
/** Whether this build has PigeonAI in it. */
export const PIGEONAI_HERE = __PIGEONAI__

type PigeonAI = Awaited<ReturnType<typeof import('pigeonai')['startPigeonAI']>>
type Signaling = { signalingServer?: string; signalingServers?: string[]; automaticSignalingServer?: boolean }

/** What PigeonAI is doing here, in words (for the Computer panel). */
const status = ref('')
/** Whether a move can be asked now (every stage of the model held and loaded, somewhere). */
const ready = ref(false)
let ai: PigeonAI | null = null
let starting: Promise<void> | null = null

const describe = (a: PigeonAI): string => {
  if (a.ready()) return 'Ready: the model is held by the peers here.'
  let done = 0, total = 0, servers = 0
  for (const p of a.loading.values()) { done += p.done; total += p.total; servers += p.servers ?? 0 }
  if (total > 0) return `Loading this device's share of the model: ${Math.round((100 * done) / total)}%${servers > done / 2 ? ' (from the storage servers)' : ''}.`
  return a.gpu ? 'Waiting for the model to be shared out between the peers…' : 'Waiting for peers with a GPU to hold the model (this device has none).'
}

/** Join PigeonAI's mesh for chess (once): on the game's own relays, in the game's network. */
export function startPigeonAIPeer(signaling: Signaling, room: string): void {
  if (!PIGEONAI_HERE || starting) return
  status.value = 'Starting…'
  starting = (async () => {
    try {
      const { startPigeonAI } = await import('pigeonai')
      ai = await startPigeonAI({
        signaling,
        network: 'pigeonchess-ai',
        room,
        // No draft model: a move is a few tokens, not worth a second download.
        draftModel: null,
        onStatus: (text) => { status.value = text },
      })
      ;(globalThis as Record<string, unknown>).__pigeonai = ai
      const tick = () => { if (ai) { ready.value = ai.ready(); status.value = describe(ai) } }
      tick()
      setInterval(tick, 1000)
    } catch (error) {
      status.value = `PigeonAI could not start here: ${(error as Error).message}`
      starting = null
    }
  })()
}

/** The first legal move named in `text` (SAN, with or without + # ! ?, or from-to squares). */
export function moveIn(text: string, legal: { san: string; from: string; to: string; promotion?: string }[]): string | null {
  const plain = (san: string) => san.replace(/[+#?!]/g, '')
  let best: { at: number; len: number; san: string } | null = null
  for (const m of legal) {
    for (const form of [plain(m.san), `${m.from}${m.to}${m.promotion ?? ''}`, `${m.from}-${m.to}`]) {
      const re = new RegExp(`(^|[^A-Za-z0-9])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`)
      const hit = re.exec(text)
      if (!hit) continue
      const at = hit.index + hit[1].length
      if (!best || at < best.at || (at === best.at && form.length > best.len)) best = { at, len: form.length, san: m.san }
    }
  }
  return best?.san ?? null
}

/** PigeonAI's answer for a move: the move (SAN), or null and why there is none. */
export interface PigeonAIAnswer { move: string | null; why: string }

/**
 * PigeonAI's move in this position (SAN), asked of the mesh; null (with why) when
 * it is not ready in time, can't answer, or names no legal move (the Computer then
 * plays without it, and says so).
 */
export async function pigeonAIMove(fen: string, history: string[] = []): Promise<PigeonAIAnswer> {
  if (!ai) return { move: null, why: status.value.startsWith('PigeonAI could not start') ? 'could not start here' : 'is still starting' }
  const a = ai
  if (!(await a.whenReady(30_000))) return { move: null, why: 'is not ready (the model is not loaded on enough peers)' }
  const board = createChess(fen)
  const legal = board.moves({ verbose: true }) as { san: string; from: string; to: string; promotion?: string }[]
  if (!legal.length) return { move: null, why: 'had no move to make' }
  const side = board.turn() === 'w' ? 'White' : 'Black'
  // Short: every token of the prompt goes through the whole mesh before the first one of the answer.
  const prompt = [
    `FEN: ${fen}`,
    history.length ? `Last moves: ${history.slice(-6).join(' ')}` : '',
    `${side} to move. Legal: ${legal.map((m) => m.san).join(' ')}`,
    'Best move:',
  ].filter(Boolean).join('\n')
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 60_000)
  const once = () => a.ask(prompt, {
    system: 'You play chess. Answer with one legal move in SAN, nothing else.',
    // Qwen3 (Bonsai's family) thinks aloud unless its thinking is given, empty.
    prefill: '<think>\n\n</think>\n\n',
    count: 8,
    temperature: 0.3,
    draft: false,
    // The answer is one of the legal moves: the model picks among them, token by token.
    choices: legal.map((m) => m.san),
    signal: stop.signal,
  })
  try {
    let text: string
    try {
      text = (await once()).text
    } catch (error) {
      // Once more (a peer that just dropped out, a GPU that failed one read), unless the minute is up.
      if (stop.signal.aborted) throw error
      console.warn('PigeonAI failed once, asking again:', (error as Error).message)
      await new Promise((r) => setTimeout(r, 1000))
      text = (await once()).text
    }
    const move = moveIn(text, legal)
    return move ? { move, why: '' } : { move: null, why: `named no legal move ("${text.trim().slice(0, 30)}")` }
  } catch (error) {
    return { move: null, why: stop.signal.aborted ? 'took over a minute' : `failed (${(error as Error).message})` }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * PigeonAI's reply to a chat message during a game against it (a sentence or two), with the game
 * (position and last moves) and the chat so far as context. Throws when it can't answer.
 */
export async function pigeonAIChat(message: string, fen: string, moves: string[], chat: { mine: boolean; text: string }[]): Promise<string> {
  if (!ai) throw new Error(status.value.startsWith('PigeonAI could not start') ? 'PigeonAI could not start here' : 'PigeonAI is still starting')
  const a = ai
  if (!(await a.whenReady(30_000))) throw new Error('PigeonAI is not ready yet')
  const earlier = chat.slice(-8, -1).map((l) => `${l.mine ? 'Player' : 'You'}: ${l.text}`)
  const prompt = [
    `The game so far: ${moves.length ? moves.join(' ') : '(no moves yet)'}. Position (FEN): ${fen}.`,
    earlier.length ? `Earlier in the chat:\n${earlier.join('\n')}` : '',
    `The player says: ${message}`,
  ].filter(Boolean).join('\n')
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 90_000)
  try {
    const { text } = await a.ask(prompt, {
      system: 'You are PigeonAI, playing chess against the player on PigeonChess. You are a small language model run by the players\' own devices together. Chat in a friendly way, in one or two short sentences.',
      prefill: '<think>\n\n</think>\n\n',
      count: 80,
      temperature: 0.7,
      signal: stop.signal,
    })
    return text.trim() || '…'
  } finally {
    clearTimeout(timer)
  }
}

export function usePigeonAI() {
  return { here: PIGEONAI_HERE, status, ready }
}
