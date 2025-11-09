// Chess opening detection based on move sequences
// This identifies common openings by their characteristic moves

export interface Opening {
  name: string
  moves: string[]
  eco?: string // ECO (Encyclopedia of Chess Openings) code
}

// Database of common chess openings
// Moves are in SAN (Standard Algebraic Notation)
export const OPENINGS: Opening[] = [
  // King's Pawn Openings (1.e4)
  { name: "King's Pawn Opening", moves: ['e4'], eco: 'B00' },
  
  // Italian Game
  { name: "Italian Game", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], eco: 'C50' },
  { name: "Italian Game: Giuoco Piano", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], eco: 'C53' },
  { name: "Italian Game: Two Knights Defense", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], eco: 'C55' },
  
  // Ruy Lopez (Spanish Game)
  { name: "Ruy Lopez", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], eco: 'C60' },
  { name: "Ruy Lopez: Morphy Defense", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], eco: 'C70' },
  { name: "Ruy Lopez: Berlin Defense", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], eco: 'C65' },
  { name: "Ruy Lopez: Closed", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'], eco: 'C84' },
  
  // Sicilian Defense
  { name: "Sicilian Defense", moves: ['e4', 'c5'], eco: 'B20' },
  { name: "Sicilian Defense: Open", moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4'], eco: 'B40' },
  { name: "Sicilian Defense: Najdorf", moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], eco: 'B90' },
  { name: "Sicilian Defense: Dragon", moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], eco: 'B70' },
  { name: "Sicilian Defense: Accelerated Dragon", moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'], eco: 'B34' },
  { name: "Sicilian Defense: Sveshnikov", moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'], eco: 'B33' },
  { name: "Sicilian Defense: Classical", moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6'], eco: 'B56' },
  
  // French Defense
  { name: "French Defense", moves: ['e4', 'e6'], eco: 'C00' },
  { name: "French Defense: Advance", moves: ['e4', 'e6', 'd4', 'd5', 'e5'], eco: 'C02' },
  { name: "French Defense: Exchange", moves: ['e4', 'e6', 'd4', 'd5', 'exd5'], eco: 'C01' },
  { name: "French Defense: Winawer", moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'], eco: 'C15' },
  { name: "French Defense: Classical", moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'], eco: 'C14' },
  
  // Caro-Kann Defense
  { name: "Caro-Kann Defense", moves: ['e4', 'c6'], eco: 'B10' },
  { name: "Caro-Kann Defense: Advance", moves: ['e4', 'c6', 'd4', 'd5', 'e5'], eco: 'B12' },
  { name: "Caro-Kann Defense: Exchange", moves: ['e4', 'c6', 'd4', 'd5', 'exd5'], eco: 'B13' },
  { name: "Caro-Kann Defense: Classical", moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'], eco: 'B18' },
  
  // Scandinavian Defense
  { name: "Scandinavian Defense", moves: ['e4', 'd5'], eco: 'B01' },
  { name: "Scandinavian Defense: Main Line", moves: ['e4', 'd5', 'exd5', 'Qxd5'], eco: 'B01' },
  
  // Pirc Defense
  { name: "Pirc Defense", moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'], eco: 'B07' },
  
  // Alekhine's Defense
  { name: "Alekhine's Defense", moves: ['e4', 'Nf6'], eco: 'B02' },
  { name: "Alekhine's Defense: Four Pawns Attack", moves: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'c4', 'Nb6', 'f4'], eco: 'B03' },
  
  // Modern Defense
  { name: "Modern Defense", moves: ['e4', 'g6'], eco: 'B06' },
  
  // Queen's Pawn Openings (1.d4)
  { name: "Queen's Pawn Opening", moves: ['d4'], eco: 'A40' },
  
  // Queen's Gambit
  { name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'], eco: 'D06' },
  { name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4'], eco: 'D20' },
  { name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6'], eco: 'D30' },
  { name: "Queen's Gambit Declined: Orthodox", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7'], eco: 'D63' },
  { name: "Slav Defense", moves: ['d4', 'd5', 'c4', 'c6'], eco: 'D10' },
  { name: "Semi-Slav Defense", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'c6'], eco: 'D43' },
  
  // King's Indian Defense
  { name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6'], eco: 'E60' },
  { name: "King's Indian Defense: Classical", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'], eco: 'E90' },
  { name: "King's Indian Defense: Fianchetto", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7', 'g3'], eco: 'E62' },
  
  // Nimzo-Indian Defense
  { name: "Nimzo-Indian Defense", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], eco: 'E20' },
  { name: "Nimzo-Indian Defense: Classical", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2'], eco: 'E32' },
  
  // Grünfeld Defense
  { name: "Grünfeld Defense", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], eco: 'D80' },
  { name: "Grünfeld Defense: Exchange", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4'], eco: 'D85' },
  
  // Queen's Indian Defense
  { name: "Queen's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], eco: 'E12' },
  
  // Benoni Defense
  { name: "Benoni Defense", moves: ['d4', 'Nf6', 'c4', 'c5'], eco: 'A60' },
  { name: "Modern Benoni", moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6'], eco: 'A60' },
  
  // Dutch Defense
  { name: "Dutch Defense", moves: ['d4', 'f5'], eco: 'A80' },
  { name: "Dutch Defense: Stonewall", moves: ['d4', 'f5', 'c4', 'Nf6', 'g3', 'e6', 'Bg2', 'd5'], eco: 'A90' },
  { name: "Dutch Defense: Leningrad", moves: ['d4', 'f5', 'c4', 'Nf6', 'g3', 'g6'], eco: 'A87' },
  
  // London System
  { name: "London System", moves: ['d4', 'Nf6', 'Nf3', 'd5', 'Bf4'], eco: 'D02' },
  { name: "London System", moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'], eco: 'D02' },
  
  // Catalan Opening
  { name: "Catalan Opening", moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'], eco: 'E00' },
  
  // English Opening (1.c4)
  { name: "English Opening", moves: ['c4'], eco: 'A10' },
  { name: "English Opening: Symmetrical", moves: ['c4', 'c5'], eco: 'A30' },
  { name: "English Opening: Anglo-Indian", moves: ['c4', 'Nf6'], eco: 'A15' },
  { name: "English Opening: King's English", moves: ['c4', 'e5'], eco: 'A20' },
  
  // Reti Opening (1.Nf3)
  { name: "Reti Opening", moves: ['Nf3'], eco: 'A04' },
  { name: "Reti Opening: King's Indian Attack", moves: ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'e6'], eco: 'A07' },
  
  // Bird's Opening
  { name: "Bird's Opening", moves: ['f4'], eco: 'A02' },
  { name: "Bird's Opening: From Gambit", moves: ['f4', 'e5'], eco: 'A02' },
  
  // King's Indian Attack
  { name: "King's Indian Attack", moves: ['Nf3', 'd5', 'g3', 'c5', 'Bg2'], eco: 'A07' },
  
  // Four Knights Game
  { name: "Four Knights Game", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], eco: 'C47' },
  
  // Scotch Game
  { name: "Scotch Game", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], eco: 'C44' },
  { name: "Scotch Game: Classical", moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5'], eco: 'C45' },
  
  // Petrov's Defense
  { name: "Petrov's Defense", moves: ['e4', 'e5', 'Nf3', 'Nf6'], eco: 'C42' },
  
  // Philidor Defense
  { name: "Philidor Defense", moves: ['e4', 'e5', 'Nf3', 'd6'], eco: 'C41' },
  
  // Vienna Game
  { name: "Vienna Game", moves: ['e4', 'e5', 'Nc3'], eco: 'C25' },
  { name: "Vienna Game: Falkbeer Variation", moves: ['e4', 'e5', 'Nc3', 'Nf6'], eco: 'C29' },
  
  // King's Gambit
  { name: "King's Gambit", moves: ['e4', 'e5', 'f4'], eco: 'C30' },
  { name: "King's Gambit Accepted", moves: ['e4', 'e5', 'f4', 'exf4'], eco: 'C33' },
  { name: "King's Gambit Declined", moves: ['e4', 'e5', 'f4', 'Bc5'], eco: 'C30' },
]

/**
 * Detect the opening name based on the move sequence
 * @param moves Array of moves in SAN notation
 * @returns The most specific opening name that matches, or null if no match
 */
export function detectOpening(moves: string[]): Opening | null {
  if (!moves || moves.length === 0) {
    return null
  }

  // Find the longest matching opening
  let longestMatch: Opening | null = null
  let longestMatchLength = 0

  for (const opening of OPENINGS) {
    if (opening.moves.length > longestMatchLength && movesMatch(moves, opening.moves)) {
      longestMatch = opening
      longestMatchLength = opening.moves.length
    }
  }

  return longestMatch
}

/**
 * Check if the actual moves match the opening moves
 * @param actualMoves The moves played in the game
 * @param openingMoves The moves that define an opening
 * @returns true if the opening moves match the start of actual moves
 */
function movesMatch(actualMoves: string[], openingMoves: string[]): boolean {
  if (actualMoves.length < openingMoves.length) {
    return false
  }

  for (let i = 0; i < openingMoves.length; i++) {
    if (actualMoves[i] !== openingMoves[i]) {
      return false
    }
  }

  return true
}

/**
 * Get a formatted opening string for display
 * @param moves Array of moves in SAN notation
 * @returns Formatted opening name with ECO code, or "Starting Position" if no moves
 */
export function getOpeningName(moves: string[]): string {
  if (!moves || moves.length === 0) {
    return "Starting Position"
  }

  const opening = detectOpening(moves)
  
  if (opening) {
    return opening.eco ? `${opening.name} (${opening.eco})` : opening.name
  }

  // If no specific opening found, return a generic name based on first move
  if (moves.length >= 1) {
    const firstMove = moves[0]
    if (firstMove === 'e4') return "King's Pawn Opening"
    if (firstMove === 'd4') return "Queen's Pawn Opening"
    if (firstMove === 'c4') return "English Opening"
    if (firstMove === 'Nf3') return "Reti Opening"
    if (firstMove === 'f4') return "Bird's Opening"
    if (firstMove === 'g3') return "Benko Opening"
  }

  return "Unclassified Opening"
}
