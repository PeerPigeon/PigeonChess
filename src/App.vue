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
      <span v-if="allKnownPeers.size > 0" class="peer-count">
        👥 {{ allKnownPeers.size }} {{ allKnownPeers.size === 1 ? 'peer' : 'peers' }} online
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
                >
                  🔍 Search for Game
                </button>
                <div v-else class="searching-indicator">
                  <div class="spinner small"></div>
                  <p>Searching for opponent with {{ selectedTimeControlDisplay }}...</p>
                  <p v-if="allKnownPeers.size === 0" class="waiting-text">Waiting for peers to connect...</p>
                  <button class="secondary" @click="stopSearching">Cancel</button>
                </div>
              </div>
              
              <div v-if="allKnownPeers.size === 0" class="waiting-peers">
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
              :piece-colors="{
                whiteFill: settings.customWhitePieceColor,
                blackFill: settings.customBlackPieceColor,
                whiteStroke: settings.customWhitePieceOutline,
                blackStroke: settings.customBlackPieceOutline
              }"
              @move="handleMove"
            />
          </div>
        </div>
        
        <div class="game-controls">
          <!-- Top Timer (opponent's clock, at top of board visually) -->
          <div 
            v-if="currentGameTimeControl && currentGameTimeControl.minutes > 0"
            class="timer-section opponent-timer" 
            :class="{ active: !isMyTurn }"
          >
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
            <div v-if="currentGameTimeControl && currentGameTimeControl.minutes === 0" class="casual-mode-badge">
              ♾️ Casual - No Time Limit
            </div>
          </div>
          
          <!-- Material Score -->
          <div v-if="capturedPieces.white.length > 0 || capturedPieces.black.length > 0" class="material-section">
            <h4>Material</h4>
            <div class="material-display">
              <div v-if="capturedPieces[myPlayer?.color === 'white' ? 'white' : 'black'].length > 0" class="captured-pieces">
                <div class="captured-label">You captured:</div>
                <div class="pieces-row">
                  <img 
                    v-for="(piece, idx) in capturedPieces[myPlayer?.color === 'white' ? 'white' : 'black']"
                    :key="`my-${idx}`"
                    :src="`/pieces/${myPlayer?.color === 'white' ? 'b' : 'w'}${piece}.svg`" 
                    :alt="piece"
                    class="captured-piece"
                  />
                  <span v-if="materialAdvantage[myPlayer?.color || 'white'] > 0" class="advantage-score">
                    +{{ materialAdvantage[myPlayer?.color || 'white'] }}
                  </span>
                </div>
              </div>
              <div v-if="capturedPieces[myPlayer?.color === 'white' ? 'black' : 'white'].length > 0" class="captured-pieces">
                <div class="captured-label">Opponent captured:</div>
                <div class="pieces-row">
                  <img 
                    v-for="(piece, idx) in capturedPieces[myPlayer?.color === 'white' ? 'black' : 'white']"
                    :key="`opp-${idx}`"
                    :src="`/pieces/${myPlayer?.color === 'white' ? 'w' : 'b'}${piece}.svg`" 
                    :alt="piece"
                    class="captured-piece"
                  />
                  <span v-if="materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] > 0" class="advantage-score">
                    +{{ materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Bottom Timer (my clock, at bottom of board visually) -->
          <div 
            v-if="currentGameTimeControl && currentGameTimeControl.minutes > 0"
            class="timer-section my-timer" 
            :class="{ active: isMyTurn }"
          >
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
      :board-themes="boardThemes"
      :piece-themes="pieceThemes"
      @close="showSettings = false"
      @reset="resetToDefaults"
      @add-url="addSignalingUrl"
      @remove-url="removeSignalingUrl"
      @select-theme="setBoardTheme"
      @select-piece-theme="setPieceTheme"
      @update-custom-colors="setCustomColors"
      @update-piece-colors="setPieceColors"
      @update-piece-outlines="setPieceOutlines"
      @toggle-sound="toggleSound"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Chess } from 'chess.js'
import { usePeerPigeon } from './composables/usePeerPigeon'
import ChessBoard from './components/ChessBoard.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameHistory from './components/GameHistory.vue'
import { useChessGame } from './composables/useChessGame'
import { useSettings } from './composables/useSettings'
import type { ChessMessage } from './types'

// Settings
const { settings, boardThemes, pieceThemes, addSignalingUrl, removeSignalingUrl, resetToDefaults, setBoardTheme, setCustomColors, setPieceColors, setPieceOutlines, setPieceTheme, toggleSound } = useSettings()
const showSettings = ref(false)
const showHistory = ref(false)

// Watch showHistory to debug
watch(showHistory, (value) => {
  if (value) {
    console.log('Opening game history. Games in history:', gameHistory.value.length)
    console.log('Game history data:', gameHistory.value)
  }
})

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
  broadcast,
  onMessage,
  onPeerConnect
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
  { id: 'any', name: 'Any', display: 'Any Time', minutes: 5, increment: 0 }, // Default to 5+0 if matched
  { id: 'casual', name: 'Casual', display: 'No Time', minutes: 0, increment: 0 },
  { id: 'bullet1', name: 'Bullet', display: '1+0', minutes: 1, increment: 0 },
  { id: 'bullet2', name: 'Bullet', display: '2+1', minutes: 2, increment: 1 },
  { id: 'blitz3', name: 'Blitz', display: '3+0', minutes: 3, increment: 0 },
  { id: 'blitz3-1', name: 'Blitz', display: '3+1', minutes: 3, increment: 1 },
  { id: 'blitz5', name: 'Blitz', display: '5+0', minutes: 5, increment: 0 },
  { id: 'blitz5-1', name: 'Blitz', display: '5+1', minutes: 5, increment: 1 },
  { id: 'rapid10', name: 'Rapid', display: '10+0', minutes: 10, increment: 0 },
  { id: 'rapid15', name: 'Rapid', display: '15+10', minutes: 15, increment: 10 },
  { id: 'classical30', name: 'Classical', display: '30+0', minutes: 30, increment: 0 }
]
const selectedTimeControl = ref('any')
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
  
  // Check if any peers are already searching for compatible time controls
  console.log('Checking existing peer search statuses:', peerSearchStatus.value)
  for (const [peerId, timeControl] of peerSearchStatus.value.entries()) {
    if (!timeControl) continue // Skip if null
    
    // Match if: exact match, or either side is searching for 'any'
    const isMatch = timeControl === selectedTimeControl.value || 
                    timeControl === 'any' || 
                    selectedTimeControl.value === 'any'
    
    if (isMatch) {
      console.log('Found peer already searching:', peerId, 'for', timeControl)
      
      // Simulate receiving a matchmaking message from this peer
      handleMatchmakingMessage(peerId, timeControl)
      break // Only match with one peer
    }
  }
}

const handleMatchmakingMessage = async (senderPeerId: string, timeControl: string) => {
  // Check if we're both searching for compatible time controls
  const isMatch = isSearching.value && 
                  !isGameActive.value &&
                  (timeControl === selectedTimeControl.value || 
                   timeControl === 'any' || 
                   selectedTimeControl.value === 'any')
  
  if (isMatch) {
    console.log('Match found with', senderPeerId, 'for', timeControl, 'My ID:', myPeerId.value)
    
    // Only the peer with the lower ID initiates the game to avoid race conditions
    if (myPeerId.value < senderPeerId) {
      console.log('I am initiator (lower ID), starting game...')
      isSearching.value = false
      
      // Determine which time control to use:
      // If I selected 'any', use opponent's time control
      // If opponent selected 'any', use my time control
      // Otherwise use my time control (they match)
      let finalTimeControlId = selectedTimeControl.value
      if (selectedTimeControl.value === 'any') {
        finalTimeControlId = timeControl
      }
      
      const timeControlObj = timeControls.find(tc => tc.id === finalTimeControlId)!
      currentGameTimeControl.value = {
        minutes: timeControlObj.minutes,
        increment: timeControlObj.increment
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
          blackPlayer: senderPeerId,
          timeControl: timeControlObj
        }
      }
      
      try {
        await sendMessage(senderPeerId, JSON.stringify(gameStartMessage))
        
        // Start the game locally
        resetTimers()
        // I am white (lower peer ID), opponent is black
        startNewGame(myPeerId.value, senderPeerId, 'white')
        opponentId.value = senderPeerId
        startTimer()
        startTimerSyncBroadcast()
        broadcastSearchStatus() // Stop broadcasting search
      } catch (err) {
        console.error('Failed to send game start message:', err)
        isSearching.value = true // Resume searching on error
      }
    } else {
      console.log('Peer', senderPeerId, 'will initiate game (they have lower ID), waiting for gameStart message...')
      // The other peer will send us a gameStart message
      // Keep searching until we receive the gameStart to ensure they got our message
      // We'll stop searching when we receive the gameStart message
    }
  }
}

const stopSearching = () => {
  isSearching.value = false
  broadcastSearchStatus()
}

const broadcastSearchStatus = async () => {
  const message = {
    type: 'matchmaking',
    peerId: myPeerId.value,
    searching: isSearching.value,
    timeControl: isSearching.value ? selectedTimeControl.value : null
  }
  
  console.log('Broadcasting search status:', message, 'to all peers in network')
  
  try {
    await broadcast(JSON.stringify(message), false) // Unencrypted
    console.log('Search status broadcasted to network')
  } catch (err) {
    console.error('Failed to broadcast search status:', err)
  }
}

// Track which peers are searching and what time control they want
const peerSearchStatus = ref<Map<string, string | null>>(new Map())

// Track all known peers in the network (direct + indirect via gossip)
const allKnownPeers = ref<Set<string>>(new Set())
const peerLastSeen = ref<Map<string, number>>(new Map())

// Clean up stale peers every 10 seconds
let staleCheckInterval: ReturnType<typeof setInterval> | null = null

const cleanupStalePeers = () => {
  const now = Date.now()
  const staleThreshold = 15000 // 15 seconds
  
  for (const [peerId, lastSeen] of peerLastSeen.value.entries()) {
    if (now - lastSeen > staleThreshold) {
      allKnownPeers.value.delete(peerId)
      peerLastSeen.value.delete(peerId)
      console.log('Removed stale peer:', peerId)
    }
  }
}

// Broadcast peer presence every 5 seconds
let presenceInterval: ReturnType<typeof setInterval> | null = null

const broadcastPresence = async () => {
  if (!myPeerId.value || !mesh.value) return
  
  const message = {
    type: 'peer_presence',
    peerId: myPeerId.value,
    timestamp: Date.now()
  }
  
  try {
    await broadcast(JSON.stringify(message), false) // Unencrypted
  } catch (err) {
    // Silently fail if crypto/group key not ready yet
    // This is normal during initial connection
  }
}

const startPresenceBroadcast = () => {
  // Add self to known peers immediately
  if (myPeerId.value) {
    allKnownPeers.value.add(myPeerId.value)
    peerLastSeen.value.set(myPeerId.value, Date.now())
  }
  
  // Broadcast immediately
  broadcastPresence()
  
  // Then every 5 seconds
  presenceInterval = setInterval(broadcastPresence, 5000)
  
  // Start stale peer cleanup
  staleCheckInterval = setInterval(cleanupStalePeers, 10000)
}

const stopPresenceBroadcast = () => {
  if (presenceInterval) {
    clearInterval(presenceInterval)
    presenceInterval = null
  }
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval)
    staleCheckInterval = null
  }
}

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
  resetGame,
  setOnGameEndCallback
} = useChessGame()

// Set up the game end callback to play win/lose sounds
setOnGameEndCallback((result) => {
  if (result === 'win') {
    playWinSound()
  } else if (result === 'loss') {
    playLoseSound()
  } else if (result === 'draw') {
    playDrawSound()
  }
})

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
let lowTimeWarningPlayed = ref(false)
// Vector clock for timer sync
const vectorClock = ref<Record<string, number>>({})
let timerSyncInterval: ReturnType<typeof setInterval> | null = null

const ensureClockHas = (peerId: string) => {
  if (!vectorClock.value[peerId]) vectorClock.value[peerId] = 0
}

const incrementLocalClock = () => {
  const me = myPeerId.value
  if (!me || me === 'Not connected') return
  ensureClockHas(me)
  vectorClock.value[me] = (vectorClock.value[me] || 0) + 1
}

const happenedBefore = (a: Record<string, number>, b: Record<string, number>) => {
  // returns true if a happened before b (a <= b and a != b)
  let lessOrEqual = true
  let strictlyLess = false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  keys.forEach(k => {
    const av = a[k] || 0
    const bv = b[k] || 0
    if (av > bv) lessOrEqual = false
    if (av < bv) strictlyLess = true
  })
  return lessOrEqual && strictlyLess
}

const isConcurrent = (a: Record<string, number>, b: Record<string, number>) => {
  return !happenedBefore(a, b) && !happenedBefore(b, a)
}

const mergeClocks = (local: Record<string, number>, incoming: Record<string, number>) => {
  const keys = new Set([...Object.keys(local), ...Object.keys(incoming)])
  keys.forEach(k => {
    local[k] = Math.max(local[k] || 0, incoming[k] || 0)
  })
}

const sendTimerSync = async (toPeer?: string) => {
  if (!currentGame.value) return
  // Build canonical white/black times so both peers interpret correctly
  const payload = {
    type: 'timer_sync',
    gameId: currentGame.value.id,
    data: {
      whiteTime: myPlayer.value?.color === 'white' ? myTime.value : opponentTime.value,
      blackTime: myPlayer.value?.color === 'black' ? myTime.value : opponentTime.value,
      currentTurn: currentGame.value.currentTurn,
      lastUpdated: Date.now()
    },
    vectorClock: vectorClock.value
  }

  try {
    if (toPeer && opponentId.value === toPeer) {
      await sendMessage(toPeer, JSON.stringify(payload))
    } else if (opponentId.value) {
      // send direct to opponent
      await sendMessage(opponentId.value, JSON.stringify(payload))
    }
  } catch (err) {
    console.warn('Failed to send timer sync:', err)
  }
}

const startTimerSyncBroadcast = () => {
  if (timerSyncInterval) clearInterval(timerSyncInterval)
  timerSyncInterval = setInterval(() => {
    // increment logical clock before broadcasting periodic state
    incrementLocalClock()
    sendTimerSync()
  }, 3000)
}

const stopTimerSyncBroadcast = () => {
  if (timerSyncInterval) {
    clearInterval(timerSyncInterval)
    timerSyncInterval = null
  }
}

const processIncomingTimer = (incomingTimer: any, incomingClock: Record<string, number> | undefined, senderPeerId?: string) => {
  if (!incomingTimer || !currentGame.value) return

  // Ensure clocks have entries
  if (incomingClock) {
    Object.keys(incomingClock).forEach(k => ensureClockHas(k))
  }

  // Decide whether to accept incoming state
  const localClock = { ...vectorClock.value }
  const incoming = incomingClock || {}

  let accept = false
  if (happenedBefore(localClock, incoming)) {
    accept = true
  } else if (happenedBefore(incoming, localClock)) {
    accept = false
  } else {
    // concurrent - tie break deterministically by peer id
    if (senderPeerId && myPeerId.value) {
      accept = senderPeerId < myPeerId.value
    } else {
      accept = true
    }
  }

  if (!accept) return

  // Merge clocks
  mergeClocks(vectorClock.value, incoming)

  // Reconstruct times accounting for elapsed network delay
  const now = Date.now()
  const elapsedSec = Math.floor((now - (incomingTimer.lastUpdated || now)) / 1000)

  let whiteT = Math.max(0, (incomingTimer.whiteTime || 0) - (incomingTimer.currentTurn === 'white' ? elapsedSec : 0))
  let blackT = Math.max(0, (incomingTimer.blackTime || 0) - (incomingTimer.currentTurn === 'black' ? elapsedSec : 0))

  // Map to local myTime/opponentTime depending on our color
  if (myPlayer.value?.color === 'white') {
    myTime.value = whiteT
    opponentTime.value = blackT
  } else if (myPlayer.value?.color === 'black') {
    myTime.value = blackT
    opponentTime.value = whiteT
  }

  // Update current turn
  currentGame.value.currentTurn = incomingTimer.currentTurn

  // Restart timer loop to use updated state
  if (timerInterval) clearInterval(timerInterval)
  startTimer()
}


const playLowTimeWarning = () => {
  // Play the shaker sound 3 times in rapid succession
  const audio1 = new Audio('/sounds/shaker.mp3')
  const audio2 = new Audio('/sounds/shaker.mp3')
  const audio3 = new Audio('/sounds/shaker.mp3')
  
  audio1.volume = 0.5
  audio2.volume = 0.5
  audio3.volume = 0.5
  
  audio1.play().catch((err) => console.error('Low time warning error:', err))
  setTimeout(() => audio2.play().catch((err) => console.error('Low time warning error:', err)), 150)
  setTimeout(() => audio3.play().catch((err) => console.error('Low time warning error:', err)), 300)
}

const playWinSound = () => {
  const audio = new Audio('/sounds/win.mp3')
  audio.volume = 0.6
  audio.play().catch((err) => console.error('Win sound error:', err))
}

const playLoseSound = () => {
  const audio = new Audio('/sounds/lose.mp3')
  audio.volume = 0.6
  audio.play().catch((err) => console.error('Lose sound error:', err))
}

const playDrawSound = () => {
  const audio = new Audio('/sounds/draw.mp3')
  audio.volume = 0.6
  audio.play().catch((err) => console.error('Draw sound error:', err))
}

const formatTime = (seconds: number): string => {
  // Show infinity symbol for casual games
  if (currentGameTimeControl.value && currentGameTimeControl.value.minutes === 0) {
    return '∞'
  }
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const startTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  
  // Don't start timer for casual games (0 minutes)
  if (currentGameTimeControl.value && currentGameTimeControl.value.minutes === 0) {
    return
  }
  
  timerInterval = setInterval(() => {
    if (!isGameActive.value) {
      if (timerInterval) clearInterval(timerInterval)
      return
    }
    
    if (isMyTurn.value) {
      myTime.value = Math.max(0, myTime.value - 1)
      
      // Play warning sound at 20 seconds
      if (myTime.value === 20 && !lowTimeWarningPlayed.value) {
        playLowTimeWarning()
        lowTimeWarningPlayed.value = true
      }
      
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
  playLoseSound() // Play lose sound when time runs out
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
  lowTimeWarningPlayed.value = false
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

// Material counting
const pieceValues: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0
}

const capturedPieces = computed(() => {
  if (!currentGame.value) return { white: [], black: [] }
  
  const initialPieces: Record<string, number> = {
    p: 8, n: 2, b: 2, r: 2, q: 1, k: 1
  }
  
  const currentPieces = { 
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, 
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } 
  }
  
  // Count current pieces on the board
  const board = chess.value.board()
  board.forEach(row => {
    row.forEach(square => {
      if (square) {
        const color = square.color === 'w' ? 'white' : 'black'
        const piece = square.type
        currentPieces[color][piece]++
      }
    })
  })
  
  // Calculate captured pieces
  const captured = {
    white: [] as string[], // Pieces captured BY white (black pieces taken)
    black: [] as string[]  // Pieces captured BY black (white pieces taken)
  }
  
  // White captured black pieces (black pieces missing from board)
  Object.entries(currentPieces.black).forEach(([piece, remaining]) => {
    const capturedCount = initialPieces[piece] - remaining
    for (let i = 0; i < capturedCount; i++) {
      captured.white.push(piece)
    }
  })
  
  // Black captured white pieces (white pieces missing from board)
  Object.entries(currentPieces.white).forEach(([piece, remaining]) => {
    const capturedCount = initialPieces[piece] - remaining
    for (let i = 0; i < capturedCount; i++) {
      captured.black.push(piece)
    }
  })
  
  return captured
})

const materialAdvantage = computed(() => {
  const captured = capturedPieces.value
  let whiteScore = 0
  let blackScore = 0
  
  captured.white.forEach(piece => {
    whiteScore += pieceValues[piece] || 0
  })
  
  captured.black.forEach(piece => {
    blackScore += pieceValues[piece] || 0
  })
  
  return {
    white: whiteScore - blackScore,
    black: blackScore - whiteScore
  }
})

const isConnecting = ref(false)

const initializeAndConnect = async () => {
  if (isConnecting.value) return
  
  isConnecting.value = true
  try {
    console.log('Auto-initializing...')
    await init()
    console.log('Initialized, connecting to signaling...')
    
    // Connect to ALL signaling servers to discover more peers
    let connectedCount = 0
    const connectionPromises = settings.value.signalingUrls.map(async (url) => {
      try {
        console.log('Attempting to connect to:', url)
        await connect(url)
        connectedCount++
        console.log('Connected to:', url)
      } catch (err) {
        console.warn('Failed to connect to', url, err)
      }
    })
    
    // Wait for all connection attempts to complete
    await Promise.allSettled(connectionPromises)
    
    if (connectedCount === 0) {
      console.error('Failed to connect to any signaling server')
    } else {
      console.log(`Connected to ${connectedCount} signaling server(s)`)
      // Start broadcasting presence when connected
      startPresenceBroadcast()
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
  
  if (success && opponentId.value && currentGame.value) {
    // Add increment to my time
    if (currentGameTimeControl.value) {
      myTime.value += currentGameTimeControl.value.increment
      // Reset warning flag if time goes above 20 again
      if (myTime.value > 20) {
        lowTimeWarningPlayed.value = false
      }
    }
    
    // Advance vector clock for this causal event (move)
    incrementLocalClock()

    const message: ChessMessage = {
      type: 'move',
      gameId: currentGame.value.id,
      data: { from, to },
      // include timer snapshot and vector clock so the peer can reconcile
      timer: {
        whiteTime: myPlayer.value?.color === 'white' ? myTime.value : opponentTime.value,
        blackTime: myPlayer.value?.color === 'black' ? myTime.value : opponentTime.value,
        currentTurn: currentGame.value.currentTurn,
        lastUpdated: Date.now()
      },
      vectorClock: vectorClock.value
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
    
    // Play move sound for takeback
    const audio = new Audio('/sounds/move.mp3')
    audio.volume = 0.6
    audio.play().catch((err) => console.error('Move sound error:', err))
  }
  
  incomingTakebackRequest.value = null
}

const declineTakebackRequest = () => {
  incomingTakebackRequest.value = null
}

const returnToLobby = () => {
  if (timerInterval) clearInterval(timerInterval)
  stopTimerSyncBroadcast()
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
let unsubscribePeerConnect: (() => void) | null = null

const handleMessage = async (event: any) => {
  try {
    const fromPeer = event.from || event.source || event.peer
    
    // Extract content properly - PeerPigeon wraps it in an object
    let content = event.content
    
    if (typeof content === 'object') {
      // Check for encrypted message - check both data and decrypted fields
      if (content.encrypted && content.decrypted) {
        content = content.decrypted
      } else if (content.encrypted && content.data) {
        content = content.data
      } else if (content.message) {
        content = content.message
      } else if (content.broadcast && content.data) {
        content = content.data
      }
    }
    
    // If content is still an object and not a string, it might be the message itself
    if (typeof content === 'object' && content.type) {
      // Content is already the parsed message
    } else if (typeof content !== 'string') {
      // Can't parse this message
      return
    }
    
    // Try to parse as ChessMessage or matchmaking message
    const message: any = typeof content === 'string' ? JSON.parse(content) : content
    
    // Handle peer presence messages
    if (message.type === 'peer_presence') {
      if (message.peerId && message.peerId !== myPeerId.value) {
        allKnownPeers.value.add(message.peerId)
        peerLastSeen.value.set(message.peerId, Date.now())
      }
      return // Don't process further
    }
    
    // Handle matchmaking messages
    if (message.type === 'matchmaking') {
      const senderPeerId = message.peerId || fromPeer
      
      console.log('Matchmaking message received:', {
        senderPeerId,
        myPeerId: myPeerId.value,
        isSearching: isSearching.value,
        message
      })
      
      if (!senderPeerId || senderPeerId === myPeerId.value) {
        console.log('Ignoring own message or message without peer ID')
        return // Ignore our own messages or messages without peer ID
      }
      
      if (message.searching) {
        peerSearchStatus.value.set(senderPeerId, message.timeControl)
        console.log('Peer is searching:', senderPeerId, 'for', message.timeControl)
        
        // Check if we're both searching for the same time control
        await handleMatchmakingMessage(senderPeerId, message.timeControl)
      } else {
        console.log('Peer stopped searching:', senderPeerId)
        peerSearchStatus.value.delete(senderPeerId)
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
          startTimerSyncBroadcast()
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
          startTimerSyncBroadcast()
          
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
          // Process incoming timer sync if present
          if (chessMessage.timer && chessMessage.vectorClock) {
            processIncomingTimer(chessMessage.timer, chessMessage.vectorClock, fromPeer)
          }
        }
        break
        
      case 'timer_sync':
        // Dedicated timer sync message
        if (chessMessage.data && chessMessage.vectorClock) {
          processIncomingTimer(chessMessage.data, chessMessage.vectorClock, fromPeer)
        }
        break
        
      case 'resign':
        // Opponent resigned
        if (currentGame.value) {
          currentGame.value.status = 'finished'
          currentGame.value.result = myPlayer.value?.color || 'white'
          playWinSound() // Play win sound when opponent resigns
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
          playDrawSound() // Play draw sound when draw is accepted
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
  
  // Set up peer connect listener - broadcast search status when new peer connects
  unsubscribePeerConnect = onPeerConnect(async (peerId: string) => {
    console.log('New peer connected:', peerId)
    // If we're currently searching, broadcast our search status to the new peer
    if (isSearching.value) {
      // Small delay to ensure peer is ready to receive messages
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const message = {
        type: 'matchmaking',
        peerId: myPeerId.value,
        searching: true,
        timeControl: selectedTimeControl.value
      }
      try {
        await sendMessage(peerId, JSON.stringify(message))
        console.log('Sent search status to new peer:', peerId)
      } catch (err) {
        console.error('Failed to send search status to new peer:', err)
      }
    }
  })
  
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
  if (unsubscribePeerConnect) {
    unsubscribePeerConnect()
    unsubscribePeerConnect = null
  }
  if (timerInterval) {
    clearInterval(timerInterval)
  }
  stopTimerSyncBroadcast()
  stopPresenceBroadcast()
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

.searching-indicator .waiting-text {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 500;
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

.casual-mode-badge {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 2px solid #fbbf24;
  border-radius: 10px;
  text-align: center;
  font-weight: 600;
  color: #92400e;
  font-size: 0.95rem;
}

.material-section {
  padding: 1rem 0;
  border-bottom: 2px solid #e2e8f0;
}

.material-section h4 {
  margin-bottom: 0.75rem;
  color: var(--dark-color);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.material-display {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.captured-pieces {
  background: #f8fafc;
  border-radius: 8px;
  padding: 0.75rem;
}

.captured-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pieces-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
  min-height: 28px;
}

.captured-piece {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.advantage-score {
  margin-left: 0.5rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: #16a34a;
  background: #dcfce7;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  border: 1px solid #86efac;
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
