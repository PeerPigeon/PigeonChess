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
    if (!dhtPut) throw new Error('DHT required for identity storage')
    
    try {
      // Generate new cryptographic keypair using UnSEA
      const keys = await window.__PEERPIGEON_UNSEA__.generateRandomPair()
      currentIdentity.value = keys
      username.value = alias
      publicKeys.value = { pub: keys.pub, epub: keys.epub }
      isAuthenticated.value = true
      
      // Encrypt the full keypair with password using UnSEA's encryption
      const subtle = crypto.subtle
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))
      
      // Derive encryption key from password
      const encoder = new TextEncoder()
      const passwordKey = await subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      )
      
      const derivedKey = await subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      )
      
      // Encrypt the keypair
      const keyData = encoder.encode(JSON.stringify(keys))
      const encryptedData = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        keyData
      )
      
      // Convert to base64 for storage
      const bufToB64 = (buf: Uint8Array | ArrayBuffer) => {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
        return btoa(String.fromCharCode(...bytes))
      }
      
      const encryptedKeys = {
        encrypted: true,
        salt: bufToB64(salt),
        iv: bufToB64(iv),
        data: bufToB64(encryptedData)
      }
      
      // Also save locally for faster access
      await window.__PEERPIGEON_UNSEA__.saveKeys(alias, keys, password)
      
      // Save username to localStorage
      localStorage.setItem('chess-username', alias)
      
      // Store encrypted keys in DHT for cross-device access
      await dhtPut(`identity-keys:${alias}:pigeon-chess`, encryptedKeys)
      
      // Register public identity in DHT
      const publicKeyData = {
        pub: keys.pub,
        epub: keys.epub,
        alias,
        namespace: 'pigeon-chess',
        created: Date.now()
      }
      await dhtPut(`identity:${alias}:pigeon-chess`, publicKeyData)
      
      console.log('Identity created and registered in DHT:', alias)
      return keys
    } catch (error) {
      console.error('Failed to create identity:', error)
      throw error
    }
  }

  const loadIdentity = async (alias: string, password: string, dhtGet?: (key: string) => Promise<any>, dhtPut?: (key: string, value: any) => Promise<void>) => {
    if (!window.__PEERPIGEON_UNSEA__) throw new Error('UnSEA not available')
    
    try {
      // Try to load from local IndexedDB first
      let keys
      let loadedFromLocal = false
      try {
        keys = await window.__PEERPIGEON_UNSEA__.loadKeys(alias, password)
        console.log('loadKeys returned:', keys ? 'keys object' : 'null/undefined')
        
        // If loadKeys returned null/undefined, treat it as not found
        if (!keys) {
          console.log('loadKeys returned null, treating as not found locally')
          throw new Error('Keys not found or invalid password')
        }
        
        loadedFromLocal = true
        console.log('Identity loaded from local storage:', alias)
        console.log('Keys structure:', { hasPub: !!keys.pub, hasEpub: !!keys.epub, hasEpriv: !!keys.epriv, hasPriv: !!keys.priv })
      } catch (localError) {
        console.log('Local keys not found, attempting to load from DHT...')
        
        // If local load fails and DHT is available, try loading from DHT
        if (!dhtGet) {
          throw new Error('Keys not found locally and DHT not available')
        }
        
        console.log(`Fetching from DHT: identity-keys:${alias}:pigeon-chess`)
        const encryptedKeys = await dhtGet(`identity-keys:${alias}:pigeon-chess`)
        console.log('DHT response:', encryptedKeys ? 'Found' : 'Not found', encryptedKeys)
        
        if (!encryptedKeys || !encryptedKeys.encrypted) {
          throw new Error('Keys not found in DHT')
        }
        
        // Decrypt the keys from DHT
        const subtle = crypto.subtle
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()
        
        // Convert base64 back to ArrayBuffer
        const b64ToBuf = (b64: string) => {
          const binary = atob(b64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
          }
          return bytes.buffer
        }
        
        const salt = b64ToBuf(encryptedKeys.salt)
        const iv = b64ToBuf(encryptedKeys.iv)
        const encryptedData = b64ToBuf(encryptedKeys.data)
        
        // Derive decryption key from password
        const passwordKey = await subtle.importKey(
          'raw',
          encoder.encode(password),
          'PBKDF2',
          false,
          ['deriveBits', 'deriveKey']
        )
        
        const derivedKey = await subtle.deriveKey(
          {
            name: 'PBKDF2',
            salt: new Uint8Array(salt),
            iterations: 100000,
            hash: 'SHA-256'
          },
          passwordKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        )
        
        // Decrypt the keypair
        const decryptedData = await subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(iv) },
          derivedKey,
          encryptedData
        )
        
        keys = JSON.parse(decoder.decode(decryptedData))
        
        // Save to local storage for future use
        await window.__PEERPIGEON_UNSEA__.saveKeys(alias, keys, password)
        console.log('Identity loaded from DHT and cached locally:', alias)
      }
      
      // MIGRATION: If keys were loaded from local storage and DHT is available,
      // check if they exist in DHT and upload if not (for backward compatibility)
      if (loadedFromLocal && dhtGet && dhtPut) {
        try {
          console.log(`Checking DHT for existing keys: identity-keys:${alias}:pigeon-chess`)
          const existingDHTKeys = await dhtGet(`identity-keys:${alias}:pigeon-chess`)
          console.log('DHT check result:', existingDHTKeys ? 'Keys already exist' : 'Keys not found, will migrate')
          
          if (!existingDHTKeys) {
            console.log('Migrating existing account to DHT...')
            
            // Encrypt and upload to DHT
            const subtle = crypto.subtle
            const encoder = new TextEncoder()
            const salt = crypto.getRandomValues(new Uint8Array(16))
            const iv = crypto.getRandomValues(new Uint8Array(12))
            
            const passwordKey = await subtle.importKey(
              'raw',
              encoder.encode(password),
              'PBKDF2',
              false,
              ['deriveBits', 'deriveKey']
            )
            
            const derivedKey = await subtle.deriveKey(
              {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
              },
              passwordKey,
              { name: 'AES-GCM', length: 256 },
              false,
              ['encrypt']
            )
            
            const keyData = encoder.encode(JSON.stringify(keys))
            const encryptedData = await subtle.encrypt(
              { name: 'AES-GCM', iv },
              derivedKey,
              keyData
            )
            
            const bufToB64 = (buf: Uint8Array | ArrayBuffer) => {
              const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
              return btoa(String.fromCharCode(...bytes))
            }
            
            const encryptedKeys = {
              encrypted: true,
              salt: bufToB64(salt),
              iv: bufToB64(iv),
              data: bufToB64(encryptedData)
            }
            
            await dhtPut(`identity-keys:${alias}:pigeon-chess`, encryptedKeys)
            console.log('Uploaded encrypted keys to DHT')
            
            // Also register public identity
            const publicKeyData = {
              pub: keys.pub,
              epub: keys.epub,
              alias,
              namespace: 'pigeon-chess',
              created: Date.now()
            }
            await dhtPut(`identity:${alias}:pigeon-chess`, publicKeyData)
            console.log('Uploaded public identity to DHT')
            
            console.log('Successfully migrated account to DHT for cross-device access')
          }
        } catch (migrationError) {
          console.warn('Failed to migrate account to DHT (non-fatal):', migrationError)
        }
      }
      
      currentIdentity.value = keys
      username.value = alias
      console.log('About to set publicKeys, keys:', keys ? { hasPub: !!keys.pub, hasEpub: !!keys.epub } : 'null/undefined')
      publicKeys.value = { pub: keys.pub, epub: keys.epub }
      isAuthenticated.value = true
      
      // Save username to localStorage
      localStorage.setItem('chess-username', alias)
      
      console.log('Identity loaded successfully:', alias)
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
