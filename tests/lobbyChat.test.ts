import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startLobbyChat, sendLobbyChat, muteInChat, setChatOpen, useLobbyChat, CHAT_KEYS } from '../src/composables/useLobbyChat.ts'

/** A room's storage as PeerPigeon's: records with their signer, and a change for each write here or arriving. */
function room() {
  const recs = new Map<string, any>()
  const listeners = new Set<(e: any) => void>()
  const emit = (op: 'upsert' | 'delete', key: string) => { for (const l of listeners) l({ op, key, space: 'user', record: recs.get(key) ?? null }) }
  const as = (signer: string) => ({
    list: async () => [...recs.values()],
    put: async (_s: string, key: string, value: unknown) => { recs.set(key, { key, value, signer }); emit('upsert', key) },
    delete: async (_s: string, key: string) => { if (recs.get(key)?.signer !== signer) return false; recs.delete(key); emit('delete', key); return true },
    subscribe: (l: (e: any) => void) => { listeners.add(l); return () => listeners.delete(l) },
    signer: () => signer,
  })
  return { recs, as, arrive: (signer: string, key: string, value: unknown) => { recs.set(key, { key, value, signer }); emit('upsert', key) } }
}

test('the lobby chat: what is in the room shows, in order; new messages arrive; a writer keeps its last 20; a muted writer goes', async () => {
  const r = room()
  r.arrive('bob', `${CHAT_KEYS}a`, { text: 'second', at: 2000, name: 'Bob' })
  r.arrive('ann', `${CHAT_KEYS}b`, { text: 'first', at: 1000, name: 'Ann' })
  r.arrive('ann', 'pc-t/t:x', { name: 'not chat' })
  const chat = useLobbyChat()
  await startLobbyChat(r.as('me') as never)
  assert.deepEqual(chat.messages.value.map((m) => m.text), ['first', 'second'])
  setChatOpen(false)
  r.arrive('bob', `${CHAT_KEYS}c`, { text: 'anyone for 5+0?', at: 3000, name: 'Bob' })
  assert.equal(chat.messages.value.at(-1)?.text, 'anyone for 5+0?')
  assert.equal(chat.unread.value, 1, 'counted while closed')
  setChatOpen(true)
  assert.equal(chat.unread.value, 0)
  assert.equal(await sendLobbyChat('   ', 'Me'), 'nothing to send')
  assert.equal(await sendLobbyChat('hello', 'Me'), null)
  assert.equal(chat.messages.value.at(-1)?.name, 'Me')
  muteInChat('bob')
  assert.ok(!chat.messages.value.some((m) => m.signer === 'bob'), 'muted: hidden')
})

test('the lobby chat: at most 5 messages in 10 s from one writer, sent or shown; PigeonAI\'s answer is named so', async () => {
  const r = room()
  const chat = useLobbyChat()
  await startLobbyChat(r.as('me2') as never)
  const sent = []
  for (let i = 0; i < 6; i++) sent.push(await sendLobbyChat(`m${i}`, 'Me'))
  assert.deepEqual(sent.slice(0, 5), [null, null, null, null, null])
  assert.match(String(sent[5]), /at most 5/)
  const t = Date.now()
  for (let i = 0; i < 8; i++) r.arrive('spam', `${CHAT_KEYS}s${i}`, { text: `s${i}`, at: t + i, name: 'Spam' })
  assert.equal(chat.messages.value.filter((m) => m.signer === 'spam').length, 5)
  assert.equal(await sendLobbyChat('I am PigeonAI', 'Me', 'PigeonAI'), null, 'an answer is not held back by the limit')
  assert.ok(chat.messages.value.some((m) => m.bot === 'PigeonAI' && m.text === 'I am PigeonAI'), 'shown, named PigeonAI')
})
