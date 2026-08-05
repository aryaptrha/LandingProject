<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChat } from '../../composables/useChat'
import ChatHeader from './ChatHeader.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ChatAvatarPicker from './ChatAvatarPicker.vue'
import ChatPromptChips from './ChatPromptChips.vue'

const {
  messages,
  isLoading,
  sendMessage,
  clearMessages,
  userAvatarId,
  isAvatarPickerOpen,
  setUserAvatar,
  openAvatarPicker,
} = useChat()

const isOpen = ref(false)

/** Only shown on a fresh conversation — the welcome message alone, nothing asked yet. */
const showPromptChips = computed(() => messages.value.length <= 1)

function toggleChat() {
  isOpen.value = !isOpen.value
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
      aria-label="Toggle Chat with Arya"
      :title="isOpen ? 'Close Chat' : 'Chat dengan Arya'"
    >
      <div class="chat-launcher__avatar">
        <svg viewBox="0 0 16 16" width="22" height="22" class="pixel-art">
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
      <span class="chat-launcher__label">Chat Arya</span>
      <span class="chat-launcher__dot"></span>
    </button>

    <!-- Floating Chat Window -->
    <Transition name="chat-popup-anim">
      <section v-if="isOpen" class="chat-popup" role="dialog" aria-label="Chat Window with Arya">
        <!-- Header -->
        <ChatHeader
          :user-avatar-id="userAvatarId"
          @close="isOpen = false"
          @clear-chat="clearMessages"
          @open-avatar-picker="openAvatarPicker"
        />

        <!-- Avatar Picker Overlay (shows when first starting chat or when user wants to change avatar) -->
        <ChatAvatarPicker
          v-if="isAvatarPickerOpen || !userAvatarId"
          :initial-avatar-id="userAvatarId || 'ironman'"
          @select="setUserAvatar"
        />

        <!-- Main Chat Area (shown after avatar selection) -->
        <template v-else>
          <!-- Message List -->
          <ChatMessageList
            :messages="messages"
            :is-loading="isLoading"
            :user-avatar-id="userAvatarId"
          />

          <!-- Starter prompts, only before the first question -->
          <ChatPromptChips
            v-if="showPromptChips"
            :disabled="isLoading"
            @send="sendMessage"
          />

          <!-- Input Bar -->
          <ChatInput
            :is-loading="isLoading"
            @send="sendMessage"
          />
        </template>
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
  gap: 8px;
  padding: 8px 14px 8px 8px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1.5px solid var(--border);
  border-radius: 30px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-launcher:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.12);
  border-color: var(--blue-main);
}

.chat-launcher:active {
  transform: translateY(0);
}

.chat-launcher__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-dark);
}

.chat-launcher__dot {
  width: 7px;
  height: 7px;
  background: var(--status-online);
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.25);
}

/* Chat Popup Window */
.chat-popup {
  position: fixed;
  bottom: 72px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 360px;
  height: 500px;
  max-height: calc(85vh - 60px);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}

@media (max-width: 480px) {
  .chat-popup {
    left: 10px;
    right: 10px;
    width: auto;
    bottom: 68px;
    height: calc(85vh - 50px);
  }

  .chat-launcher {
    left: 10px;
    bottom: 14px;
  }
}

/* Animations */
.chat-popup-anim-enter-active,
.chat-popup-anim-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-popup-anim-enter-from,
.chat-popup-anim-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>
