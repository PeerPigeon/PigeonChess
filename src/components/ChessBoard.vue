<template>
  <div class="chess-board-container" :class="{ flipped: flipped }">
    <div class="chess-board" ref="boardRef">
      <div
        v-for="(_, rowIndex) in 8"
        :key="rowIndex"
        class="board-row"
      >
        <div
          v-for="(__, colIndex) in 8"
          :key="colIndex"
          class="square"
          :class="{
            light: (rowIndex + colIndex) % 2 === 0,
            dark: (rowIndex + colIndex) % 2 === 1,
            selected: isSquareSelected(rowIndex, colIndex),
            highlight: isSquareHighlighted(rowIndex, colIndex),
            'legal-move': isLegalMoveSquare(rowIndex, colIndex),
            'drag-over': isDragOver(rowIndex, colIndex),
            'king-in-check': isKingInCheck(rowIndex, colIndex),
            'last-move': isLastMoveSquare(rowIndex, colIndex)
          }"
          @click="handleSquareClick(rowIndex, colIndex)"
          @dragover.prevent="handleDragOver(rowIndex, colIndex)"
          @dragleave="handleDragLeave(rowIndex, colIndex)"
          @drop="handleDrop(rowIndex, colIndex)"
        >
          <img 
            v-if="getPiece(rowIndex, colIndex)" 
            class="piece"
            :src="getPieceImageUrl(rowIndex, colIndex)"
            :alt="getPieceSymbol(rowIndex, colIndex)"
            :draggable="interactive && getPiece(rowIndex, colIndex)?.color === chess.turn()"
            @dragstart="handleDragStart(rowIndex, colIndex, $event)"
            @dragend="handleDragEnd"
            @touchstart="handleTouchStart(rowIndex, colIndex, $event)"
            @touchmove.prevent="handleTouchMove($event)"
            @touchend="handleTouchEnd($event)"
          />
          <div v-if="showCoordinates && colIndex === 0" class="rank-label">
            {{ 8 - rowIndex }}
          </div>
          <div v-if="showCoordinates && rowIndex === 7" class="file-label">
            {{ String.fromCharCode(97 + colIndex) }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- Promotion Dialog -->
    <div v-if="showPromotionDialog" class="promotion-overlay" @click="showPromotionDialog = false">
      <div class="promotion-dialog" @click.stop>
        <h3>Choose promotion piece:</h3>
        <div class="promotion-pieces">
          <button 
            class="promotion-piece" 
            @click="handlePromotion('q')"
            title="Queen"
          >
            <img :src="`/pieces/${promotingColor}q.svg`" alt="Queen" />
          </button>
          <button 
            class="promotion-piece" 
            @click="handlePromotion('r')"
            title="Rook"
          >
            <img :src="`/pieces/${promotingColor}r.svg`" alt="Rook" />
          </button>
          <button 
            class="promotion-piece" 
            @click="handlePromotion('b')"
            title="Bishop"
          >
            <img :src="`/pieces/${promotingColor}b.svg`" alt="Bishop" />
          </button>
          <button 
            class="promotion-piece" 
            @click="handlePromotion('n')"
            title="Knight"
          >
            <img :src="`/pieces/${promotingColor}n.svg`" alt="Knight" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useSounds } from '../composables/useSounds'

interface Props {
  chess: any  // Accept any type to handle the ref
  flipped?: boolean
  interactive?: boolean
  showCoordinates?: boolean
  lastMove?: { from: string; to: string } | null
  pieceColors?: {
    whiteFill?: string
    blackFill?: string
    whiteStroke?: string
    blackStroke?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  flipped: false,
  interactive: true,
  showCoordinates: true,
  lastMove: null
})

const emit = defineEmits<{
  move: [from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n']
}>()

const { playMoveSound, playCaptureSound, playCastleSound } = useSounds()

const boardRef = ref<HTMLElement>()
const selectedSquare = ref<string | null>(null)
const legalMoves = ref<any[]>([])
const draggedSquare = ref<string | null>(null)
const dragOverSquare = ref<string | null>(null)
const showPromotionDialog = ref(false)
const promotionMove = ref<{ from: string; to: string } | null>(null)
const promotingColor = ref<'w' | 'b'>('w') // Store color to avoid reactivity issues

const PIECE_SYMBOLS: Record<string, string> = {
  'wp': '♙', 'wn': '♘', 'wb': '♗', 'wr': '♖', 'wq': '♕', 'wk': '♔',
  'bp': '♟', 'bn': '♞', 'bb': '♝', 'br': '♜', 'bq': '♛', 'bk': '♚'
}

const getSquareName = (row: number, col: number): string => {
  // The visual flip is handled by CSS rotation
  // So we always use the same coordinate mapping
  const file = String.fromCharCode(97 + col) // a, b, c, d, e, f, g, h
  const rank = 8 - row // 8, 7, 6, 5, 4, 3, 2, 1
  return file + rank
}

const getPiece = (row: number, col: number) => {
  const square = getSquareName(row, col)
  return props.chess.get(square as any)
}

const getPieceSymbol = (row: number, col: number): string => {
  const piece = getPiece(row, col)
  if (!piece) return ''
  return PIECE_SYMBOLS[`${piece.color}${piece.type}`] || ''
}

// Cache for colored SVG data URLs
const coloredSvgCache = ref(new Map<string, string>())

// Watch for custom color changes and clear cache
const customColorsKey = computed(() => {
  const colors = props.pieceColors || {}
  return `${colors.whiteFill}|${colors.blackFill}|${colors.whiteStroke}|${colors.blackStroke}`
})

watch(customColorsKey, () => {
  // Clear cache when colors change
  coloredSvgCache.value.clear()
})

const getPieceImageWithColors = async (row: number, col: number): Promise<string> => {
  const piece = getPiece(row, col)
  if (!piece) return ''
  
  const colors = props.pieceColors || {}
  const isWhite = piece.color === 'w'
  
  // Determine colors: if custom colors provided, use them; otherwise use defaults
  const fillColor = isWhite 
    ? (colors.whiteFill || '#ffffff')
    : (colors.blackFill || '#000000')
  const strokeColor = isWhite
    ? (colors.whiteStroke || '#000000')
    : (colors.blackStroke || '#ffffff')
  
  // Always use white piece SVGs as template and recolor them
  const pieceKey = `${piece.color}${piece.type}`
  const cacheKey = `${pieceKey}-${fillColor}-${strokeColor}`
  
  // Return cached version if available
  if (coloredSvgCache.value.has(cacheKey)) {
    return coloredSvgCache.value.get(cacheKey)!
  }
  
  // Always fetch white piece as template
  const templatePath = `/pieces/w${piece.type}.svg`
  
  try {
    const response = await fetch(templatePath)
    const svgText = await response.text()
    
    // Replace fill and stroke colors in SVG (both attribute and style formats)
    let modifiedSvg = svgText
    
    // Attribute format: fill="#fff" stroke="#000"
    modifiedSvg = modifiedSvg.replace(/fill="#fff"/gi, `fill="${fillColor}"`)
    modifiedSvg = modifiedSvg.replace(/fill="#ffffff"/gi, `fill="${fillColor}"`)
    modifiedSvg = modifiedSvg.replace(/stroke="#000"/g, `stroke="${strokeColor}"`)
    modifiedSvg = modifiedSvg.replace(/stroke="#000000"/g, `stroke="${strokeColor}"`)
    // Style format: style="fill:#ffffff;stroke:#000000" (but NOT fill:none)
    modifiedSvg = modifiedSvg.replace(/fill:#ffffff\b/gi, `fill:${fillColor}`)
    modifiedSvg = modifiedSvg.replace(/fill:#fff\b/gi, `fill:${fillColor}`)
    modifiedSvg = modifiedSvg.replace(/stroke:#000000\b/gi, `stroke:${strokeColor}`)
    modifiedSvg = modifiedSvg.replace(/stroke:#000\b/gi, `stroke:${strokeColor}`)
    
    // Convert to data URL
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(modifiedSvg)
    coloredSvgCache.value.set(cacheKey, dataUrl)
    return dataUrl
  } catch (err) {
    console.error('Failed to load SVG:', err)
    return templatePath
  }
}

// Reactive piece images with colors
const pieceImages = ref<Map<string, string>>(new Map())

// Update piece images when colors or board changes
watch([() => props.chess.fen(), customColorsKey], async () => {
  pieceImages.value.clear()
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = getPiece(row, col)
      if (piece) {
        const key = `${row}-${col}`
        const imageUrl = await getPieceImageWithColors(row, col)
        pieceImages.value.set(key, imageUrl)
      }
    }
  }
}, { immediate: true })

const getPieceImageUrl = (row: number, col: number): string => {
  const key = `${row}-${col}`
  return pieceImages.value.get(key) || ''
}

const isSquareSelected = (row: number, col: number): boolean => {
  return selectedSquare.value === getSquareName(row, col)
}

const isSquareHighlighted = (row: number, col: number): boolean => {
  if (!selectedSquare.value) return false
  return legalMoves.value.some(move => move.to === getSquareName(row, col))
}

const isLastMoveSquare = (row: number, col: number): boolean => {
  if (!props.lastMove) return false
  const squareName = getSquareName(row, col)
  return squareName === props.lastMove.from || squareName === props.lastMove.to
}

const isKingInCheck = (row: number, col: number): boolean => {
  const piece = getPiece(row, col)
  if (!piece || piece.type !== 'k') return false
  
  // Check if this king's color is currently in check
  return props.chess.isCheck() && props.chess.turn() === piece.color
}

const isLegalMoveSquare = (row: number, col: number): boolean => {
  return isSquareHighlighted(row, col)
}

const handleSquareClick = (row: number, col: number) => {
  if (!props.interactive) return
  
  const square = getSquareName(row, col)
  const piece = getPiece(row, col)
  
  // If clicking the same square, deselect it
  if (selectedSquare.value === square) {
    selectedSquare.value = null
    legalMoves.value = []
    return
  }
  
  // If a square is already selected
  if (selectedSquare.value) {
    // Check if clicking on a legal move destination
    const move = legalMoves.value.find(m => m.to === square)
    
    if (move) {
      // Check if this is a pawn promotion
      const fromPiece = getPiece(
        8 - parseInt(selectedSquare.value[1]),
        selectedSquare.value.charCodeAt(0) - 97
      )
      
      const isPromotion = fromPiece?.type === 'p' && 
                          (square[1] === '8' || square[1] === '1')
      
      if (isPromotion) {
        // Store the promoting color before showing dialog
        promotingColor.value = props.chess.turn()
        // Show promotion dialog
        promotionMove.value = { from: selectedSquare.value, to: square }
        showPromotionDialog.value = true
        return
      }
      
      // Check if it's a capture move using chess.js flags
      const isCapture = move.captured !== undefined
      const isCastle = move.flags.includes('k') || move.flags.includes('q')
      
      // Play appropriate sound
      if (isCastle) {
        playCastleSound()
      } else if (isCapture) {
        playCaptureSound()
      } else {
        playMoveSound()
      }
      
      // Make the move
      emit('move', selectedSquare.value, square)
      selectedSquare.value = null
      legalMoves.value = []
    } else if (piece && piece.color === props.chess.turn()) {
      // Select a new piece
      selectedSquare.value = square
      legalMoves.value = props.chess.moves({ square: square as any, verbose: true })
    } else {
      // Deselect
      selectedSquare.value = null
      legalMoves.value = []
    }
  } else if (piece && piece.color === props.chess.turn()) {
    // Select a piece
    selectedSquare.value = square
    legalMoves.value = props.chess.moves({ square: square as any, verbose: true })
  }
}

const handlePromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
  if (!promotionMove.value) return
  
  // Emit move with promotion
  emit('move', promotionMove.value.from, promotionMove.value.to, piece)
  
  // Reset
  showPromotionDialog.value = false
  promotionMove.value = null
  selectedSquare.value = null
  legalMoves.value = []
  
  // Play sound (will be played after the move is made)
  playMoveSound()
}

// Drag and drop handlers
const handleDragStart = (row: number, col: number, event: DragEvent) => {
  if (!props.interactive) return
  
  const square = getSquareName(row, col)
  const piece = getPiece(row, col)
  
  if (!piece || piece.color !== props.chess.turn()) {
    event.preventDefault()
    return
  }
  
  draggedSquare.value = square
  selectedSquare.value = square
  legalMoves.value = props.chess.moves({ square: square as any, verbose: true })
  
  // Set drag image (optional - makes the piece follow cursor)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', square)
  }
}

const handleDragOver = (row: number, col: number) => {
  if (!props.interactive || !draggedSquare.value) return
  dragOverSquare.value = getSquareName(row, col)
}

const handleDragLeave = (row: number, col: number) => {
  if (!props.interactive) return
  const square = getSquareName(row, col)
  if (dragOverSquare.value === square) {
    dragOverSquare.value = null
  }
}

const handleDrop = (row: number, col: number) => {
  if (!props.interactive || !draggedSquare.value) return
  
  const targetSquare = getSquareName(row, col)
  const move = legalMoves.value.find(m => m.to === targetSquare)
  
  if (move) {
    // Check if this is a pawn promotion
    const fromPiece = getPiece(
      8 - parseInt(draggedSquare.value[1]),
      draggedSquare.value.charCodeAt(0) - 97
    )
    
    const isPromotion = fromPiece?.type === 'p' && 
                        (targetSquare[1] === '8' || targetSquare[1] === '1')
    
    if (isPromotion) {
      // Store the promoting color before showing dialog
      promotingColor.value = props.chess.turn()
      // Show promotion dialog
      promotionMove.value = { from: draggedSquare.value, to: targetSquare }
      showPromotionDialog.value = true
      // Reset drag state but keep promotion state
      draggedSquare.value = null
      dragOverSquare.value = null
      return
    }
    
    // Check if it's a capture move using chess.js flags
    const isCapture = move.captured !== undefined
    const isCastle = move.flags.includes('k') || move.flags.includes('q')
    
    // Play appropriate sound
    if (isCastle) {
      playCastleSound()
    } else if (isCapture) {
      playCaptureSound()
    } else {
      playMoveSound()
    }
    
    // Make the move
    emit('move', draggedSquare.value, targetSquare)
  }
  
  // Reset drag state
  draggedSquare.value = null
  dragOverSquare.value = null
  selectedSquare.value = null
  legalMoves.value = []
}

const handleDragEnd = () => {
  draggedSquare.value = null
  dragOverSquare.value = null
  selectedSquare.value = null
  legalMoves.value = []
}

// Touch handlers for mobile
const handleTouchStart = (row: number, col: number, _event: TouchEvent) => {
  if (!props.interactive) return
  
  const square = getSquareName(row, col)
  const piece = getPiece(row, col)
  
  if (!piece || piece.color !== props.chess.turn()) {
    return
  }
  
  draggedSquare.value = square
  selectedSquare.value = square
  legalMoves.value = props.chess.moves({ square: square as any, verbose: true })
}

const handleTouchMove = (event: TouchEvent) => {
  if (!props.interactive || !draggedSquare.value || !boardRef.value) return
  
  const touch = event.touches[0]
  const element = document.elementFromPoint(touch.clientX, touch.clientY)
  
  if (element && element.classList.contains('square')) {
    const allSquares = Array.from(boardRef.value.querySelectorAll('.square'))
    const index = allSquares.indexOf(element as Element)
    if (index !== -1) {
      const row = Math.floor(index / 8)
      const col = index % 8
      dragOverSquare.value = getSquareName(row, col)
    }
  }
}

const handleTouchEnd = (event: TouchEvent) => {
  if (!props.interactive || !draggedSquare.value || !boardRef.value) return
  
  const touch = event.changedTouches[0]
  const element = document.elementFromPoint(touch.clientX, touch.clientY)
  
  if (element && element.classList.contains('square')) {
    const allSquares = Array.from(boardRef.value.querySelectorAll('.square'))
    const index = allSquares.indexOf(element as Element)
    if (index !== -1) {
      const row = Math.floor(index / 8)
      const col = index % 8
      const targetSquare = getSquareName(row, col)
      const move = legalMoves.value.find(m => m.to === targetSquare)
      
      if (move) {
        // Check if this is a pawn promotion
        const fromPiece = getPiece(
          8 - parseInt(draggedSquare.value[1]),
          draggedSquare.value.charCodeAt(0) - 97
        )
        
        const isPromotion = fromPiece?.type === 'p' && 
                            (targetSquare[1] === '8' || targetSquare[1] === '1')
        
        if (isPromotion) {
          // Store the promoting color before showing dialog
          promotingColor.value = props.chess.turn()
          // Show promotion dialog
          promotionMove.value = { from: draggedSquare.value, to: targetSquare }
          showPromotionDialog.value = true
          // Reset drag state but keep promotion state
          draggedSquare.value = null
          dragOverSquare.value = null
          selectedSquare.value = null
          legalMoves.value = []
          return
        }
        
        const isCapture = move.captured !== undefined
        const isCastle = move.flags.includes('k') || move.flags.includes('q')
        
        if (isCastle) {
          playCastleSound()
        } else if (isCapture) {
          playCaptureSound()
        } else {
          playMoveSound()
        }
        
        emit('move', draggedSquare.value, targetSquare)
      }
    }
  }
  
  // Reset state
  draggedSquare.value = null
  dragOverSquare.value = null
  selectedSquare.value = null
  legalMoves.value = []
}

const isDragOver = (row: number, col: number): boolean => {
  return dragOverSquare.value === getSquareName(row, col)
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
  width: 100%;
  height: 100%;
  box-sizing: border-box;
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
  display: grid;
  grid-template-rows: repeat(8, 1fr);
  grid-template-columns: repeat(8, 1fr);
  width: 100%;
  max-width: min(100%, 100vh - 180px);
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

/* Make the board responsive on small screens */
@media (max-width: 1024px) {
  .chess-board {
    /* use available viewport width while leaving padding/margins */
    width: calc(100vw - 30px);
    height: auto;
    aspect-ratio: 1 / 1;
    max-width: none;
  }

  .piece {
    width: 90%;
    height: 90%;
  }

  .rank-label, .file-label {
    font-size: 0.65rem;
  }
  
  .square {
    /* Better touch targets on mobile */
    min-width: 40px;
    min-height: 40px;
  }
  
  .square.legal-move::after {
    width: 35%;
    height: 35%;
  }
}

/* Landscape mode - make board fit the available space */
@media (max-width: 1024px) and (orientation: landscape) {
  .chess-board-container {
    width: 100% !important;
    height: 100% !important;
  }
  
  .chess-board {
    width: auto !important;
    height: 95% !important;
    max-width: 95% !important;
    max-height: 95% !important;
    aspect-ratio: 1 / 1 !important;
    grid-template-rows: repeat(8, 1fr) !important;
    grid-template-columns: repeat(8, 1fr) !important;
  }
  
  .square {
    min-width: 0 !important;
    min-height: 0 !important;
  }
  
  .piece {
    width: 85% !important;
    height: 85% !important;
  }
}

/* Touch device specific adjustments */
@media (hover: none) and (pointer: coarse) {
  .square {
    cursor: default;
    touch-action: none;
  }
  
  .piece {
    pointer-events: auto;
    touch-action: none;
  }
  
  .piece[draggable="true"] {
    cursor: default;
    pointer-events: auto;
  }
  
  /* Disable hover effects on touch devices */
  .square:hover .piece[draggable="true"],
  .square:hover .piece:not([draggable="true"]) {
    transform: none;
  }
  
  .chess-board-container.flipped .square:hover .piece {
    transform: rotate(180deg);
  }
}

.board-row {
  display: contents;
}

.square {
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.square.light {
  background-color: var(--board-light);
}

.square.dark {
  background-color: var(--board-dark);
}

.square.last-move.light::before {
  content: '';
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 1;
}

.square.last-move.dark::before {
  content: '';
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.25);
  pointer-events: none;
  z-index: 1;
}

.square.selected {
  background-color: var(--board-selected) !important;
  box-shadow: inset 0 0 0 3px rgba(99, 102, 241, 0.6);
}

.square.king-in-check {
  background-color: rgba(220, 38, 38, 0.4) !important;
  animation: checkSquarePulse 1s ease-in-out infinite;
}

@keyframes checkSquarePulse {
  0%, 100% {
    box-shadow: inset 0 0 0 3px rgba(220, 38, 38, 0.6);
  }
  50% {
    box-shadow: inset 0 0 0 5px rgba(220, 38, 38, 0.9);
  }
}

.square.drag-over {
  background-color: var(--board-selected) !important;
  box-shadow: inset 0 0 0 3px rgba(34, 197, 94, 0.6);
}

.square.legal-move::after {
  content: '';
  position: absolute;
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: var(--board-move-dot, rgba(0, 0, 0, 0.2));
  pointer-events: none;
}

.square.legal-move:hover::after {
  background: var(--board-move-dot, rgba(0, 0, 0, 0.2));
}


.piece {
  width: 85%;
  height: 85%;
  user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
  transition: transform 0.1s ease;
  position: relative;
  z-index: 10;
}

.piece[draggable="true"] {
  cursor: grab;
  pointer-events: auto;
}

.piece[draggable="true"]:active {
  cursor: grabbing;
}

.chess-board-container.flipped .square:hover .piece {
  transform: rotate(180deg) scale(1.05);
}

.square:hover .piece[draggable="true"] {
  transform: scale(1.08);
}

.square:hover .piece:not([draggable="true"]) {
  transform: scale(1.05);
}

@media (min-width: 768px) {
  .piece {
    width: 85%;
    height: 85%;
  }
}

@media (min-width: 1024px) {
  .piece {
    width: 85%;
    height: 85%;
  }
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

.promotion-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  border-radius: 8px;
}

.promotion-dialog {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.promotion-dialog h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #1e293b;
}

.promotion-pieces {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.promotion-piece {
  background: #f1f5f9;
  border: 2px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.promotion-piece:hover {
  background: #e0e7ff;
  border-color: #6366f1;
  transform: scale(1.1);
}

.promotion-piece img {
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
