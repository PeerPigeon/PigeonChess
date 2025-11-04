import { ref } from 'vue'

const soundEnabled = ref(true)

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
    const audio = new Audio('/sounds/capture.mp3')
    audio.volume = 0.5
    audio.play().catch((err) => {
      console.error('Capture sound error:', err)
    })
  }

  const playCastleSound = () => {
    if (!soundEnabled.value) return
    // Play move sound twice with slight delay for castling (king + rook moving)
    const audio1 = new Audio('/sounds/move.mp3')
    audio1.volume = 0.5
    audio1.play().catch((err) => {
      console.error('Castle sound error:', err)
    })
    
    setTimeout(() => {
      const audio2 = new Audio('/sounds/move.mp3')
      audio2.volume = 0.5
      audio2.play().catch((err) => {
        console.error('Castle sound error:', err)
      })
    }, 100) // 100ms delay between sounds
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
