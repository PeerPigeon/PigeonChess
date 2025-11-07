export interface GameState {
  id: string
  playerWhite: string | null
  playerBlack: string | null
  currentTurn: 'white' | 'black'
  status: 'waiting' | 'active' | 'finished'
  result?: 'white' | 'black' | 'draw'
  moves: string[]
  fen: string
  createdAt: number
  finishedAt?: number
}

export interface Player {
  id: string
  color: 'white' | 'black'
}

export interface Move {
  from: string
  to: string
  promotion?: 'q' | 'r' | 'b' | 'n'
}

export interface ChessMessage {
  type: 'move' | 'gameStart' | 'gameEnd' | 'resign' | 'offerDraw' | 'acceptDraw' | 'rejectDraw' | 'challengeRejected' | 'draw_offer' | 'draw_accept' | 'takeback_request' | 'takeback_accept' | 'matchmaking' | 'timer_sync' | 'abandon'
  gameId?: string
  data?: any
  searching?: boolean
  timeControl?: string | null
  // Optional timer sync payload
  timer?: {
    whiteTime: number
    blackTime: number
    currentTurn: 'white' | 'black'
    lastUpdated: number
  }
  // Vector clock for causal ordering of timer/move events
  vectorClock?: Record<string, number>
  // Abandonment reason
  reason?: 'initial_move_timeout' | 'peer_disconnect'
}

export interface MatchmakingRequest {
  playerId: string
  timestamp: number
}

export interface GameHistoryEntry {
  gameId: string
  whitePlayer?: string  // Optional for backwards compatibility
  blackPlayer?: string  // Optional for backwards compatibility
  myPeerId?: string     // Optional for backwards compatibility
  opponent: string
  myColor: 'white' | 'black'
  result: 'win' | 'loss' | 'draw' | 'abandoned'
  moves: string[]
  date: number
}

export interface Settings {
  signalingUrls: string[]
  networkName: string
  boardTheme?: string
  customLightSquare?: string
  customDarkSquare?: string
  customWhitePieceColor?: string
  customBlackPieceColor?: string
  customWhitePieceOutline?: string
  customBlackPieceOutline?: string
  pieceTheme?: string
  soundEnabled?: boolean
}

export interface BoardTheme {
  id: string
  name: string
  light: string
  dark: string
  highlight: string
  selected: string
  moveDot: string
}

export interface PieceTheme {
  id: string
  name: string
  whiteFill: string
  whiteStroke: string
  blackFill: string
  blackStroke: string
}
