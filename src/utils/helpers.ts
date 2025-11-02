export function generateGameId(): string {
  return `game-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

export function generatePeerId(): string {
  return `peer-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

export function saveToLocalStorage(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error('Failed to save to localStorage:', error)
  }
}

export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    console.error('Failed to load from localStorage:', error)
    return defaultValue
  }
}

export function removeFromLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to remove from localStorage:', error)
  }
}
