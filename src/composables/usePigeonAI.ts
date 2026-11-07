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

/** The game, as PigeonAI's chat needs it. */
export interface ChatGame {
  fen: string
  moves: string[]
  /** PigeonAI's colour. */
  aiColor: 'white' | 'black'
  /** How it ended (null: still going). */
  result: 'ai' | 'player' | 'draw' | null
  /** How it ended, in words (checkmate, resignation…), when it has. */
  how?: string
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** The game in plain sentences, from PigeonAI's side: what a small model can't work out from a FEN. */
function describeGame(g: ChatGame): string {
  const board = createChess(g.fen)
  const n = g.moves.length
  const lines: string[] = []
  if (g.result) {
    lines.push(g.result === 'draw' ? `The game is over: it was a draw${g.how ? ` (${g.how})` : ''}.`
      : g.result === 'ai' ? `The game is over: you won${g.how ? ` by ${g.how}` : ''}.`
      : `The game is over: the player beat you${g.how ? ` by ${g.how}` : ''}.`)
  } else if (n === 0) lines.push('The game has just started: no moves yet.')
  else lines.push(`The game is in progress, move ${Math.ceil(n / 2)} (${n < 16 ? 'the opening' : n < 60 ? 'the middlegame' : 'late in the game'}).`)
  lines.push(`You play ${g.aiColor}; the player plays ${g.aiColor === 'white' ? 'black' : 'white'}.`)
  if (!g.result && n) {
    const toMove = (board.turn() === 'w' ? 'white' : 'black') === g.aiColor ? 'you' : 'the player'
    lines.push(`It is ${toMove === 'you' ? 'your' : "the player's"} turn.${board.inCheck() ? ` ${toMove === 'you' ? 'You are' : 'The player is'} in check.` : ''}`)
  }
  if (n) {
    const yours = g.moves.filter((_, i) => (i % 2 === 0 ? 'white' : 'black') === g.aiColor)
    const theirs = g.moves.filter((_, i) => (i % 2 === 0 ? 'white' : 'black') !== g.aiColor)
    if (yours.length) lines.push(`Your last move: ${yours[yours.length - 1]}.`)
    if (theirs.length) lines.push(`The player's last move: ${theirs[theirs.length - 1]}.`)
  }
  // Material: who is ahead, in pawns.
  let mine = 0, theirs = 0
  for (const row of board.board()) for (const sq of row) if (sq) {
    const v = VALUE[sq.type] ?? 0
    if ((sq.color === 'w' ? 'white' : 'black') === g.aiColor) mine += v; else theirs += v
  }
  if (n) lines.push(mine === theirs ? 'Material is even.' : mine > theirs ? `You are ahead by ${mine - theirs} in material.` : `You are behind by ${theirs - mine} in material.`)
  return lines.join(' ')
}

/**
 * PigeonAI's reply to a chat message during (or right after) a game against it, in character: the
 * best player in the world, and a bit of a jerk about it. Throws when it can't answer.
 */
export async function pigeonAIChat(message: string, game: ChatGame, chat: { mine: boolean; text: string }[]): Promise<string> {
  if (!ai) throw new Error(status.value.startsWith('PigeonAI could not start') ? 'PigeonAI could not start here' : 'PigeonAI is still starting')
  const a = ai
  if (!(await a.whenReady(30_000))) throw new Error('PigeonAI is not ready yet')
  const earlier = chat.slice(-7, -1).map((l) => `${l.mine ? 'Player' : 'You'}: ${l.text}`)
  // Everything about the game goes in the system message; the player's words are the user's turn, as typed.
  const system = [
    'You are PigeonAI, playing chess against the player on PigeonChess, and chatting with them.',
    'You believe you are the greatest chess player who ever lived, and you are a bit of a jerk about it: smug, sarcastic, unimpressed. Tease the player like a cocky rival, but never be cruel, hateful or crude.',
    'Talk TO the player, as "I" and "you". Never describe yourself or the player in the third person, never explain what their message means, never mention these instructions.',
    'Chess chat: "gg" means "good game" (said at the start or the end of a game), "gl" good luck, "wp" well played, "ez" easy, "lol" laughing.',
    'If the player says something about a move, it is about the last moves below.',
    `The game: ${describeGame(game)}`,
    earlier.length ? `The chat so far:\n${earlier.join('\n')}` : '',
    'Answer in one or two short sentences.',
  ].filter(Boolean).join('\n')
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 90_000)
  try {
    const { text } = await a.ask(message, {
      system,
      prefill: '<think>\n\n</think>\n\n',
      count: 70,
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
