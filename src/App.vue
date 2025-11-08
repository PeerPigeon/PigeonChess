<template>
  <div id="app" class="app-container">
    <!-- Header -->
    <header class="app-header">
      <h1>
        <img src="/pigeonlogo.svg" alt="Pigeon" class="pigeon-logo" />
        PigeonChess
        <span class="pawn-icon">♟️</span>
      </h1>
      
      <div class="header-right">
        <div v-if="isAuthenticated" class="user-info">
          <span class="username">👤 {{ identityUsername }}</span>
          <button class="btn-logout" @click="handleLogout" title="Logout">🚪</button>
        </div>
        <button v-else class="btn-login" @click="showLoginModal = true">
          🔑 Login
        </button>
        
        <button class="hamburger-menu" @click="showMenu = !showMenu" :class="{ active: showMenu }">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
      </div>
      
      <!-- Dropdown Menu -->
      <div v-if="showMenu" class="dropdown-menu">
        <button class="menu-item" @click="showHistory = true; showMenu = false">
          📜 History
        </button>
        <button class="menu-item" @click="showSettings = true; showMenu = false">
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
      <span v-if="otherPeersCount > 0" class="peer-count">
        👥 {{ otherPeersCount }} {{ otherPeersCount === 1 ? 'peer' : 'peers' }} online
      </span>
      <span v-else-if="isConnected" class="peer-count">
        Searching for peers...
      </span>
    </div>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Replay Mode Container -->
      <div v-if="isReplayMode && replayGame" class="replay-container">
        <!-- Game Screen (reused from below) -->
        <div class="game-screen">
          <div class="game-info">
            <div class="board-container">
              <ChessBoard 
                :chess="chess"
                :flipped="myPlayer?.color === 'black'"
                :interactive="false"
                :last-move="lastMove"
                :analysis-arrows="analysisArrows"
                :piece-colors="{
                  whiteFill: settings.customWhitePieceColor,
                  blackFill: settings.customBlackPieceColor,
                  whiteStroke: settings.customWhitePieceOutline,
                  blackStroke: settings.customBlackPieceOutline
                }"
                :white-arrow-color="settings.whiteArrowColor"
                :black-arrow-color="settings.blackArrowColor"
                :empty-arrow-color="settings.emptyArrowColor"
                @move="() => {}"
              />
              
              <!-- Move navigation - Portrait mode (below board, small devices) -->
              <div v-if="replayGame.moves && replayGame.moves.length > 0" class="move-navigation-portrait">
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === -1"
                  @click="goToStart"
                  title="Go to start"
                >
                  ⏮
                </button>
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === -1"
                  @click="previousMove"
                  title="Previous move"
                >
                  ◀
                </button>
                <span class="move-counter">
                  {{ viewingMoveIndex === null || viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1 }} / {{ replayGame.moves.length }}
                </span>
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === (replayGame.moves.length - 1)"
                  @click="nextMove"
                  title="Next move"
                >
                  ▶
                </button>
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === (replayGame.moves.length - 1)"
                  @click="goToEnd"
                  title="Go to final position"
                >
                  ⏭
                </button>
              </div>
            </div>
          </div>
          
          <div class="game-controls">
            <!-- Replay Header Info -->
            <div class="replay-info-section">
              <h3>🔍 Game Analysis</h3>
              <div class="replay-details">
                <span class="replay-result" :class="replayGame.result">{{ replayGame.result.toUpperCase() }}</span>
                <div class="replay-players">
                  <span class="replay-player">
                    ⚪ {{ replayGame.myColor === 'white' ? ((replayGame.myUsername?.trim()) || formatPeerId(replayGame.myPeerId || 'Unknown')) : (replayGame.isAI ? '🤖 AI - ' + ['Easy', 'Medium', 'Hard', 'Very Hard'][replayGame.aiDifficulty || 0] : ((replayGame.opponentUsername?.trim()) || formatPeerId(replayGame.opponent))) }}
                  </span>
                  <span class="vs-text">vs</span>
                  <span class="replay-player">
                    ⚫ {{ replayGame.myColor === 'black' ? ((replayGame.myUsername?.trim()) || formatPeerId(replayGame.myPeerId || 'Unknown')) : (replayGame.isAI ? '🤖 AI - ' + ['Easy', 'Medium', 'Hard', 'Very Hard'][replayGame.aiDifficulty || 0] : ((replayGame.opponentUsername?.trim()) || formatPeerId(replayGame.opponent))) }}
                  </span>
                </div>
                <span class="replay-date">{{ new Date(replayGame.date).toLocaleDateString() }}</span>
              </div>
              <button class="primary" @click="exitReplayMode">← Back to Menu</button>
            </div>
            
            <!-- Replay mode controls -->
            <div class="quick-actions">
              <button 
                class="action-icon analysis-toggle" 
                :class="{ active: replayShowBestMoves }"
                @click="replayShowBestMoves = !replayShowBestMoves" 
                :title="replayShowBestMoves ? 'Hide Best Moves' : 'Show Best Moves'"
              >
                💡
              </button>
            </div>
            
            <!-- Analysis Mode Indicator -->
            <div v-if="replayShowBestMoves" class="analysis-info">
              <div class="analysis-header">
                💡 Best Moves Shown
              </div>
              <div class="analysis-hint">
                🟢 Best &nbsp;&nbsp; 🟡 Second best &nbsp;&nbsp; 🔴 Third best
              </div>
            </div>
            
            <!-- Move navigation - Landscape mode (below timers, iPhone SE and larger) -->
            <div v-if="replayGame.moves && replayGame.moves.length > 0" class="move-navigation-landscape">
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === -1"
                @click="goToStart"
                title="Go to start"
              >
                ⏮
              </button>
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === -1"
                @click="previousMove"
                title="Previous move"
              >
                ◀
              </button>
              <span class="move-counter">
                {{ viewingMoveIndex === null || viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1 }} / {{ replayGame.moves.length }}
              </span>
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === (replayGame.moves.length - 1)"
                @click="nextMove"
                title="Next move"
              >
                ▶
              </button>
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === (replayGame.moves.length - 1)"
                @click="goToEnd"
                title="Go to final position"
              >
                ⏭
              </button>
            </div>
            
            <div class="player-section">
              <div class="player-info">
                <div class="player-display">
                  <span class="player-display-icon">{{ replayGame.myColor === 'white' ? '♔' : '♚' }}</span>
                  <span class="player-display-color">{{ (replayGame.myUsername?.trim()) || formatPeerId(replayGame.myPeerId || 'Unknown') }}</span>
                  <span class="player-display-color-detail">({{ replayGame.myColor }})</span>
                </div>
                <div class="opponent-display">
                  <span class="opponent-icon">{{ replayGame.myColor === 'white' ? '♚' : '♔' }}</span>
                  <span class="opponent-name">{{ replayGame.isAI ? 'AI' : ((replayGame.opponentUsername?.trim()) || formatPeerId(replayGame.opponent)) }}</span>
                  <span class="opponent-name-detail">{{ replayGame.isAI ? 'Computer' : ((replayGame.opponentUsername?.trim()) ? formatPeerId(replayGame.opponent || 'Unknown') : '') }}</span>
                </div>
              </div>
              <div class="casual-mode-badge">
                🔍 Analysis Mode
              </div>
            </div>
            
            <!-- Material Score -->
            <div v-if="capturedPieces.white.length > 0 || capturedPieces.black.length > 0" class="material-section">
              <h4 class="material-heading">Material</h4>
              <div class="material-display">
                <div v-if="capturedPieces[replayGame.myColor === 'white' ? 'white' : 'black'].length > 0" class="captured-pieces">
                  <div class="captured-label">{{ replayGame.myUsername?.trim() || formatPeerId(replayGame.myPeerId || 'Unknown') }} captured:</div>
                  <div class="pieces-row">
                    <img 
                      v-for="(piece, idx) in capturedPieces[replayGame.myColor === 'white' ? 'white' : 'black']"
                      :key="`my-${idx}`"
                      :src="`/pieces/${replayGame.myColor === 'white' ? 'b' : 'w'}${piece}.svg`" 
                      :alt="piece"
                      class="captured-piece"
                    />
                    <span v-if="materialAdvantage[replayGame.myColor] > 0" class="advantage-score">
                      +{{ materialAdvantage[replayGame.myColor] }}
                    </span>
                  </div>
                </div>
                <div v-if="capturedPieces[replayGame.myColor === 'white' ? 'black' : 'white'].length > 0" class="captured-pieces">
                  <div class="captured-label">{{ replayGame.isAI ? 'AI' : (replayGame.opponentUsername?.trim() || formatPeerId(replayGame.opponent)) }} captured:</div>
                  <div class="pieces-row">
                    <img 
                      v-for="(piece, idx) in capturedPieces[replayGame.myColor === 'white' ? 'black' : 'white']"
                      :key="`opp-${idx}`"
                      :src="`/pieces/${replayGame.myColor === 'white' ? 'w' : 'b'}${piece}.svg`" 
                      :alt="piece"
                      class="captured-piece"
                    />
                    <span v-if="materialAdvantage[replayGame.myColor === 'white' ? 'black' : 'white'] > 0" class="advantage-score">
                      +{{ materialAdvantage[replayGame.myColor === 'white' ? 'black' : 'white'] }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="moves-history">
              <div class="moves-header">
                <h4>Move History</h4>
                <div v-if="replayGame.moves && replayGame.moves.length > 0" class="move-navigation">
                  <button 
                    class="nav-btn"
                    :disabled="viewingMoveIndex === -1"
                    @click="goToStart"
                    title="Go to start"
                  >
                    ⏮
                  </button>
                  <button 
                    class="nav-btn"
                    :disabled="viewingMoveIndex === -1"
                    @click="previousMove"
                    title="Previous move"
                  >
                    ◀
                  </button>
                  <span class="move-counter">
                    {{ viewingMoveIndex === null || viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1 }} / {{ replayGame.moves.length }}
                  </span>
                  <button 
                    class="nav-btn"
                    :disabled="viewingMoveIndex === (replayGame.moves.length - 1)"
                    @click="nextMove"
                    title="Next move"
                  >
                    ▶
                  </button>
                  <button 
                    class="nav-btn"
                    :disabled="viewingMoveIndex === (replayGame.moves.length - 1)"
                    @click="goToEnd"
                    title="Go to end"
                  >
                    ⏭
                  </button>
                </div>
              </div>
              <div class="moves-list">
                <div 
                  v-for="(move, index) in replayGame.moves" 
                  :key="index"
                  class="move-item"
                  :class="{ 'viewing': index === viewingMoveIndex }"
                  @click="goToMove(index)"
                >
                  <span class="move-number">{{ Math.floor(index / 2) + 1 }}{{ index % 2 === 0 ? '.' : '...' }}</span>
                  <span class="move-san">{{ move }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Waiting/Matchmaking Screen -->
      <div v-else-if="!isGameActive && !currentGame" class="welcome-screen">
        <div class="welcome-card card">
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
                  <p class="searching-text">
                    Searching for opponent with {{ selectedTimeControlDisplay }}...
                    <span class="spinner small"></span>
                  </p>
                  <button class="secondary" @click="stopSearching">Cancel</button>
                </div>
              </div>
              
              <!-- AI Opponent Button -->
              <div class="ai-section">
                <h4>AI Difficulty</h4>
                <div class="ai-difficulty-slider">
                  <div class="difficulty-labels">
                    <span>Easy</span>
                    <span>Medium</span>
                    <span>Hard</span>
                    <span>Very Hard</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="3" 
                    step="1"
                    v-model.number="aiDifficulty"
                    class="slider"
                  />
                  <div class="difficulty-description">
                    {{ difficultyDescriptions[aiDifficulty] }}
                  </div>
                </div>
                
                <button 
                  v-if="!isSearching"
                  class="secondary ai-btn"
                  @click="startAIGame"
                >
                  🤖 Play vs AI ({{ ['Easy', 'Medium', 'Hard', 'Very Hard'][aiDifficulty] }})
                </button>
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
              :interactive="isMyTurn && isGameActive && viewingMoveIndex === null"
              :last-move="lastMove"
              :analysis-arrows="analysisArrows"
              :piece-colors="{
                whiteFill: settings.customWhitePieceColor,
                blackFill: settings.customBlackPieceColor,
                whiteStroke: settings.customWhitePieceOutline,
                blackStroke: settings.customBlackPieceOutline
              }"
              :white-arrow-color="settings.whiteArrowColor"
              :black-arrow-color="settings.blackArrowColor"
              :empty-arrow-color="settings.emptyArrowColor"
              @move="handleMove"
            />
            
            <!-- Move navigation - Portrait mode (below board, small devices) -->
            <div v-if="currentGame?.moves && currentGame.moves.length > 0" class="move-navigation-portrait">
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === -1"
                @click="goToStart"
                title="Go to start"
              >
                ⏮
              </button>
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === -1"
                @click="previousMove"
                title="Previous move"
              >
                ◀
              </button>
              <span class="move-counter">
                {{ viewingMoveIndex === null ? (currentGame?.moves.length || 0) : (viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1) }} / {{ currentGame?.moves.length || 0 }}
              </span>
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === null || viewingMoveIndex === (currentGame?.moves.length || 0) - 1"
                @click="nextMove"
                title="Next move"
              >
                ▶
              </button>
              <button 
                class="nav-btn"
                :disabled="viewingMoveIndex === null"
                @click="goToEnd"
                title="Go to current position"
              >
                ⏭
              </button>
            </div>
          </div>
        </div>
        
        <div class="game-controls">
          <!-- Quick Actions - only visible when game is active -->
          <div v-if="currentGame?.status !== 'finished'" class="quick-actions">
            <button class="action-icon" @click="offerDraw" title="Offer Draw">
              🤝
            </button>
            <button class="action-icon" @click="offerTakeback" title="Request Takeback">
              ↩️
            </button>
            <button 
              v-if="isAIGame" 
              class="action-icon analysis-toggle" 
              :class="{ active: showBestMoves }"
              @click="showBestMoves = !showBestMoves" 
              :title="showBestMoves ? 'Hide Best Moves' : 'Show Best Moves'"
            >
              💡
            </button>
            <button class="action-icon danger" @click="handleResign" title="Resign">
              🏳️
            </button>
          </div>
          
          <!-- Turn Indicator -->
          <div v-if="currentGame?.status !== 'finished'" class="turn-indicator">
            <span v-if="isMyTurn" class="your-turn">Your Turn</span>
            <span v-else-if="aiThinking" class="ai-thinking">🤔 AI is thinking...</span>
            <span v-else class="opponent-turn">Opponent's Turn</span>
          </div>
          
          <!-- Analysis Mode Indicator -->
          <div v-if="showBestMoves && isAIGame" class="analysis-info">
            <div class="analysis-header">
              � Best Moves Shown
            </div>
            <div class="analysis-hint">
              🟢 Best &nbsp;&nbsp; 🟡 Second best &nbsp;&nbsp; 🔴 Third best
            </div>
          </div>
          
          <!-- Timers on one line -->
          <div v-if="currentGameTimeControl" class="timers-container">
            <div class="timer-section my-timer" :class="{ active: isMyTurn, 'in-check': isMyKingInCheck }">
              <div class="timer-display">
                <span class="timer-icon">{{ myPlayer?.color === 'white' ? '♔' : '♚' }}</span>
                <span class="timer-label-inline">You:</span>
                <span class="timer-time">{{ formatTime(myTime) }}</span>
              </div>
              <div class="timer-material">
                <div 
                  v-for="(count, piece) in groupedCapturedPieces[myPlayer?.color === 'white' ? 'white' : 'black']"
                  :key="`my-${piece}`"
                  class="piece-stack"
                  :style="{ width: `${20 + (count - 1) * 6}px` }"
                >
                  <img 
                    v-for="n in count"
                    :key="`my-${piece}-${n}`"
                    :src="`/pieces/${myPlayer?.color === 'white' ? 'b' : 'w'}${piece}.svg`" 
                    :alt="String(piece)"
                    class="captured-piece-mini"
                    :class="{ 'black-piece': myPlayer?.color === 'white' }"
                    :style="{ transform: `translateX(${(n - 1) * 6}px)` }"
                  />
                </div>
                <span 
                  v-if="materialAdvantage[myPlayer?.color || 'white'] !== 0"
                  class="material-score"
                  :class="{ 
                    'positive': materialAdvantage[myPlayer?.color || 'white'] > 0,
                    'negative': materialAdvantage[myPlayer?.color || 'white'] < 0
                  }"
                >
                  {{ materialAdvantage[myPlayer?.color || 'white'] > 0 ? '+' : '' }}{{ materialAdvantage[myPlayer?.color || 'white'] }}
                </span>
              </div>
            </div>
            
            <div class="timer-section opponent-timer" :class="{ active: !isMyTurn, 'in-check': isOpponentKingInCheck, 'thinking': aiThinking }">
              <div class="timer-display">
                <span class="timer-icon">{{ myPlayer?.color === 'black' ? '♔' : '♚' }}</span>
                <span class="timer-label-inline">{{ aiThinking ? '🤔 Thinking...' : 'Opp:' }}</span>
                <span class="timer-time">{{ formatTime(opponentTime) }}</span>
              </div>
              <div class="timer-material">
                <div 
                  v-for="(count, piece) in groupedCapturedPieces[myPlayer?.color === 'white' ? 'black' : 'white']"
                  :key="`opp-${piece}`"
                  class="piece-stack"
                  :style="{ width: `${20 + (count - 1) * 6}px` }"
                >
                  <img 
                    v-for="n in count"
                    :key="`opp-${piece}-${n}`"
                    :src="`/pieces/${myPlayer?.color === 'white' ? 'w' : 'b'}${piece}.svg`" 
                    :alt="String(piece)"
                    class="captured-piece-mini"
                    :class="{ 'black-piece': myPlayer?.color === 'black' }"
                    :style="{ transform: `translateX(${(n - 1) * 6}px)` }"
                  />
                </div>
                <span 
                  v-if="materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] !== 0"
                  class="material-score"
                  :class="{ 
                    'positive': materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] > 0,
                    'negative': materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] < 0
                  }"
                >
                  {{ materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] > 0 ? '+' : '' }}{{ materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Move navigation - Landscape mode (below timers, iPhone SE and larger) -->
          <div v-if="currentGame?.moves && currentGame.moves.length > 0" class="move-navigation-landscape">
            <button 
              class="nav-btn"
              :disabled="viewingMoveIndex === -1"
              @click="goToStart"
              title="Go to start"
            >
              ⏮
            </button>
            <button 
              class="nav-btn"
              :disabled="viewingMoveIndex === -1"
              @click="previousMove"
              title="Previous move"
            >
              ◀
            </button>
            <span class="move-counter">
              {{ viewingMoveIndex === null ? (currentGame?.moves.length || 0) : (viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1) }} / {{ currentGame?.moves.length || 0 }}
            </span>
            <button 
              class="nav-btn"
              :disabled="viewingMoveIndex === null || viewingMoveIndex === (currentGame?.moves.length || 0) - 1"
              @click="nextMove"
              title="Next move"
            >
              ▶
            </button>
            <button 
              class="nav-btn"
              :disabled="viewingMoveIndex === null"
              @click="goToEnd"
              title="Go to current position"
            >
              ⏭
            </button>
          </div>
          
          <div class="player-section">
            <div class="player-info">
              <div class="player-display">
                <span class="player-display-icon">{{ myPlayer?.color === 'white' ? '♔' : '♚' }}</span>
                <span class="player-display-color">You</span>
                <span class="player-display-color-detail">({{ myPlayer?.color }})</span>
              </div>
              <div class="opponent-display">
                <span class="opponent-icon">{{ myPlayer?.color === 'white' ? '♚' : '♔' }}</span>
                <span class="opponent-name">{{ isAIGame ? 'AI' : 'Opp' }}</span>
                <span class="opponent-name-detail">{{ isAIGame ? 'Computer' : formatPeerId(opponentId || 'Unknown') }}</span>
              </div>
            </div>
            <div v-if="currentGameTimeControl && currentGameTimeControl.minutes === 0" class="casual-mode-badge">
              ♾️ Casual
            </div>
          </div>
          
          <!-- Material Score -->
          <div v-if="capturedPieces.white.length > 0 || capturedPieces.black.length > 0" class="material-section">
            <h4 class="material-heading">Material</h4>
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
            class="timer-section my-timer old-timer" 
            :class="{ active: isMyTurn }"
            style="display: none;"
          >
            <div class="timer-display">
              <span class="timer-icon">{{ myPlayer?.color === 'white' ? '♔' : '♚' }}</span>
              <span class="timer-time">{{ formatTime(myTime) }}</span>
              <span class="timer-label-inline">You</span>
            </div>
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
          
          <div class="moves-history">
            <div class="moves-header">
              <h4>Move History</h4>
              <div v-if="currentGame?.moves && currentGame.moves.length > 0" class="move-navigation">
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === -1"
                  @click="goToStart"
                  title="Go to start"
                >
                  ⏮
                </button>
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === -1"
                  @click="previousMove"
                  title="Previous move"
                >
                  ◀
                </button>
                <span class="move-counter">
                  {{ viewingMoveIndex === null ? (currentGame?.moves.length || 0) : (viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1) }} / {{ currentGame?.moves.length || 0 }}
                </span>
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === null || viewingMoveIndex === (currentGame?.moves.length || 0) - 1"
                  @click="nextMove"
                  title="Next move"
                >
                  ▶
                </button>
                <button 
                  class="nav-btn"
                  :disabled="viewingMoveIndex === null"
                  @click="goToEnd"
                  title="Go to current position"
                >
                  ⏭
                </button>
              </div>
            </div>
            <div class="moves-list">
              <div 
                v-for="(move, index) in currentGame?.moves || []" 
                :key="index"
                class="move-item"
                :class="{ 'viewing': index === viewingMoveIndex }"
                @click="goToMove(index)"
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
      @update-arrow-colors="setArrowColors"
      @toggle-sound="toggleSound"
    />
    
    <GameHistory
      v-if="showHistory"
      :game-history="gameHistory"
      @close="showHistory = false"
      @watch="startReplayMode"
    />
    
    <!-- Login/Register Modal -->
    <div v-if="showLoginModal" class="modal-overlay">
      <div class="modal login-modal">
        <h3>{{ loginMode === 'login' ? '🔑 Login' : '✨ Create Account' }}</h3>
        <p v-if="loginMode === 'login'">
          Log in with your PigeonIdP identity to sync your game history across devices.
        </p>
        <p v-else>
          Create a new identity to sync your game history and play with a unique username.
        </p>
        
        <div class="login-form">
          <div class="form-group">
            <label>Username</label>
            <input 
              v-model="loginUsername" 
              type="text" 
              placeholder="Enter username"
              @keyup.enter="handleLogin"
            />
          </div>
          
          <div class="form-group">
            <label>Password</label>
            <input 
              v-model="loginPassword" 
              type="password" 
              placeholder="Enter password"
              @keyup.enter="handleLogin"
            />
          </div>
          
          <p v-if="loginError" class="error-message">{{ loginError }}</p>
          
          <div class="modal-buttons">
            <button class="primary" @click="handleLogin" :disabled="loginLoading || !loginUsername || !loginPassword">
              {{ loginLoading ? '⏳ Please wait...' : (loginMode === 'login' ? 'Login' : 'Create Account') }}
            </button>
            <button class="secondary" @click="showLoginModal = false; loginError = ''">
              Cancel
            </button>
          </div>
          
          <p class="toggle-mode">
            {{ loginMode === 'login' ? "Don't have an account?" : "Already have an account?" }}
            <a href="#" @click.prevent="toggleLoginMode">
              {{ loginMode === 'login' ? 'Create one' : 'Log in' }}
            </a>
          </p>
        </div>
      </div>
    </div>
    
    <!-- Challenge Modal -->
    <div v-if="incomingChallenge" class="modal-overlay">
      <div class="modal challenge-modal">
        <h3>🎮 Incoming Challenge!</h3>
        <p>{{ formatPeerId(incomingChallenge.from) }} wants to play a game.</p>
        <div class="modal-buttons">
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
        <h3>⚠️ Already in Game</h3>
        <p>You are already in an active game. Finish your current game before starting a new one.</p>
        <div class="modal-buttons">
          <button class="primary" @click="showAlreadyInGameModal = false">
            OK
          </button>
        </div>
      </div>
    </div>
    
    <!-- Resign Confirmation Modal -->
    <div v-if="showResignConfirmModal" class="modal-overlay">
      <div class="modal confirm-modal">
        <h3>🏳️ Resign Game?</h3>
        <p>Are you sure you want to resign? This will end the game and count as a loss.</p>
        <div class="modal-buttons">
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
        <h3>🤝 Draw Offered</h3>
        <p>{{ formatPeerId(incomingDrawOffer.from) }} is offering a draw.</p>
        <div class="modal-buttons">
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
        <h3>↩️ Takeback Requested</h3>
        <p>{{ formatPeerId(incomingTakebackRequest.from) }} requests to undo their last move.</p>
        <div class="modal-buttons">
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
        <h3>❌ Challenge Rejected</h3>
        <p>Your challenge was rejected. The player is already in a game.</p>
        <div class="modal-buttons">
          <button class="primary" @click="showChallengeRejectedModal = false">
            OK
          </button>
        </div>
      </div>
    </div>
    
    <!-- Game Abandoned Modal -->
    <div v-if="showAbandonmentModal" class="modal-overlay">
      <div class="modal info-modal">
        <h3>⚠️ Game Abandoned</h3>
        <p v-if="abandonmentReason === 'initial_move_timeout'">
          <strong>{{ iAbandoned ? 'Game Abandoned' : 'You Won!' }}</strong><br>
          {{ iAbandoned ? 'You' : 'Opponent' }} failed to make the first move within the time limit.
        </p>
        <p v-else-if="abandonmentReason === 'peer_disconnect'">
          <strong>{{ iAbandoned ? 'Game Abandoned' : 'You Won!' }}</strong><br>
          {{ iAbandoned ? 'Your' : 'Opponent\'s' }} connection was lost and could not be re-established.
        </p>
        <div class="modal-buttons">
          <button class="primary" @click="showAbandonmentModal = false; abandonmentReason = null; iAbandoned = false">
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
import { useMatchmaking } from './composables/useMatchmaking'
import ChessBoard from './components/ChessBoard.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameHistory from './components/GameHistory.vue'
import MatchmakingLobby from './components/MatchmakingLobby.vue'
import { useChessGame } from './composables/useChessGame'
import { useSettings } from './composables/useSettings'
import { useSounds } from './composables/useSounds'
import { useIdentity } from './composables/useIdentity'
import type { ChessMessage, GameHistoryEntry } from './types'
import { saveToLocalStorage, loadFromLocalStorage } from './utils/helpers'

// Identity
const {
  isAuthenticated,
  username: identityUsername,
  initializeIdP,
  createIdentity,
  loadIdentity,
  logout: logoutIdentity
} = useIdentity()

const showLoginModal = ref(false)
const loginMode = ref<'login' | 'register'>('login')
const loginUsername = ref('')
const loginPassword = ref('')
const loginError = ref('')
const loginLoading = ref(false)

// Settings
const { settings, boardThemes, pieceThemes, addSignalingUrl, removeSignalingUrl, resetToDefaults, setBoardTheme, setCustomColors, setPieceColors, setPieceOutlines, setArrowColors, setPieceTheme, toggleSound } = useSettings()
const showSettings = ref(false)
const showHistory = ref(false)
const showMenu = ref(false)

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
  onPeerConnect,
  dhtPut,
  dhtGet
} = usePeerPigeon({
  // Don't provide a custom peerId - let PeerPigeon generate its own
  networkName: settings.value.networkName,
  maxPeers: 10,
  minPeers: 1,
  enableCrypto: true,
  enableWebDHT: true
})

// Get the actual peer ID from the mesh after initialization
const myPeerId = computed(() => {
  const peerId = mesh.value?.peerId
  if (!peerId) {
    return isInitialized.value ? 'Connecting...' : 'Initializing...'
  }
  return peerId
})

// Time controls
const timeControls = [
  { id: 'any', name: 'Any', display: 'Any Time', minutes: 5, increment: 0 }, // Default to 5+0 if matched
  { id: 'casual', name: 'Casual', display: 'No Time', minutes: 0, increment: 0 },
  { id: 'bullet1', name: 'Bullet', display: '1+0', minutes: 1, increment: 0 },
  { id: 'bullet2', name: 'Bullet', display: '2+0', minutes: 2, increment: 0 },
  { id: 'bullet2-1', name: 'Bullet', display: '2+1', minutes: 2, increment: 1 },
  { id: 'blitz3', name: 'Blitz', display: '3+0', minutes: 3, increment: 0 },
  { id: 'blitz3-1', name: 'Blitz', display: '3+1', minutes: 3, increment: 1 },
  { id: 'blitz5', name: 'Blitz', display: '5+0', minutes: 5, increment: 0 },
  { id: 'blitz5-1', name: 'Blitz', display: '5+1', minutes: 5, increment: 1 },
  { id: 'rapid10', name: 'Rapid', display: '10+0', minutes: 10, increment: 0 },
  { id: 'rapid15', name: 'Rapid', display: '15+10', minutes: 15, increment: 10 },
  { id: 'classical30', name: 'Classical', display: '30+0', minutes: 30, increment: 0 }
]
const selectedTimeControl = ref('any')

// Matchmaking with PigeonMatch
const {
  currentMatch,
  peers,
  inQueue,
  error: matchmakingError,
  stats,
  isMatchReady,
  initialize: initializeMatchmaking,
  joinQueue,
  leaveQueue,
  addPeerToQueue,
  removePeerFromQueue,
  getOpponentFromMatch,
  cleanup: cleanupMatchmaking
} = useMatchmaking({
  namespace: 'chess-game',
  minPeers: 2,
  maxPeers: 2,
  matchTimeout: 30000
})

// Alias for backward compatibility
const isSearching = inQueue

const selectedTimeControlDisplay = computed(() => {
  return timeControls.find(tc => tc.id === selectedTimeControl.value)?.display || ''
})

const selectTimeControl = (controlId: string) => {
  selectedTimeControl.value = controlId
}

const startSearching = async () => {
  if (isGameActive.value) return
  console.log('Starting matchmaking...')
  // Join queue without adding other peers - they'll be added when they send matchmaking messages
  joinQueue()
  
  // Broadcast our search status to all already-connected crypto-ready peers
  const message = {
    type: 'matchmaking',
    peerId: myPeerId.value,
    searching: true,
    timeControl: selectedTimeControl.value
  }
  
  for (const peerId of cryptoReadyPeers) {
    try {
      await sendMessage(peerId, JSON.stringify(message))
      console.log('Sent search status to already-connected peer:', peerId)
    } catch (err) {
      console.error('Failed to send search status to peer:', peerId, err)
    }
  }
}

const stopSearching = async () => {
  console.log('Stopping matchmaking...')
  leaveQueue()
  
  // Broadcast that we stopped searching
  const message = {
    type: 'matchmaking',
    peerId: myPeerId.value,
    searching: false,
    timeControl: null
  }
  
  for (const peerId of cryptoReadyPeers) {
    try {
      await sendMessage(peerId, JSON.stringify(message))
      console.log('Sent stop-searching status to peer:', peerId)
    } catch (err) {
      console.error('Failed to send stop-searching status to peer:', peerId, err)
    }
  }
}

// Watch for match ready and start game
watch(isMatchReady, async (ready) => {
  if (ready && currentMatch.value) {
    console.log('Match ready! Starting game with match:', currentMatch.value)
    
    const opponentPeerId = getOpponentFromMatch()
    if (!opponentPeerId) {
      console.error('No opponent found in match')
      return
    }
    
    // Verify opponent is crypto ready
    if (!cryptoReadyPeers.has(opponentPeerId)) {
      console.error('Opponent not crypto ready yet, canceling match')
      alert('Connection not ready. Please try again.')
      leaveQueue()
      return
    }
    
    // Determine time control - find the selected one or default to casual (no time)
    console.log('Selected time control ID:', selectedTimeControl.value)
    const timeControlObj = timeControls.find(tc => tc.id === selectedTimeControl.value)
    console.log('Found time control object:', timeControlObj)
    
    if (!timeControlObj) {
      console.error('Time control not found! Using casual as fallback')
    }
    
    const finalTimeControl = timeControlObj || timeControls[1] // Default to casual
    currentGameTimeControl.value = {
      minutes: finalTimeControl.minutes,
      increment: finalTimeControl.increment
    }
    
    // Generate game ID
    const gameId = currentMatch.value.id
    
    // Lower peer ID gets white
    const isWhite = myPeerId.value < opponentPeerId
    const whitePlayer = isWhite ? myPeerId.value : opponentPeerId
    const blackPlayer = isWhite ? opponentPeerId : myPeerId.value
    
    // Send gameStart message to opponent
    const gameStartMessage: ChessMessage = {
      type: 'gameStart',
      gameId: gameId,
      data: {
        whitePlayer,
        blackPlayer,
        timeControl: finalTimeControl
      }
    }
    
    try {
      console.log('Sending game start message to:', opponentPeerId)
      await sendMessage(opponentPeerId, JSON.stringify(gameStartMessage))
      console.log('Game start message sent successfully')
      
      // Start the game locally
      resetTimers()
      startNewGame(myPeerId.value, opponentPeerId, isWhite ? 'white' : 'black')
      opponentId.value = opponentPeerId
      hasGameStarted.value = false
      startTimer()
      startTimerSyncBroadcast()
      startInitialMoveTimer()
    } catch (err) {
      console.error('Failed to send game start message:', err)
      alert('Failed to start game with opponent. Please try searching again.')
      leaveQueue()
    }
  }
})

// AI opponent
const isAIGame = ref(false)
const aiDifficulty = ref(1) // 0=Easy, 1=Medium, 2=Hard, 3=Very Hard
const aiThinking = ref(false)
const showBestMoves = ref(false) // Toggle for showing best move arrows
const analysisArrows = ref<Array<{ from: string; to: string; color: string }>>([])
const analysisTopMoves = ref<string[]>([])
const lastAIMoveEval = ref<{ bestMove: string; playerMove: string; evaluation: string } | null>(null)
const { playMoveSound, playCaptureSound, playCastleSound } = useSounds()
const lastMove = ref<{ from: string; to: string } | null>(null)

// Replay mode
const isReplayMode = ref(false)
const replayGame = ref<GameHistoryEntry | null>(null)
const replayShowBestMoves = ref(false)

const difficultyDescriptions: Record<number, string> = {
  0: '😊 Easy - Beginner level (~800-1000 Elo)',
  1: '🤔 Medium - Intermediate player (~1200-1400 Elo)',
  2: '� Hard - Advanced player (~1800-2000 Elo)',
  3: '🏆 Very Hard - Master level (~2500-2800+ Elo)'
}

const startAIGame = () => {
  if (isGameActive.value) return
  
  // Clear last move highlight
  lastMove.value = null
  
  // AI games should not have timers - set to casual mode (0 minutes)
  currentGameTimeControl.value = {
    minutes: 0,
    increment: 0
  }
  resetTimers()
  
  // Set AI flag
  isAIGame.value = true
  setAIOpponent(true, aiDifficulty.value)
  console.log('=== startAIGame: setAIOpponent called with difficulty:', aiDifficulty.value)
  
  // Randomly assign player color
  const playerColor = Math.random() < 0.5 ? 'white' : 'black'
  console.log('Starting AI game - Player color:', playerColor)
  
  // Start game with random color
  startNewGame(myPeerId.value, 'AI-Opponent', playerColor)
  
  // If player is black, AI makes first move
  if (playerColor === 'black') {
    console.log('Player is black, AI will move first')
    setTimeout(() => {
      makeAIMove()
    }, 500)
  } else {
    console.log('Player is white, waiting for player move')
  }
}

// Stockfish AI integration
let stockfish: Worker | null = null
let stockfishReady = false
let stockfishCallback: ((bestMove: string) => void) | null = null
let stockfishAnalysisCallback: ((moves: string[]) => void) | null = null

const initStockfish = async () => {
  if (stockfish) return
  
  try {
    // Load Stockfish from CDN using Web Worker
    const workerBlob = new Blob([`
      importScripts('https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js');
    `], { type: 'application/javascript' })
    
    const workerUrl = URL.createObjectURL(workerBlob)
    stockfish = new Worker(workerUrl)
    
    if (stockfish) {
      stockfish.onmessage = (event: MessageEvent) => {
        const message = event.data
        
        // Log ALL messages from Stockfish when in Very Hard mode
        if (aiDifficulty.value === 3 && !message.includes('multipv')) {
          console.log('SF msg:', message)
        }
        
        if (message === 'uciok') {
          stockfish?.postMessage('isready')
        } else if (message === 'readyok') {
          stockfishReady = true
          console.log('Stockfish ready!')
        } else if (message.startsWith('bestmove')) {
          const match = message.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)
          if (match && stockfishCallback) {
            stockfishCallback(match[1])
            stockfishCallback = null
          }
        } else if (message.startsWith('info') && message.includes('multipv')) {
          // Parse multi-PV analysis for top moves
          console.log('Received multi-PV message:', message)
          // Extract everything after "pv " 
          const pvIndex = message.indexOf(' pv ')
          if (pvIndex !== -1 && stockfishAnalysisCallback) {
            const pvString = message.substring(pvIndex + 4) // +4 to skip " pv "
            const moves = pvString.trim().split(/\s+/).filter((m: string) => m.match(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
            console.log('All moves in PV:', moves)
            // Only pass the first move (the human player's move) from each variation
            if (moves.length > 0 && !message.includes('upperbound') && !message.includes('lowerbound')) {
              console.log('First move (human player):', moves[0])
              stockfishAnalysisCallback([moves[0]])
            }
          }
        }
      }
      
      stockfish.onerror = (error) => {
        console.error('Stockfish worker error:', error)
      }
      
      stockfish.postMessage('uci')
    }
  } catch (err) {
    console.error('Stockfish not available:', err)
  }
}

// Initialize Stockfish on mount
onMounted(() => {
  initStockfish()
})

// Analysis function
const analyzePosition = () => {
  if (!stockfish || !stockfishReady || !chess.value) {
    console.log('Analysis skipped:', { stockfish: !!stockfish, stockfishReady, hasChess: !!chess.value })
    return
  }
  
  const currentFen = chess.value.fen()
  console.log('Starting analysis for position:', currentFen)
  
  // Reset analysis state
  analysisTopMoves.value = []
  analysisArrows.value = []
  
  stockfish.postMessage('stop')
  stockfish.postMessage('ucinewgame')
  stockfish.postMessage('setoption name MultiPV value 3')
  stockfish.postMessage('position fen ' + currentFen)
  stockfish.postMessage('go depth 12')
  
  // Set up callback to handle analysis results
  stockfishAnalysisCallback = (moves: string[]) => {
    console.log('Analysis callback received moves:', moves)
    if (moves.length > 0 && !analysisTopMoves.value.includes(moves[0])) {
      analysisTopMoves.value.push(moves[0])
      
      // Update arrows with top 3 moves (reverse order so best move renders on top)
      const arrows = analysisTopMoves.value.slice(0, 3).map((move, index) => ({
        from: move.substring(0, 2),
        to: move.substring(2, 4),
        color: index === 0 ? '#4ade80' : index === 1 ? '#fbbf24' : '#f87171'
      }))
      
      // Reverse so best move (green) is last and renders on top
      analysisArrows.value = arrows.reverse()
      
      console.log('Updated analysis arrows:', analysisArrows.value)
    }
  }
}

// AI move selection functions (fallback for when Stockfish not available)
const selectEasyMove = (moves: any[], currentFen: string) => {
  // Prefer captures and checks, otherwise random
  const captureMoves = moves.filter(m => m.captured)
  const checkMoves = moves.filter(m => {
    const testChess = new Chess(currentFen)
    testChess.move(m)
    return testChess.inCheck()
  })
  
  if (captureMoves.length > 0 && Math.random() > 0.3) {
    return captureMoves[Math.floor(Math.random() * captureMoves.length)]
  }
  if (checkMoves.length > 0 && Math.random() > 0.5) {
    return checkMoves[Math.floor(Math.random() * checkMoves.length)]
  }
  return moves[Math.floor(Math.random() * moves.length)]
}

const selectMediumMove = (moves: any[], currentFen: string) => {
  // Score moves based on captures, checks, and center control
  const scoredMoves = moves.map(move => {
    let score = 0
    const testChess = new Chess(currentFen)
    testChess.move(move)
    
    // Prioritize captures by piece value
    if (move.captured) {
      score += pieceValues[move.captured] * 10
    }
    
    // Bonus for checks
    if (testChess.inCheck()) {
      score += 15
    }
    
    // Bonus for center control (e4, d4, e5, d5)
    const centerSquares = ['e4', 'd4', 'e5', 'd5']
    if (centerSquares.includes(move.to)) {
      score += 5
    }
    
    // Bonus for developing pieces (knights and bishops)
    if ((move.piece === 'n' || move.piece === 'b') && 
        (move.from[1] === '8' || move.from[1] === '7')) {
      score += 3
    }
    
    return { move, score }
  })
  
  // Sort by score and pick from top 3 with some randomness
  scoredMoves.sort((a, b) => b.score - a.score)
  const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length))
  return topMoves[Math.floor(Math.random() * topMoves.length)].move
}

const selectHardMove = (moves: any[], currentFen: string) => {
  // Advanced evaluation with deeper lookahead - simplified to avoid reactivity
  const scoredMoves = moves.map(move => {
    // Create isolated chess instance
    const testChess = new Chess(currentFen)
    testChess.move(move)
    
    let score = 0
    
    // Immediate checkmate - highest priority
    if (testChess.isCheckmate()) {
      return { move, score: 100000 }
    }
    
    // Material evaluation
    if (move.captured) {
      score += pieceValues[move.captured] * 50
      // Good trade bonus
      if (pieceValues[move.piece] < pieceValues[move.captured]) {
        score += 40
      }
      // Bad trade penalty  
      if (pieceValues[move.piece] > pieceValues[move.captured]) {
        score -= 30
      }
    }
    
    // Check evaluation
    if (testChess.inCheck()) {
      score += 50
      
      // Forcing check - opponent has limited options
      const opponentResponses = testChess.moves()
      if (opponentResponses.length < 3) {
        score += 60
      }
      if (opponentResponses.length === 1) {
        score += 100 // Only one legal move
      }
    }
    
    // Look ahead - evaluate opponent's best counter
    const opponentMoves = testChess.moves({ verbose: true })
    let worstCaseScore = 0
    let opponentBestCapture = 0
    
    // Check first 12 opponent moves for performance
    for (let i = 0; i < Math.min(12, opponentMoves.length); i++) {
      const oppMove = opponentMoves[i]
      if (oppMove.captured) {
        const captureValue = pieceValues[oppMove.captured]
        if (captureValue > opponentBestCapture) {
          opponentBestCapture = captureValue
        }
      }
    }
    
    // Heavily penalize if we're hanging a piece
    if (opponentBestCapture > 0) {
      score -= opponentBestCapture * 45
    }
    
    // Mobility bonus
    score += opponentMoves.length * 0.5
    
    // Castling bonus
    if (move.flags.includes('k') || move.flags.includes('q')) {
      score += 50
    }
    
    // Piece-specific evaluation
    const toRank = parseInt(move.to[1])
    const toFile = move.to[0]
    const fromRank = parseInt(move.from[1])
    
    if (move.piece === 'n' || move.piece === 'b') {
      // Development from back rank
      if (fromRank === 8 || fromRank === 7) {
        score += 20
      }
      
      // Center squares for knights and bishops
      const centerFiles = ['c', 'd', 'e', 'f']
      const centerRanks = [4, 5, 6]
      if (centerFiles.includes(toFile) && centerRanks.includes(toRank)) {
        score += 25
      }
    }
    
    if (move.piece === 'r') {
      // Rook on 7th rank
      if (toRank === 2) {
        score += 35
      }
      
      // Rook on open/semi-open files (simplified check)
      if (toFile === 'c' || toFile === 'd' || toFile === 'e') {
        score += 12
      }
    }
    
    if (move.piece === 'q') {
      const moveNum = testChess.moveNumber()
      if (moveNum < 8) {
        score -= 35 // Penalize early queen moves
      } else {
        score += 15 // Queen is powerful in midgame
      }
    }
    
    if (move.piece === 'p') {
      // Advancing pawns
      score += (8 - toRank) * 8
      
      // Center pawns
      if (toFile === 'd' || toFile === 'e') {
        score += 15
      }
      
      // Advanced pawns near promotion
      if (toRank <= 3) {
        score += (8 - toRank) * 20
      }
      if (toRank === 2) {
        score += 80 // Almost promoting
      }
    }
    
    if (move.piece === 'k') {
      const moveNum = testChess.moveNumber()
      // Penalize moving king in opening (unless castling)
      if (moveNum < 15 && !move.flags.includes('k') && !move.flags.includes('q')) {
        score -= 40
      }
      // Keep king on back rank early
      if (moveNum < 20 && toRank < 7) {
        score -= 25
      }
    }
    
    // Center control bonus
    const centerSquares = ['d4', 'e4', 'd5', 'e5']
    if (centerSquares.includes(move.to)) {
      score += 18
    }
    
    return { move, score }
  })
  
  // Sort and pick best move
  scoredMoves.sort((a, b) => b.score - a.score)
  
  // Always pick the best move (deterministic)
  return scoredMoves[0].move
}

const makeAIMove = () => {
  if (!isAIGame.value || !isGameActive.value) return
  
  // AI plays the opposite color of the player
  const aiColor = myPlayer.value?.color === 'white' ? 'b' : 'w'
  if (chess.value.turn() !== aiColor) return
  
  // Clear analysis arrows when AI starts thinking
  analysisArrows.value = []
  analysisTopMoves.value = []
  
  // Set thinking indicator
  aiThinking.value = true
  
  // Get all legal moves
  const moves = chess.value.moves({ verbose: true })
  
  if (moves.length === 0) {
    aiThinking.value = false
    return
  }
  
  // Get current position once to avoid reactivity issues
  const currentFen = chess.value.fen()
  
  // Try to use Stockfish if available
  if (stockfish && stockfishReady) {
    console.log('Using Stockfish for AI move, difficulty:', aiDifficulty.value)
    
    // Set the callback first
    stockfishCallback = (bestMove: string) => {
      console.log('Stockfish returned best move:', bestMove, 'for position:', currentFen)
      const delay = 300 + Math.random() * 500
      setTimeout(() => {
        if (!isAIGame.value || !isGameActive.value) {
          aiThinking.value = false
          return
        }
        
        try {
          const moveResult = chess.value.move({
            from: bestMove.substring(0, 2),
            to: bestMove.substring(2, 4),
            promotion: bestMove.length > 4 ? bestMove[4] : 'q'
          })
          
          if (moveResult) {
            aiThinking.value = false
            lastMove.value = { from: moveResult.from, to: moveResult.to }
            
            // Clear any analysis arrows after AI moves
            analysisArrows.value = []
            analysisTopMoves.value = []
            
            if (moveResult.captured) {
              playCaptureSound()
            } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
              playCastleSound()
            } else {
              playMoveSound()
            }
            
            // Update captured pieces
            if (moveResult.captured) {
              if (myPlayer.value?.color === 'white') {
                capturedPieces.value.black.push(moveResult.captured)
              } else {
                capturedPieces.value.white.push(moveResult.captured)
              }
            }
            
            // Record move
            if (currentGame.value) {
              currentGame.value.moves.push(moveResult.san)
              currentGame.value.fen = chess.value.fen()
              currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
            }
            
            // Check for game end
            if (chess.value.isGameOver()) {
              console.log('=== AI game ended, calling endGame() ===')
              // Call endGame to properly save the game to history
              // This will handle setting game status, result, and saving to history with AI info
              endGame()
              isAIGame.value = false
            }
          }
        } catch (error) {
          console.error('Error making AI move:', error)
          aiThinking.value = false
        }
      }, delay)
    }
    
    // Map difficulty to Stockfish settings
    const skillLevel = aiDifficulty.value === 0 ? 0 :
                       aiDifficulty.value === 1 ? 5 :
                       aiDifficulty.value === 2 ? 10 : 20
    const depth = aiDifficulty.value === 0 ? 1 : 
                  aiDifficulty.value === 1 ? 5 :
                  aiDifficulty.value === 2 ? 10 : 18
    
    // Apply same logic for all difficulties - set options BEFORE ucinewgame
    console.log(`Difficulty ${aiDifficulty.value}: Configuring Stockfish with Skill Level ${skillLevel}`)
    stockfish.postMessage('setoption name Skill Level value ' + skillLevel)
    stockfish.postMessage('setoption name UCI_LimitStrength value false')
    stockfish.postMessage('isready')
    
    // Wait a moment for options to be set
    setTimeout(() => {
      if (!stockfish) return
      console.log(`Starting analysis at depth ${depth} for position:`, currentFen)
      stockfish.postMessage('ucinewgame')
      stockfish.postMessage('position fen ' + currentFen)
      stockfish.postMessage('go depth ' + depth)
    }, 50)
    return
  }
  
  // Fallback to old AI if Stockfish not available
  // Select move based on difficulty
  let selectedMove
  
  switch (aiDifficulty.value) {
    case 0: // Easy
      selectedMove = selectEasyMove(moves, currentFen)
      break
    case 1: // Medium
      selectedMove = selectMediumMove(moves, currentFen)
      break
    case 2: // Hard
    case 3: // Very Hard
      selectedMove = selectHardMove(moves, currentFen)
      break
    default:
      selectedMove = moves[Math.floor(Math.random() * moves.length)]
  }
  
  // Delay AI move slightly for realism (300-800ms)
  const delay = 300 + Math.random() * 500
  
  setTimeout(() => {
    if (!isAIGame.value || !isGameActive.value) {
      aiThinking.value = false
      return
    }
    
    // AI plays the opposite color of the player
    const aiColor = myPlayer.value?.color === 'white' ? 'b' : 'w'
    if (chess.value.turn() !== aiColor) {
      aiThinking.value = false
      return
    }
    
    try {
      // Make the move
      const moveResult = chess.value.move({
        from: selectedMove.from,
        to: selectedMove.to,
        promotion: selectedMove.promotion || 'q'
      })
      
      if (moveResult) {
        aiThinking.value = false
        // Track the last move for highlighting
        lastMove.value = { from: selectedMove.from, to: selectedMove.to }
        
        // Play appropriate sound
        if (moveResult.captured) {
          playCaptureSound()
        } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
          playCastleSound()
        } else {
          playMoveSound()
        }
        
        // Update captured pieces
        if (moveResult.captured) {
          // AI captures player's piece
          if (myPlayer.value?.color === 'white') {
            capturedPieces.value.black.push(moveResult.captured)
          } else {
            capturedPieces.value.white.push(moveResult.captured)
          }
        }
        
        // Record move
        if (currentGame.value) {
          currentGame.value.moves.push(moveResult.san)
          currentGame.value.fen = chess.value.fen()
          currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
          
          // Start timer for player
          if (currentGameTimeControl.value && currentGameTimeControl.value.minutes > 0) {
            // Add increment to AI's time (black)
            opponentTime.value += currentGameTimeControl.value.increment
            startTimer()
          }
        }
        
        // Check for game end conditions
        if (chess.value.isCheckmate()) {
          console.log('=== AI caused checkmate (fallback), calling endGame() ===')
          endGame()
          isAIGame.value = false
        } else if (chess.value.isDraw()) {
          console.log('=== AI caused draw (fallback), calling endGame() ===')
          endGame()
          isAIGame.value = false
        }
      }
    } catch (err) {
      console.error('AI move error:', err)
      aiThinking.value = false
    }
  }, delay)
}


const broadcastSearchStatus = async () => {
  const actualPeerId = mesh.value?.peerId
  if (!actualPeerId) {
    console.log('Skipping broadcast - peer ID not ready')
    return
  }
  
  const message = {
    type: 'matchmaking',
    peerId: actualPeerId,
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
const allKnownPeers = ref<Set<string>>(new Set(loadFromLocalStorage<string[]>('known-peers', [])))
const peerLastSeen = ref<Map<string, number>>(new Map(Object.entries(loadFromLocalStorage<Record<string, number>>('peer-last-seen', {}))))

// Computed: peer count excluding self
const otherPeersCount = computed(() => {
  let count = allKnownPeers.value.size
  if (allKnownPeers.value.has(myPeerId.value)) {
    count--
  }
  return count
})

// Clean up stale peers every 10 seconds
let staleCheckInterval: ReturnType<typeof setInterval> | null = null

const cleanupStalePeers = () => {
  const now = Date.now()
  const staleThreshold = 15000 // 15 seconds
  
  for (const [peerId, lastSeen] of peerLastSeen.value.entries()) {
    if (peerId && now - lastSeen > staleThreshold) {
      allKnownPeers.value.delete(peerId)
      peerLastSeen.value.delete(peerId)
      peerSearchStatus.value.delete(peerId)
      console.log('Removed stale peer:', peerId)
    }
  }
}

// Watch and save known peers to localStorage
watch([allKnownPeers, peerLastSeen], () => {
  // Save known peers as array
  saveToLocalStorage('known-peers', Array.from(allKnownPeers.value))
  
  // Save peer last seen as object
  const lastSeenObj: Record<string, number> = {}
  for (const [peerId, timestamp] of peerLastSeen.value.entries()) {
    lastSeenObj[peerId] = timestamp
  }
  saveToLocalStorage('peer-last-seen', lastSeenObj)
}, { deep: true })

// Broadcast peer presence every 5 seconds
let presenceInterval: ReturnType<typeof setInterval> | null = null

const broadcastPresence = async () => {
  const actualPeerId = mesh.value?.peerId
  if (!actualPeerId || !mesh.value) return
  
  const message = {
    type: 'peer_presence',
    peerId: actualPeerId,
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
  const actualPeerId = mesh.value?.peerId
  if (actualPeerId) {
    allKnownPeers.value.add(actualPeerId)
    peerLastSeen.value.set(actualPeerId, Date.now())
  }
  
  // Sync connected peers from mesh to known peers
  syncConnectedPeers()
  
  // Broadcast immediately
  broadcastPresence()
  
  // Then every 5 seconds
  presenceInterval = setInterval(() => {
    broadcastPresence()
    syncConnectedPeers() // Also sync connected peers regularly
  }, 5000)
  
  // Start stale peer cleanup
  staleCheckInterval = setInterval(cleanupStalePeers, 10000)
}

// Sync connected peers from PeerPigeon mesh
const syncConnectedPeers = () => {
  if (!mesh.value) return
  
  try {
    const connected = connectedPeerIds.value || []
    const now = Date.now()
    
    connected.forEach((peerId: string) => {
      if (peerId && peerId !== myPeerId.value) {
        allKnownPeers.value.add(peerId)
        peerLastSeen.value.set(peerId, now)
        cryptoReadyPeers.add(peerId)
      }
    })
    
    if (connected.length > 0 && allKnownPeers.value.size > 1) {
      console.log('Synced connected peers. Total known:', allKnownPeers.value.size - 1) // -1 for self
    }
  } catch (err) {
    console.error('Error syncing connected peers:', err)
  }
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
  setOnGameEndCallback,
  setAIOpponent,
  endGame,
  loadHistoryFromDHT
} = useChessGame({
  dhtPut,
  dhtGet,
  peerId: computed(() => mesh.value?.peerId).value,
  username: () => identityUsername.value
})

// Set up the game end callback to play win/lose sounds
setOnGameEndCallback((result) => {
  // Clear abandonment timers when game ends
  clearAbandonmentTimers()
  
  if (result === 'win') {
    playWinSound()
  } else if (result === 'loss') {
    playLoseSound()
  } else if (result === 'draw') {
    playDrawSound()
  }
})

// Move navigation for reviewing game history
const viewingMoveIndex = ref<number | null>(null) // null = viewing current position
const viewingChess = ref<Chess | null>(null) // separate chess instance for viewing

const goToMove = (moveIndex: number) => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  
  // Create a new chess instance for viewing
  viewingChess.value = new Chess()
  
  // Play moves up to the selected index
  for (let i = 0; i <= moveIndex; i++) {
    viewingChess.value.move(moves[i])
  }
  
  // Update the main chess ref to show this position
  chess.value = viewingChess.value
  viewingMoveIndex.value = moveIndex
}

const nextMove = () => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  const nextIndex = viewingMoveIndex.value === null ? 0 : viewingMoveIndex.value + 1
  if (nextIndex < moves.length) {
    goToMove(nextIndex)
  }
}

const previousMove = () => {
  if (viewingMoveIndex.value === null || viewingMoveIndex.value <= 0) {
    goToStart()
  } else {
    goToMove(viewingMoveIndex.value - 1)
  }
}

const goToStart = () => {
  viewingChess.value = new Chess()
  chess.value = viewingChess.value
  viewingMoveIndex.value = -1
}

const goToEnd = () => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  
  // Restore the actual game position
  viewingChess.value = null
  viewingMoveIndex.value = isReplayMode.value && replayGame.value ? replayGame.value.moves.length - 1 : null
  
  // Recreate the chess instance from moves
  const tempChess = new Chess()
  for (const move of moves) {
    tempChess.move(move)
  }
  chess.value = tempChess
}

// Watch for new moves - automatically go to current position when moves are made
watch(() => currentGame.value?.moves.length, () => {
  if (viewingMoveIndex.value !== null) {
    // Automatically go to the latest move when a new move is made
    goToEnd()
  }
})

// Watch for best moves toggle and position changes
watch([showBestMoves, replayShowBestMoves, () => chess.value?.fen(), aiThinking, isMyTurn, isReplayMode], () => {
  const shouldShowBestMoves = isReplayMode.value ? replayShowBestMoves.value : showBestMoves.value
  
  console.log('Best moves watcher triggered:', {
    shouldShowBestMoves,
    isReplayMode: isReplayMode.value,
    isAIGame: isAIGame.value,
    isGameActive: isGameActive.value,
    aiThinking: aiThinking.value,
    isMyTurn: isMyTurn.value,
    fen: chess.value?.fen()
  })
  
  // Clear arrows if best moves not enabled
  if (!shouldShowBestMoves) {
    console.log('Clearing analysis arrows')
    analysisArrows.value = []
    analysisTopMoves.value = []
    if (stockfish) {
      stockfish.postMessage('stop')
    }
    return
  }
  
  // For replay mode, show best moves for any position
  if (isReplayMode.value) {
    console.log('Analyzing position in replay mode')
    analyzePosition()
    return
  }
  
  // For AI games, only show best moves when it's the human player's turn AND not AI thinking
  if (!isAIGame.value || !isGameActive.value || aiThinking.value || !isMyTurn.value) {
    console.log('Clearing analysis arrows')
    analysisArrows.value = []
    analysisTopMoves.value = []
    if (stockfish) {
      stockfish.postMessage('stop')
    }
    return
  }
  
  // All conditions met - analyze position for human player
  console.log('Analyzing position for human player')
  analyzePosition()
})

// Check state
const isInCheck = computed(() => {
  if (!currentGame.value) return { white: false, black: false }
  return {
    white: chess.value.turn() === 'w' && chess.value.isCheck(),
    black: chess.value.turn() === 'b' && chess.value.isCheck()
  }
})

const isMyKingInCheck = computed(() => {
  if (!myPlayer.value) return false
  return isInCheck.value[myPlayer.value.color]
})

const isOpponentKingInCheck = computed(() => {
  if (!myPlayer.value) return false
  const opponentColor = myPlayer.value.color === 'white' ? 'black' : 'white'
  return isInCheck.value[opponentColor]
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

// Abandonment timer state
let initialMoveTimer: ReturnType<typeof setTimeout> | null = null
let peerDisconnectTimer: ReturnType<typeof setTimeout> | null = null
const hasGameStarted = ref(false) // Tracks if first move has been made
const abandonmentReason = ref<'initial_move_timeout' | 'peer_disconnect' | null>(null)
const showAbandonmentModal = ref(false)
const iAbandoned = ref(false) // Track if I was the one who abandoned

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

  // Skip sending for AI games
  if (isAIGame.value) return

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

// Abandonment timer functions
const clearAbandonmentTimers = () => {
  if (initialMoveTimer) {
    clearTimeout(initialMoveTimer)
    initialMoveTimer = null
  }
  if (peerDisconnectTimer) {
    clearTimeout(peerDisconnectTimer)
    peerDisconnectTimer = null
  }
}

const startInitialMoveTimer = () => {
  // Clear any existing timer
  if (initialMoveTimer) clearTimeout(initialMoveTimer)
  
  // Skip for casual games (no time control)
  if (!currentGameTimeControl.value || currentGameTimeControl.value.minutes === 0) {
    return
  }
  
  // Determine abandonment threshold based on time control category
  const timeControlMinutes = currentGameTimeControl.value.minutes
  let abandonmentThreshold: number
  
  if (timeControlMinutes <= 5) {
    // Bullet/Blitz (up to and including 5 minutes)
    abandonmentThreshold = 60 // 60 seconds (1 minute)
  } else if (timeControlMinutes <= 15) {
    // Rapid (6-15 minutes)
    abandonmentThreshold = 120 // 2 minutes
  } else {
    // Classical (> 15 minutes)
    abandonmentThreshold = 300 // 5 minutes
  }
  
  const abandonmentMs = abandonmentThreshold * 1000
  
  console.log(`Starting initial move timer: ${abandonmentThreshold}s for ${timeControlMinutes}-minute game`)
  
  initialMoveTimer = setTimeout(() => {
    console.log('Initial move timer fired. hasGameStarted:', hasGameStarted.value, 'isGameActive:', isGameActive.value)
    if (!hasGameStarted.value && isGameActive.value) {
      console.log('Initial move timeout - abandoning game')
      abandonGame('initial_move_timeout')
    } else {
      console.log('Not abandoning - game has started or is not active')
    }
  }, abandonmentMs)
}

const abandonGame = async (reason: 'initial_move_timeout' | 'peer_disconnect') => {
  if (!currentGame.value || !myPlayer.value) return
  
  // NEVER abandon casual games (no timer)
  if (!currentGameTimeControl.value || currentGameTimeControl.value.minutes === 0) {
    console.log('Skipping abandonment for casual game (no timer)')
    return
  }
  
  console.log('Abandoning game due to:', reason)
  
  // Clear all timers
  clearAbandonmentTimers()
  if (timerInterval) clearInterval(timerInterval)
  
  // Set abandonment info
  abandonmentReason.value = reason
  showAbandonmentModal.value = true
  iAbandoned.value = true // I am the one abandoning
  
  // Update game state - opponent wins by abandonment
  if (currentGame.value && myPlayer.value) {
    currentGame.value.result = myPlayer.value.color === 'white' ? 'black' : 'white'
    console.log('I abandoned the game, calling endGame()')
    endGame()
  }
  
  // Send abandon message to opponent (skip for AI games)
  if (opponentId.value && !isAIGame.value) {
    try {
      const message: ChessMessage = {
        type: 'abandon',
        gameId: currentGame.value.id,
        reason: reason
      }
      await sendMessage(opponentId.value, JSON.stringify(message))
    } catch (err) {
      console.error('Failed to send abandon message:', err)
    }
  }
}

const handleOpponentDisconnect = (disconnectedPeerId: string) => {
  // Only start timer if this is our opponent and game is active
  if (disconnectedPeerId === opponentId.value && isGameActive.value) {
    console.log('Opponent disconnected during active game')
    
    // NEVER abandon casual games (no timer)
    if (!currentGameTimeControl.value || currentGameTimeControl.value.minutes === 0) {
      console.log('Casual game - not starting disconnect timer')
      return
    }
    
    console.log('Starting disconnect timer')
    
    // Clear any existing timer
    if (peerDisconnectTimer) clearTimeout(peerDisconnectTimer)
    
    // Wait 30 seconds for reconnection
    const disconnectThreshold = 30000 // 30 seconds
    
    peerDisconnectTimer = setTimeout(() => {
      if (isGameActive.value && opponentId.value === disconnectedPeerId) {
        console.log('Opponent still disconnected after timeout - abandoning game')
        abandonGame('peer_disconnect')
      }
    }, disconnectThreshold)
  }
}

const handleOpponentReconnect = (reconnectedPeerId: string) => {
  // Clear disconnect timer if opponent reconnects
  if (reconnectedPeerId === opponentId.value && peerDisconnectTimer) {
    console.log('Opponent reconnected, clearing disconnect timer')
    clearTimeout(peerDisconnectTimer)
    peerDisconnectTimer = null
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

const materialScore = computed(() => {
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
    white: whiteScore,
    black: blackScore
  }
})

const groupedCapturedPieces = computed(() => {
  const captured = capturedPieces.value
  const groupPieces = (pieces: string[]) => {
    const grouped: { [key: string]: number } = {}
    pieces.forEach(piece => {
      grouped[piece] = (grouped[piece] || 0) + 1
    })
    return grouped
  }
  
  return {
    white: groupPieces(captured.white),
    black: groupPieces(captured.black)
  }
})

const isConnecting = ref(false)

// Exponential backoff retry state
const retryAttempts = ref(0)
const maxRetryAttempts = 10
const baseRetryDelay = 1000 // 1 second
let retryTimeout: ReturnType<typeof setTimeout> | null = null

const calculateRetryDelay = (attempt: number): number => {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s... capped at 60s
  const delay = Math.min(baseRetryDelay * Math.pow(2, attempt), 60000)
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1)
  return Math.floor(delay + jitter)
}

// Identity/Login handlers
const toggleLoginMode = () => {
  loginMode.value = loginMode.value === 'login' ? 'register' : 'login'
  loginError.value = ''
}

const handleLogin = async () => {
  if (!loginUsername.value || !loginPassword.value) return
  
  loginLoading.value = true
  loginError.value = ''
  
  try {
    if (loginMode.value === 'register') {
      // Create new identity with DHT registration
      await createIdentity(loginUsername.value, loginPassword.value, dhtPut)
      showLoginModal.value = false
      loginUsername.value = ''
      loginPassword.value = ''
      console.log('Identity created successfully!')
    } else {
      // Load existing identity
      await loadIdentity(loginUsername.value, loginPassword.value)
      showLoginModal.value = false
      loginUsername.value = ''
      loginPassword.value = ''
      console.log('Logged in successfully!')
    }
  } catch (error: any) {
    console.error('Login/Register error:', error)
    if (loginMode.value === 'register') {
      loginError.value = 'Failed to create account. Username may already exist.'
    } else {
      loginError.value = 'Invalid username or password.'
    }
  } finally {
    loginLoading.value = false
  }
}

const handleLogout = async () => {
  await logoutIdentity()
  console.log('Logged out')
}

const initializeAndConnect = async () => {
  if (isConnecting.value) return
  
  isConnecting.value = true
  try {
    console.log('Auto-initializing PeerPigeon with WebDHT...')
    await init()
    console.log('PeerPigeon initialized - WebDHT enabled for serverless peer discovery')
    
    // Try to connect to signaling servers to bootstrap faster, but don't require it
    let connectedCount = 0
    const connectionPromises = settings.value.signalingUrls.map(async (url) => {
      try {
        console.log('Attempting to connect to signaling server:', url)
        await connect(url)
        connectedCount++
        console.log('Connected to signaling server:', url)
      } catch (err) {
        console.warn('Failed to connect to signaling server', url, '- WebDHT will handle peer discovery', err)
      }
    })
    
    // Wait for all connection attempts to complete
    await Promise.allSettled(connectionPromises)
    
    if (connectedCount === 0) {
      console.log('No signaling servers connected - relying on WebDHT for serverless peer discovery')
    } else {
      console.log(`Connected to ${connectedCount} signaling server(s) for faster bootstrapping`)
    }
    
    // Reset retry count - we're operational even without signaling servers
    retryAttempts.value = 0
    
    // Start broadcasting presence regardless of signaling server status
    startPresenceBroadcast()
    
    // Initialize matchmaking with our peer ID
    if (mesh.value?.peerId) {
      console.log('Initializing matchmaking with peer ID:', mesh.value.peerId)
      initializeMatchmaking(mesh.value.peerId)
    }
  } catch (err) {
    console.error('Failed to initialize PeerPigeon:', err)
    // Only retry on initialization failure, not signaling failure
    scheduleRetry()
  } finally {
    isConnecting.value = false
  }
}

const scheduleRetry = () => {
  if (retryAttempts.value >= maxRetryAttempts) {
    console.error('Max retry attempts reached. Please check your connection.')
    return
  }
  
  const delay = calculateRetryDelay(retryAttempts.value)
  console.log(`Scheduling reconnection attempt ${retryAttempts.value + 1}/${maxRetryAttempts} in ${delay}ms`)
  
  retryAttempts.value++
  
  if (retryTimeout) clearTimeout(retryTimeout)
  retryTimeout = setTimeout(() => {
    console.log('Retrying connection...')
    initializeAndConnect()
  }, delay)
}

const handleNetworkDisconnect = () => {
  console.log('Network disconnected, scheduling reconnection...')
  scheduleRetry()
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

const handleMove = async (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
  const success = makeMove({ from, to, promotion })
  
  if (success && opponentId.value && currentGame.value) {
    // Track the last move for highlighting
    lastMove.value = { from, to }
    
    // Mark that the game has started (first move made)
    if (!hasGameStarted.value) {
      hasGameStarted.value = true
      // Clear the initial move timer since a move was made
      if (initialMoveTimer) {
        clearTimeout(initialMoveTimer)
        initialMoveTimer = null
      }
    }
    
    // Add increment to my time
    if (currentGameTimeControl.value) {
      myTime.value += currentGameTimeControl.value.increment
      // Reset warning flag if time goes above 20 again
      if (myTime.value > 20) {
        lowTimeWarningPlayed.value = false
      }
    }
    
    // Check for checkmate after player's move
    if (chess.value.isCheckmate()) {
      console.log('=== Player caused checkmate, calling endGame() ===')
      endGame()
      isAIGame.value = false
      return // Exit early, don't send message or trigger AI
    }
    
    // Check for draw after player's move
    if (chess.value.isDraw()) {
      console.log('=== Player caused draw, calling endGame() ===')
      endGame()
      isAIGame.value = false
      return // Exit early
    }
    
    // If playing against AI, trigger AI move
    if (isAIGame.value) {
      makeAIMove()
      return // Don't send network message for AI games
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
  
  // Only send message for human opponents, not AI
  if (opponentId.value && !isAIGame.value) {
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
  
  // For AI games, immediately accept the draw
  if (isAIGame.value) {
    console.log('Draw offered in AI game, calling endGame()')
    // Set result to draw first so endGame knows it's a draw
    if (currentGame.value) {
      currentGame.value.result = 'draw'
    }
    endGame()
    isAIGame.value = false
    return
  }
  
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
  console.log('Accepting draw offer, calling endGame()')
  if (currentGame.value) {
    currentGame.value.result = 'draw'
    endGame()
  }
  
  incomingDrawOffer.value = null
}

const declineDrawOffer = () => {
  incomingDrawOffer.value = null
}

const offerTakeback = async () => {
  if (!opponentId.value) return
  
  // For AI games, immediately take back the move without sending a message
  if (isAIGame.value) {
    if (chess.value && currentGame.value && currentGame.value.moves.length >= 2) {
      // Undo last two moves (AI's move and player's move)
      chess.value.undo() // Undo AI's move
      chess.value.undo() // Undo player's move
      
      // Update game state
      currentGame.value.fen = chess.value.fen()
      currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
      currentGame.value.moves.pop() // Remove AI's move
      currentGame.value.moves.pop() // Remove player's move
      
      // Clear last move highlight
      lastMove.value = null
      
      // Play move sound
      playMoveSound()
      
      console.log('Takeback completed (AI game)')
    }
    return
  }
  
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
  if (chess.value && currentGame.value) {
    chess.value.undo()
    
    // Update game state
    currentGame.value.fen = chess.value.fen()
    currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
    currentGame.value.moves.pop() // Remove last move from history
    
    // Clear last move highlight
    lastMove.value = null
    
    // Play move sound for takeback
    playMoveSound()
  }
  
  incomingTakebackRequest.value = null
}

const declineTakebackRequest = () => {
  incomingTakebackRequest.value = null
}

const returnToLobby = () => {
  if (timerInterval) clearInterval(timerInterval)
  stopTimerSyncBroadcast()
  lastMove.value = null
  resetGame()
}

// Replay mode functions
const startReplayMode = (game: GameHistoryEntry) => {
  console.log('Starting replay mode for game:', game.gameId)
  console.log('Game data:', {
    myUsername: game.myUsername,
    myPeerId: game.myPeerId,
    opponentUsername: game.opponentUsername,
    opponent: game.opponent,
    myColor: game.myColor
  })
  
  // Close the history modal
  showHistory.value = false
  
  // Set replay mode
  isReplayMode.value = true
  replayGame.value = game
  replayShowBestMoves.value = false
  
  // Reset the chess board to starting position
  chess.value = new Chess()
  
  // Create a pseudo game state for display
  currentGame.value = {
    id: game.gameId,
    playerWhite: game.whitePlayer || null,
    playerBlack: game.blackPlayer || null,
    currentTurn: 'white',
    status: 'finished',
    result: game.result === 'win' || game.result === 'loss' || game.result === 'draw' 
      ? (game.result === 'draw' ? 'draw' : game.result === 'win' 
        ? game.myColor : (game.myColor === 'white' ? 'black' : 'white'))
      : 'draw',
    moves: [],
    fen: chess.value.fen(),
    createdAt: game.date,
    finishedAt: game.date
  }
  
  // Set player info for proper board orientation
  myPlayer.value = {
    id: game.myPeerId || 'replay-viewer',
    color: game.myColor
  }
  
  // Set viewing to start position
  viewingMoveIndex.value = -1
  
  // Clear any timers/AI state
  isAIGame.value = false
  aiThinking.value = false
  lastMove.value = null
}

const exitReplayMode = () => {
  isReplayMode.value = false
  replayGame.value = null
  replayShowBestMoves.value = false
  resetGame()
  viewingMoveIndex.value = null
}

const getResultText = (): string => {
  if (!currentGame.value?.result) return 'Draw'
  
  if (currentGame.value.result === 'draw') return 'Draw'
  
  // Check if game was abandoned
  if (abandonmentReason.value) return 'Game Abandoned'
  
  const iWon = currentGame.value.result === myPlayer.value?.color
  return iWon ? 'You Win!' : 'You Lose'
}

// Message handling
let unsubscribeMessage: (() => void) | null = null
let unsubscribePeerConnect: (() => void) | null = null
const cryptoReadyPeers = new Set<string>()

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
      if (message.peerId && message.peerId !== myPeerId.value && typeof message.peerId === 'string' && message.peerId.length > 0) {
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
        
        // If we're also searching and they're crypto ready, add them to our matchmaking queue
        if (inQueue.value && cryptoReadyPeers.has(senderPeerId)) {
          console.log('Both searching - adding peer to matchmaking queue:', senderPeerId)
          addPeerToQueue(senderPeerId, { joinedAt: Date.now() })
        }
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
          hasGameStarted.value = false // Reset for new game
          startTimer()
          startTimerSyncBroadcast()
          startInitialMoveTimer() // Start abandonment timer
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
          
          hasGameStarted.value = false // Reset for new game
          // Start timer
          startTimer()
          startTimerSyncBroadcast()
          startInitialMoveTimer() // Start abandonment timer
          
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
          // Track the last move for highlighting
          lastMove.value = { from: chessMessage.data.from, to: chessMessage.data.to }
          
          // Mark that the game has started (first move received)
          if (!hasGameStarted.value) {
            hasGameStarted.value = true
            // Clear the initial move timer since a move was received
            if (initialMoveTimer) {
              clearTimeout(initialMoveTimer)
              initialMoveTimer = null
            }
          }
          
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
        console.log('Opponent resigned, calling endGame()')
        if (currentGame.value && myPlayer.value) {
          // Set the result before calling endGame so it knows we won
          currentGame.value.result = myPlayer.value.color
          endGame()
        }
        break
        
      case 'draw_offer':
        // Received draw offer
        incomingDrawOffer.value = { from: fromPeer }
        break
        
      case 'draw_accept':
        // Draw was accepted
        console.log('Draw accepted by opponent, calling endGame()')
        if (currentGame.value) {
          currentGame.value.result = 'draw'
          endGame()
        }
        break
        
      case 'takeback_request':
        // Received takeback request
        incomingTakebackRequest.value = { from: fromPeer }
        break
        
      case 'takeback_accept':
        // Takeback was accepted
        if (chess.value && currentGame.value) {
          chess.value.undo()
          
          // Update game state
          currentGame.value.fen = chess.value.fen()
          currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
          currentGame.value.moves.pop() // Remove last move from history
          
          // Clear last move highlight
          lastMove.value = null
        }
        console.log('Takeback accepted by opponent')
        break
      
      case 'abandon':
        // Opponent abandoned the game
        if (currentGame.value && myPlayer.value) {
          console.log('Opponent abandoned game, reason:', chessMessage.reason)
          clearAbandonmentTimers()
          if (timerInterval) clearInterval(timerInterval)
          
          // We win by opponent abandonment
          currentGame.value.result = myPlayer.value.color
          
          // Set the reason for display
          abandonmentReason.value = chessMessage.reason || null
          showAbandonmentModal.value = true
          iAbandoned.value = false // Opponent abandoned, not me
          
          console.log('Opponent abandoned, calling endGame()')
          endGame()
        }
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
    
    // Wait for our own peer ID to be ready
    if (!mesh.value?.peerId) {
      console.log('Skipping - our peer ID not ready yet')
      return
    }
    
    // Mark peer as crypto ready (they connected successfully)
    cryptoReadyPeers.add(peerId)
    
    // Add to known peers immediately for UI display
    allKnownPeers.value.add(peerId)
    peerLastSeen.value.set(peerId, Date.now())
    
    // DON'T add them to matchmaking yet - wait for them to send a matchmaking message
    // Only broadcast our status if we're searching
    
    // If we're currently searching, broadcast our search status to the new peer
    if (isSearching.value) {
      const message = {
        type: 'matchmaking',
        peerId: mesh.value.peerId,
        searching: true,
        timeControl: selectedTimeControl.value
      }
      try {
        // Give a tiny delay for the connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 100))
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
      handleOpponentReconnect(e.peerId)
    })
    
    mesh.value.addEventListener('peerDisconnected', (e: any) => {
      console.log('Peer disconnected:', e.peerId)
      // Remove peer from crypto ready set and matchmaking queue
      cryptoReadyPeers.delete(e.peerId)
      removePeerFromQueue(e.peerId)
      handleOpponentDisconnect(e.peerId)
    })
    
    mesh.value.addEventListener('disconnected', () => {
      console.log('Mesh network disconnected')
      handleNetworkDisconnect()
    })
    
    mesh.value.addEventListener('connected', () => {
      console.log('Mesh network connected')
      // Reset retry count on successful connection
      retryAttempts.value = 0
      if (retryTimeout) {
        clearTimeout(retryTimeout)
        retryTimeout = null
      }
    })
    
    mesh.value.addEventListener('cryptoReady', () => {
      console.log('Crypto system ready')
    })
  }
  
  // Auto-initialize and connect on mount
  await initializeAndConnect()
  
  // Initialize PigeonIdP
  try {
    await initializeIdP()
    console.log('PigeonIdP initialized')
    
    // If a username was found, pre-fill the login form
    if (identityUsername.value && !isAuthenticated.value) {
      loginUsername.value = identityUsername.value
      loginMode.value = 'login'
      showLoginModal.value = true
      console.log('Found stored username, please login with your password')
    }
  } catch (error) {
    console.error('Failed to initialize PigeonIdP:', error)
  }
  
  // Load game history from DHT after mesh is initialized
  setTimeout(async () => {
    try {
      await loadHistoryFromDHT()
    } catch (error) {
      console.error('Failed to load history from DHT on mount:', error)
    }
  }, 2000) // Wait 2 seconds for DHT to be ready
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
  if (retryTimeout) {
    clearTimeout(retryTimeout)
    retryTimeout = null
  }
  clearAbandonmentTimers()
  stopTimerSyncBroadcast()
  stopPresenceBroadcast()
  cleanupMatchmaking()
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
  justify-content: center;
  align-items: center;
  padding: 1.25rem 2rem;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: var(--shadow-md);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  position: relative;
  flex-wrap: wrap;
  z-index: 10000;
}

.app-header h1 {
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, #2563eb, #1e40af);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pigeon-logo {
  width: 2rem;
  height: 2rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.header-right {
  position: absolute;
  right: 2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.username {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-logout, .btn-login {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-logout {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger-color);
}

.btn-logout:hover {
  background: var(--danger-color);
  color: white;
}

.btn-login {
  background: var(--primary-color);
  color: white;
}

.btn-login:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.hamburger-menu {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  z-index: 1001;
  transition: all 0.3s ease;
  width: 2rem;
  height: 2rem;
}

.hamburger-menu:hover {
  transform: scale(1.1);
}

.hamburger-line {
  width: 20px;
  height: 2.5px;
  background: linear-gradient(135deg, #2563eb, #1e40af);
  border-radius: 2px;
  transition: all 0.3s ease;
  margin: 0 auto;
}

.hamburger-menu.active .hamburger-line:nth-child(1) {
  transform: rotate(45deg) translate(5px, 5px);
}

.hamburger-menu.active .hamburger-line:nth-child(2) {
  opacity: 0;
}

.hamburger-menu.active .hamburger-line:nth-child(3) {
  transform: rotate(-45deg) translate(7px, -7px);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 2rem;
  margin-top: 0.5rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 9999;
  min-width: 180px;
  border: 1px solid #e2e8f0;
}

.menu-item {
  width: 100%;
  padding: 1rem 1.5rem;
  background: white;
  border: none;
  text-align: left;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--dark-color);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.menu-item:hover {
  background: #eff6ff;
  color: #2563eb;
}

.menu-item:not(:last-child) {
  border-bottom: 1px solid #f1f5f9;
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

/* Replay Mode Styles */
.replay-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.replay-info-section {
  padding: 1rem;
  background: var(--light-color);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.replay-info-section h3 {
  margin: 0 0 0.75rem 0;
  color: var(--primary-color);
  font-size: 1.25rem;
}

.replay-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.replay-result {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9rem;
  display: inline-block;
  width: fit-content;
}

.replay-result.win {
  background: var(--success-color);
  color: white;
}

.replay-result.loss {
  background: var(--danger-color);
  color: white;
}

.replay-result.draw {
  background: var(--warning-color);
  color: white;
}

.replay-opponent {
  color: var(--secondary-color);
  font-weight: 600;
  font-size: 0.95rem;
}

.replay-players {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: flex-start;
}

.replay-player {
  color: var(--secondary-color);
  font-weight: 600;
  font-size: 0.9rem;
}

.vs-text {
  color: var(--secondary-color);
  font-size: 0.75rem;
  opacity: 0.7;
  margin-left: 0.5rem;
}

.replay-date {
  color: var(--secondary-color);
  font-size: 0.85rem;
}

.welcome-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow: visible;
  min-height: 0;
}

.welcome-card {
  max-width: 600px;
  width: 100%;
  text-align: center;
  overflow: hidden;
  box-sizing: border-box;
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
  width: 100%;
  box-sizing: border-box;
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
  border-top: 4px solid #2563eb;
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

.matchmaking {
  width: 100%;
  box-sizing: border-box;
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
  margin-bottom: 1.5rem;
  margin-top: 0.5rem;
  word-wrap: break-word;
  overflow-wrap: break-word;
  width: 100%;
  box-sizing: border-box;
}

.peer-id code {
  background: #eff6ff;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
  font-size: 0.85rem;
  border: 1px solid #bfdbfe;
  word-break: break-all;
  display: inline-block;
  max-width: 100%;
  box-sizing: border-box;
}

.time-control-section {
  width: 100%;
  max-width: 100%;
  margin: 1.5rem 0;
  padding: 0;
  box-sizing: border-box;
}

.time-control-section h4 {
  margin-bottom: 1rem;
  color: var(--dark-color);
  font-size: 1.1rem;
}

.time-controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
  width: 100%;
}

.time-control-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 0.25rem;
  border: 2px solid #bfdbfe;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  box-sizing: border-box;
  min-height: 65px;
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
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.control-time {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--dark-color);
  margin-top: 0.25rem;
  white-space: nowrap;
}

/* Adjust time controls for small screens */
@media (max-width: 480px) {
  .welcome-screen {
    padding: 0.75rem;
  }
  
  .welcome-card {
    padding: 1rem;
  }
  
  .welcome-card h2 {
    font-size: 1.6rem;
    margin-bottom: 0.6rem;
  }
  
  .welcome-card > p {
    font-size: 0.9rem;
    margin-bottom: 1.75rem;
  }
  
  .matchmaking h3 {
    font-size: 1.4rem;
  }
  
  .time-control-section {
    padding: 0;
    margin: 1rem 0;
  }
  
  .time-controls {
    gap: 0.5rem;
  }
  
  .time-control-btn {
    padding: 0.6rem 0.2rem;
    min-height: 60px;
  }
  
  .control-name {
    font-size: 0.7rem;
  }
  
  .control-time {
    font-size: 0.9rem;
  }
  
  .game-controls {
    padding: 8px;
    gap: 0.5rem;
  }
  
  .action-icon {
    padding: 0.6rem;
    font-size: 1.6rem;
    min-height: 50px;
  }
  
  .turn-indicator {
    font-size: 0.85rem;
    padding: 0.4rem;
  }
  
  .player-section {
    padding-bottom: 0.4rem;
  }
  
  .player-display, .opponent-display {
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
  }
  
  .player-display-icon, .opponent-icon {
    font-size: 0.9rem;
  }
  
  .player-display-color, .opponent-name {
    font-size: 0.75rem;
  }
  
  .player-section h4, .material-section h4 {
    font-size: 0.8rem;
  }
  
  .casual-mode-badge {
    font-size: 0.75rem;
    padding: 0.3rem 0.5rem;
  }
}

/* iPhone SE and very small screens */
@media (max-width: 375px) {
  .welcome-screen {
    padding: 0.5rem;
  }
  
  .welcome-card {
    padding: 0.75rem;
  }
  
  .welcome-card h2 {
    font-size: 1.4rem;
    margin-bottom: 0.5rem;
  }
  
  .welcome-card > p {
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }
  
  .matchmaking h3 {
    font-size: 1.25rem;
    margin-bottom: 0.4rem;
  }
  
  .time-control-section {
    padding: 0;
    margin: 1rem 0;
  }
  
  .time-controls {
    gap: 0.4rem;
  }
  
  .time-control-btn {
    padding: 0.55rem 0.15rem;
    min-height: 58px;
  }
  
  .control-name {
    font-size: 0.65rem;
  }
  
  .control-time {
    font-size: 0.85rem;
  }
  
  .app-header {
    padding: 0.75rem 0.75rem;
  }
  
  .app-header h1 {
    font-size: 1.25rem;
    gap: 0.3rem;
  }
  
  .pigeon-logo {
    width: 1.25rem;
    height: 1.25rem;
  }
  
  .pawn-icon {
    font-size: 1.1rem;
  }
  
  .header-actions button {
    font-size: 0.85rem;
    padding: 0.6rem 0.65rem;
  }
  
  .peer-id {
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }
  
  .peer-id code {
    font-size: 0.7rem;
    padding: 0.25rem 0.4rem;
  }
  
  .control-buttons {
    gap: 0.4rem;
  }
  
  button {
    font-size: 0.9rem;
    padding: 0.8rem 0.85rem;
  }
  
  .search-section {
    margin-top: 1rem;
  }
  
  .game-controls {
    padding: 6px;
    gap: 0.4rem;
  }
  
  .action-icon {
    padding: 0.5rem;
    font-size: 1.4rem;
    min-height: 45px;
  }
  
  .turn-indicator {
    font-size: 0.8rem;
    padding: 0.35rem;
  }
  
  .timer-section {
    padding: 0.35rem 0.6rem;
  }
  
  .timer-icon {
    font-size: 1.1rem;
  }
  
  .timer-time {
    font-size: 1.2rem;
  }
  
  .timer-label-inline {
    font-size: 0.65rem;
  }
  
  .player-section {
    padding-bottom: 0.35rem;
  }
  
  .player-section h4, .material-section h4 {
    font-size: 0.75rem;
    margin-bottom: 0.4rem;
  }
  
  .player-display, .opponent-display {
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
  }
  
  .player-display-icon, .opponent-icon {
    font-size: 0.85rem;
  }
  
  .player-display-color, .opponent-name {
    font-size: 0.7rem;
  }
  
  .casual-mode-badge {
    font-size: 0.7rem;
    padding: 0.25rem 0.4rem;
  }
  
  .captured-piece {
    width: 20px;
    height: 20px;
  }
  
  .turn-indicator {
    font-size: 0.85rem;
    padding: 0.4rem;
  }
  
  .control-buttons button.compact {
    padding: 0.45rem 0.35rem;
    font-size: 0.8rem;
  }
}

.search-section {
  width: 100%;
  max-width: 100%;
  margin-top: 1.5rem;
  box-sizing: border-box;
}

.ai-section {
  width: 100%;
  max-width: 100%;
  margin-top: 1rem;
  box-sizing: border-box;
}

.ai-section h4 {
  font-size: 1rem;
  margin: 0 0 0.75rem 0;
  color: #1e293b;
  text-align: center;
}

.ai-difficulty-slider {
  margin-bottom: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.difficulty-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 5px;
  background: #e2e8f0;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  margin-bottom: 0.75rem;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #6366f1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slider::-webkit-slider-thumb:hover {
  background: #4f46e5;
  transform: scale(1.1);
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #6366f1;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.slider::-moz-range-thumb:hover {
  background: #4f46e5;
  transform: scale(1.1);
}

.difficulty-description {
  font-size: 0.85rem;
  color: #475569;
  text-align: center;
  min-height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-color-selection {
  margin: 1.5rem 0 1rem 0;
}

.ai-color-selection h4 {
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
  color: #334155;
  font-weight: 600;
}

.color-buttons {
  display: flex;
  gap: 0.75rem;
}

.color-btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  color: #475569;
  transition: all 0.2s ease;
}

.color-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.color-btn.active {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 600;
}

.ai-btn {
  width: 100%;
  padding: 1rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 600;
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

.searching-text {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 600;
  color: #2563eb;
  margin: 0;
}

.searching-text .spinner {
  flex-shrink: 0;
  margin: 0;
  display: inline-block;
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

.timers-container {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.75rem;
  width: 100%;
}

.timers-container .timer-section {
  flex: 1;
  min-width: 160px;
  padding: 0.6rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.timers-container .timer-display {
  gap: 0.5rem;
}

.timers-container .timer-icon {
  font-size: 1.3rem;
}

.timers-container .timer-label-inline {
  display: inline;
  font-size: 0.8rem;
}

.timers-container .timer-time {
  font-size: 1.4rem;
}

.timer-material {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  align-items: center;
  justify-content: center;
  min-height: 24px;
}

.piece-stack {
  position: relative;
  display: inline-block;
  height: 20px;
  margin-right: 4px;
}

.piece-stack img {
  position: absolute;
  top: 0;
  left: 0;
}

.captured-piece-mini {
  width: 20px;
  height: 20px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
}

.captured-piece-mini.black-piece {
  filter: drop-shadow(0 0 0 white) 
          drop-shadow(0 0 1px white) 
          drop-shadow(0 0 1px white);
}

.advantage-score-mini {
  font-size: 0.7rem;
  font-weight: 700;
  color: #16a34a;
  margin-left: 0.25rem;
}

.material-score {
  font-size: 0.85rem;
  font-weight: 700;
  color: #64748b;
  margin-left: auto;
  padding-left: 0.5rem;
  min-width: 2rem;
  text-align: right;
}

.material-score.positive {
  color: #16a34a;
}

.material-score.negative {
  color: #dc2626;
}

.material-score:empty::after {
  content: '0';
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

.timer-section.thinking {
  background: #fef3c7;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.3);
  animation: thinkingPulse 1.5s ease-in-out infinite;
}

@keyframes thinkingPulse {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.3);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.5);
  }
}

.timer-section.in-check {
  background: #fee2e2;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.4);
  animation: checkPulse 1s ease-in-out infinite;
}

@keyframes checkPulse {
  0%, 100% {
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.6);
  }
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

.timer-label-inline {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: none;
}

.timer-section.active .timer-label {
  color: #2563eb;
}

.timer-section.active .timer-label-inline {
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
  position: relative;
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

/* Mobile layout adjustments - viewport based detection */
@media (max-width: 1024px) {
  .main-content {
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  .welcome-screen {
    padding: 0.75rem;
    min-height: min-content;
    align-items: flex-start;
  }
  
  .welcome-card {
    padding: 1rem;
    max-width: 100%;
    margin-top: 0;
  }
  
  .welcome-card h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }
  
  .welcome-card > p {
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }
  
  .matchmaking h3 {
    font-size: 1.35rem;
  }

  .game-screen {
    flex-direction: column;
    padding: 0.75rem;
    gap: 0.75rem;
    overflow: visible;
    min-height: auto;
  }

  .board-container {
    order: 1;
    padding: 12px;
    width: 100%;
    height: auto;
  }

  .game-controls {
    order: 2;
    width: 100%;
    padding: 12px;
    border-radius: 12px;
    max-height: none;
    overflow-y: visible;
    overflow-x: hidden;
    gap: 0.75rem;
  }
  
  .quick-actions {
    gap: 0.6rem;
    margin-bottom: 0.25rem;
  }
  
  .action-icon {
    padding: 0.7rem;
    font-size: 1.8rem;
    border-radius: 14px;
    min-height: 55px;
  }
  
  .turn-indicator {
    font-size: 0.9rem;
    padding: 0.5rem;
    margin-bottom: 0rem;
    order: -1;
    display: none;
  }

  .timer-section {
    padding: 0.4rem 0.75rem;
  }
  
  .timer-display {
    gap: 0.5rem;
  }
  
  .timer-icon {
    font-size: 1.25rem;
  }
  
  .timer-time {
    font-size: 1.35rem;
  }
  
  .timer-label {
    display: none;
  }
  
  .timer-label-inline {
    display: inline;
    font-size: 0.7rem;
  }
  
  .player-section {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #e2e8f0;
    display: none;
  }
  
  .timers-container {
    order: 0;
    gap: 0.5rem;
  }
  
  .timers-container .timer-section {
    flex-direction: column;
    gap: 0.3rem;
    min-width: 150px;
    padding: 0.5rem 0.6rem;
  }
  
  .timer-material {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    align-items: center;
    justify-content: center;
    min-height: 20px;
  }
  
  .material-section {
    order: 1;
    display: none;
  }
  
  .material-heading {
    display: none;
  }
  
  .captured-label {
    display: none;
  }
  
  .material-display {
    display: flex;
    gap: 0.4rem;
  }
  
  .captured-pieces {
    background: rgba(255, 255, 255, 0.95);
    padding: 0.4rem 0.6rem;
    border-radius: 8px;
    margin-bottom: 0;
    flex: 1;
  }
  
  .pieces-row {
    gap: 0.2rem;
    justify-content: center;
  }
  
  .moves-history {
    display: none;
  }
  
  .player-section h4 {
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
    display: none;
  }
  
  .player-info {
    gap: 0.5rem;
    flex-direction: row;
  }
  
  .player-display, .opponent-display {
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    flex: 1;
  }
  
  .player-display-icon, .opponent-icon {
    font-size: 1rem;
  }
  
  .player-display-color, .opponent-name {
    font-size: 0.8rem;
  }
  
  .player-display-color-detail,
  .opponent-name-detail {
    display: none;
  }
  
  .material-section {
    padding: 0.5rem 0;
  }
  
  .material-section h4 {
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }
  
  .captured-pieces {
    margin-bottom: 0.4rem;
  }
  
  .captured-label {
    font-size: 0.75rem;
    margin-bottom: 0.25rem;
  }
  
  .captured-piece {
    width: 22px;
    height: 22px;
  }
  
  .advantage-score {
    font-size: 0.75rem;
  }
  
  .casual-mode-badge {
    font-size: 0.7rem;
    padding: 0.4rem 0.6rem;
    margin-top: 0.5rem;
  }
  
  .control-buttons {
    display: none;
  }
  
  .active-controls {
    display: none;
  }
  
  .game-result {
    padding: 0.5rem 0;
  }
  
  .game-result h3 {
    font-size: 1.1rem;
    margin-bottom: 0.4rem;
  }
  
  .result-text {
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  .timer-time {
    font-size: 1.4rem;
  }

  .search-btn, .control-buttons button, .primary, .secondary, .danger {
    width: 100%;
    padding: 0.9rem 1rem;
    font-size: 1rem;
  }
  
  .app-header {
    padding: 0.75rem 0.75rem;
    flex-wrap: wrap;
    gap: 0.25rem;
    min-height: auto;
    flex-direction: column;
    position: relative;
  }
  
  .app-header h1 {
    font-size: 1.35rem;
    flex: none;
    text-align: center;
    margin: 0;
    gap: 0.35rem;
  }
  
  .pigeon-logo {
    width: 1.35rem;
    height: 1.35rem;
  }
  
  .pawn-icon {
    font-size: 1.2rem;
  }
  
  .hamburger-menu {
    right: 0.75rem;
    width: 1.35rem;
    height: 1.35rem;
    gap: 2px;
  }
  
  .hamburger-line {
    width: 16px;
    height: 2px;
  }
  
  .hamburger-menu:hover {
    transform: scale(1.1);
  }
  
  .dropdown-menu {
    right: 0.75rem;
    margin-top: 0.25rem;
  }
  
  .header-actions button {
    flex: 1;
    max-width: 150px;
    font-size: 0.9rem;
    padding: 0.65rem 0.75rem;
  }
  
  .welcome-card h2 {
    font-size: 1.75rem;
  }
  
  .welcome-card > p {
    font-size: 0.95rem;
  }
  
  .peer-id {
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  
  .peer-id code {
    font-size: 0.75rem;
    padding: 0.3rem 0.5rem;
    word-break: break-all;
  }
  
  .time-control-section {
    margin: 1rem 0;
    padding: 0;
  }
  
  .time-controls {
    width: 100%;
  }
  
  .search-section {
    margin-top: 1rem;
  }
  
  .control-buttons {
    flex-direction: column;
    width: 100%;
  }
  
  .control-buttons button {
    width: 100%;
    min-width: 0;
    flex: none;
  }
  
  .challenge-modal .actions,
  .info-modal .actions,
  .confirm-modal .actions,
  .offer-modal .actions {
    flex-direction: column;
    width: 100%;
  }
  
  .challenge-modal .actions button,
  .info-modal .actions button,
  .confirm-modal .actions button,
  .offer-modal .actions button {
    width: 100%;
  }
  
  .status-bar {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    flex-wrap: nowrap;
    gap: 0.5rem;
  }
  
  .status-left {
    gap: 0.35rem;
    flex-shrink: 0;
  }
  
  .status-text {
    font-size: 0.75rem;
  }
  
  .peer-count {
    font-size: 0.75rem;
    white-space: nowrap;
  }
  
  .matchmaking {
    padding: 0;
  }
}

/* Landscape mobile phones and tablets */
@media (max-width: 1024px) and (orientation: landscape) and (max-height: 500px) {
  .game-screen {
    flex-direction: row !important;
    gap: 0.5rem !important;
    padding: 0.5rem !important;
    height: 100vh !important;
    overflow: hidden !important;
  }
  
  .game-info {
    flex: 1 !important;
    height: 100% !important;
    display: flex !important;
    flex-direction: column !important;
  }
  
  .board-container {
    flex: 1 !important;
    width: 100% !important;
    height: 100% !important;
    padding: 0.25rem !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  
  .game-controls {
    width: 240px !important;
    flex-shrink: 0 !important;
    max-height: 100vh !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    max-height: 100%;
    overflow-y: auto;
    padding: 0.25rem;
  }
}

/* Touch device specific adjustments */
@media (hover: none) and (pointer: coarse) {
  button:hover:not(:disabled) {
    transform: none;
  }
  
  button:active:not(:disabled) {
    transform: scale(0.98);
    transition: transform 0.1s;
  }
}

.player-section {
  display: none;
}

.player-section h4 {
  margin-bottom: 0.75rem;
  color: var(--dark-color);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.quick-actions {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.action-icon {
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 0.6rem;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
  flex: 1;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
}

.action-icon:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #cbd5e1;
}

.action-icon:active {
  transform: translateY(0);
}

.action-icon.danger {
  border-color: #fecaca;
}

.action-icon.danger:hover {
  background: #fee;
  border-color: #fca5a5;
}

.action-icon.active {
  background: #dbeafe;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.action-icon.analysis-toggle {
  font-size: 1.3rem;
}

.action-icon.analysis-toggle.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
  animation: pulse-analysis 2s ease-in-out infinite;
}

@keyframes pulse-analysis {
  0%, 100% {
    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.5);
  }
}

.analysis-info {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  text-align: center;
  margin-top: 0.5rem;
}

.analysis-header {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 0.25rem;
}

.analysis-hint {
  font-size: 0.85rem;
  opacity: 0.9;
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
  display: none;
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

.player-display-color-detail,
.opponent-name-detail {
  display: inline;
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
  min-width: 0;
  white-space: nowrap;
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

.ai-thinking {
  color: #f59e0b;
  animation: pulse-thinking 1.5s ease-in-out infinite;
}

@keyframes pulse-thinking {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.moves-history {
  flex: 1;
  overflow-y: auto;
}

.moves-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.moves-history h4 {
  margin: 0;
  color: var(--dark-color);
}

.move-navigation {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: white;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 0.25rem;
}

/* Move navigation - Portrait mode (below board) */
.move-navigation-portrait {
  display: none; /* Hidden by default */
  align-items: center;
  gap: 0.25rem;
  background: white;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 0.25rem;
  margin-top: 0.5rem;
  justify-content: center;
}

/* Show portrait navigation on small devices in portrait mode */
@media (max-width: 820px) and (orientation: portrait) {
  .move-navigation-portrait {
    display: flex !important;
  }
  
  /* Make board container a column so navigation appears BELOW the board */
  .board-container {
    flex-direction: column !important;
    justify-content: flex-start !important;
  }
}

/* Galaxy Fold - reduce CONTAINER height only */
@media (max-width: 380px) and (orientation: portrait) {
  .game-info {
    max-height: 55vh !important;
  }
  
  .board-container {
    max-height: 55vh !important;
  }
  
  .game-controls {
    flex: 1 !important;
    max-height: none !important;
    height: auto !important;
  }
}

/* Move navigation - Landscape mode (below timers) */
.move-navigation-landscape {
  display: none; /* Hidden by default */
  align-items: center;
  gap: 0.25rem;
  background: white;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  padding: 0.25rem;
  margin-top: 0.5rem;
  justify-content: center;
}

/* Show landscape navigation on iPhone SE and larger in landscape mode */
@media (min-width: 568px) and (max-width: 1024px) and (orientation: landscape) and (max-height: 500px) {
  .move-navigation-landscape {
    display: flex !important;
  }
}

.nav-btn {
  background: transparent;
  border: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #2563eb;
  font-size: 1rem;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.nav-btn:hover:not(:disabled) {
  background: #eff6ff;
  color: #1d4ed8;
}

.nav-btn:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}

.move-counter {
  font-size: 0.85rem;
  color: var(--secondary-color);
  font-weight: 600;
  padding: 0 0.5rem;
  min-width: 60px;
  text-align: center;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
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
  cursor: pointer;
}

.move-item:hover {
  background: #eff6ff;
  border-color: #3b82f6;
}

.move-item.viewing {
  background: #dbeafe;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.move-number {
  color: var(--secondary-color);
  margin-right: 0.25rem;
}

.move-san {
  color: var(--dark-color);
  font-weight: bold;
}

/* Responsive adjustments for move navigation */
@media (max-width: 768px) {
  .moves-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  /* Hide desktop move navigation on mobile - use portrait/landscape versions instead */
  .moves-header .move-navigation {
    display: none !important;
  }
  
  .move-counter {
    flex: 1;
  }
}

/* Also hide on tablets and small laptops when either portrait or landscape mobile nav is showing */
@media (max-width: 1024px) and (orientation: landscape) and (max-height: 500px) {
  .moves-header .move-navigation {
    display: none !important;
  }
}

@media (max-width: 820px) and (orientation: portrait) {
  .moves-header .move-navigation {
    display: none !important;
  }
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
.confirm-modal .actions,
.offer-modal .actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.challenge-modal .actions button,
.info-modal .actions button,
.confirm-modal .actions button,
.offer-modal .actions button {
  min-width: 100px;
}

.info-modal,
.confirm-modal,
.offer-modal {
  text-align: center;
}

.login-modal {
  max-width: 400px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  text-align: left;
}

.form-group label {
  font-weight: 600;
  color: var(--text-color);
}

.form-group input {
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.error-message {
  color: var(--danger-color);
  font-size: 0.9rem;
  margin: 0;
  padding: 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 0.5rem;
}

.toggle-mode {
  text-align: center;
  font-size: 0.9rem;
  color: var(--secondary-color);
  margin-top: 0.5rem;
}

.toggle-mode a {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
}

.toggle-mode a:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .game-screen {
    flex-direction: column;
  }
  
  .game-controls {
    width: 100%;
    max-height: 200px;
  }
  
  .header-right {
    position: static;
    margin-left: auto;
  }
  
  .user-info {
    font-size: 0.8rem;
    padding: 0.4rem 0.8rem;
  }
}
</style>

