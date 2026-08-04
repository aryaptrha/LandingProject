<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '../../composables/useChat'
import ChatMessageItem from './ChatMessageItem.vue'

const props = defineProps<{
  messages: ChatMessage[]
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'select-starter', text: string): void
}>()

const listRef = ref<HTMLElement | null>(null)

const starterPrompts = [
  'Who are you?',
  'What projects have you built?',
  'Tell me about your tech stack',
  'How can I connect with Arya?',
]

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.isLoading, scrollToBottom)

onMounted(scrollToBottom)
</script>

<template>
  <div class="chat-list" ref="listRef">
    <!-- Empty / Welcome Banner -->
    <div v-if="messages.length <= 1" class="chat-list__welcome">
      <div class="welcome-card">
        <div class="welcome-card__pixel-icon">
          <svg viewBox="0 0 16 16" width="36" height="36" class="pixel-art">
            <rect width="16" height="16" fill="#FCF5D6" rx="4" />
            <!-- Star icon -->
            <rect x="7" y="2" width="2" height="12" fill="#F7E4A8" />
            <rect x="2" y="7" width="12" height="2" fill="#F7E4A8" />
            <rect x="7" y="3" width="2" height="10" fill="#2F2F2F" />
            <rect x="3" y="7" width="10" height="2" fill="#2F2F2F" />
            <rect x="5" y="5" width="6" height="6" fill="#F7E4A8" />
            <rect x="6" y="6" width="4" height="4" fill="#2F2F2F" />
          </svg>
        </div>

        <h3 class="welcome-card__title">Obrolan Persona AI</h3>
        <p class="welcome-card__desc">
          Tanyakan apa saja kepada AI Persona Arya! Kamu juga bisa menyapa menggunakan prompt cepat di bawah:
        </p>

        <div class="welcome-card__starters">
          <button
            v-for="(prompt, idx) in starterPrompts"
            :key="idx"
            class="starter-pill"
            @click="emit('select-starter', prompt)"
            type="button"
          >
            <span class="starter-pill__icon">✨</span>
            {{ prompt }}
          </button>
        </div>
      </div>
    </div>

    <!-- Messages List -->
    <ChatMessageItem
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
    />
  </div>
</template>

<style scoped>
.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  background: var(--bg-soft);
  min-height: 360px;
  max-height: 520px;
  scroll-behavior: smooth;
}

.chat-list__welcome {
  margin: auto 0;
  display: flex;
  justify-content: center;
  padding: var(--space-md) 0;
}

.welcome-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
  padding: var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
}

.welcome-card__pixel-icon {
  margin-bottom: var(--space-md);
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.welcome-card__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.welcome-card__desc {
  font-size: 0.9rem;
  color: var(--text-medium);
  margin-bottom: var(--space-md);
}

.welcome-card__starters {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-xs);
}

.starter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-badge);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-dark);
  cursor: pointer;
  transition: all 0.15s ease;
}

.starter-pill:hover {
  transform: translateY(-2px);
  background: var(--blue-light);
  border-color: var(--blue-main);
}

.starter-pill:active {
  transform: translateY(0);
}

.starter-pill__icon {
  font-size: 0.8rem;
}
</style>
