import { ref, shallowRef, triggerRef, onUnmounted } from 'vue'
import { PeerPigeonNode } from 'peerpigeon'
import { noteWork, startStallRecorder, timed } from './stallRecorder'

/**
 * PigeonChess on PeerPigeon (PeerPigeonNode) with freertc signaling.
 *
 * The rest of the app was written against the PeerPigeon 1.x mesh, so this
 * composable hands out a small `mesh` object with the same shape: `peerId`,
 * `addEventListener` / `on`, `sendDirectMessage`, `sendMessage`. It exists
 * from the start, so listeners can be attached before the node is running.
 */

// Keep the last few peer connections reachable from the console
// (__pigeonchess.pcs), so a link that never opens can be looked at.
const recentPcs: RTCPeerConnection[] = []
const signalLog: string[] = []
if (typeof window !== 'undefined' && window.RTCPeerConnection && !(window as any).__pcWrapped) {
  const Native = window.RTCPeerConnection
  const Wrapped = function (this: any, config?: RTCConfiguration) {
    const pc = new Native(config)
    recentPcs.push(pc)
    if (recentPcs.length > 20) recentPcs.shift()
    return pc
  } as any
  Wrapped.prototype = Native.prototype
  Object.setPrototypeOf(Wrapped, Native)
  ;(window as any).RTCPeerConnection = Wrapped
  ;(window as any).__pcWrapped = true
}

export const DEFAULT_SIGNALING_URLS = ['wss://peer.ooo/ws']
const RETIRED_SIGNALING_HOSTS = ['pigeonhub.fly.dev', 'pigeonhobbs.to']

/** Saved settings from before freertc pointed at PigeonHub; move them over. */
export function migrateSignalingUrls(urls: string[] | undefined): string[] {
  const kept = (urls || []).filter((url) => !RETIRED_SIGNALING_HOSTS.some((host) => url.includes(host)))
  return kept.length > 0 ? kept : [...DEFAULT_SIGNALING_URLS]
}

export interface PeerPigeonOptions {
  networkName?: string
  maxPeers?: number
  minPeers?: number
  enableCrypto?: boolean
}

type Listener = (event: any) => void

/** How long to wait for a peer's key before sending a direct message in the clear. */
const KEY_WAIT_MS = 4000

class CompatMesh {
  node: any = null
  private listeners = new Map<string, Set<Listener>>()

  get peerId(): string | null {
    return this.node?.getClientId?.() ?? null
  }

  addEventListener(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener)
  }

  removeEventListener(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener)
  }

  on(event: string, listener: Listener) {
    this.addEventListener(event, listener)
  }

  emit(event: string, payload: any = {}) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(payload)
      } catch (err) {
        console.error(`PigeonChess ${event} listener failed:`, err)
      }
    })
  }

  getConnectedPeerIds(): string[] {
    return (this.node?.getConnectedPeers?.() || []).map(String)
  }

  async sendDirectMessage(peerId: string, message: any) {
    return sendDirect(this.node, peerId, message)
  }

  async sendMessage(message: any) {
    if (!this.node) throw new Error('Mesh not started')
    return this.node.broadcast(message)
  }
}

const text = (message: any) => (typeof message === 'string' ? message : JSON.stringify(message))

/**
 * Messages to one peer leave in the order they were sent. Encryption is async,
 * so without this a timer sync could overtake the move sent just before it.
 */
const sendQueues = new Map<string, Promise<unknown>>()

function sendDirect(node: any, peerId: string, message: any): Promise<unknown> {
  const previous = sendQueues.get(peerId) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(() => sendDirectNow(node, peerId, message))
  sendQueues.set(peerId, next)
  next.finally(() => { if (sendQueues.get(peerId) === next) sendQueues.delete(peerId) }).catch(() => {})
  return next
}

async function sendDirectNow(node: any, peerId: string, message: any) {
  if (!node) throw new Error('Mesh not started')
  const body = text(message)
  if (node.crypto) {
    try {
      if (!node.getPublicKey(peerId)) await node.waitForPeerKey(peerId, KEY_WAIT_MS)
      return await node.sendEncryptedDirect(peerId, body, KEY_WAIT_MS)
    } catch (err) {
      console.warn(`No key from ${peerId.slice(0, 8)} yet; sending unencrypted`, err)
    }
  }
  const id = node.sendDirect(peerId, body)
  if (!id) throw new Error(`No route to ${peerId}`)
  return id
}

export function usePeerPigeon(options: PeerPigeonOptions = {}) {
  const compat = new CompatMesh()
  const mesh = shallowRef<CompatMesh | null>(null)
  const isConnected = ref(false)
  const isInitialized = ref(false)
  const connectedPeerIds = ref<string[]>([])
  // Everyone in the room right now, as the PeerPigeon demo counts them: the
  // mesh's membership (leased records that expire, and peers that said
  // goodbye removed at once) plus our own links, without us.
  const onlinePeerIds = ref<string[]>([])
  const error = ref<string | null>(null)
  const status = ref<any>(null)

  const messageHandlers = new Set<Listener>()
  const peerConnectHandlers = new Set<(peerId: string) => void>()
  let node: any = null
  let starting: Promise<void> | null = null

  // Listeners attached before the node runs (App.vue does this) must still fire.
  mesh.value = compat

  const refreshOnline = () => {
    if (!node) {
      onlinePeerIds.value = []
      return
    }
    const self = String(node.getClientId?.() ?? '')
    const members: string[] = node.mesh?.getGlobalPeers?.() ?? node.getGlobalPeers?.() ?? []
    const ids = [...new Set([...members, ...compat.getConnectedPeerIds()])].filter((id) => id && id !== self).sort()
    if (ids.join() !== onlinePeerIds.value.join()) onlinePeerIds.value = ids
  }
  const onlineTimer = setInterval(refreshOnline, 2000)
  onUnmounted(() => clearInterval(onlineTimer))

  // A tab closing or navigating away tells its neighbours, as the PeerPigeon
  // demo does, so other players' counts drop it now instead of when its
  // membership lease runs out.
  const onPageHide = (event: PageTransitionEvent) => {
    if (event.persisted) return
    try { node?.mesh?.announceLeave?.() } catch { /* best effort */ }
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide)
  onUnmounted(() => { if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide) })

  const refreshStatus = () => {
    if (!node) return
    // peerId is a getter on the node; let computed values that read it update.
    triggerRef(mesh)
    connectedPeerIds.value = compat.getConnectedPeerIds()
    refreshOnline()
    isConnected.value = connectedPeerIds.value.length > 0 || isConnected.value
    status.value = {
      connected: isConnected.value,
      peerId: compat.peerId,
      connectedCount: connectedPeerIds.value.length,
      relays: node.getActiveSignalingPeers?.() ?? [],
    }
  }

  const bind = (instance: any) => {
    instance.on('ready', () => {
      isConnected.value = true
      refreshStatus()
      compat.emit('connected')
    })
    instance.on('peerConnected', (peerId: string) => {
      noteWork(`link up ${String(peerId).slice(0, 8)}`)
      isConnected.value = true
      refreshStatus()
      compat.emit('peerConnected', { peerId })
      peerConnectHandlers.forEach((handler) => handler(peerId))
    })
    instance.on('peerDisconnected', (peerId: string) => {
      noteWork(`link down ${String(peerId).slice(0, 8)}`)
      refreshStatus()
      compat.emit('peerDisconnected', { peerId })
    })
    instance.on('keyDiscovered', (key: any) => {
      compat.emit('cryptoReady', { peerId: key?.peerId })
    })
    instance.on('message', (message: any) => {
      if (message.local) return
      // A broadcast's sender is its origin; fromPeerId may be the neighbour that forwarded it.
      const from = message.kind === 'broadcast'
        ? (message.message?.sender ?? message.fromPeerId)
        : message.fromPeerId
      if (!from) return
      const event = {
        from,
        content: message.data,
        encrypted: message.encrypted,
        broadcast: message.kind === 'broadcast',
        messageId: message.messageId,
        hops: message.hops,
      }
      const type = typeof message.data === 'string' ? (/"type":"([^"]{1,40})"/.exec(message.data)?.[1] ?? 'text') : 'object'
      timed(`message ${type}${message.kind === 'broadcast' ? ' (broadcast)' : ''}`, () => {
        compat.emit('messageReceived', event)
        messageHandlers.forEach((handler) => handler(event))
      })
    })
    instance.on('error', (err: Error) => {
      console.warn('PeerPigeon:', err?.message ?? err)
    })
  }

  /** Builds the node; it starts when connect() is given the relays. */
  const init = async () => {
    isInitialized.value = true
  }

  /**
   * Starts the node on the given relays. The first is the bootstrap; freertc
   * then chooses the room's relays itself (healthy local relays first).
   * Accepts one URL or a list; later calls while running are ignored.
   */
  const connect = async (signalingUrls: string | string[] = DEFAULT_SIGNALING_URLS) => {
    if (node) return starting ?? undefined
    const urls = migrateSignalingUrls(Array.isArray(signalingUrls) ? signalingUrls : [signalingUrls])
    error.value = null
    node = new PeerPigeonNode({
      networkId: 'pigeonchess',
      sessionId: options.networkName || 'global',
      signalingServer: urls[0],
      signalingServers: urls.slice(1),
      automaticSignalingServer: true,
      minPeers: options.minPeers ?? 2,
      maxPeers: options.maxPeers ?? 10,
      crypto: options.enableCrypto === false ? false : {},
      storage: {},
    })
    compat.node = node
    // For looking at a running page from the console; read-only by intent.
    ;(globalThis as any).__pigeonchess = { node, compat, pcs: recentPcs, log: signalLog }
    // The last few hundred relay and link events, for looking at from the console.
    node.mesh?.on?.('signaling:log', (data: { message?: string }) => {
      signalLog.push(`${new Date().toLocaleTimeString([], { hour12: false })} ${data?.message ?? ''}`)
      if (signalLog.length > 400) signalLog.splice(0, signalLog.length - 400)
    })
    bind(node)
    const started = node
    startStallRecorder({
      peerId: () => started.getClientId?.() ?? null,
      signalLog,
      linkLog: () => started.mesh?.getLinkLog?.() ?? [],
      links: () => started.getConnectedPeers?.().length ?? 0,
      relay: () => String(started.mesh?.signalingClient?.currentSignalUrl ?? ''),
      publish: async (key, value) => started.storage?.put('public', key, value),
    })
    starting = node.start().then(() => {
      // Signed in before the mesh was up: sign as the account from the start.
      if (accountKeys) started.storage?.signAs?.(accountKeys)
      // Started means the relays have us; other players may not be there yet.
      isInitialized.value = true
      isConnected.value = true
      refreshStatus()
    }).catch((err: unknown) => {
      error.value = err instanceof Error ? err.message : String(err)
      node = null
      compat.node = null
      throw err
    }).finally(() => {
      starting = null
    })
    return starting
  }

  const disconnect = () => {
    const current = node
    node = null
    compat.node = null
    connectedPeerIds.value = []
    isConnected.value = false
    status.value = null
    if (current) {
      // destroy() tells neighbours we are leaving, then closes the links;
      // it returns a number, not a promise.
      try { current.destroy() } catch {}
      compat.emit('disconnected')
    }
  }

  const sendMessage = async (peerId: string, message: any) => sendDirect(node, peerId, message)

  const broadcast = async (message: any, encrypted: boolean = false) => {
    if (!node) throw new Error('Mesh not started')
    if (encrypted && node.crypto) return node.broadcastEncrypted(text(message))
    return node.broadcast(text(message))
  }

  const onMessage = (handler: Listener) => {
    messageHandlers.add(handler)
    return () => { messageHandlers.delete(handler) }
  }

  const onPeerConnect = (handler: (peerId: string) => void) => {
    peerConnectHandlers.add(handler)
    return () => { peerConnectHandlers.delete(handler) }
  }

  onUnmounted(() => disconnect())

  // The old DHT is gone; PeerPigeon storage (public space) is synced across the
  // mesh and kept in IndexedDB. Reads ask the mesh before giving up.
  const dhtPut = async (key: string, value: any, _options: any = {}) => {
    if (!node?.storage) throw new Error('Storage not ready')
    // Plain data only: Vue proxies cannot be stored in IndexedDB.
    await node.storage.put('public', key, JSON.parse(JSON.stringify(value)))
    return true
  }

  // waitMs: keep asking for that long when nobody has answered yet. Right
  // after the page opens (or a reload) the links to the peers that hold the
  // record are still forming, and one 3 s ask came back empty.
  const dhtGet = async (key: string, options: { waitMs?: number } = {}) => {
    if (!node?.storage) throw new Error('Storage not ready')
    const deadline = Date.now() + Math.max(0, Number(options.waitMs) || 0)
    for (;;) {
      const record = await node.storage.retrieve('public', key, { timeoutMs: 3000 })
      if (record) return record.value
      if (Date.now() >= deadline) return null
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  // What a player writes is signed by their account once they sign in, so it is theirs on any device
  // they sign in from; before that (and after signing out), by this browser's own key.
  let accountKeys: { pub: string; priv: string } | null = null
  const signStorageAs = (keys: any) => {
    accountKeys = keys?.pub && keys?.priv ? { pub: keys.pub, priv: keys.priv } : null
    node?.storage?.signAs?.(accountKeys)
  }

  const readyStorage = async () => {
    if (starting) await starting.catch(() => {})
    return node?.storage ?? null
  }

  // Finished games: each one a frozen record (written once, never changed, not even by its player),
  // signed by the player, kept by the storage servers: chess-game:<signer>:<game id>.
  const GAME_PREFIX = 'chess-game:'
  const saveGame = async (entry: any) => {
    const storage = await readyStorage()
    const signer = storage?.signer?.()
    if (!storage || !signer || !entry?.gameId) return false
    try {
      await storage.put('frozen', `${GAME_PREFIX}${signer}:${entry.gameId}`, JSON.parse(JSON.stringify(entry)))
      return true
    } catch {
      return false // kept already: frozen records are never written twice
    }
  }

  /** The signed-in player's games (or this browser's, when nobody is signed in), wherever they were played. */
  const loadGames = async (): Promise<any[]> => {
    const storage = await readyStorage()
    const signer = storage?.signer?.()
    if (!storage || !signer) return []
    const prefix = `${GAME_PREFIX}${signer}:`
    const records = await storage.list('frozen')
    // Only records this player signed: a key that names them proves nothing by itself.
    return records.filter((r: any) => r.key.startsWith(prefix) && r.signer === signer && r.value).map((r: any) => r.value)
  }

  // A request to the relay this page is on (PigeonIdP accounts on a local relay).
  const relayRequest = async (body: Record<string, unknown>) => {
    if (!node?.mesh?.relayRequest) throw new Error('not on a relay')
    return node.mesh.relayRequest(body, { timeoutMs: 5000 })
  }

  return {
    relayRequest,
    mesh,
    isConnected,
    isInitialized,
    connectedPeerIds,
    onlinePeerIds,
    error,
    status,
    init,
    connect,
    disconnect,
    sendMessage,
    broadcast,
    onMessage,
    onPeerConnect,
    refreshStatus,
    dhtPut,
    dhtGet,
    signStorageAs,
    saveGame,
    loadGames,
  }
}
