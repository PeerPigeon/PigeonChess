import { ref } from 'vue'

import * as unsea from 'unsea'
import { aliasKey, createAccountRecord, decryptKeys, openAccountRecord, verifyAccountRecord } from 'pigeonidp/records'

export function useIdentity() {
  const currentIdentity = ref<any>(null)
  const isAuthenticated = ref(false)
  const username = ref<string>('')
  const publicKeys = ref<any>(null)

  // Session management constants
  const SESSION_KEY = 'chess-session'
  const SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

  const initializeIdP = async () => {
    try {
      console.log('Identity system initialized with UnSEA')
      
      // Try to restore session from sessionStorage
      const sessionData = sessionStorage.getItem(SESSION_KEY)
      if (sessionData) {
        try {
          const session = JSON.parse(sessionData)
          const now = Date.now()
          
          // Check if session is still valid (within 24 hours)
          if (session.timestamp && (now - session.timestamp) < SESSION_TIMEOUT) {
            console.log('Restoring session for:', session.alias)
            currentIdentity.value = session.keys
            username.value = session.alias
            publicKeys.value = { pub: session.keys.pub, epub: session.keys.epub }
            isAuthenticated.value = true
            localStorage.setItem('chess-username', session.alias)
            console.log('Session restored successfully')
            return true
          } else {
            console.log('Session expired, clearing')
            sessionStorage.removeItem(SESSION_KEY)
          }
        } catch (sessionError) {
          console.warn('Failed to restore session:', sessionError)
          sessionStorage.removeItem(SESSION_KEY)
        }
      }
      
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

  const saveSession = (alias: string, keys: any) => {
    try {
      const session = {
        alias,
        keys,
        timestamp: Date.now()
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
      console.log('Session saved for:', alias)
    } catch (error) {
      console.warn('Failed to save session:', error)
    }
  }

  const clearSession = () => {
    sessionStorage.removeItem(SESSION_KEY)
    console.log('Session cleared')
  }

  // Accounts are signed records (pigeonidp/records): name, public keys, and
  // the private keys encrypted with the password, signed with the account's
  // own key. The relay this page is on keeps them (a local freertc relay is a
  // PigeonIdP server, and its store survives restarts), and so does the mesh.
  // A relay keeps a name for the key that registered it first, so registering
  // a taken name is refused, and a record from the mesh is only used when its
  // signature checks out.
  type DhtGet = (key: string, options?: { waitMs?: number }) => Promise<any>
  type DhtPut = (key: string, value: any) => Promise<any>
  type RelayRequest = (body: Record<string, unknown>) => Promise<any>
  const NAMESPACE = 'pigeon-chess'
  const meshKey = (alias: string) => `account:${aliasKey(alias)}:${NAMESPACE}`

  const askRelay = async (relay: RelayRequest | undefined, body: Record<string, unknown>) => {
    if (!relay) return null
    try {
      const answer = await relay(body)
      return answer?.error === 'unsupported' ? null : answer
    } catch {
      return null // not on a relay, or one too old to answer
    }
  }

  /** Put a record wherever it is kept. Returns 'taken' when the relay has the name for another key. */
  const publishRecord = async (record: any, dhtPut?: DhtPut, relay?: RelayRequest) => {
    const answer = await askRelay(relay, { action: 'idp-put', record })
    if (answer?.ok === false && answer.error === 'taken') return 'taken'
    if (dhtPut) await dhtPut(meshKey(record.alias), record).catch(() => {})
    return 'ok'
  }

  /** The verified record for a name: from the relay first, then the mesh. */
  const findRecord = async (alias: string, dhtGet?: DhtGet, relay?: RelayRequest, waitMs = 0) => {
    const answer = await askRelay(relay, { action: 'idp-get', namespace: NAMESPACE, alias })
    if (answer?.record && await verifyAccountRecord(answer.record)) return answer.record
    if (!dhtGet) return null
    // A relay that answered is the authority on names: the mesh is asked once,
    // without waiting for links, only for accounts made before relays kept them.
    const record = await dhtGet(meshKey(alias), { waitMs: answer?.ok ? 0 : waitMs }).catch(() => null)
    return record && await verifyAccountRecord(record) && aliasKey(record.alias) === aliasKey(alias) ? record : null
  }

  const signIn = (alias: string, keys: any) => {
    currentIdentity.value = keys
    username.value = alias
    publicKeys.value = { pub: keys.pub, epub: keys.epub }
    isAuthenticated.value = true
    localStorage.setItem('chess-username', alias)
    saveSession(alias, keys)
  }

  const nameTaken = () => {
    const error = new Error('That name is already taken')
    ;(error as any).code = 'name-taken'
    return error
  }

  const createIdentity = async (alias: string, password: string, dhtPut?: DhtPut, dhtGet?: DhtGet, relay?: RelayRequest) => {
    if (!dhtPut && !relay) throw new Error('No place to keep the account')
    // Already someone's: refused before making keys. The relay is the
    // authority when there is one; the mesh is asked as well, for accounts
    // made before relays kept them.
    if (await findRecord(alias, dhtGet, relay, 4000)) throw nameTaken()
    if (dhtGet && await dhtGet(`identity:${alias}:${NAMESPACE}`, { waitMs: relay ? 0 : 4000 }).catch(() => null)) throw nameTaken()

    const keys = await unsea.generateRandomPair()
    const record = await createAccountRecord({ alias, namespace: NAMESPACE, keys, password })
    if (await publishRecord(record, dhtPut, relay) === 'taken') throw nameTaken()
    await unsea.saveKeys(alias, keys, password)
    // Read by pages from before signed records.
    if (dhtPut) {
      await dhtPut(`identity-keys:${alias}:${NAMESPACE}`, { encrypted: true, ...record.keys }).catch(() => {})
      await dhtPut(`identity:${alias}:${NAMESPACE}`, { pub: keys.pub, epub: keys.epub, alias, namespace: NAMESPACE, created: record.created }).catch(() => {})
    }
    signIn(alias, keys)
    return keys
  }

  const loadIdentity = async (alias: string, password: string, dhtGet?: DhtGet, dhtPut?: DhtPut, relay?: RelayRequest) => {
    // This device first: keys saved here at registration or an earlier login.
    let keys: any = null
    try { keys = await unsea.loadKeys(alias, password) } catch { keys = null }

    let record: any = null
    if (!keys) {
      // Another device's account: the signed record from the relay or the mesh.
      // Right after the page opens the links that hold it may still be forming.
      record = await findRecord(alias, dhtGet, relay, 15000)
      if (record) {
        keys = await openAccountRecord(record, password) // throws on a wrong password
      } else if (dhtGet) {
        // An account from before signed records: the old encrypted blob.
        const blob = await dhtGet(`identity-keys:${alias}:${NAMESPACE}`, { waitMs: 3000 }).catch(() => null)
        if (!blob?.encrypted) {
          const error = new Error('Account not found')
          ;(error as any).code = 'not-found'
          throw error
        }
        keys = await decryptKeys(blob, password) // throws on a wrong password
      } else {
        const error = new Error('Account not found')
        ;(error as any).code = 'not-found'
        throw error
      }
      await unsea.saveKeys(alias, keys, password)
    }

    // An account the relay does not have yet (made before relays kept
    // accounts, or on another relay) is given to it now, signed.
    if (!record) {
      try {
        const existing = await findRecord(alias, dhtGet, relay, 0)
        if (!existing || existing.pub !== keys.pub) {
          const fresh = await createAccountRecord({ alias, namespace: NAMESPACE, keys, password })
          if (!existing) await publishRecord(fresh, dhtPut, relay)
          else await askRelay(relay, { action: 'idp-put', record: fresh })
        }
      } catch { /* best effort */ }
    }

    signIn(record?.alias || alias, keys)
    return keys
  }

  const logout = async () => {
    username.value = ''
    currentIdentity.value = null
    publicKeys.value = null
    isAuthenticated.value = false
    localStorage.removeItem('chess-username')
    clearSession()
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
