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
            'legal-move': isLegalMoveSquare(rowIndex, colIndex)
          }"
          @click="handleSquareClick(rowIndex, colIndex)"
        >
          <img 
            v-if="getPiece(rowIndex, colIndex)" 
            class="piece"
            :src="getPieceImageUrl(rowIndex, colIndex)"
            :alt="getPieceSymbol(rowIndex, colIndex)"
            draggable="false"
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
  showCoordinates: true
})

const emit = defineEmits<{
  move: [from: string, to: string]
}>()

const { playMoveSound, playCaptureSound, playCastleSound } = useSounds()

const boardRef = ref<HTMLElement>()
const selectedSquare = ref<string | null>(null)
const legalMoves = ref<any[]>([])

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

const getPieceImage = (row: number, col: number): string => {
  const piece = getPiece(row, col)
  if (!piece) return ''
  const pieceKey = `${piece.color}${piece.type}`
  return `/pieces/${pieceKey}.svg`
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
  
  // If no custom colors, use original SVG
  if (!colors.whiteFill && !colors.blackFill && !colors.whiteStroke && !colors.blackStroke) {
    return getPieceImage(row, col)
  }
  
  const isWhite = piece.color === 'w'
  const fillColor = isWhite 
    ? colors.whiteFill || '#ffffff'
    : colors.blackFill || '#000000'
  const strokeColor = isWhite
    ? colors.whiteStroke || '#000000'
    : colors.blackStroke || '#ffffff'
  
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
    // Style format: style="fill:#ffffff;stroke:#000000"
    modifiedSvg = modifiedSvg.replace(/fill:#fff(fff)?/gi, `fill:${fillColor}`)
    modifiedSvg = modifiedSvg.replace(/stroke:#000(000)?/gi, `stroke:${strokeColor}`)
    
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
  width: min(100%, 100vh - 210px);
  height: min(100%, 100vh - 210px);
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  border-radius: 4px;
  overflow: hidden;
}

.board-row {
  display: contents;
}

.square {
  aspect-ratio: 1 / 1;
  position: relative;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}

.square.light {
  background-color: var(--board-light);
}

.square.dark {
  background-color: var(--board-dark);
}

.square.selected {
  background-color: var(--board-selected) !important;
  box-shadow: inset 0 0 0 3px rgba(99, 102, 241, 0.6);
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
}

.chess-board-container.flipped .square:hover .piece {
  transform: rotate(180deg) scale(1.05);
}

.square:hover .piece {
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
</style>
