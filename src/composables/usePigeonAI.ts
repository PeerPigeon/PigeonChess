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

/**
 * PigeonAI's move in this position (SAN), asked of the mesh; null when it is not
 * ready in time, can't answer, or names no legal move (the Computer then plays
 * without it).
 */
export async function pigeonAIMove(fen: string, history: string[] = []): Promise<string | null> {
  if (!ai) return null
  const a = ai
  if (!(await a.whenReady(30_000))) return null
  const board = createChess(fen)
  const legal = board.moves({ verbose: true }) as { san: string; from: string; to: string; promotion?: string }[]
  if (!legal.length) return null
  const side = board.turn() === 'w' ? 'White' : 'Black'
  const recent = history.slice(-12)
  const prompt = [
    `You are playing chess as ${side}.`,
    `Position (FEN): ${fen}`,
    recent.length ? `The last moves were: ${recent.join(' ')}` : 'The game has just started.',
    `Your legal moves: ${legal.map((m) => m.san).join(', ')}`,
    'Reply with your move only: one move from that list, in standard algebraic notation.',
  ].join('\n')
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 60_000)
  try {
    const { text } = await a.ask(prompt, {
      system: 'You are a strong chess player. You answer with a single move and nothing else.',
      // Qwen3 (Bonsai's family) thinks aloud unless its thinking is given, empty.
      prefill: '<think>\n\n</think>\n\n',
      count: 12,
      temperature: 0.3,
      draft: false,
      signal: stop.signal,
    })
    return moveIn(text, legal)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function usePigeonAI() {
  return { here: PIGEONAI_HERE, status, ready }
}
