import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { execSync } from 'child_process'

// Which build a page is running, shown under the lobby, so a stale page is easy to spot.
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' } })()
const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD__: JSON.stringify(`${commit}, built ${builtAt}`),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
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
