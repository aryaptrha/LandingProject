<script setup lang="ts">
import { ref } from 'vue'
import { useRetroSound } from '../../composables/useRetroSound'

const props = defineProps<{
  isLoading: boolean
}>()

// Props down, events up: this component stays purely presentational and never
// imports useChat. `stop` is emitted while a reply is streaming so the parent
// (ChatContainer -> useChat.stop) can abort the in-flight request. See the
// stop-button cross-component contract.
const emit = defineEmits<{
  (e: 'send', content: string): void
  (e: 'stop'): void
}>()

const { playBlip, playToggle } = useRetroSound()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleSend() {
  if (!inputText.value.trim() || props.isLoading) return
  playBlip()
  emit('send', inputText.value)
  inputText.value = ''
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

// The single primary control changes role with `isLoading`: it sends when idle
// and stops the stream while a reply is in flight. Keeping it one button in
// place (rather than a second floating one) keeps the primary action a single
// predictable target.
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
    // Enter only ever sends. handleSend early-returns while loading, so Enter can
    // never trigger stop — stopping is always a deliberate click on the control.
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
        placeholder="Type a message..."
        rows="1"
        :disabled="isLoading"
        @keydown="handleKeyDown"
        @input="adjustHeight"
      ></textarea>

      <button
        class="send-btn"
        :class="{ 'send-btn--stop': isLoading }"
        type="button"
        :disabled="!isLoading && !inputText.trim()"
        :title="isLoading ? 'Stop generating' : 'Send message'"
        :aria-label="isLoading ? 'Stop generating' : 'Send message'"
        @click="handlePrimaryAction"
      >
        <!-- Stop glyph: a hand-authored filled square on the same 16-unit grid as
             the send arrow below, authored fresh rather than scaled from the send
             icon so the two states never share pixel geometry. crispEdges keeps it
             from anti-aliasing at any render size. -->
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

/* Solid pastel control (never glass, per design.md's Solid components list). The
   44x44 box meets the minimum hit area for both the Send and Stop states so the
   Stop target is never smaller than what a touch needs. */
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

/* Motion stays inside the 150-200ms / scale 1.00->1.02 budget: lift on hover,
   settle back to rest on press. */
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
