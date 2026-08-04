<script setup lang="ts">
import { ref } from 'vue'
import { useChat } from '../../composables/useChat'
import ChatHeader from './ChatHeader.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'

const {
  messages,
  isLoading,
  sendMessage,
  clearMessages,
} = useChat()

const isOpen = ref(false)

function toggleChat() {
  isOpen.value = !isOpen.value
}

function handleSelectStarter(text: string) {
  sendMessage(text)
}
</script>

<template>
  <div class="chat-widget">
    <!-- Floating Launcher Button -->
    <button
      class="chat-launcher"
      :class="{ 'chat-launcher--active': isOpen }"
      @click="toggleChat"
      type="button"
      aria-label="Toggle Persona AI Chat"
      :title="isOpen ? 'Close Chat' : 'Chat with Arya\'s AI Persona'"
    >
      <div class="chat-launcher__avatar">
        <svg viewBox="0 0 16 16" width="24" height="24" class="pixel-art">
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
      </div>
      <span class="chat-launcher__label">Chat with me</span>
      <span class="chat-launcher__dot"></span>
    </button>

    <!-- Floating Chat Window -->
    <Transition name="chat-popup-anim">
      <section v-if="isOpen" class="chat-popup" role="dialog" aria-label="Personal AI Chat Window">
        <!-- Header -->
        <ChatHeader
          @close="isOpen = false"
          @clear-chat="clearMessages"
        />

        <!-- Message List -->
        <ChatMessageList
          :messages="messages"
          :is-loading="isLoading"
          @select-starter="handleSelectStarter"
        />

        <!-- Input Bar -->
        <ChatInput
          :is-loading="isLoading"
          @send="sendMessage"
        />
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.chat-widget {
  position: relative;
  z-index: 1000;
}

/* Floating Launcher Button */
.chat-launcher {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px 8px 10px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: 30px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.chat-launcher:hover {
  transform: translateY(-3px) scale(1.03);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.14);
  border-color: var(--blue-main);
}

.chat-launcher:active {
  transform: translateY(0) scale(0.98);
}

.chat-launcher__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--lavender-light);
  border-radius: 50%;
  overflow: hidden;
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.chat-launcher__label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dark);
}

.chat-launcher__dot {
  width: 8px;
  height: 8px;
  background: #34c759;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.3);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 6px rgba(52, 199, 89, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0);
  }
}

/* Chat Popup Window */
.chat-popup {
  position: fixed;
  bottom: 76px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 380px;
  height: 540px;
  max-height: calc(100vh - 100px);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

@media (max-width: 480px) {
  .chat-popup {
    left: 12px;
    right: 12px;
    width: auto;
    bottom: 72px;
    height: calc(100vh - 90px);
  }

  .chat-launcher {
    left: 12px;
    bottom: 16px;
  }
}

/* Animations */
.chat-popup-anim-enter-active,
.chat-popup-anim-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-popup-anim-enter-from,
.chat-popup-anim-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.95);
}
</style>
