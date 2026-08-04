<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'send', content: string): void
}>()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleSend() {
  if (!inputText.value.trim() || props.isLoading) return
  emit('send', inputText.value)
  inputText.value = ''
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

function adjustHeight() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 120)}px`
  }
}
</script>

<template>
  <div class="chat-input-bar">
    <div class="chat-input-container">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="chat-input"
        placeholder="Type a message... (Enter to send)"
        rows="1"
        :disabled="isLoading"
        @keydown="handleKeyDown"
        @input="adjustHeight"
      ></textarea>

      <button
        class="send-btn"
        :disabled="!inputText.trim() || isLoading"
        @click="handleSend"
        type="button"
        title="Kirim Pesan"
      >
        <span v-if="isLoading" class="send-btn__loading">...</span>
        <template v-else>
          <span class="send-btn__text">Kirim</span>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" class="send-btn__icon">
            <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.8 14.5a.5.5 0 0 1-.928.016l-3-5a.5.5 0 0 1 .09-.64l5-4.5a.5.5 0 0 0-.67-.74l-4.5 5a.5.5 0 0 1-.64.09l-5-3a.5.5 0 0 1 .016-.928L15.314.036a.5.5 0 0 1 .54.11z"/>
          </svg>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-input-bar {
  padding: var(--space-md) var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border-top: var(--glass-border);
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
}

.chat-input-container {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  padding: 6px 8px 6px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.chat-input-container:focus-within {
  border-color: var(--blue-main);
  box-shadow: 0 0 0 3px rgba(169, 216, 229, 0.25);
}

.chat-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.95rem;
  color: var(--text-dark);
  resize: none;
  max-height: 120px;
  line-height: 1.5;
  padding: 6px 0;
}

.chat-input::placeholder {
  color: #a0a0a0;
}

.chat-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--blue-main);
  border: none;
  border-radius: 10px;
  font-family: 'Nunito', sans-serif;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-dark);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  transition: all 0.15s ease;
  height: 38px;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  background: #94cadc;
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.send-btn:disabled {
  background: #e0e0e0;
  color: #999999;
  cursor: not-allowed;
  box-shadow: none;
}

.send-btn__loading {
  font-weight: bold;
  letter-spacing: 2px;
}

.send-btn__icon {
  margin-top: 1px;
}
</style>
