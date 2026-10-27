<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal history" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div class="history-head">
        <h2 id="history-title">Your games</h2>
        <button class="secondary" @click="$emit('close')">Close</button>
      </div>

      <p v-if="gameHistory.length === 0" class="empty">
        Games you finish are kept here so you can play through them again.
      </p>

      <ol v-else class="games">
        <li v-for="game in gameHistory" :key="game.gameId" class="game" :class="game.result">
          <div class="game-main">
            <span class="result">{{ resultWord(game.result) }}</span>
            <span class="who">
              <img class="colour" :src="`/pieces/${game.myColor === 'white' ? 'w' : 'b'}k.svg`" alt="" />
              against {{ opponentName(game) }}
            </span>
            <span class="when">{{ formatDate(game.date) }}, {{ game.moves.length }} {{ game.moves.length === 1 ? 'move' : 'moves' }}</span>
            <span v-if="game.opening" class="opening">{{ game.opening }}</span>
          </div>
          <button class="secondary" @click="emit('watch', game)">Review</button>
        </li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GameHistoryEntry } from '@/types'

interface Props {
  gameHistory: GameHistoryEntry[]
}

defineProps<Props>()
const emit = defineEmits<{
  close: []
  watch: [game: GameHistoryEntry]
}>()

const formatDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const resultWord = (result: string): string =>
  ({ win: 'Won', loss: 'Lost', draw: 'Drawn', abandoned: 'Abandoned' } as Record<string, string>)[result] || result

const opponentName = (game: GameHistoryEntry): string => {
  if (game.isAI) return formatDifficulty(game.aiDifficulty)
  return (game.opponentUsername && game.opponentUsername.trim()) || formatPeerId(game.opponent)
}

const formatPeerId = (peerId: string | undefined): string => {
  if (!peerId) return 'Unknown'
  if (peerId.length > 20) {
    return peerId.substring(0, 10) + '...' + peerId.substring(peerId.length - 8)
  }
  return peerId
}

const formatDifficulty = (difficulty: number | undefined): string => {
  if (difficulty === undefined || difficulty === null) return 'Computer'
  const levels = ['easy', 'medium', 'hard', 'master']
  return levels[difficulty] ? `Computer, ${levels[difficulty]}` : 'Computer'
}
</script>

<style scoped>
.history {
  width: min(100%, 620px);
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.history-head h2 {
  margin: 0;
}

.empty {
  color: var(--ink-2);
}

.games {
  list-style: none;
  border-top: 1px solid var(--line);
}

.game {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0 0.75rem 0.85rem;
  border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--line-strong);
}

.game.win { border-left-color: var(--sheen); }
.game.loss { border-left-color: var(--stop); }

.game-main {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  column-gap: 0.75rem;
}

.result {
  font-weight: 700;
  grid-row: span 3;
}

.game.win .result { color: var(--sheen); }
.game.loss .result { color: var(--stop); }

.who {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.colour {
  width: 18px;
  height: 18px;
  flex: none;
}

.when,
.opening {
  font-size: 0.85rem;
  color: var(--ink-2);
}

.opening {
  font-style: italic;
}

@media (max-width: 480px) {
  .game-main {
    grid-template-columns: 1fr;
  }

  .result {
    grid-row: auto;
  }
}
</style>
