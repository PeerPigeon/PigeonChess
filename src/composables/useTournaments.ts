import { computed, ref } from 'vue'
import { TournamentClient, type TournamentClientOptions } from '../utils/tournamentClient'

/** Tournaments on a page: utils/tournamentClient.ts, with what it knows as Vue state. */
export function useTournaments(options: Omit<TournamentClientOptions, 'onChange'>) {
  const version = ref(0)
  const client = new TournamentClient({ ...options, onChange: () => { version.value++ } })
  // Time moves statuses on (a scheduled start, a day gone by) without any new record.
  const clock = setInterval(() => { version.value++ }, 30_000)
  const views = computed(() => { void version.value; return client.view() })
  const leaders = computed(() => { void version.value; return client.leaders() })
  return {
    client,
    views,
    leaders,
    start: () => client.start(),
    stop: () => { client.stop(); clearInterval(clock) },
    refresh: () => client.refresh(),
    handle: (message: any, fromPeer: string) => client.handle(message, fromPeer),
  }
}
