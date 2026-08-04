<script setup lang="ts">
import { ref } from 'vue'
import type { ChatMessage } from '../../composables/useChat'

const props = defineProps<{
  message: ChatMessage
}>()

const isCopied = ref(false)

function copyContent() {
  if (!props.message.content) return
  navigator.clipboard.writeText(props.message.content)
  isCopied.value = true
  setTimeout(() => {
    isCopied.value = false
  }, 1800)
}

function renderFormattedText(content: string): string {
  if (!content) return ''
  // Escape HTML characters
  let escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Bold **text**
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Italic *text* or _text_
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>')
  escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>')
  // Inline code `code`
  escaped = escaped.replace(/`(.*?)`/g, '<code class="inline-code">$1</code>')

  return escaped
}
</script>

<template>
  <div
    class="message-item"
    :class="{
      'message-item--user': message.role === 'user',
      'message-item--assistant': message.role === 'assistant',
      'message-item--error': message.status === 'error',
    }"
  >
    <!-- Avatar -->
    <div class="message-item__avatar" :title="message.role === 'user' ? 'You' : 'AI Persona'">
      <!-- Assistant Pixel Avatar -->
      <svg v-if="message.role === 'assistant'" viewBox="0 0 16 16" width="24" height="24" class="pixel-art">
        <rect width="16" height="16" fill="#D9C8F1" rx="3" />
        <rect x="3" y="2" width="10" height="3" fill="#2F2F2F" />
        <rect x="2" y="4" width="2" height="4" fill="#2F2F2F" />
        <rect x="12" y="4" width="2" height="4" fill="#2F2F2F" />
        <rect x="4" y="5" width="8" height="6" fill="#FFE0BD" />
        <rect x="5" y="7" width="1" height="2" fill="#2F2F2F" />
        <rect x="10" y="7" width="1" height="2" fill="#2F2F2F" />
        <rect x="4" y="9" width="1" height="1" fill="#F6C6D3" />
        <rect x="11" y="9" width="1" height="1" fill="#F6C6D3" />
        <rect x="7" y="10" width="2" height="1" fill="#D27D7D" />
        <rect x="3" y="11" width="10" height="4" fill="#B8E0C8" />
      </svg>

      <!-- User Pixel Avatar -->
      <svg v-else viewBox="0 0 16 16" width="24" height="24" class="pixel-art">
        <rect width="16" height="16" fill="#A9D6E5" rx="3" />
        <rect x="4" y="2" width="8" height="3" fill="#4B6B94" />
        <rect x="4" y="5" width="8" height="6" fill="#FDE2D1" />
        <rect x="5" y="7" width="2" height="2" fill="#2F2F2F" />
        <rect x="9" y="7" width="2" height="2" fill="#2F2F2F" />
        <rect x="7" y="10" width="2" height="1" fill="#4B6B94" />
        <rect x="3" y="12" width="10" height="4" fill="#F7E4A8" />
      </svg>
    </div>

    <!-- Bubble Wrapper -->
    <div class="message-item__body">
      <div class="message-item__meta">
        <span class="message-item__sender">
          {{ message.role === 'user' ? 'You' : 'Arya\'s AI' }}
        </span>
        <span class="message-item__time">{{ message.timestamp }}</span>
      </div>

      <!-- Bubble Content -->
      <div class="message-item__bubble">
        <!-- Typing indicator when sending/loading empty content -->
        <div v-if="message.status === 'sending' && !message.content" class="typing-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>

        <!-- Normal message text with inline formatting -->
        <div v-else class="message-item__text">
          <p
            v-for="(line, idx) in message.content.split('\n')"
            :key="idx"
            v-html="renderFormattedText(line)"
          ></p>
        </div>

        <!-- Copy button for Assistant -->
        <button
          v-if="message.role === 'assistant' && message.content && message.status !== 'sending'"
          class="message-item__copy-btn"
          @click="copyContent"
          :title="isCopied ? 'Copied!' : 'Copy response'"
        >
          <span v-if="isCopied" class="copy-badge">Copied!</span>
          <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
            <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
            <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: var(--space-sm);
  max-width: 85%;
  margin-bottom: var(--space-md);
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-item--user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message-item--assistant {
  margin-right: auto;
}

.message-item__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.message-item__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-item--user .message-item__body {
  align-items: flex-end;
}

.message-item__meta {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--text-medium);
}

.message-item__sender {
  font-weight: 600;
}

.message-item__time {
  opacity: 0.7;
}

.message-item__bubble {
  position: relative;
  padding: 10px 14px;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-dark);
  word-break: break-word;
  transition: all 0.15s ease;
}

.message-item--assistant .message-item__bubble {
  background: #FAFAF7;
  border: 1px solid rgba(217, 200, 241, 0.7);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border-radius: 18px 18px 18px 4px;
}

.message-item--user .message-item__bubble {
  background: var(--blue-light);
  border: 1px solid var(--blue-main);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border-radius: 18px 18px 4px 18px;
}

.message-item--error .message-item__bubble {
  background: var(--pink-light);
  border-color: var(--pink-main);
  color: #a93226;
}

.message-item__text p {
  margin: 0 0 4px 0;
}

.message-item__text p:last-child {
  margin-bottom: 0;
}

.message-item__copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: absolute;
  bottom: 6px;
  right: 6px;
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.7rem;
  color: var(--text-medium);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.message-item__bubble:hover .message-item__copy-btn {
  opacity: 1;
}

.message-item__copy-btn:hover {
  transform: translateY(-1px);
  color: var(--text-dark);
  background: #ffffff;
}

.copy-badge {
  color: #1f5e3b;
  font-weight: 600;
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 2px;
}

.typing-indicator .dot {
  width: 6px;
  height: 6px;
  background: var(--lavender-main);
  border-radius: 50%;
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-indicator .dot:nth-child(2) {
  animation-delay: 0.2s;
  background: var(--blue-main);
}

.typing-indicator .dot:nth-child(3) {
  animation-delay: 0.4s;
  background: var(--green-main);
}

@keyframes typingBounce {
  0%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-5px);
  }
}
</style>
