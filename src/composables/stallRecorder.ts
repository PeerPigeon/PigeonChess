/**
 * Finds out what froze the page, on the player's own device.
 *
 * A 250 ms heartbeat notices when the page stops running for more than a
 * second while it is visible. Each stall is recorded with what ran just
 * before it: the last messages handled (type and how long the handler
 * took), relay and link log lines, page events and sounds. The record is
 * stored in the room's public storage under pc-diag:<peer id>, so it can be
 * read from any other peer afterwards without anyone opening a console.
 */

type Work = [string, string, number] // [time, what, ms]

const HEARTBEAT_MS = 250
const STALL_MS = 1000
const KEEP_WORK = 60
const KEEP_STALLS = 20
const PUBLISH_MIN_GAP_MS = 15_000

const work: Work[] = []
const stalls: Array<{ at: string; ms: number; visible: string; before: Work[]; log: string[] }> = []
const pageEvents: string[] = []
const lag = { ticks: 0, over100: 0, over300: 0, worst: 0 }
let started = false

const clock = () => new Date().toISOString().slice(11, 23)

/** Something the page did, and how long it took. Kept briefly, for the next stall's record. */
export function noteWork(what: string, ms = 0) {
  work.push([clock(), what.slice(0, 80), Math.round(ms)])
  if (work.length > KEEP_WORK) work.splice(0, work.length - KEEP_WORK)
}

/** Time a piece of work and note it when it is not trivial. */
export function timed<T>(what: string, run: () => T): T {
  const start = performance.now()
  try {
    return run()
  } finally {
    const ms = performance.now() - start
    if (ms >= 4) noteWork(what, ms)
  }
}

export function startStallRecorder(options: {
  peerId: () => string | null
  signalLog: string[]
  linkLog: () => Array<{ at: number; peer: string; event: string; by: string; reason: string; links: number }>
  links: () => number
  relay: () => string
  publish: (key: string, value: unknown) => Promise<unknown>
}) {
  if (started || typeof window === 'undefined') return
  started = true

  const page = (text: string) => {
    pageEvents.push(`${clock()} ${text}`)
    if (pageEvents.length > 40) pageEvents.splice(0, pageEvents.length - 40)
  }
  document.addEventListener('visibilitychange', () => page(`[page] ${document.visibilityState}`))
  window.addEventListener('online', () => page('[page] online'))
  window.addEventListener('offline', () => page('[page] offline'))
  window.addEventListener('pageshow', (e) => page(`[page] pageshow${(e as PageTransitionEvent).persisted ? ' (from cache)' : ''}`))
  window.addEventListener('pagehide', () => page('[page] pagehide'))
  window.addEventListener('error', (e) => page(`[error] ${String((e as ErrorEvent).message).slice(0, 160)}`))
  window.addEventListener('unhandledrejection', (e) => page(`[rejection] ${String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason).slice(0, 160)}`))

  let last = performance.now()
  let wasVisible = document.visibilityState === 'visible'
  let dirty = false
  let publishedAt = 0

  setInterval(() => {
    const now = performance.now()
    const late = now - last - HEARTBEAT_MS
    last = now
    const visible = document.visibilityState === 'visible'
    // A hidden tab's timers are throttled on purpose: not a freeze.
    if (visible && wasVisible) {
      lag.ticks++
      if (late > 100) lag.over100++
      if (late > 300) lag.over300++
      lag.worst = Math.max(lag.worst, Math.round(late))
      if (late > STALL_MS) {
        stalls.push({
          at: clock(),
          ms: Math.round(late),
          visible: document.visibilityState,
          before: work.slice(-25),
          log: options.signalLog.slice(-25).map((line) => line.slice(0, 200)),
        })
        if (stalls.length > KEEP_STALLS) stalls.splice(0, stalls.length - KEEP_STALLS)
        dirty = true
      }
    }
    wasVisible = visible
  }, HEARTBEAT_MS)

  // Publish a few seconds after a stall, then at most every 15 s, and once a
  // minute regardless so the lag figures arrive even without a stall.
  setInterval(() => {
    const now = Date.now()
    const due = (dirty && now - publishedAt >= PUBLISH_MIN_GAP_MS) || now - publishedAt >= 60_000
    const peerId = options.peerId()
    if (!due || !peerId || options.links() === 0) return
    dirty = false
    publishedAt = now
    const nav = navigator as any
    options.publish(`pc-diag:${peerId}`, {
      peer: peerId,
      at: now,
      ua: navigator.userAgent,
      memory: nav.deviceMemory ?? null,
      cores: nav.hardwareConcurrency ?? null,
      heapMb: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1e6) : null,
      relay: options.relay(),
      links: options.links(),
      lag: { ...lag },
      stalls: stalls.slice(-KEEP_STALLS),
      recentWork: work.slice(-30),
      pageEvents: pageEvents.slice(-40),
      linkLog: options.linkLog().slice(-30).map((e) => [new Date(e.at).toISOString().slice(11, 23), e.peer.slice(0, 8), e.event, e.by, e.reason, e.links]),
    }).catch(() => {})
  }, 3000)
}
