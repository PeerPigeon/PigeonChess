import { useSettings } from './useSettings'

/**
 * Move sounds through one shared AudioContext.
 *
 * iOS Safari plays an <audio> element only from inside a tap, so the
 * opponent's moves, which arrive over the network, were silent. An
 * AudioContext that was resumed once during a tap keeps playing afterwards
 * from anywhere, so the context is unlocked on the first touch, click or key
 * press and every sound goes through it.
 */

const MOVE = '/sounds/move.mp3'
const CAPTURE = '/sounds/capture.mp3'
const VOLUME = 0.5
const PRELOAD = [MOVE, CAPTURE, '/sounds/win-wood.mp3', '/sounds/lose-wood.mp3', '/sounds/draw-wood.mp3', '/sounds/start-wood.mp3']

let context: AudioContext | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()

function audioContext(): AudioContext | null {
  if (context) return context
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  try {
    context = new Ctor() as AudioContext
  } catch {
    context = null
  }
  return context
}

function load(url: string): Promise<AudioBuffer | null> {
  let pending = buffers.get(url)
  if (!pending) {
    const ctx = audioContext()
    pending = ctx
      ? fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .catch(() => null)
      : Promise.resolve(null)
    buffers.set(url, pending)
  }
  return pending
}

function unlock() {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  // A silent frame played inside the gesture is what iOS needs to let later
  // sounds through.
  try {
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, 22050)
    source.connect(ctx.destination)
    source.start(0)
  } catch { /* nothing to unlock */ }
  for (const url of PRELOAD) void load(url)
}

if (typeof window !== 'undefined') {
  const events = ['pointerdown', 'touchend', 'click', 'keydown']
  const once = () => {
    unlock()
    if (context?.state === 'running') events.forEach((name) => window.removeEventListener(name, once, true))
  }
  events.forEach((name) => window.addEventListener(name, once, true))
  // Coming back to the tab can leave the context suspended again.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && context && context.state !== 'running') context.resume().catch(() => {})
  })
}

function playElement(url: string, volume: number, rate: number) {
  const audio = new Audio(url)
  audio.volume = volume
  audio.playbackRate = rate
  audio.play().catch(() => {})
}

/** Play a sound file, from a tap or from anywhere once the page has had one. */
export function playSoundFile(url: string, { volume = VOLUME, delayMs = 0, rate = 1 } = {}) {
  const ctx = audioContext()
  if (!ctx) {
    if (delayMs) setTimeout(() => playElement(url, volume, rate), delayMs)
    else playElement(url, volume, rate)
    return
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  load(url).then((buffer) => {
    if (!buffer) {
      playElement(url, volume, rate)
      return
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(ctx.destination)
    source.start(ctx.currentTime + delayMs / 1000)
  }).catch(() => {})
}

export function useSounds() {
  const { settings } = useSettings()
  const enabled = () => settings.value.soundEnabled !== false

  const playMoveSound = () => {
    if (enabled()) playSoundFile(MOVE)
  }

  const playCaptureSound = () => {
    if (enabled()) playSoundFile(CAPTURE)
  }

  // King and rook: the move sound twice, a moment apart.
  const playCastleSound = () => {
    if (!enabled()) return
    playSoundFile(MOVE)
    playSoundFile(MOVE, { delayMs: 100 })
  }

  return {
    playMoveSound,
    playCaptureSound,
    playCastleSound
  }
}
