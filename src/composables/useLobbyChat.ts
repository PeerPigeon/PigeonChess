/**
 * The lobby's chat: one per room (the chess network a page is on, Settings → Network). Each message is a
 * record in the room's own storage, signed by whoever wrote it (their account once signed in, else their
 * browser's key), kept by every peer in the room (replicated) and by the storage servers, so a page that
 * arrives sees the recent ones. Anyone may write; a player can mute another (kept on this device), and a
 * writer who sends more than RATE messages in RATE_MS has the rest left out.
 */
import { ref } from 'vue'

export const CHAT_KEYS = 'pc-c/'
/** What is shown: the last SHOWN messages. Each writer keeps only its own last OWN in the room. */
const SHOWN = 100
const OWN = 20
/** Messages expire after a week: nobody shows them, and their writer deletes them. */
export const CHAT_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000
const RATE = 5
const RATE_MS = 10_000
const MAX_TEXT = 300

export interface ChatMessage { key: string; signer: string; name: string; text: string; at: number; bot?: string; /** A bot's answer: the message it answers. */ re?: string }

type Storage = {
  list(space: 'user'): Promise<any[]>
  get?(space: 'user', key: string): Promise<any>
  put(space: 'user', key: string, value: unknown): Promise<unknown>
  delete?(space: 'user', key: string): Promise<unknown>
  subscribe?(listener: (e: { op: 'upsert' | 'delete'; record: any; space: string; key: string }) => void): () => void
  signer?(): string | null
}

const messages = ref<ChatMessage[]>([])
/** Messages that came while the chat was closed. */
const unread = ref(0)
const open = ref(false)
const MUTED_KEY = 'pigeonchess:chat-muted'
const muted = ref<Set<string>>((() => { try { return new Set(JSON.parse(localStorage.getItem(MUTED_KEY) || '[]')) } catch { return new Set<string>() } })())
let storage: Storage | null = null
let unsubscribe: (() => void) | null = null
const sentAt: number[] = []

/** A message from a record, or null (not a chat message, or malformed). */
function fromRecord(r: any): ChatMessage | null {
  const v = r?.value
  if (!r?.key?.startsWith(CHAT_KEYS) || !v || typeof v.text !== 'string' || typeof r.signer !== 'string') return null
  const at = Number(v.at)
  if (!Number.isFinite(at)) return null
  return {
    key: r.key, signer: r.signer, at,
    name: String(v.name || 'Guest').slice(0, 40),
    text: v.text.slice(0, MAX_TEXT),
    ...(typeof v.bot === 'string' ? { bot: v.bot.slice(0, 40) } : {}),
    ...(typeof v.re === 'string' ? { re: v.re.slice(0, 80) } : {}),
  }
}

/** The messages to show: by time, the muted left out, and a writer's beyond RATE in RATE_MS. */
function settle(all: ChatMessage[]): ChatMessage[] {
  const since = Date.now() - CHAT_EXPIRE_MS
  const sorted = all.filter((m) => m.at > since && !muted.value.has(m.signer)).sort((a, b) => a.at - b.at)
  const recent = new Map<string, number[]>()
  const kept: ChatMessage[] = []
  for (const m of sorted) {
    // PigeonAI's answer (one per message that mentions it) isn't counted against the writer.
    if (m.bot) { kept.push(m); continue }
    const times = (recent.get(m.signer) ?? []).filter((t) => m.at - t < RATE_MS)
    if (times.length >= RATE) continue
    times.push(m.at)
    recent.set(m.signer, times)
    kept.push(m)
  }
  return kept.slice(-SHOWN)
}

let all: ChatMessage[] = []
const show = () => { messages.value = settle(all) }

/** Start on this room's storage (again, when the room changes). */
export async function startLobbyChat(s: Storage | null): Promise<void> {
  unsubscribe?.()
  unsubscribe = null
  storage = s
  sentAt.length = 0
  all = []
  show()
  if (!s) return
  const records = await s.list('user').catch(() => [])
  all = records.map(fromRecord).filter((m): m is ChatMessage => !!m)
  show()
  prune(s)
  unsubscribe = s.subscribe?.((e) => {
    if (e.space !== 'user' || !e.key.startsWith(CHAT_KEYS)) return
    if (e.op === 'delete') { all = all.filter((m) => m.key !== e.key); show(); return }
    // A change says who signed the record only sometimes (not for a write here): read it back for that.
    void (async () => {
      const rec = typeof e.record?.signer === 'string' ? e.record : await s.get?.('user', e.key).catch(() => null)
      const m = fromRecord(rec)
      if (!m || storage !== s) return
      const isNew = !all.some((x) => x.key === m.key)
      all = [...all.filter((x) => x.key !== m.key), m]
      if (isNew && !open.value && m.signer !== s.signer?.()) unread.value++
      show()
      // A new message that mentions PigeonAI (said in the last minute): whoever can answer it is told.
      if (isNew && !m.bot && Date.now() - m.at < 60_000 && /pigeon\s*ai/i.test(m.text)) onMention?.(m)
    })()
  }) ?? null
}

let onMention: ((m: ChatMessage) => void) | null = null
/** Who is told of each new message that mentions PigeonAI (the page, which answers if it can). */
export function onLobbyMention(handler: (m: ChatMessage) => void): void { onMention = handler }
/** Whether a message has been answered (by PigeonAI, from any device). */
export const answered = (key: string) => all.some((m) => m.re === key)
/** Whether PigeonAI has said anything since `at`. */
export const botSaidSince = (at: number) => all.some((m) => m.bot && m.at >= at)

/** Send a message as `name` (and, from PigeonAI's answer, `bot`, answering `re`). Returns why not, or null when sent. */
export async function sendLobbyChat(text: string, name: string, bot?: string, re?: string): Promise<string | null> {
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t) return 'nothing to send'
  if (!storage) return 'not connected yet'
  const now = Date.now()
  while (sentAt.length && now - sentAt[0] > RATE_MS) sentAt.shift()
  if (!bot && sentAt.length >= RATE) return 'a few seconds, please: at most 5 messages in 10 seconds'
  if (!bot) sentAt.push(now)
  const key = `${CHAT_KEYS}${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  await storage.put('user', key, { text: t, at: now, name, ...(bot ? { bot } : {}), ...(re ? { re } : {}) })
  prune(storage)
  return null
}

/** This writer's messages that go: those past a week, and all but its last OWN. */
function prune(s: Storage): void {
  const me = s.signer?.()
  if (!me) return
  const since = Date.now() - CHAT_EXPIRE_MS
  const mine = all.filter((m) => m.signer === me).sort((a, b) => a.at - b.at)
  const extra = Math.max(0, mine.length - OWN)
  mine.forEach((m, i) => {
    if (i < extra || m.at <= since) void Promise.resolve(s.delete?.('user', m.key)).catch(() => {})
  })
}

export function muteInChat(signer: string): void {
  muted.value = new Set([...muted.value, signer])
  try { localStorage.setItem(MUTED_KEY, JSON.stringify([...muted.value])) } catch { /* not kept */ }
  show()
}

export function setChatOpen(on: boolean): void {
  open.value = on
  if (on) unread.value = 0
}

export function useLobbyChat() {
  return { messages, unread, open, signer: () => storage?.signer?.() ?? null }
}
