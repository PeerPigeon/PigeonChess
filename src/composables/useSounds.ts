import { ref } from 'vue'

const soundEnabled = ref(true)

const sounds = {
  move: new Audio('/sounds/move.mp3'),
  capture: new Audio('/sounds/capture.mp3'),
  castle: new Audio('/sounds/castle.mp3')
}

// Preload sounds
Object.values(sounds).forEach(sound => {
  sound.preload = 'auto'
  sound.volume = 0.5
})

export function useSounds() {
  const playMoveSound = () => {
    if (!soundEnabled.value) return
    const audio = new Audio('/sounds/move.mp3')
    audio.volume = 0.5
    audio.play().catch((err) => {
      console.error('Move sound error:', err)
    })
  }

  const playCaptureSound = () => {
    if (!soundEnabled.value) return
    sounds.capture.currentTime = 0
    sounds.capture.play().catch((err) => {
      console.error('Capture sound error:', err)
    })
  }

  const playCastleSound = () => {
    if (!soundEnabled.value) return
    sounds.castle.currentTime = 0
    sounds.castle.play().catch((err) => {
      console.error('Castle sound error:', err)
    })
  }

  const toggleSound = () => {
    soundEnabled.value = !soundEnabled.value
  }

  return {
    soundEnabled,
    playMoveSound,
    playCaptureSound,
    playCastleSound,
    toggleSound
  }
}
