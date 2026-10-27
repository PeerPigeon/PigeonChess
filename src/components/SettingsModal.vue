<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      
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
        <h3>Network</h3>
        <p class="description">Only players on the same network name can find each other. Leave it as global to play anyone.</p>
        <input 
          type="text" 
          v-model="settings.networkName"
          placeholder="Network name"
        />
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
                  ? { background: 'repeating-linear-gradient(45deg, #d6dce0 0 4px, #f6f7f8 4px 8px)' }
                  : { backgroundColor: theme.id === 'custom' && customLightSquare ? customLightSquare : theme.light }"
              ></div>
              <div 
                class="theme-square dark" 
                :style="theme.id === 'custom'
                  ? { background: 'repeating-linear-gradient(45deg, #6e7f8d 0 4px, #9aa6af 4px 8px)' }
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
                  ? { background: 'repeating-linear-gradient(45deg, #d6dce0 0 4px, #f6f7f8 4px 8px)' }
                  : { backgroundColor: theme.whiteFill, border: `3px solid ${theme.whiteStroke}` }"
              ></div>
              <div 
                class="theme-square dark" 
                :style="theme.id === 'custom'
                  ? { background: 'repeating-linear-gradient(45deg, #6e7f8d 0 4px, #9aa6af 4px 8px)' }
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
      
      <div class="actions">
        <button class="secondary" @click="reset">Restore defaults</button>
        <button class="primary" @click="$emit('close')">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Settings, BoardTheme, PieceTheme } from '@/types'

interface Props {
  settings: Settings
  boardThemes: BoardTheme[]
  pieceThemes: PieceTheme[]
}

const props = defineProps<Props>()
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

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
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
