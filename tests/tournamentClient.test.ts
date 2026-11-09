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

test('three players: sign up, it starts once full, every game is matched, played and reported, finished', async () => {
  const room = sharedRoom()
  const peers = new Map<string, TournamentClient>()
  const playing = new Map<string, string | null>()
  const matches: (TournamentMatch & { me: string })[] = []
  let clock = 1_000_000
  const make = (name: string) => {
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
      now: () => clock,
    })
    peers.set(peerId, c)
    return c
  }
  const [a, b, c] = [make('a'), make('b'), make('c')]
  const id = await a.create({ name: 'Test', timeControl: { minutes: 3, increment: 0 }, start: { kind: 'players', players: 3 }, maxPlayers: 8 })
  await b.refresh(); await b.join(id)
  await c.refresh(); await c.join(id)
  for (const x of [a, b, c]) await x.refresh()
  // Each tick, as the page's: three seconds on.
  const tick = async () => { clock += 3000; for (const x of [a, b, c]) await (x as any).tick(); await new Promise((r) => setTimeout(r, 5)) }
  await tick() // the creator writes the start
  for (const x of [a, b, c]) await x.refresh()
  assert.equal(a.view()[0].status, 'running')
  assert.deepEqual(a.view()[0].players.sort(), ['a', 'b', 'c'])
  // Play: whenever two are matched, white wins; each side reports.
  for (let round = 0; round < 60 && a.view()[0].status === 'running'; round++) {
    await tick()
    for (const m of matches.splice(0)) {
      const client = [...peers.values()][['a', 'b', 'c'].indexOf(m.me)]
      await client.report(m.gameId, '1-0', ['e4'])
      playing.set(m.me, null)
    }
    for (const x of [a, b, c]) await x.refresh()
  }
  const v = a.view()[0]
  assert.equal(v.status, 'finished', 'every game played')
  assert.equal(v.pairings.length, 3)
  assert.ok(v.table.every((r) => r.played === 2))
  assert.equal(v.table.reduce((n, r) => n + r.points, 0), 3)
  assert.ok(v.pairings.every((p) => v.reports.filter((r) => r.gameId === p.gameId).length === 2), 'both sides reported each game')
  const { leaders } = a.leaders()
  assert.equal(leaders.length, 3)
  for (const x of [a, b, c]) x.stop()
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
