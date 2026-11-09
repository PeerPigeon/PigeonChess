/**
 * The computer's levels (Stockfish): the page's Computer opponent and the wurl bots play by these.
 * movetime: the most it may think, so a move never takes long.
 */
export const ENGINE_LEVELS = [
  { name: 'easy', skill: 0, depth: 1, movetime: 300 },
  { name: 'medium', skill: 5, depth: 6, movetime: 1000 },
  { name: 'hard', skill: 10, depth: 10, movetime: 2000 },
  { name: 'master', skill: 15, depth: 15, movetime: 3000 },
] as const

export type EngineLevel = (typeof ENGINE_LEVELS)[number]

/** A level by its name or number (0–3); medium otherwise. */
export function engineLevel(which: string | number | undefined): EngineLevel {
  if (typeof which === 'number') return ENGINE_LEVELS[Math.max(0, Math.min(3, which))] ?? ENGINE_LEVELS[1]
  return ENGINE_LEVELS.find((l) => l.name === which) ?? ENGINE_LEVELS[1]
}
