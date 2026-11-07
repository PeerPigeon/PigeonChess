import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'

// Which build a page is running, shown under the lobby, so a stale page is easy to spot.
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()
const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
// The commits of the packages installed from GitHub, as the lockfile names them (shown with the build).
const pinned = (name: string): string | null => {
  try {
    const lock = JSON.parse(readFileSync(resolve(__dirname, 'package-lock.json'), 'utf8'))
    return /#([0-9a-f]{7})/.exec(lock.packages?.[`node_modules/${name}`]?.resolved ?? '')?.[1] ?? null
  } catch { return null }
}

// PigeonAI is an optional dependency from a private repository: installed where there is access to it,
// skipped by npm elsewhere. Without it, 'pigeonai' is src/pigeonai-absent.ts, and the page offers no
// PigeonAI (the Computer plays Standard only).
const hasPigeonAI = existsSync(resolve(__dirname, 'node_modules/pigeonai/src/index.ts'))
const parts = `${hasPigeonAI ? `PigeonAI ${pinned('pigeonai') ?? '?'}, ` : ''}freertc ${pinned('freertc') ?? '?'}`

export default defineConfig({
  plugins: [vue(), {
    // version.json names the build; open pages compare it with their own and
    // reload when a newer one is out (src/main.ts).
    name: 'build-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: `${commit} (${parts}), built ${builtAt}` }) })
    },
  }],
  define: {
    __BUILD__: JSON.stringify(`${commit} (${parts}), built ${builtAt}`),
    __PIGEONAI__: JSON.stringify(hasPigeonAI),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      ...(hasPigeonAI ? {} : { pigeonai: resolve(__dirname, './src/pigeonai-absent.ts') }),
    }
  },
  // PigeonAI comes as TypeScript with a worker of its own: Vite builds it as part of the page.
  optimizeDeps: { exclude: ['pigeonai'] },
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true
  },
  build: {
    // Increase chunk size warning limit to 1MB (PigeonIdP + Chess.js are large)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and smaller initial load
        manualChunks: {
          'chess-engine': ['chess.js'],
          'vue-core': ['vue']
        }
      }
    }
  }
})
