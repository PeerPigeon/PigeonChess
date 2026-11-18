<template>
  <!-- The lobby's chat, for this room: closed until opened (a dot for what came meanwhile). -->
  <section class="lobby-chat" :class="{ open: chat.open.value }">
    <button class="chat-toggle" :aria-expanded="chat.open.value" @click="setChatOpen(!chat.open.value)">
      <span>Chat in {{ room }}</span>
      <span v-if="chat.unread.value" class="dot" :aria-label="`${chat.unread.value} new`">{{ chat.unread.value > 9 ? '9+' : chat.unread.value }}</span>
      <span class="chevron" aria-hidden="true">{{ chat.open.value ? '▴' : '▾' }}</span>
    </button>
    <div v-if="chat.open.value" class="chat-body">
      <ol ref="list" class="chat-list" aria-live="polite">
        <li v-if="!chat.messages.value.length" class="empty">Nobody has said anything here yet. Say hello, or ask for a game. Mention PigeonAI to get an answer from it.</li>
        <li v-for="m in chat.messages.value" :key="m.key" :class="{ mine: m.signer === me, bot: !!m.bot }">
          <span class="who">{{ m.bot ? `${m.bot}` : m.name }}<small v-if="m.bot"> via {{ m.name }}</small></span>
          <span class="when">{{ time(m.at) }}</span>
          <button v-if="m.signer !== me" class="mute" :title="`Mute ${m.name}: their messages are hidden on this device`" @click="muteInChat(m.signer)">Mute</button>
          <p class="text">{{ m.text }}</p>
        </li>
      </ol>
      <form class="chat-form" @submit.prevent="send">
        <input v-model="draft" type="text" maxlength="300" :placeholder="`Message ${room}`" aria-label="Message" autocomplete="off" />
        <button class="send" type="submit" :disabled="!draft.trim()">Send</button>
      </form>
      <p v-if="note || props.note" class="note">{{ note || props.note }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useLobbyChat, sendLobbyChat, muteInChat, setChatOpen } from '@/composables/useLobbyChat'

const props = defineProps<{ room: string; name: string; note?: string }>()
const emit = defineEmits<{ sent: [text: string] }>()
const chat = useLobbyChat()
const me = computed(() => chat.signer())
const draft = ref('')
const note = ref('')
const list = ref<HTMLOListElement | null>(null)

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const send = async () => {
  const text = draft.value
  note.value = ''
  const why = await sendLobbyChat(text, props.name).catch((e: Error) => e.message)
  if (why) { note.value = `Not sent: ${why}.`; return }
  draft.value = ''
  emit('sent', text)
}
// The newest at the bottom, in view.
watch(() => [chat.messages.value.length, chat.open.value], async () => {
  await nextTick()
  if (list.value) list.value.scrollTop = list.value.scrollHeight
})
</script>

<style scoped>
.lobby-chat { border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); }
.chat-toggle { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.6rem 0.8rem; font-weight: 700; color: var(--ink); background: transparent; border: 0; text-align: left; }
.chat-toggle span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { min-width: 1.3rem; padding: 0 0.35rem; border-radius: 999px; background: var(--sheen); color: var(--on-sheen); font-size: 0.75rem; text-align: center; }
.chevron { color: var(--ink-2); }
.chat-body { border-top: 1px solid var(--line); padding: 0.5rem 0.8rem 0.7rem; }
.chat-list { list-style: none; margin: 0; padding: 0; max-height: 16rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; }
.chat-list li { display: grid; grid-template-columns: auto auto 1fr; align-items: baseline; gap: 0 0.4rem; font-size: 0.9rem; }
.chat-list .empty { display: block; color: var(--ink-2); font-size: 0.85rem; }
.who { font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
.who small { font-weight: 400; color: var(--ink-2); }
.bot .who { color: var(--sheen-deep, var(--ink)); }
.when { font-size: 0.75rem; color: var(--ink-2); }
.mute { justify-self: end; font-size: 0.75rem; color: var(--ink-2); background: transparent; border: 0; padding: 0; opacity: 0; }
.chat-list li:hover .mute, .mute:focus { opacity: 1; }
@media (hover: none) { .mute { opacity: 0.7; } }
.text { grid-column: 1 / -1; margin: 0.1rem 0 0; line-height: 1.4; overflow-wrap: anywhere; white-space: pre-wrap; }
.chat-form { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
.chat-form input { flex: 1; min-width: 0; padding: 0.5rem 0.6rem; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--paper); color: var(--ink); font: inherit; }
.send { padding: 0.5rem 0.8rem; border: 1px solid var(--sheen); border-radius: var(--radius); background: var(--sheen); color: var(--on-sheen); font-weight: 700; }
.send:disabled { opacity: 0.45; }
.note { margin: 0.4rem 0 0; font-size: 0.8rem; color: var(--ink-2); }
</style>
