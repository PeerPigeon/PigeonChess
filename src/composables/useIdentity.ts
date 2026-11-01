import { ref } from 'vue'

import * as unsea from 'unsea'
import { aliasKey, createAccountRecord, decryptKeys, isPostQuantumRecord, openAccountRecord, upgradeAccountRecord, validAlias, verifyAccountRecord } from 'pigeonidp/records'

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
            publicKeys.value = unsea.publicKeysOf(session.keys)
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
  //
  // Accounts are post-quantum (version 2 records, unsea 3): the key pair has
  // ML-DSA-65 and ML-KEM-768 keys next to its P-256 ones, records and player
  // claims are signed with both, and keys are sealed with Argon2id. An older
  // account is moved over at its next login, keeping its name and P-256 key.
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
    // Not on this relay (nor the local relays it federates with): other
    // players may still hold a copy, so give the mesh its full wait too.
    const record = await dhtGet(meshKey(alias), { waitMs }).catch(() => null)
    return record && await verifyAccountRecord(record) && aliasKey(record.alias) === aliasKey(alias) ? record : null
  }

  const signIn = (alias: string, keys: any) => {
    currentIdentity.value = keys
    username.value = alias
    publicKeys.value = unsea.publicKeysOf(keys)
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
    if (await findRecord(alias, dhtGet, relay, relay ? 1000 : 4000)) throw nameTaken()
    if (dhtGet && await dhtGet(`identity:${alias}:${NAMESPACE}`, { waitMs: relay ? 0 : 4000 }).catch(() => null)) throw nameTaken()

    const keys = await unsea.generateRandomPair() // with post-quantum keys
    const record = await createAccountRecord({ alias, namespace: NAMESPACE, keys, password })
    if (await publishRecord(record, dhtPut, relay) === 'taken') throw nameTaken()
    await unsea.saveKeys(alias, keys, password)
    signIn(alias, keys)
    return keys
  }

  const loadIdentity = async (alias: string, password: string, dhtGet?: DhtGet, dhtPut?: DhtPut, relay?: RelayRequest) => {
    // This device first: keys saved here at registration or an earlier login.
    let keys: any = null
    try { keys = await unsea.loadKeys(alias, password) } catch { keys = null }

    const hadKeys = keys
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
    }

    // Bring the account up to date: post-quantum keys, and a version 2 record
    // wherever accounts are kept.
    try {
      if (!record) record = await findRecord(alias, dhtGet, relay, 0)
      if (record && record.pub === keys.pub) {
        if (isPostQuantumRecord(record)) {
          // Upgraded already (maybe from another device): use those keys.
          if (keys.qpub !== record.qpub || !keys.qpriv || !keys.kpriv) keys = await openAccountRecord(record, password)
        } else {
          // Signed by the P-256 key and the new post-quantum key together,
          // while P-256 still holds.
          const upgraded = await upgradeAccountRecord(record, password)
          keys = upgraded.keys
          record = upgraded.record
          await publishRecord(record, dhtPut, relay)
          // The old copies were sealed with PBKDF2 under the same password;
          // replace the one pages from before signed records read, so it is
          // not left out there to guess the password from.
          if (dhtPut) await dhtPut(`identity-keys:${alias}:${NAMESPACE}`, { migrated: true }).catch(() => {})
        }
      } else if (!record) {
        // An account the relay and mesh do not have (from before relays kept
        // accounts, or kept elsewhere): given to them now, post-quantum.
        if (!unsea.hasPostQuantumKeys(keys)) keys = unsea.upgradePair(keys)
        await publishRecord(await createAccountRecord({ alias, namespace: NAMESPACE, keys, password }), dhtPut, relay)
      }
    } catch (error) {
      console.warn('Could not bring the account up to date:', error)
    }

    if (keys !== hadKeys) await unsea.saveKeys(alias, keys, password).catch(() => {})
    signIn(record?.alias || alias, keys)
    return keys
  }

  // Who the opponent is: a page that is logged in tells its opponent its
  // name with a signature over this game and its peer id, made with the
  // account key. The other side shows the name only when the signature checks
  // out and the account record for that name has the same key, so nobody can
  // show up under someone else's name.
  const claimText = (gameId: string, peerId: string, alias: string) =>
    JSON.stringify(['pigeonchess-player', gameId, peerId, aliasKey(alias)])

  const signPlayerClaim = async (gameId: string, peerId: string) => {
    const keys = currentIdentity.value
    if (!isAuthenticated.value || !keys?.priv || !username.value) return null
    return {
      name: username.value,
      pub: keys.pub,
      ...(unsea.hasPostQuantumKeys(keys) ? { qpub: keys.qpub } : {}),
      // A hybrid (ECDSA + ML-DSA) signature when the account is post-quantum.
      sig: await unsea.signMessage(claimText(gameId, peerId, username.value), keys),
    }
  }

  const verifyPlayerClaim = async (claim: any, gameId: string, peerId: string, dhtGet?: DhtGet, relay?: RelayRequest) => {
    if (!claim || typeof claim.name !== 'string' || typeof claim.pub !== 'string' || typeof claim.sig !== 'string') return null
    if (!validAlias(claim.name)) return null
    if (claim.qpub !== undefined && typeof claim.qpub !== 'string') return null
    try {
      const record = await findRecord(claim.name, dhtGet, relay, 5000)
      if (!record || record.pub !== claim.pub) return null
      // A post-quantum account's claim must be signed with its post-quantum
      // key too (verifyMessage refuses a plain signature once qpub is given).
      const keys = isPostQuantumRecord(record) ? { pub: record.pub, qpub: record.qpub } : record.pub
      if (!await unsea.verifyMessage(claimText(gameId, peerId, claim.name), claim.sig, keys)) return null
      return record.alias
    } catch {
      return null
    }
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
    lookupPlayer,
    signPlayerClaim,
    verifyPlayerClaim
  }
}
