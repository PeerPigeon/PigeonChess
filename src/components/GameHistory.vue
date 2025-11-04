<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal history-modal">
      <h2>Game History</h2>
      
      <div v-if="gameHistory.length === 0" class="empty-state">
        <p>No games played yet. Start a new game!</p>
      </div>
      
      <div v-else class="history-list">
        <div 
          v-for="game in gameHistory" 
          :key="game.gameId"
          class="history-item"
          :class="game.result"
        >
          <div class="game-header">
            <span class="result-badge" :class="game.result">
              {{ game.result.toUpperCase() }}
            </span>
            <span class="date">{{ formatDate(game.date) }}</span>
          </div>
          
          <div class="game-info">
            <div class="info-row">
              <span class="label">Color:</span>
              <span class="value">{{ game.myColor === 'white' ? '♔ White' : '♚ Black' }}</span>
            </div>
            <div v-if="game.whitePlayer" class="info-row">
              <span class="label">White:</span>
              <span class="value opponent-id">{{ formatPeerId(game.whitePlayer) }}</span>
            </div>
            <div v-if="game.blackPlayer" class="info-row">
              <span class="label">Black:</span>
              <span class="value opponent-id">{{ formatPeerId(game.blackPlayer) }}</span>
            </div>
            <div v-if="!game.whitePlayer && !game.blackPlayer" class="info-row">
              <span class="label">Opponent:</span>
              <span class="value opponent-id">{{ formatPeerId(game.opponent) }}</span>
            </div>
            <div class="info-row">
              <span class="label">Moves:</span>
              <span class="value">{{ game.moves.length }}</span>
            </div>
          </div>
          
          <details class="moves-details">
            <summary>View Moves</summary>
            <div class="moves-list">
              <div 
                v-for="(move, moveIndex) in game.moves" 
                :key="moveIndex"
                class="move-item"
              >
                <span class="move-number">{{ Math.floor(moveIndex / 2) + 1 }}{{ moveIndex % 2 === 0 ? '.' : '...' }}</span>
                <span class="move-san">{{ move }}</span>
              </div>
            </div>
          </details>
        </div>
      </div>
      
      <div class="actions">
        <button class="primary" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GameHistoryEntry } from '@/types'

interface Props {
  gameHistory: GameHistoryEntry[]
}

defineProps<Props>()
defineEmits<{
  close: []
}>()

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

const formatPeerId = (peerId: string | undefined): string => {
  if (!peerId) return 'Unknown'
  if (peerId.length > 20) {
    return peerId.substring(0, 10) + '...' + peerId.substring(peerId.length - 8)
  }
  return peerId
}
</script>

<style scoped>
.history-modal {
  max-width: 700px;
  max-height: 80vh;
  overflow-y: auto;
}

h2 {
  margin-bottom: 1.5rem;
  color: var(--dark-color);
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--secondary-color);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.history-item {
  background: var(--light-color);
  border-radius: 8px;
  padding: 1rem;
  border-left: 4px solid var(--secondary-color);
}

.history-item.win {
  border-left-color: var(--success-color);
}

.history-item.loss {
  border-left-color: var(--danger-color);
}

.history-item.draw {
  border-left-color: var(--warning-color);
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.result-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  color: white;
}

.result-badge.win {
  background: var(--success-color);
}

.result-badge.loss {
  background: var(--danger-color);
}

.result-badge.draw {
  background: var(--warning-color);
}

.date {
  font-size: 0.85rem;
  color: var(--secondary-color);
}

.game-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.info-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.label {
  font-weight: bold;
  color: var(--dark-color);
}

.value {
  color: var(--secondary-color);
}

.opponent-id {
  font-family: monospace;
  font-size: 0.85rem;
}

.moves-details {
  margin-top: 0.75rem;
  cursor: pointer;
}

.moves-details summary {
  font-size: 0.9rem;
  color: var(--primary-color);
  user-select: none;
}

.moves-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: white;
  border-radius: 4px;
}

.move-item {
  font-size: 0.85rem;
  font-family: monospace;
}

.move-number {
  color: var(--secondary-color);
  margin-right: 0.25rem;
}

.move-san {
  color: var(--dark-color);
  font-weight: bold;
}

.actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}
</style>
