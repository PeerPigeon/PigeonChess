/**
 * Stands in for PigeonAI (an optional dependency, from a private repository) where it was not
 * installed: the build goes through, and the page offers no PigeonAI. See vite.config.ts.
 */
export const BONSAI = ''
export async function startPigeonAI(): Promise<never> {
  throw new Error('PigeonAI is not part of this build')
}
