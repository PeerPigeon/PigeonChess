<template>
  <!-- PigeonAI's state: a bar while this device loads its share of the model (the details on hover),
       else in words ("Ready: …", or what it is waiting for). -->
  <span class="pai-status" :class="{ ready }" :title="text">
    <template v-if="progress !== null">
      <span class="pai-bar" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" :aria-label="text">
        <span class="pai-fill" :style="{ width: `${pct}%` }"></span>
      </span>
      <span class="pai-pct">{{ pct }}%</span>
    </template>
    <template v-else>{{ text || 'Starting…' }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string; progress: number | null; ready: boolean }>()
const pct = computed(() => Math.floor(100 * (props.progress ?? 0)))
</script>

<style scoped>
.pai-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-width: 0;
}

.pai-bar {
  position: relative;
  display: block;
  flex: 1 1 auto;
  min-width: 6rem;
  max-width: 16rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.pai-fill {
  position: absolute;
  display: block;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--sheen);
  transition: width 0.6s ease;
}

.pai-pct {
  flex: none;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
}
</style>
