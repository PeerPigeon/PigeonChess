import { ref, shallowRef, triggerRef, onUnmounted } from 'vue'
import { PeerPigeonNode } from '@/vendor/peerpigeon.js'

/**
 * PigeonChess on PeerPigeon (PeerPigeonNode) with freertc signaling.
 *
 * The rest of the app was written against the PeerPigeon 1.x mesh, so this
 * composable hands out a small `mesh` object with the same shape: `peerId`,
 * `addEventListener` / `on`, `sendDirectMessage`, `sendMessage`. It exists
 * from the start, so listeners can be attached before the node is running.
 */

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
  const error = ref<string | null>(null)
  const status = ref<any>(null)

  const messageHandlers = new Set<Listener>()
  const peerConnectHandlers = new Set<(peerId: string) => void>()
  let node: any = null
  let starting: Promise<void> | null = null

  // Listeners attached before the node runs (App.vue does this) must still fire.
  mesh.value = compat

  const refreshStatus = () => {
    if (!node) return
    // peerId is a getter on the node; let computed values that read it update.
    triggerRef(mesh)
    connectedPeerIds.value = compat.getConnectedPeerIds()
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
      isConnected.value = true
      refreshStatus()
      compat.emit('peerConnected', { peerId })
      peerConnectHandlers.forEach((handler) => handler(peerId))
    })
    instance.on('peerDisconnected', (peerId: string) => {
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
      compat.emit('messageReceived', event)
      messageHandlers.forEach((handler) => handler(event))
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
    bind(node)
    starting = node.start().then(() => {
      isInitialized.value = true
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
      current.destroy().catch(() => {})
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
    await node.storage.put('public', key, value)
    return true
  }

  const dhtGet = async (key: string, _options: any = {}) => {
    if (!node?.storage) throw new Error('Storage not ready')
    const record = await node.storage.retrieve('public', key, { timeoutMs: 3000 })
    return record ? record.value : null
  }

  return {
    mesh,
    isConnected,
    isInitialized,
    connectedPeerIds,
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
  }
}
