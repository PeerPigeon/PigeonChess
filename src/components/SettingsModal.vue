<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal settings-modal">
      <h2>Settings</h2>
      
      <div class="settings-section">
        <h3>Signaling Servers (PigeonHub URIs)</h3>
        <p class="description">Configure the WebSocket URLs for peer discovery and signaling.</p>
        
        <div class="url-list">
          <div v-for="(url, index) in settings.signalingUrls" :key="index" class="url-item">
            <input 
              type="text" 
              v-model="settings.signalingUrls[index]"
              placeholder="wss://example.com"
            />
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
            placeholder="Add new signaling URL"
            @keyup.enter="addUrl"
          />
          <button class="success" @click="addUrl">Add URL</button>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Sound Effects</h3>
        <p class="description">Enable or disable game sound effects.</p>
        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
          <input 
            type="checkbox" 
            :checked="settings.soundEnabled !== false"
            @change="toggleSound"
            style="width: 20px; height: 20px; cursor: pointer;"
          />
          <span>Enable sound effects</span>
        </label>
      </div>
      
      <div class="settings-section">
        <h3>Network Name</h3>
        <p class="description">The network namespace for game isolation.</p>
        <input 
          type="text" 
          v-model="settings.networkName"
          placeholder="Network name"
        />
      </div>
      
      <div class="settings-section">
        <h3>Board Theme</h3>
        <p class="description">Choose your preferred board color scheme.</p>
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
                  ? { background: 'linear-gradient(135deg, #ff0000 0%, #ff7f00 16%, #ffff00 33%, #00ff00 50%, #0000ff 66%, #4b0082 83%, #9400d3 100%)' }
                  : { backgroundColor: theme.id === 'custom' && customLightSquare ? customLightSquare : theme.light }"
              ></div>
              <div 
                class="theme-square dark" 
                :style="theme.id === 'custom'
                  ? { background: 'linear-gradient(135deg, #9400d3 0%, #4b0082 16%, #0000ff 33%, #00ff00 50%, #ffff00 66%, #ff7f00 83%, #ff0000 100%)' }
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
              Light Squares
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
              Dark Squares
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
        <h3>Piece Colors</h3>
        <p class="description">Choose your preferred piece color scheme.</p>
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
                  ? { background: 'linear-gradient(135deg, #ff0000 0%, #ff7f00 16%, #ffff00 33%, #00ff00 50%, #0000ff 66%, #4b0082 83%, #9400d3 100%)' }
                  : { backgroundColor: theme.whiteFill, border: `3px solid ${theme.whiteStroke}` }"
              ></div>
              <div 
                class="theme-square dark" 
                :style="theme.id === 'custom'
                  ? { background: 'linear-gradient(135deg, #9400d3 0%, #4b0082 16%, #0000ff 33%, #00ff00 50%, #ffff00 66%, #ff7f00 83%, #ff0000 100%)' }
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
              White Pieces Fill
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
              Black Pieces Fill
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
              White Pieces Outline
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
                  style="width: 100px; font-family: monospace;"
                />
              </div>
            </label>
          </div>
          <div class="color-picker-group">
            <label>
              Black Pieces Outline
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
                  style="width: 100px; font-family: monospace;"
                />
              </div>
            </label>
          </div>
        </div>
      </div>
      
      <div class="actions">
        <button class="secondary" @click="reset">Reset to Defaults</button>
        <button class="primary" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
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
  toggleSound: [enabled: boolean]
}>()

const newUrl = ref('')
const customLightSquare = ref(props.settings.customLightSquare || '#f0d9b5')
const customDarkSquare = ref(props.settings.customDarkSquare || '#b58863')
const customWhitePieceColor = ref(props.settings.customWhitePieceColor || '#ffffff')
const customBlackPieceColor = ref(props.settings.customBlackPieceColor || '#000000')
const customWhitePieceOutline = ref(props.settings.customWhitePieceOutline || '#000000')
const customBlackPieceOutline = ref(props.settings.customBlackPieceOutline || '#ffffff')

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

const toggleSound = (event: Event) => {
  const enabled = (event.target as HTMLInputElement).checked
  emit('toggleSound', enabled)
}
</script>

<style scoped>
.settings-modal {
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

h2 {
  margin-bottom: 1.5rem;
  color: var(--dark-color);
}

.settings-section {
  margin-bottom: 2rem;
}

.settings-section h3 {
  margin-bottom: 0.5rem;
  color: var(--dark-color);
  font-size: 1.1rem;
}

.description {
  font-size: 0.9rem;
  color: var(--secondary-color);
  margin-bottom: 1rem;
}

.url-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.url-item {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.url-item input {
  flex: 1;
}

.add-url {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.add-url input {
  flex: 1;
}

input {
  width: 100%;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin-top: 0.5rem;
}

.theme-option {
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  background: #f8fafc;
}

.theme-option:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.theme-option.active {
  border-color: var(--primary-color);
  background: #eff6ff;
}

.theme-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  overflow: hidden;
  height: 60px;
}

.theme-square {
  width: 100%;
  height: 100%;
}

.theme-name {
  display: block;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
}

.custom-colors {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
  display: flex;
  gap: 1rem;
}

.color-picker-group {
  flex: 1;
}

.color-picker-group label {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-weight: 500;
  font-size: 0.875rem;
}

.color-picker-group input[type="color"] {
  width: 100%;
  height: 50px;
  border: 2px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  padding: 4px;
}

.color-picker-group input[type="color"]:hover {
  border-color: var(--primary-color);
}

.color-value {
  font-family: monospace;
  font-size: 0.875rem;
  color: #64748b;
  text-align: center;
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}
</style>
