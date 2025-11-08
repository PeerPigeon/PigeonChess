import { ref, computed, onUnmounted } from 'vue'
import { MatchmakingEngine } from '@/lib/pigeonmatch/MatchmakingEngine'
import { MatchmakingEvent } from '@/lib/pigeonmatch/types'
import type { Peer, MatchGroup } from '@/lib/pigeonmatch/types'

export interface MatchmakingOptions {
  mesh?: any
  namespace?: string
  minPeers?: number
  maxPeers?: number
  matchTimeout?: number
}

export function useMatchmaking(options: MatchmakingOptions = {}) {
  const matchmaker = ref<MatchmakingEngine | null>(null)
  const currentMatch = ref<MatchGroup | null>(null)
  const peers = ref<Peer[]>([])
  const inQueue = ref(false)
  const error = ref<string | null>(null)
  const myPeerId = ref<string | null>(null)

  const stats = computed(() => {
    if (!matchmaker.value) {
      return { totalPeers: 0, queuedPeers: 0, activeMatches: 0, namespace: '' }
    }
    return matchmaker.value.getStats()
  })

  const isMatchReady = computed(() => {
    return currentMatch.value !== null
  })

  const initialize = (peerId: string, mesh?: any) => {
    try {
      error.value = null
      myPeerId.value = peerId

      matchmaker.value = new MatchmakingEngine({
        minPeers: options.minPeers || 2,
        maxPeers: options.maxPeers || 2,
        namespace: options.namespace || 'chess-game',
        matchTimeout: options.matchTimeout || 30000,
        mesh: mesh || options.mesh
      })

      // Set up event listeners
      matchmaker.value.on(MatchmakingEvent.PEER_JOINED, (peer: Peer) => {
        console.log('Peer joined matchmaking:', peer.id)
        peers.value = matchmaker.value!.getAllPeers()
      })

      matchmaker.value.on(MatchmakingEvent.PEER_LEFT, (peer: Peer) => {
        console.log('Peer left matchmaking:', peer.id)
        peers.value = matchmaker.value!.getAllPeers()
      })

      matchmaker.value.on(MatchmakingEvent.MATCH_FOUND, (match: MatchGroup) => {
        console.log('Match found!', match)
        currentMatch.value = match
      })

      matchmaker.value.on(MatchmakingEvent.MATCH_READY, (match: MatchGroup) => {
        console.log('Match is ready!', match)
        currentMatch.value = match
      })

      matchmaker.value.on(MatchmakingEvent.MATCH_FAILED, (failureInfo: any) => {
        console.log('Match failed:', failureInfo)
        error.value = `Match failed: ${failureInfo.reason}`
      })

      matchmaker.value.on(MatchmakingEvent.MATCH_DISBANDED, (match: MatchGroup) => {
        console.log('Match disbanded:', match.id)
        if (currentMatch.value?.id === match.id) {
          currentMatch.value = null
        }
      })

      console.log('Matchmaking initialized for peer:', peerId)
    } catch (err) {
      console.error('Failed to initialize matchmaking:', err)
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  const joinQueue = (connectedPeerIds: string[] = []) => {
    if (!matchmaker.value || !myPeerId.value) {
      throw new Error('Matchmaking not initialized')
    }

    // Add myself to the queue
    matchmaker.value.addPeer({
      id: myPeerId.value,
      metadata: {
        joinedAt: Date.now()
      }
    })

    // Add all already-connected peers to the queue
    for (const peerId of connectedPeerIds) {
      if (peerId !== myPeerId.value) {
        console.log('Adding already-connected peer to queue:', peerId)
        matchmaker.value.addPeer({
          id: peerId,
          metadata: {
            joinedAt: Date.now()
          }
        })
      }
    }

    inQueue.value = true
    console.log('Joined matchmaking queue')
  }

  const leaveQueue = () => {
    if (!matchmaker.value || !myPeerId.value) {
      return
    }

    matchmaker.value.removePeer(myPeerId.value)
    inQueue.value = false
    currentMatch.value = null
    console.log('Left matchmaking queue')
  }

  const getOpponentFromMatch = (): string | null => {
    if (!currentMatch.value || !myPeerId.value) {
      return null
    }

    const opponent = currentMatch.value.peers.find((p) => p.id !== myPeerId.value)
    return opponent?.id || null
  }

  const addPeerToQueue = (peerId: string, metadata?: any) => {
    if (!matchmaker.value) {
      throw new Error('Matchmaking not initialized')
    }

    matchmaker.value.addPeer({
      id: peerId,
      metadata: metadata || { joinedAt: Date.now() }
    })
  }

  const removePeerFromQueue = (peerId: string) => {
    if (!matchmaker.value) {
      return
    }

    matchmaker.value.removePeer(peerId)
  }

  const cleanup = () => {
    if (matchmaker.value) {
      if (inQueue.value && myPeerId.value) {
        matchmaker.value.removePeer(myPeerId.value)
      }
      matchmaker.value.removeAllListeners()
      matchmaker.value = null
    }
    
    currentMatch.value = null
    peers.value = []
    inQueue.value = false
    error.value = null
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    matchmaker,
    currentMatch,
    peers,
    inQueue,
    error,
    stats,
    isMatchReady,
    myPeerId,
    initialize,
    joinQueue,
    leaveQueue,
    addPeerToQueue,
    removePeerFromQueue,
    getOpponentFromMatch,
    cleanup
  }
}
