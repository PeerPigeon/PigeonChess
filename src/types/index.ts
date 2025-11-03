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
  type: 'move' | 'gameStart' | 'gameEnd' | 'resign' | 'offerDraw' | 'acceptDraw' | 'rejectDraw' | 'challengeRejected'
  gameId: string
  data?: any
}

export interface MatchmakingRequest {
  playerId: string
  timestamp: number
}

export interface GameHistoryEntry {
  gameId: string
  opponent: string
  myColor: 'white' | 'black'
  result: 'win' | 'loss' | 'draw'
  moves: string[]
  date: number
}

export interface Settings {
  signalingUrls: string[]
  networkName: string
}
