<template>
  <div class="chess-board-container" :class="{ flipped: flipped }">
    <div class="chess-board" ref="boardRef">
      <div
        v-for="(row, rowIndex) in 8"
        :key="rowIndex"
        class="board-row"
      >
        <div
          v-for="(col, colIndex) in 8"
          :key="colIndex"
          class="square"
          :class="{
            light: (rowIndex + colIndex) % 2 === 0,
            dark: (rowIndex + colIndex) % 2 === 1,
            selected: isSquareSelected(rowIndex, colIndex),
            highlight: isSquareHighlighted(rowIndex, colIndex),
            'legal-move': isLegalMoveSquare(rowIndex, colIndex)
          }"
          @click="handleSquareClick(rowIndex, colIndex)"
        >
          <div v-if="getPiece(rowIndex, colIndex)" class="piece">
            {{ getPieceSymbol(rowIndex, colIndex) }}
          </div>
          <div v-if="showCoordinates && colIndex === 0" class="rank-label">
            {{ 8 - rowIndex }}
          </div>
          <div v-if="showCoordinates && rowIndex === 7" class="file-label">
            {{ String.fromCharCode(97 + colIndex) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Chess } from 'chess.js'

interface Props {
  chess: Chess
  flipped?: boolean
  interactive?: boolean
  showCoordinates?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  flipped: false,
  interactive: true,
  showCoordinates: true
})

const emit = defineEmits<{
  move: [from: string, to: string]
}>()

const boardRef = ref<HTMLElement>()
const selectedSquare = ref<string | null>(null)
const legalMoves = ref<any[]>([])

const PIECE_SYMBOLS: Record<string, string> = {
  'wp': '♙', 'wn': '♘', 'wb': '♗', 'wr': '♖', 'wq': '♕', 'wk': '♔',
  'bp': '♟', 'bn': '♞', 'bb': '♝', 'br': '♜', 'bq': '♛', 'bk': '♚'
}

const getSquareName = (row: number, col: number): string => {
  const actualRow = props.flipped ? row : 7 - row
  const actualCol = props.flipped ? 7 - col : col
  return String.fromCharCode(97 + actualCol) + (actualRow + 1)
}

const getPiece = (row: number, col: number) => {
  const square = getSquareName(row, col)
  return props.chess.get(square)
}

const getPieceSymbol = (row: number, col: number): string => {
  const piece = getPiece(row, col)
  if (!piece) return ''
  return PIECE_SYMBOLS[`${piece.color}${piece.type}`] || ''
}

const isSquareSelected = (row: number, col: number): boolean => {
  return selectedSquare.value === getSquareName(row, col)
}

const isSquareHighlighted = (row: number, col: number): boolean => {
  if (!selectedSquare.value) return false
  return legalMoves.value.some(move => move.to === getSquareName(row, col))
}

const isLegalMoveSquare = (row: number, col: number): boolean => {
  return isSquareHighlighted(row, col)
}

const handleSquareClick = (row: number, col: number) => {
  if (!props.interactive) return
  
  const square = getSquareName(row, col)
  const piece = getPiece(row, col)
  
  // If a square is already selected
  if (selectedSquare.value) {
    // Check if clicking on a legal move destination
    const isLegalMove = legalMoves.value.some(move => move.to === square)
    
    if (isLegalMove) {
      // Make the move
      emit('move', selectedSquare.value, square)
      selectedSquare.value = null
      legalMoves.value = []
    } else if (piece && piece.color === props.chess.turn()) {
      // Select a new piece
      selectedSquare.value = square
      legalMoves.value = props.chess.moves({ square, verbose: true })
    } else {
      // Deselect
      selectedSquare.value = null
      legalMoves.value = []
    }
  } else if (piece && piece.color === props.chess.turn()) {
    // Select a piece
    selectedSquare.value = square
    legalMoves.value = props.chess.moves({ square, verbose: true })
  }
}

// Reset selection when chess state changes
watch(() => props.chess.fen(), () => {
  selectedSquare.value = null
  legalMoves.value = []
})
</script>

<style scoped>
.chess-board-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 1rem;
}

.chess-board-container.flipped .chess-board {
  transform: rotate(180deg);
}

.chess-board-container.flipped .piece,
.chess-board-container.flipped .rank-label,
.chess-board-container.flipped .file-label {
  transform: rotate(180deg);
}

.chess-board {
  display: flex;
  flex-direction: column;
  aspect-ratio: 1;
  max-height: 100%;
  max-width: 100%;
  border: 2px solid #333;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

.board-row {
  display: flex;
  flex: 1;
}

.square {
  flex: 1;
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.square.light {
  background-color: var(--board-light);
}

.square.dark {
  background-color: var(--board-dark);
}

.square.selected {
  background-color: var(--board-selected) !important;
}

.square.highlight {
  background-color: var(--board-highlight) !important;
}

.square.legal-move::after {
  content: '';
  position: absolute;
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.2);
}

.piece {
  font-size: clamp(2rem, 5vw, 4rem);
  user-select: none;
  line-height: 1;
}

.rank-label,
.file-label {
  position: absolute;
  font-size: 0.7rem;
  font-weight: bold;
  color: rgba(0, 0, 0, 0.5);
  user-select: none;
}

.rank-label {
  left: 2px;
  top: 2px;
}

.file-label {
  right: 2px;
  bottom: 2px;
}

.square.dark .rank-label,
.square.dark .file-label {
  color: rgba(255, 255, 255, 0.7);
}
</style>
