import { ref, type Ref } from 'vue'

/**
 * Finding an opponent.
 *
 * - While you search, "seek" is broadcast to the whole room every few seconds,
 *   so players who are not your direct neighbours, or who arrive later, see it.
 * - Of two compatible seekers, the one with the lower peer ID makes the offer
 *   and plays white; the other only answers. Nobody starts a game until the
 *   offer is accepted, so both sides can never start one at once.
 * - A search never times out. It ends when a game starts or you stop it.
 *   A seeker you stop hearing from (closed tab) is forgotten; an offer that
 *   gets no answer is dropped and the search goes on.
 */

export type SeekTimeControl = { id: string; minutes: number; increment: number }

export type SeekMatch = {
  gameId: string
  opponent: string
  myColor: 'white' | 'black'
  timeControl: SeekTimeControl
  /** The opponent's seat key for this game (composables/useSeat.ts); absent from an older page. */
  theirSeat?: string
}

/** `since`: when they started looking, on our clock; `anyMeans`: what Any plays for them. */
type Seeker = { timeControl: string; seenAt: number; since: number; anyMeans?: string }
type Offer = { to: string; gameId: string; timeControl: SeekTimeControl; sentAt: number }
const seatOf = (message: any): string | undefined => (typeof message?.seat === 'string' && message.seat.length < 200 ? message.seat : undefined)

const ANNOUNCE_MS = 3000
const SEEKER_GONE_MS = 12000     // three missed announcements
const OFFER_ANSWER_MS = 10000    // an offer nobody answers is dropped, the search continues
const BUSY_MS = 15000            // skip a player who just declined

export interface SeekOptions {
  myPeerId: Ref<string | null | undefined>
  timeControls: SeekTimeControl[]
  selectedTimeControl: Ref<string>
  broadcast: (message: string) => Promise<unknown>
  sendMessage: (peerId: string, message: string) => Promise<unknown>
  /** Start the game. Called once per match, on both sides. */
  onMatched: (match: SeekMatch) => void
  /** The other side withdrew before any move: tear the game down. */
  onCancelled: (gameId: string) => void
  /** True while a game is being played (offers are declined). */
  isPlaying: () => boolean
  /** This player's seat key for the next game (sent in the offer and the answer). */
  mySeat?: () => string | null
  /** The time control "any" means here, when both sides picked any. */
  anyMeans?: () => string
}

export function useSeek(options: SeekOptions) {
  const isSearching = ref(false)
  const seekers = new Map<string, Seeker>()
  const busyUntil = new Map<string, number>()
  let offer: Offer | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let currentGameId: string | null = null
  let searchingSince = 0

  const me = () => String(options.myPeerId.value || '')
  const tcById = (id: string) => options.timeControls.find((tc) => tc.id === id)
  const compatible = (a: string, b: string) => a === 'any' || b === 'any' || a === b

  /**
   * The time control two compatible seekers play: the specific one; when both
   * picked "any", what "any" means (Settings) to whoever started looking
   * first; 10+0 when they did not say.
   */
  const resolve = (mine: string, them: Seeker): SeekTimeControl => {
    let id = mine !== 'any' ? mine : them.timeControl
    if (id === 'any') id = (them.since < searchingSince ? them.anyMeans : options.anyMeans?.()) || 'rapid10'
    const tc = (id !== 'any' && tcById(id)) || tcById('rapid10') || options.timeControls[0]
    return { id: tc.id, minutes: tc.minutes, increment: tc.increment }
  }

  const send = (to: string, message: object) =>
    options.sendMessage(to, JSON.stringify(message)).catch((err) => {
      console.warn('Seek message to', to.slice(0, 8), 'failed:', err)
    })

  const announce = (searching: boolean) => {
    if (!me()) return
    options.broadcast(JSON.stringify({
      type: 'matchmaking',
      peerId: me(),
      searching,
      timeControl: searching ? options.selectedTimeControl.value : null,
      // How long we have been looking (not a clock time: clocks differ), and what Any means here.
      waited: searching ? Date.now() - searchingSince : undefined,
      anyMeans: searching ? options.anyMeans?.() : undefined,
    })).catch((err) => console.warn('Seek announcement failed:', err))
  }

  const prune = () => {
    const now = Date.now()
    for (const [id, seeker] of seekers) if (now - seeker.seenAt > SEEKER_GONE_MS) seekers.delete(id)
    for (const [id, until] of busyUntil) if (until < now) busyUntil.delete(id)
    if (offer && now - offer.sentAt > OFFER_ANSWER_MS) {
      busyUntil.set(offer.to, now + BUSY_MS)
      offer = null
    }
  }

  /** Lower ID offers: pick the lowest compatible seeker above us. */
  const tryOffer = () => {
    if (!isSearching.value || offer || !me()) return
    const mine = options.selectedTimeControl.value
    const candidates = [...seekers.entries()]
      .filter(([id, s]) => id > me() && !busyUntil.has(id) && compatible(mine, s.timeControl))
      .sort(([a], [b]) => (a < b ? -1 : 1))
    if (candidates.length === 0) return
    const [to, seeker] = candidates[0]
    const timeControl = resolve(mine, seeker)
    offer = { to, gameId: `${me().slice(0, 8)}-${Date.now().toString(36)}`, timeControl, sentAt: Date.now() }
    send(to, { type: 'matchOffer', gameId: offer.gameId, timeControl, seat: options.mySeat?.() ?? undefined })
  }

  const tick = () => {
    announce(true)
    prune()
    tryOffer()
  }

  const start = () => {
    if (isSearching.value) return
    isSearching.value = true
    searchingSince = Date.now()
    tick()
    timer = setInterval(tick, ANNOUNCE_MS)
  }

  /** Stop looking. `quiet` skips the "stopped" announcement (a game started instead). */
  const stop = (quiet = false) => {
    if (timer) clearInterval(timer)
    timer = null
    const wasSearching = isSearching.value
    isSearching.value = false
    if (offer) {
      send(offer.to, { type: 'matchCancel', gameId: offer.gameId })
      offer = null
    }
    if (wasSearching || !quiet) announce(false)
  }

  const begin = (match: SeekMatch) => {
    currentGameId = match.gameId
    stop(true)
    options.onMatched(match)
  }

  /** Returns true when the message was a matchmaking message. */
  const handle = (message: any, from: string): boolean => {
    switch (message?.type) {
      case 'matchmaking': {
        const id = String(message.peerId || from || '')
        if (!id || id === me()) return true
        if (message.searching) {
          const now = Date.now()
          const waited = Number.isFinite(message.waited) && message.waited >= 0 ? Math.min(message.waited, 86_400_000) : 0
          const anyMeans = typeof message.anyMeans === 'string' && message.anyMeans !== 'any' && tcById(message.anyMeans) ? message.anyMeans : undefined
          // Keep the earliest start we worked out (a later announcement may arrive slower).
          const since = Math.min(seekers.get(id)?.since ?? Infinity, now - waited)
          seekers.set(id, { timeControl: String(message.timeControl || 'any'), seenAt: now, since, anyMeans })
          tryOffer()
        } else {
          seekers.delete(id)
        }
        return true
      }

      case 'matchOffer': {
        const tc = message.timeControl as SeekTimeControl | undefined
        const fits = tc && compatible(options.selectedTimeControl.value, tc.id)
        if (!isSearching.value || options.isPlaying() || !fits) {
          send(from, { type: 'matchDecline', gameId: message.gameId })
          return true
        }
        // Our seat key for this game, taken before the game starts (it uses it up).
        const mySeat = options.mySeat?.() ?? undefined
        // We may have an offer out to someone else; this one arrived first.
        begin({
          gameId: message.gameId,
          opponent: from,
          myColor: me() < from ? 'white' : 'black',
          timeControl: tc!,
          theirSeat: seatOf(message),
        })
        send(from, { type: 'matchAccept', gameId: message.gameId, seat: mySeat })
        return true
      }

      case 'matchAccept': {
        if (offer && offer.gameId === message.gameId && offer.to === from && isSearching.value && !options.isPlaying()) {
          const { gameId, timeControl } = offer
          offer = null
          begin({ gameId, opponent: from, myColor: me() < from ? 'white' : 'black', timeControl, theirSeat: seatOf(message) })
        } else {
          // We started a game with someone else meanwhile.
          send(from, { type: 'matchCancel', gameId: message.gameId })
        }
        return true
      }

      case 'matchDecline': {
        if (offer && offer.gameId === message.gameId) {
          busyUntil.set(from, Date.now() + BUSY_MS)
          offer = null
          tryOffer()
        }
        return true
      }

      case 'matchCancel': {
        if (offer && offer.gameId === message.gameId) offer = null
        if (currentGameId === message.gameId) {
          currentGameId = null
          options.onCancelled(message.gameId)
          start()
        }
        return true
      }

      default:
        return false
    }
  }

  /** The game started by a match is under way (a move was made); it can no longer be cancelled. */
  const settled = () => { currentGameId = null }

  const dispose = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  return { isSearching, start, stop, handle, settled, dispose }
}
