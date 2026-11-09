import { boardRef } from '@/utils/boardRef'
import { ref, computed } from 'vue'
import { createChess } from '@/utils/variant'
import type { GameState, Player, Move, GameHistoryEntry } from '@/types'
import { generateGameId, saveToLocalStorage, loadFromLocalStorage } from '@/utils/helpers'
import { getOpeningName } from '@/utils/openings'

export interface ChessGameOptions {
  /** Keep one finished game: a frozen record signed by the player (written once, never changed). */
  saveGame?: (entry: GameHistoryEntry) => Promise<boolean>
  /** The player's games, from wherever they are kept. */
  loadGames?: () => Promise<GameHistoryEntry[]>
  /** Old storage (public space), read once to move a player's games over. */
  dhtGet?: (key: string, options?: any) => Promise<any>
  peerId?: string
  username?: () => string | undefined  // Function to get current user's username if logged in
  opponentUsername?: () => string | null | undefined  // The opponent's verified account name, when they are logged in
}

export function useChessGame(options: ChessGameOptions = {}) {
  // Not a deep ref: see utils/boardRef.ts (a deep one froze the page at the end of a game).
  const chess = boardRef<any>(createChess())
  const currentGame = ref<GameState | null>(null)
  const myPlayer = ref<Player | null>(null)
  const opponentId = ref<string | null>(null)
  const gameHistory = ref<GameHistoryEntry[]>(loadFromLocalStorage('chess-game-history', []))
  const isAIOpponent = ref<boolean>(false)
  const aiDifficultyLevel = ref<number | undefined>(undefined)
  const aiEngineUsed = ref<'standard' | 'pigeonai'>('standard')
  
  console.log('useChessGame initialized, gameHistory length:', gameHistory.value.length)
  
  let onGameEndCallback: ((result: 'win' | 'loss' | 'draw') => void) | null = null
  
  const setOnGameEndCallback = (callback: (result: 'win' | 'loss' | 'draw') => void) => {
    onGameEndCallback = callback
  }
  
  const byDate = (games: GameHistoryEntry[]) => [...games].sort((a, b) => (b.date || 0) - (a.date || 0))

  // A finished game goes to storage at once, as a frozen record signed by the player.
  const keepGame = (entry: GameHistoryEntry) => {
    options.saveGame?.(entry).catch((error) => console.error('Failed to keep the game:', error))
  }

  // Games kept before they were frozen records: this player's from this browser, and from the old
  // public history. Written as frozen records once; ones already kept are left as they are.
  const moveOldGames = async (kept: Set<string>) => {
    const username = options.username?.()?.trim() || undefined
    const mine = (entry: GameHistoryEntry) => (entry.myUsername?.trim() || undefined) === username
    const old: GameHistoryEntry[] = loadFromLocalStorage('chess-game-history', []).filter(mine)
    if (username && options.dhtGet) {
      const legacy = await options.dhtGet(`chess-history-user-${username}`).catch(() => null)
      if (Array.isArray(legacy)) old.push(...legacy.filter(mine))
    }
    const moved: GameHistoryEntry[] = []
    for (const entry of old) {
      if (!entry?.gameId || kept.has(entry.gameId)) continue
      kept.add(entry.gameId)
      if (await options.saveGame?.(entry).catch(() => false)) moved.push(entry)
    }
    return moved
  }

  // The player's games from storage (any device they played on), with older games moved over.
  const loadHistoryFromDHT = async () => {
    if (!options.loadGames) return
    try {
      const games = await options.loadGames()
      const kept = new Set(games.map((g) => g.gameId))
      const moved = await moveOldGames(kept)
      const all = byDate([...games, ...moved])
      gameHistory.value = all
      saveToLocalStorage('chess-game-history', all.slice(0, 50))
      console.log('Game history loaded:', all.length, 'games')
    } catch (error) {
      console.error('Failed to load game history:', error)
    }
  }
  
  const isMyTurn = computed(() => {
    if (!currentGame.value || !myPlayer.value) return false
    return currentGame.value.currentTurn === myPlayer.value.color
  })

  const isGameActive = computed(() => {
    return currentGame.value?.status === 'active'
  })

  // gameId: the id both players use (a matched game's), so messages about the
  // game name the same one on both sides; a fresh one when not given.
  const startNewGame = (peerId: string, opponentPeerId: string, myColor?: 'white' | 'black', sharedGameId?: string) => {
    // Use provided color or randomly assign
    const assignedColor = myColor || (Math.random() < 0.5 ? 'white' : 'black')
    
    myPlayer.value = {
      id: peerId,
      color: assignedColor
    }
    
    opponentId.value = opponentPeerId
    
    const gameId = sharedGameId || generateGameId()
    chess.value = createChess()
    
    currentGame.value = {
      id: gameId,
      playerWhite: assignedColor === 'white' ? peerId : opponentPeerId,
      playerBlack: assignedColor === 'white' ? opponentPeerId : peerId,
      currentTurn: 'white',
      status: 'active',
      moves: [],
      fen: chess.value.fen(),
      createdAt: Date.now()
    }
    
    return { gameId, myColor: assignedColor, opponentColor: assignedColor === 'white' ? 'black' : 'white' }
  }

  const makeMove = (move: Move): boolean => {
    if (!isMyTurn.value || !currentGame.value) return false
    
    try {
      const result = chess.value.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion
      })
      
      if (result) {
        currentGame.value.moves.push(result.san)
        currentGame.value.fen = chess.value.fen()
        currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
        
        // Check for game end
        if (chess.value.isGameOver()) {
          endGame()
        }
        
        return true
      }
      return false
    } catch (error) {
      console.error('Invalid move:', error)
      return false
    }
  }

  /**
   * A move the opponent made: in SAN (`move` alone, as kept moves are), or from and to squares. A pawn
   * reaching the last rank becomes the piece they chose; an older page names none, and they then had a
   * queen (as chess.js read "e7e8" alone, it made a knight: the boards parted).
   */
  const receiveMove = (move: string, to?: string, promotion?: string) => {
    if (!currentGame.value) return false
    
    try {
      let result
      if (to) {
        const piece = chess.value.get(move)
        const promotes = piece?.type === 'p' && (to[1] === '8' || to[1] === '1')
        const as = promotes ? (typeof promotion === 'string' && /^[qrbn]$/.test(promotion) ? promotion : 'q') : undefined
        result = chess.value.move({ from: move, to, ...(as ? { promotion: as } : {}) })
      } else {
        result = chess.value.move(move)
      }
      
      if (result) {
        currentGame.value.moves.push(result.san)
        currentGame.value.fen = chess.value.fen()
        currentGame.value.currentTurn = chess.value.turn() === 'w' ? 'white' : 'black'
        
        // Check for game end
        if (chess.value.isGameOver()) {
          endGame()
        }
        
        return true
      }
      return false
    } catch (error) {
      console.error('Invalid move received:', error)
      return false
    }
  }

  const endGame = () => {
    if (!currentGame.value || !myPlayer.value) return
    
    console.log('=== endGame called ===')
    console.log('isAIOpponent:', isAIOpponent.value)
    console.log('aiDifficultyLevel:', aiDifficultyLevel.value)
    console.log('opponentId:', opponentId.value)
    
    let result: 'white' | 'black' | 'draw' = 'draw'
    
    // Only calculate result if not already set (e.g., from resignation or timeout)
    if (currentGame.value.result) {
      result = currentGame.value.result as 'white' | 'black' | 'draw'
      console.log('Result already set:', result)
    } else if (chess.value.isCheckmate()) {
      result = chess.value.turn() === 'w' ? 'black' : 'white'
      currentGame.value.result = result
    } else {
      // Draw by stalemate, insufficient material, etc.
      currentGame.value.result = 'draw'
    }
    
    currentGame.value.status = 'finished'
    currentGame.value.finishedAt = Date.now()
    
    // Determine if it's a win, loss, or draw for this player
    const playerResult = result === 'draw' ? 'draw' : (result === myPlayer.value.color ? 'win' : 'loss')
    
    // Call the callback if it exists
    if (onGameEndCallback) {
      onGameEndCallback(playerResult)
    }
    
    // Save to history
    if (opponentId.value && currentGame.value && myPlayer.value) {
      const username = options.username?.()
      const historyEntry: GameHistoryEntry = {
        gameId: currentGame.value.id,
        whitePlayer: currentGame.value.playerWhite || '',
        blackPlayer: currentGame.value.playerBlack || '',
        myPeerId: myPlayer.value.id,
        opponent: opponentId.value,
        myColor: myPlayer.value.color,
        result: playerResult,
        moves: currentGame.value.moves,
        date: Date.now(),
        isAI: isAIOpponent.value,
        aiDifficulty: aiDifficultyLevel.value,
        ...(isAIOpponent.value ? { aiEngine: aiEngineUsed.value } : {}),
        myUsername: (username && username.trim()) ? username : undefined, // Only save if not empty
        opponentUsername: options.opponentUsername?.() || undefined,
        opening: getOpeningName(currentGame.value.moves) // Detect and save opening
      }
      
      gameHistory.value.unshift(historyEntry)
      // Keep only last 50 games
      if (gameHistory.value.length > 50) {
        gameHistory.value = gameHistory.value.slice(0, 50)
      }
      saveToLocalStorage('chess-game-history', gameHistory.value)
      keepGame(historyEntry)
    } else {
      console.log('NOT saving game to history. opponentId:', opponentId.value, 'currentGame:', !!currentGame.value, 'myPlayer:', !!myPlayer.value)
    }
  }

  const resign = () => {
    if (!currentGame.value || !myPlayer.value) return
    
    currentGame.value.status = 'finished'
    currentGame.value.result = myPlayer.value.color === 'white' ? 'black' : 'white'
    currentGame.value.finishedAt = Date.now()
    
    // Call the callback for losing
    if (onGameEndCallback) {
      onGameEndCallback('loss')
    }
    
    // Save to history
    if (opponentId.value && currentGame.value && myPlayer.value) {
      const username = options.username?.()
      const historyEntry: GameHistoryEntry = {
        gameId: currentGame.value.id,
        whitePlayer: currentGame.value.playerWhite || '',
        blackPlayer: currentGame.value.playerBlack || '',
        myPeerId: myPlayer.value.id,
        opponent: opponentId.value,
        myColor: myPlayer.value.color,
        result: 'loss',
        moves: currentGame.value.moves,
        date: Date.now(),
        isAI: isAIOpponent.value,
        aiDifficulty: aiDifficultyLevel.value,
        ...(isAIOpponent.value ? { aiEngine: aiEngineUsed.value } : {}),
        myUsername: (username && username.trim()) ? username : undefined, // Only save if not empty
        opponentUsername: options.opponentUsername?.() || undefined,
        opening: getOpeningName(currentGame.value.moves) // Detect and save opening
      }
      
      gameHistory.value.unshift(historyEntry)
      if (gameHistory.value.length > 50) {
        gameHistory.value = gameHistory.value.slice(0, 50)
      }
      saveToLocalStorage('chess-game-history', gameHistory.value)
      keepGame(historyEntry)
    }
  }

  const resetGame = () => {
    chess.value = createChess()
    currentGame.value = null
    myPlayer.value = null
    opponentId.value = null
    isAIOpponent.value = false
    aiDifficultyLevel.value = undefined
  }

  const setAIOpponent = (isAI: boolean, difficulty?: number, engine: 'standard' | 'pigeonai' = 'standard') => {
    isAIOpponent.value = isAI
    aiDifficultyLevel.value = difficulty
    aiEngineUsed.value = engine
  }

  const getLegalMoves = (square: string) => {
    return chess.value.moves({ square: square as any, verbose: true })
  }

  return {
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
    endGame,
    resign,
    resetGame,
    getLegalMoves,
    setOnGameEndCallback,
    setAIOpponent,
    loadHistoryFromDHT
  }
}
