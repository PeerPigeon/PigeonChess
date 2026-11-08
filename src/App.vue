<template>
  <div id="app" class="app">
    <header class="topbar">
      <button type="button" class="brand" title="Home" aria-label="PigeonChess, home" @click="goHome">
        <img src="/pigeonlogo.svg" alt="" class="brand-mark" />
        <span class="wordmark">PigeonChess</span>
      </button>

      <p class="net" :class="statusClass" role="status">
        <span class="net-dot" aria-hidden="true" :title="statusText"></span>
        <span class="net-text">{{ statusText }}</span>
        <span v-if="isConnected" class="net-peers">
          {{ otherPeersCount }}<span class="net-peers-word">{{ otherPeersCount === 1 ? '\u00a0player' : '\u00a0players' }}</span> online
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
        <button v-else class="nav-link nav-login" @click="loginMode = 'login'; loginError = ''; showLoginModal = true; showMenu = false">Log in</button>
      </nav>
      <button
        type="button"
        class="theme-switch"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
        @click="setTheme(theme === 'dark' ? 'light' : 'dark')"
      >
        <svg v-if="theme === 'dark'" viewBox="0 0 576 512" aria-hidden="true"><path :d="SUN_PATH" /></svg>
        <svg v-else viewBox="0 0 512 512" aria-hidden="true"><path :d="MOON_PATH" /></svg>
      </button>
      <button class="menu-toggle" :aria-expanded="showMenu" :aria-label="showMenu ? 'Close menu' : 'Menu'" @click="showMenu = !showMenu">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="showMenu" d="M6 6l12 12M18 6L6 18" />
          <path v-else d="M4 7h16M4 12h16M4 17h16" />
        </svg>
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
          <h2 class="side-title">{{ sharedView ? 'Shared game' : 'Review' }}</h2>
          <p class="side-meta">
            {{ new Date(replayGame.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }}, {{ replayResultText }}
          </p>
          <p v-if="sharedNote" class="shared-note" :class="sharedCheck">{{ sharedNote }}</p>
        </div>

        <div class="seat seat-top">
          <img class="seat-colour" :src="`/pieces/${replayGame.myColor === 'white' ? 'b' : 'w'}k.svg`" alt="" />
          <span class="seat-name">{{ replayOpponentName }}</span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[replayGame.myColor === 'white' ? 'black' : 'white']" :key="`ro-${idx}`" :src="capturedSrc(replayGame.myColor === 'white' ? 'w' : 'b', piece)" :alt="piece" />
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
          <button class="btn" @click="shareReplayGame">{{ shareWord || 'Share this game' }}</button>
          <button class="btn" @click="exitReplayMode">Back to the lobby</button>
        </div>

        <div class="seat seat-bottom">
          <img class="seat-colour" :src="`/pieces/${replayGame.myColor === 'white' ? 'w' : 'b'}k.svg`" alt="" />
          <span class="seat-name">{{ (replayGame.myUsername?.trim()) || (sharedView ? 'Player' : 'You') }}</span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[replayGame.myColor === 'white' ? 'white' : 'black']" :key="`rm-${idx}`" :src="capturedSrc(replayGame.myColor === 'white' ? 'b' : 'w', piece)" :alt="piece" />
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
          <h2 class="lobby-title">Play</h2>
          <div class="mode-toggle" role="radiogroup" aria-label="Opponent">
            <button
              type="button"
              role="radio"
              class="mode-option"
              :class="{ picked: playMode === 'someone' }"
              :aria-checked="playMode === 'someone'"
              :disabled="isSearching"
              @click="setPlayMode('someone')"
            >Someone</button>
            <button
              type="button"
              role="radio"
              class="mode-option"
              :class="{ picked: playMode === 'computer' }"
              :aria-checked="playMode === 'computer'"
              :disabled="isSearching"
              @click="setPlayMode('computer')"
            >Computer</button>
          </div>

          <template v-if="playMode === 'someone'">
          <p v-if="!isInitialized || !isConnected" class="lobby-sub">Connecting to relays. You can play the computer while you wait.</p>

          <fieldset class="controls">
            <legend>
              <button class="controls-toggle" :aria-expanded="timeControlsOpen" @click="timeControlsOpen = !timeControlsOpen">
                <span>Time control</span>
                <span class="controls-picked">{{ selectedTimeControlLabel }}</span>
                <span class="controls-chevron" aria-hidden="true">{{ timeControlsOpen ? '▴' : '▾' }}</span>
              </button>
            </legend>
            <div v-show="timeControlsOpen" class="clock-grid">
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
                <span class="pick-name">{{ control.id === 'any' ? `first free · ${anyMeansLabel}` : control.name.toLowerCase() }}</span>
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
          </template>

          <template v-else>
          <div v-if="pigeonAIOffered" class="mode-toggle engine-pick" role="radiogroup" aria-label="Computer">
            <button type="button" role="radio" class="mode-option" :class="{ picked: aiEngine === 'standard' }" :aria-checked="aiEngine === 'standard'" @click="setAIEngine('standard')">Standard</button>
            <button type="button" role="radio" class="mode-option" :class="{ picked: aiEngine === 'pigeonai' }" :aria-checked="aiEngine === 'pigeonai'" @click="setAIEngine('pigeonai')">PigeonAI</button>
          </div>
          <template v-if="pigeonAIOffered && aiEngine === 'pigeonai'">
          <p class="engine-note">PigeonAI is a language model (the 1-bit Bonsai) run by everyone on PigeonChess together: each device with a GPU holds a share of it. It is asked for every move, and plays a legal one.</p>
          <p class="engine-status" :class="{ ready: pigeonAI.ready.value }"><PigeonAIStatus :text="pigeonAI.status.value" :progress="pigeonAI.progress.value" :ready="pigeonAI.ready.value" :paused="pigeonAI.paused.value" /></p>
          <div class="row">
            <button class="btn btn-go btn-wide" @click="startAIGame">Start against PigeonAI</button>
          </div>
          </template>
          <template v-else>
          <div class="difficulty">
            <label class="difficulty-head" for="difficulty">
              <span class="difficulty-label">Difficulty</span>
              <span class="difficulty-value">{{ aiLevels[aiDifficulty].name }} <span class="difficulty-elo">{{ aiLevels[aiDifficulty].elo }}</span></span>
            </label>
            <input
              id="difficulty"
              v-model.number="aiDifficulty"
              class="difficulty-slider"
              type="range"
              min="0"
              :max="aiLevels.length - 1"
              step="1"
              :aria-valuetext="`${aiLevels[aiDifficulty].name}, ${aiLevels[aiDifficulty].elo}`"
              :style="{ '--fill': `${(aiDifficulty / (aiLevels.length - 1)) * 100}%` }"
            />
            <div class="difficulty-ticks" aria-hidden="true">
              <button v-for="(label, level) in aiLevels" :key="level" type="button" tabindex="-1" :class="{ picked: aiDifficulty === level }" @click="aiDifficulty = level">{{ label.name }}</button>
            </div>
          </div>
          <div class="row">
            <button class="btn btn-go btn-wide" @click="startAIGame">Start against {{ aiLevels[aiDifficulty].name.toLowerCase() }}</button>
          </div>
          </template>
          </template>

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
            {{ isAIGame ? computerName(gameEngine, aiDifficulty) : (opponentName || formatPeerId(opponentId || 'Opponent')) }}
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
            <small v-if="aiThinking">{{ pigeonAsking ? 'asking PigeonAI' : 'thinking' }}</small>
          </span>
          <span v-if="isAIGame && gameEngine === 'pigeonai'" class="pigeon-note" :class="{ backup: pigeonNote.includes('backup') }">
            <template v-if="pigeonNote">{{ pigeonNote }}</template>
            <PigeonAIStatus v-else :text="pigeonAI.status.value" :progress="pigeonAI.progress.value" :ready="pigeonAI.ready.value" :paused="pigeonAI.paused.value" />
            <template v-if="pigeonTally.pigeon + pigeonTally.backup">· PigeonAI {{ pigeonTally.pigeon }}, backup {{ pigeonTally.backup }}</template>
          </span>
          <span class="seat-captures">
            <img v-for="(piece, idx) in capturedPieces[myPlayer?.color === 'white' ? 'black' : 'white']" :key="`go-${idx}`" :src="capturedSrc(myPlayer?.color === 'white' ? 'w' : 'b', piece)" :alt="piece" />
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
            <div class="row">
              <button class="btn" @click="shareFinishedGame">{{ shareWord || 'Share this game' }}</button>
              <button class="btn btn-go" @click="returnToLobby">Back to the lobby</button>
            </div>
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
            <li v-if="!chatMessages.length" class="empty">{{ chatWithPigeonAI ? 'Say hello to PigeonAI.' : 'Say hello to your opponent.' }}</li>
            <li v-for="m in chatMessages" :key="m.id" :class="{ mine: m.mine }">
              <span class="chat-who">{{ m.mine ? 'You:' : chatWithPigeonAI ? 'PigeonAI:' : 'Opp:' }}</span>
              <span class="chat-text">{{ m.text }}</span>
            </li>
            <li v-if="pigeonTyping" class="empty">PigeonAI is writing…</li>
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
            <img v-for="(piece, idx) in capturedPieces[myPlayer?.color === 'white' ? 'white' : 'black']" :key="`gm-${idx}`" :src="capturedSrc(myPlayer?.color === 'white' ? 'b' : 'w', piece)" :alt="piece" />
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
      :time-controls="timeControls"
      :notifications-on="notify.on.value"
      :notifications-available="notify.available"
      :notifications-status="notify.status.value"
      :notifications-test-result="notifyTestResult"
      @toggle-notifications="(on: boolean) => { void notify.setEnabled(on) }"
      @test-notification="() => { notifyTestResult = 'Sending…'; void notify.test().then((r) => { notifyTestResult = r }) }"
    />

    <GameHistory
      v-if="showHistory"
      :game-history="gameHistory"
      @close="showHistory = false"
      @watch="startReplayMode"
      @share="shareHistoryGame"
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

    <div v-if="showLeaveGameModal" class="sheet-backdrop">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <h3>Leave this game?</h3>
        <p>{{ isAIGame ? 'Going home ends your game against the computer, as a loss.' : 'Going home resigns it: it ends now and counts as a loss.' }}</p>
        <div class="sheet-actions">
          <button class="btn" @click="showLeaveGameModal = false">Keep playing</button>
          <button class="btn btn-stop" @click="leaveGameAndGoHome">{{ isAIGame ? 'Leave' : 'Resign and leave' }}</button>
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

    <footer class="build-footer">Build {{ BUILD }}</footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Chess } from 'chess.js'
import { createChess, isPigeonVariant } from './utils/variant'
import { boardRef } from './utils/boardRef'
import { pigeonSearch } from './utils/pigeonAi'
import { usePeerPigeon, migrateSignalingUrls } from './composables/usePeerPigeon'
import { forgetSharedGameInUrl, movesPlay, offerLink, sharedGameInUrl, shareUrl, unpackGame } from '@/utils/shareGame'
import { usePigeonAI, startPigeonAIPeer, pigeonAIMove, pigeonAIChat } from './composables/usePigeonAI'
import { useSeek } from './composables/useSeek'
import { loadSeat, makeSeatKeys, open, saveSeat, seal, type Seat, type SeatKeys } from './composables/useSeat'
import { useNotify } from './composables/useNotify'
import ChessBoard from './components/ChessBoard.vue'
import SettingsModal from './components/SettingsModal.vue'
import PigeonAIStatus from './components/PigeonAIStatus.vue'
import GameHistory from './components/GameHistory.vue'
import { useChessGame } from './composables/useChessGame'
import { useSettings } from './composables/useSettings'
import { useSounds, playSoundFile } from './composables/useSounds'
import { timed } from './composables/stallRecorder'

declare const __BUILD__: string
const BUILD = __BUILD__
import { useIdentity } from './composables/useIdentity'
import type { ChessMessage, GameHistoryEntry } from './types'
import { saveToLocalStorage, loadFromLocalStorage } from './utils/helpers'
import { getOpeningName } from './utils/openings'
import { getRandomPuzzle, type ChessPuzzle } from './utils/puzzles'

// Identity
const {
  isAuthenticated,
  username: identityUsername,
  currentIdentity,
  initializeIdP,
  createIdentity,
  loadIdentity,
  logout: logoutIdentity,
  signPlayerClaim,
  verifyPlayerClaim
} = useIdentity()

// The opponent's account name, once their signed claim checks out (see
// useIdentity: signPlayerClaim / verifyPlayerClaim). Null shows their peer id.
const opponentName = ref<string | null>(null)

const showLoginModal = ref(false)
const loginMode = ref<'login' | 'register'>('login')
const loginUsername = ref('')
const loginPassword = ref('')
const loginError = ref('')
const loginLoading = ref(false)

// Settings
const { settings, boardThemes, pieceThemes, addSignalingUrl, removeSignalingUrl, resetToDefaults, setBoardTheme, setCustomColors, setPieceColors, setPieceOutlines, setArrowColors, setPieceTheme, toggleSound } = useSettings()
const showSettings = ref(false)
// Notifications (composables/useNotify.ts): your move, game started, while you're away.
const notify = useNotify(settings)
const notifyTestResult = ref('')
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
  onlinePeerIds,
  error,
  init,
  connect,
  sendMessage: rawSendMessage,
  broadcast,
  onMessage,
  onPeerConnect,
  dhtPut,
  dhtGet,
  relayRequest,
  storageSigner,
  loadSharedGame,
  signStorageAs,
  saveGame,
  loadGames
} = usePeerPigeon({
  // Don't provide a custom peerId - let PeerPigeon generate its own
  networkName: (settings.value.networkName || 'global') + (isPigeonVariant ? ':pigeon' : ''),
  maxPeers: 10,
  minPeers: 1,
  enableCrypto: true
})

// The seat (composables/useSeat.ts): who we are in this game, by a key. Every
// message about the game goes sealed (signed, numbered); the other side acts
// only on what its opponent's seat key signed, whatever peer ID it came from.
let seat: Seat | null = null
let nextSeat: SeatKeys | null = null
const prepareSeat = () => {
  if (!nextSeat) void makeSeatKeys().then((keys) => { nextSeat = keys }).catch((err) => console.warn('No seat key:', err))
}
prepareSeat()
/** Messages that are not about a game (finding one, presence): never sealed. */
const NOT_SEALED = new Set(['matchmaking', 'matchOffer', 'matchAccept', 'matchDecline', 'matchCancel', 'peer_presence', 'sealed'])
const typeOf = (message: string) => { try { return String(JSON.parse(message)?.type ?? '') } catch { return '' } }
/** Sends to a peer; a message about the current game to its opponent goes sealed. */
const sendMessage = async (peerId: string, message: string) => {
  if (seat && peerId === opponentId.value && !NOT_SEALED.has(typeOf(message))) {
    const sealed = await seal(seat, message)
    saveSeat(seat)
    return rawSendMessage(peerId, JSON.stringify(sealed))
  }
  return rawSendMessage(peerId, message)
}

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
  { id: 'any', name: 'Any', display: 'Any Time', minutes: 10, increment: 0 }, // both on Any: Settings → "Any" means (10+0 unless changed)
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
// Any to start (Any plays 10+0 unless Settings says otherwise).
try { localStorage.removeItem('pigeonchess:clock') } catch { /* no storage */ }
const selectedTimeControl = ref('any')

// Finding an opponent (see composables/useSeek.ts)
const seek = useSeek({
  myPeerId: computed(() => mesh.value?.peerId ?? null),
  timeControls,
  selectedTimeControl,
  broadcast: (message: string) => broadcast(message, false),
  sendMessage: (peerId: string, message: string) => sendMessage(peerId, message),
  isPlaying: () => isGameActive.value,
  mySeat: () => nextSeat?.pub ?? null,
  anyMeans: () => settings.value.anyTimeControl || 'rapid10',
  onMatched: (match) => startMatchedGame(match),
  onCancelled: () => {
    console.log('Opponent withdrew before the first move; searching again')
    clearAbandonmentTimers()
    returnToLobby()
  }
})
const isSearching = seek.isSearching

const anyMeansLabel = computed(() => {
  const tc = timeControls.find((c) => c.id === (settings.value.anyTimeControl || 'rapid10'))
  return !tc ? '10+0' : tc.minutes === 0 ? 'no clock' : tc.display
})

const selectedTimeControlDisplay = computed(() => {
  return timeControls.find(tc => tc.id === selectedTimeControl.value)?.display || ''
})

// Collapsed by default on a phone-sized screen, where the grid takes most of
// the view; open on wider screens. The header shows the current pick.
const timeControlsOpen = ref(typeof window === 'undefined' || !window.matchMedia('(max-width: 860px)').matches)
const selectedTimeControlLabel = computed(() => {
  const tc = timeControls.find((c) => c.id === selectedTimeControl.value)
  if (!tc) return ''
  if (tc.id === 'any') return `Any · ${anyMeansLabel.value}`
  return tc.minutes === 0 ? 'No clock' : `${tc.display} ${tc.name.toLowerCase()}`
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
const startMatchedGameReset = () => { endReason.value = null; boardFlipped.value = false; opponentName.value = null; clearChat() }
const startMatchedGame = (match: { gameId: string; opponent: string; myColor: 'white' | 'black'; timeControl: { minutes: number; increment: number }; theirSeat?: string }) => {
  startMatchedGameReset()
  // Both sides sent a seat key: from here on the game's messages go sealed.
  // (An older page sends none: its game runs unsealed, as before.)
  seat = match.theirSeat && nextSeat ? { gameId: match.gameId, mine: nextSeat, theirs: match.theirSeat, sent: 0, heard: 0 } : null
  nextSeat = null
  prepareSeat()
  console.log('Matched with', match.opponent, 'as', match.myColor, 'game', match.gameId, match.theirSeat ? 'sealed' : 'unsealed (no seat key from them)')
  currentGameTimeControl.value = { minutes: match.timeControl.minutes, increment: match.timeControl.increment }
  resetTimers()
  isAIGame.value = false
  startNewGame(myPeerId.value, match.opponent, match.myColor, match.gameId)
  opponentId.value = match.opponent
  hasGameStarted.value = false
  startTimer()
  startTimerSyncBroadcast()
  startWatchdog()
  introduceMyself()
  saveGameState()
  pushedForMove = -1
  opponentAway.value = false
  opponentSyncMoves = -1
  opponentSyncAt = 0
  // Several times: the side that accepted starts first, so its first copy can
  // reach the other side before that side's game (and seat) exists, and be dropped.
  reachMeTimers.forEach(clearTimeout)
  reachMeTimers = [0, 2000, 5000, 15000, 30000].map((ms) => setTimeout(() => tellOpponentHowToReachMe(), ms))
  void notify.showHere('start', match.gameId)
}
let reachMeTimers: ReturnType<typeof setTimeout>[] = []

// Tell the opponent who we are (when logged in). Sent at the start and twice
// more over the first seconds, since the first copy can go out before their
// keys or the link are ready; also when logging in mid-game.
let introduceTimers: ReturnType<typeof setTimeout>[] = []
const sendPlayerClaim = async () => {
  const game = currentGame.value
  const to = opponentId.value
  const me = myPeerId.value
  if (!game || !to || !me || isAIGame.value || game.status !== 'active') return
  const claim = await signPlayerClaim(game.id, me).catch(() => null)
  if (claim) sendMessage(to, JSON.stringify({ type: 'player', gameId: game.id, ...claim })).catch(() => {})
}
const introduceMyself = () => {
  introduceTimers.forEach(clearTimeout)
  introduceTimers = [0, 3000, 10000].map((ms) => setTimeout(() => { void sendPlayerClaim() }, ms))
}
watch(() => identityUsername.value, () => { if (isGameActive.value) void sendPlayerClaim() })

// ---------------------------------------------------------------------------
// Picking a game back up after a reload (or a tap on a notification): the
// game is kept in this browser with its seat. With a new peer ID, the page
// says "I'm back", sealed with the seat key, straight to the opponent and to
// the room (they may have a new peer ID too), until they answer.

/** Keep the game, as it stands, with the seat. */
const saveGameState = () => {
  const game = currentGame.value
  if (!seat || !game || game.status !== 'active' || !myPlayer.value || !opponentId.value || game.id !== seat.gameId) return
  const mine = myPlayer.value.color
  seat.game = {
    gameId: game.id,
    myColor: mine,
    opponentId: opponentId.value,
    moves: [...game.moves],
    timeControl: currentGameTimeControl.value ?? { minutes: 0, increment: 0 },
    whiteTime: mine === 'white' ? myTime.value : opponentTime.value,
    blackTime: mine === 'black' ? myTime.value : opponentTime.value,
    createdAt: game.createdAt ?? Date.now(),
    savedAt: Date.now(),
    started: hasGameStarted.value,
  }
  saveSeat(seat)
}
/** Set up once the whole page is (in onMounted: these read state declared further down). */
const watchSeatedGame = () => {
  // Against the computer: kept after each move; let go when the game ends.
  watch(() => currentGame.value?.moves?.length, () => saveAIGame())
  watch(() => chatMessages.value.length, () => saveAIGame())
  watch(() => currentGame.value?.status, (status) => { if (isAIGame.value && status && status !== 'active') dropAIGame() })
  setInterval(() => { if (seat && isGameActive.value) saveGameState() }, 2000)
  watch(() => currentGame.value?.moves?.length, () => saveGameState())
  watch(() => currentGame.value?.status, (status) => {
    // A finished game is not picked up again (its seat stays, for the last messages).
    if (seat && status && status !== 'active') { keepEnding(); seat.game = undefined; saveSeat(seat) }
  })
  watch(() => opponentGone.value, (gone) => { if (gone) notifyOpponentIfAway() })
}

// --- Notifications for the opponent: our push subscription, and whether we're away.
/** Whether the opponent said their page is in the background or closed. */
const opponentAway = ref(false)
let pushedForMove = -1
const tellOpponentHowToReachMe = () => {
  if (!seat || !opponentId.value || !isGameActive.value) return
  sendMessage(opponentId.value, JSON.stringify({ type: 'notify', gameId: seat.gameId, sub: notify.on.value ? notify.subscription.value : null })).catch(() => {})
}
const tellOpponentAway = (away: boolean) => {
  if (!seat || !opponentId.value || !isGameActive.value) return
  sendMessage(opponentId.value, JSON.stringify({ type: 'away', gameId: seat.gameId, away })).catch(() => {})
}
watch(() => notify.subscription.value?.endpoint, () => tellOpponentHowToReachMe())
watch(() => notify.on.value, () => tellOpponentHowToReachMe())
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => tellOpponentAway(document.visibilityState !== 'visible'))
  addEventListener('pagehide', () => tellOpponentAway(true))
}
/** It's their move and they're away: ask chess.peer.ooo to tell them (once per move). */
const notifyOpponentIfAway = () => {
  const game = currentGame.value
  if (!seat?.theirPush || !game || game.status !== 'active' || isMyTurn.value) return
  if (!opponentAway.value && !opponentGone.value) return
  if (pushedForMove === game.moves.length) return
  pushedForMove = game.moves.length
  void notify.pushTo(seat.theirPush, 'move', game.id).then((r) => {
    if (r === 'gone' && seat) { seat.theirPush = undefined; saveSeat(seat) }
  })
}

/** The same player (their seat key says so) is now at another peer ID. */
const rejoinedAs = (peerId: string) => {
  console.log('Opponent is back as', peerId.slice(0, 8))
  opponentId.value = peerId
  const game = currentGame.value
  if (game && myPlayer.value) {
    if (myPlayer.value.color === 'white') game.playerBlack = peerId
    else game.playerWhite = peerId
  }
  saveGameState()
}

let rejoinTimer: ReturnType<typeof setInterval> | null = null
const stopRejoining = () => { if (rejoinTimer) clearInterval(rejoinTimer); rejoinTimer = null }
const sayImBack = async () => {
  if (!seat || !isGameActive.value) { stopRejoining(); return }
  const sealed = JSON.stringify(await seal(seat, JSON.stringify({ type: 'rejoin', gameId: seat.gameId })))
  saveSeat(seat)
  if (opponentId.value) rawSendMessage(opponentId.value, sealed).catch(() => {})
  broadcast(sealed, false).catch(() => {})
}

/** On start: a game this browser was playing, if there is one still worth going back to. */
const restoreGame = () => {
  const saved = loadSeat()
  const g = saved?.game
  const me = mesh.value?.peerId
  if (!saved || !g || !me) { if (saved && !g) saveSeat(null); return false }
  // Past the longest reconnect window the opponent has called it.
  if (Date.now() - g.savedAt > 10 * 60_000) { saveSeat(null); return false }
  seat = saved
  console.log('Picking up game', g.gameId, 'as', g.myColor)
  startMatchedGameReset()
  currentGameTimeControl.value = g.timeControl
  resetTimers()
  isAIGame.value = false
  startNewGame(me, g.opponentId, g.myColor, g.gameId)
  for (const san of g.moves) receiveMove(san)
  if (currentGame.value) currentGame.value.createdAt = g.createdAt
  opponentId.value = g.opponentId
  hasGameStarted.value = g.started
  // The clocks, less the time that passed on the side to move.
  const away = (Date.now() - g.savedAt) / 1000
  const toMove = currentGame.value?.currentTurn
  const white = Math.max(0, g.whiteTime - (toMove === 'white' && g.started ? away : 0))
  const black = Math.max(0, g.blackTime - (toMove === 'black' && g.started ? away : 0))
  myTime.value = g.myColor === 'white' ? white : black
  opponentTime.value = g.myColor === 'white' ? black : white
  const last = chess.value.history({ verbose: true }).slice(-1)[0] as any
  lastMove.value = last ? { from: last.from, to: last.to } : null
  startTimer()
  startTimerSyncBroadcast()
  startWatchdog()
  stopRejoining()
  void sayImBack()
  rejoinTimer = setInterval(() => { void sayImBack() }, 3000)
  introduceMyself()
  pushedForMove = -1
  setTimeout(tellOpponentHowToReachMe, 1500)
  return true
}

// A game against the computer, kept for this tab and this browser as it goes, so a reload picks it up.
const AI_GAME = 'pigeonchess:ai-game'
interface SavedAIGame { moves: string[]; myColor: 'white' | 'black'; difficulty: number; pigeon: boolean; engine?: AIEngine; chat?: { mine: boolean; text: string }[]; savedAt: number }
const saveAIGame = () => {
  const game = currentGame.value
  if (!isAIGame.value || !game || game.status !== 'active' || !myPlayer.value) return
  const text = JSON.stringify({ moves: [...game.moves], myColor: myPlayer.value.color, difficulty: aiDifficulty.value, pigeon: isPigeonVariant, engine: gameEngine.value, chat: chatMessages.value.slice(-50).map((l) => ({ mine: l.mine, text: l.text })), savedAt: Date.now() } satisfies SavedAIGame)
  try { sessionStorage.setItem(AI_GAME, text) } catch { /* no storage here */ }
  try { localStorage.setItem(AI_GAME, text) } catch { /* no storage here */ }
}
const dropAIGame = () => {
  try { sessionStorage.removeItem(AI_GAME) } catch { /* no storage here */ }
  try { localStorage.removeItem(AI_GAME) } catch { /* no storage here */ }
}
const loadAIGame = (): SavedAIGame | null => {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const g = JSON.parse(store().getItem(AI_GAME) || 'null') as SavedAIGame | null
      if (g && Array.isArray(g.moves) && (g.myColor === 'white' || g.myColor === 'black')) return g
    } catch { /* unreadable: try the next */ }
  }
  return null
}
/** On start: a game against the computer this tab (or browser) was playing, picked up where it was. */
const restoreAIGame = () => {
  const g = loadAIGame()
  // The other board (chess or pigeon) keeps its own; a week-old one is let go.
  if (!g || g.pigeon !== isPigeonVariant || Date.now() - g.savedAt > 7 * 24 * 3600_000) return false
  console.log('Picking up the game against the computer:', g.moves.length, 'moves, as', g.myColor)
  endReason.value = null
  boardFlipped.value = false
  lastMove.value = null
  currentGameTimeControl.value = { minutes: 0, increment: 0 }
  resetTimers()
  isAIGame.value = true
  aiDifficulty.value = g.difficulty
  gameEngine.value = g.engine === 'pigeonai' && pigeonAIOffered ? 'pigeonai' : 'standard'
  setAIOpponent(true, g.difficulty, gameEngine.value)
  opponentName.value = null
  startNewGame(myPeerId.value, 'AI-Opponent', g.myColor)
  for (const san of g.moves) if (!receiveMove(san)) break
  // The chat with PigeonAI, as it was.
  clearChat()
  for (const l of g.chat ?? []) if (typeof l?.text === 'string') addChatLine(!!l.mine, l.text)
  const last = chess.value.history({ verbose: true }).slice(-1)[0] as any
  lastMove.value = last ? { from: last.from, to: last.to } : null
  if (!isGameActive.value) { dropAIGame(); return false }
  // The computer's turn: once its engine is up (a few seconds at most), it moves.
  if (chess.value.turn() !== g.myColor[0]) {
    const started = Date.now()
    const go = () => {
      if (!isAIGame.value || !isGameActive.value || chess.value.turn() === g.myColor[0]) return
      if (!stockfishReady && Date.now() - started < 8000) { setTimeout(go, 250); return }
      makeAIMove()
    }
    setTimeout(go, 300)
  }
  return true
}

// AI opponent
const isAIGame = ref(false)
const aiDifficulty = ref(1) // 0=Easy, 1=Medium, 2=Hard, 3=Very Hard
const aiThinking = ref(false)
const showBestMoves = ref(false) // Toggle for showing best move arrows
const analysisArrows = ref<Array<{ from: string; to: string; color: string }>>([])
const analysisTopMoves = ref<string[]>([])
const lastAIMoveEval = ref<{ bestMove: string; playerMove: string; evaluation: string } | null>(null)
const { playMoveSound, playCaptureSound, playCastleSound, playCheckSound } = useSounds()
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

// The Computer: Stockfish at a chosen level (Standard), or PigeonAI, the model the peers here run
// together (offered when this build has it, on the standard board). Remembered.
type AIEngine = 'standard' | 'pigeonai'
const pigeonAI = usePigeonAI()
const pigeonAIOffered = pigeonAI.here && !isPigeonVariant
const AI_ENGINE_KEY = 'pigeonchess:ai-engine'
const aiEngine = ref<AIEngine>((() => {
  try { return pigeonAIOffered && localStorage.getItem(AI_ENGINE_KEY) === 'pigeonai' ? 'pigeonai' : 'standard' } catch { return 'standard' }
})())
const setAIEngine = (engine: AIEngine) => {
  aiEngine.value = engine
  try { localStorage.setItem(AI_ENGINE_KEY, engine) } catch { /* private mode: not remembered */ }
}
/** Who the Computer is, in words: "PigeonAI", or "Computer, medium". */
const computerName = (engine: AIEngine | undefined, level: number | undefined) =>
  engine === 'pigeonai' ? 'PigeonAI' : `Computer, ${(aiLevels[level || 0]?.name || 'Easy').toLowerCase()}`
/** The engine of the game against the computer in progress. */
const gameEngine = ref<AIEngine>('standard')
/** In a PigeonAI game: whether PigeonAI is being asked now, how the last computer move was made, and the tally. */
const pigeonAsking = ref(false)
let pigeonOutcome: { fen: string; why: string } | null = null
const pigeonNote = ref('')
const pigeonTally = ref({ pigeon: 0, backup: 0 })

const aiLevels = [
  { name: 'Easy', elo: 'about 900' },
  { name: 'Medium', elo: 'about 1300' },
  { name: 'Hard', elo: 'about 1900' },
  { name: 'Master', elo: '2500 and up' }
]

// One "Play" panel: someone (matchmaking) or the computer, remembered.
type PlayMode = 'someone' | 'computer'
const PLAY_MODE_KEY = 'pigeonchess:play-mode'
const playMode = ref<PlayMode>((() => {
  try { return localStorage.getItem(PLAY_MODE_KEY) === 'computer' ? 'computer' : 'someone' } catch { return 'someone' }
})())
const setPlayMode = (mode: PlayMode) => {
  playMode.value = mode
  try { localStorage.setItem(PLAY_MODE_KEY, mode) } catch { /* private mode: not remembered */ }
}

// Light and dark, as on pigeon.peer.ooo: remembered, else the device's choice.
// index.html sets it before the first paint so the page does not flash.
const SUN_PATH = 'M178.2-10.1c7.4-3.1 15.8-2.2 22.5 2.2l87.8 58.2 87.8-58.2c6.7-4.4 15.1-5.2 22.5-2.2S411.4-.5 413 7.3l20.9 103.2 103.2 20.9c7.8 1.6 14.4 7 17.4 14.3s2.2 15.8-2.2 22.5l-58.2 87.8 58.2 87.8c4.4 6.7 5.200 15.1 2.2 22.5s-9.6 12.8-17.4 14.3L433.8 401.4 413 504.7c-1.6 7.8-7 14.4-14.3 17.4s-15.8 2.2-22.5-2.2l-87.8-58.2-87.8 58.2c-6.7 4.4-15.1 5.2-22.5 2.2s-12.8-9.6-14.3-17.4L143 401.4 39.7 380.5c-7.8-1.6-14.4-7-17.4-14.3s-2.2-15.8 2.2-22.5L82.7 256 24.5 168.2c-4.4-6.7-5.2-15.1-2.2-22.5s9.6-12.8 17.4-14.3L143 110.6 163.9 7.3c1.6-7.8 7-14.4 14.3-17.4zM207.6 256a80.4 80.4 0 1 1 160.8 0 80.4 80.4 0 1 1 -160.8 0zm208.8 0a128.4 128.4 0 1 0 -256.8 0 128.4 128.4 0 1 0 256.8 0z'
const MOON_PATH = 'M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z'
const THEME_KEY = 'pigeonchess:theme'
const theme = ref<'light' | 'dark'>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
// A captured piece's picture: black ones on the night panel come with a white outline drawn in (so they
// show in every browser, not only where a CSS filter on an image works).
const capturedSrc = (colour: string, piece: string) =>
  colour === 'b' && theme.value === 'dark' ? `/pieces/outlined/b${piece}.svg` : `/pieces/${colour}${piece}.svg`
const setTheme = (next: 'light' | 'dark') => {
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#14191d' : '#e9ecee')
  try { localStorage.setItem(THEME_KEY, next) } catch { /* private mode: not remembered */ }
}

// The logo and name go home. A game in progress is left only after asking
// (leaving resigns it); searching stops; puzzles and reviews close.
const showLeaveGameModal = ref(false)
const goHome = () => {
  showMenu.value = false
  if (currentGame.value?.status === 'active' && !isPuzzleMode.value && !isReplayMode.value) {
    showLeaveGameModal.value = true
    return
  }
  if (isSearching.value) stopSearching()
  if (isReplayMode.value) exitReplayMode()
  else if (isPuzzleMode.value) exitPuzzleMode()
  else if (currentGame.value) returnToLobby()
  window.scrollTo({ top: 0 })
}
const leaveGameAndGoHome = async () => {
  showLeaveGameModal.value = false
  if (currentGame.value?.status === 'active') await confirmResign()
  returnToLobby()
  window.scrollTo({ top: 0 })
}

const startAIGame = () => {
  endReason.value = null
  boardFlipped.value = false
  if (isGameActive.value) return
  clearChat()
  pigeonNote.value = ''
  pigeonTally.value = { pigeon: 0, backup: 0 }
  
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
  gameEngine.value = pigeonAIOffered ? aiEngine.value : 'standard'
  setAIOpponent(true, aiDifficulty.value, gameEngine.value)
  console.log('=== startAIGame: setAIOpponent called with difficulty:', aiDifficulty.value, 'engine:', gameEngine.value)
  
  // Randomly assign player color
  const playerColor = Math.random() < 0.5 ? 'white' : 'black'
  console.log('Starting AI game - Player color:', playerColor)
  
  // Start game with random color
  opponentName.value = null
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
// The position the computer is choosing a move for: a bestmove that is not legal there is from a search
// the page stopped (it can arrive just after the computer's own search was asked for), not its move.
let aiMoveFen: string | null = null
// A position Stockfish gave no usable move for: the computer picks without it there, rather than stall.
let engineSkipFen: string | null = null
let aiWatchdog: ReturnType<typeof setTimeout> | null = null
const legalIn = (fen: string, uci: string) => {
  try {
    return createChess(fen).moves({ verbose: true }).some((m: any) => m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && (uci.length < 5 || m.promotion === uci[4]))
  } catch {
    return false
  }
}

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
            if (aiMoveFen && !legalIn(aiMoveFen, match[1])) {
              console.warn('⚠️ Ignoring bestmove from a stopped search (not legal here):', match[1])
              return
            }
            if (aiWatchdog) { clearTimeout(aiWatchdog); aiWatchdog = null }
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

  // Stockfish gave nothing usable for this position: choose again, without it, if it is still our move.
  const giveUpOnEngine = () => {
    stockfishCallback = null
    expectingAiMove = false
    aiMoveFen = null
    aiThinking.value = false
    if (!isAIGame.value || !isGameActive.value || chess.value.fen() !== currentFen || chess.value.turn() !== expectedAiColor) return
    engineSkipFen = currentFen
    makeAIMove()
  }
  
  // PigeonAI: the move is asked of the mesh (usePigeonAI.ts). No usable answer (not ready in time, none,
  // or no legal move named): this move is played without it, as when Stockfish fails.
  if (gameEngine.value === 'pigeonai' && engineSkipFen !== currentFen) {
    const started = Date.now()
    pigeonAsking.value = true
    void pigeonAIMove(currentFen, [...(currentGame.value?.moves ?? [])]).then((answer) => {
      pigeonAsking.value = false
      if (!isAIGame.value || !isGameActive.value || chess.value.fen() !== currentFen) {
        aiThinking.value = false
        return
      }
      const found = answer.move ? moves.find((m: any) => m.san === answer.move) : null
      pigeonOutcome = { fen: currentFen, why: found ? '' : answer.why }
      if (!found) {
        console.warn(`⚠️ PigeonAI ${answer.why}: the backup engine plays this move`)
        giveUpOnEngine()
        return
      }
      playSelected(found, Math.max(0, 300 - (Date.now() - started)))
    })
    return
  }

  // Try to use Stockfish if available (it only knows standard chess), unless it already failed here.
  if (stockfish && stockfishReady && !isPigeonVariant && engineSkipFen !== currentFen) {
    
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
            giveUpOnEngine()
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
            giveUpOnEngine()
          }
        } catch (error) {
          console.error('EXCEPTION in AI move callback:', error)
          console.error('Stack:', error instanceof Error ? error.stack : 'no stack')
          console.error('Context - bestMove:', bestMove, 'currentFen:', currentFen, 'expectedAiColor:', expectedAiColor)
          giveUpOnEngine()
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
      aiMoveFen = currentFen
      stockfish.postMessage('ucinewgame')
      stockfish.postMessage('position fen ' + currentFen)
      stockfish.postMessage('go depth ' + depth + ' movetime ' + movetime)
      // No usable answer in time (a lost or wrong one): pick without the engine, never stall the game.
      if (aiWatchdog) clearTimeout(aiWatchdog)
      aiWatchdog = setTimeout(() => {
        aiWatchdog = null
        if (thisAnalysisId !== currentAnalysisId || !expectingAiMove || chess.value.fen() !== currentFen) return
        console.warn('⚠️ No move from Stockfish in time; the computer picks without it')
        giveUpOnEngine()
      }, movetime + 5000)
    }, 50)
    return
  }
  
  // Fallback to old AI if Stockfish not available
  console.log(gameEngine.value === 'pigeonai' ? '⚠️ Backup engine: PigeonAI gave no move' : '⚠️ FALLBACK AI - Stockfish not available. stockfish:', !!stockfish, 'stockfishReady:', stockfishReady)
  
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
// Players online: the room's membership as PeerPigeon keeps it (records
// expire on their own, and a peer that leaves is dropped at once), the same
// count the PeerPigeon demo shows. The old count came from presence pings and
// a list kept in localStorage, so players long gone stayed in it.
const otherPeersCount = computed(() => onlinePeerIds.value.length)

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
  saveGame,
  loadGames,
  dhtGet,
  peerId: computed(() => mesh.value?.peerId).value,
  username: () => identityUsername.value,
  opponentUsername: () => opponentName.value
})

// In a PigeonAI game: who made each computer move (PigeonAI, or the backup engine and why).
watch(() => currentGame.value?.moves?.length ?? 0, (n, before) => {
  // A new game (or moves taken back): the last game's line and tally go, whatever kind of game this is.
  if (n === 0 || n < before) { pigeonNote.value = ''; pigeonTally.value = { pigeon: 0, backup: 0 }; return }
  if (!isAIGame.value || gameEngine.value !== 'pigeonai') return
  if (n !== before + 1) return
  // A move by the computer: the side that moved is not mine.
  const moved = n % 2 === 1 ? 'white' : 'black'
  if (moved === myPlayer.value?.color) return
  const san = currentGame.value!.moves[n - 1]
  const why = pigeonOutcome?.why ?? 'gave no move'
  pigeonOutcome = null
  if (!why) { pigeonTally.value.pigeon++; pigeonNote.value = `PigeonAI played ${san}` }
  else { pigeonTally.value.backup++; pigeonNote.value = `PigeonAI ${why}: the backup engine played ${san}` }
})

// Signed in: what this player writes (their games) is signed by their account, so it follows them to
// any device they sign in from. Signed out: back to this browser's own key. Their games load either way.
watch(currentIdentity, (keys) => {
  signStorageAs(keys)
  void loadHistoryFromDHT()
}, { immediate: true })

// A move that gives check snaps, alongside its own sound: one new move (whoever made it), not the
// many a restored or replayed game puts back at once, nor a step through the moves (which plays its own).
let navigating = false
watch(() => currentGame.value?.moves?.length ?? 0, (now, before) => {
  if (navigating) return
  if (now === (before ?? 0) + 1 && chess.value?.isCheck?.()) playCheckSound()
})

/** A move's sounds: capture, castle or move, and the snap when it gives check. */
const playMoveSounds = (move: any) => {
  if (!move) return
  if (move.captured) playCaptureSound()
  else if (move.flags?.includes('k') || move.flags?.includes('q')) playCastleSound()
  else playMoveSound()
  if (typeof move.san === 'string' && /[+#]/.test(move.san)) playCheckSound()
}

/** Stepping through the moves: forward plays the move stepped onto; back, only a step. */
const playStepSounds = (move: any, forward: boolean) => {
  if (forward) playMoveSounds(move)
  else playMoveSound()
}

// While a game is on the screen (in progress or just over: a person or the computer, clock or not),
// the page is marked, so a newer build waits until the player is back in the lobby before the page
// reloads itself (main.ts): a finished game, its result and its chat stay until they leave it.
watch(() => Boolean(currentGame.value && !isReplayMode.value), (inGame) => {
  if (inGame) document.documentElement.dataset.inGame = '1'
  else delete document.documentElement.dataset.inGame
}, { immediate: true })

// Set up the game end callback to play win/lose sounds
setOnGameEndCallback((result) => {
  // Clear abandonment timers when game ends
  clearAbandonmentTimers()
  // A finished game's clock is not synced any more (it kept going on the side
  // that had not resigned).
  stopTimerSyncBroadcast()
  
  // An abandoned game is neither won nor lost at the board: the neutral knocks.
  if (endReason.value === 'peer_disconnect') {
    playDrawSound()
  } else if (result === 'win') {
    playWinSound()
  } else if (result === 'loss') {
    playLoseSound()
  } else if (result === 'draw') {
    playDrawSound()
  }
})

// Move navigation for reviewing game history
const viewingMoveIndex = ref<number | null>(null) // null = viewing current position
const viewingChess = boardRef<Chess | null>(null) // separate chess instance for viewing (utils/boardRef.ts)

const goToMove = (moveIndex: number) => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  // Where the board is now (the live position is the last move), to tell a step forward from one back.
  const shownIndex = isPuzzleMode.value ? puzzleMoveIndex.value - 1 : (viewingMoveIndex.value ?? moves.length - 1)
  const forward = moveIndex > shownIndex
  navigating = true
  nextTick(() => { navigating = false })
  
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
      playStepSounds(lastMoveObj, forward)
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
    
    playStepSounds(lastMoveObj, forward)
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
      goToEnd(true)
      
      // Force reactivity to update by using nextTick
      nextTick(() => {
        console.log('After goToEnd (from last move) - viewingMoveIndex:', viewingMoveIndex.value, 'isMyTurn:', isMyTurn.value)
      })
    } else {
      goToMove(nextIndex)
    }
  } else if (nextIndex >= moves.length && !isReplayMode.value) {
    // At the end in active game, return to live position
    goToEnd(true)
    
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
  navigating = true
  nextTick(() => { navigating = false })
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

const goToEnd = (stepped = false) => {
  const moves = isReplayMode.value && replayGame.value ? replayGame.value.moves : currentGame.value?.moves
  if (!moves) return
  // Back to the live position by the player's own step: the moves it passes, heard as one step forward.
  const wasViewing = viewingMoveIndex.value !== null
  
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
          if (stepped && wasViewing) playMoveSounds(lastMoveObj)
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
  
  
  // Clear arrows if best moves not enabled
  if (!shouldShowBestMoves) {
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

const playWinSound = () => playSoundFile('/sounds/win-wood.mp3', { volume: 0.6 })

const playLoseSound = () => playSoundFile('/sounds/lose-wood.mp3', { volume: 0.6 })

// Two even knocks, halfway in pitch between the win's rising pair and the
// loss's falling one: a draw, an abort or an abandoned game.
const playDrawSound = () => playSoundFile('/sounds/draw-wood.mp3', { volume: 0.6 })

// Three quick even knocks when a game begins, however it began (matched,
// accepted challenge, against the computer).
const playStartSound = () => playSoundFile('/sounds/start-wood.mp3', { volume: 0.6 })
watch(() => currentGame.value?.id, (id, previous) => {
  if (id && id !== previous && currentGame.value?.status === 'active' && !currentGame.value.moves?.length) playStartSound()
})

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
  timerInterval = setInterval(() => timed('clock tick', () => {
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
  }), 100)
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

let lastHeardFromOpponent = Date.now()
let turnStartedAt = Date.now()

/**
 * Whether this page may judge the opponent (abort, abandonment, a win on
 * time). A page that was in the background, or paused (iOS pauses a
 * home-screen app as soon as it leaves the screen; Android slows a page with
 * the screen off), may have missed moves: its position and clocks are stale
 * until it hears the opponent again. So it judges only while in front, and
 * only once a clock sync has come since it woke, or it has been awake long
 * enough that one would have come if the opponent were there.
 */
let awakeSince = Date.now()
let lastTickAt = Date.now()
const AWAKE_TRUST_MS = 15000
const woke = () => {
  awakeSince = Date.now()
  // Ask for the moves and clocks now rather than at the next sync.
  if (opponentId.value && isGameActive.value && !isAIGame.value) {
    sendMessage(opponentId.value, JSON.stringify({ type: 'time_check', gameId: currentGame.value?.id })).catch(() => {})
  }
}
const mayJudge = (now: number) =>
  document.visibilityState === 'visible' && (opponentSyncAt > awakeSince || now - awakeSince > AWAKE_TRUST_MS)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') woke() })
  addEventListener('pageshow', () => woke())
}
/** The turn whose move-timeout warning has played (its turnStartedAt). */
let warnedTurnStartedAt = 0
const MOVE_WARNING_SECONDS = 10
let watchdogInterval: ReturnType<typeof setInterval> | null = null
const opponentGone = ref(false)
const opponentGoneOnTheirTurn = ref(0) // seconds of their reconnect window used
const reconnectWindow = computed(() => reconnectSeconds(currentGameTimeControl.value))

/** What the opponent's latest clock sync said: how many moves, and when it came. */
let opponentSyncMoves = -1
let opponentSyncAt = 0
let lastTimeCheckAt = 0

const heardFromOpponent = () => {
  lastHeardFromOpponent = Date.now()
  stopRejoining()
  if (opponentGone.value) {
    opponentGone.value = false
    opponentGoneOnTheirTurn.value = 0
    // They're back: make sure they have every move.
    sendTimerSync()
  }
}

/** The sound for the move just played on the board: capture, castle or a plain move. */
const playSoundForLastMove = () => {
  const history = chess.value.history({ verbose: true })
  const last: any = history[history.length - 1]
  if (!last) return
  if (last.captured) playCaptureSound()
  else if (/[kq]/.test(String(last.flags || ''))) playCastleSound()
  else playMoveSound()
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
  const caughtUp = moves.length - game.moves.length
  for (const san of moves.slice(game.moves.length)) {
    const before = chess.value.history({ verbose: true }).length
    if (!receiveMove(String(san))) break
    const last = chess.value.history({ verbose: true })[before]
    if (last) lastMove.value = { from: last.from, to: last.to }
    if (!hasGameStarted.value) { hasGameStarted.value = true; seek.settled() }
  }
  // One sound for a missed move arriving late; a long catch-up stays quiet.
  if (caughtUp === 1) playSoundForLastMove()
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
  watchdogInterval = setInterval(() => timed('watchdog tick', watchdogTick), 1000)
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
  // Ticks come every second; a long gap means this page was paused.
  if (now - lastTickAt > 3000) woke()
  lastTickAt = now
  const judge = mayJudge(now)

  // On your first move, the shaker 10 s before the game is aborted. Nothing
  // else warns mid-game; the low-time shaker covers the clock.
  if (myMove && warnedTurnStartedAt !== turnStartedAt) {
    const limit = plies < 2 ? firstMoveSeconds(tc) : null
    if (limit !== null && onTurnFor >= limit - MOVE_WARNING_SECONDS) {
      warnedTurnStartedAt = turnStartedAt
      playLowTimeWarning()
    }
  }

  // First move of each side
  if (judge && plies < 2 && onTurnFor > firstMoveSeconds(tc)) {
    abortGame()
    return
  }

  // Their clock ran out on their move, and they aren't there to say so.
  // Only once they have confirmed the position: a page that missed their
  // last move (a phone with its screen off) would otherwise run their clock
  // down while it is really its own move, and claim a win it didn't have.
  // So: their latest clock sync, from the last few seconds, must have as many
  // moves as we do. Until then, ask them for one.
  if (hasClock.value && !isMyTurn.value && opponentTime.value <= 0) {
    const game = currentGame.value
    const confirmed = game && now - lastHeardFromOpponent < OPPONENT_GONE_MS && now - opponentSyncAt < 6000 && opponentSyncMoves === game.moves.length
    // Or they are gone and we are awake and caught up: their clock is ours to call.
    const gone = now - lastHeardFromOpponent > OPPONENT_GONE_MS
    if (judge && (confirmed || gone)) {
      claimWinOnTime()
      return
    }
    if (now - lastTimeCheckAt > 1500 && opponentId.value) {
      lastTimeCheckAt = now
      sendMessage(opponentId.value, JSON.stringify({ type: 'time_check', gameId: game?.id })).catch(() => {})
    }
  }

  if (now - lastPingAt >= 3000 && opponentId.value) {
    lastPingAt = now
    // Each ping also says whether this page is in front (for notifications; an
    // "away" sent just as the page hides can be lost while the link resets).
    sendMessage(opponentId.value, JSON.stringify({ type: 'ping', t: now, away: document.visibilityState !== 'visible' })).catch(() => {})
  }

  // Disconnect: only while we are online, and only on their turn
  const weAreOnline = connectedPeerIds.value.length > 0
  opponentGone.value = weAreOnline && now - lastHeardFromOpponent > OPPONENT_GONE_MS
  // Someone we can notify (they gave us their push subscription) is not
  // abandoning: they are away until the notification brings them back. Their
  // clock decides; with no clock, they have 10 minutes.
  const window = seat?.theirPush ? (hasClock.value ? Infinity : 600) : reconnectWindow.value
  if (opponentGone.value && !isMyTurn.value && plies >= 2 && judge) {
    opponentGoneOnTheirTurn.value += 1
    if (opponentGoneOnTheirTurn.value >= window) abandonGame('peer_disconnect', 'opponent')
  }
}

/**
 * The game that just ended, kept a while: when the opponent's page comes back
 * (it was paused and missed the end), it is sent the same ending, so both
 * sides agree. `ending` is the message that ended it here; for a game ended
 * at the board (mate, a draw), the moves.
 */
let ended: { gameId: string; seat: Seat; opponentId: string; ending: string; at: number } | null = null
let lastEnding: string | null = null
let endingResentAt = 0
const keepEnding = () => {
  const game = currentGame.value
  if (!seat || !game || !opponentId.value) return
  ended = {
    gameId: game.id,
    seat,
    opponentId: opponentId.value,
    ending: lastEnding ?? JSON.stringify({ type: 'timer_sync', gameId: game.id, moves: [...game.moves], data: null }),
    at: Date.now(),
  }
  lastEnding = null
}
/** Send their page how the game ended here (at most every 2 s). */
const resendEnding = async (to: string) => {
  if (!ended || Date.now() - ended.at > 15 * 60_000 || Date.now() - endingResentAt < 2000) return
  endingResentAt = Date.now()
  const sealed = await seal(ended.seat, ended.ending)
  rawSendMessage(to, JSON.stringify(sealed)).catch(() => {})
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
  playDrawSound()
  // Tell them before the game (and who they are) is cleared.
  lastEnding = JSON.stringify({ type: 'abort', gameId, stallerColor })
  keepEnding()
  if (to) sendMessage(to, lastEnding).catch(() => {})
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
  lastEnding = JSON.stringify({ type: 'flag', gameId: currentGame.value.id, loser: myColor === 'white' ? 'black' : 'white' })
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
  lastEnding = JSON.stringify({ type: 'abandon', gameId: currentGame.value.id, reason, loser: loserColor })
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
/** Chatting with PigeonAI: in a game against it, messages go to it (usePigeonAI.ts), and it answers. */
const chatWithPigeonAI = computed(() => isAIGame.value && gameEngine.value === 'pigeonai' && Boolean(currentGame.value))
const pigeonTyping = ref(false)
const canChat = computed(() => chatWithPigeonAI.value || (!isAIGame.value && Boolean(opponentId.value) && Boolean(currentGame.value)))
const addChatLine = (mine: boolean, text: string) => {
  chatMessages.value.push({ id: ++chatSeq, mine, text })
  if (chatMessages.value.length > 200) chatMessages.value.splice(0, chatMessages.value.length - 200)
  nextTick(() => { if (chatList.value) chatList.value.scrollTop = chatList.value.scrollHeight })
}
const sendChat = () => {
  const text = chatDraft.value.trim().slice(0, CHAT_MAX)
  if (text && chatWithPigeonAI.value) {
    chatDraft.value = ''
    addChatLine(true, text)
    pigeonTyping.value = true
    const lines = chatMessages.value.map((l) => ({ mine: l.mine, text: l.text }))
    const g = currentGame.value
    const aiColor = myPlayer.value?.color === 'white' ? 'black' : 'white'
    const result = g?.status !== 'finished' ? null : g.result === 'draw' || !g.result ? 'draw' : g.result === aiColor ? 'ai' : 'player'
    const how = endReason.value === 'resign' ? 'resignation' : endReason.value === 'time' ? 'time' : endReason.value === 'agreement' ? 'agreement' : chess.value.isCheckmate() ? 'checkmate' : chess.value.isStalemate() ? 'stalemate' : undefined
    void pigeonAIChat(text, { fen: chess.value.fen(), moves: [...(g?.moves ?? [])], aiColor, result, how }, lines)
      .then((reply) => addChatLine(false, reply))
      .catch((err: Error) => addChatLine(false, `(${err.message})`))
      .finally(() => { pigeonTyping.value = false })
    return
  }
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
  // Someone else's game (a shared link): by colour, not "you".
  if (sharedView.value && (result === 'win' || result === 'loss')) {
    const mine = replayGame.value!.myColor
    return `${(result === 'win') === (mine === 'white') ? 'White' : 'Black'} won`
  }
  if (result === 'win') return 'you won'
  if (result === 'loss') return 'you lost'
  if (result === 'draw') return 'drawn'
  return 'abandoned'
})
const replayOpponentName = computed(() => {
  const game = replayGame.value
  if (!game) return ''
  if (game.isAI) return computerName(game.aiEngine, game.aiDifficulty)
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
      await createIdentity(loginUsername.value, loginPassword.value, dhtPut, dhtGet, relayRequest)
      showLoginModal.value = false
      loginUsername.value = ''
      loginPassword.value = ''
      console.log('Identity created successfully!')
    } else {
      // Load existing identity (with DHT fallback for cross-device login)
      await loadIdentity(loginUsername.value, loginPassword.value, dhtGet, dhtPut, relayRequest)
      showLoginModal.value = false
      loginUsername.value = ''
      loginPassword.value = ''
      console.log('Logged in successfully!')
    }
  } catch (error: any) {
    console.error('Login/Register error:', error)
    if (error?.code === 'name-taken') {
      // Maybe it's theirs: try logging in with what they typed.
      try {
        await loadIdentity(loginUsername.value, loginPassword.value, dhtGet, dhtPut, relayRequest)
        showLoginModal.value = false
        loginMode.value = 'login'
        loginUsername.value = ''
        loginPassword.value = ''
        return
      } catch { /* not theirs */ }
      loginError.value = 'That name is taken. If it is yours, log in instead.'
    } else if (loginMode.value === 'register') {
      loginError.value = 'Could not create the account. Try again.'
    } else if (error?.code === 'not-found') {
      loginError.value = 'No account by that name was found on the network. It is kept by the players who were online when it was made: try again once one of your other devices is open.'
    } else {
      loginError.value = 'Wrong password.'
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
    // Every page here is a PigeonAI peer too: it joins PigeonAI's mesh for chess on the same relays.
    const aiUrls = migrateSignalingUrls(activeSignalingUrls)
    startPigeonAIPeer({ signalingServer: aiUrls[0], signalingServers: aiUrls.slice(1), automaticSignalingServer: true }, settings.value.networkName || 'global')

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
    
    // A move that ends the game (mate, or a draw) ends it here once (makeMove may have already),
    // and against a person it is still sent: their board has to see it to end the game too.
    const ended = chess.value.isGameOver()
    if (ended && currentGame.value.status !== 'finished') endGame()

    if (isAIGame.value) {
      if (ended) { isAIGame.value = false; return }
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

    // Their move now: if they're away, they get "Your move".
    notifyOpponentIfAway()
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

// A resignation is sent until the opponent confirms it. Sent once, a resign
// that was lost (a link dropping, no route for a moment) left the other side
// playing a game that had ended, its clock still running.
const RESIGN_RETRY_MS = 2000
const RESIGN_GIVE_UP_MS = 60_000
let resignRetry: ReturnType<typeof setInterval> | null = null
let resignAwaitingAck: string | null = null
// Games this page resigned: if the other side is still playing one later (its
// phone was asleep through every resend), it is told again.
const resignedGameIds = new Set<string>()

const sendResignUntilAcknowledged = (to: string, gameId: string) => {
  if (resignRetry) clearInterval(resignRetry)
  resignAwaitingAck = gameId
  const startedAt = Date.now()
  const send = () => {
    if (resignAwaitingAck !== gameId || Date.now() - startedAt > RESIGN_GIVE_UP_MS) {
      if (resignRetry) clearInterval(resignRetry)
      resignRetry = null
      return
    }
    const message: ChessMessage = { type: 'resign', gameId }
    sendMessage(to, JSON.stringify(message)).catch((err) => console.warn('Resign not delivered yet:', err))
  }
  send()
  resignRetry = setInterval(send, RESIGN_RETRY_MS)
}

const confirmResign = async () => {
  const gameId = currentGame.value?.id
  const to = opponentId.value
  endReason.value = 'resign'
  resign()
  stopTimerSyncBroadcast()

  // Only human opponents are told; the computer needs no message.
  if (to && gameId && !isAIGame.value) {
    resignedGameIds.add(gameId)
    sendResignUntilAcknowledged(to, gameId)
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
  dropAIGame()
  seat = null
  saveSeat(null)
  stopRejoining()
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
  const wasShared = sharedView.value
  sharedView.value = false
  sharedNote.value = ''
  shareWord.value = ''
  forgetSharedGameInUrl()
  isReplayMode.value = false
  replayGame.value = null
  replayShowBestMoves.value = false
  resetGame()
  viewingMoveIndex.value = null
  // A game in progress here was set aside to look at a shared one: back to it.
  if (wasShared) { restoreAIGame(); if (!isGameActive.value) restoreGame() }
}

// ---- Shared games: a link to a played game (utils/shareGame.ts) ----
const sharedView = ref(false)
const sharedNote = ref('')
const sharedCheck = ref<'checking' | 'verified' | 'unverified' | ''>('')
const shareWord = ref('')

const giveLink = async (url: string) => {
  const how = await offerLink(url, 'A game of chess on PigeonChess')
  shareWord.value = how === 'copied' ? 'Link copied' : how === 'shared' ? 'Shared' : 'Could not copy the link'
  setTimeout(() => { shareWord.value = '' }, 2500)
}

/** A link to one of this player's games: named by the key it is kept under, with the game packed in. */
const linkToOwnGame = async (game: GameHistoryEntry) => {
  const signer = await storageSigner()
  if (!signer) throw new Error('not connected yet')
  // Kept already, normally; if not (an old game, or the servers missed it), kept now, so the link finds it.
  void saveGame(game).catch(() => {})
  return shareUrl(game, signer)
}

const shareReplayGame = async () => {
  if (!replayGame.value) return
  try { await giveLink(sharedView.value ? location.href : await linkToOwnGame(replayGame.value)) }
  catch { shareWord.value = 'Not connected yet: try again in a moment' }
}

/** The game just finished here: its entry in the history (kept when it ended). */
const shareFinishedGame = async () => {
  const id = currentGame.value?.id
  const game = gameHistory.value.find((g) => g.gameId === id)
  if (!game) {
    shareWord.value = currentGame.value?.moves?.length ? 'Not kept yet: try again in a moment' : 'No moves to share'
    setTimeout(() => { shareWord.value = '' }, 2500)
    return
  }
  try { await giveLink(await linkToOwnGame(game)) }
  catch { shareWord.value = 'Not connected yet: try again in a moment' }
}

const shareHistoryGame = async (game: GameHistoryEntry) => {
  try { await giveLink(await linkToOwnGame(game)) } catch { /* not connected yet */ }
}

/** Open the game a link names: the kept one (checked: signed by its player) or, failing that, the link's own copy. */
const openSharedGame = async (link: { gameId: string; signer: string; packed: string | null }) => {
  const fromLink = link.packed ? await unpackGame(link.packed) : null
  const show = (game: GameHistoryEntry) => {
    const same = replayGame.value?.gameId === game.gameId && replayGame.value.moves.join(' ') === game.moves.join(' ')
    if (!(isReplayMode.value && same)) startReplayMode(game)
    sharedView.value = true
  }
  if (fromLink) { show(fromLink); sharedCheck.value = 'checking'; sharedNote.value = "Checking it against the player's kept games…" }
  const kept = await Promise.race([
    loadSharedGame(link.signer, link.gameId).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 20_000)),
  ])
  if (kept && Array.isArray(kept.moves) && movesPlay(kept.moves)) {
    show(kept as GameHistoryEntry)
    sharedCheck.value = 'verified'
    sharedNote.value = fromLink && fromLink.moves.join(' ') !== kept.moves.join(' ')
      ? "The link's moves did not match the kept game: this is the kept game, signed by its player."
      : 'Kept on the storage servers and signed by its player: the game as it was played.'
  } else if (fromLink) {
    sharedCheck.value = 'unverified'
    sharedNote.value = "Not found on the storage servers, so it can't be checked: the moves come from the link alone."
  } else {
    sharedNote.value = ''
    console.warn('The shared game could not be found:', link.gameId)
    forgetSharedGameInUrl()
  }
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
    let fromPeer = event.from || event.source || event.peer
    
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
    let message: any = typeof content === 'string' ? JSON.parse(content) : content

    // A sealed message: act on it only if the opponent's seat key signed it.
    // From a new peer ID, it is the same player after a reload: follow them.
    if (message?.type === 'sealed') {
      const current = !!seat && message.gameId === seat.gameId
      const theSeat = current ? seat : (ended && message.gameId === ended.gameId ? ended.seat : null)
      if (!theSeat) return
      const body = await open(theSeat, message)
      if (!body) return
      if (current) saveSeat(seat)
      const inner = JSON.parse(body)
      // Their page is still playing a game that ended here (it was paused and
      // missed the end): tell it how it ended.
      if (ended && message.gameId === ended.gameId && (!current || currentGame.value?.status !== 'active')
        && ['ping', 'time_check', 'rejoin', 'timer_sync', 'move'].includes(String(inner?.type))) {
        if (fromPeer) void resendEnding(fromPeer)
        return
      }
      if (!current) return
      if (fromPeer && fromPeer !== opponentId.value) rejoinedAs(fromPeer)
      fromPeer = opponentId.value
      message = inner
    } else if (seat && !NOT_SEALED.has(String(message?.type ?? ''))) {
      // Unsealed while this game is sealed: not from our opponent. Dropped.
      return
    }
    
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
        if (typeof message.away === 'boolean' && message.away !== opponentAway.value) {
          opponentAway.value = message.away
          if (message.away) notifyOpponentIfAway()
        }
        sendMessage(fromPeer, JSON.stringify({ type: 'pong', t: message.t })).catch(() => {})
        return
      }
      if (message.type === 'pong') {
        if (typeof message.t === 'number') opponentRtt.value = Date.now() - message.t
        return
      }
      if (message.type === 'time_check') {
        // They think our clock ran out: send the moves and clocks as we have them.
        incrementLocalClock()
        sendTimerSync()
        return
      }
      if (message.type === 'rejoin') {
        // They are back (after a reload): send them everything.
        opponentAway.value = false
        sendTimerSync()
        void sendPlayerClaim()
        tellOpponentHowToReachMe()
        return
      }
      if (message.type === 'notify') {
        // How to reach them while they're away (their push subscription), or not at all.
        if (seat && message.gameId === seat.gameId) {
          const sub = message.sub
          seat.theirPush = sub && typeof sub.endpoint === 'string' && sub.keys ? sub : undefined
          saveSeat(seat)
        }
        return
      }
      if (message.type === 'away') {
        opponentAway.value = !!message.away
        if (opponentAway.value) notifyOpponentIfAway()
        return
      }
      if (message.type === 'player') {
        const game = currentGame.value
        if (game && message.gameId === game.id) {
          void verifyPlayerClaim(message, game.id, fromPeer, dhtGet, relayRequest).then((name) => {
            if (name && currentGame.value?.id === game.id && opponentId.value === fromPeer) opponentName.value = name
          })
        }
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

    // Still playing a game we resigned: say so again.
    if (fromPeer && chessMessage.gameId && resignedGameIds.has(chessMessage.gameId)
      && (chessMessage.type === 'timer_sync' || chessMessage.type === 'move')) {
      sendMessage(fromPeer, JSON.stringify({ type: 'resign', gameId: chessMessage.gameId })).catch(() => {})
      return
    }

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
          
          // The opponent's move gets the same sound as ours (it had none).
          if (receiveMove(`${chessMessage.data.from}${chessMessage.data.to}`)) {
            playSoundForLastMove()
            if (currentGame.value) void notify.showHere('move', currentGame.value.id)
          }
          // Process incoming timer sync if present
          if (chessMessage.timer && chessMessage.vectorClock) {
            processIncomingTimer(chessMessage.timer, chessMessage.vectorClock, fromPeer)
          }
        }
        break
        
      case 'timer_sync':
        if (Array.isArray((chessMessage as any).moves)) { opponentSyncMoves = (chessMessage as any).moves.length; opponentSyncAt = Date.now() }
        catchUpMoves((chessMessage as any).moves)
        if (chessMessage.data && chessMessage.vectorClock) {
          processIncomingTimer(chessMessage.data, chessMessage.vectorClock, fromPeer)
        }
        break
        
      case 'abort':
        if (currentGame.value && currentGame.value.status === 'active'
          && (currentGame.value.id === chessMessage.gameId || fromPeer === opponentId.value)) {
          stopWatchdog()
          abandonmentReason.value = 'aborted'
          const named = (chessMessage as any).stallerColor
          const stallerColor = named === 'white' || named === 'black' ? named : (currentGame.value.moves.length === 0 ? 'white' : 'black')
          iAbandoned.value = stallerColor === myPlayer.value?.color
          showAbandonmentModal.value = true
          playDrawSound()
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
        // Opponent resigned. Confirm every copy, even one for a game already
        // over here, so they stop resending.
        if (chessMessage.gameId) {
          sendMessage(fromPeer, JSON.stringify({ type: 'resign_ack', gameId: chessMessage.gameId })).catch(() => {})
        }
        // Each side used to make up its own game id, so a page from before the
        // ids were shared names a different one: the opponent is enough then.
        if (currentGame.value && myPlayer.value && currentGame.value.status === 'active'
          && (!chessMessage.gameId || chessMessage.gameId === currentGame.value.id || fromPeer === opponentId.value)) {
          console.log('Opponent resigned')
          // Set the result before calling endGame so it knows we won
          currentGame.value.result = myPlayer.value.color
          endReason.value = 'resign'
          endGame()
        }
        break

      case 'resign_ack':
        // They know; their clock syncs for it need no answer any more.
        if (chessMessage.gameId) resignedGameIds.delete(chessMessage.gameId)
        if (chessMessage.gameId && chessMessage.gameId === resignAwaitingAck) {
          resignAwaitingAck = null
          if (resignRetry) clearInterval(resignRetry)
          resignRetry = null
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
  watchSeatedGame()
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
    
    // cryptoReady fires again and again (every peer, every sync): nothing to log.
  }
  
  // Auto-initialize and connect on mount
  await initializeAndConnect()

  // Notifications: ask on the first tap, when they're on (installed: on by default).
  notify.askOnFirstTap()

  // A link to a played game: shown first (a game in progress here is kept, and comes back after).
  const shared = sharedGameInUrl()
  if (shared) void openSharedGame(shared)
  // A game this browser was in the middle of (a reload, or a tap on a notification). Against the
  // computer it needs no network; against a person, it waits for this page's peer ID, however long.
  else if (!isGameActive.value) restoreAIGame()
  for (let i = 0; i < 480 && !shared && !mesh.value?.peerId && !isGameActive.value; i++) await new Promise((r) => setTimeout(r, 250))
  if (!isGameActive.value && !shared) restoreGame()
  
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
  padding: 0.25rem 0.35rem;
  margin-left: -0.35rem;
  border-radius: var(--radius);
  color: var(--ink);
}

.brand:hover .wordmark {
  color: var(--sheen);
}

.theme-switch {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: var(--radius);
  color: var(--ink-2);
}

.theme-switch:hover {
  color: var(--ink);
}

.theme-switch svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
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
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  border-radius: var(--radius);
  color: var(--ink);
}

.menu-toggle svg {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
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
  min-height: 21px;
}

.seat-captures:empty {
  display: none;
}

.seat-captures img {
  width: 21px;
  height: 21px;
  margin-right: -7px;
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
  color: var(--on-sheen);
  background: var(--sheen);
}

/* Under 20 s: yellow, with tenths */
.seat-clock.low,
.seat.running .seat-clock.low {
  color: #2a3747;
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
  color: var(--on-sheen);
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

.mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) + 3px);
  background: var(--surface);
}

.mode-option {
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius);
  font-weight: 700;
  color: var(--ink-2);
  transition: background 0.15s, color 0.15s;
}

.mode-option:hover:not(.picked):not(:disabled) {
  color: var(--ink);
}

.mode-option.picked {
  background: var(--ink);
  color: var(--paper);
}

.mode-option:disabled:not(.picked) {
  opacity: 0.5;
  cursor: default;
}

.shared-note {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.shared-note.verified {
  color: var(--ink);
}

.shared-note.unverified {
  color: var(--ink);
  font-weight: 700;
}

.pigeon-note {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: var(--ink-2);
}

.pigeon-note.backup {
  color: var(--ink);
  font-weight: 700;
}

.engine-pick {
  margin-bottom: 0.25rem;
}

.engine-note {
  margin: 0;
  color: var(--ink-2);
  font-size: 0.9rem;
  line-height: 1.45;
}

.engine-status {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.engine-status.ready {
  color: var(--ink);
  font-weight: 700;
}

.difficulty {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.difficulty-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.difficulty-label {
  font-weight: 700;
}

.difficulty-value {
  font-weight: 700;
}

.difficulty-elo {
  margin-left: 0.35rem;
  font-weight: 400;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.difficulty-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.difficulty-slider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, var(--sheen) var(--fill), var(--line) var(--fill));
}

.difficulty-slider::-moz-range-track {
  height: 6px;
  border-radius: 3px;
  background: var(--line);
}

.difficulty-slider::-moz-range-progress {
  height: 6px;
  border-radius: 3px;
  background: var(--sheen);
}

.difficulty-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px;
  height: 22px;
  margin-top: -8px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--sheen);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.difficulty-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--sheen);
}

.difficulty-slider:focus-visible {
  outline: 2px solid var(--sheen);
  outline-offset: 4px;
  border-radius: 4px;
}

.difficulty-ticks {
  display: flex;
  justify-content: space-between;
  margin-top: -0.25rem;
}

.difficulty-ticks button {
  font-size: 0.78rem;
  color: var(--ink-2);
  padding: 0.1rem 0;
}

.difficulty-ticks button.picked {
  color: var(--ink);
  font-weight: 700;
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
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0;
}

.controls-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 48px;
  padding: 0.6rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font: inherit;
  font-weight: 600;
  font-size: 1rem;
  color: var(--ink-2);
  cursor: pointer;
  text-align: left;
}

.controls-picked {
  color: var(--ink);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.controls-chevron {
  margin-left: auto;
  font-size: 1.25rem;
  line-height: 1;
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
  color: var(--paper);
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

.build-footer {
  text-align: center;
  font-size: 0.75rem;
  color: var(--ink-2);
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
  font-variant-numeric: tabular-nums;
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

  /* On a phone the dot says connected; the room is the number that matters. */
  .net-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .net-peers {
    padding-left: 0;
    border-left: 0;
  }

  .menu-toggle {
    display: grid;
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

  .nav-user {
    margin-left: 0;
    border-left: 0;
    padding-left: 0;
  }

  .nav-login {
    margin-left: 0;
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
/* A phone: room for the name, the count, the theme switch and the menu. */
@media (max-width: 480px) {
  .topbar {
    gap: 0.5rem;
  }

  .wordmark {
    font-size: 1.05rem;
  }

  .brand-mark {
    width: 24px;
    height: 24px;
  }

  .net-peers {
    white-space: nowrap;
  }

  .net-peers-word {
    display: none;
  }

  .theme-switch {
    width: 32px;
    margin-left: auto;
  }
}

</style>

