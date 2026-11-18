<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div class="settings-bar">
        <h2 id="settings-title">Settings</h2>
        <div class="actions">
          <button class="secondary" @click="reset">Restore defaults</button>
          <button class="primary" @click="$emit('close')">Done</button>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Signaling relays</h3>
        <p class="description">Where your browser first finds other players. The first relay you list is asked for the others, and the room settles on the best ones automatically.</p>
        
        <div class="url-list">
          <div v-for="(url, index) in settings.signalingUrls" :key="index" class="url-item">
            <input 
              type="text" 
              v-model="settings.signalingUrls[index]"
              placeholder="wss://peer.ooo/ws"
              :disabled="isUrlMuted(url)"
            />
            <button
              class="secondary"
              @click="toggleMuteUrl(url)"
            >
              {{ isUrlMuted(url) ? 'Use' : 'Skip' }}
            </button>
            <button 
              class="danger"
              @click="removeUrl(url)"
              :disabled="settings.signalingUrls.length <= 1"
            >
              Remove
            </button>
          </div>
        </div>
        
        <div class="add-url">
          <input 
            type="text" 
            v-model="newUrl"
            placeholder="wss://relay.example/ws"
            @keyup.enter="addUrl"
          />
          <button class="secondary" @click="addUrl">Add relay</button>
        </div>

        <div class="presets">
          <button class="secondary" @click="usePigeonhobbsTo">Reset to peer.ooo</button>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Sound</h3>
        <label class="check">
          <input 
            type="checkbox" 
            :checked="settings.soundEnabled !== false"
            @change="toggleSound"
          />
          <span>Play sounds for moves and captures</span>
        </label>
      </div>

      <div class="settings-section">
        <h3>When you pick Any</h3>
        <label class="check">
          <span>Play</span>
          <select class="any-select" :value="settings.anyTimeControl || 'rapid10'" @change="(e) => { settings.anyTimeControl = (e.target as HTMLSelectElement).value }">
            <option v-for="tc in anyChoices" :key="tc.id" :value="tc.id">{{ tc.minutes === 0 ? 'No clock' : `${tc.display} ${tc.name.toLowerCase()}` }}</option>
          </select>
        </label>
        <p class="description">Any plays whatever clock your opponent picked. When you both picked Any, whoever started looking first decides, with this setting.</p>
      </div>

      <div class="settings-section">
        <h3>Notifications</h3>
        <label class="check">
          <input
            type="checkbox"
            :checked="notificationsOn"
            :disabled="!notificationsAvailable"
            @change="(e) => emit('toggleNotifications', (e.target as HTMLInputElement).checked)"
          />
          <span>Tell me when it's my move or a game starts while I'm away</span>
        </label>
        <p class="description" v-if="!notificationsAvailable">This browser can't show notifications here. On an iPhone or iPad, add PigeonChess to your Home Screen first.</p>
        <p class="description" v-else>{{ notificationsStatus }}</p>
        <div v-if="notificationsAvailable && notificationsOn" class="presets">
          <button class="secondary" @click="emit('testNotification')">Send me a test notification</button>
          <span class="description">{{ notificationsTestResult }}</span>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Network</h3>
        <p class="description">Only players on the same network name can find each other. Leave it as global to play anyone.</p>
        <input 
          type="text" 
          v-model="settings.networkName"
          placeholder="Network name"
        />
      </div>

      <div v-if="pigeonAI.here" class="settings-section">
        <h3>PigeonAI</h3>
        <p class="description">
          PigeonAI runs on the <b>{{ aiNet.network }}</b> network, room <b>{{ aiNet.room }}</b><template v-if="pigeonAI.modelName.value">, with {{ pigeonAI.modelName.value }}</template>.
          <template v-if="!aiNet.own"> On global its model is set by the PigeonAI server. To pick your own, change Network above (your PigeonAI network is then that network's).</template>
        </p>
        <label class="ai-model">
          <span>Room</span>
          <input type="text" spellcheck="false" autocomplete="off" placeholder="global"
            :value="settings.pigeonAIRoom ?? ''"
            @change="(e) => { settings.pigeonAIRoom = (e.target as HTMLInputElement).value.trim() }" />
        </label>
        <p class="description">Devices in the same room share the model and its work. Empty: global.</p>
        <template v-if="aiNet.own">
          <label class="ai-model">
            <span>Model</span>
            <input type="text" list="pigeonai-models" spellcheck="false" autocomplete="off"
              :value="settings.pigeonAIModel ?? ''"
              @change="(e) => { settings.pigeonAIModel = (e.target as HTMLInputElement).value.trim() }"
              placeholder="The network's model, or one from Hugging Face" />
          </label>
          <datalist id="pigeonai-models">
            <option value="LiquidAI/LFM3-1.7B-GGUF/LFM3-1.7B-Q8_0.gguf">Liquid AI's LFM3</option>
            <option value="prism-ml/Bonsai-1.7B-unpacked">The 1-bit Bonsai</option>
            <option value="prism-ml/Bonsai-1.7B-gguf/Bonsai-1.7B-Q1_0.gguf">The 1-bit Bonsai (GGUF)</option>
          </datalist>
          <p class="description">A Hugging Face model (owner/name, or owner/name/file.gguf). Picking one makes it this network's model: other players on {{ settings.networkName }} switch to it. Empty: whatever the network runs.</p>
          <label class="ai-model">
            <span>Sharing</span>
            <select :value="settings.pigeonAIShareRule ?? 'optional'" @change="(e) => { settings.pigeonAIShareRule = (e.target as HTMLSelectElement).value as 'required' | 'optional' | 'off' }">
              <option value="optional">Optional: players may lend a share or pay</option>
              <option value="required">Required: every player lends a share</option>
              <option value="off">Off: no shares; only whole copies serve</option>
            </select>
          </label>
          <p class="description">Set with the model above, for everyone on {{ settings.networkName }}.</p>
        </template>
        <div class="ai-share" role="radiogroup" aria-label="How you take part">
          <span class="ai-share-head">How you take part in {{ aiNet.network }} / {{ aiNet.room }}</span>
          <label class="check">
            <input type="radio" name="pigeonai-share" :checked="shareNow === 'lend'" @change="setShare('lend')" />
            <span>Lend a share of this device: it holds part of the model on its GPU and earns PigeonSeed for the work it does for others (coming soon)</span>
          </label>
          <label class="check">
            <input type="radio" name="pigeonai-share" :checked="shareNow === 'pay'" :disabled="!payAllowed" @change="setShare('pay')" />
            <span>Pay to play: nothing runs on this device; you pay the players who lend in PigeonSeed (coming soon)<template v-if="!payAllowed">. Not on {{ aiNet.network }}: every player lends a share.</template></span>
          </label>
          <label class="check">
            <input type="radio" name="pigeonai-share" :checked="!shareNow" @change="setShare(null)" />
            <span>Not taking part: PigeonAI doesn't run on this device (Local AI still can)</span>
          </label>
        </div>
        <p class="description earned">PigeonSeed earned (not live yet): {{ pigeonAI.earned.value.passes.toLocaleString() }} stage passes run for other players, {{ (pigeonAI.earned.value.bytes / 1e6).toFixed(0) }} MB of models sent to them.</p>
        <template v-if="aiNet.own">
        <label class="check">
          <input type="checkbox" :disabled="!aiNet.own" :checked="aiNet.own && settings.pigeonAIServeWhole === true" @change="(e) => { settings.pigeonAIServeWhole = (e.target as HTMLInputElement).checked }" />
          <span>Keep the whole model on this device and serve it to the others</span>
        </label>
        <p class="description" v-if="!aiNet.own">Serving the whole model is for networks of your own; on global the PigeonAI server does it.</p>
        <p class="description" v-else>The others then load it all from here, as well as from each other. It takes the model's whole download and its room on this device.</p>
        </template>
        <p class="description">Applied when you press Done.</p>
      </div>
      
      <div class="settings-section">
        <h3>Board</h3>
        <div class="theme-grid">
          <div 
            v-for="theme in boardThemes" 
            :key="theme.id"
            class="theme-option"
            :class="{ active: settings.boardTheme === theme.id }"
            @click="selectTheme(theme.id)"
          >
            <div class="theme-preview">
              <div 
                class="theme-square light" 
                :style="theme.id === 'custom' 
                  ? { background: 'repeating-linear-gradient(45deg, #bee6ee 0 4px, #e8f6f9 4px 8px)' }
                  : { backgroundColor: theme.id === 'custom' && customLightSquare ? customLightSquare : theme.light }"
              ></div>
              <div 
                class="theme-square dark" 
                :style="theme.id === 'custom'
                  ? { background: 'repeating-linear-gradient(45deg, #5a7187 0 4px, #8aa7b3 4px 8px)' }
                  : { backgroundColor: theme.id === 'custom' && customDarkSquare ? customDarkSquare : theme.dark }"
              ></div>
            </div>
            <span class="theme-name">{{ theme.name }}</span>
          </div>
        </div>
        
        <!-- Custom Color Pickers -->
        <div v-if="settings.boardTheme === 'custom'" class="custom-colors">
          <div class="color-picker-group">
            <label>
              Light squares
              <input 
                type="color" 
                v-model="customLightSquare"
                @input="updateCustomColors"
              />
              <span class="color-value">{{ customLightSquare }}</span>
            </label>
          </div>
          <div class="color-picker-group">
            <label>
              Dark squares
              <input 
                type="color" 
                v-model="customDarkSquare"
                @input="updateCustomColors"
              />
              <span class="color-value">{{ customDarkSquare }}</span>
            </label>
          </div>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Pieces</h3>
        <div class="theme-grid">
          <div 
            v-for="theme in pieceThemes" 
            :key="theme.id"
            class="theme-option"
            :class="{ active: settings.pieceTheme === theme.id }"
            @click="selectPieceTheme(theme.id)"
          >
            <div class="theme-preview">
              <div 
                class="theme-square light" 
                :style="theme.id === 'custom'
                  ? { background: 'repeating-linear-gradient(45deg, #bee6ee 0 4px, #e8f6f9 4px 8px)' }
                  : { backgroundColor: theme.whiteFill, border: `3px solid ${theme.whiteStroke}` }"
              ></div>
              <div 
                class="theme-square dark" 
                :style="theme.id === 'custom'
                  ? { background: 'repeating-linear-gradient(45deg, #5a7187 0 4px, #8aa7b3 4px 8px)' }
                  : { backgroundColor: theme.blackFill, border: `3px solid ${theme.blackStroke}` }"
              ></div>
            </div>
            <span class="theme-name">{{ theme.name }}</span>
          </div>
        </div>
        
        <!-- Custom Piece Color Pickers -->
        <div v-if="settings.pieceTheme === 'custom'" class="custom-colors">
          <div class="color-picker-group">
            <label>
              White pieces
              <input 
                type="color" 
                v-model="customWhitePieceColor"
                @input="updatePieceColors"
              />
              <span class="color-value">{{ customWhitePieceColor }}</span>
            </label>
          </div>
          <div class="color-picker-group">
            <label>
              Black pieces
              <input 
                type="color" 
                v-model="customBlackPieceColor"
                @input="updatePieceColors"
              />
              <span class="color-value">{{ customBlackPieceColor }}</span>
            </label>
          </div>
        </div>
        <div v-if="settings.pieceTheme === 'custom'" class="custom-colors" style="margin-top: 1rem;">
          <div class="color-picker-group">
            <label>
              White outline
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input 
                  type="color" 
                  v-model="customWhitePieceOutline"
                  @input="updatePieceOutlines"
                />
                <input 
                  type="text" 
                  v-model="customWhitePieceOutline"
                  @input="updatePieceOutlines"
                  placeholder="#000000"
                  style="width: 100px;"
                />
              </div>
            </label>
          </div>
          <div class="color-picker-group">
            <label>
              Black outline
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input 
                  type="color" 
                  v-model="customBlackPieceOutline"
                  @input="updatePieceOutlines"
                />
                <input 
                  type="text" 
                  v-model="customBlackPieceOutline"
                  @input="updatePieceOutlines"
                  placeholder="#ffffff"
                  style="width: 100px;"
                />
              </div>
            </label>
          </div>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Arrows</h3>
        <p class="description">Colours for arrows you draw with a right-click drag.</p>
        <div class="custom-colors">
          <div class="color-picker-group">
            <label>
              From white pieces
              <input 
                type="color" 
                v-model="whiteArrowColor"
                @input="updateArrowColors"
              />
              <span class="color-value">{{ whiteArrowColor }}</span>
            </label>
          </div>
          <div class="color-picker-group">
            <label>
              From black pieces
              <input 
                type="color" 
                v-model="blackArrowColor"
                @input="updateArrowColors"
              />
              <span class="color-value">{{ blackArrowColor }}</span>
            </label>
          </div>
          <div class="color-picker-group">
            <label>
              From empty squares
              <input 
                type="color" 
                v-model="emptyArrowColor"
                @input="updateArrowColors"
              />
              <span class="color-value">{{ emptyArrowColor }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Settings, BoardTheme, PieceTheme } from '@/types'
import { usePigeonAI, pigeonAINetwork } from '@/composables/usePigeonAI'

interface Props {
  settings: Settings
  boardThemes: BoardTheme[]
  pieceThemes: PieceTheme[]
  notificationsOn?: boolean
  notificationsAvailable?: boolean
  notificationsStatus?: string
  notificationsTestResult?: string
  timeControls?: { id: string; name: string; display: string; minutes: number; increment: number }[]
}

const props = defineProps<Props>()
const pigeonAI = usePigeonAI()
/** PigeonAI's network for the chess network typed above. */
const aiNet = computed(() => pigeonAINetwork(props.settings.networkName || 'global', props.settings.pigeonAIRoom || 'global'))
/** How this device's player takes part on that network and room. */
const shareKey = computed(() => `${aiNet.value.network}/${aiNet.value.room}`)
const shareNow = computed(() => props.settings.pigeonAIShare?.[shareKey.value])
/** Paying instead of lending: not on a network that asks every player to share (global's, or one whose rule says so). */
const payAllowed = computed(() => aiNet.value.own && (pigeonAI.networkName.value === aiNet.value.network ? pigeonAI.shareRule.value : props.settings.pigeonAIShareRule ?? 'optional') !== 'required')
const setShare = (how: 'lend' | 'pay' | null) => {
  const next = { ...(props.settings.pigeonAIShare ?? {}) }
  if (how) next[shareKey.value] = how; else delete next[shareKey.value]
  props.settings.pigeonAIShare = next
}
const anyChoices = computed(() => (props.timeControls ?? []).filter((tc) => tc.id !== 'any'))
const emit = defineEmits<{
  close: []
  reset: []
  addUrl: [url: string]
  removeUrl: [url: string]
  selectTheme: [themeId: string]
  selectPieceTheme: [themeId: string]
  updateCustomColors: [lightSquare: string, darkSquare: string]
  updatePieceColors: [whiteColor: string, blackColor: string]
  updatePieceOutlines: [whiteOutline: string, blackOutline: string]
  updateArrowColors: [whiteArrow: string, blackArrow: string, emptyArrow: string]
  toggleSound: [enabled: boolean]
  toggleNotifications: [enabled: boolean]
  testNotification: []
}>()

const newUrl = ref('')
const customLightSquare = ref(props.settings.customLightSquare || '#f0d9b5')
const customDarkSquare = ref(props.settings.customDarkSquare || '#b58863')
const customWhitePieceColor = ref(props.settings.customWhitePieceColor || '#ffffff')
const customBlackPieceColor = ref(props.settings.customBlackPieceColor || '#000000')
const customWhitePieceOutline = ref(props.settings.customWhitePieceOutline || '#000000')
const customBlackPieceOutline = ref(props.settings.customBlackPieceOutline || '#ffffff')
const whiteArrowColor = ref(props.settings.whiteArrowColor || '#ffaa00')
const blackArrowColor = ref(props.settings.blackArrowColor || '#ffaa00')
const emptyArrowColor = ref(props.settings.emptyArrowColor || '#ffaa00')

// Watch for settings changes to update arrow color refs
watch(() => props.settings.whiteArrowColor, (newVal) => {
  whiteArrowColor.value = newVal || '#ffaa00'
})
watch(() => props.settings.blackArrowColor, (newVal) => {
  blackArrowColor.value = newVal || '#ffaa00'
})
watch(() => props.settings.emptyArrowColor, (newVal) => {
  emptyArrowColor.value = newVal || '#ffaa00'
})

const addUrl = () => {
  if (newUrl.value.trim()) {
    emit('addUrl', newUrl.value.trim())
    newUrl.value = ''
  }
}

const removeUrl = (url: string) => {
  emit('removeUrl', url)
}

const reset = () => {
  emit('reset')
}

const selectTheme = (themeId: string) => {
  emit('selectTheme', themeId)
}

const selectPieceTheme = (themeId: string) => {
  emit('selectPieceTheme', themeId)
}

const updateCustomColors = () => {
  emit('updateCustomColors', customLightSquare.value, customDarkSquare.value)
}

const updatePieceColors = () => {
  emit('updatePieceColors', customWhitePieceColor.value, customBlackPieceColor.value)
}

const updatePieceOutlines = () => {
  emit('updatePieceOutlines', customWhitePieceOutline.value, customBlackPieceOutline.value)
}

const updateArrowColors = () => {
  emit('updateArrowColors', whiteArrowColor.value, blackArrowColor.value, emptyArrowColor.value)
}

const toggleSound = (event: Event) => {
  const enabled = (event.target as HTMLInputElement).checked
  emit('toggleSound', enabled)
}

const usePigeonhobbsTo = () => {
  props.settings.signalingUrls = ['wss://peer.ooo/ws']
  props.settings.mutedSignalingUrls = []
}

const isUrlMuted = (url: string) => {
  return (props.settings.mutedSignalingUrls || []).includes(url)
}

const toggleMuteUrl = (url: string) => {
  const current = props.settings.mutedSignalingUrls || []
  if (current.includes(url)) {
    props.settings.mutedSignalingUrls = current.filter(u => u !== url)
  } else {
    props.settings.mutedSignalingUrls = [...current, url]
  }
}
</script>

<style scoped>
.settings-modal {
  width: min(100%, 600px);
}

.settings-section {
  padding: 1.1rem 0;
  border-top: 1px solid var(--line);
}

.ai-share { display: flex; flex-direction: column; gap: 0.2rem; margin: 0.8rem 0 0.3rem; }
.ai-share-head { font-weight: 600; font-size: 0.9rem; }
.earned { font-variant-numeric: tabular-nums; }
.ai-model { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
.ai-model input, .ai-model select { flex: 1; min-width: 0; }
.settings-section h3 {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}

.description {
  color: var(--ink-2);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
  max-width: 60ch;
}

.url-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.url-item,
.add-url {
  display: flex;
  gap: 0.4rem;
}

.url-item input,
.add-url input {
  flex: 1;
  min-width: 0;
}

.url-item input:disabled {
  color: var(--line-strong);
  text-decoration: line-through;
}

.presets {
  margin-top: 0.5rem;
}

.any-select {
  min-width: 10rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 0.5rem;
}

.theme-option {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.45rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  background: var(--surface);
}

.theme-option:hover {
  border-color: var(--ink-2);
}

.theme-option.active {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.theme-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 34px;
  border-radius: 3px;
  overflow: hidden;
}

.theme-square {
  width: 100%;
  height: 100%;
}

.theme-name {
  font-size: 0.8rem;
  font-weight: 600;
}

.custom-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.75rem;
}

.color-picker-group label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.color-picker-group input[type='color'] {
  width: 56px;
  cursor: pointer;
}

.color-value {
  font-size: 0.75rem;
  color: var(--ink-2);
  font-weight: 400;
}

/* Title and buttons stay at the top while the settings scroll under them. */
.settings-bar {
  position: sticky;
  top: -1.5rem;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: -1.5rem -1.5rem 0;
  padding: 0.75rem 1rem 0.75rem 1.5rem;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.settings-bar h2 {
  margin: 0;
}

.settings-bar + .settings-section {
  border-top: 0;
}

.actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.actions button {
  white-space: nowrap;
  min-height: 44px;
  padding: 0.5rem 0.85rem;
}

@media (max-width: 420px) {
  .settings-bar {
    padding-left: 1.1rem;
    padding-right: 0.75rem;
  }

  .actions button {
    padding: 0.5rem 0.65rem;
    font-size: 0.95rem;
  }
}

@media (max-width: 480px) {
  .url-item {
    flex-wrap: wrap;
  }

  .url-item input {
    flex-basis: 100%;
  }
}
</style>
