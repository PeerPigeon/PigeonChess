<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal tournaments" role="dialog" aria-modal="true" aria-labelledby="tournaments-title">
      <div class="head">
        <h2 id="tournaments-title">{{ open ? open.tournament.name : 'Tournaments' }}</h2>
        <button class="secondary" @click="open ? (openId = null) : $emit('close')">{{ open ? 'Back' : 'Close' }}</button>
      </div>

      <!-- One tournament -->
      <template v-if="open">
        <p class="meta">
          {{ formatLabel(open) }} · {{ tcLabel(open.tournament.timeControl) }} · by {{ open.tournament.creatorName }} · {{ statusLine(open) }}
        </p>

        <div v-if="open.status === 'open' || (lateJoin(open))" class="actions">
          <template v-if="me">
            <button v-if="!joined(open)" class="primary" :disabled="busy || full(open)" @click="act(() => client.join(open!.tournament.id))">{{ full(open) ? 'Full' : 'Join' }}</button>
            <button v-else class="secondary" :disabled="busy" @click="act(() => client.leave(open!.tournament.id))">Leave</button>
          </template>
          <button v-else class="secondary" @click="$emit('login')">Log in to join</button>
        </div>

        <p v-if="open.status === 'running' && me && open.players.includes(me)" class="next">{{ nextGameLine(open) }}</p>
        <p class="rules">{{ rulesLine(open) }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <template v-if="open.status === 'open'">
          <h3>Signed up ({{ standing(open).length }})</h3>
          <ol class="plain">
            <li v-for="s in standing(open)" :key="s.player">{{ s.name }}<span v-if="s.bot" class="badge">bot · {{ s.bot.level }}</span><span v-if="s.player === me" class="you">you</span></li>
            <li v-if="!standing(open).length" class="empty">Nobody yet.</li>
          </ol>
        </template>

        <template v-else-if="open.status !== 'cancelled'">
          <h3>Standings</h3>
          <table class="table standings">
            <thead><tr><th>#</th><th class="name">Player</th><th title="Games played">P</th><th>W</th><th>D</th><th>L</th><th title="Points">Pts</th></tr></thead>
            <tbody>
              <tr v-for="(row, i) in open.table" :key="row.player" :class="{ mine: row.player === me }">
                <td>{{ i + 1 }}</td>
                <td class="name">{{ nameOf(open, row.player) }}<span v-if="open.bots.has(row.player)" class="badge">bot</span></td>
                <td>{{ row.played }}</td><td>{{ row.wins }}</td><td>{{ row.draws }}</td><td>{{ row.losses }}</td>
                <td class="pts">{{ points(row.points) }}</td>
              </tr>
            </tbody>
          </table>

          <h3>Games<span v-if="shownGames(open).hidden" class="count"> (yours, and the latest {{ GAMES_SHOWN }} of {{ open.pairings.length }})</span></h3>
          <ol class="plain games">
            <li v-for="p in shownGames(open).games" :key="p.gameId">
              <span class="round">{{ p.round ? `R${p.round}` : '' }}</span>
              <span class="pair">{{ nameOf(open, p.white) }} – {{ nameOf(open, p.black) }}</span>
              <span class="res" :class="gameClass(open, p)">{{ gameWord(open, p) }}</span>
            </li>
          </ol>
        </template>
      </template>

      <!-- The list, and the leaderboard -->
      <template v-else>
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'list'" :class="{ on: tab === 'list' }" @click="tab = 'list'">Tournaments</button>
          <button role="tab" :aria-selected="tab === 'leaders'" :class="{ on: tab === 'leaders' }" @click="tab = 'leaders'">Standings</button>
        </div>

        <template v-if="tab === 'list'">
          <div class="actions">
            <button v-if="me" class="primary" @click="creating = !creating">{{ creating ? 'Cancel' : 'New tournament' }}</button>
            <button v-else class="secondary" @click="$emit('login')">Log in to create or join one</button>
          </div>

          <form v-if="creating && me" class="create" @submit.prevent="create">
            <label class="field">Name <input v-model="form.name" type="text" maxlength="60" placeholder="Sunday blitz" required /></label>
            <label class="field">Format
              <select v-model="form.format">
                <option value="arena">Arena: play as many games as you can in a set time</option>
                <option value="swiss">Swiss: a set number of rounds against players on your score</option>
                <option value="round-robin">Round robin: everyone plays everyone once (up to {{ MAX_ROUND_ROBIN }})</option>
              </select>
            </label>
            <label v-if="form.format === 'arena'" class="field">Lasts
              <select v-model.number="form.minutes">
                <option v-for="m in durations" :key="m" :value="m">{{ hoursLabel(m) }}</option>
              </select>
            </label>
            <label v-if="form.format === 'swiss'" class="field">Rounds <input v-model.number="form.rounds" class="num" type="number" min="1" max="30" /></label>
            <label class="field">Time control
              <select v-model="form.tc">
                <option v-for="tc in clockChoices" :key="tc.id" :value="tc.id">{{ tc.minutes === 0 ? 'No clock' : `${tc.display} ${tc.name.toLowerCase()}` }}</option>
              </select>
            </label>
            <fieldset class="field">
              <legend>Starts</legend>
              <label class="choice"><input v-model="form.when" type="radio" value="players" /> when <input v-model.number="form.players" class="num" type="number" min="2" :max="maxFor(form.format)" /> players have joined</label>
              <label class="choice"><input v-model="form.when" type="radio" value="at" /> at <input v-model="form.at" type="datetime-local" :disabled="form.when !== 'at'" /></label>
            </fieldset>
            <label class="field">At most <input v-model.number="form.max" class="num" type="number" min="2" :max="maxFor(form.format)" /> players (up to {{ maxFor(form.format) }})</label>
            <label class="choice"><input v-model="form.play" type="checkbox" /> I'm playing in it</label>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <button class="primary" type="submit" :disabled="busy">Create</button>
          </form>

          <p v-if="!views.length" class="empty">No tournaments yet.</p>
          <template v-for="group in groups" :key="group.title">
            <h3 v-if="group.items.length">{{ group.title }}</h3>
            <ol v-if="group.items.length" class="list">
              <li v-for="v in group.items" :key="v.tournament.id">
                <button class="item" @click="openId = v.tournament.id">
                  <span class="t-name">{{ v.tournament.name }}<span v-if="me && (v.players.includes(me) || joined(v))" class="you">you're in</span></span>
                  <span class="t-meta">{{ tcLabel(v.tournament.timeControl) }} · {{ statusLine(v) }}</span>
                </button>
              </li>
            </ol>
          </template>
        </template>

        <template v-else>
          <p v-if="!leaders.leaders.length" class="empty">Standings appear once a tournament starts.</p>
          <table v-else class="table">
            <thead><tr><th>#</th><th class="name">Player</th><th title="Tournaments won">Won</th><th title="Points">Pts</th><th title="Games played">Games</th><th title="Tournaments played">Played</th></tr></thead>
            <tbody>
              <tr v-for="(row, i) in leaders.leaders" :key="row.player" :class="{ mine: row.player === me }">
                <td>{{ i + 1 }}</td>
                <td class="name">{{ leaders.names.get(row.player) ?? short(row.player) }}<span v-if="leaders.bots.has(row.player)" class="badge">bot</span></td>
                <td>{{ row.won }}</td><td class="pts">{{ points(row.points) }}</td><td>{{ row.games }}</td><td>{{ row.tournaments }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { TournamentClient, TournamentView } from '../utils/tournamentClient'
import { gameState, gamesToPlay, signedUp, maxPlayersOf, roundLimitMs, MAX_PLAYERS, MAX_ROUND_ROBIN, type Format, type Pairing, type TimeControl } from '../utils/tournament'
import type { Leader } from '../utils/tournament'

const props = defineProps<{
  client: TournamentClient
  views: TournamentView[]
  leaders: { leaders: Leader[]; names: Map<string, string>; bots: Set<string> }
  /** The signed-in player's key; null: not signed in. */
  me: string | null
  timeControls: { id: string; name: string; display: string; minutes: number; increment: number }[]
}>()
defineEmits<{ close: []; login: [] }>()

const tab = ref<'list' | 'leaders'>('list')
const openId = ref<string | null>(null)
const open = computed(() => props.views.find((v) => v.tournament.id === openId.value) ?? null)
const creating = ref(false)
const busy = ref(false)
const error = ref('')

const clockChoices = computed(() => props.timeControls.filter((tc) => tc.id !== 'any'))
const inAnHour = () => { const d = new Date(Date.now() + 60 * 60 * 1000); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const form = reactive({ name: '', format: 'arena' as Format, minutes: 60, rounds: 7, tc: 'blitz3-1', when: 'players' as 'players' | 'at', players: 4, at: inAnHour(), max: 50, play: true })
const durations = [30, 45, 60, 90, 120, 180, 240]
const maxFor = (f: Format) => (f === 'round-robin' ? MAX_ROUND_ROBIN : MAX_PLAYERS)
const hoursLabel = (m: number) => (m < 60 ? `${m} minutes` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m === 60 ? '' : 's'}`)
const GAMES_SHOWN = 100

const act = async (fn: () => Promise<unknown>) => {
  busy.value = true
  error.value = ''
  try { await fn() } catch (e) { error.value = (e as Error).message || 'That did not work' } finally { busy.value = false }
}

const create = () => act(async () => {
  const tc = clockChoices.value.find((c) => c.id === form.tc) ?? clockChoices.value[0]
  const max = Math.max(2, Math.min(maxFor(form.format), Math.round(form.max) || 8))
  const start = form.when === 'at'
    ? { kind: 'at' as const, at: new Date(form.at).getTime() }
    : { kind: 'players' as const, players: Math.max(2, Math.min(max, Math.round(form.players) || 4)) }
  if (start.kind === 'at' && !(start.at > Date.now())) throw new Error('Pick a start time in the future')
  const id = await props.client.create({ name: form.name, format: form.format, rounds: form.rounds, minutes: form.minutes, timeControl: { minutes: tc.minutes, increment: tc.increment }, start, maxPlayers: max, play: form.play })
  creating.value = false
  form.name = ''
  openId.value = id
})

const groups = computed(() => [
  { title: 'Playing now', items: props.views.filter((v) => v.status === 'running') },
  { title: 'Open to join', items: props.views.filter((v) => v.status === 'open') },
  { title: 'Finished', items: props.views.filter((v) => v.status === 'finished').slice(0, 30) },
])

const standing = (v: TournamentView) => signedUp(v.signups)
const joined = (v: TournamentView) => !!props.me && standing(v).some((s) => s.player === props.me)
const full = (v: TournamentView) => (v.status === 'running' ? v.players.length : standing(v).length) >= maxPlayersOf(v.tournament)
/** Arena: players can join while it runs (not in its last minutes). */
const lateJoin = (v: TournamentView) => v.format === 'arena' && v.status === 'running' && !(props.me && v.players.includes(props.me)) && v.endsAt !== null && v.endsAt - Date.now() > 5 * 60_000
const formatLabel = (v: TournamentView) => v.format === 'arena' ? `Arena, ${hoursLabel(v.tournament.minutes ?? 60)}` : v.format === 'swiss' ? `Swiss, ${v.tournament.rounds} rounds` : 'Round robin'
const until = (at: number) => { const m = Math.max(0, Math.round((at - Date.now()) / 60_000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min` }
const rulesLine = (v: TournamentView): string =>
  v.format === 'arena' ? 'Win 2, draw 1. When a game ends you are paired again with whoever is free; play as many as you like until time is up. A win counts once your opponent has reported it too.'
  : v.format === 'swiss' ? `Win 1, draw ½, a bye 1. Each round pairs players on the same score who have not met; a round ends when its games are done, or after ${Math.round(roundLimitMs(v.tournament) / 60_000)} minutes.`
  : 'Win 1, draw ½. Everyone plays everyone once, in any order.'
/** Many games: yours, and the latest of the rest. */
const shownGames = (v: TournamentView) => {
  const all = v.format === 'round-robin' ? v.pairings : [...v.pairings].reverse()
  if (all.length <= 2 * GAMES_SHOWN) return { games: all, hidden: false }
  const mine = (p: Pairing) => p.white === props.me || p.black === props.me
  const latest = new Set(all.filter((p) => !mine(p)).slice(0, GAMES_SHOWN))
  return { games: all.filter((p) => mine(p) || latest.has(p)), hidden: true }
}
const short = (key: string) => `${key.slice(0, 6)}…`
const nameOf = (v: TournamentView, key: string) => v.names.get(key) ?? short(key)
const points = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`)
const tcLabel = (tc: TimeControl) => (tc.minutes === 0 ? 'no clock' : `${tc.minutes}+${tc.increment}`)

const statusLine = (v: TournamentView): string => {
  const n = standing(v).length
  if (v.status === 'open') {
    return v.tournament.start.kind === 'players'
      ? `${n} of ${v.tournament.start.players} joined; starts when ${v.tournament.start.players} have`
      : `starts ${new Date(v.tournament.start.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}; ${n} joined`
  }
  if (v.status === 'cancelled') return 'cancelled (fewer than two players)'
  if (v.status === 'running' && v.format === 'arena') return `${v.players.length} players, ${v.pairings.length} games so far; ends in ${until(v.endsAt ?? Date.now())}`
  const done = v.pairings.filter((p) => gameState(p, v.reports).state !== 'unplayed').length
  if (v.status === 'running' && v.format === 'swiss') {
    const now = v.pairings.filter((p) => p.round === v.round)
    return `${v.players.length} players, round ${v.round} of ${v.tournament.rounds}: ${now.filter((p) => gameState(p, v.reports).state !== 'unplayed').length} of ${now.length} games played`
  }
  if (v.status === 'running') return `${v.players.length} players, ${done} of ${v.pairings.length} games played`
  const top = v.table[0]
  return top && top.played ? `won by ${nameOf(v, top.player)} (${points(top.points)})` : 'finished'
}

const nextGameLine = (v: TournamentView): string => {
  if (!props.me) return ''
  if (v.format === 'arena') return `Your next game starts by itself as soon as another player is free (keep this page open). Ends in ${until(v.endsAt ?? Date.now())}.`
  if (v.format === 'swiss' && v.byes.length && v.rounds.at(-1)?.byes.includes(props.me)) return `You have a bye this round (1 point). Round ${v.round + 1} starts once this one is done.`
  const owed = gamesToPlay(props.me, v.format === 'swiss' ? v.pairings.filter((p) => p.round === v.round) : v.pairings, v.reports)
  if (!owed.length) return v.format === 'swiss' ? (v.round < (v.tournament.rounds ?? 0) ? `Your round ${v.round} game is done. The next round starts once the others finish.` : 'You have played all your rounds.') : 'You have played all your games.'
  const names = owed.map((p) => nameOf(v, p.white === props.me ? p.black : p.white))
  return `Still to play: ${names.join(', ')}. Your game starts by itself when one of them is here and free (keep this page open).`
}

const gameWord = (v: TournamentView, p: Pairing): string => {
  const g = gameState(p, v.reports)
  if (g.state === 'unplayed') return 'to play'
  if (g.state === 'disputed') return 'disputed'
  const r = g.result === '1/2-1/2' ? '½–½' : g.result.replace('-', '–')
  return g.confirmed ? r : `${r} (unconfirmed)`
}
const gameClass = (v: TournamentView, p: Pairing) => gameState(p, v.reports).state
</script>

<style scoped>
.tournaments { width: min(100%, 680px); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
.head h2 { margin: 0; overflow-wrap: anywhere; }
h3 { margin: 1.1rem 0 0.4rem; font-size: 0.95rem; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.04em; }
.meta, .empty { color: var(--ink-2); }
.next { margin-top: 0.6rem; }
.error { color: var(--stop); margin-top: 0.5rem; }
.actions { display: flex; gap: 0.5rem; margin: 0.6rem 0; }
.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--line); margin-bottom: 0.6rem; }
.tabs button { background: none; border: 0; padding: 0.5rem 0.8rem; color: var(--ink-2); border-bottom: 2px solid transparent; border-radius: 0; }
.tabs button.on { color: var(--ink); border-bottom-color: var(--sheen); font-weight: 600; }
.create { display: grid; gap: 0.7rem; padding: 0.9rem; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 0.8rem; }
.field { display: grid; gap: 0.3rem; font-weight: 600; }
fieldset.field { border: 0; padding: 0; margin: 0; }
.choice { display: flex; align-items: center; gap: 0.45rem; font-weight: 400; flex-wrap: wrap; }
.num { width: 4.5rem; }
.list, .plain { list-style: none; padding: 0; margin: 0; }
.list { border-top: 1px solid var(--line); }
.item { display: grid; gap: 0.15rem; width: 100%; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 0.7rem 0.2rem; color: var(--ink); }
.item:hover { background: var(--wing, rgba(127, 127, 127, 0.08)); }
.t-name { font-weight: 600; }
.t-meta { color: var(--ink-2); font-size: 0.92rem; }
.badge, .you { margin-left: 0.45rem; font-size: 0.78rem; padding: 0.05rem 0.4rem; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--ink-2); font-weight: 500; }
.you { border-color: var(--sheen); color: var(--sheen); }
.plain li { padding: 0.3rem 0; }
.table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.table th, .table td { padding: 0.4rem 0.35rem; text-align: right; border-bottom: 1px solid var(--line); }
.table th { color: var(--ink-2); font-weight: 600; font-size: 0.85rem; }
.table .name { text-align: left; width: 100%; }
.table .pts { font-weight: 700; }
.table tr.mine td { background: var(--wing, rgba(127, 127, 127, 0.08)); }
.games li { display: grid; grid-template-columns: 2.4rem 1fr auto; gap: 0.5rem; border-bottom: 1px solid var(--line); }
.round { color: var(--ink-2); }
.rules { color: var(--ink-2); font-size: 0.9rem; margin: 0.3rem 0 0; }
.count { text-transform: none; letter-spacing: 0; font-weight: 400; }
.res.unplayed { color: var(--ink-2); }
.res.disputed { color: var(--stop); }
@media (max-width: 520px) {
  .standings th:nth-child(4), .standings td:nth-child(4), .standings th:nth-child(5), .standings td:nth-child(5), .standings th:nth-child(6), .standings td:nth-child(6) { display: none; }
}
</style>
