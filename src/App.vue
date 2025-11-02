<template>
  <div id="app" class="app-container">
    <!-- Header -->
    <header class="app-header">
      <h1>♟️ PigeonChess</h1>
      <div class="header-actions">
        <button class="secondary" @click="showHistory = true">
          📜 History
        </button>
        <button class="secondary" @click="showSettings = true">
          ⚙️ Settings
        </button>
      </div>
    </header>

    <!-- Connection Status -->
    <div class="status-bar" :class="statusClass">
      <span class="status-text">{{ statusText }}</span>
      <span v-if="connectedPeerIds.length > 0" class="peer-count">
        {{ connectedPeerIds.length }} peer(s) connected
      </span>
    </div>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Waiting/Matchmaking Screen -->
      <div v-if="!isGameActive && !currentGame" class="welcome-screen">
        <div class="welcome-card card">
          <h2>Welcome to PigeonChess!</h2>
          <p>Decentralized peer-to-peer chess powered by PeerPigeon</p>
          
          <div class="connection-section">
            <div v-if="!isConnected">
              <button 
                class="primary large"
                @click="initialize"
                :disabled="isInitialized"
              >
                {{ isInitialized ? 'Initialized' : 'Initialize' }}
              </button>
              <button 
                v-if="isInitialized"
                class="success large"
                @click="connectToHub"
                :disabled="isConnected"
              >
                Connect to Network
              </button>
            </div>
            
            <div v-else class="matchmaking">
              <h3>Ready to Play!</h3>
              <p>Waiting for an opponent...</p>
              <p class="peer-id">Your Peer ID: <code>{{ myPeerId }}</code></p>
              
              <div v-if="connectedPeerIds.length > 0" class="peer-list">
                <h4>Available Peers:</h4>
                <div 
                  v-for="peerId in connectedPeerIds" 
                  :key="peerId"
                  class="peer-item"
                >
                  <span class="peer-name">{{ formatPeerId(peerId) }}</span>
                  <button 
                    class="primary"
                    @click="challengePeer(peerId)"
                  >
                    Challenge
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div v-if="error" class="error-message">
            {{ error }}
          </div>
        </div>
      </div>

      <!-- Game Screen -->
      <div v-else class="game-screen">
        <div class="game-info">
          <div class="player-info">
            <div class="player-card" :class="{ active: !isMyTurn }">
              <span class="player-icon">{{ myPlayer?.color === 'white' ? '♚' : '♔' }}</span>
              <span class="player-label">Opponent</span>
              <span class="player-name">{{ formatPeerId(opponentId || 'Unknown') }}</span>
            </div>
          </div>
          
          <div class="board-container">
            <ChessBoard 
              :chess="chess"
              :flipped="myPlayer?.color === 'black'"
              :interactive="isMyTurn && isGameActive"
              @move="handleMove"
            />
          </div>
          
          <div class="player-info">
            <div class="player-card" :class="{ active: isMyTurn }">
              <span class="player-icon">{{ myPlayer?.color === 'white' ? '♔' : '♚' }}</span>
              <span class="player-label">You</span>
              <span class="player-name">{{ myPlayer?.color }}</span>
            </div>
          </div>
        </div>
        
        <div class="game-controls">
          <div v-if="currentGame?.status === 'finished'" class="game-result">
            <h3>Game Over!</h3>
            <p class="result-text">
              {{ getResultText() }}
            </p>
            <button class="primary" @click="returnToLobby">
              Return to Lobby
            </button>
          </div>
          
          <div v-else class="active-controls">
            <div class="turn-indicator">
              <span v-if="isMyTurn" class="your-turn">Your Turn</span>
              <span v-else class="opponent-turn">Opponent's Turn</span>
            </div>
            <button class="danger" @click="handleResign">
              Resign
            </button>
          </div>
          
          <div class="moves-history">
            <h4>Move History</h4>
            <div class="moves-list">
              <div 
                v-for="(move, index) in currentGame?.moves || []" 
                :key="index"
                class="move-item"
              >
                <span class="move-number">{{ Math.floor(index / 2) + 1 }}{{ index % 2 === 0 ? '.' : '...' }}</span>
                <span class="move-san">{{ move }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Modals -->
    <SettingsModal 
      v-if="showSettings"
      :settings="settings"
      @close="showSettings = false"
      @reset="resetToDefaults"
      @add-url="addSignalingUrl"
      @remove-url="removeSignalingUrl"
    />
    
    <GameHistory
      v-if="showHistory"
      :game-history="gameHistory"
      @close="showHistory = false"
    />
    
    <!-- Challenge Modal -->
    <div v-if="incomingChallenge" class="modal-overlay">
      <div class="modal challenge-modal">
        <h2>Incoming Challenge!</h2>
        <p>{{ formatPeerId(incomingChallenge.from) }} wants to play a game.</p>
        <div class="actions">
          <button class="danger" @click="declineChallenge">
            Decline
          </button>
          <button class="success" @click="acceptChallenge">
            Accept
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePeerPigeon } from './composables/usePeerPigeon'
import ChessBoard from './components/ChessBoard.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameHistory from './components/GameHistory.vue'
import { useChessGame } from './composables/useChessGame'
import { useSettings } from './composables/useSettings'
import { generatePeerId } from './utils/helpers'
import type { ChessMessage } from './types'

// Settings
const { settings, addSignalingUrl, removeSignalingUrl, resetToDefaults } = useSettings()
const showSettings = ref(false)
const showHistory = ref(false)

// Generate or load peer ID
const myPeerId = ref(settings.value.peerId || generatePeerId())
if (!settings.value.peerId) {
  settings.value.peerId = myPeerId.value
}

// PeerPigeon setup
const {
  mesh,
  status,
  isConnected,
  isInitialized,
  connectedPeerIds,
  error,
  init,
  connect,
  disconnect,
  sendMessage,
  onMessage
} = usePeerPigeon({
  peerId: myPeerId.value,
  networkName: settings.value.networkName,
  maxPeers: 10,
  minPeers: 1,
  enableCrypto: true
})

// Chess game
const {
  chess,
  currentGame,
  myPlayer,
  opponentId,
  gameHistory,
  isMyTurn,
  isGameActive,
  startNewGame,
  makeMove,
  receiveMove,
  resign,
  resetGame
} = useChessGame()

// Challenge handling
const incomingChallenge = ref<{ from: string, gameId: string } | null>(null)

const statusClass = computed(() => {
  if (!isInitialized.value) return 'status-disconnected'
  if (!isConnected.value) return 'status-connecting'
  return 'status-connected'
})

const statusText = computed(() => {
  if (!isInitialized.value) return 'Not initialized'
  if (!isConnected.value) return 'Connecting...'
  return 'Connected to network'
})

const initialize = async () => {
  try {
    await init()
  } catch (err) {
    console.error('Failed to initialize:', err)
  }
}

const connectToHub = async () => {
  try {
    // Connect to the first signaling URL
    const url = settings.value.signalingUrls[0]
    await connect(url)
  } catch (err) {
    console.error('Failed to connect:', err)
  }
}

const formatPeerId = (peerId: string): string => {
  if (peerId.length > 20) {
    return peerId.substring(0, 10) + '...' + peerId.substring(peerId.length - 8)
  }
  return peerId
}

const challengePeer = async (peerId: string) => {
  const gameInfo = startNewGame(myPeerId.value, peerId)
  
  const message: ChessMessage = {
    type: 'gameStart',
    gameId: gameInfo.gameId,
    data: {
      myColor: gameInfo.myColor,
      opponentColor: gameInfo.opponentColor
    }
  }
  
  await sendMessage(peerId, JSON.stringify(message))
}

const acceptChallenge = () => {
  if (!incomingChallenge.value) return
  
  const gameInfo = startNewGame(myPeerId.value, incomingChallenge.value.from)
  
  // Override the game ID from the challenge
  if (currentGame.value) {
    currentGame.value.id = incomingChallenge.value.gameId
  }
  
  incomingChallenge.value = null
}

const declineChallenge = () => {
  incomingChallenge.value = null
}

const handleMove = async (from: string, to: string) => {
  const success = makeMove({ from, to })
  
  if (success && opponentId.value) {
    const message: ChessMessage = {
      type: 'move',
      gameId: currentGame.value!.id,
      data: { from, to }
    }
    
    await sendMessage(opponentId.value, JSON.stringify(message))
  }
}

const handleResign = async () => {
  if (confirm('Are you sure you want to resign?')) {
    resign()
    
    if (opponentId.value) {
      const message: ChessMessage = {
        type: 'resign',
        gameId: currentGame.value!.id
      }
      
      await sendMessage(opponentId.value, JSON.stringify(message))
    }
  }
}

const returnToLobby = () => {
  resetGame()
}

const getResultText = (): string => {
  if (!currentGame.value?.result) return 'Draw'
  
  if (currentGame.value.result === 'draw') return 'Draw'
  
  const iWon = currentGame.value.result === myPlayer.value?.color
  return iWon ? 'You Win!' : 'You Lose'
}

// Message handling
let unsubscribeMessage: (() => void) | null = null

const handleMessage = (event: any) => {
  try {
    console.log('Message received:', event)
    
    // Extract content properly - PeerPigeon wraps it in an object
    let content = event.content
    if (typeof content === 'object') {
      // Check for encrypted message
      if (content.encrypted && content.data) {
        content = content.data
      } else if (content.message) {
        content = content.message
      } else if (content.broadcast && content.data) {
        content = content.data
      }
    }
    
    // Try to parse as ChessMessage
    const message: ChessMessage = typeof content === 'string' ? JSON.parse(content) : content
    
    switch (message.type) {
      case 'gameStart':
        incomingChallenge.value = {
          from: event.from,
          gameId: message.gameId
        }
        break
        
      case 'move':
        if (message.data) {
          receiveMove(`${message.data.from}${message.data.to}`)
        }
        break
        
      case 'resign':
        // Opponent resigned
        if (currentGame.value) {
          currentGame.value.status = 'finished'
          currentGame.value.result = myPlayer.value?.color || 'white'
        }
        break
    }
  } catch (err) {
    console.error('Failed to parse message:', err)
  }
}

onMounted(() => {
  // Set up message listener using onMessage composable
  unsubscribeMessage = onMessage(handleMessage)
  
  // Set up mesh event listeners
  if (mesh.value) {
    mesh.value.addEventListener('peerConnected', (e: any) => {
      console.log('Peer connected:', e.peerId)
    })
    
    mesh.value.addEventListener('peerDisconnected', (e: any) => {
      console.log('Peer disconnected:', e.peerId)
    })
    
    mesh.value.addEventListener('cryptoReady', () => {
      console.log('Crypto system ready')
    })
  }
})

onUnmounted(() => {
  if (unsubscribeMessage) {
    unsubscribeMessage()
    unsubscribeMessage = null
  }
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.app-header h1 {
  font-size: 1.8rem;
  color: var(--dark-color);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.status-bar {
  padding: 0.5rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 500;
  transition: background-color 0.3s;
}

.status-disconnected {
  background: var(--danger-color);
  color: white;
}

.status-connecting {
  background: var(--warning-color);
  color: white;
}

.status-connected {
  background: var(--success-color);
  color: white;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.welcome-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.welcome-card {
  max-width: 600px;
  width: 100%;
  text-align: center;
}

.welcome-card h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: var(--dark-color);
}

.welcome-card > p {
  color: var(--secondary-color);
  margin-bottom: 2rem;
}

.connection-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

button.large {
  padding: 0.75rem 2rem;
  font-size: 1.1rem;
}

.matchmaking h3 {
  margin-bottom: 0.5rem;
  color: var(--dark-color);
}

.matchmaking > p {
  color: var(--secondary-color);
  margin-bottom: 1rem;
}

.peer-id {
  font-size: 0.9rem;
  color: var(--secondary-color);
  margin-bottom: 1.5rem;
}

.peer-id code {
  background: var(--light-color);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

.peer-list {
  width: 100%;
  margin-top: 1.5rem;
}

.peer-list h4 {
  text-align: left;
  margin-bottom: 1rem;
  color: var(--dark-color);
}

.peer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: var(--light-color);
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.peer-name {
  font-family: monospace;
  font-size: 0.9rem;
  color: var(--dark-color);
}

.error-message {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fee;
  border: 1px solid var(--danger-color);
  border-radius: 4px;
  color: var(--danger-color);
}

.game-screen {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1rem;
  overflow: hidden;
}

.game-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.player-info {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 1rem;
}

.player-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.player-card.active {
  background: var(--board-highlight);
}

.player-icon {
  font-size: 2rem;
}

.player-label {
  font-weight: bold;
  color: var(--dark-color);
}

.player-name {
  margin-left: auto;
  color: var(--secondary-color);
  font-size: 0.9rem;
}

.board-container {
  flex: 1;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.game-controls {
  width: 300px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
}

.game-result {
  text-align: center;
}

.game-result h3 {
  margin-bottom: 0.5rem;
  color: var(--dark-color);
}

.result-text {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 1.5rem;
  color: var(--primary-color);
}

.active-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.turn-indicator {
  text-align: center;
  padding: 0.75rem;
  border-radius: 4px;
  font-weight: bold;
}

.your-turn {
  color: var(--success-color);
}

.opponent-turn {
  color: var(--secondary-color);
}

.moves-history {
  flex: 1;
  overflow-y: auto;
}

.moves-history h4 {
  margin-bottom: 0.75rem;
  color: var(--dark-color);
}

.moves-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.move-item {
  font-size: 0.9rem;
  font-family: monospace;
  padding: 0.25rem;
  background: var(--light-color);
  border-radius: 4px;
}

.move-number {
  color: var(--secondary-color);
  margin-right: 0.25rem;
}

.move-san {
  color: var(--dark-color);
  font-weight: bold;
}

.challenge-modal {
  text-align: center;
}

.challenge-modal h2 {
  margin-bottom: 1rem;
}

.challenge-modal p {
  margin-bottom: 1.5rem;
  color: var(--dark-color);
}

.challenge-modal .actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

@media (max-width: 768px) {
  .game-screen {
    flex-direction: column;
  }
  
  .game-controls {
    width: 100%;
    max-height: 200px;
  }
}
</style>
