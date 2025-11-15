// Chess tactical puzzles with FEN positions
// Each puzzle has a starting position and the solution move(s)

export interface ChessPuzzle {
  id: string
  fen: string // Board position in FEN notation
  solution: string[] // Array of moves in SAN notation (e.g., ['Qxh7+', 'Kxh7', 'Rh3#'])
  description: string // Brief description of the tactical theme
  difficulty: 'easy' | 'medium' | 'hard'
  hint: string // Hint text to help solve the puzzle
}

export const chessPuzzles: ChessPuzzle[] = [
  // Easy Puzzles - Basic Tactics
  {
    id: 'puzzle-001',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    solution: ['Qxf7#'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'Look for a checkmate on f7 - the king has no escape!'
  },
  {
    id: 'puzzle-002',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
    solution: ['Bxf7+'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'The bishop on c4 can capture with check, winning material.'
  },
  {
    id: 'puzzle-003',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1',
    solution: ['Qxf7#'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'The queen can deliver checkmate on f7 - the king is trapped!'
  },
  {
    id: 'puzzle-004',
    fen: 'rnbqkb1r/pppp1ppp/5n2/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 1',
    solution: ['Qxe5+'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'The queen can capture the e5 pawn with check, winning it for free.'
  },
  {
    id: 'puzzle-005',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1',
    solution: ['Nxe5', 'Nxe5', 'Bxf7+'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'Start with a knight capture, then finish with a bishop check!'
  },
  
  // Medium Puzzles - More Complex Tactics
  {
    id: 'puzzle-006',
    fen: 'r2qkb1r/ppp2ppp/2n1pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 1',
    solution: ['cxd5', 'exd5', 'Nxd5'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Trade pawns and then look for a knight fork opportunity.'
  },
  {
    id: 'puzzle-007',
    fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1',
    solution: ['Bxf7+', 'Rxf7', 'Ng5'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Sacrifice your bishop with check, then attack the exposed rook.'
  },
  {
    id: 'puzzle-008',
    fen: '2kr3r/ppp2ppp/2n1p3/3qP3/3P4/2P5/P1P2PPP/R1BQ1RK1 w - - 0 1',
    solution: ['Qxd5', 'exd5', 'e6'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Trade queens and then push your passed pawn forward.'
  },
  {
    id: 'puzzle-009',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
    solution: ['Nd5'],
    description: 'Find the best square',
    difficulty: 'medium',
    hint: 'Your knight can dominate the center with a powerful outpost.'
  },
  {
    id: 'puzzle-010',
    fen: '5rk1/pp3ppp/2p5/2P5/8/P7/5PPP/3R2K1 w - - 0 1',
    solution: ['Rd8', 'Rxd8', 'cxd8=Q+'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Trade rooks and promote your pawn with check!'
  },
  {
    id: 'puzzle-011',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b5/2BpP3/5N2/PPP2PPP/RNBQ1RK1 w kq - 0 1',
    solution: ['Bxf7+', 'Kxf7', 'Ng5+'],
    description: 'Find the winning attack',
    difficulty: 'medium',
    hint: 'Start with a bishop sacrifice, then unleash your knight with check.'
  },
  {
    id: 'puzzle-012',
    fen: 'r2q1rk1/ppp2ppp/2n1bn2/2bpp3/4P3/2NP1N2/PPPB1PPP/R2Q1RK1 w - - 0 1',
    solution: ['Nxe5', 'Nxe5', 'Bxh7+'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Capture the pawn with your knight, then deliver a discovered attack on the king.'
  },
  
  // Hard Puzzles - Advanced Combinations
  {
    id: 'puzzle-013',
    fen: 'r1b2rk1/2qnbppp/p2ppn2/1p4B1/3NPP2/2N2Q2/PPP3PP/2KR1B1R w - - 0 1',
    solution: ['Qxf6', 'Bxf6', 'Nxf6+', 'Kh8', 'Nxd7'],
    description: 'Find the winning move',
    difficulty: 'hard',
    hint: 'Start with a queen sacrifice to open up the black king.'
  },
  {
    id: 'puzzle-014',
    fen: 'r4rk1/1bq1bppp/ppn1pn2/2pp4/3P4/1PN1PN2/PBQ1BPPP/R4RK1 w - - 0 1',
    solution: ['Nxd5', 'exd5', 'Bxh7+', 'Kxh7', 'Qxc6'],
    description: 'Find the winning move',
    difficulty: 'hard',
    hint: 'Start with a knight sacrifice, then follow up with a bishop sacrifice to win the queen.'
  },
  {
    id: 'puzzle-015',
    fen: 'r2qkb1r/ppp2ppp/2n2n2/3pp1B1/3P4/2N1P3/PPP2PPP/R2QKBNR w KQkq - 0 1',
    solution: ['Bxf6', 'gxf6', 'Qh5'],
    description: 'Find the winning attack',
    difficulty: 'hard',
    hint: 'Remove the defender of the kingside, then bring your queen to the attack.'
  },
  {
    id: 'puzzle-016',
    fen: '4r1k1/pp3ppp/2p1b3/q2pP3/3P4/P1P2Q2/5PPP/R4RK1 w - - 0 1',
    solution: ['Qf6', 'Rf8', 'Qxe6'],
    description: 'Find the winning move',
    difficulty: 'hard',
    hint: 'Threaten the rook and the bishop simultaneously.'
  },
  {
    id: 'puzzle-017',
    fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 0 1',
    solution: ['Bxf7+', 'Kxf7', 'Ng5+', 'Kg8', 'Qh5'],
    description: 'Find the winning attack',
    difficulty: 'hard',
    hint: 'A classic Greek Gift sacrifice - give up your bishop to expose the king.'
  },
  {
    id: 'puzzle-018',
    fen: 'r1bqr1k1/pp3pbp/2np1np1/2p5/2P1P3/2N2NP1/PP1QBPBP/R4RK1 w - - 0 1',
    solution: ['Bxh7+', 'Kxh7', 'Ng5+', 'Kg8', 'Qh5'],
    description: 'Find the winning attack',
    difficulty: 'hard',
    hint: 'Another Greek Gift - sacrifice your light-squared bishop to launch an attack.'
  },
  {
    id: 'puzzle-019',
    fen: '2r2rk1/5ppp/pq1p1n2/1pb1p3/4P3/1BP2N1P/PP1N1PP1/R2Q1RK1 w - - 0 1',
    solution: ['Nh4', 'g6', 'Nf5'],
    description: 'Find the plan',
    difficulty: 'hard',
    hint: 'Reposition your knight to a dominating square attacking the weak pawns.'
  },
  {
    id: 'puzzle-020',
    fen: 'r1b1k2r/ppppqppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w kq - 0 1',
    solution: ['Bxf7+', 'Qxf7', 'Ng5', 'Qe7', 'Qh5+'],
    description: 'Find the winning attack',
    difficulty: 'hard',
    hint: 'Sacrifice your bishop with check, then exploit the weak squares around the king.'
  },
  
  // Black to Move Puzzles
  {
    id: 'puzzle-021',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1',
    solution: ['Qxf2#'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'The queen can deliver checkmate on f2 - the king is trapped!'
  },
  {
    id: 'puzzle-022',
    fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P2q/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    solution: ['Qxe4+'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'The queen can capture the e4 pawn with check, winning it for free.'
  },
  {
    id: 'puzzle-023',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P2Q/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1',
    solution: ['Nxe4'],
    description: 'Find the winning move',
    difficulty: 'easy',
    hint: 'Your knight can capture the undefended pawn.'
  },
  {
    id: 'puzzle-024',
    fen: 'r2qkb1r/ppp2ppp/2np1n2/4p1B1/2B1P3/2N5/PPPP1PPP/R2QK1NR b KQkq - 0 1',
    solution: ['Nxe4', 'Bxd8', 'Bxf2+', 'Ke2', 'Bg4+'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Start with a knight sacrifice to expose the white king.'
  },
  {
    id: 'puzzle-025',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 1',
    solution: ['Bxf2+', 'Kxf2', 'Nxe4+'],
    description: 'Find the winning move',
    difficulty: 'medium',
    hint: 'Sacrifice your bishop to win back material with a knight fork.'
  },
  {
    id: 'puzzle-026',
    fen: 'r2q1rk1/ppp2ppp/2n1bn2/2bpp3/4P3/2NP1N2/PPPB1PPP/R2QK2R b KQ - 0 1',
    solution: ['Bxf2+', 'Kxf2', 'Qd4+'],
    description: 'Find the winning attack',
    difficulty: 'medium',
    hint: 'Sacrifice your bishop to expose the white king to a powerful check.'
  },
  {
    id: 'puzzle-027',
    fen: 'r2qkb1r/ppp2ppp/2n5/3pP3/3Pn3/2N5/PPP2PPP/R1BQKB1R b KQkq - 0 1',
    solution: ['Qh4+', 'g3', 'Nxg3', 'hxg3', 'Qxh1+'],
    description: 'Find the winning move',
    difficulty: 'hard',
    hint: 'Start with a queen check to force white into a vulnerable position.'
  },
  {
    id: 'puzzle-028',
    fen: 'r1bq1rk1/ppp2ppp/2n2n2/3p4/1b1P4/2NBPN2/PPP2PPP/R1BQK2R b KQ - 0 1',
    solution: ['Nxe4', 'Nxe4', 'Bxe3', 'fxe3', 'Qh4+'],
    description: 'Find the winning move',
    difficulty: 'hard',
    hint: 'Trade pieces to create a devastating attack on the white king.'
  }
]

/**
 * Get a random puzzle from the collection
 */
export function getRandomPuzzle(): ChessPuzzle {
  const randomIndex = Math.floor(Math.random() * chessPuzzles.length)
  return chessPuzzles[randomIndex]
}

/**
 * Get a random puzzle by difficulty
 */
export function getRandomPuzzleByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): ChessPuzzle {
  const filteredPuzzles = chessPuzzles.filter(p => p.difficulty === difficulty)
  if (filteredPuzzles.length === 0) {
    return getRandomPuzzle()
  }
  const randomIndex = Math.floor(Math.random() * filteredPuzzles.length)
  return filteredPuzzles[randomIndex]
}

/**
 * Get puzzle by ID
 */
export function getPuzzleById(id: string): ChessPuzzle | undefined {
  return chessPuzzles.find(p => p.id === id)
}
