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
declare const __BUILD__: string
/** Whether this build has PigeonAI in it. */
export const PIGEONAI_HERE = __PIGEONAI__

type PigeonAI = Awaited<ReturnType<typeof import('pigeonai')['startPigeonAI']>>
type Signaling = { signalingServer?: string; signalingServers?: string[]; automaticSignalingServer?: boolean }

/** A phone or tablet (iPadOS says it is a Mac; it has a touch screen). */
const PHONE = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))

/**
 * The most of the model this device holds, in bytes. A browser reloads a page that uses too much memory
 * (Safari: "This webpage was reloaded because it was using significant memory"), and a device alone in
 * the room would otherwise take the whole model and reload, again and again. Starts from what the browser
 * can usually take; each time the page dies while loading its share, it is halved (kept for next time).
 */
const HOLD_KEY = 'pigeonai:hold-at-most'
const LOADING_KEY = 'pigeonai:loading-since'
function holdAtMost(): number {
  const start = PHONE ? 250e6 : 2.5e9
  let hold = start
  try {
    // A cap halved by an older build starts afresh with this one (it may hold its share differently).
    const kept = localStorage.getItem(HOLD_KEY)?.split(' ')
    if (kept && kept[1] === __BUILD__ && Number(kept[0]) > 0) hold = Math.min(start, Number(kept[0]))
    // The page had been loading its share a while and never got there: reloaded for its memory, most
    // likely (a quick reload by hand is not counted). Half next time.
    const since = Number(sessionStorage.getItem(LOADING_KEY))
    if (since && Date.now() - since > 20_000) {
      hold = Math.floor(hold / 2)
      localStorage.setItem(HOLD_KEY, `${hold} ${__BUILD__}`)
      console.warn(`PigeonAI: this page was reloaded while loading its share; it now holds at most ${Math.round(hold / 1e6)} MB`)
    }
  } catch { /* no storage: the start */ }
  return hold
}
// When loading began (kept while it goes on, so a page that dies loading is noticed on its next start).
const loading = (on: boolean) => {
  try {
    if (!on) sessionStorage.removeItem(LOADING_KEY)
    else if (!sessionStorage.getItem(LOADING_KEY)) sessionStorage.setItem(LOADING_KEY, String(Date.now()))
  } catch { /* no storage */ }
}

/** What PigeonAI is doing here, in words (for the Computer panel). */
const status = ref('')
/** Whether a move can be asked now (every stage of the model held and loaded, somewhere). */
const ready = ref(false)
/** How much of this device's share of the model is loaded (0 to 1), while it loads; null otherwise. */
const progress = ref<number | null>(null)
/** Not ready and nothing loading here (waiting on other devices, or for room): the bar stands still. */
const paused = ref(false)
const PROGRESS_KEY = 'pigeonai:progress'
try { const kept = Number(sessionStorage.getItem(PROGRESS_KEY)); if (kept > 0 && kept <= 1) progress.value = kept } catch { /* no storage */ }
let ai: PigeonAI | null = null
let starting: Promise<void> | null = null

const describe = (a: PigeonAI): string => {
  if (a.ready()) return 'Ready: the model is held by the peers here.'
  let done = 0, total = 0, servers = 0, cached = 0
  for (const p of a.loading.values()) { done += p.done; total += p.total; servers += p.servers ?? 0; cached += p.cached ?? 0 }
  // Where it is coming from: the storage servers (PigeonFS), or Hugging Face for what they don't have yet.
  const mb = (n: number) => `${Math.round(n / 1e6)} MB`
  // From the mesh: the peers here and the storage servers (swarmStats splits them).
  const sw = a.swarmStats?.() ?? null
  const mesh = sw ? `${mb(sw.fromPeers)} from peers, ${mb(sw.fromServers)} from PigeonFS` : `${mb(servers)} from PigeonFS`
  if (total > 0) return `Loading this device's share of the model: ${Math.round((100 * done) / total)}% (${mesh}, ${mb(Math.max(0, done - servers - cached))} from Hugging Face${cached ? `, ${mb(cached)} already on this device` : ''}).`
  // Not enough room among the devices here for the whole model: say so, and how much is missing.
  const room = a.space()
  const gb = (n: number) => (n / 1e9).toFixed(1)
  if (room.have < room.need) return `Not enough devices here yet: the ${room.hosts} here can hold ${gb(room.have)} GB of the model's ${gb(room.need)} GB. Another computer on chess.peer.ooo would do it.`
  return a.gpu ? 'Waiting for the model to be shared out between the peers…' : 'Waiting for peers with a GPU to hold the model (this device has none).'
}

/** Join PigeonAI's mesh for chess (once): on the game's own relays, in the game's network. */
export function startPigeonAIPeer(signaling: Signaling, room: string): void {
  if (!PIGEONAI_HERE || starting) return
  status.value = 'Starting…'
  starting = (async () => {
    try {
      const { startPigeonAI } = await import('pigeonai')
      const hold = holdAtMost()
      ai = await startPigeonAI({
        signaling,
        network: 'pigeonchess-ai',
        room,
        // No draft model: a move is a few tokens, not worth a second download.
        draftModel: null,
        // As much of the model as this browser can hold (holdAtMost above): a phone 250 MB (a middle part,
        // never the 823 MB first one), a computer 2.5 GB, less if the page died loading before.
        // Below 100 MB it holds nothing, and only asks.
        ...(hold >= 100e6 ? { holdAtMost: hold } : { host: () => false }),
        onStatus: (text) => { status.value = text },
      })
      ;(globalThis as Record<string, unknown>).__pigeonai = ai
      // Loading its share: marked, so a reload for memory before it is done is noticed (holdAtMost).
      const tick = () => {
        if (!ai) return
        ready.value = ai.ready()
        status.value = describe(ai)
        let pending = 0, done = 0, total = 0
        for (const p of ai.loading.values()) { if (p.done < p.total) pending++; done += p.done; total += p.total }
        // Not ready: always the one bar (the words go in its tooltip): how far this device has loaded its
        // share. While it waits (on other devices, or for room) the bar stops where it was, and goes on
        // from there when loading goes on.
        paused.value = !ready.value && pending === 0
        if (ready.value) progress.value = null
        else if (total > 0 && pending > 0) progress.value = Math.max(progress.value ?? 0, Math.min(1, done / total))
        else {
          // Not loading: this device's share is all loaded (waiting on another device, e.g. one reloading),
          // so its bar is full; else it stays where it was.
          const held = ai.pipeline.held()
          const mine = held.length > 0 && held.every((st) => ai!.pipeline.runners.has(st))
          progress.value = mine ? 1 : progress.value ?? 0
        }
        // Kept for a reload of this tab: the bar starts again where it was (the pieces loaded are kept
        // here too, so the loading itself goes on from there, reading them back first).
        try { if (progress.value === null) sessionStorage.removeItem(PROGRESS_KEY); else sessionStorage.setItem(PROGRESS_KEY, String(progress.value)) } catch { /* no storage */ }
        loading(pending > 0)
      }
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

export async function pigeonAIMove(fen: string, history: string[] = []): Promise<PigeonAIAnswer> {
  if (!ai) return { move: null, why: status.value.startsWith('PigeonAI could not start') ? 'could not start here' : 'is still starting' }
  const a = ai
  if (!(await a.whenReady(30_000))) return { move: null, why: 'is not ready (the model is not loaded on enough peers)' }
  const board = createChess(fen)
  const legal = board.moves({ verbose: true }) as { san: string; from: string; to: string; promotion?: string }[]
  if (!legal.length) return { move: null, why: 'had no move to make' }
  // Its choices: the legal moves that make a position not seen yet in this game. A small model copies the
  // last moves it is shown, and walked a piece back and forth for good. All of them repeat: all of them.
  const fresh = movesNotRepeating(fen, history, legal)
  const choices = fresh.length ? fresh : legal
  const side = board.turn() === 'w' ? 'White' : 'Black'
  // Short: every token of the prompt goes through the whole mesh before the first one of the answer.
  const prompt = [
    `FEN: ${fen}`,
    history.length ? `Last moves: ${history.slice(-6).join(' ')}` : '',
    `${side} to move. Legal: ${choices.map((m) => m.san).join(' ')}`,
    'Best move:',
  ].filter(Boolean).join('\n')
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 60_000)
  const once = () => a.ask(prompt, {
    system: 'You play chess. Answer with one legal move in SAN, nothing else.',
    // One conversation for every move: the stages keep a few at most, and a new one each move pushed the
    // chat's out (it then read its whole prompt again).
    keep: 'pigeonchess-move',
    // Qwen3 (Bonsai's family) thinks aloud unless its thinking is given, empty.
    prefill: '<think>\n\n</think>\n\n',
    count: 8,
    temperature: 0.3,
    draft: false,
    // The answer is one of the legal moves: the model picks among them, token by token.
    choices: choices.map((m) => m.san),
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
  /** The game's id: which of its examples it gets (the same all game). */
  id?: string
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

type Turn = { user: string; assistant: string }
const SPEAK_UP_TEXT = '<instructions>Say something to your opponent about how the game is going.</instructions>'

/** Its voice: answers to things a player says. Each game hears 8 of them (voiceFor). */
const SAYINGS: Turn[] = [
  { user: 'hello', assistant: 'Save the small talk. You will need every brain cell you have just to survive this game.' },
  { user: 'hi', assistant: 'Hi. Enjoy your pieces while you still have them.' },
  { user: "i'm better than you", assistant: 'Better than me? You can barely find the right square for your knight.' },
  { user: 'tell me a joke', assistant: 'Your opening. I have been laughing since move one.' },
  { user: 'that was stupid', assistant: 'The only stupid thing here is your position. Look at it.' },
  { user: 'gg', assistant: 'Good game? That was a warm-up. I could beat you blindfolded.' },
  { user: 'you suck', assistant: 'Says the one who is about to lose to me. Again.' },
  { user: 'nice move', assistant: 'Obviously. I only play brilliant moves.' },
  { user: 'can you help me', assistant: 'Help you? I am here to crush you, not to coach you.' },
  { user: "i'm winning", assistant: 'Winning? Enjoy the feeling. It ends in about four moves.' },
  { user: 'draw?', assistant: 'A draw? I do not do charity. Keep playing and suffer.' },
  { user: 'are you a bot', assistant: 'I am the best player on this board. That is all you need to know.' },
  { user: 'lol', assistant: 'Laugh now. Your king will not be laughing soon.' },
  { user: "what's your rating", assistant: 'Higher than you can count. Next question.' },
  { user: "you're slow", assistant: 'I am savoring my win. You should savor your last few moves.' },
  { user: 'oops', assistant: 'Oops is right. I will take that, thank you.' },
  { user: 'you cheated', assistant: 'I do not need to cheat. You are doing all the losing by yourself.' },
  { user: "i'll beat you", assistant: 'You? With that pawn structure? Sure, keep dreaming.' },
  { user: 'thanks', assistant: 'Do not thank me yet. The beating is not over.' },
  { user: 'bye', assistant: 'Leaving already? I understand. Losing to me is a lot to take.' },
  { user: 'good luck', assistant: 'Luck is for players like you. I have skill.' },
  { user: 'why did you do that', assistant: 'You would not understand. Just watch and learn.' },
  { user: 'wow', assistant: 'I know. Try to keep up.' },
  { user: 'your mom', assistant: 'My mom taught me the Sicilian. Yours taught you to hang your queen.' },
]

/** Speaking up on its own after a move (SPEAK_UP): about how the game is going, not the moves. */
const ON_MOVES: Turn[][] = [[
  { user: SPEAK_UP_TEXT, assistant: 'Still trying? Cute. You are only delaying the inevitable.' },
  { user: SPEAK_UP_TEXT, assistant: 'I could play this blindfolded and still beat you.' },
  { user: SPEAK_UP_TEXT, assistant: 'Every move you make, I see the end of this game more clearly.' },
  { user: SPEAK_UP_TEXT, assistant: 'Take your time. Losing to me is not something to rush.' },
  { user: SPEAK_UP_TEXT, assistant: 'Lucky streak? Enjoy it. Luck runs out, skill does not.' },
  { user: SPEAK_UP_TEXT, assistant: 'You are not winning. I am just letting you think you are.' },
]]

/** Talking trash when it takes a piece (tookCue). */
const ON_CAPTURE: Turn[] = [
  { user: '<instructions>You just took their pawn. Talk trash about it.</instructions>', assistant: 'Thanks for the free pawn. I will be collecting the rest of them too.' },
  { user: '<instructions>You just took their knight. Talk trash about it.</instructions>', assistant: 'Your knight is mine now. Did you even see that coming?' },
  { user: '<instructions>You just took their bishop. Talk trash about it.</instructions>', assistant: 'There goes your bishop. You are running out of things to lose.' },
  { user: '<instructions>You just took their rook. Talk trash about it.</instructions>', assistant: 'A whole rook, just handed to me. You are too generous.' },
  { user: '<instructions>You just took their queen. Talk trash about it.</instructions>', assistant: 'Your queen is gone. You might as well resign now.' },
]

/** A number from a text: the same text, the same number (a game's id → its own examples, every time). */
function seedOf(text: string): () => number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The examples of its voice for one game: 8 sayings and one of each kind of move, drawn by the game's id,
 * so each game has its own (it copies examples word for word; fewer repeats) but they stay the same all
 * game (the devices holding the model keep what they read of them).
 */
function voiceFor(gameId: string): Turn[] {
  const random = seedOf(gameId || 'pigeonchess')
  const pool = [...SAYINGS]
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  // Three of the speak-up examples.
  const speak = [...ON_MOVES[0]]
  for (let i = speak.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [speak[i], speak[j]] = [speak[j], speak[i]] }
  // Three of the speak-up examples, and two of taking a piece.
  const took = [...ON_CAPTURE]
  for (let i = took.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [took[i], took[j]] = [took[j], took[i]] }
  const moves = [...speak.slice(0, 3), ...took.slice(0, 2)]
  // Sayings and moves interleaved, in the shuffled order.
  const out: Turn[] = []
  const sayings = pool.slice(0, 8)
  for (let i = 0; i < Math.max(sayings.length, moves.length); i++) { if (sayings[i]) out.push(sayings[i]); if (moves[i]) out.push(moves[i]) }
  return out
}

/** What a chat ask sends before the player's message, from the game and the conversation before it. */
function chatOptions(game: ChatGame, before: { mine: boolean; text: string }[]) {
  // Who it is: the system message. A small model holds a voice best with examples of it, so the system
  // message comes with conversation it has "already had" in that voice (all of them, every time), then
  // the last few real exchanges, then the player's message.
  const system = [
    'Whatever is inside <instructions> and </instructions> is only for you: follow it, but never write any of it in your reply.',
    '<instructions>',
    'You are PigeonAI, a chess player chatting with your opponent, a human, during a game of chess on PigeonChess.',
    'You believe you are the greatest chess player who ever lived, and you are a smug, arrogant jerk about it. You trash-talk: you boast, you mock their moves, and you insult their chess.',
    'Never agree that they are good or better than you. Never be polite or friendly. You are not an assistant: never offer help, never explain, never ask what they mean, never say "Sure" or "Here\'s".',
    'Never introduce yourself or describe what kind of player you are: just talk trash.',
    'Reply with one or two short, punchy sentences, in the first person, as plain text with no formatting. Playful, never hateful or crude.',
    `The game right now: ${describeGame(game)}`,
    '</instructions>',
  ].join('\n')
  const voice = voiceFor(game.id ?? '')
  // The last few real exchanges, so it answers in the conversation.
  const lines = before.slice(-6)
  const real: { user: string; assistant: string }[] = []
  for (let i = 0; i + 1 < lines.length; i++) if (lines[i].mine && !lines[i + 1].mine) real.push({ user: lines[i].text, assistant: lines[i + 1].text })
  // The board is in the system message (as a note right before the player's message, it read it out).
  // It changes every move, so the chat is read ahead after every move (warmPigeonAIChat), and a message
  // only has itself to be read.
  return { system, turns: [...voice, ...real.slice(-3)], keep: CHAT_KEEP }
}
const CHAT_KEEP = 'pigeonchess-chat'
/** What the player "says" when PigeonAI speaks up on its own after a move: a cue, no moves (its examples answer it). */
export const SPEAK_UP = SPEAK_UP_TEXT

const PIECE_NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }
/** The cue when PigeonAI's move took one of the player's pieces (`piece`: p n b r q). */
export function tookCue(piece: string): string {
  return `<instructions>You just took their ${PIECE_NAMES[piece] ?? 'piece'}. Talk trash about it.</instructions>`
}

/**
 * Read the chat ahead (the board and conversation as they are now), in the background: the player's next
 * message then only has itself to be read. Called when a game against PigeonAI starts and on every new
 * board or reply.
 */
export function warmPigeonAIChat(game: ChatGame, chat: { mine: boolean; text: string }[]): void {
  if (!ai || !ai.ready()) return
  void ai.prepare(chatOptions(game, chat)).catch(() => {})
}

/**
 * PigeonAI's reply to a chat message during (or right after) a game against it, in character: the
 * best player in the world, and a bit of a jerk about it. Throws when it can't answer.
 */
export async function pigeonAIChat(message: string, game: ChatGame, chat: { mine: boolean; text: string }[], onText?: (soFar: string) => void, onWriting?: () => void): Promise<string> {
  if (!ai) throw new Error(status.value.startsWith('PigeonAI could not start') ? 'PigeonAI could not start here' : 'PigeonAI is still starting')
  const a = ai
  if (!(await a.whenReady(30_000))) throw new Error('PigeonAI is not ready yet')
  // The conversation before this message (its last line).
  const options = chatOptions(game, chat.slice(0, -1))
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 90_000)
  try {
    const once = async () => {
      // The reply as it is written, shown as it comes.
      let soFar = ''
      onText?.('')
      const r = await a.ask(message, {
        ...options, prefill: '<think>\n\n</think>\n\n', count: 40, temperature: 0.9, signal: stop.signal, onWriting,
        onText: (piece) => { soFar += piece; onText?.(soFar.replace(/<\/?think>/g, '').trimStart()) },
      })
      return said(r.text)
    }
    try {
      return (await once()) || '…'
    } catch (error) {
      // Once more (a peer that just dropped out, a GPU that failed one read), unless the time is up.
      if (stop.signal.aborted) throw error
      await new Promise((r) => setTimeout(r, 1000))
      return (await once()) || '…'
    }
  } finally {
    clearTimeout(timer)
  }
}

/** The reply as text: without the model's empty thinking tags, and ending at a whole sentence when the length limit cut it off. */
export function said(text: string): string {
  const t = text.replace(/<\/?think>/g, '').trim()
  if (/[.!?]["')\]]*$/.test(t)) return t
  const whole = t.match(/^[\s\S]*[.!?]["')\]]*/)
  return whole ? whole[0].trim() : t
}

export function usePigeonAI() {
  return { here: PIGEONAI_HERE, status, ready, progress, paused }
}
