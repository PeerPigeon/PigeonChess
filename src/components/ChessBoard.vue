<template>
  <div class="chess-board-container" :class="{ flipped: flipped }">
    <div class="chess-board" ref="boardRef">
      <!-- Arrow canvas for drawing arrows -->
      <svg 
        class="arrow-canvas" 
        ref="arrowCanvas"
        viewBox="0 0 8 8"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="arrowhead-white"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" :fill="whiteArrowColor || '#ffaa00'" />
          </marker>
          <marker
            id="arrowhead-black"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" :fill="blackArrowColor || '#ffaa00'" />
          </marker>
          <marker
            id="arrowhead-empty"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" :fill="emptyArrowColor || '#ffaa00'" />
          </marker>
          <marker
            id="arrowhead-neutral"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" :fill="neutralArrowColor || '#888888'" />
          </marker>
        </defs>
        <!-- Permanent arrows -->
        <g v-for="(arrow, index) in arrows" :key="index">
          <line
            :x1="arrow.x1"
            :y1="arrow.y1"
            :x2="arrow.x2"
            :y2="arrow.y2"
            :stroke="getColorFromType(arrow.type)"
            stroke-width="0.15"
            stroke-linecap="round"
            :marker-end="getMarkerUrl(arrow.type)"
            :opacity="arrow.removing ? 0 : 0.85"
            style="transition: opacity 0.3s ease-out"
          />
        </g>
        <!-- Temporary arrow being drawn -->
        <g v-if="drawingArrow">
          <!-- Show circle if dragging to same square, otherwise show arrow -->
          <circle
            v-if="Math.abs(drawingArrow.x2 - drawingArrow.x1) < 0.1 && Math.abs(drawingArrow.y2 - drawingArrow.y1) < 0.1"
            :cx="drawingArrow.x1"
            :cy="drawingArrow.y1"
            r="0.15"
            :fill="getColorFromType(drawingArrow.type)"
            opacity="0.6"
          />
          <line
            v-else
            :x1="drawingArrow.x1"
            :y1="drawingArrow.y1"
            :x2="drawingArrow.x2"
            :y2="drawingArrow.y2"
            :stroke="getColorFromType(drawingArrow.type)"
            stroke-width="0.15"
            stroke-linecap="round"
            :marker-end="getMarkerUrl(drawingArrow.type)"
            opacity="0.6"
          />
        </g>
      </svg>
      
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
          @mousedown.right.prevent="handleRightMouseDown(rowIndex, colIndex)"
          @contextmenu.prevent
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
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
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
  whiteArrowColor?: string
  blackArrowColor?: string
  emptyArrowColor?: string
  neutralArrowColor?: string
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
const arrowCanvas = ref<SVGElement>()
const selectedSquare = ref<string | null>(null)
const legalMoves = ref<any[]>([])
const draggedSquare = ref<string | null>(null)
const dragOverSquare = ref<string | null>(null)
const showPromotionDialog = ref(false)
const promotionMove = ref<{ from: string; to: string } | null>(null)
const promotingColor = ref<'w' | 'b'>('w') // Store color to avoid reactivity issues

// Arrow drawing state
interface Arrow {
  x1: number
  y1: number
  x2: number
  y2: number
  type: 'white' | 'black' | 'empty' | 'neutral' // Store type instead of color
  removing?: boolean
}

const arrows = ref<Arrow[]>([])
const drawingArrow = ref<Arrow | null>(null)
const arrowStartSquare = ref<{ row: number; col: number } | null>(null)
const arrowDragMoved = ref(false) // Track if mouse moved during arrow drag

// Get arrow type based on piece at start square
const getArrowType = (row: number, col: number): 'white' | 'black' | 'empty' | 'neutral' => {
  return getArrowTypeAtSquare(row, col)
}

// Get arrow color from type
const getColorFromType = (type: 'white' | 'black' | 'empty' | 'neutral'): string => {
  if (type === 'white') {
    return props.whiteArrowColor || '#ffaa00'
  } else if (type === 'black') {
    return props.blackArrowColor || '#ffaa00'
  } else if (type === 'neutral') {
    return props.neutralArrowColor || '#888888'
  } else {
    return props.emptyArrowColor || '#ffaa00'
  }
}

// Get marker URL based on type
const getMarkerUrl = (type: 'white' | 'black' | 'empty' | 'neutral'): string => {
  if (type === 'white') {
    return 'url(#arrowhead-white)'
  } else if (type === 'black') {
    return 'url(#arrowhead-black)'
  } else if (type === 'neutral') {
    return 'url(#arrowhead-neutral)'
  } else {
    return 'url(#arrowhead-empty)'
  }
}

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
  
  // Check if clicking on/near an arrow first
  const clickCenter = getSquareCenterCoordinates(row, col)
  const clickedArrowIndex = arrows.value.findIndex(arrow => {
    // Check if click is near the arrow line
    const dx = arrow.x2 - arrow.x1
    const dy = arrow.y2 - arrow.y1
    const lengthSquared = dx * dx + dy * dy
    
    if (lengthSquared === 0) return false
    
    const t = Math.max(0, Math.min(1, 
      ((clickCenter.x - arrow.x1) * dx + (clickCenter.y - arrow.y1) * dy) / lengthSquared
    ))
    
    const closestX = arrow.x1 + t * dx
    const closestY = arrow.y1 + t * dy
    
    const distance = Math.sqrt(
      (clickCenter.x - closestX) ** 2 + (clickCenter.y - closestY) ** 2
    )
    
    return distance < 0.4
  })
  
  if (clickedArrowIndex >= 0) {
    // Remove just this arrow and don't process the square click
    removeArrow(clickedArrowIndex)
    return
  }
  
  // Clear arrows on any click (if not clicking an arrow)
  clearArrows()
  
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
  
  // Clear arrows on drag start
  clearArrows()
  
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
  
  // Clear arrows on touch start
  clearArrows()
  
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

// Arrow clearing with fade animation
const clearArrows = () => {
  // Mark all arrows as removing
  arrows.value.forEach(arrow => arrow.removing = true)
  
  // Actually remove them after animation completes
  setTimeout(() => {
    arrows.value = []
  }, 300)
}

const removeArrow = (index: number) => {
  // Mark arrow as removing
  arrows.value[index].removing = true
  
  // Actually remove it after animation completes
  setTimeout(() => {
    arrows.value.splice(index, 1)
  }, 300)
}

// Arrow drawing handlers
const getSquareCenterCoordinates = (row: number, col: number): { x: number; y: number } => {
  // row and col are VISUAL positions (0-7 from top-left of rendered board)
  // No flip needed - they already represent what we see
  
  // Center of each square in the 8x8 grid
  const x = col + 0.5
  const y = row + 0.5
  
  return { x, y }
}

// Get arrow type - check for existing arrow destination first, then piece color
const getArrowTypeAtSquare = (row: number, col: number): 'white' | 'black' | 'empty' | 'neutral' => {
  const center = getSquareCenterCoordinates(row, col)
  
  // Check if this square is NEAR the destination of an existing arrow
  // We need to check the general area because arrows are shortened to avoid arrowhead overlap
  const existingArrow = arrows.value.find(arrow => {
    const dx = Math.abs(arrow.x2 - center.x)
    const dy = Math.abs(arrow.y2 - center.y)
    // Use a larger tolerance (0.5) since arrows are shortened
    return dx < 0.5 && dy < 0.5
  })
  
  // If there's an existing arrow ending here, use its type (ignore the piece)
  if (existingArrow) {
    return existingArrow.type
  }
  
  // Otherwise, check if there's a piece at this square
  const square = getSquareName(row, col)
  const piece = props.chess.get(square)
  
  // No existing arrow and no piece - use empty color
  if (!piece) {
    return 'empty'
  }
  
  // No existing arrow but there is a piece - use piece color
  return piece.color === 'w' ? 'white' : 'black'
}

const getSquareFromCoordinates = (clientX: number, clientY: number): { row: number; col: number } | null => {
  if (!boardRef.value) return null
  
  const boardRect = boardRef.value.getBoundingClientRect()
  const squareSize = boardRect.width / 8
  
  const x = clientX - boardRect.left
  const y = clientY - boardRect.top
  
  if (x < 0 || x >= boardRect.width || y < 0 || y >= boardRect.height) {
    return null
  }
  
  let col = Math.floor(x / squareSize)
  let row = Math.floor(y / squareSize)
  
  // Account for board orientation
  if (props.flipped) {
    row = 7 - row
    col = 7 - col
  }
  
  return { row, col }
}

const handleRightMouseDown = (row: number, col: number) => {
  const center = getSquareCenterCoordinates(row, col)
  arrowStartSquare.value = { row, col }
  arrowDragMoved.value = false // Reset flag
  const type = getArrowType(row, col)
  drawingArrow.value = {
    x1: center.x,
    y1: center.y,
    x2: center.x,
    y2: center.y,
    type
  }
}

const handleMouseMove = (event: MouseEvent) => {
  if (!drawingArrow.value || !boardRef.value) return
  
  // Get the square the mouse is currently over
  const currentSquare = getSquareFromCoordinates(event.clientX, event.clientY)
  
  if (currentSquare && arrowStartSquare.value) {
    // Mark that the drag moved if it's on a different square
    if (currentSquare.row !== arrowStartSquare.value.row || currentSquare.col !== arrowStartSquare.value.col) {
      arrowDragMoved.value = true
    }
    
    const endCenter = getSquareCenterCoordinates(currentSquare.row, currentSquare.col)
    const startCenter = getSquareCenterCoordinates(arrowStartSquare.value.row, arrowStartSquare.value.col)
    
    // Calculate shortened endpoint for preview
    const dx = endCenter.x - startCenter.x
    const dy = endCenter.y - startCenter.y
    const length = Math.sqrt(dx * dx + dy * dy)
    
    if (length > 0.1) {
      const arrowheadLength = 0.3
      const shortenFactor = (length - arrowheadLength) / length
      
      drawingArrow.value.x2 = startCenter.x + dx * shortenFactor
      drawingArrow.value.y2 = startCenter.y + dy * shortenFactor
    } else {
      drawingArrow.value.x2 = startCenter.x
      drawingArrow.value.y2 = startCenter.y
    }
  }
}

const handleRightMouseUp = (event: MouseEvent) => {
  if (!drawingArrow.value || !arrowStartSquare.value) return
  
  const endSquare = getSquareFromCoordinates(event.clientX, event.clientY)
  
  if (endSquare) {
    const endCenter = getSquareCenterCoordinates(endSquare.row, endSquare.col)
    const startCenter = getSquareCenterCoordinates(arrowStartSquare.value.row, arrowStartSquare.value.col)
    
    // Check if it's the same square (just a click, not a drag)
    if (endSquare.row === arrowStartSquare.value.row && endSquare.col === arrowStartSquare.value.col) {
      // Right-click on same square (no drag to a different square)
      // Check if there's an arrow starting from here
      const arrowFromThisSquare = arrows.value.findIndex(
        arrow => Math.abs(arrow.x1 - startCenter.x) < 0.1 && 
                 Math.abs(arrow.y1 - startCenter.y) < 0.1
      )
      
      if (arrowFromThisSquare >= 0) {
        // Remove arrow starting from this square
        removeArrow(arrowFromThisSquare)
      }
      // If no arrow from this square and mouse didn't move, do nothing
    } else {
      // Dragged to different square - create arrow
      const dx = endCenter.x - startCenter.x
      const dy = endCenter.y - startCenter.y
      const length = Math.sqrt(dx * dx + dy * dy)
      const arrowheadLength = 0.3 // Length of arrowhead in grid units
      
      // Shorten the line by the arrowhead length
      const shortenFactor = (length - arrowheadLength) / length
      const adjustedX2 = startCenter.x + dx * shortenFactor
      const adjustedY2 = startCenter.y + dy * shortenFactor
      
      // Get the arrow type that was determined when drawing started
      // This uses the piece color at the start square
      const arrowType = drawingArrow.value.type
      
      const newArrow = {
        x1: startCenter.x,
        y1: startCenter.y,
        x2: adjustedX2,
        y2: adjustedY2,
        type: arrowType
      }
      
      // Check if an arrow already exists in this location (for toggling)
      const existingIndex = arrows.value.findIndex(
        arrow => Math.abs(arrow.x1 - newArrow.x1) < 0.1 && 
                 Math.abs(arrow.y1 - newArrow.y1) < 0.1 &&
                 Math.abs(arrow.x2 - newArrow.x2) < 0.1 && 
                 Math.abs(arrow.y2 - newArrow.y2) < 0.1
      )
      
      if (existingIndex >= 0) {
        // Remove existing arrow (toggle off)
        removeArrow(existingIndex)
      } else {
        // Add new arrow (don't clear existing arrows, just add to them)
        arrows.value.push(newArrow)
      }
    }
  }
  
  drawingArrow.value = null
  arrowStartSquare.value = null
}

// Reset selection when chess state changes
watch(() => props.chess.fen(), () => {
  selectedSquare.value = null
  legalMoves.value = []
  // Clear arrows when a move is made
  clearArrows()
})

// Set up global mouse event listeners for arrow drawing
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleRightMouseUp)
  document.addEventListener('mousedown', handleMouseDown)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleRightMouseUp)
  document.removeEventListener('mousedown', handleMouseDown)
})

const handleMouseDown = (event: MouseEvent) => {
  // Handle left click within the board
  if (event.button === 0 && boardRef.value) {
    // Don't clear if clicking on a modal or other overlay
    const target = event.target as HTMLElement
    if (target.closest('.modal-overlay, .modal, input[type="color"]')) {
      return
    }
    
    const rect = boardRef.value.getBoundingClientRect()
    const isInsideBoard = 
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    
    if (isInsideBoard) {
      // Arrow removal is now handled in handleSquareClick
      // This just clears all arrows if clicking on empty board area
      clearArrows()
    }
  }
}
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

.arrow-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 100;
}

.arrow-canvas line {
  pointer-events: none;
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
