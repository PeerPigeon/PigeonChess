import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
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
