import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BotGame, makeSeatKeys } from '../src/bot/index.ts'

test('two bots play a whole game through sealed messages, and agree on how it ended', async () => {
  const [ka, kb] = [await makeSeatKeys(), await makeSeatKeys()]
  const games = new Map<string, BotGame>()
  const ends: { who: string; result: string | null; moves: number }[] = []
  // A random mover that likes captures, so the game ends soon enough.
  const choose = async (fen: string) => {
    const { Chess } = await import('chess.js')
    const c = new Chess(fen)
    const all = c.moves({ verbose: true })
    const pick = all.find((m) => m.san.includes('#')) ?? all.find((m) => m.captured === 'q') ?? all.find((m) => m.captured) ?? all[Math.floor(Math.random() * all.length)]
    return { from: pick.from, to: pick.to, promotion: pick.promotion }
  }
  const make = (me: string, them: string, color: 'white' | 'black', mine: any, theirs: any) => {
    const g = new BotGame({
      gameId: 'g1', myColor: color, opponent: them, mySeat: mine, theirSeat: theirs.pub, timeControl: { minutes: 0, increment: 0 },
      send: async (to, msg) => { setTimeout(() => games.get(to)?.handle(JSON.parse(msg), me), 0) },
      chooseMove: choose,
      onEnd: (result, moves) => ends.push({ who: me, result, moves: moves.length }),
    })
    games.set(me, g)
    return g
  }
  const white = make('A', 'B', 'white', ka, kb), black = make('B', 'A', 'black', kb, ka)
  black.start(); white.start()
  for (let i = 0; i < 400 && ends.length < 2; i++) await new Promise((r) => setTimeout(r, 10))
  white.stop(); black.stop()
  assert.equal(ends.length, 2, 'both saw the end')
  assert.equal(ends[0].result, ends[1].result, 'the same result')
  assert.equal(ends[0].moves, ends[1].moves, 'the same moves')
  assert.ok(ends[0].moves > 0)
})

test('a message not signed by the opponent seat is ignored', async () => {
  const [ka, kb, kc] = [await makeSeatKeys(), await makeSeatKeys(), await makeSeatKeys()]
  let moved = 0
  const g = new BotGame({
    gameId: 'g2', myColor: 'black', opponent: 'A', mySeat: kb, theirSeat: ka.pub, timeControl: { minutes: 0, increment: 0 },
    send: async () => {}, chooseMove: async () => { moved++; return null }, onEnd: () => {},
  })
  g.start()
  const { seal } = await import('../src/composables/useSeat.ts')
  const forged = await seal({ gameId: 'g2', mine: kc, theirs: kb.pub, sent: 0, heard: 0 }, JSON.stringify({ type: 'move', data: { from: 'e2', to: 'e4' } }))
  g.handle(forged, 'M')
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(g.moves.length, 0)
  assert.equal(moved, 0)
  g.stop()
})

test('a lost move: the waiting side asks for the moves so far, and both still end the game the same way', async () => {
  const [ka, kb] = [await makeSeatKeys(), await makeSeatKeys()]
  const games = new Map<string, BotGame>()
  const ends: { who: string; result: string | null; moves: number }[] = []
  const { Chess } = await import('chess.js')
  const choose = async (fen: string) => {
    const c = new Chess(fen)
    const all = c.moves({ verbose: true })
    const pick = all.find((m) => m.san.includes('#')) ?? all.find((m) => m.captured === 'q') ?? all.find((m) => m.captured) ?? all[Math.floor(Math.random() * all.length)]
    return { from: pick.from, to: pick.to, promotion: pick.promotion }
  }
  let dropped = 0
  const make = (me: string, them: string, color: 'white' | 'black', mine: any, theirs: any) => {
    const g = new BotGame({
      gameId: 'g3', myColor: color, opponent: them, mySeat: mine, theirSeat: theirs.pub, timeControl: { minutes: 0, increment: 0 }, askMs: 150, goneMs: 60_000,
      // Every fifth move message from A is lost on the way.
      send: async (to, msg) => {
        if (me === 'A' && msg.includes('"n"')) {
          const m = JSON.parse(msg)
          if (m.type === 'sealed' && JSON.parse(m.body).type === 'move' && ++dropped % 5 === 0) return
        }
        setTimeout(() => games.get(to)?.handle(JSON.parse(msg), me), 0)
      },
      chooseMove: choose,
      onEnd: (result, moves) => ends.push({ who: me, result, moves: moves.length }),
    })
    games.set(me, g)
    return g
  }
  const white = make('A', 'B', 'white', ka, kb), black = make('B', 'A', 'black', kb, ka)
  black.start(); white.start()
  for (let i = 0; i < 1500 && ends.length < 2; i++) await new Promise((r) => setTimeout(r, 10))
  white.stop(); black.stop()
  assert.ok(dropped >= 5, 'some moves were lost')
  assert.equal(ends.length, 2, 'both saw the end')
  assert.equal(ends[0].result, ends[1].result)
  assert.equal(ends[0].moves, ends[1].moves)
})
