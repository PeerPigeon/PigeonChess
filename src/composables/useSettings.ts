import { ref, watch } from 'vue'
import type { Settings, BoardTheme, PieceTheme } from '@/types'
import { loadFromLocalStorage, saveToLocalStorage } from '@/utils/helpers'

const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'blue',
    name: 'Blue (Default)',
    light: '#e0e7ff',
    dark: '#6366f1',
    highlight: 'rgba(99, 102, 241, 0.3)',
    selected: 'rgba(37, 99, 235, 0.4)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'classic',
    name: 'Classic Brown',
    light: '#f0d9b5',
    dark: '#b58863',
    highlight: 'rgba(181, 136, 99, 0.3)',
    selected: 'rgba(20, 85, 30, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'green',
    name: 'Forest Green',
    light: '#eeeed2',
    dark: '#769656',
    highlight: 'rgba(118, 150, 86, 0.3)',
    selected: 'rgba(186, 202, 43, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'gray',
    name: 'Modern Gray',
    light: '#e5e5e5',
    dark: '#6b7280',
    highlight: 'rgba(107, 114, 128, 0.3)',
    selected: 'rgba(59, 130, 246, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    light: '#f3e8ff',
    dark: '#9333ea',
    highlight: 'rgba(147, 51, 234, 0.3)',
    selected: 'rgba(126, 34, 206, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'pink',
    name: 'Rose Pink',
    light: '#fce7f3',
    dark: '#ec4899',
    highlight: 'rgba(236, 72, 153, 0.3)',
    selected: 'rgba(219, 39, 119, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'monochrome',
    name: 'Black & White',
    light: '#ffffff',
    dark: '#1a1a1a',
    highlight: 'rgba(100, 100, 100, 0.3)',
    selected: 'rgba(60, 60, 60, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  },
  {
    id: 'crimson',
    name: 'Red & Black',
    light: '#ff4444',
    dark: '#1a1a1a',
    highlight: 'rgba(255, 68, 68, 0.3)',
    selected: 'rgba(200, 0, 0, 0.5)',
    moveDot: 'rgba(255, 255, 255, 0.3)'
  },
  {
    id: 'custom',
    name: 'Custom Colors',
    light: '#f0d9b5',
    dark: '#b58863',
    highlight: 'rgba(181, 136, 99, 0.3)',
    selected: 'rgba(20, 85, 30, 0.5)',
    moveDot: 'rgba(0, 0, 0, 0.2)'
  }
]

const PIECE_THEMES: PieceTheme[] = [
  {
    id: 'classic',
    name: 'Classic (Default)',
    whiteFill: '#ffffff',
    whiteStroke: '#000000',
    blackFill: '#000000',
    blackStroke: '#ffffff'
  },
  {
    id: 'wood',
    name: 'Wood',
    whiteFill: '#f0d9b5',
    whiteStroke: '#8b4513',
    blackFill: '#8b4513',
    blackStroke: '#f0d9b5'
  },
  {
    id: 'metal',
    name: 'Metal',
    whiteFill: '#e8e8e8',
    whiteStroke: '#4a4a4a',
    blackFill: '#4a4a4a',
    blackStroke: '#c0c0c0'
  },
  {
    id: 'ocean',
    name: 'Ocean',
    whiteFill: '#a7d8de',
    whiteStroke: '#004d7a',
    blackFill: '#004d7a',
    blackStroke: '#a7d8de'
  },
  {
    id: 'fire',
    name: 'Fire & Ice',
    whiteFill: '#87ceeb',
    whiteStroke: '#1e90ff',
    blackFill: '#ff4500',
    blackStroke: '#ff8c00'
  },
  {
    id: 'neon',
    name: 'Neon',
    whiteFill: '#00ff00',
    whiteStroke: '#00aa00',
    blackFill: '#ff00ff',
    blackStroke: '#aa00aa'
  },
  {
    id: 'custom',
    name: 'Custom Colors',
    whiteFill: '#ffffff',
    whiteStroke: '#000000',
    blackFill: '#000000',
    blackStroke: '#ffffff'
  }
]

// Calculate if a color is too dark/light for move dots to be visible
const getMoveDotColor = (hexColor: string): string => {
  // Remove # if present
  const hex = hexColor.replace('#', '')
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  
  // Calculate relative luminance using sRGB formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  
  // If light square (luminance > 0.5), use dark dots. Otherwise use light dots
  return luminance > 0.5 ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.4)'
}

const DEFAULT_SETTINGS: Settings = {
  signalingUrls: ['wss://pigeonhub.fly.dev', 'wss://pigeonhub-c.fly.dev'],
  networkName: 'pigeonchess',
  boardTheme: 'blue',
  soundEnabled: true
}

export function useSettings() {
  const settings = ref<Settings>(loadFromLocalStorage('chess-settings', DEFAULT_SETTINGS))

  // Apply board theme on load
  const applyBoardTheme = (themeId: string) => {
    let theme = BOARD_THEMES.find(t => t.id === themeId)
    
    // If custom theme, use custom colors from settings
    if (themeId === 'custom' && settings.value.customLightSquare && settings.value.customDarkSquare) {
      const lightSquare = settings.value.customLightSquare
      const darkSquare = settings.value.customDarkSquare
      
      // Calculate appropriate move dot colors based on square brightness
      const lightDotColor = getMoveDotColor(lightSquare)
      const darkDotColor = getMoveDotColor(darkSquare)
      
      theme = {
        id: 'custom',
        name: 'Custom Colors',
        light: lightSquare,
        dark: darkSquare,
        highlight: `${darkSquare}4d`, // 30% opacity
        selected: `${darkSquare}80`, // 50% opacity
        moveDot: lightDotColor // Use calculated color for light squares
      }
      
      // Also set a variable for dark square move dots
      document.documentElement.style.setProperty('--board-move-dot-dark', darkDotColor)
    } else if (!theme) {
      theme = BOARD_THEMES[0]
    }
    
    document.documentElement.style.setProperty('--board-light', theme.light)
    document.documentElement.style.setProperty('--board-dark', theme.dark)
    document.documentElement.style.setProperty('--board-highlight', theme.highlight)
    document.documentElement.style.setProperty('--board-selected', theme.selected)
    document.documentElement.style.setProperty('--board-move-dot', theme.moveDot)
  }

  // Apply theme on initialization
  applyBoardTheme(settings.value.boardTheme || 'blue')
  
  // Apply piece colors on initialization
  const applyPieceColors = () => {
    // Only apply custom colors if they're set, otherwise let SVG defaults show
    if (settings.value.customWhitePieceColor || settings.value.customBlackPieceColor) {
      const whiteFill = settings.value.customWhitePieceColor || '#ffffff'
      const blackFill = settings.value.customBlackPieceColor || '#000000'
      const whiteStroke = settings.value.customWhitePieceOutline || '#000000'
      const blackStroke = settings.value.customBlackPieceOutline || '#ffffff'
      
      // Set CSS variables for piece colors
      document.documentElement.style.setProperty('--piece-white-fill', whiteFill)
      document.documentElement.style.setProperty('--piece-black-fill', blackFill)
      document.documentElement.style.setProperty('--piece-white-stroke', whiteStroke)
      document.documentElement.style.setProperty('--piece-black-stroke', blackStroke)
      document.documentElement.style.setProperty('--piece-custom-colors', 'true')
    } else {
      // Use default SVG colors
      document.documentElement.style.setProperty('--piece-custom-colors', 'false')
    }
  }
  
  applyPieceColors()

  // Watch for changes and save to localStorage
  watch(settings, (newSettings) => {
    saveToLocalStorage('chess-settings', newSettings)
    if (newSettings.boardTheme) {
      applyBoardTheme(newSettings.boardTheme)
    }
    applyPieceColors()
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

  const setBoardTheme = (themeId: string) => {
    settings.value.boardTheme = themeId
  }

  const setCustomColors = (lightSquare: string, darkSquare: string) => {
    settings.value.customLightSquare = lightSquare
    settings.value.customDarkSquare = darkSquare
    settings.value.boardTheme = 'custom'
  }

  const setPieceColors = (whiteColor: string, blackColor: string) => {
    settings.value.customWhitePieceColor = whiteColor
    settings.value.customBlackPieceColor = blackColor
  }

  const setPieceOutlines = (whiteOutline: string, blackOutline: string) => {
    settings.value.customWhitePieceOutline = whiteOutline
    settings.value.customBlackPieceOutline = blackOutline
  }

  const setArrowColors = (whiteArrow: string, blackArrow: string, emptyArrow: string) => {
    settings.value.whiteArrowColor = whiteArrow
    settings.value.blackArrowColor = blackArrow
    settings.value.emptyArrowColor = emptyArrow
  }

  const setPieceTheme = (themeId: string) => {
    settings.value.pieceTheme = themeId
    const theme = PIECE_THEMES.find(t => t.id === themeId)
    if (theme && themeId !== 'custom') {
      settings.value.customWhitePieceColor = theme.whiteFill
      settings.value.customBlackPieceColor = theme.blackFill
      settings.value.customWhitePieceOutline = theme.whiteStroke
      settings.value.customBlackPieceOutline = theme.blackStroke
    }
  }

  const toggleSound = (enabled: boolean) => {
    settings.value.soundEnabled = enabled
  }

  return {
    settings,
    boardThemes: BOARD_THEMES,
    pieceThemes: PIECE_THEMES,
    addSignalingUrl,
    removeSignalingUrl,
    resetToDefaults,
    setBoardTheme,
    setCustomColors,
    setPieceColors,
    setPieceOutlines,
    setArrowColors,
    setPieceTheme,
    toggleSound
  }
}
