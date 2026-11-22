/**
 * PigeonAI in PigeonChess. A page joins PigeonAI's mesh for chess (on the same relays as the game)
 * only once its player has chosen how: lend a share of this device (it then holds part of the model on
 * its GPU, and earns PigeonSeed for the work it does for others, once that is live), or pay to play
 * (PigeonSeed, coming soon). Nothing is loaded on anyone's device before that. The Computer can then play
 * as PigeonAI: a move is asked of the whole mesh. The model is the one the network runs (set on the
 * PigeonAI server's page); when it changes, PigeonAI starts again on it.
 *
 * Or Local AI: a model on this device alone (a GGUF from the player's drive, from Hugging Face, or from
 * the mesh), kept in this browser only; offered to other peers from here if the player wants, and kept
 * on PigeonFS too only if they also tick that (which will cost PigeonSeed).
 *
 * PigeonAI is an optional dependency (a private repository): a build without it
 * offers no PigeonAI (PIGEONAI_HERE false; see vite.config.ts).
 */
import { ref } from 'vue'
import { createChess } from '@/utils/variant'
import { movesNotRepeating, movesNotShuffling } from '@/utils/aiMoves'
export { movesNotRepeating, movesNotShuffling }

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
/** What runs here: PigeonAI's mesh, Local AI (a model on this device alone), or nothing yet. */
const mode = ref<'mesh' | 'local' | null>(null)
/** Whether players on this PigeonAI network must lend a share to play (its record's rule, else its default). */
const shareRule = ref<'required' | 'optional' | 'off'>('required')
/** What this device has done for others, kept across visits: stage passes run, and bytes of models sent. */
const EARNED_KEY = 'pigeonai:earned'
const earned = ref<{ passes: number; bytes: number }>((() => {
  try { const e = JSON.parse(localStorage.getItem(EARNED_KEY) || 'null'); if (e && e.passes >= 0 && e.bytes >= 0) return e } catch { /* none yet */ }
  return { passes: 0, bytes: 0 }
})())
let earnedSeen = { passes: 0, bytes: 0 }
const noteEarned = (a: PigeonAI) => {
  const now = a.earned?.() ?? { passes: 0, bytes: 0 }
  const dp = Math.max(0, now.passes - earnedSeen.passes), db = Math.max(0, now.bytes - earnedSeen.bytes)
  earnedSeen = now
  if (!dp && !db) return
  earned.value = { passes: earned.value.passes + dp, bytes: earned.value.bytes + db }
  try { localStorage.setItem(EARNED_KEY, JSON.stringify(earned.value)) } catch { /* not kept */ }
}
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
/** The model, in words ("the 1-bit Bonsai"), once known; null before. */
const modelName = ref<string | null>(null)

/** A model's name for players. */
function nameOf(a: PigeonAI): string {
  const repo = a.hf?.repo ?? ''
  if (/bonsai/i.test(repo)) return 'the 1-bit Bonsai'
  if (/lfm3/i.test(repo)) return "Liquid AI's LFM3"
  return repo.split('/').pop() || 'a language model'
}
/** What an answer starts with so the model doesn't think aloud first: Qwen3's (Bonsai) empty thinking; LFM3's PigeonAI writes itself. */
const quiet = (a: PigeonAI) => (a.hf?.raw?.model_type === 'qwen3' ? '<think>\n\n</think>\n\n' : '')

/**
 * How big a model's download is, in bytes (null: not known). A Hugging Face model named with its file
 * ("owner/repo/file.gguf"): the file's size, from Hugging Face's list of the repo's files.
 */
export async function modelDownloadSize(model: string): Promise<number | null> {
  const parts = model.split('/')
  if (parts.length < 3 || parts[0] === 'local') return null
  const repo = parts.slice(0, 2).join('/'), path = parts.slice(2).join('/')
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const files = (await r.json()) as { path: string; size?: number; lfs?: { size?: number } }[]
    const f = files.find((x) => x.path === path)
    return f ? f.lfs?.size ?? f.size ?? null : null
  } catch { return null }
}

/** Local AI's model is a file from the player's drive (its reads are from the file). */
const localFromFile = ref(false)

const describe = (a: PigeonAI): string => {
  if (a.ready()) return mode.value === 'local' ? 'Ready: the model is on this device.' : 'Ready: the model is held by the peers here.'
  let done = 0, total = 0, servers = 0, cached = 0
  for (const p of a.loading.values()) { done += p.done; total += p.total; servers += p.servers ?? 0; cached += p.cached ?? 0 }
  // Where it is coming from: the storage servers (PigeonFS), or Hugging Face for what they don't have yet.
  const mb = (n: number) => `${Math.round(n / 1e6)} MB`
  // From the mesh: the peers here and the storage servers (swarmStats splits them).
  const sw = a.swarmStats?.() ?? null
  const fromPeers = sw ? sw.fromPeers : 0, fromServers = sw ? sw.fromServers : servers
  if (total > 0) {
    // Where each part came from, as it really was: a file from the drive is "your file", not a download.
    const parts = [
      [cached, localFromFile.value && mode.value === 'local' ? 'from your file' : 'already on this device'],
      [fromPeers, 'from peers'],
      [fromServers, 'from PigeonFS'],
      [Math.max(0, done - servers - cached), 'from Hugging Face'],
    ].filter(([n]) => (n as number) > 0).map(([n, from]) => `${mb(n as number)} ${from}`)
    const what = mode.value === 'local' ? 'the model' : "this device's share of the model"
    return `Loading ${what}: ${Math.round((100 * done) / total)}%${parts.length ? ` (${parts.join(', ')})` : ''}.`
  }
  // Not enough room among the devices here for the whole model: say so, and how much is missing.
  const room = a.space()
  const gb = (n: number) => (n / 1e9).toFixed(1)
  if (room.have < room.need) return `Not enough devices here yet: the ${room.hosts} here can hold ${gb(room.have)} GB of the model's ${gb(room.need)} GB. Another computer on chess.peer.ooo would do it.`
  return a.gpu ? 'Waiting for the model to be shared out between the peers…' : 'Waiting for peers with a GPU to hold the model (this device has none).'
}

/** Join PigeonAI's mesh for chess (once): on the game's own relays, in the game's network. */
let ticker: ReturnType<typeof setInterval> | null = null

/**
 * This device's PigeonAI choices (Settings → PigeonAI). `share`: how its player takes part on this
 * network and room: 'lend' a share of this device, or 'pay' to play; none: not yet chosen, and PigeonAI
 * doesn't start. `shareRule`: on a network of their own, whether its players must lend a share.
 */
export interface PigeonAIPrefs { model?: string; serveWhole?: boolean; room?: string; share?: 'lend' | 'pay'; shareRule?: 'required' | 'optional' | 'off'; deviceOnly?: boolean }

/** Local AI's choices: where its model comes from, and whether it is offered to others. */
export interface LocalAIPrefs {
  source: 'file' | 'hf' | 'mesh'
  /** The model (a Hugging Face or mesh name; a file's local name, from localModelRef). */
  model?: string
  /** A file's name, as chosen. */
  name?: string
  /** Send it to peers that ask, from this device (free; earns PigeonSeed once live). */
  offer?: boolean
  /** Keep it on PigeonFS too (costs PigeonSeed once live). */
  keepOnPigeonFS?: boolean
}

/**
 * PigeonAI's network for a chess network: global plays on pigeonchess-ai, whose model its server sets
 * (no page picks another there); any other chess network has a PigeonAI network of its own, whose model
 * the players pick.
 */
export function pigeonAINetwork(chessNetwork: string, roomName = 'global'): { network: string; room: string; own: boolean } {
  const clean = (x: string) => (x || '').trim().replace(/[^\w.@-]/g, '-').slice(0, 60)
  const name = clean(chessNetwork) || 'global', room = clean(roomName) || 'global'
  if (name === 'global') return { network: 'pigeonchess-ai', room, own: false }
  // "test" and "chess-test" both: chess-test (the name the PigeonAI server's page is given).
  return { network: name.startsWith('chess-') ? name : `chess-${name}`, room, own: true }
}
/** The PigeonAI network this page is on now. */
const networkName = ref('pigeonchess-ai')
const ownNetwork = ref(false)

let lastStart: { signaling: Signaling; chessNetwork: string; prefs: PigeonAIPrefs } | null = null
/** Whatever runs here, stopped (PigeonAI's mesh or Local AI). */
async function stopRunning(): Promise<void> {
  const old = ai
  ai = null
  ready.value = false
  modelName.value = null
  progress.value = null
  if (ticker) { clearInterval(ticker); ticker = null }
  await (starting ?? Promise.resolve()).catch(() => {})
  starting = null
  await (old?.close() ?? Promise.resolve()).catch(() => {})
}
/** Start again with new choices (a new network, model, way of taking part); none chosen: stopped. */
export function restartPigeonAIPeer(chessNetwork: string, prefs: PigeonAIPrefs): void {
  if (!PIGEONAI_HERE || !lastStart) return
  const signaling = lastStart.signaling
  if (mode.value === 'local') { lastStart = { signaling, chessNetwork, prefs }; return }
  status.value = 'Starting again…'
  void stopRunning().then(() => startPigeonAIPeer(signaling, chessNetwork, prefs))
}

export function startPigeonAIPeer(signaling: Signaling, chessNetwork: string, prefs: PigeonAIPrefs = {}): void {
  if (!PIGEONAI_HERE || starting) return
  lastStart = { signaling, chessNetwork, prefs }
  const { network, room, own } = pigeonAINetwork(chessNetwork, prefs.room)
  networkName.value = network
  ownNetwork.value = own
  shareRule.value = own ? prefs.shareRule ?? 'optional' : 'required'
  // Nothing runs on this device until its player has chosen how to take part (the Computer panel asks).
  if (!prefs.share) { mode.value = null; status.value = ''; return }
  // Only what's on this device: PigeonAI downloads its share of the model and sends parts to others.
  if (prefs.deviceOnly) {
    mode.value = null
    status.value = "PigeonAI is off: it downloads part of the model and shares it, and Settings → PigeonAI says to use only what's on this device. Local AI still plays, from a model on this device."
    return
  }
  mode.value = 'mesh'
  // On a network of its own: the model picked here (and, set, it becomes the network's), kept whole and
  // served if asked. Elsewhere: the network's.
  const picked = own && prefs.model?.trim() ? prefs.model.trim() : null
  status.value = 'Starting…'
  starting = (async () => {
    try {
      const { startPigeonAI } = await import('pigeonai')
      const hold = holdAtMost()
      // Lending a share: it holds part of the model (as much as this browser can take). Paying: it holds none.
      const holding = prefs.share === 'lend' && hold >= 100e6
      ai = await startPigeonAI({
        signaling,
        network,
        room,
        // The model picked here, which then becomes the network's; else the one the network runs (its
        // server, or another player, sets it); on a change, start again on the new one.
        model: picked ?? 'network',
        ...(picked ? { setModel: true as const, ...(prefs.shareRule ? { share: prefs.shareRule } : {}) } : {}),
        // What it reads from Hugging Face stays here: keeping the model on PigeonFS is the server's (or a paid choice).
        keepOnServers: false,
        ...(own && prefs.serveWhole ? { serveWholeModel: true } : {}),
        onModelChange: () => {
          status.value = 'Switching to the new model…'
          const before = starting
          starting = null
          void before?.then(() => stopRunning()).then(() => { progress.value = 0; startPigeonAIPeer(signaling, chessNetwork, prefs) })
        },
        // No draft model: a move is a few tokens, not worth a second download.
        draftModel: null,
        // As much of the model as this browser can hold (holdAtMost above): a phone 250 MB (a middle part,
        // never the 823 MB first one), a computer 2.5 GB, less if the page died loading before.
        // Below 100 MB it holds nothing, and only asks.
        ...(holding ? { holdAtMost: hold } : { host: () => false }),
        // Following the network, it may start on a model it then drops: not named until it is the one.
        onStatus: (text) => { status.value = picked ? text : text.replace(/^Reading \S+…/, 'Reading the model…') },
      })
      ;(globalThis as Record<string, unknown>).__pigeonai = ai
      modelName.value = nameOf(ai)
      earnedSeen = { passes: 0, bytes: 0 }
      watchProgress()
    } catch (error) {
      status.value = `PigeonAI could not start here: ${(error as Error).message}`
      starting = null
    }
  })()
}

/** Keeps ready, the bar and its words up to date (each second), and what this device earns. */
function watchProgress(): void {
  // Loading its share: marked, so a reload for memory before it is done is noticed (holdAtMost).
  const tick = () => {
    if (!ai) return
    ready.value = ai.ready()
    shareRule.value = ai.shareRule?.() ?? shareRule.value
    noteEarned(ai)
    let pending = 0
    for (const p of ai.loading.values()) if (p.done < p.total) pending++
    // The bar: how much of the whole model is loaded and ready on the devices here (this one and the
    // others), a part loading here counted as far as it has got. It only goes forward.
    const parts = ai.pipeline.stages
    const built = new Set<number>(ai.pipeline.runners.keys())
    for (const id of ai.members.ids()) for (const k of Object.keys((ai.members.advertOf(id)?.sv as Record<string, number> | undefined) ?? {})) built.add(Number(k))
    let have = built.size
    for (const [s, p] of ai.loading) if (!built.has(s) && p.total > 0) have += Math.min(1, p.done / p.total)
    const whole = parts > 0 ? Math.min(1, have / parts) : 0
    paused.value = !ready.value && pending === 0 && whole < 1
    if (ready.value) progress.value = null
    else progress.value = Math.max(progress.value ?? 0, whole)
    // And in words, what it is waiting on.
    status.value = ready.value || pending > 0 ? describe(ai)
      : built.size < parts ? `The model is loading on the devices here: ${built.size} of ${parts} parts ready.`
      : !ai.settled() ? "Checking which model this network runs…"
      : 'Linking to the devices that hold the model…'
    // Kept for a reload of this tab: the bar starts again where it was (the pieces loaded are kept
    // here too, so the loading itself goes on from there, reading them back first).
    try { if (progress.value === null) sessionStorage.removeItem(PROGRESS_KEY); else sessionStorage.setItem(PROGRESS_KEY, String(progress.value)) } catch { /* no storage */ }
    loading(pending > 0)
  }
  tick()
  if (ticker) clearInterval(ticker)
  ticker = setInterval(tick, 1000)
}

/** The relays PigeonAI uses (the game's), known before anything starts. */
export function setPigeonAISignaling(signaling: Signaling, chessNetwork: string, prefs: PigeonAIPrefs): void {
  if (!lastStart) lastStart = { signaling, chessNetwork, prefs }
}

/** A stable id for this device's own Local AI room (nobody else joins it). */
const ownRoom = () => {
  const KEY = 'pigeonai:local-room'
  try {
    let id = localStorage.getItem(KEY)
    if (!id) { id = `me-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')}`; localStorage.setItem(KEY, id) }
    return id
  } catch { return `me-${Math.random().toString(16).slice(2)}` }
}

/** A GGUF file's name for Local AI (by its size and first megabyte), as PigeonAI reads it from the file. */
export async function localModelName(file: File): Promise<string> {
  const { localModelRef } = await import('pigeonai')
  return localModelRef(file)
}

/**
 * Local AI: the model on this device alone (PigeonAI's mesh, if it ran, stops: one model at a time
 * on the GPU). In a room of its own, unless it is offered: then in the room where peers find offered
 * models, still answering its own moves itself. Read from the file when there is one; kept in this browser.
 */
export function startLocalAI(local: LocalAIPrefs, file?: File, deviceOnly = false): void {
  if (!PIGEONAI_HERE || !lastStart || !local.model) return
  const signaling = lastStart.signaling
  mode.value = 'local'
  localFromFile.value = !!file
  status.value = 'Starting Local AI…'
  void stopRunning().then(() => {
    starting = (async () => {
      try {
        const { startPigeonAI } = await import('pigeonai')
        ai = await startPigeonAI({
          signaling,
          network: 'local-ai',
          room: local.offer ? 'offers' : ownRoom(),
          model: local.model!,
          ...(file ? { localFile: file } : {}),
          // All of it here: kept whole, held whole (no cap but the browser's), ahead of anyone else.
          server: true,
          serveWholeModel: true,
          serveChunks: local.offer === true,
          keepOnServers: local.keepOnPigeonFS === true,
          // From the mesh: read from peers and PigeonFS when they have it; a file or Hugging Face: so too, then the source.
          shareWeights: true,
          // Only what's on this device: nothing over the network (a hotspot, a metered connection).
          ...(deviceOnly ? { downloads: false, serveChunks: false, keepOnServers: false } : {}),
          draftModel: null,
          onStatus: (text) => { status.value = text },
        })
        ;(globalThis as Record<string, unknown>).__pigeonai = ai
        modelName.value = nameOf(ai)
        earnedSeen = { passes: 0, bytes: 0 }
        watchProgress()
      } catch (error) {
        const why = (error as Error).message
        status.value = /downloads are off/.test(why)
          ? "This model isn't on this device, and Settings → PigeonAI says to use only what's on it: choose a GGUF from your drive, or a model loaded here before."
          : `Local AI could not start: ${why}`
        starting = null
      }
    })()
  })
}

/** Back from Local AI to PigeonAI's mesh (if its player has chosen how to take part). */
export function stopLocalAI(): void {
  if (mode.value !== 'local' || !lastStart) return
  const { signaling, chessNetwork, prefs } = lastStart
  mode.value = null
  status.value = ''
  void stopRunning().then(() => startPigeonAIPeer(signaling, chessNetwork, prefs))
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
  // Its choices: the legal moves that make a position not seen yet in this game. A small model copies the
  // last moves it is shown, and walked a piece back and forth for good. All of them repeat: all of them.
  const fresh = movesNotRepeating(fen, history, legal)
  const unshuffled = movesNotShuffling(fen, history, fresh.length ? fresh : legal)
  const choices = unshuffled.length ? unshuffled : fresh.length ? fresh : legal
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
    // Not thinking aloud first (Qwen3's empty thinking).
    prefill: quiet(a),
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
const CAPTURE_CUE = '<instructions>You just took one of their pieces. Talk trash about it.</instructions>'

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

/** Talking trash when it takes a piece (tookCue): the cue names no piece; its answer starts "Took your …". */
const ON_CAPTURE: Turn[] = [
  { user: CAPTURE_CUE, assistant: 'Took your pawn. I will be collecting the rest of them too.' },
  { user: CAPTURE_CUE, assistant: 'Took your knight. Did you even see that coming?' },
  { user: CAPTURE_CUE, assistant: 'Took your bishop. You are running out of things to lose.' },
  { user: CAPTURE_CUE, assistant: 'Took your rook. You are too generous.' },
  { user: CAPTURE_CUE, assistant: 'Took your queen. You might as well resign now.' },
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
/**
 * When PigeonAI's move took one of the player's pieces (`piece`: p n b r q): the cue, and how its answer
 * starts ("Took your rook. "). The start is written for it (the model goes on from there), so the piece is
 * said once, by it, and the cue has nothing in it to echo.
 */
export function tookCue(piece: string): { cue: string; start: string } {
  return { cue: CAPTURE_CUE, start: `Took your ${PIECE_NAMES[piece] ?? 'piece'}. ` }
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
export async function pigeonAIChat(message: string, game: ChatGame, chat: { mine: boolean; text: string }[], onText?: (soFar: string) => void, onWriting?: () => void, start = ''): Promise<string> {
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
      // `start`: how its answer begins, written for it (the model goes on from there).
      let soFar = start
      onText?.('')
      const r = await a.ask(message, {
        ...options, prefill: `${quiet(a)}${start}`, count: 40, temperature: 0.9, signal: stop.signal, onWriting,
        onText: (piece) => { soFar += piece; onText?.(soFar.replace(/<\/?think>/g, '').trimStart()) },
      })
      return said(start + r.text)
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
  return { here: PIGEONAI_HERE, status, ready, progress, paused, modelName, networkName, ownNetwork, mode, shareRule, earned }
}

/**
 * PigeonAI answering someone in the lobby's chat who mentioned it: asked of whatever runs here (PigeonAI's
 * mesh, or Local AI), in character, short. Null when it isn't ready (nothing is said then).
 */
export async function pigeonAILobbyReply(message: string, from: string): Promise<string | null> {
  const a = ai
  if (!a || !a.ready()) return null
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 60_000)
  try {
    const r = await a.ask(`${from}: ${message}`, {
      system: 'You are PigeonAI, a cocky, funny chess player who hangs around the PigeonChess lobby. Answer the player in one or two short sentences, in character. No lists, no markdown. Their name is before the colon: if you use it, write it exactly as it is written (test2 stays test2, never test two).',
      prefill: quiet(a), count: 50, temperature: 0.9, signal: stop.signal,
    })
    return said(r.text) || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
