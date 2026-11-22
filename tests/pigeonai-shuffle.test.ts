import assert from 'node:assert/strict'
import test from 'node:test'
import { Chess } from 'chess.js'
import { movesNotShuffling } from '../src/utils/aiMoves'

const legalAfter = (history: string[]) => {
  const c = new Chess()
  for (const m of history) c.move(m)
  return { fen: c.fen(), legal: c.moves({ verbose: true }) as { san: string; from: string; to: string }[] }
}

test('a piece does not go back to a square it just stood on, even when the position is new', () => {
  // Black's rook walks h8-g8-h8 while White plays other moves: every position is new.
  const history = ['d4', 'Nh6', 'Nf3', 'Rg8', 'e3', 'Rh8', 'c3']
  const { fen, legal } = legalAfter(history)
  const sans = movesNotShuffling(fen, history, legal).map((m) => m.san)
  assert.ok(!sans.includes('Rg8'), 'Rg8 again is left out')
  assert.ok(sans.includes('e6') && sans.includes('Ng4'), 'other moves stay')
})

test('the game from the report: Ra8/Rb8 is not offered again', () => {
  const history = ['d4', 'Nc6', 'Nf3', 'Rb8', 'Bf4', 'Ra8', 'e3', 'Rb8', 'Bd3', 'Ra8', 'O-O']
  const { fen, legal } = legalAfter(history)
  const sans = movesNotShuffling(fen, history, legal).map((m) => m.san)
  assert.ok(!sans.includes('Rb8'))
})

test('only the walk back is left out: the knight may go on, not back to g1', () => {
  const history = ['e4', 'e5', 'Nf3', 'Nc6']
  const { fen, legal } = legalAfter(history)
  const left = legal.filter((m) => !movesNotShuffling(fen, history, legal).includes(m)).map((m) => m.san)
  assert.deepEqual(left, ['Ng1'])
})
