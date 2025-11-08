<template>
  <div class="matchmaking-lobby">
    <div class="lobby-header">
      <h1>♟️ PigeonChess Lobby</h1>
      <p class="peer-id">Your ID: <code>{{ peerId }}</code></p>
    </div>

    <div class="stats-panel">
      <div class="stat">
        <span class="stat-label">Players Online</span>
        <span class="stat-value">{{ stats.totalPeers }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">In Queue</span>
        <span class="stat-value">{{ stats.queuedPeers }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Active Games</span>
        <span class="stat-value">{{ stats.activeMatches }}</span>
      </div>
    </div>

    <div v-if="error" class="error-message">
      ⚠️ {{ error }}
    </div>

    <div class="action-panel">
      <button 
        v-if="!inQueue" 
        @click="$emit('join-queue')"
        class="btn btn-primary"
        :disabled="!isConnected"
      >
        <span class="btn-icon">🎯</span>
        Find Match
      </button>

      <button 
        v-else
        @click="$emit('leave-queue')"
        class="btn btn-secondary"
      >
        <span class="btn-icon">❌</span>
        Leave Queue
      </button>

      <div v-if="inQueue && !isMatchReady" class="searching">
        <div class="spinner"></div>
        <p>Searching for opponent...</p>
      </div>
    </div>

    <div v-if="isMatchReady && currentMatch" class="match-found">
      <div class="match-header">
        <h2>🎮 Match Found!</h2>
        <p>Match ID: <code>{{ currentMatch.id }}</code></p>
      </div>
      
      <div class="players-list">
        <h3>Players:</h3>
        <ul>
          <li v-for="peer in currentMatch.peers" :key="peer.id" class="player-item">
            <span class="player-icon">{{ peer.id === peerId ? '👤' : '🤖' }}</span>
            {{ peer.id }}
            <span v-if="peer.id === peerId" class="you-badge">You</span>
          </li>
        </ul>
      </div>

      <button @click="$emit('start-game')" class="btn btn-success">
        <span class="btn-icon">▶️</span>
        Start Game
      </button>
    </div>

    <div class="connection-status">
      <div class="status-indicator" :class="{ connected: isConnected }"></div>
      <span>{{ isConnected ? 'Connected to PeerPigeon' : 'Connecting...' }}</span>
    </div>

    <div v-if="peers.length > 0" class="peers-panel">
      <h3>Available Players ({{ peers.length }})</h3>
      <div class="peers-list">
        <div v-for="peer in peers" :key="peer.id" class="peer-card">
          <span class="peer-icon">👤</span>
          <span class="peer-name">{{ peer.id }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MatchGroup, Peer } from '@/lib/pigeonmatch/types'

interface Props {
  peerId: string
  isConnected: boolean
  inQueue: boolean
  currentMatch: MatchGroup | null
  isMatchReady: boolean
  peers: Peer[]
  stats: {
    totalPeers: number
    queuedPeers: number
    activeMatches: number
    namespace: string
  }
  error: string | null
}

defineProps<Props>()

defineEmits<{
  'join-queue': []
  'leave-queue': []
  'start-game': []
}>()
</script>

<style scoped>
.matchmaking-lobby {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family: system-ui, -apple-system, sans-serif;
}

.lobby-header {
  text-align: center;
  margin-bottom: 2rem;
}

.lobby-header h1 {
  font-size: 2.5rem;
  margin: 0 0 1rem 0;
  color: #2c3e50;
}

.peer-id {
  color: #666;
  font-size: 0.9rem;
}

.peer-id code {
  background: #f0f0f0;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.85rem;
}

.stats-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1.5rem;
  border-radius: 12px;
  text-align: center;
  color: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stat-label {
  display: block;
  font-size: 0.85rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
}

.stat-value {
  display: block;
  font-size: 2rem;
  font-weight: bold;
}

.error-message {
  background: #fee;
  border: 1px solid #fcc;
  color: #c33;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.action-panel {
  text-align: center;
  margin: 2rem 0;
}

.btn {
  font-size: 1.1rem;
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-success {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  color: white;
  font-size: 1.2rem;
  padding: 1.25rem 2.5rem;
}

.btn-icon {
  font-size: 1.2em;
}

.searching {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.searching p {
  color: #666;
  font-size: 1.1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.match-found {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  padding: 2rem;
  border-radius: 16px;
  text-align: center;
  margin: 2rem 0;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
}

.match-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 2rem;
}

.match-header p {
  margin: 0 0 1.5rem 0;
  opacity: 0.9;
}

.match-header code {
  background: rgba(255, 255, 255, 0.2);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
}

.players-list {
  margin: 1.5rem 0;
}

.players-list h3 {
  margin: 0 0 1rem 0;
}

.players-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.player-item {
  background: rgba(255, 255, 255, 0.2);
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.player-icon {
  font-size: 1.5rem;
}

.you-badge {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.3);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: bold;
}

.connection-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 2rem 0;
  color: #666;
  font-size: 0.9rem;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ccc;
  transition: background 0.3s ease;
}

.status-indicator.connected {
  background: #38ef7d;
  box-shadow: 0 0 8px rgba(56, 239, 125, 0.5);
}

.peers-panel {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #f9f9f9;
  border-radius: 12px;
}

.peers-panel h3 {
  margin: 0 0 1rem 0;
  color: #2c3e50;
}

.peers-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.peer-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s ease;
}

.peer-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.peer-icon {
  font-size: 1.5rem;
}

.peer-name {
  font-size: 0.9rem;
  color: #555;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
