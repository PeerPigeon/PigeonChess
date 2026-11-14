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
          <!-- Analysis arrow markers with specific colors -->
          <marker
            id="arrowhead-green"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4ade80" />
          </marker>
          <marker
            id="arrowhead-yellow"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
          </marker>
          <marker
            id="arrowhead-red"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f87171" />
          </marker>
          <marker
            id="arrowhead-blue"
            viewBox="0 0 10 10"
            refX="0"
            refY="5"
            markerWidth="2.5"
            markerHeight="2.5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
        </defs>
        <!-- Permanent arrows (user arrows first, then analysis arrows for correct layering) -->
        <g v-for="(arrow, index) in allArrows" :key="index">
          <line
            :x1="arrow.x1"
            :y1="arrow.y1"
            :x2="arrow.x2"
            :y2="arrow.y2"
            :stroke="arrow.color ? getAnalysisColor(arrow.color) : getColorFromType(arrow.type)"
            stroke-width="0.15"
            stroke-linecap="round"
            :marker-end="arrow.color ? getAnalysisMarkerUrl(arrow.color) : getMarkerUrl(arrow.type)"
            :style="arrow.color ? `opacity: 0.85` : `opacity: ${(arrow as any).removing ? 0 : 0.85}; transition: opacity 0.3s ease-out`"
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
          :data-square="getSquareId(rowIndex, colIndex)"
          :class="{
            light: (rowIndex + colIndex) % 2 === 0,
            dark: (rowIndex + colIndex) % 2 === 1,
            selected: isSquareSelected(rowIndex, colIndex),
            highlight: isSquareHighlighted(rowIndex, colIndex),
            'legal-move': isLegalMoveSquare(rowIndex, colIndex),
            'drag-over': isDragOver(rowIndex, colIndex),
            'king-in-check': isKingInCheck(rowIndex, colIndex),
            'last-move': isLastMoveSquare(rowIndex, colIndex),
            'hint-square': isHintSquare(rowIndex, colIndex),
            premove: isPremoveSquare(rowIndex, colIndex)
          }"
          @click="handleSquareClick(rowIndex, colIndex)"
          @mousedown.right.prevent="handleRightMouseDown(rowIndex, colIndex)"
          @contextmenu.prevent
        >
          <img 
            v-if="getPiece(rowIndex, colIndex) && getPieceImageUrl(rowIndex, colIndex)"
            class="piece"
            :src="getPieceImageUrl(rowIndex, colIndex)"
            :alt="getPieceSymbol(rowIndex, colIndex)"
            draggable="false"
            :class="{ movable: interactive && canPick(getPiece(rowIndex, colIndex)?.color), 'drag-source': drag?.moved && drag.from === getSquareName(rowIndex, colIndex) }"
            @pointerdown="handlePiecePointerDown(rowIndex, colIndex, $event)"
          />
          <div v-if="showCoordinates && colIndex === (flipped ? 7 : 0)" class="rank-label">
            {{ 8 - rowIndex }}
          </div>
          <div v-if="showCoordinates && rowIndex === (flipped ? 0 : 7)" class="file-label">
            {{ String.fromCharCode(97 + colIndex) }}
          </div>
        </div>
      </div>
    </div>
    
    <!-- The piece being dragged, under the finger or mouse -->
    <Teleport to="body">
      <img
        v-if="drag?.moved"
        class="drag-ghost"
        :src="drag.url"
        alt=""
        :style="{ left: `${drag.x - drag.size / 2}px`, top: `${drag.y - drag.size / 2}px`, width: `${drag.size}px`, height: `${drag.size}px` }"
      />
    </Teleport>

    <!-- Promotion Dialog -->
    <div v-if="showPromotionDialog" class="promotion-overlay" @click="showPromotionDialog = false">
      <div class="promotion-dialog" @click.stop>
        <h3>Promote to</h3>
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

<script lang="ts">
// Shared by every board on the page: each piece SVG is fetched once per visit,
// and each coloured version is built once, however many boards come and go.
const pieceTemplates = new Map<string, Promise<string>>()
const coloredPieces = new Map<string, string>()

function pieceTemplate(path: string): Promise<string> {
  let text = pieceTemplates.get(path)
  if (!text) {
    text = fetch(path).then((response) => {
      if (!response.ok) throw new Error(`${path}: ${response.status}`)
      return response.text()
    })
    text.catch(() => pieceTemplates.delete(path))
    pieceTemplates.set(path, text)
  }
  return text
}
</script>

<script setup lang="ts">
import { ref, shallowRef, watch, computed, onMounted, onUnmounted } from 'vue'
import { useSounds } from '../composables/useSounds'
import { boardChanged } from '../utils/boardRef'

interface Props {
  chess: any  // Accept any type to handle the ref
  flipped?: boolean
  interactive?: boolean
  showCoordinates?: boolean
  lastMove?: { from: string; to: string } | null
  analysisArrows?: Array<{ from: string; to: string; color: string }>
  hintSquare?: string | null
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
  /** Draw a piece type with another piece's art, e.g. { n: 'g' } shows knights as pigeons. */
  pieceArt?: Record<string, string>
  /**
   * The player's colour, in a game: only their pieces can be picked up, and during the opponent's turn a
   * move is a pre-move (played the moment their turn comes, if still legal). Without it: the side to move.
   */
  myColor?: 'w' | 'b' | null
}

const props = withDefaults(defineProps<Props>(), {
  flipped: false,
  interactive: true,
  showCoordinates: true,
  lastMove: null,
  analysisArrows: () => [],
  hintSquare: null
})

// The board as it is now. It is not a deep reactive object (utils/boardRef.ts): reading the
// version first makes what reads it run again after each move, undo or load.
const board = () => {
  boardChanged()
  return props.chess
}

const getSquareId = (rowIndex: number, colIndex: number) => {
  const file = String.fromCharCode(97 + colIndex)
  const rank = String(8 - rowIndex)
  return `${file}${rank}`
}

const emit = defineEmits<{
  move: [from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n']
}>()

const { playMoveSound, playCaptureSound, playCastleSound } = useSounds()

const boardRef = ref<HTMLElement>()
const arrowCanvas = ref<SVGElement>()
const selectedSquare = ref<string | null>(null)
const legalMoves = ref<any[]>([])
const dragOverSquare = ref<string | null>(null)
const showPromotionDialog = ref(false)
const promotionMove = ref<{ from: string; to: string } | null>(null)
const promotingColor = ref<'w' | 'b'>('w') // Store color to avoid reactivity issues

/** A move queued during the opponent's turn: played the moment the player's turn comes, if still legal. */
const premove = ref<{ from: string; to: string; promotion?: 'q' } | null>(null)
/** A pre-move's sound waits this long after the opponent's move lands. */
const PREMOVE_SOUND_AFTER_MS = 180
/** A piece being dragged: where from, where the pointer is, its picture and size; moved once it left its spot. */
const drag = ref<{ from: string; x: number; y: number; x0: number; y0: number; url: string; size: number; moved: boolean } | null>(null)
/** A drag just ended: the click the browser sends after it is not a click. */
let clickQuietUntil = 0

/** Whether the player picks up pieces of this colour now. */
const canPick = (color?: string): boolean => {
  if (!color) return false
  return props.myColor ? color === props.myColor : color === board().turn()
}
/** The opponent is to move: a move now is a pre-move. */
const isPremoveTime = (): boolean => !!props.myColor && board().turn() !== props.myColor
/**
 * Where the piece on `square` can go: its legal moves, or during the opponent's turn every square it could
 * reach on an empty board (a pre-move: a recapture lands where a piece of the player's own stands now, or
 * where the opponent's piece is still to come). It is checked against the real moves when it is played.
 */
const movesFrom = (square: string): any[] => {
  if (!isPremoveTime()) return board().moves({ square: square as any, verbose: true })
  const piece = board().get(square as any)
  if (!piece) return []
  const f = square.charCodeAt(0) - 97, r = Number(square[1]) - 1
  const out = new Set<string>()
  const add = (df: number, dr: number) => { const x = f + df, y = r + dr; if (x >= 0 && x < 8 && y >= 0 && y < 8) out.add(`${String.fromCharCode(97 + x)}${y + 1}`) }
  const ray = (df: number, dr: number) => { for (let k = 1; k < 8; k++) add(df * k, dr * k) }
  const up = piece.color === 'w' ? 1 : -1
  switch (piece.type) {
    case 'p':
      add(0, up); add(-1, up); add(1, up)
      if (r === (piece.color === 'w' ? 1 : 6)) add(0, 2 * up)
      break
    case 'n': for (const [a, b] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(a, b); break
    case 'b': ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); break
    case 'r': ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1); break
    case 'q': ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1); break
    case 'k':
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) add(a, b)
      // Castling, from the king's own square.
      if (f === 4 && r === (piece.color === 'w' ? 0 : 7)) { add(2, 0); add(-2, 0) }
      break
  }
  return [...out].map((to) => {
    const there = board().get(to as any)
    return { from: square, to, flags: '', ...(there && there.color !== piece.color ? { captured: there.type } : {}) }
  })
}
const isPremoveSquare = (row: number, col: number): boolean => {
  const sq = getSquareName(row, col)
  return !!premove.value && (premove.value.from === sq || premove.value.to === sq)
}
const clearSelection = () => {
  selectedSquare.value = null
  legalMoves.value = []
}

/** A move from the selected piece to `to`: played, a pre-move, or the promotion question. False: not a move it has. */
const tryMove = (from: string, to: string): boolean => {
  const move = legalMoves.value.find((m) => m.to === to)
  if (!move) return false
  const fromPiece = board().get(from as any)
  const isPromotion = fromPiece?.type === 'p' && (to[1] === '8' || to[1] === '1')
  if (isPremoveTime()) {
    premove.value = { from, to, ...(isPromotion ? { promotion: 'q' as const } : {}) }
    clearSelection()
    return true
  }
  if (isPromotion) {
    promotingColor.value = board().turn()
    promotionMove.value = { from, to }
    showPromotionDialog.value = true
    return true
  }
  const isCastle = move.flags.includes('k') || move.flags.includes('q')
  if (isCastle) playCastleSound()
  else if (move.captured !== undefined) playCaptureSound()
  else playMoveSound()
  emit('move', from, to)
  clearSelection()
  return true
}

// The player's turn comes: the pre-move is played if it is legal now, else dropped. A board changed under
// it (a new game, a take-back) drops it too.
watch(() => board().fen(), () => {
  const p = premove.value
  if (!p || !props.myColor) return
  if (board().get(p.from as any)?.color !== props.myColor) { premove.value = null; return }
  if (board().turn() !== props.myColor) return
  premove.value = null
  const legal = board().moves({ square: p.from as any, verbose: true }).find((m: any) => m.to === p.to)
  if (!legal || !props.interactive) return
  setTimeout(() => {
    if (board().turn() !== props.myColor) return
    const isCastle = legal.flags.includes('k') || legal.flags.includes('q')
    emit('move', p.from, p.to, p.promotion)
    // The move goes at once; its sound just after the opponent's (which plays as their move lands, and is
    // over in about 0.13 s), so the two are heard one after the other, not as one.
    setTimeout(() => {
      if (isCastle) playCastleSound()
      else if (legal.captured !== undefined) playCaptureSound()
      else playMoveSound()
    }, PREMOVE_SOUND_AFTER_MS)
  }, 0)
})
watch(() => props.interactive, (on) => { if (!on) { premove.value = null; drag.value = null; dragOverSquare.value = null } })

// Arrow drawing state
interface Arrow {
  x1: number
  y1: number
  x2: number
  y2: number
  type: 'white' | 'black' | 'empty' | 'neutral' // Store type instead of color
  removing?: boolean
  color?: string // Custom color for analysis arrows
}

const arrows = ref<Arrow[]>([])
const drawingArrow = ref<Arrow | null>(null)
const arrowStartSquare = ref<{ row: number; col: number } | null>(null)
const arrowDragMoved = ref(false) // Track if mouse moved during arrow drag

// Convert analysis arrows to Arrow format and combine with user arrows
const allArrows = computed(() => {
  const userArrows = arrows.value
  const analysisArrowsConverted = (props.analysisArrows || []).map(arrow => {
    const fromSquare = squareToCoords(arrow.from)
    const toSquare = squareToCoords(arrow.to)
    
    // Calculate arrow from center to center
    const x1 = fromSquare.col + 0.5
    const y1 = fromSquare.row + 0.5
    const x2 = toSquare.col + 0.5
    const y2 = toSquare.row + 0.5
    
    // Calculate direction vector
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    
    // Shorten the arrow by the arrowhead size (approximately 0.2 units)
    const arrowheadSize = 0.2
    const shortenedX2 = length > 0 ? x2 - (dx / length) * arrowheadSize : x2
    const shortenedY2 = length > 0 ? y2 - (dy / length) * arrowheadSize : y2
    
    return {
      x1,
      y1,
      x2: shortenedX2,
      y2: shortenedY2,
      type: 'neutral' as const,
      color: arrow.color,
      isAnalysis: true // Mark as analysis arrow
    }
  })
  // Put user arrows first, analysis arrows last (so they render on top)
  return [...userArrows, ...analysisArrowsConverted]
})

// Helper to convert square name to coordinates
const squareToCoords = (square: string): { row: number; col: number } => {
  const file = square.charCodeAt(0) - 97 // a=0, b=1, etc.
  const rank = parseInt(square[1])
  return {
    row: 8 - rank, // Convert rank to row (rank 8 = row 0)
    col: file
  }
}

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

// Get marker URL for analysis arrows based on color
const getAnalysisMarkerUrl = (color: string): string => {
  if (color === '#4ade80') {
    return 'url(#arrowhead-green)'
  } else if (color === '#fbbf24') {
    return 'url(#arrowhead-yellow)'
  } else if (color === '#f87171') {
    return 'url(#arrowhead-red)'
  } else if (color === 'blue' || color === '#3b82f6') {
    return 'url(#arrowhead-blue)'
  }
  return 'url(#arrowhead-neutral)'
}

const getAnalysisColor = (color: string): string => {
  if (color === 'green') return '#4ade80'
  if (color === 'yellow') return '#fbbf24'
  if (color === 'red') return '#f87171'
  if (color === 'blue') return '#3b82f6'
  return color // Return as-is if already hex or unknown
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
  return board().get(square as any)
}

const getPieceSymbol = (row: number, col: number): string => {
  const piece = getPiece(row, col)
  if (!piece) return ''
  return PIECE_SYMBOLS[`${piece.color}${piece.type}`] || ''
}

// Coloured SVG data URLs live in coloredPieces (module level, above).

// Watch for custom color changes and clear cache
const customColorsKey = computed(() => {
  const colors = props.pieceColors || {}
  return `${colors.whiteFill}|${colors.blackFill}|${colors.whiteStroke}|${colors.blackStroke}`
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
  // In the pigeon variant the knight is a pigeon (public/pieces/wg.svg).
  const art = props.pieceArt?.[piece.type] || (board()?.variant === 'pigeon' && piece.type === 'n' ? 'g' : piece.type)
  const cacheKey = `${pieceKey}-${art}-${fillColor}-${strokeColor}`
  
  // Return cached version if available
  if (coloredPieces.has(cacheKey)) {
    return coloredPieces.get(cacheKey)!
  }
  
  // Always fetch white piece as template
  const templatePath = `/pieces/w${art}.svg`
  
  try {
    const svgText = await pieceTemplate(templatePath)
    
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
    coloredPieces.set(cacheKey, dataUrl)
    return dataUrl
  } catch (err) {
    console.error('Failed to load SVG:', err)
    return templatePath
  }
}

// Reactive piece images with colors
const pieceImages = shallowRef<Map<string, string>>(new Map())

// Update piece images when colors or board changes
let lastPieceImageFen = ref('')
let lastCustomColorsKey = ref('')
watch([() => board().fen(), customColorsKey], async (newVals) => {
  const newFen = newVals[0]
  const newKey = newVals[1]
  // Prevent infinite loops
  if (newFen === lastPieceImageFen.value && newKey === lastCustomColorsKey.value) return
  lastPieceImageFen.value = newFen
  lastCustomColorsKey.value = newKey
  
  const newMap = new Map<string, string>()
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = getPiece(row, col)
      if (piece) {
        const key = `${row}-${col}`
        const imageUrl = await getPieceImageWithColors(row, col)
        newMap.set(key, imageUrl)
      }
    }
  }
  pieceImages.value = newMap
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

const isHintSquare = (row: number, col: number): boolean => {
  if (!props.hintSquare) return false
  const squareName = getSquareName(row, col)
  return squareName === props.hintSquare
}

const isKingInCheck = (row: number, col: number): boolean => {
  const piece = getPiece(row, col)
  if (!piece || piece.type !== 'k') return false
  
  // Check if this king's color is currently in check
  return board().isCheck() && board().turn() === piece.color
}

const isLegalMoveSquare = (row: number, col: number): boolean => {
  return isSquareHighlighted(row, col)
}

const handleSquareClick = (row: number, col: number) => {
  if (!props.interactive) return
  if (performance.now() < clickQuietUntil) return
  // A click with a pre-move queued (and nothing picked up) takes the pre-move back.
  if (premove.value && !selectedSquare.value) { premove.value = null; return }
  
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
  
  // A piece already picked up: this square is where it goes, another of the player's pieces, or nothing.
  if (selectedSquare.value) {
    if (tryMove(selectedSquare.value, square)) return
    if (piece && canPick(piece.color)) {
      selectedSquare.value = square
      legalMoves.value = movesFrom(square)
    } else clearSelection()
  } else if (piece && canPick(piece.color)) {
    selectedSquare.value = square
    legalMoves.value = movesFrom(square)
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

// Dragging a piece (mouse, finger or pen alike): it follows the pointer, its own square shows it faded,
// and where it is let go is where it goes (or nothing, back where it was).
const squareAt = (x: number, y: number): string | null => {
  for (const el of document.elementsFromPoint(x, y)) {
    const sq = (el as HTMLElement).dataset?.square
    if (sq && boardRef.value?.contains(el)) return sq
  }
  return null
}
const onDragMove = (e: PointerEvent) => {
  const d = drag.value
  if (!d) return
  d.x = e.clientX
  d.y = e.clientY
  if (!d.moved && Math.hypot(d.x - d.x0, d.y - d.y0) > 5) {
    d.moved = true
    clearArrows()
    premove.value = premove.value && premove.value.from === d.from ? null : premove.value
    selectedSquare.value = d.from
    legalMoves.value = movesFrom(d.from)
  }
  if (d.moved) dragOverSquare.value = squareAt(d.x, d.y)
}
const endDrag = (e: PointerEvent) => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  const d = drag.value
  drag.value = null
  dragOverSquare.value = null
  if (!d?.moved) return
  clickQuietUntil = performance.now() + 400
  const to = e.type === 'pointerup' ? squareAt(e.clientX, e.clientY) : null
  if (to && to !== d.from && tryMove(d.from, to)) return
  clearSelection()
}
const handlePiecePointerDown = (row: number, col: number, e: PointerEvent) => {
  if (!props.interactive || e.button !== 0) return
  const piece = getPiece(row, col)
  if (!piece || !canPick(piece.color)) return
  e.preventDefault()
  const img = e.currentTarget as HTMLImageElement
  const size = img.getBoundingClientRect().width * 1.15
  drag.value = { from: getSquareName(row, col), x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, url: img.src, size, moved: false }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
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
  const piece = board().get(square)
  
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
  premove.value = null
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
let lastFen = ref('')
watch(() => board().fen(), (newFen) => {
  // Prevent infinite loops by checking if FEN actually changed
  if (newFen === lastFen.value) return
  lastFen.value = newFen
  
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
  /* Nothing on the board is ever text to select or call out */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
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
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  border-radius: 3px;
  box-shadow: 0 0 0 1px rgba(28, 33, 38, 0.35);
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
  
  .piece.movable {
    cursor: default;
    pointer-events: auto;
  }
  
}

.board-row {
  display: contents;
}

.square {
  position: relative;
  cursor: pointer;
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
  background-color: rgba(247, 233, 110, 0.72);
  pointer-events: none;
  z-index: 1;
}

.square.last-move.dark::before {
  content: '';
  position: absolute;
  inset: 0;
  background-color: rgba(232, 208, 72, 0.7);
  pointer-events: none;
  z-index: 1;
}

.square.hint-square::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(245, 158, 11, 0.6) 0%, rgba(245, 158, 11, 0.3) 50%, transparent 70%);
  pointer-events: none;
  z-index: 2;
  animation: hintPulse 2s ease-in-out infinite;
}

@keyframes hintPulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}

.square.selected {
  background-color: var(--board-selected) !important;
  box-shadow: inset 0 0 0 3px rgba(46, 125, 111, 0.85);
}

.square.king-in-check {
  background-color: rgba(168, 71, 61, 0.55) !important;
}


.square.drag-over {
  background-color: var(--board-selected) !important;
  box-shadow: inset 0 0 0 3px rgba(46, 125, 111, 0.85);
}

.square.legal-move::after {
  content: '';
  position: absolute;
  /* Above the piece (z-index 10), so a capture square shows its dot too */
  z-index: 12;
  width: 30%;
  height: 30%;
  border-radius: 50%;
  /* The negative of what it covers, in grey (inverted, its colour taken out): dark on a light square,
     light on a dark one, the piece's white turned black and its black white, on any board's colours. */
  -webkit-backdrop-filter: invert(1) grayscale(1);
  backdrop-filter: invert(1) grayscale(1);
  pointer-events: none;
}


.piece {
  width: 85%;
  height: 85%;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
  filter: drop-shadow(0 1px 1px rgba(28, 33, 38, 0.18));
  position: relative;
  z-index: 10;
}

.piece.movable {
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}

.piece.movable:active {
  cursor: grabbing;
}

/* The dragged piece's own square: faded while it is in the air. */
.piece.drag-source {
  opacity: 0.25;
}

/* A queued pre-move: its two squares. */
.square.premove {
  box-shadow: inset 0 0 0 100vmax rgba(168, 71, 61, 0.35);
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
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--slate, #5a7187);
  user-select: none;
}

.rank-label {
  left: 2px;
  top: 2px;
}

/* The flipped board is rotated, so put labels where they land on the left and bottom edges */
.chess-board-container.flipped .rank-label {
  left: auto;
  top: auto;
  right: 2px;
  bottom: 2px;
}

.chess-board-container.flipped .file-label {
  right: auto;
  bottom: auto;
  left: 2px;
  top: 2px;
}

.file-label {
  right: 2px;
  bottom: 2px;
}

.square.dark .rank-label,
.square.dark .file-label {
  color: var(--wing, #bee6ee);
}

.promotion-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(28, 33, 38, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  border-radius: 8px;
}

.promotion-dialog {
  background: var(--surface, #f6f7f8);
  padding: 1.25rem;
  border-radius: 10px;
  box-shadow: 0 18px 50px rgba(28, 33, 38, 0.3);
  text-align: center;
}

.promotion-dialog h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink, #1c2126);
}

.promotion-pieces {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.promotion-piece {
  background: var(--wing, #bee6ee);
  border: 1px solid var(--line-strong, #9aa6af);
  border-radius: 6px;
  padding: 0.5rem;
  cursor: pointer;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.promotion-piece:hover {
  border-color: var(--sheen, #2e7d6f);
  box-shadow: inset 0 0 0 1px var(--sheen, #2e7d6f);
}

.promotion-piece img {
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>

<style>
/* Outside the board (teleported to the page): the piece being dragged. */
.drag-ghost {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  filter: drop-shadow(0 6px 8px rgba(28, 33, 38, 0.35));
}
</style>
