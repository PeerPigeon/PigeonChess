import { ref } from 'vue'

// Use UnSEA crypto functions from the global window object (loaded via browser bundle)
declare global {
  interface Window {
    __PEERPIGEON_UNSEA__: any
  }
}

export function useIdentity() {
  const currentIdentity = ref<any>(null)
  const isAuthenticated = ref(false)
  const username = ref<string>('')
  const publicKeys = ref<any>(null)

  const initializeIdP = async () => {
    try {
      // Check if UnSEA is available from the browser bundle
      if (!window.__PEERPIGEON_UNSEA__) {
        throw new Error('UnSEA crypto not available')
      }
      
      console.log('Identity system initialized with UnSEA')
      
      // Check if there's a stored username (but don't auto-load encrypted keys)
      const storedUsername = localStorage.getItem('chess-username')
      if (storedUsername) {
        username.value = storedUsername
        console.log('Found stored username:', storedUsername)
        // Note: User will need to login with password to decrypt keys
      }
      
      return true
    } catch (error) {
      console.error('Failed to initialize identity system:', error)
      return false
    }
  }

  const createIdentity = async (alias: string, password: string, dhtPut?: (key: string, value: any) => Promise<void>) => {
    if (!window.__PEERPIGEON_UNSEA__) throw new Error('UnSEA not available')
    
    try {
      // Generate new cryptographic keypair using UnSEA
      const keys = await window.__PEERPIGEON_UNSEA__.generateRandomPair()
      currentIdentity.value = keys
      username.value = alias
      publicKeys.value = { pub: keys.pub, epub: keys.epub }
      isAuthenticated.value = true
      
      // Save keys securely with password
      await window.__PEERPIGEON_UNSEA__.saveKeys(alias, keys, password)
      
      // Save username to localStorage
      localStorage.setItem('chess-username', alias)
      
      // Register identity in DHT if available
      if (dhtPut) {
        const publicKeyData = {
          pub: keys.pub,
          epub: keys.epub,
          alias,
          namespace: 'pigeon-chess',
          created: Date.now()
        }
        await dhtPut(`identity:${alias}:pigeon-chess`, publicKeyData)
      }
      
      console.log('Identity created and registered:', alias)
      return keys
    } catch (error) {
      console.error('Failed to create identity:', error)
      throw error
    }
  }

  const loadIdentity = async (alias: string, password: string) => {
    if (!window.__PEERPIGEON_UNSEA__) throw new Error('UnSEA not available')
    
    try {
      const keys = await window.__PEERPIGEON_UNSEA__.loadKeys(alias, password)
      currentIdentity.value = keys
      username.value = alias
      publicKeys.value = { pub: keys.pub, epub: keys.epub }
      isAuthenticated.value = true
      
      // Save username to localStorage
      localStorage.setItem('chess-username', alias)
      
      console.log('Identity loaded:', alias)
      return keys
    } catch (error) {
      console.error('Failed to load identity:', error)
      throw error
    }
  }

  const logout = async () => {
    username.value = ''
    currentIdentity.value = null
    publicKeys.value = null
    isAuthenticated.value = false
    localStorage.removeItem('chess-username')
  }

  const lookupPlayer = async (publicKey: string, dhtGet?: (key: string) => Promise<any>) => {
    if (!dhtGet) return null
    
    try {
      // Try to find the player's identity in DHT
      const identity = await dhtGet(`identity:${publicKey}:pigeon-chess`)
      return identity
    } catch (error) {
      console.error('Failed to lookup player:', error)
      return null
    }
  }

  return {
    currentIdentity,
    isAuthenticated,
    username,
    publicKeys,
    initializeIdP,
    createIdentity,
    loadIdentity,
    logout,
    lookupPlayer
  }
}
