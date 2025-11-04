import { ref, onUnmounted } from 'vue'

// Declare global window types for PeerPigeon
declare global {
  interface Window {
    PeerPigeonMesh: any
  }
}

export interface PeerPigeonOptions {
  peerId?: string
  networkName?: string
  maxPeers?: number
  minPeers?: number
  enableCrypto?: boolean
}

export function usePeerPigeon(options: PeerPigeonOptions = {}) {
  const mesh = ref<any>(null)
  const isConnected = ref(false)
  const isInitialized = ref(false)
  const connectedPeerIds = ref<string[]>([])
  const error = ref<string | null>(null)
  const status = ref<any>(null)
  
  const messageHandlers = new Set<(event: any) => void>()
  const peerConnectHandlers = new Set<(peerId: string) => void>()

  const handleMessageReceived = (event: any) => {
    messageHandlers.forEach((handler) => handler(event))
  }
  
  const handlePeerConnected = (event: any) => {
    console.log('Peer connected:', event.peerId)
    refreshStatus()
    peerConnectHandlers.forEach((handler) => handler(event.peerId))
  }

  const refreshStatus = () => {
    if (mesh.value) {
      try {
        status.value = mesh.value.getStatus()
        isConnected.value = status.value?.connected || false
        connectedPeerIds.value = mesh.value.getConnectedPeerIds() || []
      } catch (err) {
        console.error('Error refreshing status:', err)
      }
    }
  }

  const init = async () => {
    try {
      error.value = null
      
      if (!window.PeerPigeonMesh) {
        throw new Error('PeerPigeonMesh not found. Make sure peerpigeon is loaded.')
      }
      
      const meshOptions = {
        peerId: options.peerId,
        networkName: options.networkName || 'global',
        maxPeers: options.maxPeers !== undefined ? options.maxPeers : 10,
        minPeers: options.minPeers !== undefined ? options.minPeers : 1,
        enableWebDHT: true,
        enableCrypto: options.enableCrypto !== false
      }
      
      const instance = new window.PeerPigeonMesh(meshOptions)
      mesh.value = instance
      
      // Set up event listeners
      instance.addEventListener('statusChanged', refreshStatus)
      instance.addEventListener('peerConnected', handlePeerConnected)
      instance.addEventListener('peerDisconnected', (e: any) => {
        console.log('Peer disconnected:', e.peerId)
        refreshStatus()
      })
      instance.addEventListener('messageReceived', handleMessageReceived)
      instance.addEventListener('connected', () => {
        isConnected.value = true
        refreshStatus()
      })
      instance.addEventListener('disconnected', () => {
        isConnected.value = false
        refreshStatus()
      })
      
      await instance.init()
      isInitialized.value = true
      refreshStatus()
    } catch (err) {
      console.error('Failed to initialize:', err)
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  const connect = async (signalingUrl: string) => {
    try {
      error.value = null
      if (!mesh.value) {
        throw new Error('Mesh not initialized. Call init() first.')
      }
      
      await mesh.value.connect(signalingUrl)
      refreshStatus()
    } catch (err) {
      console.error('Failed to connect:', err)
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  const disconnect = () => {
    if (mesh.value) {
      mesh.value.removeEventListener('messageReceived', handleMessageReceived)
      mesh.value.disconnect()
      mesh.value = null
      status.value = null
      connectedPeerIds.value = []
      isInitialized.value = false
      isConnected.value = false
    }
  }

  const sendMessage = async (peerId: string, message: any) => {
    if (!mesh.value) {
      throw new Error('Mesh not initialized')
    }
    
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
    await mesh.value.sendEncryptedMessage(peerId, messageStr)
  }

  const broadcast = async (message: any) => {
    if (!mesh.value) {
      throw new Error('Mesh not initialized')
    }
    
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
    // Try unencrypted broadcast first, fall back to encrypted if available
    if (mesh.value.sendBroadcast) {
      await mesh.value.sendBroadcast(messageStr)
    } else {
      await mesh.value.sendEncryptedBroadcast(messageStr)
    }
  }

  const onMessage = (handler: (event: any) => void) => {
    messageHandlers.add(handler)
    return () => {
      messageHandlers.delete(handler)
    }
  }
  
  const onPeerConnect = (handler: (peerId: string) => void) => {
    peerConnectHandlers.add(handler)
    return () => {
      peerConnectHandlers.delete(handler)
    }
  }

  onUnmounted(() => {
    disconnect()
  })

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
    refreshStatus
  }
}
