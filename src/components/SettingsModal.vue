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
        <h3>Network Name</h3>
        <p class="description">The network namespace for game isolation.</p>
        <input 
          type="text" 
          v-model="settings.networkName"
          placeholder="Network name"
        />
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
import type { Settings } from '@/types'

interface Props {
  settings: Settings
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  reset: []
  addUrl: [url: string]
  removeUrl: [url: string]
}>()

const newUrl = ref('')

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

.actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}
</style>
