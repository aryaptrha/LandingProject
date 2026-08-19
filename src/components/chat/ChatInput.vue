<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRetroSound } from '../../composables/useRetroSound'

const props = withDefaults(
  defineProps<{
    isLoading: boolean
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    disabled: false,
    placeholder: 'Type a message...',
  },
)

// Props down, events up: this component stays purely presentational and never
// imports useChat. `stop` is emitted while a reply is streaming so the parent
// (ChatContainer -> useChat.stop) can abort the in-flight request.
const emit = defineEmits<{
  (e: 'send', content: string): void
  (e: 'stop'): void
}>()

const { playBlip, playToggle } = useRetroSound()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const isEffectivelyDisabled = computed(() => props.isLoading || props.disabled)

function handleSend() {
  if (!inputText.value.trim() || isEffectivelyDisabled.value) return
  playBlip()
  emit('send', inputText.value)
  inputText.value = ''
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

// The single primary control changes role with `isLoading`: it sends when idle
// and stops the stream while a reply is in flight.
function handlePrimaryAction() {
  if (props.isLoading) {
    playToggle()
    emit('stop')
    return
  }
  handleSend()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    // Enter only ever sends. handleSend early-returns while loading or disabled.
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
      <!-- A placeholder is not an accessible name, so the field carries an explicit
           aria-label; screen readers announce the field even before any text. -->
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="chat-input"
        aria-label="Message"
        :placeholder="placeholder"
        rows="1"
        :disabled="isEffectivelyDisabled"
        @keydown="handleKeyDown"
        @input="adjustHeight"
      ></textarea>

      <button
        class="send-btn"
        :class="{ 'send-btn--stop': isLoading }"
        type="button"
        :disabled="(!isLoading && !inputText.trim()) || (!isLoading && disabled)"
        :title="isLoading ? 'Stop generating' : 'Send message'"
        :aria-label="isLoading ? 'Stop generating' : 'Send message'"
        @click="handlePrimaryAction"
      >
        <!-- Stop glyph -->
        <svg
          v-if="isLoading"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          shape-rendering="crispEdges"
          class="send-btn__icon"
        >
          <rect x="4" y="4" width="8" height="8" />
        </svg>
        <!-- Send arrow -->
        <svg
          v-else
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          class="send-btn__icon"
        >
          <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.8 14.5a.5.5 0 0 1-.928.016l-3-5a.5.5 0 0 1 .09-.64l5-4.5a.5.5 0 0 0-.67-.74l-4.5 5a.5.5 0 0 1-.64.09l-5-3a.5.5 0 0 1 .016-.928L15.314.036a.5.5 0 0 1 .54.11z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-input-bar {
  padding: 10px 12px;
  background: var(--surface);
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
  background: var(--surface);
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
  color: var(--text-medium);
}

.chat-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Solid pastel control */
.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--blue-main);
  border: none;
  border-radius: 50%;
  color: var(--text-dark);
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.15s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.02);
  background: var(--blue-deep);
}

.send-btn:active:not(:disabled) {
  transform: scale(1);
}

.send-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.send-btn:disabled {
  background: var(--surface-disabled);
  color: var(--text-disabled);
  cursor: not-allowed;
}
</style>
