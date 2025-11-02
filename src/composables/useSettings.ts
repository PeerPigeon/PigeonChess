import { ref, watch } from 'vue'
import type { Settings } from '@/types'
import { loadFromLocalStorage, saveToLocalStorage } from '@/utils/helpers'

const DEFAULT_SETTINGS: Settings = {
  signalingUrls: ['wss://pigeonhub.fly.dev', 'wss://pigeonhub-server-3c044110c06f.herokuapp.com'],
  networkName: 'pigeonchess'
}

export function useSettings() {
  const settings = ref<Settings>(loadFromLocalStorage('chess-settings', DEFAULT_SETTINGS))

  // Watch for changes and save to localStorage
  watch(settings, (newSettings) => {
    saveToLocalStorage('chess-settings', newSettings)
  }, { deep: true })

  const addSignalingUrl = (url: string) => {
    if (url && !settings.value.signalingUrls.includes(url)) {
      settings.value.signalingUrls.push(url)
    }
  }

  const removeSignalingUrl = (url: string) => {
    settings.value.signalingUrls = settings.value.signalingUrls.filter(u => u !== url)
  }

  const resetToDefaults = () => {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return {
    settings,
    addSignalingUrl,
    removeSignalingUrl,
    resetToDefaults
  }
}
