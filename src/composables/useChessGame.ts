import { ref, computed } from 'vue'
import { Chess } from 'chess.js'
import type { GameState, Player, Move, GameHistoryEntry } from '@/types'
import { generateGameId, saveToLocalStorage, loadFromLocalStorage } from '@/utils/helpers'

export interface ChessGameOptions {
  dhtPut?: (key: string, value: any, options?: any) => Promise<boolean>
  dhtGet?: (key: string, options?: any) => Promise<any>
  peerId?: string
  username?: () => string | undefined  // Function to get current user's username if logged in
}

export function useChessGame(options: ChessGameOptions = {}) {
  const chess = ref<Chess>(new Chess())
  const currentGame = ref<GameState | null>(null)
  const myPlayer = ref<Player | null>(null)
  const opponentId = ref<string | null>(null)
  const gameHistory = ref<GameHistoryEntry[]>(loadFromLocalStorage('chess-game-history', []))
  const isAIOpponent = ref<boolean>(false)
  const aiDifficultyLevel = ref<number | undefined>(undefined)
  
  console.log('useChessGame initialized, gameHistory length:', gameHistory.value.length)
  
  let onGameEndCallback: ((result: 'win' | 'loss' | 'draw') => void) | null = null
  
  const setOnGameEndCallback = (callback: (result: 'win' | 'loss' | 'draw') => void) => {
    onGameEndCallback = callback
  }
  
  // Sync game history to DHT
  const syncHistoryToDHT = async () => {
    if (options.dhtPut && options.peerId) {
      try {
        const historyKey = `chess-history-${options.peerId}`
        await options.dhtPut(historyKey, gameHistory.value, { ttl: 86400 * 365 }) // 1 year TTL
        console.log('Game history synced to DHT')
      } catch (error) {
        console.error('Failed to sync history to DHT:', error)
      }
    }
  }

  // Load game history from DHT
  const loadHistoryFromDHT = async () => {
    if (options.dhtGet && options.peerId) {
      try {
        const historyKey = `chess-history-${options.peerId}`
        const dhtHistory = await options.dhtGet(historyKey)
        if (dhtHistory && Array.isArray(dhtHistory)) {
          // Merge DHT history with local history (DHT takes precedence if newer)
          gameHistory.value = dhtHistory
          saveToLocalStorage('chess-game-history', dhtHistory)
          console.log('Game history loaded from DHT:', dhtHistory.length, 'games')
        }
      } catch (error) {
        console.error('Failed to load history from DHT:', error)
      }
    }
  }
  
  const isMyTurn = computed(() => {
    if (!currentGame.value || !myPlayer.value) return false
    return currentGame.value.currentTurn === myPlayer.value.color
  })

  const isGameActive = computed(() => {
    return currentGame.value?.status === 'active'
  })

  const startNewGame = (peerId: string, opponentPeerId: string, myColor?: 'white' | 'black') => {
    // Use provided color or randomly assign
    const assignedColor = myColor || (Math.random() < 0.5 ? 'white' : 'black')
    
    myPlayer.value = {
      id: peerId,
      color: assignedColor
    }
    
    opponentId.value = opponentPeerId
    
    const gameId = generateGameId()
    chess.value = new Chess()
    
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

  const receiveMove = (move: string) => {
    if (!currentGame.value) return false
    
    try {
      const result = chess.value.move(move)
      
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
    
    if (chess.value.isCheckmate()) {
      result = chess.value.turn() === 'w' ? 'black' : 'white'
    }
    
    currentGame.value.status = 'finished'
    currentGame.value.result = result
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
        myUsername: (username && username.trim()) ? username : undefined // Only save if not empty
      }
      
      gameHistory.value.unshift(historyEntry)
      // Keep only last 50 games
      if (gameHistory.value.length > 50) {
        gameHistory.value = gameHistory.value.slice(0, 50)
      }
      console.log('Saving game to history. Total games:', gameHistory.value.length)
      saveToLocalStorage('chess-game-history', gameHistory.value)
      console.log('Game saved to localStorage')
      
      // Sync to DHT
      syncHistoryToDHT()
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
        myUsername: (username && username.trim()) ? username : undefined // Only save if not empty
      }
      
      gameHistory.value.unshift(historyEntry)
      if (gameHistory.value.length > 50) {
        gameHistory.value = gameHistory.value.slice(0, 50)
      }
      saveToLocalStorage('chess-game-history', gameHistory.value)
      
      // Sync to DHT
      syncHistoryToDHT()
    }
  }

  const resetGame = () => {
    chess.value = new Chess()
    currentGame.value = null
    myPlayer.value = null
    opponentId.value = null
    isAIOpponent.value = false
    aiDifficultyLevel.value = undefined
  }

  const setAIOpponent = (isAI: boolean, difficulty?: number) => {
    isAIOpponent.value = isAI
    aiDifficultyLevel.value = difficulty
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
