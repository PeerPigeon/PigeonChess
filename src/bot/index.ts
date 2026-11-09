/**
 * PigeonChess for computer players (the wurl bots): taking part in tournaments, and playing a game
 * against a page, with the same records and messages a page uses. No Vue, no browser: Node 20+ will do.
 */
export { TournamentClient, type Me, type TournamentMatch, type TournamentClientOptions, type TournamentView } from '../utils/tournamentClient'
export * from '../utils/tournament'
export { BotGame, type BotGameOptions, type BotMove } from './game'
export { makeSeatKeys, type SeatKeys } from '../composables/useSeat'
export { ENGINE_LEVELS, engineLevel, type EngineLevel } from '../utils/engineLevels'
/** The mesh a page joins (usePeerPigeon.ts): PeerPigeon's networkId, and the room ('global' unless set in Settings). */
export const MESH = { networkId: 'pigeonchess', room: 'global' } as const
/**
 * Tournament records live in the mesh's own storage (PeerPigeonNode's storage, synced with neighbours),
 * under KEYS (exported above): give the node `storage: { replicate: [KEYS] }`, as pages do, and hand its
 * storage to the TournamentClient as the room.
 */
