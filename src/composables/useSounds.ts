import { ref } from 'vue'
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
const PRELOAD = [MOVE, CAPTURE, '/sounds/win-rise.mp3', '/sounds/lose-wood.mp3', '/sounds/draw-wood.mp3', '/sounds/start-wood.mp3']

let context: AudioContext | null = null

/**
 * A sound was wanted but the browser has not let the page play any yet (on an iPad, only a tap does;
 * the end of a drag does not, so a game played by dragging stayed silent). The page offers a button.
 */
export const soundBlocked = ref(false)
const blockedCheck = () => {
  setTimeout(() => { soundBlocked.value = !!context && context.state !== 'running' }, 400)
}
const buffers = new Map<string, Promise<AudioBuffer | null>>()

function audioContext(): AudioContext | null {
  if (context) return context
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  try {
    context = new Ctor() as AudioContext
    context.addEventListener?.('statechange', () => { if (context?.state === 'running') soundBlocked.value = false })
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

/** Turn the sound on (from a tap). */
export function unlockSound() { unlock() }

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
  // Every tap, not only the first: iOS stops the context ("interrupted") for
  // a system dialog (such as the notification permission prompt), a call, or
  // the app going to the background, and only a tap starts it again.
  // The start of a touch too: a move made by dragging a piece has no tap in it.
  const events = ['pointerdown', 'touchstart', 'touchend', 'pointerup', 'click', 'keydown']
  const onGesture = () => { if (!context || context.state !== 'running') unlock() }
  events.forEach((name) => window.addEventListener(name, onGesture, true))
  // Coming back to the page can leave the context suspended or interrupted.
  const wake = () => { if (context && context.state !== 'running') context.resume().catch(() => {}) }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake() })
  window.addEventListener('pageshow', wake)
  window.addEventListener('focus', wake)
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
  if (ctx.state !== 'running') { ctx.resume().catch(() => {}); blockedCheck() }
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

// The check "snap": a short, sharp crack, made here (there is no file for it): a burst of noise
// through a band around 3 kHz that dies away in about 40 ms, with a click at its start.
let snapBuffer: AudioBuffer | null = null
function snap(ctx: AudioContext): AudioBuffer {
  if (snapBuffer && snapBuffer.sampleRate === ctx.sampleRate) return snapBuffer
  const rate = ctx.sampleRate
  const length = Math.floor(rate * 0.09)
  const buffer = ctx.createBuffer(1, length, rate)
  const out = buffer.getChannelData(0)
  // Two-pole band-pass (about 3 kHz, fairly narrow) over white noise.
  const f = 3000, q = 4
  const w = (2 * Math.PI * f) / rate, alpha = Math.sin(w) / (2 * q), cos = Math.cos(w)
  const a0 = 1 + alpha
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, peak = 0
  for (let i = 0; i < length; i++) {
    const t = i / rate
    const x = (Math.random() * 2 - 1) * Math.exp(-t / 0.012)
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x; y2 = y1; y1 = y
    const click = i < rate * 0.0015 ? (1 - i / (rate * 0.0015)) * (i % 2 ? 1 : -1) * 0.5 : 0
    out[i] = y * 3 + click
    peak = Math.max(peak, Math.abs(out[i]))
  }
  if (peak > 0) for (let i = 0; i < length; i++) out[i] /= peak
  snapBuffer = buffer
  return buffer
}

function playSnap(volume: number) {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state !== 'running') { ctx.resume().catch(() => {}); blockedCheck() }
  try {
    const source = ctx.createBufferSource()
    source.buffer = snap(ctx)
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(ctx.destination)
    source.onended = () => { source.disconnect(); gain.disconnect() }
    source.start()
  } catch { /* no sound here */ }
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

  // Check: a snap, played over the move's own sound (move, capture or castle).
  const playCheckSound = () => {
    if (enabled()) playSnap(VOLUME)
  }

  return {
    playMoveSound,
    playCaptureSound,
    playCastleSound,
    playCheckSound
  }
}
