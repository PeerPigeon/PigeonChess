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
      <div class="status-left">
        <span class="status-indicator"></span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      <span v-if="connectedPeerIds.length > 0" class="peer-count">
        👥 {{ connectedPeerIds.length }} {{ connectedPeerIds.length === 1 ? 'peer' : 'peers' }} online
      </span>
      <span v-else-if="isConnected" class="peer-count">
        Searching for peers...
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
            <!-- Loading/Connecting State -->
            <div v-if="isConnecting || (!isInitialized || !isConnected)" class="connecting-state">
              <div class="spinner"></div>
              <p class="connecting-text">{{ statusText }}</p>
            </div>
            
            <!-- Connected and Ready State -->
            <div v-else class="matchmaking">
              <h3>✅ Ready to Play!</h3>
              <p class="peer-id">Your Peer ID: <code>{{ myPeerId }}</code></p>
              
              <!-- Time Control Selector -->
              <div class="time-control-section">
                <h4>Select Time Control</h4>
                <div class="time-controls">
                  <button 
                    v-for="control in timeControls" 
                    :key="control.id"
                    class="time-control-btn"
                    :class="{ active: selectedTimeControl === control.id }"
                    @click="selectTimeControl(control.id)"
                  >
                    <span class="control-name">{{ control.name }}</span>
                    <span class="control-time">{{ control.display }}</span>
                  </button>
                </div>
              </div>
              
              <!-- Search Button -->
              <div class="search-section">
                <button 
                  v-if="!isSearching"
                  class="primary search-btn"
                  @click="startSearching"
                  :disabled="connectedPeerIds.length === 0"
                >
                  🔍 Search for Game
                </button>
                <div v-else class="searching-indicator">
                  <div class="spinner small"></div>
                  <p>Searching for opponent with {{ selectedTimeControlDisplay }}...</p>
                  <button class="secondary" @click="stopSearching">Cancel</button>
                </div>
              </div>
              
              <div v-if="connectedPeerIds.length === 0" class="waiting-peers">
                <div class="spinner small"></div>
                <p>Waiting for peers to connect...</p>
              </div>
            </div>
          </div>
          
          <div v-if="error" class="error-message">
            ⚠️ {{ error }}
          </div>
        </div>
      </div>

      <!-- Game Screen -->
      <div v-else class="game-screen">
        <div class="game-info">
          <div class="board-container">
            <ChessBoard 
              :chess="chess"
              :flipped="myPlayer?.color === 'black'"
              :interactive="isMyTurn && isGameActive"
              @move="handleMove"
            />
          </div>
        </div>
        
        <div class="game-controls">
          <!-- Top Timer (opponent's clock, at top of board visually) -->
          <div class="timer-section opponent-timer" :class="{ active: !isMyTurn }">
            <div class="timer-display">
              <span class="timer-icon">{{ myPlayer?.color === 'black' ? '♔' : '♚' }}</span>
              <span class="timer-time">{{ formatTime(opponentTime) }}</span>
            </div>
            <div class="timer-label">Opponent</div>
          </div>
          
          <div class="player-section">
            <h4>Players</h4>
            <div class="player-info">
              <div class="player-display">
                <span class="player-display-icon">{{ myPlayer?.color === 'white' ? '♔' : '♚' }}</span>
                <span class="player-display-color">You ({{ myPlayer?.color }})</span>
              </div>
              <div class="opponent-display">
                <span class="opponent-icon">{{ myPlayer?.color === 'white' ? '♚' : '♔' }}</span>
                <span class="opponent-name">{{ formatPeerId(opponentId || 'Unknown') }}</span>
              </div>
            </div>
          </div>
          
          <!-- Bottom Timer (my clock, at bottom of board visually) -->
          <div class="timer-section my-timer" :class="{ active: isMyTurn }">
            <div class="timer-display">
              <span class="timer-icon">{{ myPlayer?.color === 'white' ? '♔' : '♚' }}</span>
              <span class="timer-time">{{ formatTime(myTime) }}</span>
            </div>
            <div class="timer-label">You</div>
          </div>
          
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
            <div class="control-buttons">
              <button class="secondary" @click="offerDraw">
                🤝 Offer Draw
              </button>
              <button class="secondary" @click="offerTakeback">
                ↩️ Request Takeback
              </button>
              <button class="danger" @click="handleResign">
                Resign
              </button>
            </div>
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
    
    <!-- Already in Game Modal -->
    <div v-if="showAlreadyInGameModal" class="modal-overlay">
      <div class="modal info-modal">
        <h2>Already in Game</h2>
        <p>You are already in an active game. Finish your current game before starting a new one.</p>
        <div class="actions">
          <button class="primary" @click="showAlreadyInGameModal = false">
            OK
          </button>
        </div>
      </div>
    </div>
    
    <!-- Resign Confirmation Modal -->
    <div v-if="showResignConfirmModal" class="modal-overlay">
      <div class="modal confirm-modal">
        <h2>Resign Game?</h2>
        <p>Are you sure you want to resign? This will end the game and count as a loss.</p>
        <div class="actions">
          <button class="secondary" @click="showResignConfirmModal = false">
            Cancel
          </button>
          <button class="danger" @click="confirmResign">
            Resign
          </button>
        </div>
      </div>
    </div>
    
    <!-- Draw Offer Modal -->
    <div v-if="incomingDrawOffer" class="modal-overlay">
      <div class="modal offer-modal">
        <h2>Draw Offered</h2>
        <p>{{ formatPeerId(incomingDrawOffer.from) }} is offering a draw.</p>
        <div class="actions">
          <button class="danger" @click="declineDrawOffer">
            Decline
          </button>
          <button class="success" @click="acceptDrawOffer">
            Accept Draw
          </button>
        </div>
      </div>
    </div>
    
    <!-- Takeback Request Modal -->
    <div v-if="incomingTakebackRequest" class="modal-overlay">
      <div class="modal offer-modal">
        <h2>Takeback Requested</h2>
        <p>{{ formatPeerId(incomingTakebackRequest.from) }} requests to undo their last move.</p>
        <div class="actions">
          <button class="danger" @click="declineTakebackRequest">
            Decline
          </button>
          <button class="success" @click="acceptTakebackRequest">
            Accept
          </button>
        </div>
      </div>
    </div>
    
    <!-- Challenge Rejected Modal -->
    <div v-if="showChallengeRejectedModal" class="modal-overlay">
      <div class="modal info-modal">
        <h2>Challenge Rejected</h2>
        <p>Your challenge was rejected. The player is already in a game.</p>
        <div class="actions">
          <button class="primary" @click="showChallengeRejectedModal = false">
            OK
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Chess } from 'chess.js'
import { usePeerPigeon } from './composables/usePeerPigeon'
import ChessBoard from './components/ChessBoard.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameHistory from './components/GameHistory.vue'
import { useChessGame } from './composables/useChessGame'
import { useSettings } from './composables/useSettings'
import type { ChessMessage } from './types'

// Settings
const { settings, addSignalingUrl, removeSignalingUrl, resetToDefaults } = useSettings()
const showSettings = ref(false)
const showHistory = ref(false)

// PeerPigeon setup - let PeerPigeon generate its own peer ID
const {
  mesh,
  isConnected,
  isInitialized,
  connectedPeerIds,
  error,
  init,
  connect,
  sendMessage,
  onMessage
} = usePeerPigeon({
  // Don't provide a custom peerId - let PeerPigeon generate its own
  networkName: settings.value.networkName,
  maxPeers: 10,
  minPeers: 1,
  enableCrypto: true
})

// Get the actual peer ID from the mesh after initialization
const myPeerId = computed(() => {
  return mesh.value?.peerId || 'Not connected'
})

// Time controls
const timeControls = [
  { id: 'bullet1', name: 'Bullet', display: '1+0', minutes: 1, increment: 0 },
  { id: 'bullet2', name: 'Bullet', display: '2+1', minutes: 2, increment: 1 },
  { id: 'blitz3', name: 'Blitz', display: '3+0', minutes: 3, increment: 0 },
  { id: 'blitz5', name: 'Blitz', display: '5+0', minutes: 5, increment: 0 },
  { id: 'rapid10', name: 'Rapid', display: '10+0', minutes: 10, increment: 0 },
  { id: 'rapid15', name: 'Rapid', display: '15+10', minutes: 15, increment: 10 },
  { id: 'classical30', name: 'Classical', display: '30+0', minutes: 30, increment: 0 }
]
const selectedTimeControl = ref('blitz5')
const isSearching = ref(false)

const selectedTimeControlDisplay = computed(() => {
  return timeControls.find(tc => tc.id === selectedTimeControl.value)?.display || ''
})

const selectTimeControl = (controlId: string) => {
  selectedTimeControl.value = controlId
  if (isSearching.value) {
    // If already searching, update the search
    broadcastSearchStatus()
  }
}

const startSearching = () => {
  if (isGameActive.value) return
  isSearching.value = true
  broadcastSearchStatus()
}

const stopSearching = () => {
  isSearching.value = false
  broadcastSearchStatus()
}

const broadcastSearchStatus = async () => {
  const message = {
    type: 'matchmaking',
    searching: isSearching.value,
    timeControl: isSearching.value ? selectedTimeControl.value : null
  }
  
  console.log('Broadcasting search status:', message, 'to', connectedPeerIds.value.length, 'peers')
  
  // Broadcast to all connected peers
  for (const peerId of connectedPeerIds.value) {
    try {
      await sendMessage(peerId, JSON.stringify(message))
      console.log('Sent to peer:', peerId)
    } catch (err) {
      console.error('Failed to broadcast search status to', peerId, err)
    }
  }
}

// Track which peers are searching and what time control they want
const peerSearchStatus = ref<Map<string, string | null>>(new Map())

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
const incomingChallenge = ref<{ from: string, gameId: string, opponentColor: 'white' | 'black' } | null>(null)
const showAlreadyInGameModal = ref(false)
const showResignConfirmModal = ref(false)
const showChallengeRejectedModal = ref(false)

// Draw and Takeback offers
const incomingDrawOffer = ref<{ from: string } | null>(null)
const incomingTakebackRequest = ref<{ from: string } | null>(null)

// Timer state
const myTime = ref(300) // seconds
const opponentTime = ref(300) // seconds
const currentGameTimeControl = ref<{ minutes: number, increment: number } | null>(null)
let timerInterval: ReturnType<typeof setInterval> | null = null

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const startTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  
  timerInterval = setInterval(() => {
    if (!isGameActive.value) {
      if (timerInterval) clearInterval(timerInterval)
      return
    }
    
    if (isMyTurn.value) {
      myTime.value = Math.max(0, myTime.value - 1)
      if (myTime.value === 0) {
        // Time ran out - resign
        handleTimeOut()
      }
    } else {
      opponentTime.value = Math.max(0, opponentTime.value - 1)
    }
  }, 1000)
}

const handleTimeOut = async () => {
  if (timerInterval) clearInterval(timerInterval)
  resign()
  
  if (opponentId.value) {
    const message: ChessMessage = {
      type: 'resign',
      gameId: currentGame.value!.id
    }
    await sendMessage(opponentId.value, JSON.stringify(message))
  }
}

const resetTimers = () => {
  if (timerInterval) clearInterval(timerInterval)
  const control = currentGameTimeControl.value
  if (control) {
    const totalSeconds = control.minutes * 60
    myTime.value = totalSeconds
    opponentTime.value = totalSeconds
  }
}

const statusClass = computed(() => {
  if (!isInitialized.value) return 'status-disconnected'
  if (!isConnected.value) return 'status-connecting'
  return 'status-connected'
})

const statusText = computed(() => {
  if (!isInitialized.value) return 'Initializing...'
  if (!isConnected.value) return 'Connecting to network...'
  return 'Connected to network'
})

const isConnecting = ref(false)

const initializeAndConnect = async () => {
  if (isConnecting.value) return
  
  isConnecting.value = true
  try {
    console.log('Auto-initializing...')
    await init()
    console.log('Initialized, connecting to signaling...')
    
    // Try to connect to signaling servers with retry logic
    let connected = false
    for (const url of settings.value.signalingUrls) {
      try {
        console.log('Attempting to connect to:', url)
        await connect(url)
        connected = true
        console.log('Connected to:', url)
        break
      } catch (err) {
        console.warn('Failed to connect to', url, err)
        // Continue to next URL
      }
    }
    
    if (!connected) {
      console.error('Failed to connect to any signaling server')
    }
  } catch (err) {
    console.error('Failed to initialize or connect:', err)
  } finally {
    isConnecting.value = false
  }
}

const formatPeerId = (peerId: string): string => {
  if (peerId.length > 20) {
    return peerId.substring(0, 10) + '...' + peerId.substring(peerId.length - 8)
  }
  return peerId
}

const acceptChallenge = () => {
  if (!incomingChallenge.value) return
  
  // Set opponent's color as the opposite of what they chose
  const myColor = incomingChallenge.value.opponentColor === 'white' ? 'black' : 'white'
  
  myPlayer.value = {
    id: myPeerId.value,
    color: myColor
  }
  
  opponentId.value = incomingChallenge.value.from
  
  chess.value = new Chess()
  
  currentGame.value = {
    id: incomingChallenge.value.gameId,
    playerWhite: myColor === 'white' ? myPeerId.value : incomingChallenge.value.from,
    playerBlack: myColor === 'black' ? myPeerId.value : incomingChallenge.value.from,
    currentTurn: 'white',
    status: 'active',
    moves: [],
    fen: chess.value.fen(),
    createdAt: Date.now()
  }
  
  incomingChallenge.value = null
}

const declineChallenge = () => {
  incomingChallenge.value = null
}

const handleMove = async (from: string, to: string) => {
  const success = makeMove({ from, to })
  
  if (success && opponentId.value) {
    // Add increment to my time
    if (currentGameTimeControl.value) {
      myTime.value += currentGameTimeControl.value.increment
    }
    
    const message: ChessMessage = {
      type: 'move',
      gameId: currentGame.value!.id,
      data: { from, to }
    }
    
    try {
      await sendMessage(opponentId.value, JSON.stringify(message))
    } catch (err) {
      console.error('Failed to send move - opponent may have disconnected:', err)
      // Continue playing anyway - the move is valid locally
    }
  }
}

const handleResign = async () => {
  showResignConfirmModal.value = true
}

const confirmResign = async () => {
  resign()
  
  if (opponentId.value) {
    const message: ChessMessage = {
      type: 'resign',
      gameId: currentGame.value!.id
    }
    
    try {
      await sendMessage(opponentId.value, JSON.stringify(message))
    } catch (err) {
      console.error('Failed to send resign message:', err)
    }
  }
  
  showResignConfirmModal.value = false
}

const offerDraw = async () => {
  if (!opponentId.value) return
  
  const message: ChessMessage = {
    type: 'draw_offer',
    gameId: currentGame.value!.id
  }
  
  try {
    await sendMessage(opponentId.value, JSON.stringify(message))
    console.log('Draw offer sent')
  } catch (err) {
    console.error('Failed to send draw offer:', err)
  }
}

const acceptDrawOffer = async () => {
  if (!incomingDrawOffer.value) return
  
  const message: ChessMessage = {
    type: 'draw_accept',
    gameId: currentGame.value!.id
  }
  
  try {
    await sendMessage(incomingDrawOffer.value.from, JSON.stringify(message))
  } catch (err) {
    console.error('Failed to send draw accept:', err)
  }
  
  // End game as draw
  if (currentGame.value) {
    currentGame.value.result = 'draw'
    currentGame.value.status = 'finished'
    currentGame.value.finishedAt = Date.now()
  }
  
  incomingDrawOffer.value = null
}

const declineDrawOffer = () => {
  incomingDrawOffer.value = null
}

const offerTakeback = async () => {
  if (!opponentId.value) return
  
  const message: ChessMessage = {
    type: 'takeback_request',
    gameId: currentGame.value!.id
  }
  
  try {
    await sendMessage(opponentId.value, JSON.stringify(message))
    console.log('Takeback request sent')
  } catch (err) {
    console.error('Failed to send takeback request:', err)
  }
}

const acceptTakebackRequest = async () => {
  if (!incomingTakebackRequest.value) return
  
  const message: ChessMessage = {
    type: 'takeback_accept',
    gameId: currentGame.value!.id
  }
  
  try {
    await sendMessage(incomingTakebackRequest.value.from, JSON.stringify(message))
  } catch (err) {
    console.error('Failed to send takeback accept:', err)
  }
  
  // Undo the last move
  if (chess.value) {
    chess.value.undo()
  }
  
  incomingTakebackRequest.value = null
}

const declineTakebackRequest = () => {
  incomingTakebackRequest.value = null
}

const returnToLobby = () => {
  if (timerInterval) clearInterval(timerInterval)
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

const handleMessage = async (event: any) => {
  try {
    console.log('Message received:', event)
    
    const fromPeer = event.from || event.source || event.peer
    
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
    
    // Try to parse as ChessMessage or matchmaking message
    const message: any = typeof content === 'string' ? JSON.parse(content) : content
    
    // Handle matchmaking messages
    if (message.type === 'matchmaking') {
      if (message.searching) {
        peerSearchStatus.value.set(fromPeer, message.timeControl)
        
        // Check if we're both searching for the same time control
        if (isSearching.value && message.timeControl === selectedTimeControl.value && !isGameActive.value) {
          console.log('Match found with', fromPeer, 'for', message.timeControl)
          
          // Only the peer with the lower ID initiates the game to avoid race conditions
          if (myPeerId.value < fromPeer) {
            console.log('I am initiator, starting game...')
            isSearching.value = false
            
            const timeControl = timeControls.find(tc => tc.id === selectedTimeControl.value)!
            currentGameTimeControl.value = {
              minutes: timeControl.minutes,
              increment: timeControl.increment
            }
            
            // Generate game ID and determine colors
            const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            // Lower peer ID gets white
            
            // Send gameStart message to opponent
            const gameStartMessage: ChessMessage = {
              type: 'gameStart',
              gameId: gameId,
              data: {
                whitePlayer: myPeerId.value,
                blackPlayer: fromPeer,
                timeControl: timeControl
              }
            }
            
            try {
              await sendMessage(fromPeer, JSON.stringify(gameStartMessage))
              
              // Start the game locally
              resetTimers()
              // I am white (lower peer ID), opponent is black
              startNewGame(myPeerId.value, fromPeer, 'white')
              opponentId.value = fromPeer
              startTimer()
              broadcastSearchStatus() // Stop broadcasting search
            } catch (err) {
              console.error('Failed to send game start message:', err)
              isSearching.value = true // Resume searching on error
            }
          } else {
            console.log('Peer', fromPeer, 'will initiate game, stopping my search')
            // The other peer will send us a gameStart message
            // Stop searching and wait for their gameStart message
            isSearching.value = false
            broadcastSearchStatus()
          }
        }
      } else {
        peerSearchStatus.value.delete(fromPeer)
      }
      return
    }
    
    const chessMessage: ChessMessage = message
    
    switch (chessMessage.type) {
      case 'gameStart':
        console.log('Received gameStart message:', chessMessage)
        
        // Reject challenge if already in a game
        if (currentGame.value && currentGame.value.status === 'active') {
          console.log('Rejecting - already in active game')
          // Send rejection message
          const rejectMessage: ChessMessage = {
            type: 'challengeRejected',
            gameId: chessMessage.gameId || 'unknown'
          }
          await sendMessage(fromPeer, JSON.stringify(rejectMessage))
          break
        }
        
        // Check if this is from matchmaking (has whitePlayer and blackPlayer)
        if (chessMessage.data?.whitePlayer && chessMessage.data?.blackPlayer) {
          console.log('Accepting matched game from', fromPeer, 'whitePlayer:', chessMessage.data.whitePlayer, 'blackPlayer:', chessMessage.data.blackPlayer)
          
          // Stop searching
          isSearching.value = false
          
          // Set up time control
          const incomingTimeControl = chessMessage.data?.timeControl
          if (incomingTimeControl) {
            currentGameTimeControl.value = {
              minutes: incomingTimeControl.minutes,
              increment: incomingTimeControl.increment
            }
          }
          resetTimers()
          
          // Determine which player is me and which is opponent
          const amIWhite = chessMessage.data.whitePlayer === myPeerId.value
          const opponent = amIWhite ? chessMessage.data.blackPlayer : chessMessage.data.whitePlayer
          const myColor = amIWhite ? 'white' : 'black'
          
          // Start the game with the assigned colors
          startNewGame(myPeerId.value, opponent, myColor)
          opponentId.value = opponent
          startTimer()
          broadcastSearchStatus() // Stop broadcasting search
          break
        }
        
        // Legacy challenge system - check if time control matches
        const incomingTimeControl = chessMessage.data?.timeControl
        const myTimeControl = timeControls.find(tc => tc.id === selectedTimeControl.value)
        
        if (incomingTimeControl && myTimeControl && incomingTimeControl.id === myTimeControl.id) {
          // Auto-accept if time controls match
          console.log('Auto-accepting challenge with matching time control:', incomingTimeControl.id)
          
          // Set up time control
          currentGameTimeControl.value = {
            minutes: incomingTimeControl.minutes,
            increment: incomingTimeControl.increment
          }
          resetTimers()
          
          const myColor = chessMessage.data?.opponentColor || 'black'
          startNewGame(
            myColor === 'white' ? myPeerId.value : fromPeer,
            myColor === 'white' ? fromPeer : myPeerId.value
          )
          
          // Start timer
          startTimer()
          
          // No need to send response - both sides start the game
        } else {
          // Show challenge modal for non-matching time controls
          incomingChallenge.value = {
            from: fromPeer,
            gameId: chessMessage.gameId || 'unknown',
            opponentColor: chessMessage.data?.myColor || 'white'
          }
        }
        break
      
      case 'challengeRejected':
        // Challenge was rejected
        showChallengeRejectedModal.value = true
        resetGame()
        break
        
      case 'move':
        if (chessMessage.data) {
          receiveMove(`${chessMessage.data.from}${chessMessage.data.to}`)
        }
        break
        
      case 'resign':
        // Opponent resigned
        if (currentGame.value) {
          currentGame.value.status = 'finished'
          currentGame.value.result = myPlayer.value?.color || 'white'
        }
        break
        
      case 'draw_offer':
        // Received draw offer
        incomingDrawOffer.value = { from: fromPeer }
        break
        
      case 'draw_accept':
        // Draw was accepted
        if (currentGame.value) {
          currentGame.value.result = 'draw'
          currentGame.value.status = 'finished'
          currentGame.value.finishedAt = Date.now()
        }
        console.log('Draw accepted by opponent')
        break
        
      case 'takeback_request':
        // Received takeback request
        incomingTakebackRequest.value = { from: fromPeer }
        break
        
      case 'takeback_accept':
        // Takeback was accepted
        if (chess.value) {
          chess.value.undo()
        }
        console.log('Takeback accepted by opponent')
        break
    }
  } catch (err) {
    console.error('Failed to parse message:', err)
  }
}

onMounted(async () => {
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
  
  // Auto-initialize and connect on mount
  await initializeAndConnect()
})

onUnmounted(() => {
  if (unsubscribeMessage) {
    unsubscribeMessage()
    unsubscribeMessage = null
  }
  if (timerInterval) {
    clearInterval(timerInterval)
  }
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 2rem;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-md);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.app-header h1 {
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, #2563eb, #1e40af);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.status-bar {
  padding: 0.75rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background-color 0.3s;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.peer-count {
  font-weight: 600;
}

.status-disconnected {
  background: #ef4444;
  color: white;
}

.status-connecting {
  background: #f59e0b;
  color: white;
}

.status-connected {
  background: #2563eb;
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
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: var(--dark-color);
  letter-spacing: -0.025em;
}

.welcome-card > p {
  color: var(--secondary-color);
  margin-bottom: 2.5rem;
  font-size: 1.05rem;
}

.connection-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

.connecting-state {
  text-align: center;
  padding: 2rem;
}

.connecting-text {
  margin-top: 1rem;
  color: var(--primary-color);
  font-weight: 600;
  font-size: 1.1rem;
}

.spinner {
  width: 60px;
  height: 60px;
  border: 4px solid rgba(99, 102, 241, 0.1);
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}

.spinner.small {
  width: 30px;
  height: 30px;
  border-width: 3px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

button.large {
  padding: 0.75rem 2rem;
  font-size: 1.1rem;
}

.matchmaking h3 {
  margin-bottom: 0.5rem;
  color: #2563eb;
  font-size: 1.75rem;
  font-weight: 700;
}

.waiting-peers {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2.5rem;
  color: var(--secondary-color);
}

.matchmaking > p {
  color: var(--secondary-color);
  margin-bottom: 1rem;
}

.peer-id {
  font-size: 0.9rem;
  color: var(--secondary-color);
  margin-bottom: 2rem;
}

.peer-id code {
  background: #eff6ff;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 0.85rem;
  border: 1px solid #bfdbfe;
}

.time-control-section {
  width: 100%;
  max-width: 600px;
  margin: 1.5rem 0;
}

.time-control-section h4 {
  margin-bottom: 1rem;
  color: var(--dark-color);
  font-size: 1.1rem;
}

.time-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
}

.time-control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem;
  border: 2px solid #bfdbfe;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.time-control-btn:hover {
  border-color: #93c5fd;
  background: #eff6ff;
  transform: translateY(-1px);
}

.time-control-btn.active {
  border-color: #2563eb;
  background: #dbeafe;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.control-name {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 500;
}

.control-time {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--dark-color);
  margin-top: 0.25rem;
}

.search-section {
  width: 100%;
  max-width: 500px;
  margin-top: 1.5rem;
}

.search-btn {
  width: 100%;
  padding: 1rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.searching-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: #dbeafe;
  border-radius: 12px;
  border: 2px solid #93c5fd;
}

.searching-indicator p {
  font-weight: 600;
  color: #2563eb;
  margin: 0;
}

.peer-list {
  width: 100%;
  margin-top: 1.5rem;
  max-width: 500px;
}

.peer-list h4 {
  text-align: left;
  margin-bottom: 1rem;
  color: var(--dark-color);
  font-size: 1.1rem;
}

.peer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  background: white;
  border: 2px solid #dbeafe;
  border-radius: 12px;
  margin-bottom: 0.75rem;
  transition: all 0.2s ease;
}

.peer-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: #3b82f6;
  background: #eff6ff;
}

.peer-name {
  font-family: monospace;
  font-size: 0.95rem;
  color: var(--dark-color);
  font-weight: 500;
}

.info-text {
  margin-top: 1rem;
  padding: 0.875rem 1.25rem;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  border-radius: 10px;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

.error-message {
  margin-top: 1rem;
  padding: 0.875rem 1.25rem;
  background: #fef2f2;
  border: 2px solid var(--danger-color);
  border-radius: 10px;
  color: var(--danger-color);
  font-weight: 500;
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
  min-width: 0;
  overflow: hidden;
  gap: 1rem;
}

.timer-section {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 0.75rem 1.5rem;
  box-shadow: var(--shadow-sm);
  transition: all 0.3s ease;
}

.timer-section.active {
  background: #dbeafe;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
  transform: scale(1.02);
}

.timer-display {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: center;
}

.timer-label {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25rem;
}

.timer-section.active .timer-label {
  color: #2563eb;
}

.timer-icon {
  font-size: 2rem;
}

.timer-time {
  font-size: 2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  color: var(--dark-color);
}

.timer-section.active .timer-time {
  color: #2563eb;
}

.board-container {
  flex: 1;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.game-controls {
  width: 320px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
  box-shadow: var(--shadow-md);
}

.player-section {
  padding-bottom: 1rem;
  border-bottom: 2px solid #e2e8f0;
}

.player-section h4 {
  margin-bottom: 0.75rem;
  color: var(--dark-color);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.player-display,
.opponent-display {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #eff6ff;
  border: 2px solid #bfdbfe;
  border-radius: 10px;
}

.player-display-icon,
.opponent-icon {
  font-size: 1.5rem;
}

.player-display-color {
  font-weight: 600;
  color: var(--dark-color);
}

.opponent-name {
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 0.85rem;
  color: var(--dark-color);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
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
  color: #2563eb;
}

.active-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.control-buttons button {
  flex: 1;
  min-width: 120px;
}

.turn-indicator {
  text-align: center;
  padding: 1rem;
  border-radius: 10px;
  font-weight: 600;
  font-size: 1.05rem;
  background: #eff6ff;
  border: 2px solid #bfdbfe;
}

.your-turn {
  color: #2563eb;
}

.opponent-turn {
  color: #64748b;
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
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  padding: 0.5rem;
  background: white;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.move-item:hover {
  background: #eff6ff;
  border-color: #3b82f6;
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

.challenge-modal h2,
.info-modal h2,
.confirm-modal h2 {
  margin-bottom: 1rem;
  color: var(--dark-color);
}

.challenge-modal p,
.info-modal p,
.confirm-modal p {
  margin-bottom: 1.5rem;
  color: var(--dark-color);
  line-height: 1.6;
}

.challenge-modal .actions,
.info-modal .actions,
.confirm-modal .actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.info-modal,
.confirm-modal {
  text-align: center;
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
