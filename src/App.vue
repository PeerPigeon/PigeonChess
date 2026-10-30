<template>
  <div id="app" class="app">
    <header class="topbar">
      <div class="brand">
        <img src="/pigeonlogo.svg" alt="" class="brand-mark" />
        <span class="wordmark">PigeonChess</span>
      </div>

      <p class="net" :class="statusClass" role="status">
        <span class="net-dot" aria-hidden="true"></span>
        <span>{{ statusText }}</span>
        <span v-if="isConnected" class="net-peers">
          {{ otherPeersCount }} {{ otherPeersCount === 1 ? 'player' : 'players' }} online
        </span>
      </p>

      <nav class="nav" :class="{ open: showMenu }">
        <button class="nav-link" @click="startPuzzleMode(); showMenu = false">Puzzles</button>
        <button class="nav-link" @click="showHistory = true; showMenu = false">History</button>
        <button class="nav-link" @click="showSettings = true; showMenu = false">Settings</button>
        <span v-if="isAuthenticated" class="nav-user">
          <span class="nav-username">{{ identityUsername }}</span>
          <button class="nav-link" @click="handleLogout(); showMenu = false">Log out</button>
        </span>
        <button v-else class="nav-link nav-login" @click="showLoginModal = true; showMenu = false">Log in</button>
      </nav>
      <button class="menu-toggle" :aria-expanded="showMenu" @click="showMenu = !showMenu">
        {{ showMenu ? 'Close' : 'Menu' }}
      </button>
    </header>

    <main class="main">
      <!-- Replay -->
      <section v-if="isReplayMode && replayGame" class="table">
        <div class="board-area">
          <ChessBoard
            :chess="chess"
            :flipped="replayGame.myColor === 'black'"
            :interactive="false"
            :last-move="lastMove"
            :analysis-arrows="analysisArrows"
            :piece-colors="pieceColors"
            :white-arrow-color="settings.whiteArrowColor"
            :black-arrow-color="settings.blackArrowColor"
            :empty-arrow-color="settings.emptyArrowColor"
            @move="() => {}"
          />
        </div>

        <div class="side-head">
          <h2 class="side-title">Review</h2>
          <p class="side-meta">
            {{ new Date(replayGame.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }}, {{ replayResultText }}
          </p>
        </div>

        <div class="seat seat-top">
          <img class="seat-colour" :src="`/pieces/${replayGame.myColor === 'white' ? 'b' : 'w'}k.svg`" alt="" />
          <span class="seat-name">{{ replayOpponentName }}</span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[replayGame.myColor === 'white' ? 'black' : 'white']" :key="`ro-${idx}`" :src="`/pieces/${replayGame.myColor === 'white' ? 'w' : 'b'}${piece}.svg`" :alt="piece" />
            <b v-if="materialAdvantage[replayGame.myColor === 'white' ? 'black' : 'white'] > 0">+{{ materialAdvantage[replayGame.myColor === 'white' ? 'black' : 'white'] }}</b>
          </span>
        </div>

        <div class="side-info">
          <p v-if="currentOpeningName" class="opening">{{ currentOpeningName }}</p>
          <label class="toggle">
            <input type="checkbox" v-model="replayShowBestMoves" />
            <span>Show the engine's best moves</span>
          </label>
          <p v-if="replayShowBestMoves" class="legend">
            <span class="key key-1"></span>best
            <span class="key key-2"></span>second
            <span class="key key-3"></span>third
          </p>
        </div>

        <div class="moves">
          <div class="moves-bar">
            <button class="step" :disabled="viewingMoveIndex === -1" @click="goToStart" aria-label="First move">«</button>
            <button class="step" :disabled="viewingMoveIndex === -1" @click="previousMove" aria-label="Previous move">‹</button>
            <span class="moves-count">{{ viewingMoveIndex === null || viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1 }} of {{ replayGame.moves.length }}</span>
            <button class="step" :disabled="viewingMoveIndex === (replayGame.moves.length - 1)" @click="nextMove" aria-label="Next move">›</button>
            <button class="step" :disabled="viewingMoveIndex === (replayGame.moves.length - 1)" @click="goToEnd" aria-label="Last move">»</button>
          </div>
          <ol class="move-list">
            <li v-for="(pair, row) in pairMoves(replayGame.moves)" :key="row">
              <span class="move-no">{{ row + 1 }}</span>
              <button v-for="(san, k) in pair" :key="k" class="ply" :class="{ current: row * 2 + k === viewingMoveIndex }" @click="goToMove(row * 2 + k)">{{ san }}</button>
            </li>
          </ol>
        </div>

        <div class="actions">
          <button class="btn" @click="exitReplayMode">Back to the lobby</button>
        </div>

        <div class="seat seat-bottom">
          <img class="seat-colour" :src="`/pieces/${replayGame.myColor === 'white' ? 'w' : 'b'}k.svg`" alt="" />
          <span class="seat-name">{{ (replayGame.myUsername?.trim()) || 'You' }}</span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[replayGame.myColor === 'white' ? 'white' : 'black']" :key="`rm-${idx}`" :src="`/pieces/${replayGame.myColor === 'white' ? 'b' : 'w'}${piece}.svg`" :alt="piece" />
            <b v-if="materialAdvantage[replayGame.myColor] > 0">+{{ materialAdvantage[replayGame.myColor] }}</b>
          </span>
        </div>
      </section>

      <!-- Puzzles -->
      <section v-else-if="isPuzzleMode && currentPuzzle" class="table">
        <div class="board-area">
          <ChessBoard
            :chess="chess"
            :flipped="myPlayer?.color === 'black'"
            :interactive="puzzleResult === 'pending' && isMyTurn && viewingMoveIndex === null"
            :last-move="lastMove"
            :analysis-arrows="analysisArrows"
            :hint-square="puzzleHintSquare"
            :piece-colors="pieceColors"
            :white-arrow-color="settings.whiteArrowColor"
            :black-arrow-color="settings.blackArrowColor"
            :empty-arrow-color="settings.emptyArrowColor"
            @move="handleMove"
          />
        </div>

        <div class="side-head">
          <h2 class="side-title">Puzzle</h2>
          <p class="side-meta">{{ capitalise(currentPuzzle.difficulty) }}, {{ myPlayer?.color }} to move</p>
        </div>

        <div class="side-info">
          <p class="prompt">{{ puzzleMessage }}</p>

          <template v-if="puzzleResult === 'pending'">
            <div class="row">
              <button v-if="!showPuzzleHint" class="btn" :disabled="showingSolution" @click="showPuzzleHintPiece">Show a hint</button>
              <button v-if="showPuzzleHint && !showPuzzleMove" class="btn" :disabled="showingSolution" @click="showPuzzleMoveArrow">Show the move</button>
              <button class="btn" :disabled="showingSolution" @click="showSolution">{{ showingSolution ? 'Playing the solution' : 'Play the solution' }}</button>
              <button class="btn" @click="exitPuzzleMode">Leave puzzles</button>
            </div>
            <p v-if="showPuzzleHint && !showPuzzleMove" class="note">{{ currentPuzzle.hint }}</p>
            <p v-if="showPuzzleMove" class="note">The arrow shows the move. Play it on the board.</p>
          </template>

          <div v-if="puzzleResult === 'correct'" class="result">
            <p class="result-line">Solved. That's the winning line.</p>
            <div class="row">
              <button class="btn btn-go" @click="loadNextPuzzle">Next puzzle</button>
              <button class="btn" @click="exitPuzzleMode">Leave puzzles</button>
            </div>
          </div>

          <div v-if="puzzleResult === 'incorrect'" class="result">
            <p class="result-line">Not that one.</p>
            <div class="row">
              <button class="btn btn-go" @click="retryCurrentPuzzle">Try again</button>
              <button class="btn" @click="loadNextPuzzle">Next puzzle</button>
              <button class="btn" @click="exitPuzzleMode">Leave puzzles</button>
            </div>
          </div>
        </div>

        <div v-if="currentGame?.moves && currentGame.moves.length > 0" class="moves">
          <div class="moves-bar">
            <button class="step" :disabled="viewingMoveIndex === -1" @click="goToStart" aria-label="First move">«</button>
            <button class="step" :disabled="viewingMoveIndex === -1" @click="previousMove" aria-label="Previous move">‹</button>
            <span class="moves-count">{{ viewingMoveIndex === null ? currentGame.moves.length : (viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1) }} of {{ currentGame.moves.length }}</span>
            <button class="step" :disabled="viewingMoveIndex === null || viewingMoveIndex === currentGame.moves.length - 1" @click="nextMove" aria-label="Next move">›</button>
            <button class="step" :disabled="viewingMoveIndex === null" @click="goToEnd" aria-label="Current position">»</button>
          </div>
          <ol class="move-list">
            <li v-for="(pair, row) in pairMoves(currentGame.moves)" :key="row">
              <span class="move-no">{{ row + 1 }}</span>
              <button v-for="(san, k) in pair" :key="k" class="ply" :class="{ current: row * 2 + k === viewingMoveIndex }" @click="goToMove(row * 2 + k)">{{ san }}</button>
            </li>
          </ol>
        </div>
      </section>

      <!-- Lobby -->
      <section v-else-if="!isGameActive && !currentGame" class="table lobby">
        <div class="board-area">
          <ChessBoard
            :chess="lobbyChess"
            :flipped="false"
            :interactive="false"
            :last-move="null"
            :analysis-arrows="[]"
            :piece-colors="pieceColors"
            @move="() => {}"
          />
        </div>

        <div class="lobby-panel">
          <h2 class="lobby-title">Play someone</h2>
          <p v-if="!isInitialized || !isConnected" class="lobby-sub">Connecting to relays. You can play the computer while you wait.</p>

          <fieldset class="controls">
            <legend>Time control</legend>
            <div class="clock-grid">
              <button
                v-for="control in timeControls"
                :key="control.id"
                class="clock-pick"
                :class="{ picked: selectedTimeControl === control.id }"
                :aria-pressed="selectedTimeControl === control.id"
                :disabled="isSearching"
                @click="selectTimeControl(control.id)"
              >
                <span class="pick-time">{{ control.id === 'any' ? 'Any' : (control.minutes === 0 ? 'No clock' : control.display) }}</span>
                <span class="pick-name">{{ control.id === 'any' ? 'first free' : control.name.toLowerCase() }}</span>
              </button>
            </div>
          </fieldset>

          <div v-if="!isSearching" class="row">
            <button class="btn btn-go btn-wide" :disabled="!isInitialized || !isConnected" @click="startSearching">Find a game</button>
          </div>
          <div v-else class="searching">
            <p><span class="pulse" aria-hidden="true"></span>Looking for an opponent at {{ selectedTimeControlDisplay }}</p>
            <button class="btn" @click="stopSearching">Stop looking</button>
          </div>

          <h2 class="lobby-title lobby-title-2">Play the computer</h2>
          <div class="levels" role="radiogroup" aria-label="Computer strength">
            <button
              v-for="(label, level) in aiLevels"
              :key="level"
              class="level"
              role="radio"
              :aria-checked="aiDifficulty === level"
              :class="{ picked: aiDifficulty === level }"
              @click="aiDifficulty = level"
            >
              <span class="level-name">{{ label.name }}</span>
              <span class="level-elo">{{ label.elo }}</span>
            </button>
          </div>
          <div class="row">
            <button class="btn btn-wide" :disabled="isSearching" @click="startAIGame">Start against {{ aiLevels[aiDifficulty].name.toLowerCase() }}</button>
          </div>

          <p class="you">You are <code :title="myPeerId">{{ formatPeerId(myPeerId) }}</code> on the {{ settings.networkName || 'global' }} network.</p>

          <p v-if="error" class="alert">{{ error }}</p>
        </div>
      </section>

      <!-- Game -->
      <section v-else class="table" :class="{ 'has-chat': canChat }">
        <div class="board-area">
          <ChessBoard
            :chess="chess"
            :flipped="(myPlayer?.color === 'black') !== boardFlipped"
            :interactive="isMyTurn && isGameActive && viewingMoveIndex === null"
            :last-move="lastMove"
            :analysis-arrows="analysisArrows"
            :piece-colors="pieceColors"
            :white-arrow-color="settings.whiteArrowColor"
            :black-arrow-color="settings.blackArrowColor"
            :empty-arrow-color="settings.emptyArrowColor"
            @move="handleMove"
          />
        </div>

        <div class="seat seat-top" :class="{ running: !isMyTurn && currentGame?.status !== 'finished', check: isOpponentKingInCheck }">
          <img class="seat-colour" :src="`/pieces/${myPlayer?.color === 'white' ? 'b' : 'w'}k.svg`" alt="" />
          <span class="seat-name">
            {{ isAIGame ? `Computer, ${aiLevels[aiDifficulty].name.toLowerCase()}` : formatPeerId(opponentId || 'Opponent') }}
            <svg
              v-if="!isAIGame && currentGame?.status !== 'finished'"
              class="signal"
              :class="`signal-${connectionStrength}`"
              viewBox="0 0 16 12"
              role="img"
              :aria-label="connectionLabel"
            >
              <title>{{ connectionLabel }}</title>
              <rect v-for="n in 4" :key="n" :x="(n - 1) * 4" :y="12 - n * 3" width="3" :height="n * 3" rx="0.5" :class="{ lit: n <= connectionStrength }" />
            </svg>
            <small v-if="aiThinking">thinking</small>
          </span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[myPlayer?.color === 'white' ? 'black' : 'white']" :key="`go-${idx}`" :src="`/pieces/${myPlayer?.color === 'white' ? 'w' : 'b'}${piece}.svg`" :alt="piece" />
            <b v-if="materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] > 0">+{{ materialAdvantage[myPlayer?.color === 'white' ? 'black' : 'white'] }}</b>
          </span>
          <span v-if="hasClock" class="seat-clock" :class="{ low: isLowTime(opponentTime) }">{{ formatTime(opponentTime) }}</span>
        </div>

        <div class="side-info">
          <p v-if="currentGame?.status !== 'finished'" class="turn" :class="{ mine: isMyTurn }">
            {{ isMyTurn ? 'Your move' : (aiThinking ? 'The computer is thinking' : 'Their move') }}
          </p>
          <p v-if="!hasClock && currentGame?.status !== 'finished'" class="note">No clock in this game.</p>
          <p v-if="currentOpeningName" class="opening">{{ currentOpeningName }}</p>
          <p v-if="showBestMoves && isAIGame" class="legend">
            <span class="key key-1"></span>best
            <span class="key key-2"></span>second
            <span class="key key-3"></span>third
          </p>

          <div v-if="currentGame?.status === 'finished'" class="result">
            <p class="result-line">{{ resultLine }}</p>
            <button class="btn btn-go" @click="returnToLobby">Back to the lobby</button>
          </div>
        </div>

        <div class="moves">
          <div class="moves-bar">
            <button class="step" :disabled="!currentGame?.moves?.length || viewingMoveIndex === -1" @click="goToStart" aria-label="First move">«</button>
            <button class="step" :disabled="!currentGame?.moves?.length || viewingMoveIndex === -1" @click="previousMove" aria-label="Previous move">‹</button>
            <span class="moves-count">{{ viewingMoveIndex === null ? (currentGame?.moves.length || 0) : (viewingMoveIndex === -1 ? 0 : viewingMoveIndex + 1) }} of {{ currentGame?.moves.length || 0 }}</span>
            <button class="step" :disabled="viewingMoveIndex === null || viewingMoveIndex === (currentGame?.moves.length || 0) - 1" @click="nextMove" aria-label="Next move">›</button>
            <button class="step" :disabled="viewingMoveIndex === null" @click="goToEnd" aria-label="Current position">»</button>
          </div>
          <ol class="move-list">
            <li v-if="!currentGame?.moves?.length" class="empty">No moves yet.</li>
            <li v-for="(pair, row) in pairMoves(currentGame?.moves || [])" :key="row">
              <span class="move-no">{{ row + 1 }}</span>
              <button v-for="(san, k) in pair" :key="k" class="ply" :class="{ current: row * 2 + k === viewingMoveIndex }" @click="goToMove(row * 2 + k)">{{ san }}</button>
            </li>
          </ol>
        </div>

        <div v-if="canChat" class="chat">
          <ol ref="chatList" class="chat-list" aria-live="polite">
            <li v-if="!chatMessages.length" class="empty">Say hello to your opponent.</li>
            <li v-for="m in chatMessages" :key="m.id" :class="{ mine: m.mine }">
              <span class="chat-who">{{ m.mine ? 'You:' : 'Opp:' }}</span>
              <span class="chat-text">{{ m.text }}</span>
            </li>
          </ol>
          <form class="chat-form" @submit.prevent="sendChat">
            <input v-model="chatDraft" class="chat-input" type="text" :maxlength="CHAT_MAX" placeholder="Message" aria-label="Message your opponent" autocomplete="off" />
            <button class="btn" type="submit" :disabled="!chatDraft.trim()">Send</button>
          </form>
        </div>

        <div v-if="currentGame?.status !== 'finished'" class="actions">
          <button class="btn" @click="offerDraw">Offer a draw</button>
          <button class="btn" @click="offerTakeback">Ask to take back</button>
          <button class="btn" :aria-pressed="boardFlipped" @click="boardFlipped = !boardFlipped">Flip board</button>
          <button v-if="isAIGame && !isPigeonVariant" class="btn" :aria-pressed="showBestMoves" :class="{ on: showBestMoves }" @click="showBestMoves = !showBestMoves">
            {{ showBestMoves ? 'Hide best moves' : 'Show best moves' }}
          </button>
          <button class="btn btn-stop" @click="handleResign">Resign</button>
        </div>

        <div class="seat seat-bottom" :class="{ running: isMyTurn && currentGame?.status !== 'finished', check: isMyKingInCheck }">
          <img class="seat-colour" :src="`/pieces/${myPlayer?.color === 'white' ? 'w' : 'b'}k.svg`" alt="" />
          <span class="seat-name">{{ identityUsername || 'You' }}</span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[myPlayer?.color === 'white' ? 'white' : 'black']" :key="`gm-${idx}`" :src="`/pieces/${myPlayer?.color === 'white' ? 'b' : 'w'}${piece}.svg`" :alt="piece" />
            <b v-if="materialAdvantage[myPlayer?.color || 'white'] > 0">+{{ materialAdvantage[myPlayer?.color || 'white'] }}</b>
          </span>
          <span v-if="hasClock" class="seat-clock" :class="{ low: isLowTime(myTime) }">{{ formatTime(myTime) }}</span>
        </div>
      </section>
    </main>

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

    <div v-if="showLoginModal" class="sheet-backdrop" @click.self="showLoginModal = false; loginError = ''">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <h3 id="login-title">{{ loginMode === 'login' ? 'Log in' : 'Create an account' }}</h3>
        <p>{{ loginMode === 'login'
          ? 'Your account keeps your game history across devices.'
          : 'Pick a name other players will see, and a password to protect it.' }}</p>

        <label class="field">
          <span>Username</span>
          <input v-model="loginUsername" type="text" autocomplete="username" @keyup.enter="handleLogin" />
        </label>
        <label class="field">
          <span>Password</span>
          <input v-model="loginPassword" type="password" :autocomplete="loginMode === 'login' ? 'current-password' : 'new-password'" @keyup.enter="handleLogin" />
        </label>
        <ul v-if="loginMode === 'register' && loginPassword" class="rules">
          <li :class="{ met: loginPassword.length >= 12 }">12 or more characters</li>
          <li :class="{ met: /[A-Z]/.test(loginPassword) && /[a-z]/.test(loginPassword) }">Upper and lower case letters</li>
          <li :class="{ met: /\d/.test(loginPassword) }">A number</li>
          <li :class="{ met: /[!@#$%^&*()_+\-=\[\]{};':&quot;\\|,.<>\/?]/.test(loginPassword) }">A symbol</li>
        </ul>

        <p v-if="loginError" class="alert">{{ loginError }}</p>

        <div class="sheet-actions">
          <button class="btn" @click="showLoginModal = false; loginError = ''">Cancel</button>
          <button class="btn btn-go" :disabled="loginLoading || !loginUsername || !loginPassword" @click="handleLogin">
            {{ loginLoading ? 'Checking' : (loginMode === 'login' ? 'Log in' : 'Create account') }}
          </button>
        </div>
        <p class="sheet-foot">
          {{ loginMode === 'login' ? 'New here?' : 'Already have an account?' }}
          <a href="#" @click.prevent="toggleLoginMode">{{ loginMode === 'login' ? 'Create an account' : 'Log in' }}</a>
        </p>
      </div>
    </div>

    <div v-if="showAlreadyInGameModal" class="sheet-backdrop">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <h3>You're already playing</h3>
        <p>Finish or resign the current game before starting another.</p>
        <div class="sheet-actions">
          <button class="btn btn-go" @click="showAlreadyInGameModal = false">OK</button>
        </div>
      </div>
    </div>

    <div v-if="showResignConfirmModal" class="sheet-backdrop">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <h3>Resign this game?</h3>
        <p>It ends now and counts as a loss.</p>
        <div class="sheet-actions">
          <button class="btn" @click="showResignConfirmModal = false">Keep playing</button>
          <button class="btn btn-stop" @click="confirmResign">Resign</button>
        </div>
      </div>
    </div>

    <div v-if="incomingDrawOffer" class="sheet-backdrop">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <h3>{{ formatPeerId(incomingDrawOffer.from) }} offers a draw</h3>
        <div class="sheet-actions">
          <button class="btn" @click="declineDrawOffer">Keep playing</button>
          <button class="btn btn-go" @click="acceptDrawOffer">Agree to a draw</button>
        </div>
      </div>
    </div>

    <div v-if="incomingTakebackRequest" class="sheet-backdrop">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <h3>{{ formatPeerId(incomingTakebackRequest.from) }} asks to take back their last move</h3>
        <div class="sheet-actions">
          <button class="btn" @click="declineTakebackRequest">Decline</button>
          <button class="btn btn-go" @click="acceptTakebackRequest">Allow it</button>
        </div>
      </div>
    </div>

    <div v-if="showAbandonmentModal" class="sheet-backdrop">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <template v-if="abandonmentReason === 'aborted'">
          <h3>Game aborted</h3>
          <p>{{ iAbandoned ? "You didn't" : "Your opponent didn't" }} make a first move in time. The game doesn't count.</p>
        </template>
        <template v-else>
          <h3>{{ iAbandoned ? 'You lost' : 'You won' }}</h3>
          <p v-if="abandonmentReason === 'peer_disconnect'">
            {{ iAbandoned ? 'Your connection' : "Your opponent's connection" }} dropped and didn't come back in time.
          </p>
          <p v-else-if="abandonmentReason === 'time'">
            {{ iAbandoned ? 'You ran' : 'Your opponent ran' }} out of time.
          </p>
        </template>
        <div class="sheet-actions">
          <button class="btn btn-go" @click="showAbandonmentModal = false; abandonmentReason = null; iAbandoned = false">OK</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Chess } from 'chess.js'
import { createChess, isPigeonVariant } from './utils/variant'
import { pigeonSearch } from './utils/pigeonAi'
import { usePeerPigeon } from './composables/usePeerPigeon'
import { useSeek } from './composables/useSeek'
import ChessBoard from './components/ChessBoard.vue'
import SettingsModal from './components/SettingsModal.vue'
import GameHistory from './components/GameHistory.vue'
import { useChessGame } from './composables/useChessGame'
import { useSettings } from './composables/useSettings'
import { useSounds } from './composables/useSounds'
import { useIdentity } from './composables/useIdentity'
import type { ChessMessage, GameHistoryEntry } from './types'
import { saveToLocalStorage, loadFromLocalStorage } from './utils/helpers'
import { getOpeningName } from './utils/openings'
import { getRandomPuzzle, type ChessPuzzle } from './utils/puzzles'

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
  networkName: (settings.value.networkName || 'global') + (isPigeonVariant ? ':pigeon' : ''),
  maxPeers: 10,
  minPeers: 1,
  enableCrypto: true
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

// Finding an opponent (see composables/useSeek.ts)
const seek = useSeek({
  myPeerId: computed(() => mesh.value?.peerId ?? null),
  timeControls,
  selectedTimeControl,
  broadcast: (message: string) => broadcast(message, false),
  sendMessage: (peerId: string, message: string) => sendMessage(peerId, message),
  isPlaying: () => isGameActive.value,
  onMatched: (match) => startMatchedGame(match),
  onCancelled: () => {
    console.log('Opponent withdrew before the first move; searching again')
    clearAbandonmentTimers()
    returnToLobby()
  }
})
const isSearching = seek.isSearching

const selectedTimeControlDisplay = computed(() => {
  return timeControls.find(tc => tc.id === selectedTimeControl.value)?.display || ''
})

const selectTimeControl = (controlId: string) => {
  selectedTimeControl.value = controlId
}

const startSearching = () => {
  if (isGameActive.value) return
  seek.start()
}

const stopSearching = () => {
  seek.stop()
}

/** Both sides of a match land here: set the clock, colours and opponent, and start. */
const startMatchedGameReset = () => { endReason.value = null; boardFlipped.value = false; clearChat() }
const startMatchedGame = (match: { gameId: string; opponent: string; myColor: 'white' | 'black'; timeControl: { minutes: number; increment: number } }) => {
  startMatchedGameReset()
  console.log('Matched with', match.opponent, 'as', match.myColor, 'game', match.gameId)
  currentGameTimeControl.value = { minutes: match.timeControl.minutes, increment: match.timeControl.increment }
  resetTimers()
  isAIGame.value = false
  startNewGame(myPeerId.value, match.opponent, match.myColor)
  opponentId.value = match.opponent
  hasGameStarted.value = false
  startTimer()
  startTimerSyncBroadcast()
  startWatchdog()
}

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

// Puzzle mode
const isPuzzleMode = ref(false)
const currentPuzzle = ref<ChessPuzzle | null>(null)
const puzzleMoveIndex = ref(0)
const puzzleResult = ref<'correct' | 'incorrect' | 'pending'>('pending')
const puzzleMessage = ref('')
const showPuzzleHint = ref(false)
const showingSolution = ref(false)
const puzzleHintSquare = ref<string | null>(null)
const showPuzzleMove = ref(false)

// Current opening name
const currentOpeningName = computed(() => {
  if (isReplayMode.value && replayGame.value) {
    // In replay mode, use the saved opening or calculate from moves up to viewing position
    if (viewingMoveIndex.value !== null && viewingMoveIndex.value >= 0) {
      const movesUpToHere = replayGame.value.moves.slice(0, viewingMoveIndex.value + 1)
      return getOpeningName(movesUpToHere)
    }
    return replayGame.value.opening || getOpeningName(replayGame.value.moves)
  }
  
  // In active game, calculate from current moves up to viewing position
  if (currentGame.value && currentGame.value.moves.length > 0) {
    if (viewingMoveIndex.value !== null && viewingMoveIndex.value >= 0) {
      const movesUpToHere = currentGame.value.moves.slice(0, viewingMoveIndex.value + 1)
      return getOpeningName(movesUpToHere)
    }
    return getOpeningName(currentGame.value.moves)
  }
  
  return null
})

const aiLevels = [
  { name: 'Easy', elo: 'about 900' },
  { name: 'Medium', elo: 'about 1300' },
  { name: 'Hard', elo: 'about 1900' },
  { name: 'Master', elo: '2500 and up' }
]

const startAIGame = () => {
  endReason.value = null
  boardFlipped.value = false
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
let currentAnalysisId = 0 // Track which analysis request is current
let expectingAiMove = false // Track if we're expecting an AI move (to filter out stale bestmove from player analysis)

const initStockfish = async () => {
  if (stockfish) return
  
  try {
    // Stockfish 19 lite, single-threaded WebAssembly, served from this site
    // (public/stockfish/) so it is cached. It runs in its own worker.
    stockfish = new Worker('/stockfish/stockfish-19-lite-single.js')
    
    if (stockfish) {
      stockfish.onmessage = (event: MessageEvent) => {
        const message = event.data
        
        if (message === 'uciok') {
          stockfish?.postMessage('isready')
        } else if (message === 'readyok') {
          stockfishReady = true
          console.log('✅ Stockfish ready')
        } else if (message.startsWith('bestmove')) {
          const match = message.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)
          if (match && stockfishCallback && expectingAiMove) {
            console.log('🤖 AI chose:', match[1])
            stockfishCallback(match[1])
            stockfishCallback = null
            expectingAiMove = false
          } else if (match && !expectingAiMove) {
            console.warn('⚠️ Ignoring bestmove (not expecting AI move):', match[1])
          }
        } else if (message.startsWith('info') && message.includes('multipv')) {
          // Parse multi-PV analysis for top moves
          const pvIndex = message.indexOf(' pv ')
          if (pvIndex !== -1 && stockfishAnalysisCallback) {
            const pvString = message.substring(pvIndex + 4) // +4 to skip " pv "
            const moves = pvString.trim().split(/\s+/).filter((m: string) => m.match(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
            // Only pass the first move (the human player's move) from each variation
            if (moves.length > 0 && !message.includes('upperbound') && !message.includes('lowerbound')) {
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
  
  // Increment analysis ID to invalidate any pending player analysis
  currentAnalysisId++
  const thisAnalysisId = currentAnalysisId
  console.log('💡 Player Analysis ID:', thisAnalysisId)
  
  // Reset analysis state
  analysisTopMoves.value = []
  analysisArrows.value = []
  
  expectingAiMove = false // Player analysis doesn't use bestmove
  stockfish.postMessage('stop')
  stockfish.postMessage('ucinewgame')
  stockfish.postMessage('setoption name MultiPV value 5') // Show top 5 moves
  stockfish.postMessage('setoption name Hash value 32')
  stockfish.postMessage('position fen ' + currentFen)
  stockfish.postMessage('go depth 22 movetime 8000') // Depth 22 with 8 second limit for much stronger analysis
  
  // Set up callback to handle analysis results
  stockfishAnalysisCallback = (moves: string[]) => {
    // Ignore stale responses from old analysis
    if (thisAnalysisId !== currentAnalysisId) {
      console.warn('⚠️ Ignoring stale player analysis (ID mismatch)')
      return
    }
    
    // Don't show analysis arrows if AI is currently thinking
    if (aiThinking.value) {
      return
    }
    
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
      
      if (analysisTopMoves.value.length === 1) {
        console.log('💡 Best move:', moves[0])
      }
      
      console.log('Updated analysis arrows:', analysisArrows.value)
    }
  }
}

// AI move selection functions (fallback for when Stockfish not available)
const selectEasyMove = (moves: any[], currentFen: string) => {
  // Prefer captures and checks, otherwise random
  const captureMoves = moves.filter(m => m.captured)
  const checkMoves = moves.filter(m => {
    const testChess = createChess(currentFen)
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
    const testChess = createChess(currentFen)
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
    const testChess = createChess(currentFen)
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
  
  // Clear the analysis callback so AI move calculation doesn't trigger analysis arrows
  stockfishAnalysisCallback = null
  
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
  const expectedAiColor = aiColor // Capture AI color for this move
  
  // Sanity check
  if (!currentFen || currentFen.length < 10) {
    console.error('CRITICAL: Invalid FEN at start of makeAIMove:', currentFen)
    aiThinking.value = false
    return
  }
  
  // Try to use Stockfish if available (it only knows standard chess)
  if (stockfish && stockfishReady && !isPigeonVariant) {
    
    // Increment analysis ID FIRST to invalidate any pending responses (including messages in queue)
    currentAnalysisId++
    const thisAnalysisId = currentAnalysisId
    
    // Stop EVERYTHING - both AI moves and analysis
    stockfishCallback = null
    stockfishAnalysisCallback = null
    expectingAiMove = false // Don't accept any bestmove yet (let stale messages be rejected)
    stockfish.postMessage('stop')
    
    console.log('🤖 AI Move Analysis ID:', thisAnalysisId)
    
    // Set the callback for THIS analysis
    stockfishCallback = (bestMove: string) => {
      // Ignore stale responses from old analysis
      if (thisAnalysisId !== currentAnalysisId) {
        console.warn('⚠️ Ignoring stale AI analysis (ID mismatch)')
        return
      }
      
      // Check if it's still the AI's turn (most important check!)
      if (chess.value.turn() !== expectedAiColor) {
        console.warn('⚠️ No longer AI turn, ignoring move')
        aiThinking.value = false
        return
      }
      
      // Verify position matches what we analyzed
      if (chess.value.fen() !== currentFen) {
        console.warn('⚠️ Position changed, ignoring move')
        aiThinking.value = false
        return
      }
      
      const delay = 300 + Math.random() * 500
      setTimeout(() => {
        // Re-check critical conditions after delay
        if (!isAIGame.value || !isGameActive.value) {
          aiThinking.value = false
          return
        }
        
        // Check if still AI's turn after delay
        if (chess.value.turn() !== expectedAiColor) {
          console.warn('No longer AI turn after delay, ignoring move')
          aiThinking.value = false
          return
        }
        
        // Check position hasn't changed after delay
        if (chess.value.fen() !== currentFen) {
          console.warn('Position changed during AI delay, ignoring move')
          aiThinking.value = false
          return
        }
        
        try {
          // Sanity check: make sure we have a valid position
          if (!currentFen || currentFen.length < 10) {
            console.error('CRITICAL: Invalid FEN captured:', currentFen)
            aiThinking.value = false
            return
          }
          
          // Sanity check: make sure move string is valid
          if (!bestMove || bestMove.length < 4 || !bestMove.match(/^[a-h][1-8][a-h][1-8][qrbn]?$/)) {
            console.error('CRITICAL: Invalid move format from Stockfish:', bestMove)
            aiThinking.value = false
            return
          }
          
          // Validate the move is legal using the CAPTURED position
          let testChess: Chess
          let legalMoves: any[]
          
          try {
            testChess = createChess(currentFen)
            legalMoves = testChess.moves({ verbose: true })
          } catch (err) {
            console.error('CRITICAL: Failed to create Chess instance with FEN:', currentFen, 'Error:', err)
            aiThinking.value = false
            return
          }
          
          const moveFrom = bestMove.substring(0, 2)
          const moveTo = bestMove.substring(2, 4)
          const movePromo = bestMove.length > 4 ? bestMove[4] : undefined
          
          const isLegal = legalMoves.some(m => 
            m.from === moveFrom && 
            m.to === moveTo &&
            (!movePromo || m.promotion === movePromo)
          )
          
          if (!isLegal) {
            console.error('ILLEGAL MOVE DETECTED:')
            console.error('  Move:', bestMove, '(from:', moveFrom, 'to:', moveTo, 'promo:', movePromo || 'none', ')')
            console.error('  Expected position FEN:', currentFen)
            console.error('  Current position FEN:', chess.value.fen())
            console.error('  Legal moves:', legalMoves.map(m => `${m.from}${m.to}${m.promotion || ''}`).join(', '))
            console.error('  Position whose turn:', testChess.turn(), '(expected AI color:', expectedAiColor, ')')
            aiThinking.value = false
            return
          }
          
          // Apply the move to the actual game
          const moveResult = chess.value.move({
            from: moveFrom,
            to: moveTo,
            promotion: movePromo || 'q'
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
          } else {
            console.error('CRITICAL: chess.value.move() returned null for:', moveFrom, 'to', moveTo)
            aiThinking.value = false
          }
        } catch (error) {
          console.error('EXCEPTION in AI move callback:', error)
          console.error('Stack:', error instanceof Error ? error.stack : 'no stack')
          console.error('Context - bestMove:', bestMove, 'currentFen:', currentFen, 'expectedAiColor:', expectedAiColor)
          aiThinking.value = false
        }
      }, delay)
    }
    
    // Map difficulty to Stockfish settings - BACK TO ORIGINAL
    const skillLevel = aiDifficulty.value === 0 ? 0 :
                       aiDifficulty.value === 1 ? 5 :
                       aiDifficulty.value === 2 ? 10 : 15
    const depth = aiDifficulty.value === 0 ? 1 : 
                  aiDifficulty.value === 1 ? 6 :
                  aiDifficulty.value === 2 ? 10 : 15
    
    // Most it may think, so a move never takes long.
    const movetime = [300, 1000, 2000, 3000][aiDifficulty.value] ?? 2000

    // Analysis may have left 5 lines and a bigger hash set; the computer's move needs neither.
    stockfish.postMessage('setoption name MultiPV value 1')
    stockfish.postMessage('setoption name Hash value 16')
    stockfish.postMessage('setoption name Skill Level value ' + skillLevel)
    stockfish.postMessage('setoption name UCI_LimitStrength value false')
    stockfish.postMessage('isready')
    
    setTimeout(() => {
      if (!stockfish) return
      expectingAiMove = true // NOW we're expecting an AI bestmove (after delay to clear stale messages)
      stockfish.postMessage('ucinewgame')
      stockfish.postMessage('position fen ' + currentFen)
      stockfish.postMessage('go depth ' + depth + ' movetime ' + movetime)
    }, 50)
    return
  }
  
  // Fallback to old AI if Stockfish not available
  console.log('⚠️ FALLBACK AI - Stockfish not available. stockfish:', !!stockfish, 'stockfishReady:', stockfishReady)
  
  // Select move based on difficulty
  if (isPigeonVariant) {
    // The pigeon search runs in a worker so the page stays responsive.
    const started = Date.now()
    pigeonSearch(currentFen, [1, 2, 2, 3][aiDifficulty.value] ?? 2).then((found) => {
      if (!isAIGame.value || !isGameActive.value || chess.value.fen() !== currentFen) {
        aiThinking.value = false
        return
      }
      playSelected(found || moves[0], Math.max(0, 300 + Math.random() * 500 - (Date.now() - started)))
    })
    return
  }

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
  playSelected(selectedMove, 300 + Math.random() * 500)

  function playSelected(selectedMove: any, delay: number) {
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
}


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
  
  // Special handling for puzzle mode - update game state directly
  if (isPuzzleMode.value && currentPuzzle.value) {
    if (puzzleResult.value !== 'pending') {
      puzzleResult.value = 'pending'
      puzzleMessage.value = currentPuzzle.value.description
    }
    // Update puzzle move index to match the position we're viewing
    puzzleMoveIndex.value = moveIndex + 1
    
    // Recreate the board from the puzzle's starting position
    chess.value = new Chess(currentPuzzle.value.fen)
    
    // Play moves up to the selected index
    let lastMoveObj = null
    for (let i = 0; i <= moveIndex; i++) {
      const moveResult = chess.value.move(moves[i])
      if (i === moveIndex) {
        lastMoveObj = moveResult
      }
    }
    
    // Update the game state moves array and current turn
    if (currentGame.value) {
      currentGame.value.moves = moves.slice(0, moveIndex + 1)
      currentGame.value.status = 'active'
      currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
      currentGame.value.fen = chess.value.fen()
    }
    
    // In puzzle mode, update myPlayer color to match current turn
    if (myPlayer.value) {
      myPlayer.value.color = chess.value.turn() === 'w' ? 'white' : 'black'
    }
    
    // Update lastMove for highlighting
    if (lastMoveObj) {
      lastMove.value = { from: lastMoveObj.from, to: lastMoveObj.to }
      
      // Play appropriate sound
      if (lastMoveObj.captured) {
        playCaptureSound()
      } else if (lastMoveObj.flags.includes('k') || lastMoveObj.flags.includes('q')) {
        playCastleSound()
      } else {
        playMoveSound()
      }
    } else {
      lastMove.value = null
    }
    
    // Set to null to make board interactive
    viewingMoveIndex.value = null
    return
  }
  
  // Normal viewing mode for replay/regular games
  // Create a new chess instance for viewing
  viewingChess.value = createChess()
  
  // Play moves up to the selected index
  let lastMoveObj = null
  for (let i = 0; i <= moveIndex; i++) {
    const moveResult = viewingChess.value.move(moves[i])
    if (i === moveIndex) {
      lastMoveObj = moveResult // Capture the last move for highlighting
    }
  }
  
  // Update the main chess ref to show this position
  chess.value = viewingChess.value
  viewingMoveIndex.value = moveIndex
  
  // Update lastMove for highlighting
  if (lastMoveObj) {
    lastMove.value = {
      from: lastMoveObj.from,
      to: lastMoveObj.to
    }
    
    // Play appropriate sound based on move type
    if (lastMoveObj.captured) {
      playCaptureSound()
    } else if (lastMoveObj.flags.includes('k') || lastMoveObj.flags.includes('q')) {
      // Castling move (kingside or queenside)
      playCastleSound()
    } else {
      playMoveSound()
    }
  } else {
    lastMove.value = null
  }
}

const nextMove = () => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  
  const nextIndex = viewingMoveIndex.value === null ? 0 : viewingMoveIndex.value + 1
  
  if (nextIndex < moves.length) {
    // Check if this is the last move in an active game
    if (nextIndex === moves.length - 1 && !isReplayMode.value) {
      // Last move in active game - go to live position instead
      goToEnd()
      
      // Force reactivity to update by using nextTick
      nextTick(() => {
        console.log('After goToEnd (from last move) - viewingMoveIndex:', viewingMoveIndex.value, 'isMyTurn:', isMyTurn.value)
      })
    } else {
      goToMove(nextIndex)
    }
  } else if (nextIndex >= moves.length && !isReplayMode.value) {
    // At the end in active game, return to live position
    goToEnd()
    
    // Force reactivity to update by using nextTick
    nextTick(() => {
      console.log('After goToEnd - viewingMoveIndex:', viewingMoveIndex.value, 'isMyTurn:', isMyTurn.value)
    })
  }
}

const previousMove = () => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves || moves.length === 0) return
  
  // Reset puzzle state if in puzzle mode and navigating backwards
  if (isPuzzleMode.value && currentPuzzle.value && puzzleResult.value !== 'pending') {
    puzzleResult.value = 'pending'
    puzzleMessage.value = currentPuzzle.value.description
  }
  
  if (viewingMoveIndex.value === null) {
    // Currently viewing live position, go back one move from the end
    if (moves.length > 1) {
      goToMove(moves.length - 2) // Go to second-to-last move
    } else if (moves.length === 1) {
      goToStart() // Only one move, go to start
    }
  } else if (viewingMoveIndex.value <= 0) {
    // At first move or before, go to start
    goToStart()
  } else {
    // Go back one move
    goToMove(viewingMoveIndex.value - 1)
  }
}

const goToStart = () => {
  // Reset puzzle state if in puzzle mode
  if (isPuzzleMode.value && currentPuzzle.value) {
    if (puzzleResult.value !== 'pending') {
      puzzleResult.value = 'pending'
      puzzleMessage.value = currentPuzzle.value.description
    }
    puzzleMoveIndex.value = 0
    // Set board to puzzle's starting FEN
    viewingChess.value = new Chess(currentPuzzle.value.fen)
    chess.value = viewingChess.value
    
    // Reset game state moves
    if (currentGame.value) {
      currentGame.value.moves = []
      currentGame.value.status = 'active'
      currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
      currentGame.value.fen = chess.value.fen()
    }
    
    // In puzzle mode, update myPlayer color to match current turn
    if (myPlayer.value) {
      myPlayer.value.color = chess.value.turn() === 'w' ? 'white' : 'black'
    }
    
    // Play sound when navigating back to start
    playMoveSound()
    
    // Make board interactive by setting viewingMoveIndex to null
    viewingMoveIndex.value = null
  } else {
    viewingChess.value = createChess()
    chess.value = viewingChess.value
    viewingMoveIndex.value = -1
    
    // Play sound when navigating back to start
    playMoveSound()
  }
  
  lastMove.value = null // Clear highlighting at starting position
}

const goToEnd = () => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  
  console.log('goToEnd called - isReplayMode:', isReplayMode.value, 'moves.length:', moves.length)
  
  if (moves.length > 0) {
    // In replay mode, go to last move
    if (isReplayMode.value) {
      goToMove(moves.length - 1)
    } else {
      // In active game, return to live position
      console.log('Returning to live position')
      viewingChess.value = null
      viewingMoveIndex.value = null
      
      // Recreate the current game state
      const tempChess = createChess()
      for (const move of moves) {
        tempChess.move(move)
      }
      chess.value = tempChess
      
      // Update currentTurn to match the chess state
      if (currentGame.value) {
        currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
        console.log('Updated currentTurn to:', currentGame.value.currentTurn, 'isMyTurn should be:', isMyTurn.value)
      }
      
      // Set lastMove for highlighting
      if (moves.length > 0) {
        const lastMoveObj = tempChess.history({ verbose: true })[moves.length - 1]
        if (lastMoveObj) {
          lastMove.value = {
            from: lastMoveObj.from,
            to: lastMoveObj.to
          }
        }
      }
    }
  } else {
    // No moves yet, stay at starting position
    viewingChess.value = null
    viewingMoveIndex.value = null
  }
}

// Watch for new moves - automatically go to current position when moves are made
watch(() => currentGame.value?.moves.length, () => {
  if (viewingMoveIndex.value !== null) {
    // Automatically go to the latest move when a new move is made
    goToEnd()
  }
})

// Watch for best moves toggle and position changes
watch([showBestMoves, replayShowBestMoves, () => currentGame.value?.moves.length, aiThinking, isMyTurn, isReplayMode, viewingMoveIndex], () => {
  const shouldShowBestMoves = isReplayMode.value ? replayShowBestMoves.value : showBestMoves.value
  
  console.log('Best moves watcher triggered:', {
    shouldShowBestMoves,
    isReplayMode: isReplayMode.value,
    isAIGame: isAIGame.value,
    isGameActive: isGameActive.value,
    aiThinking: aiThinking.value,
    isMyTurn: isMyTurn.value,
    viewingMoveIndex: viewingMoveIndex.value,
    fen: chess.value?.fen()
  })
  
  // Clear arrows if best moves not enabled
  if (!shouldShowBestMoves) {
    console.log('Clearing analysis arrows')
    analysisArrows.value = []
    analysisTopMoves.value = []
    if (stockfish) {
      stockfishAnalysisCallback = null // Clear callback before stopping
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
  
  // Don't analyze when viewing historical moves in active games
  if (viewingMoveIndex.value !== null) {
    console.log('Viewing historical move, clearing arrows')
    analysisArrows.value = []
    analysisTopMoves.value = []
    if (stockfish) {
      stockfishAnalysisCallback = null // Clear callback before stopping
      stockfish.postMessage('stop')
    }
    return
  }
  
  // For AI games, only show best moves when it's the human player's turn AND not AI thinking
  if (!isAIGame.value || !isGameActive.value || aiThinking.value || !isMyTurn.value) {
    console.log('Clearing analysis arrows')
    analysisArrows.value = []
    analysisTopMoves.value = []
    if (stockfish) {
      stockfishAnalysisCallback = null // Clear callback before stopping
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
const showAlreadyInGameModal = ref(false)
const showResignConfirmModal = ref(false)

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
const hasGameStarted = ref(false) // Tracks if first move has been made
const abandonmentReason = ref<'aborted' | 'peer_disconnect' | 'time' | null>(null)
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
    // Every sync carries the moves, so a side that missed one catches up.
    moves: [...currentGame.value.moves],
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

  // Whose turn it is comes from the board, not the clock message: a timer sync
  // can be sent before the move it crossed on the way.
  currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'

  // Restart timer loop to use updated state
  if (timerInterval) clearInterval(timerInterval)
  startTimer()
}


/** Seconds left on the clock when the warning plays and the clock turns yellow. */
const LOW_TIME_SECONDS = 20

/**
 * Three quick, separate shakes. The copies are loaded with the page so each
 * starts on time; loaded on demand, they started late and ran together.
 */
const SHAKES = 3
const SHAKE_GAP_MS = 80
const shakerCopies = Array.from({ length: SHAKES }, () => {
  const audio = new Audio('/sounds/shaker.mp3')
  audio.preload = 'auto'
  audio.volume = 0.5
  return audio
})
const playLowTimeWarning = () => {
  shakerCopies.forEach((audio, i) => {
    setTimeout(() => {
      audio.currentTime = 0
      audio.playbackRate = 2
      audio.play().catch((err) => console.error('Low time warning error:', err))
    }, i * SHAKE_GAP_MS)
  })
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
  // Under the warning point the clock shows tenths, as chess.com does: 0:19.4
  if (isLowTime(seconds)) {
    const tenths = Math.floor(Math.max(0, seconds) * 10)
    const secs = Math.floor(tenths / 10)
    return `0:${secs.toString().padStart(2, '0')}.${tenths % 10}`
  }
  const whole = Math.ceil(Math.max(0, seconds))
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** The clock is in the warning zone: tenths shown, clock yellow. */
const isLowTime = (seconds: number) => hasClock.value && seconds < LOW_TIME_SECONDS

const startTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  
  // Don't start timer for casual games (0 minutes)
  if (currentGameTimeControl.value && currentGameTimeControl.value.minutes === 0) {
    return
  }
  
  // The clocks run on wall time, not on counted ticks: a background tab or a
  // busy page gets fewer ticks, and each tick takes off however long it was.
  // Nothing about the opponent's connection pauses either clock.
  let lastTick = Date.now()
  timerInterval = setInterval(() => {
    if (!isGameActive.value) {
      if (timerInterval) clearInterval(timerInterval)
      return
    }
    const now = Date.now()
    const elapsed = (now - lastTick) / 1000
    lastTick = now

    if (isMyTurn.value) {
      myTime.value = Math.max(0, myTime.value - elapsed)

      if (myTime.value <= LOW_TIME_SECONDS && !lowTimeWarningPlayed.value) {
        playLowTimeWarning()
        lowTimeWarningPlayed.value = true
      }

      if (myTime.value <= 0) handleTimeOut()
    } else {
      opponentTime.value = Math.max(0, opponentTime.value - elapsed)
    }
  }, 100)
}

const handleTimeOut = async () => {
  if (timerInterval) clearInterval(timerInterval)
  playLoseSound() // Play lose sound when time runs out
  endReason.value = 'time'
  resign()
  
  if (opponentId.value) {
    const message: ChessMessage = {
      type: 'flag',
      gameId: currentGame.value!.id,
      loser: myPlayer.value?.color
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
const clearAbandonmentTimers = () => stopWatchdog()

// ---------------------------------------------------------------------------
// Live-game timers, as chess.com runs them
// (https://support.chess.com/article/338-how-does-game-abandonment-work):
//
// - First move: each side has 15 s (bullet), 20 s (blitz) or 60 s (rapid and
//   longer) for its first move. Missing it aborts the game: no result.
// - Disconnect: a player whose connection is gone has (base + 40 x increment)
//   x 10% to come back, at least 30 s and at most 3 min, and the countdown
//   only runs on their turn. Coming back in time resumes the game.
// - Long move: in the first 10 moves, a move nearing half the base time gets
//   the shaker warning. Unlike chess.com, it does not end the game.
// - Running out of clock loses on time, whether or not the player is there.
//
// "Gone" means nothing has arrived from the opponent for a while (clock syncs
// arrive every 3 s); a dropped direct link alone is not it, since messages
// still route through the mesh. While we have no links at all, we are the one
// offline, so the opponent's countdown does not run.
// ---------------------------------------------------------------------------
type TimeControlLike = { minutes: number; increment: number } | null

const OPPONENT_GONE_MS = 8000
const estimatedSeconds = (tc: TimeControlLike) => (tc ? tc.minutes * 60 + 40 * tc.increment : 0)
const firstMoveSeconds = (tc: TimeControlLike) => {
  if (!tc || tc.minutes === 0) return 60
  const est = estimatedSeconds(tc)
  return est < 180 ? 15 : est < 600 ? 20 : 60
}
const reconnectSeconds = (tc: TimeControlLike) =>
  Math.min(180, Math.max(30, Math.round(estimatedSeconds(tc) * 0.1)))
const longMoveSeconds = (tc: TimeControlLike) => (tc && tc.minutes > 0 ? tc.minutes * 60 * 0.5 : null)

let lastHeardFromOpponent = Date.now()
let turnStartedAt = Date.now()
/** The turn whose move-timeout warning has played (its turnStartedAt). */
let warnedTurnStartedAt = 0
const MOVE_WARNING_SECONDS = 10
let watchdogInterval: ReturnType<typeof setInterval> | null = null
const opponentGone = ref(false)
const opponentGoneOnTheirTurn = ref(0) // seconds of their reconnect window used
const reconnectWindow = computed(() => reconnectSeconds(currentGameTimeControl.value))

const heardFromOpponent = () => {
  lastHeardFromOpponent = Date.now()
  if (opponentGone.value) {
    opponentGone.value = false
    opponentGoneOnTheirTurn.value = 0
    // They're back: make sure they have every move.
    sendTimerSync()
  }
}

/** Apply moves the opponent has that we missed (their list extends ours). */
const catchUpMoves = (moves: unknown) => {
  const game = currentGame.value
  if (!Array.isArray(moves) || !game || game.status !== 'active') return
  if (moves.length <= game.moves.length) {
    // They are behind: our next sync carries what they need.
    if (moves.length < game.moves.length) sendTimerSync()
    return
  }
  for (let i = 0; i < game.moves.length; i++) if (moves[i] !== game.moves[i]) return // diverged; leave it
  for (const san of moves.slice(game.moves.length)) {
    const before = chess.value.history({ verbose: true }).length
    if (!receiveMove(String(san))) break
    const last = chess.value.history({ verbose: true })[before]
    if (last) lastMove.value = { from: last.from, to: last.to }
    if (!hasGameStarted.value) { hasGameStarted.value = true; seek.settled() }
  }
}

// A new turn starts the first-move and long-move clocks again.
watch(() => currentGame.value?.moves?.length, () => { turnStartedAt = Date.now() })

const startWatchdog = () => {
  stopWatchdog()
  lastHeardFromOpponent = Date.now()
  turnStartedAt = Date.now()
  opponentGone.value = false
  opponentGoneOnTheirTurn.value = 0
  opponentRtt.value = null
  watchdogInterval = setInterval(watchdogTick, 1000)
}

const stopWatchdog = () => {
  if (watchdogInterval) clearInterval(watchdogInterval)
  watchdogInterval = null
  opponentGone.value = false
  opponentGoneOnTheirTurn.value = 0
}

/** Round trip to the opponent, from a ping every 3 s; drives the signal icon. */
const opponentRtt = ref<number | null>(null)
let lastPingAt = 0
/** 4 = strong, 0 = nothing heard for a while. */
const connectionStrength = computed(() => {
  if (opponentGone.value) return 0
  const rtt = opponentRtt.value
  if (rtt === null) return 3
  return rtt < 150 ? 4 : rtt < 400 ? 3 : rtt < 1000 ? 2 : 1
})
const connectionLabel = computed(() =>
  ['Connection lost', 'Weak connection', 'Fair connection', 'Good connection', 'Strong connection'][connectionStrength.value])

const watchdogTick = () => {
  const game = currentGame.value
  if (!game || game.status !== 'active' || isAIGame.value || !myPlayer.value) return stopWatchdog()
  const tc = currentGameTimeControl.value
  const now = Date.now()
  const plies = game.moves.length
  const sideToMove = chess.value.turn() === 'w' ? 'white' : 'black'
  const myMove = sideToMove === myPlayer.value.color
  const onTurnFor = (now - turnStartedAt) / 1000

  // On your turn, the shaker 10 s before a first-move abort, and 10 s before a
  // long move in the first 10 moves (half the base time). A long move only warns.
  if (myMove && warnedTurnStartedAt !== turnStartedAt) {
    const longLimitNow = longMoveSeconds(tc)
    const limit = plies < 2 ? firstMoveSeconds(tc) : (longLimitNow !== null && plies < 20 ? longLimitNow : null)
    if (limit !== null && onTurnFor >= limit - MOVE_WARNING_SECONDS) {
      warnedTurnStartedAt = turnStartedAt
      playLowTimeWarning()
    }
  }

  // First move of each side
  if (plies < 2 && onTurnFor > firstMoveSeconds(tc)) {
    abortGame()
    return
  }

  // Their clock ran out on their move, and they aren't there to say so
  if (hasClock.value && !isMyTurn.value && opponentTime.value <= 0) {
    claimWinOnTime()
    return
  }

  if (now - lastPingAt >= 3000 && opponentId.value) {
    lastPingAt = now
    sendMessage(opponentId.value, JSON.stringify({ type: 'ping', t: now })).catch(() => {})
  }

  // Disconnect: only while we are online, and only on their turn
  const weAreOnline = connectedPeerIds.value.length > 0
  opponentGone.value = weAreOnline && now - lastHeardFromOpponent > OPPONENT_GONE_MS
  if (opponentGone.value && !isMyTurn.value && plies >= 2) {
    opponentGoneOnTheirTurn.value += 1
    if (opponentGoneOnTheirTurn.value >= reconnectWindow.value) abandonGame('peer_disconnect', 'opponent')
  }
}

/** Nobody made a first move in time: the game is called off and not recorded. */
const abortGame = async () => {
  const game = currentGame.value
  if (!game || game.status !== 'active') return
  stopWatchdog()
  const gameId = game.id
  // Who stalled follows from the moves made, so both sides name the same player:
  // no moves, white had the first move; one move, black did.
  const stallerColor: 'white' | 'black' = game.moves.length === 0 ? 'white' : 'black'
  const to = opponentId.value
  abandonmentReason.value = 'aborted'
  iAbandoned.value = stallerColor === myPlayer.value?.color
  showAbandonmentModal.value = true
  // Tell them before the game (and who they are) is cleared.
  if (to) sendMessage(to, JSON.stringify({ type: 'abort', gameId, stallerColor })).catch(() => {})
  returnToLobby()
}

/** Their clock reached zero on their move. */
const claimWinOnTime = async () => {
  if (!currentGame.value || !myPlayer.value || currentGame.value.status !== 'active') return
  stopWatchdog()
  if (timerInterval) clearInterval(timerInterval)
  const myColor = myPlayer.value.color
  currentGame.value.result = myColor
  abandonmentReason.value = 'time'
  endReason.value = 'time'
  iAbandoned.value = false
  showAbandonmentModal.value = true
  endGame()
  if (opponentId.value) {
    sendMessage(opponentId.value, JSON.stringify({ type: 'flag', gameId: currentGame.value.id, loser: myColor === 'white' ? 'black' : 'white' }))
      .catch(() => {})
  }
}

/**
 * End the game by abandonment. `loser` is who abandoned. Both sides may reach
 * this; the message carries the loser's colour so they agree.
 */
const abandonGame = async (reason: 'peer_disconnect', loser: 'me' | 'opponent') => {
  if (!currentGame.value || !myPlayer.value || currentGame.value.status !== 'active') return
  console.log('Game abandoned:', reason, loser)
  stopWatchdog()
  if (timerInterval) clearInterval(timerInterval)

  abandonmentReason.value = reason
  endReason.value = reason
  showAbandonmentModal.value = true
  iAbandoned.value = loser === 'me'

  const myColor = myPlayer.value.color
  const loserColor = loser === 'me' ? myColor : (myColor === 'white' ? 'black' : 'white')
  currentGame.value.result = loserColor === 'white' ? 'black' : 'white'
  endGame()

  if (opponentId.value && !isAIGame.value) {
    const message: ChessMessage = { type: 'abandon', gameId: currentGame.value.id, reason, loser: loserColor }
    sendMessage(opponentId.value, JSON.stringify(message)).catch(() => {})
  }
}

const statusClass = computed(() => {
  if (!isInitialized.value) return 'status-disconnected'
  if (!isConnected.value) return 'status-connecting'
  return 'status-connected'
})

const statusText = computed(() => {
  if (!isInitialized.value) return 'Starting'
  if (!isConnected.value) return 'Connecting'
  return 'Connected'
})

// View helpers for the template
const lobbyChess = createChess()
const pieceColors = computed(() => ({
  whiteFill: settings.value.customWhitePieceColor,
  blackFill: settings.value.customBlackPieceColor,
  whiteStroke: settings.value.customWhitePieceOutline,
  blackStroke: settings.value.customBlackPieceOutline
}))
const pairMoves = (moves: string[]): string[][] => {
  const rows: string[][] = []
  for (let i = 0; i < moves.length; i += 2) rows.push(moves.slice(i, i + 2))
  return rows
}
const capitalise = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : '')
const hasClock = computed(() => Boolean(currentGameTimeControl.value && currentGameTimeControl.value.minutes > 0))
/** The player turned the board around (Flip board). */
const boardFlipped = ref(false)

/* In-game chat: plain text, sent straight to the opponent (encrypted like moves), not saved. */
const CHAT_MAX = 300
type ChatLine = { id: number; mine: boolean; text: string }
const chatMessages = ref<ChatLine[]>([])
const chatDraft = ref('')
const chatList = ref<HTMLElement | null>(null)
let chatSeq = 0
const canChat = computed(() => !isAIGame.value && Boolean(opponentId.value) && Boolean(currentGame.value))
const addChatLine = (mine: boolean, text: string) => {
  chatMessages.value.push({ id: ++chatSeq, mine, text })
  if (chatMessages.value.length > 200) chatMessages.value.splice(0, chatMessages.value.length - 200)
  nextTick(() => { if (chatList.value) chatList.value.scrollTop = chatList.value.scrollHeight })
}
const sendChat = () => {
  const text = chatDraft.value.trim().slice(0, CHAT_MAX)
  const to = opponentId.value
  if (!text || !to) return
  chatDraft.value = ''
  addChatLine(true, text)
  sendMessage(to, JSON.stringify({ type: 'chat', text })).catch((err: unknown) => console.warn('Chat message failed:', err))
}
const clearChat = () => { chatMessages.value = []; chatDraft.value = '' }

/** Why the game ended, when the board alone can't tell. */
const endReason = ref<'resign' | 'time' | 'agreement' | 'peer_disconnect' | null>(null)

/** One sentence: who won and why. */
const resultLine = computed(() => {
  const game = currentGame.value
  if (!game || game.status !== 'finished') return ''
  const mine = myPlayer.value?.color
  const outcome = !game.result || game.result === 'draw' ? 'draw' : game.result === mine ? 'win' : 'loss'
  const c = chess.value
  const reason = endReason.value
    || (c.isCheckmate() ? 'checkmate'
      : c.isStalemate() ? 'stalemate'
      : c.isInsufficientMaterial() ? 'material'
      : c.isThreefoldRepetition() ? 'repetition'
      : c.isDraw() ? 'fifty'
      : null)
  const them = isAIGame.value ? 'The computer' : 'Your opponent'
  if (outcome === 'draw') {
    return ({
      stalemate: 'Draw by stalemate.',
      material: 'Draw. Neither side has enough material to checkmate.',
      repetition: 'Draw by threefold repetition.',
      fifty: 'Draw by the 50-move rule.',
      agreement: 'Draw by agreement.',
    } as Record<string, string>)[reason || ''] || 'Draw.'
  }
  if (outcome === 'win') {
    return ({
      checkmate: 'You won by checkmate.',
      resign: `You won. ${them} resigned.`,
      time: 'You won on time.',
      peer_disconnect: "You won. Your opponent left and didn't come back in time.",
    } as Record<string, string>)[reason || ''] || 'You won.'
  }
  return ({
    checkmate: 'You lost by checkmate.',
    resign: 'You resigned.',
    time: 'You lost on time.',
    peer_disconnect: "You lost. Your connection dropped and didn't come back in time.",
  } as Record<string, string>)[reason || ''] || 'You lost.'
})

const resultClass = computed(() => {
  const result = currentGame.value?.result
  if (!result || result === 'draw') return 'verdict-draw'
  return result === myPlayer.value?.color ? 'verdict-win' : 'verdict-loss'
})
const replayResultText = computed(() => {
  const result = replayGame.value?.result
  if (result === 'win') return 'you won'
  if (result === 'loss') return 'you lost'
  if (result === 'draw') return 'drawn'
  return 'abandoned'
})
const replayOpponentName = computed(() => {
  const game = replayGame.value
  if (!game) return ''
  if (game.isAI) return `Computer, ${(aiLevels[game.aiDifficulty || 0]?.name || 'Easy').toLowerCase()}`
  return (game.opponentUsername?.trim()) || formatPeerId(game.opponent || 'Opponent')
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

// Password strength validation
const validatePasswordStrength = (password: string): { valid: boolean; error: string } => {
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters' }
  }
  
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  
  const criteriaMet = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length
  
  if (criteriaMet < 3) {
    return { 
      valid: false, 
      error: 'Password must include at least 3 of: uppercase, lowercase, numbers, special characters' 
    }
  }
  
  // Check for common weak passwords
  const commonPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein', 'welcome']
  if (commonPasswords.some(weak => password.toLowerCase().includes(weak))) {
    return { valid: false, error: 'Password is too common or weak' }
  }
  
  return { valid: true, error: '' }
}

// Identity/Login handlers
const toggleLoginMode = () => {
  loginMode.value = loginMode.value === 'login' ? 'register' : 'login'
  loginError.value = ''
}

const handleLogin = async () => {
  if (!loginUsername.value || !loginPassword.value) return
  
  // Validate password strength on registration
  if (loginMode.value === 'register') {
    const validation = validatePasswordStrength(loginPassword.value)
    if (!validation.valid) {
      loginError.value = validation.error
      return
    }
  }
  
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
      // Load existing identity (with DHT fallback for cross-device login)
      await loadIdentity(loginUsername.value, loginPassword.value, dhtGet, dhtPut)
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
    await init()
    
    // Start on the configured relays; freertc picks the room's relays from there.
    const mutedUrls = new Set(settings.value.mutedSignalingUrls || [])
    const activeSignalingUrls = settings.value.signalingUrls.filter(url => !mutedUrls.has(url))
    await connect(activeSignalingUrls)

    // Reset retry count - we're operational even without signaling servers
    retryAttempts.value = 0
    
    // Start broadcasting presence regardless of signaling server status
    startPresenceBroadcast()
    
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

const handleMove = async (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => {
  // Special handling for puzzle mode
  if (isPuzzleMode.value && currentPuzzle.value) {
    const success = makeMove({ from, to, promotion })
    if (success && currentGame.value) {
      lastMove.value = { from, to }
      const move = currentGame.value.moves[currentGame.value.moves.length - 1]
      
      // Get the chess move result to check for captures
      const moveHistory = chess.value.history({ verbose: true })
      const lastMoveData = moveHistory[moveHistory.length - 1]
      
      // Play appropriate sound
      if (lastMoveData.captured) {
        playCaptureSound()
      } else if (lastMoveData.flags.includes('k') || lastMoveData.flags.includes('q')) {
        playCastleSound()
      } else {
        playMoveSound()
      }
      
      checkPuzzleMove(move)
    }
    return
  }
  
  const success = makeMove({ from, to, promotion })
  
  if (success && opponentId.value && currentGame.value) {
    // Track the last move for highlighting
    lastMove.value = { from, to }
    
    // Mark that the game has started (first move made)
    if (!hasGameStarted.value) {
      hasGameStarted.value = true
      seek.settled()
    }
    
    // Add increment to my time
    if (currentGameTimeControl.value) {
      myTime.value += currentGameTimeControl.value.increment
      // Reset warning flag if time goes above 20 again
      if (myTime.value > LOW_TIME_SECONDS) {
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
  endReason.value = 'resign'
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
    endReason.value = 'agreement'
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
    endReason.value = 'agreement'
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
  clearChat()
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
  chess.value = createChess()
  
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

// Puzzle mode functions
const startPuzzleMode = () => {
  // Exit any current modes
  if (isReplayMode.value) {
    exitReplayMode()
  }
  if (currentGame.value) {
    returnToLobby()
  }
  
  // Load a random puzzle
  const puzzle = getRandomPuzzle()
  currentPuzzle.value = puzzle
  isPuzzleMode.value = true
  puzzleMoveIndex.value = 0
  puzzleResult.value = 'pending'
  puzzleMessage.value = puzzle.description
  showPuzzleHint.value = false
  
  // Set up the chess board with the puzzle position
  chess.value = new Chess(puzzle.fen)
  
  // Determine who moves first from the FEN
  const sideToMove = chess.value.turn() // 'w' or 'b'
  
  // Create a pseudo game state
  currentGame.value = {
    id: `puzzle-${puzzle.id}`,
    playerWhite: null,
    playerBlack: null,
    currentTurn: sideToMove === 'w' ? 'white' : 'black',
    status: 'active',
    moves: [],
    fen: puzzle.fen,
    createdAt: Date.now()
  }
  
  // Human always plays the side that needs to find the solution (first move in solution)
  // If puzzle starts with opponent's move, we need to play it first
  myPlayer.value = {
    id: 'puzzle-player',
    color: sideToMove === 'w' ? 'white' : 'black'
  }
  
  lastMove.value = null
  viewingMoveIndex.value = null
  showingSolution.value = false
}

const exitPuzzleMode = () => {
  isPuzzleMode.value = false
  currentPuzzle.value = null
  puzzleMoveIndex.value = 0
  puzzleResult.value = 'pending'
  puzzleMessage.value = ''
  showPuzzleHint.value = false
  showingSolution.value = false
  resetGame()
}

const loadNextPuzzle = () => {
  startPuzzleMode()
}

const retryCurrentPuzzle = () => {
  if (!currentPuzzle.value) return
  
  // Keep the same puzzle but reset its state
  const puzzle = currentPuzzle.value
  puzzleMoveIndex.value = 0
  puzzleResult.value = 'pending'
  puzzleMessage.value = puzzle.description
  showPuzzleHint.value = false
  showingSolution.value = false
  
  // Reset the chess board to the puzzle's starting position
  chess.value = new Chess(puzzle.fen)
  
  // Update game state
  if (currentGame.value) {
    currentGame.value.status = 'active'
    currentGame.value.moves = []
    currentGame.value.fen = puzzle.fen
    currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
  }
  
  lastMove.value = null
  viewingMoveIndex.value = null
  puzzleHintSquare.value = null
  showPuzzleMove.value = false
}

const showPuzzleHintPiece = () => {
  if (!currentPuzzle.value) return
  
  showPuzzleHint.value = true
  showPuzzleMove.value = false
  
  // Get the next expected move
  const nextMove = currentPuzzle.value.solution[puzzleMoveIndex.value]
  
  // Parse the move to get the starting square
  // Try to make the move on a temporary board to get the from square
  const tempChess = new Chess(chess.value.fen())
  const moveResult = tempChess.move(nextMove)
  
  if (moveResult) {
    puzzleHintSquare.value = moveResult.from
    // Clear analysis arrows
    analysisArrows.value = []
  }
}

const showPuzzleMoveArrow = () => {
  if (!currentPuzzle.value) return
  
  showPuzzleMove.value = true
  
  // Get the next expected move
  const nextMove = currentPuzzle.value.solution[puzzleMoveIndex.value]
  
  // Parse the move to get from and to squares
  const tempChess = new Chess(chess.value.fen())
  const moveResult = tempChess.move(nextMove)
  
  if (moveResult) {
    analysisArrows.value = [{
      from: moveResult.from,
      to: moveResult.to,
      color: 'blue'
    }]
  }
}

const checkPuzzleMove = (move: string): boolean => {
  if (!currentPuzzle.value || puzzleResult.value !== 'pending') return false
  
  // Clear hint indicators when player makes a move
  puzzleHintSquare.value = null
  analysisArrows.value = []
  showPuzzleHint.value = false
  showPuzzleMove.value = false
  
  const expectedMove = currentPuzzle.value.solution[puzzleMoveIndex.value]
  
  if (move === expectedMove) {
    puzzleMoveIndex.value++
    
    // Check if puzzle is complete
    if (puzzleMoveIndex.value >= currentPuzzle.value.solution.length) {
      puzzleResult.value = 'correct'
      puzzleMessage.value = 'Solved.'
      playWinSound() // Play success sound
      if (currentGame.value) {
        currentGame.value.status = 'finished'
      }
      return true
    }
    
    // If there's an opponent response move, play it automatically
    if (puzzleMoveIndex.value < currentPuzzle.value.solution.length) {
      const opponentMove = currentPuzzle.value.solution[puzzleMoveIndex.value]
      
      // Check if this is an opponent's move (opposite color)
      const currentPlayerColor = myPlayer.value?.color
      const currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
      
      if (currentTurn !== currentPlayerColor) {
        // This is the opponent's turn, play their move automatically
        setTimeout(() => {
          if (!currentPuzzle.value) return
          
          const result = chess.value.move(opponentMove)
          if (result && currentGame.value) {
            currentGame.value.moves.push(result.san)
            currentGame.value.fen = chess.value.fen()
            currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
            lastMove.value = { from: result.from, to: result.to }
            
            // Play move sound
            if (result.captured) {
              playCaptureSound()
            } else {
              playMoveSound()
            }
            
            puzzleMoveIndex.value++
            
            // Check if puzzle is now complete after opponent's move
            if (puzzleMoveIndex.value >= currentPuzzle.value.solution.length) {
              puzzleResult.value = 'correct'
              puzzleMessage.value = 'Solved.'
              playWinSound() // Play success sound
              if (currentGame.value) {
                currentGame.value.status = 'finished'
              }
            } else {
              puzzleMessage.value = `Good! Now find the next move...`
            }
          }
        }, 500) // Small delay to make it feel more natural
      }
    }
    
    puzzleMessage.value = `Good move! Continue...`
    return true
  } else {
    // Incorrect move
    puzzleResult.value = 'incorrect'
    puzzleMessage.value = `The move was ${expectedMove}.`
    if (currentGame.value) {
      currentGame.value.status = 'finished'
    }
    return false
  }
}

const showSolution = async () => {
  if (!currentPuzzle.value || showingSolution.value) return
  
  showingSolution.value = true
  puzzleResult.value = 'pending'
  puzzleMessage.value = 'Showing solution...'
  
  // Reset to puzzle start
  chess.value = new Chess(currentPuzzle.value.fen)
  if (currentGame.value) {
    currentGame.value.moves = []
    currentGame.value.fen = currentPuzzle.value.fen
    currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
  }
  lastMove.value = null
  
  // Play through each move in the solution with delays
  for (let i = 0; i < currentPuzzle.value.solution.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 800)) // 800ms delay between moves
    
    const moveNotation = currentPuzzle.value.solution[i]
    const result = chess.value.move(moveNotation)
    
    if (result && currentGame.value) {
      currentGame.value.moves.push(result.san)
      currentGame.value.fen = chess.value.fen()
      currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
      lastMove.value = { from: result.from, to: result.to }
      
      // Play appropriate sound
      if (result.captured) {
        playCaptureSound()
      } else if (result.flags.includes('k') || result.flags.includes('q')) {
        playCastleSound()
      } else {
        playMoveSound()
      }
      
      puzzleMessage.value = `Solution: ${i + 1}/${currentPuzzle.value.solution.length} - ${result.san}`
    }
  }
  
  // After showing solution, mark as complete
  await new Promise(resolve => setTimeout(resolve, 1000))
  puzzleResult.value = 'correct'
  puzzleMessage.value = 'That was the full solution.'
  if (currentGame.value) {
    currentGame.value.status = 'finished'
  }
  showingSolution.value = false
}

const getResultText = (): string => {
  if (!currentGame.value?.result) return 'Drawn'
  
  if (currentGame.value.result === 'draw') return 'Drawn'
  
  const iWon = currentGame.value.result === myPlayer.value?.color
  return iWon ? 'You won' : 'You lost'
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
    
    // Seeking and match offers
    if (seek.handle(message, fromPeer)) return

    if (fromPeer && fromPeer === opponentId.value) {
      heardFromOpponent()
      if (message.type === 'ping') {
        sendMessage(fromPeer, JSON.stringify({ type: 'pong', t: message.t })).catch(() => {})
        return
      }
      if (message.type === 'pong') {
        if (typeof message.t === 'number') opponentRtt.value = Date.now() - message.t
        return
      }
      if (message.type === 'chat') {
        if (typeof message.text === 'string' && message.text.trim() && canChat.value) {
          addChatLine(false, message.text.trim().slice(0, CHAT_MAX))
        }
        return
      }
    }

    const chessMessage: ChessMessage = message
    
    switch (chessMessage.type) {
      case 'move':
        if (chessMessage.data) {
          // Track the last move for highlighting
          lastMove.value = { from: chessMessage.data.from, to: chessMessage.data.to }
          
          // Mark that the game has started (first move received)
          if (!hasGameStarted.value) {
            hasGameStarted.value = true
            seek.settled()
          }
          
          receiveMove(`${chessMessage.data.from}${chessMessage.data.to}`)
          // Process incoming timer sync if present
          if (chessMessage.timer && chessMessage.vectorClock) {
            processIncomingTimer(chessMessage.timer, chessMessage.vectorClock, fromPeer)
          }
        }
        break
        
      case 'timer_sync':
        catchUpMoves((chessMessage as any).moves)
        if (chessMessage.data && chessMessage.vectorClock) {
          processIncomingTimer(chessMessage.data, chessMessage.vectorClock, fromPeer)
        }
        break
        
      case 'abort':
        if (currentGame.value && currentGame.value.id === chessMessage.gameId && currentGame.value.status === 'active') {
          stopWatchdog()
          abandonmentReason.value = 'aborted'
          const named = (chessMessage as any).stallerColor
          const stallerColor = named === 'white' || named === 'black' ? named : (currentGame.value.moves.length === 0 ? 'white' : 'black')
          iAbandoned.value = stallerColor === myPlayer.value?.color
          showAbandonmentModal.value = true
          returnToLobby()
        }
        break

      case 'flag':
        if (currentGame.value && myPlayer.value && currentGame.value.status === 'active') {
          stopWatchdog()
          if (timerInterval) clearInterval(timerInterval)
          const loser = chessMessage.loser || myPlayer.value.color
          currentGame.value.result = loser === 'white' ? 'black' : 'white'
          abandonmentReason.value = 'time'
          endReason.value = 'time'
          iAbandoned.value = loser === myPlayer.value.color
          showAbandonmentModal.value = true
          endGame()
        }
        break

      case 'resign':
        // Opponent resigned
        console.log('Opponent resigned')
        if (currentGame.value && myPlayer.value) {
          // Set the result before calling endGame so it knows we won
          currentGame.value.result = myPlayer.value.color
          endReason.value = 'resign'
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
          endReason.value = 'agreement'
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
        // Opponent abandoned the game. A long move no longer ends a game, even when an older page says so.
        if (chessMessage.reason === 'long_move') break
        if (currentGame.value && myPlayer.value && currentGame.value.status === 'active') {
          console.log('Game abandoned, reason:', chessMessage.reason, 'loser:', chessMessage.loser)
          clearAbandonmentTimers()
          if (timerInterval) clearInterval(timerInterval)
          
          // The sender says who abandoned; older clients only sent it when they gave up themselves.
          const myColor = myPlayer.value.color
          const loserColor = chessMessage.loser || (myColor === 'white' ? 'black' : 'white')
          currentGame.value.result = loserColor === 'white' ? 'black' : 'white'
          
          abandonmentReason.value = 'peer_disconnect'
          endReason.value = 'peer_disconnect'
          showAbandonmentModal.value = true
          iAbandoned.value = loserColor === myColor
          
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
    
  })
  
  // Set up mesh event listeners
  if (mesh.value) {
    mesh.value.addEventListener('peerConnected', (e: any) => {
      console.log('Peer connected:', e.peerId)
    })
    
    mesh.value.addEventListener('peerDisconnected', (e: any) => {
      console.log('Peer disconnected:', e.peerId)
      // Remove peer from crypto ready set and matchmaking queue
      cryptoReadyPeers.delete(e.peerId)
      // A dropped link is not a player leaving: moves still route through the
      // mesh. The game watchdog decides from what actually arrives.
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
    
    // Pre-fill username if found, but don't auto-show modal
    if (identityUsername.value && !isAuthenticated.value) {
      loginUsername.value = identityUsername.value
      loginMode.value = 'login'
      console.log('Found stored username, ready for login')
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
  seek.dispose()
})
</script>

<style scoped>
/* ---------- top bar ---------- */
.topbar {
  height: var(--topbar);
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0 24px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
  position: relative;
  z-index: 20;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.brand-mark {
  width: 28px;
  height: 28px;
}

.wordmark {
  font-stretch: 125%;
  font-weight: 800;
  font-size: 1.2rem;
  letter-spacing: -0.02em;
}

.net {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ink-2);
  font-size: 0.875rem;
  margin-right: auto;
}

.net-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line-strong);
}

.status-connected .net-dot {
  background: var(--sheen);
}

.status-connecting .net-dot {
  background: var(--slate);
  animation: blink 1.4s ease-in-out infinite;
}

.net-peers {
  padding-left: 0.5rem;
  border-left: 1px solid var(--line);
}

@keyframes blink {
  50% { opacity: 0.3; }
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.nav-link {
  padding: 0.4rem 0.7rem;
  border-radius: var(--radius);
  font-weight: 500;
  color: var(--ink);
}

.nav-link:hover {
  background: var(--wing);
}

.nav-login {
  border: 1px solid var(--line-strong);
  margin-left: 0.5rem;
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--line);
}

.nav-username {
  font-weight: 600;
}

.menu-toggle {
  display: none;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-weight: 500;
}

/* ---------- the table: board on the left, the game on the right ---------- */
.main {
  padding: 20px 24px;
}

.table {
  --side: clamp(300px, 28vw, 380px);
  --board: min(calc(100dvh - var(--topbar) - 40px), calc(100vw - var(--side) - 48px - 32px));
  display: grid;
  grid-template-columns: var(--board) var(--side);
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  grid-template-areas:
    'board head'
    'board top'
    'board info'
    'board moves'
    'board actions'
    'board bottom';
  column-gap: 32px;
  justify-content: center;
  height: var(--board);
}

.board-area {
  grid-area: board;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  width: var(--board);
  height: var(--board);
}

.board-area :deep(.chess-board) {
  max-width: none;
  width: 100%;
}

.side-head {
  grid-area: head;
  padding-bottom: 0.75rem;
}

.side-title {
  font-stretch: 112%;
  font-weight: 700;
  font-size: 1.35rem;
  letter-spacing: -0.01em;
}

.side-meta {
  color: var(--ink-2);
}

/* A seat: one player, their captures and their clock, at the board edge they sit on */
.seat {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    'colour name clock'
    'colour captures clock';
  column-gap: 0.65rem;
  align-items: center;
  align-content: center;
  padding: 0.6rem 0;
}

.seat-top {
  grid-area: top;
  border-bottom: 1px solid var(--line);
}

.seat-bottom {
  grid-area: bottom;
  border-top: 1px solid var(--line);
}

.seat-colour {
  grid-area: colour;
  width: 26px;
  height: 26px;
}

.seat-name {
  grid-area: name;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.signal {
  width: 16px;
  height: 12px;
  margin-left: 0.4rem;
  vertical-align: baseline;
}

.signal rect {
  fill: var(--line);
}

.signal rect.lit {
  fill: var(--ink-2);
}

.signal-1 rect.lit {
  fill: var(--stop);
}

.signal-0 rect {
  fill: none;
  stroke: var(--stop);
  stroke-width: 0.8;
}

.seat-name small {
  font-weight: 400;
  color: var(--ink-2);
  margin-left: 0.4rem;
  font-size: 0.85rem;
}

.seat-captures {
  grid-area: captures;
  display: flex;
  align-items: center;
  min-height: 18px;
}

.seat-captures:empty {
  display: none;
}

.seat-captures img {
  width: 18px;
  height: 18px;
  margin-right: -6px;
}

.seat-captures b {
  margin-left: 10px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-2);
}

/* The clocks are the loud thing on the page */
.seat-clock {
  grid-area: clock;
  font-stretch: 75%;
  font-weight: 700;
  font-size: 2.6rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  padding: 0.35rem 0.6rem 0.4rem;
  border-radius: var(--radius);
  color: var(--ink-2);
  background: transparent;
  min-width: 5.2ch;
  text-align: right;
}

.seat.running .seat-clock {
  color: #fff;
  background: var(--sheen);
}

/* Under 20 s: yellow, with tenths */
.seat-clock.low,
.seat.running .seat-clock.low {
  color: #1c2126;
  background: var(--mark);
}

.seat.check .seat-colour {
  border-radius: 50%;
  background: var(--stop-wash);
  box-shadow: 0 0 0 2px var(--stop);
}

.side-info {
  grid-area: info;
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.side-info:empty {
  display: none;
}

.turn {
  font-weight: 600;
  color: var(--ink-2);
}

.turn.mine {
  color: var(--sheen);
}

.opening {
  font-style: italic;
  color: var(--ink-2);
}

.note,
.prompt {
  color: var(--ink-2);
}

.prompt {
  color: var(--ink);
}

.legend {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.key {
  display: inline-block;
  width: 18px;
  height: 4px;
  border-radius: 2px;
  margin-left: 0.4rem;
}

.key:first-child {
  margin-left: 0;
}

.key-1 { background: #4ade80; }
.key-2 { background: #fbbf24; }
.key-3 { background: #f87171; }

.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}

.result-line {
  font-weight: 600;
  font-size: 1.05rem;
}

/* ---------- moves ---------- */
.moves {
  grid-area: moves;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--line);
}

.moves-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0.4rem 0;
}

.moves-count {
  flex: 1;
  text-align: center;
  font-size: 0.85rem;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}

.step {
  width: 34px;
  height: 30px;
  border-radius: var(--radius);
  font-size: 1.15rem;
  line-height: 1;
  color: var(--ink);
}

.step:hover:not(:disabled) {
  background: var(--wing);
}

.step:disabled {
  color: var(--line-strong);
}

.move-list {
  list-style: none;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  font-variant-numeric: tabular-nums;
}

.move-list li {
  display: grid;
  grid-template-columns: 2.4rem 1fr 1fr;
  align-items: center;
}

.move-list li:nth-child(even) {
  background: rgba(214, 220, 224, 0.45);
}

.move-list li.empty {
  display: block;
  padding: 0.5rem 0;
  color: var(--ink-2);
  background: none;
}

.move-no {
  color: var(--ink-2);
  font-size: 0.85rem;
  padding-left: 0.4rem;
}

.ply {
  text-align: left;
  padding: 0.3rem 0.5rem;
  font-weight: 500;
  border-radius: 4px;
}

.ply:hover {
  background: var(--wing);
}

.ply.current {
  background: var(--mark);
  color: #1c2126;
}

/* ---------- chat ---------- */
.table.has-chat {
  grid-template-rows: auto auto auto minmax(0, 1fr) minmax(0, 1fr) auto auto;
  grid-template-areas:
    'board head'
    'board top'
    'board info'
    'board moves'
    'board chat'
    'board actions'
    'board bottom';
}

.chat {
  grid-area: chat;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: 1px solid var(--line);
  padding-top: 0.4rem;
}

.chat-list {
  list-style: none;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.92rem;
}

.chat-list li {
  overflow-wrap: anywhere;
}

.chat-list li.empty {
  color: var(--ink-2);
}

.chat-who {
  font-weight: 700;
  margin-right: 0.4rem;
  color: var(--ink-2);
}

.chat-list li.mine .chat-who {
  color: var(--sheen);
}

.chat-form {
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem 0 0.2rem;
}

.chat-input {
  flex: 1;
  min-width: 0;
}

/* ---------- actions and buttons ---------- */
.actions {
  grid-area: actions;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--line);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 0.85rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
  font-weight: 600;
  font-size: 0.9rem;
}

a.btn {
  color: var(--ink);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.btn:hover:not(:disabled) {
  border-color: var(--ink-2);
}

.btn:disabled {
  opacity: 0.45;
}

.btn.on {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.btn-go {
  background: var(--sheen);
  border-color: var(--sheen);
  color: #fff;
}

.btn-go:hover:not(:disabled) {
  background: var(--sheen-deep);
  border-color: var(--sheen-deep);
}

.btn-stop {
  color: var(--stop);
  border-color: transparent;
  background: transparent;
  margin-left: auto;
}

.btn-stop:hover:not(:disabled) {
  border-color: var(--stop);
  background: var(--stop-wash);
}

.btn-wide {
  width: 100%;
  padding: 0.8rem 1rem;
  font-size: 1rem;
}

.alert {
  color: var(--stop);
  font-weight: 500;
}

/* ---------- lobby ---------- */
.lobby {
  grid-template-rows: 1fr;
  grid-template-areas: 'board panel';
}

.lobby .board-area {
  opacity: 0.92;
  pointer-events: none;
}

.lobby-panel {
  grid-area: panel;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.lobby-title {
  font-stretch: 118%;
  font-weight: 800;
  font-size: 1.9rem;
  line-height: 1.05;
  letter-spacing: -0.025em;
}

.lobby-title-2 {
  font-size: 1.35rem;
  margin-top: 0.75rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--line);
}

.lobby-sub {
  color: var(--ink-2);
  max-width: 34ch;
}

.controls {
  border: 0;
}

.controls legend {
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--ink-2);
  font-size: 0.875rem;
}

.clock-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  overflow: hidden;
}

.clock-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.25rem;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.clock-pick:nth-child(4n) {
  border-right: 0;
}

.clock-pick:nth-last-child(-n + 4) {
  border-bottom: 0;
}

.clock-pick:hover:not(:disabled):not(.picked) {
  background: var(--wing);
}

.pick-time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 1rem;
}

.pick-name {
  font-size: 0.75rem;
  color: var(--ink-2);
}

.clock-pick.picked {
  background: var(--ink);
  color: #fff;
}

.clock-pick.picked .pick-name {
  color: var(--wing);
}

.clock-pick:disabled:not(.picked) {
  color: var(--line-strong);
}

.searching {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--sheen);
  border-radius: var(--radius);
  background: var(--sheen-wash);
}

.searching p {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 500;
}

.pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--sheen);
  animation: blink 1.2s ease-in-out infinite;
}

.levels {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
}

.level {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: left;
}

.level:hover:not(.picked) {
  border-color: var(--ink-2);
}

.level-name {
  font-weight: 700;
}

.level-elo {
  font-size: 0.75rem;
  color: var(--ink-2);
}

.level.picked {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.you {
  margin-top: auto;
  padding-top: 1rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}

/* ---------- sheets (dialogs) ---------- */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(28, 33, 38, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}

.sheet {
  width: min(100%, 400px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 1.4rem;
  box-shadow: 0 18px 50px rgba(28, 33, 38, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.sheet h3 {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.25;
}

.sheet p {
  color: var(--ink-2);
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.sheet-foot {
  font-size: 0.875rem;
}

.sheet-foot a {
  color: var(--sheen);
  font-weight: 600;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-weight: 600;
  font-size: 0.875rem;
}

.rules {
  list-style: none;
  font-size: 0.8rem;
  color: var(--ink-2);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.15rem 1rem;
}

.rules li::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
  margin-right: 0.45rem;
}

.rules li.met {
  color: var(--ink);
}

.rules li.met::before {
  background: var(--sheen);
  border-color: var(--sheen);
}

/* ---------- narrow screens: the board takes the width, seats above and below it ---------- */
@media (max-width: 860px) {
  .topbar {
    padding: 0 16px;
    gap: 0.75rem;
  }

  .net {
    font-size: 0.8rem;
  }

  .net-peers {
    display: none;
  }

  .menu-toggle {
    display: block;
  }

  .nav {
    display: none;
    position: absolute;
    top: var(--topbar);
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
    padding: 0.5rem 16px 0.75rem;
  }

  .nav.open {
    display: flex;
  }

  .nav-link {
    text-align: left;
    padding: 0.65rem 0.5rem;
  }

  .nav-login,
  .nav-user {
    margin-left: 0;
    border-left: 0;
    padding-left: 0;
  }

  .main {
    padding: 12px 16px 24px;
  }

  .table {
    --board: calc(100vw - 32px);
    grid-template-columns: 100%;
    grid-template-rows: none;
    grid-template-areas:
      'head'
      'top'
      'board'
      'bottom'
      'info'
      'actions'
      'moves';
    height: auto;
  }

  .seat-top {
    border-bottom: 0;
  }

  .seat-bottom {
    border-top: 0;
  }

  .seat-clock {
    font-size: 2rem;
  }

  .moves {
    max-height: 40vh;
  }

  .table.has-chat {
    grid-template-rows: none;
    grid-template-areas:
      'head'
      'top'
      'board'
      'bottom'
      'info'
      'actions'
      'chat'
      'moves';
  }

  .chat {
    max-height: 40vh;
    min-height: 8rem;
  }

  .actions {
    border-top: 0;
    padding-top: 0;
  }

  .lobby {
    grid-template-areas:
      'panel'
      'board';
  }

  .lobby .board-area {
    margin-top: 1.5rem;
  }

  .lobby-panel {
    overflow: visible;
  }

  .lobby-title {
    font-size: 1.6rem;
  }

  .levels {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 380px) {
  .clock-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .clock-pick:nth-child(4n) {
    border-right: 1px solid var(--line);
  }

  .clock-pick:nth-child(3n) {
    border-right: 0;
  }

  .clock-pick:nth-last-child(-n + 4) {
    border-bottom: 1px solid var(--line);
  }

  .clock-pick:nth-last-child(-n + 3) {
    border-bottom: 0;
  }
}
</style>

