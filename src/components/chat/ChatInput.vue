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
        placeholder="Type a message..."
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
        title="Send Message"
        aria-label="Send message"
      >
        <span v-if="isLoading" class="send-btn__loading">...</span>
        <template v-else>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" class="send-btn__icon">
            <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.8 14.5a.5.5 0 0 1-.928.016l-3-5a.5.5 0 0 1 .09-.64l5-4.5a.5.5 0 0 0-.67-.74l-4.5 5a.5.5 0 0 1-.64.09l-5-3a.5.5 0 0 1 .016-.928L15.314.036a.5.5 0 0 1 .54.11z"/>
          </svg>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-input-bar {
  padding: 10px 12px;
  background: #ffffff;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px 6px 4px 12px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.chat-input-container:focus-within {
  border-color: var(--blue-main);
  background: #ffffff;
  box-shadow: 0 0 0 2px rgba(169, 216, 229, 0.3);
}

.chat-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.88rem;
  color: var(--text-dark);
  resize: none;
  max-height: 80px;
  line-height: 1.4;
  padding: 4px 0;
}

.chat-input::placeholder {
  color: #999999;
}

.chat-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--blue-main);
  border: none;
  border-radius: 50%;
  color: var(--text-dark);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  background: #94cadc;
}

.send-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.send-btn:disabled {
  background: #e0e0e0;
  color: #aaaaaa;
  cursor: not-allowed;
}

.send-btn__loading {
  font-size: 0.75rem;
  font-weight: bold;
}
</style>
