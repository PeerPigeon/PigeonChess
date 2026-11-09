import { test } from 'node:test'
import assert from 'node:assert/strict'
import { schedule, standings, dueStart, chosenStart, gameState, statusOf, leaderboard, gamesToPlay, type Tournament, type Signup, type Report, type Start } from '../src/utils/tournament.ts'

const t = (start: Tournament['start'], maxPlayers = 8): Tournament => ({ id: 'T', name: 'T', creator: 'C', creatorName: 'c', timeControl: { minutes: 3, increment: 0 }, start, maxPlayers, createdAt: 0 })
const su = (player: string, at: number, withdrawn = false): Signup => ({ tournament: 'T', player, name: player, at, withdrawn })

test('everyone plays everyone exactly once, colours balanced, in n-1 rounds', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const players = Array.from({ length: n }, (_, i) => `p${i}`)
    const games = schedule('T', players)
    assert.equal(games.length, (n * (n - 1)) / 2, `${n} players`)
    const pairs = new Set(games.map((g) => [g.white, g.black].sort().join('-')))
    assert.equal(pairs.size, games.length, 'no pair twice')
    assert.equal(new Set(games.map((g) => g.gameId)).size, games.length, 'ids unique')
    const rounds = new Set(games.map((g) => g.round))
    assert.equal(rounds.size, n % 2 ? n : n - 1)
    for (const p of players) {
      const whites = games.filter((g) => g.white === p).length, blacks = games.filter((g) => g.black === p).length
      assert.ok(Math.abs(whites - blacks) <= 1, `${p}: ${whites} white, ${blacks} black`)
    }
    // Nobody plays twice in a round.
    for (const r of rounds) {
      const inRound = games.filter((g) => g.round === r).flatMap((g) => [g.white, g.black])
      assert.equal(new Set(inRound).size, inRound.length)
    }
  }
  assert.deepEqual(schedule('T', ['a', 'b', 'c']), schedule('T', ['a', 'b', 'c']), 'the same on every page')
})

test('starts at its time with those signed up by then, or once enough sign up', () => {
  const at = t({ kind: 'at', at: 1000 })
  assert.equal(dueStart(at, [su('a', 1), su('b', 2)], 999), null)
  assert.deepEqual(dueStart(at, [su('a', 1), su('b', 2), su('late', 2000), su('gone', 3, true)], 1000), { at: 1000, players: ['a', 'b'] })
  assert.equal(dueStart(at, [su('a', 1)], 5000), null, 'one player is no tournament')
  const n = t({ kind: 'players', players: 3 })
  assert.equal(dueStart(n, [su('a', 1), su('b', 2)], 9e9), null)
  assert.deepEqual(dueStart(n, [su('c', 3), su('a', 1), su('b', 2), su('d', 4)], 0), { at: 3, players: ['a', 'b', 'c'] })
})

test("the creator's start counts; else the earliest by one of its players", () => {
  const tour = t({ kind: 'players', players: 2 })
  const s = (by: string, at: number, players = ['a', 'b']): Start => ({ tournament: 'T', players, at, by })
  assert.equal(chosenStart(tour, [s('a', 5), s('C', 9)])?.by, 'C')
  assert.equal(chosenStart(tour, [s('b', 6), s('a', 5)])?.by, 'a')
  assert.equal(chosenStart(tour, [s('stranger', 1)]), null, 'only the creator or a player')
})

test('results: agreed, admitted, unconfirmed, disputed; standings with tie-break', () => {
  const players = ['a', 'b', 'c']
  const games = schedule('T', players)
  const rep = (g: (typeof games)[number], by: string, result: Report['result']): Report => ({ tournament: 'T', gameId: g.gameId, white: g.white, black: g.black, result, moves: [], at: 0, by })
  const [g1, g2, g3] = games
  const reports = [
    rep(g1, g1.white, '1-0'), rep(g1, g1.black, '1-0'),          // agreed
    rep(g2, g2.black, '1-0'),                                      // black admits the loss
    rep(g3, g3.white, '1-0'), rep(g3, g3.black, '0-1'),          // disputed
  ]
  assert.deepEqual(gameState(g1, reports), { state: 'done', result: '1-0', confirmed: true })
  assert.deepEqual(gameState(g2, reports), { state: 'done', result: '1-0', confirmed: true })
  assert.deepEqual(gameState(g3, reports), { state: 'disputed' })
  assert.deepEqual(gameState(g1, [rep(g1, g1.white, '1-0')]), { state: 'done', result: '1-0', confirmed: false }, "a winner's claim alone: unconfirmed")
  const table = standings(players, games, reports)
  assert.equal(table.reduce((n, r) => n + r.played, 0), 4, 'two games counted, the disputed one not')
  assert.equal(table[0].points, Math.max(...table.map((r) => r.points)))
  assert.equal(gamesToPlay(g3.white, games, reports).length, 0, 'a disputed game is not played again')
})

test('status and leaderboard', () => {
  const tour = t({ kind: 'players', players: 2 })
  const games = schedule('T', ['a', 'b'])
  const start: Start = { tournament: 'T', players: ['a', 'b'], at: 0, by: 'C' }
  assert.equal(statusOf(tour, null, [], [], 0, []), 'open')
  assert.equal(statusOf(tour, start, games, [], 1, []), 'running')
  const r: Report = { tournament: 'T', gameId: games[0].gameId, white: games[0].white, black: games[0].black, result: '1-0', moves: [], at: 0, by: games[0].black }
  assert.equal(statusOf(tour, start, games, [r], 1, []), 'finished')
  assert.equal(statusOf(t({ kind: 'at', at: 10 }), null, [], [], 10 + 61_000, [su('a', 1)]), 'cancelled')
  const table = standings(['a', 'b'], games, [r])
  const board = leaderboard([{ status: 'finished', table }, { status: 'finished', table }])
  assert.equal(board[0].player, games[0].white)
  assert.equal(board[0].won, 2)
  assert.equal(board[0].tournaments, 2)
})

test('a hundred players: Swiss pairs everyone with no rematch for 7 rounds, and the state of it is quick to work out', async () => {
  const { swissPairings, tournamentState, gameIdOf } = await import('../src/utils/tournament.ts')
  const players = Array.from({ length: 100 }, (_, i) => `p${String(i).padStart(3, '0')}`)
  const t: Tournament = { id: 'S', name: 'S', creator: players[0], creatorName: 'x', format: 'swiss', rounds: 7, timeControl: { minutes: 3, increment: 0 }, start: { kind: 'players', players: 100 }, maxPlayers: 100, createdAt: 0 }
  const rounds: any[] = [], reports: Report[] = []
  const met = new Set<string>()
  for (let n = 1; n <= 7; n++) {
    const r = swissPairings('S', players, rounds, reports)
    assert.equal(r.pairings.length, 50)
    for (const p of r.pairings) {
      const k = [p.white, p.black].sort().join('|')
      assert.ok(!met.has(k), `no rematch in round ${n}`); met.add(k)
      const gameId = gameIdOf('S', n, p.white, p.black)
      for (const by of [p.white, p.black]) reports.push({ tournament: 'S', gameId, white: p.white, black: p.black, result: p.white < p.black ? '1-0' : '0-1', moves: [], at: n, by })
    }
    rounds.push({ tournament: 'S', round: n, ...r, at: n * 1000, by: players[0] })
  }
  const began = performance.now()
  const s = tournamentState(t, players.map((p) => su(p, 1)), [{ tournament: 'S', players, at: 0, by: players[0] }], rounds, reports, 10_000)
  assert.ok(performance.now() - began < 200, 'quick')
  assert.equal(s.status, 'finished')
  assert.equal(s.table[0].points, 7, 'someone won them all')
})
