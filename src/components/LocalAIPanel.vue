<template>
  <!-- Local AI: a model on this device alone. Kept in this browser; offered to others only if asked. -->
  <div class="local-ai">
    <p class="engine-note">
      Local AI runs a language model on this device alone, kept in this browser. Nobody else's device is used.
    </p>

    <div class="mode-toggle source-pick" role="radiogroup" aria-label="Where the model comes from">
      <button v-for="s in sources" :key="s.id" type="button" role="radio" class="mode-option"
        :class="{ picked: prefs.source === s.id }" :aria-checked="prefs.source === s.id" @click="setSource(s.id)">{{ s.label }}</button>
    </div>

    <template v-if="prefs.source === 'file'">
      <label class="field">
        <span>A GGUF file on this device</span>
        <input type="file" accept=".gguf" @change="pickFile" />
      </label>
      <p v-if="prefs.name && !file" class="hint">{{ prefs.name }}: choose it again to load it (this browser keeps what it has read of it).</p>
      <p v-else-if="file" class="hint">{{ file.name }} ({{ (file.size / 1e9).toFixed(2) }} GB)</p>
    </template>
    <template v-else-if="prefs.source === 'hf'">
      <label class="field">
        <span>A Hugging Face model</span>
        <input type="text" list="local-ai-models" spellcheck="false" autocomplete="off" placeholder="owner/name, or owner/name/file.gguf"
          :value="prefs.model ?? ''" @change="(e) => update({ model: (e.target as HTMLInputElement).value.trim() })" />
      </label>
    </template>
    <template v-else>
      <label class="field">
        <span>A model the mesh keeps</span>
        <select :value="prefs.model ?? ''" @change="(e) => update({ model: (e.target as HTMLSelectElement).value })">
          <option value="" disabled>Pick one</option>
          <option v-for="m in meshModels" :key="m.ref" :value="m.ref">{{ m.name }}</option>
        </select>
      </label>
      <p class="hint">Downloaded from the peers and PigeonFS that keep it. Costs PigeonSeed (coming soon): free for now.</p>
    </template>
    <datalist id="local-ai-models">
      <option v-for="m in meshModels" :key="m.ref" :value="m.ref">{{ m.name }}</option>
    </datalist>

    <label class="check">
      <input type="checkbox" :checked="prefs.offer === true" @change="(e) => update({ offer: (e.target as HTMLInputElement).checked, ...((e.target as HTMLInputElement).checked ? {} : { keepOnPigeonFS: false }) })" />
      <span>Offer it to other players, from this device (free; you earn PigeonSeed when they download it, coming soon)</span>
    </label>
    <label class="check" :class="{ off: !prefs.offer }">
      <input type="checkbox" :disabled="!prefs.offer" :checked="prefs.keepOnPigeonFS === true" @change="(e) => update({ keepOnPigeonFS: (e.target as HTMLInputElement).checked })" />
      <span>Also keep it on PigeonFS, so they can get it while this device is away (costs PigeonSeed, coming soon)</span>
    </label>

    <p v-if="loaded" class="engine-status" :class="{ ready: pigeonAI.ready.value }">
      <PigeonAIStatus :text="pigeonAI.status.value" :progress="pigeonAI.progress.value" :ready="pigeonAI.ready.value" :paused="pigeonAI.paused.value" />
    </p>
    <!-- Before a download: its size, and a yes (once per model on this device). -->
    <div v-if="asking" class="ask" role="alertdialog" aria-label="Download the model?">
      <p>
        Loading {{ asking.name }} downloads <b>{{ asking.size }}</b> (whatever of it isn't on this device yet), from
        peers, PigeonFS or Hugging Face. On a phone hotspot or a metered connection, that comes out of your data.
      </p>
      <div class="ask-row">
        <button class="btn" @click="asking = null">Cancel</button>
        <button class="btn btn-go" @click="download">Download</button>
      </div>
    </div>
    <p v-if="deviceOnly && prefs.source !== 'file'" class="hint">
      Settings → PigeonAI says to use only what's on this device: this loads only if the model was loaded here before.
    </p>
    <div class="row">
      <button v-if="!loaded || !pigeonAI.ready.value" class="btn btn-wide" :disabled="!canLoad || !!asking" @click="load">
        {{ loaded ? 'Load again' : 'Load on this device' }}
      </button>
      <button v-else class="btn btn-go btn-wide" @click="$emit('start')">Start against Local AI</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PigeonAIStatus from './PigeonAIStatus.vue'
import { usePigeonAI, localModelName, modelDownloadSize, type LocalAIPrefs } from '@/composables/usePigeonAI'

const props = defineProps<{ prefs: LocalAIPrefs; deviceOnly?: boolean }>()
const emit = defineEmits<{ update: [prefs: LocalAIPrefs]; load: [file?: File]; start: [] }>()
const pigeonAI = usePigeonAI()

const sources = [
  { id: 'file' as const, label: 'From my drive' },
  { id: 'hf' as const, label: 'Hugging Face' },
  { id: 'mesh' as const, label: 'From the mesh' },
]
/** Models the mesh keeps (PigeonFS and the peers that offer them). */
const meshModels = [
  { ref: 'LiquidAI/LFM3-1.7B-GGUF/LFM3-1.7B-Q8_0.gguf', name: "Liquid AI's LFM3" },
  { ref: 'prism-ml/Bonsai-1.7B-gguf/Bonsai-1.7B-Q1_0.gguf', name: 'The 1-bit Bonsai' },
]
/** The file chosen this visit (a File can't be kept: chosen again after a reload). */
const file = ref<File | null>(null)
const loaded = computed(() => pigeonAI.mode.value === 'local')
const canLoad = computed(() => !!props.prefs.model && (props.prefs.source !== 'file' || !!file.value))

const update = (patch: Partial<LocalAIPrefs>) => emit('update', { ...props.prefs, ...patch })

/** Models this device's player said yes to downloading (asked once per model). */
const OK_KEY = 'pigeonai:download-ok'
const okd = (): string[] => { try { return JSON.parse(localStorage.getItem(OK_KEY) || '[]') } catch { return [] } }
const asking = ref<{ name: string; size: string } | null>(null)
const load = async () => {
  const model = props.prefs.model
  // A file from the drive downloads nothing; nor does "only what's on this device"; nor a model said yes to.
  if (props.prefs.source === 'file' || props.deviceOnly || !model || okd().includes(model)) { emit('load', file.value ?? undefined); return }
  const name = meshModels.find((m) => m.ref === model)?.name ?? model.split('/').slice(0, 2).join('/')
  asking.value = { name, size: 'checking the size…' }
  const bytes = await modelDownloadSize(model)
  if (asking.value) asking.value = { name, size: bytes ? `${(bytes / 1e9).toFixed(2)} GB` : 'the model (its size is unknown: usually 1 to 2 GB)' }
}
const download = () => {
  const model = props.prefs.model
  if (model) try { localStorage.setItem(OK_KEY, JSON.stringify([...new Set([...okd(), model])])) } catch { /* asked again next time */ }
  asking.value = null
  emit('load', file.value ?? undefined)
}
const setSource = (source: LocalAIPrefs['source']) => {
  if (source === props.prefs.source) return
  file.value = null
  update({ source, model: undefined, name: undefined })
}
const pickFile = async (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  file.value = f
  update({ model: await localModelName(f), name: f.name })
}
</script>

<style scoped>
/* The Computer panel's own look (App.vue's styles don't reach a component). */
.local-ai { display: flex; flex-direction: column; gap: 0.5rem; }
.engine-note { margin: 0; color: var(--ink-2); font-size: 0.9rem; line-height: 1.45; }
.engine-status { margin: 0; font-size: 0.85rem; color: var(--ink-2); }
.engine-status.ready { color: var(--ink); font-weight: 700; }
.mode-toggle { display: grid; grid-template-columns: repeat(3, 1fr); padding: 3px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) + 3px); background: var(--surface); }
.mode-option { padding: 0.5rem 0.3rem; border-radius: var(--radius); font-weight: 700; font-size: 0.85rem; color: var(--ink-2); transition: background 0.15s, color 0.15s; }
.mode-option:hover:not(.picked) { color: var(--ink); }
.mode-option.picked { background: var(--ink); color: var(--paper); }
.btn { padding: 0.8rem 1rem; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); font-weight: 600; font-size: 1rem; width: 100%; }
.btn:hover:not(:disabled) { border-color: var(--ink-2); }
.btn:disabled { opacity: 0.45; }
.btn-go { background: var(--sheen); border-color: var(--sheen); color: var(--on-sheen); }
.btn-go:hover:not(:disabled) { background: var(--sheen-deep); border-color: var(--sheen-deep); }
.source-pick { margin: 0.1rem 0; }
.field { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.5rem 0; }
.field input, .field select { max-width: 100%; }
.hint { font-size: 0.85rem; opacity: 0.8; margin: 0.2rem 0 0.5rem; overflow-wrap: anywhere; }
.check { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.45rem 0; font-size: 0.9rem; line-height: 1.35; }
.check.off { opacity: 0.55; }
.row { display: flex; margin-top: 0.6rem; }
.ask { border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 0.7rem 0.8rem; background: var(--surface); }
.ask p { margin: 0 0 0.6rem; font-size: 0.9rem; line-height: 1.4; }
.ask-row { display: flex; gap: 0.5rem; }
.ask-row .btn { padding: 0.55rem 0.8rem; }
</style>
