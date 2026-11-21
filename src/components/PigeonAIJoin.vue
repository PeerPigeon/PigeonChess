<template>
  <!-- Joining PigeonAI: nothing runs on this device until its player picks how to take part. -->
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal join" role="dialog" aria-modal="true" aria-labelledby="join-title">
      <h2 id="join-title">Join PigeonAI</h2>
      <p class="lead">
        PigeonAI is one language model run by the players here together. It works like a mining pool:
        each device that lends a share holds part of the model and does part of every answer.
      </p>

      <button type="button" class="choice" @click="$emit('choose', 'lend')">
        <span class="choice-head">Lend a share of this device</span>
        <span class="choice-body">
          While chess.peer.ooo is open, this device holds part of the model on its GPU and storage, within the
          limits in Settings. You earn PigeonSeed for the work it does for other players. It downloads its
          part of the model (once; it's kept) and sends parts to other players: on a phone hotspot or a metered
          connection, that uses your data.
        </span>
        <span class="soon">PigeonSeed: coming soon. The work is counted already.</span>
      </button>

      <button type="button" class="choice" :disabled="rule === 'required'" @click="$emit('choose', 'pay')">
        <span class="choice-head">Pay to play</span>
        <span class="choice-body">Play on other players' shares, and pay them in PigeonSeed. Nothing runs on this device.</span>
        <span v-if="rule === 'required'" class="soon">Not on {{ network }}: every player here lends a share.</span>
        <span v-else class="soon">PigeonSeed: coming soon.</span>
      </button>

      <p class="fine">
        The network keeps a small cut of what is paid, as a pool does. You can change this in Settings → PigeonAI.
        Or play Local AI, a model on this device alone.
      </p>
      <div class="row">
        <button class="secondary" @click="$emit('close')">Not now</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ network: string; rule: 'required' | 'optional' | 'off' }>()
defineEmits<{ choose: [how: 'lend' | 'pay']; close: [] }>()
</script>

<style scoped>
.join { width: min(100%, 520px); }
.join h2 { margin: 0 0 0.5rem; }
.lead { margin: 0 0 1rem; color: var(--text-secondary, inherit); line-height: 1.45; }
.choice {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: 100%;
  text-align: left;
  padding: 0.9rem 1rem;
  margin: 0 0 0.6rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.choice:hover:not(:disabled) { border-color: var(--accent, var(--line)); }
.choice:disabled { opacity: 0.55; cursor: not-allowed; }
.choice-head { font-weight: 600; }
.choice-body { line-height: 1.4; }
.soon { font-size: 0.85rem; opacity: 0.75; }
.fine { font-size: 0.85rem; opacity: 0.8; line-height: 1.4; margin: 0.6rem 0 1rem; }
.row { display: flex; justify-content: flex-end; }
</style>
