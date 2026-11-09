import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TournamentClient, type TournamentMatch } from '../src/utils/tournamentClient.ts'

/** One shared room (as the storage servers keep it): records with who signed them; user records only their writer replaces. */
function sharedRoom() {
  const records = new Map<string, any>()
  const listeners = new Set<() => void>()
  return (signer: string) => ({
    async put(space: string, key: string, value: unknown) {
      const k = `${space}:${key}`, have = records.get(k)
      if (have && have.signer !== signer) throw new Error('not yours')
      records.set(k, { space, key, value, signer })
      listeners.forEach((l) => l())
    },
    async list(space: string) { return [...records.values()].filter((r) => r.space === space) },
    subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l) },
  })
}

/** Players on one shared room with a fake clock: each tick is three seconds on; white wins every game, both sides report. */
function harness(names: string[]) {
  const room = sharedRoom()
  const peers = new Map<string, TournamentClient>()
  const byName = new Map<string, TournamentClient>()
  const playing = new Map<string, string | null>()
  const matches: (TournamentMatch & { me: string })[] = []
  const clock = { now: 1_000_000 }
  for (const name of names) {
    const peerId = `peer-${name}`, roomFor = room(name)
    playing.set(name, null)
    const c = new TournamentClient({
      room: async () => ({ room: roomFor, signer: name }),
      me: () => ({ pub: name, name, keys: { pub: name } }),
      sign: async (text) => `${name}|${text}`,
      verify: async (text, sig, keys) => sig === `${keys.pub}|${text}`,
      peerId: () => peerId,
      broadcast: async (msg) => { for (const [id, other] of peers) if (id !== peerId) other.handle(JSON.parse(msg), peerId) },
      send: async (to, msg) => { peers.get(to)?.handle(JSON.parse(msg), peerId) },
      isPlaying: () => playing.get(name) !== null,
      seat: () => `seat-${name}`,
      onMatched: (m) => { playing.set(name, m.gameId); matches.push({ ...m, me: name }) },
      now: () => clock.now,
    })
    peers.set(peerId, c); byName.set(name, c)
  }
  const all = [...byName.values()]
  const refresh = async () => { for (const x of all) await x.refresh() }
  // Each player in its own turn each tick (in real life they tick at their own times).
  const tick = async () => { clock.now += 3000; for (const x of [...all].sort(() => Math.random() - 0.5)) await (x as any).tick(); await new Promise((r) => setTimeout(r, 5)) }
  /** Play until it is over (or `ticks` run out): each game matched is won by white, reported by both. */
  const play = async (ticks: number) => {
    for (let n = 0; n < ticks && all[0].view()[0].status !== 'finished'; n++) {
      await tick()
      for (const m of matches.splice(0)) {
        await byName.get(m.me)!.report(m.gameId, '1-0', ['e4'])
        playing.set(m.me, null)
      }
      await refresh()
    }
  }
  return { byName, all, clock, matches, refresh, tick, play, stop: () => all.forEach((x) => x.stop()) }
}

test('round robin, three players: sign up, it starts once full, every game is matched, played and reported, finished', async () => {
  const h = harness(['a', 'b', 'c'])
  const [a, b, c] = h.all
  const id = await a.create({ name: 'Test', timeControl: { minutes: 3, increment: 0 }, start: { kind: 'players', players: 3 }, maxPlayers: 8 })
  await b.refresh(); await b.join(id)
  await c.refresh(); await c.join(id)
  await h.refresh()
  await h.tick() // the creator writes the start
  await h.refresh()
  assert.equal(a.view()[0].status, 'running')
  assert.deepEqual([...a.view()[0].players].sort(), ['a', 'b', 'c'])
  await h.play(60)
  const v = a.view()[0]
  assert.equal(v.status, 'finished', 'every game played')
  assert.equal(v.pairings.length, 3)
  assert.ok(v.table.every((r) => r.played === 2))
  assert.equal(v.table.reduce((n, r) => n + r.points, 0), 3)
  assert.ok(v.pairings.every((p) => (v.reports.get(p.gameId) ?? []).length === 2), 'both sides reported each game')
  assert.equal(a.leaders().leaders.length, 3)
  h.stop()
})

test('Swiss, five players, three rounds: each round written when the last is done, a bye each round, nobody meets twice', async () => {
  const names = ['a', 'b', 'c', 'd', 'e']
  const h = harness(names)
  const [a, ...rest] = h.all
  const id = await a.create({ name: 'Swiss', format: 'swiss', rounds: 3, timeControl: { minutes: 3, increment: 0 }, start: { kind: 'players', players: 5 }, maxPlayers: 50 })
  for (const x of rest) { await x.refresh(); await x.join(id) }
  await h.refresh()
  await h.play(200)
  const v = a.view()[0]
  assert.equal(v.format, 'swiss')
  assert.equal(v.status, 'finished')
  assert.equal(v.rounds.length, 3)
  assert.equal(v.pairings.length, 6, 'two games a round')
  assert.equal(new Set(v.byes).size, 3, 'a different bye each round')
  const met = v.pairings.map((p) => [p.white, p.black].sort().join('|'))
  assert.equal(new Set(met).size, met.length, 'no rematch')
  assert.equal(v.table.reduce((n, r) => n + r.points, 0), 6 + 3, 'a point a game, and a point a bye')
  // Every page agrees on it.
  for (const x of h.all) assert.deepEqual(x.view()[0].table.map((r) => r.player), v.table.map((r) => r.player))
  h.stop()
})

test('arena, four players, 10 minutes: free players are paired again and again, wins 2, finished at the end', async () => {
  const h = harness(['a', 'b', 'c', 'd'])
  const [a, ...rest] = h.all
  const id = await a.create({ name: 'Arena', format: 'arena', minutes: 10, timeControl: { minutes: 1, increment: 0 }, start: { kind: 'players', players: 3 }, maxPlayers: 100 })
  for (const x of rest.slice(0, 2)) { await x.refresh(); await x.join(id) }
  await h.refresh()
  await h.play(20)
  assert.equal(a.view()[0].status, 'running')
  // A late joiner plays too.
  await rest[2].refresh(); await rest[2].join(id)
  await h.refresh()
  await h.play(400)
  const v = a.view()[0]
  assert.equal(v.format, 'arena')
  assert.equal(v.status, 'finished')
  assert.ok(v.pairings.length >= 20, `many games (${v.pairings.length})`)
  assert.ok(v.pairings.some((p) => p.white === 'd' || p.black === 'd'), 'the late joiner played')
  assert.equal(v.table.reduce((n, r) => n + r.points, 0), 2 * v.pairings.length, 'two points a game')
  assert.equal(new Set(v.pairings.map((p) => p.gameId)).size, v.pairings.length, 'every game its own id')
  h.stop()
})

test("records signed by someone else are not taken: a sign-up for another player, a result by a non-player", async () => {
  const room = sharedRoom()
  const client = (name: string) => new TournamentClient({
    room: async () => ({ room: room(name), signer: name }), me: () => ({ pub: name, name, keys: { pub: name } }),
    sign: async (t) => t, verify: async () => true, peerId: () => name, broadcast: async () => {}, send: async () => {},
    isPlaying: () => false, onMatched: () => {},
  })
  const a = client('a'), mallory = room('mallory')
  const id = await a.create({ name: 'T', timeControl: { minutes: 1, increment: 0 }, start: { kind: 'players', players: 2 }, maxPlayers: 4 })
  await mallory.put('user', `pc-t/j:${id}:b`, { tournament: id, player: 'b', name: 'fake b', at: 1 })
  await a.refresh()
  assert.equal(a.view()[0].signups.length, 1, "mallory's sign-up for b is not b's")
})

test('arena, nine bots and a late joiner with the lowest key: the late joiner gets games like everyone else', async () => {
  const bots = ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
  const h = harness([...bots, '0'])
  const [a, ...rest] = h.all
  const late = h.byName.get('0')!
  const id = await a.create({ name: 'Arena', format: 'arena', minutes: 10, timeControl: { minutes: 1, increment: 0 }, start: { kind: 'players', players: 9 }, maxPlayers: 100 })
  for (const x of rest) if (x !== late) { await x.refresh(); await x.join(id) }
  await h.refresh()
  await h.play(20)
  await late.refresh(); await late.join(id)
  await h.refresh()
  await h.play(400)
  const v = a.view()[0]
  assert.equal(v.status, 'finished')
  const games = (p: string) => v.pairings.filter((x) => x.white === p || x.black === p).length
  const typical = bots.map(games).sort((x, y) => x - y)[4]
  assert.ok(games("0") >= typical * 0.75, `the late joiner played ${games('0')} games; a bot typically ${typical}`)
  h.stop()
})
