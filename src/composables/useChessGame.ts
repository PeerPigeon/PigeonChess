import { ref, computed } from 'vue'
import { Chess } from 'chess.js'
import type { GameState, Player, Move, ChessMessage, GameHistoryEntry } from '@/types'
import { generateGameId, saveToLocalStorage, loadFromLocalStorage } from '@/utils/helpers'

export function useChessGame() {
  const chess = ref<Chess>(new Chess())
  const currentGame = ref<GameState | null>(null)
  const myPlayer = ref<Player | null>(null)
  const opponentId = ref<string | null>(null)
  const gameHistory = ref<GameHistoryEntry[]>(loadFromLocalStorage('chess-game-history', []))
  
  const isMyTurn = computed(() => {
    if (!currentGame.value || !myPlayer.value) return false
    return currentGame.value.currentTurn === myPlayer.value.color
  })

  const isGameActive = computed(() => {
    return currentGame.value?.status === 'active'
  })

  const startNewGame = (peerId: string, opponentPeerId: string) => {
    // Randomly assign colors
    const isWhite = Math.random() < 0.5
    const myColor = isWhite ? 'white' : 'black'
    
    myPlayer.value = {
      id: peerId,
      color: myColor
    }
    
    opponentId.value = opponentPeerId
    
    const gameId = generateGameId()
    chess.value = new Chess()
    
    currentGame.value = {
      id: gameId,
      playerWhite: isWhite ? peerId : opponentPeerId,
      playerBlack: isWhite ? opponentPeerId : peerId,
      currentTurn: 'white',
      status: 'active',
      moves: [],
      fen: chess.value.fen(),
      createdAt: Date.now()
    }
    
    return { gameId, myColor, opponentColor: myColor === 'white' ? 'black' : 'white' }
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
    
    let result: 'white' | 'black' | 'draw' = 'draw'
    
    if (chess.value.isCheckmate()) {
      result = chess.value.turn() === 'w' ? 'black' : 'white'
    }
    
    currentGame.value.status = 'finished'
    currentGame.value.result = result
    currentGame.value.finishedAt = Date.now()
    
    // Save to history
    if (opponentId.value) {
      const historyEntry: GameHistoryEntry = {
        gameId: currentGame.value.id,
        opponent: opponentId.value,
        myColor: myPlayer.value.color,
        result: result === 'draw' ? 'draw' : (result === myPlayer.value.color ? 'win' : 'loss'),
        moves: currentGame.value.moves,
        date: Date.now()
      }
      
      gameHistory.value.unshift(historyEntry)
      // Keep only last 50 games
      if (gameHistory.value.length > 50) {
        gameHistory.value = gameHistory.value.slice(0, 50)
      }
      saveToLocalStorage('chess-game-history', gameHistory.value)
    }
  }

  const resign = () => {
    if (!currentGame.value || !myPlayer.value) return
    
    currentGame.value.status = 'finished'
    currentGame.value.result = myPlayer.value.color === 'white' ? 'black' : 'white'
    currentGame.value.finishedAt = Date.now()
    
    // Save to history
    if (opponentId.value) {
      const historyEntry: GameHistoryEntry = {
        gameId: currentGame.value.id,
        opponent: opponentId.value,
        myColor: myPlayer.value.color,
        result: 'loss',
        moves: currentGame.value.moves,
        date: Date.now()
      }
      
      gameHistory.value.unshift(historyEntry)
      if (gameHistory.value.length > 50) {
        gameHistory.value = gameHistory.value.slice(0, 50)
      }
      saveToLocalStorage('chess-game-history', gameHistory.value)
    }
  }

  const resetGame = () => {
    chess.value = new Chess()
    currentGame.value = null
    myPlayer.value = null
    opponentId.value = null
  }

  const getLegalMoves = (square: string) => {
    return chess.value.moves({ square, verbose: true })
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
    getLegalMoves
  }
}
