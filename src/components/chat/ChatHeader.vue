<script setup lang="ts">
import AvengerPixelAvatar from './AvengerPixelAvatar.vue'

defineProps<{
  userAvatarId?: string
}>()

const emit = defineEmits<{
  (e: 'clear-chat'): void
  (e: 'close'): void
  (e: 'open-avatar-picker'): void
}>()
</script>

<template>
  <header class="chat-header">
    <div class="chat-header__profile">
      <!-- Pixel Avatar -->
      <div class="pixel-avatar">
        <svg viewBox="0 0 16 16" width="28" height="28" class="pixel-art">
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
          <rect x="6" y="11" width="4" height="2" fill="#FAFAF7" />
        </svg>
      </div>

      <div class="chat-header__info">
        <div class="chat-header__title-row">
          <h2 class="chat-header__title">Arya</h2>
          <span class="online-indicator" title="Online">
            <span class="online-dot"></span>
          </span>
        </div>
        <p class="chat-header__subtitle">Online • Direct Chat</p>
      </div>
    </div>

    <div class="chat-header__actions">
      <button
        v-if="userAvatarId"
        class="header-btn"
        title="Ganti Hero Avatar"
        @click="emit('open-avatar-picker')"
        type="button"
        aria-label="Ganti Avatar"
      >
        <AvengerPixelAvatar :avatar-id="userAvatarId" :size="18" />
      </button>

      <button
        class="header-btn header-btn--danger"
        title="Clear History"
        @click="emit('clear-chat')"
        type="button"
        aria-label="Clear chat history"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5z"/>
        </svg>
      </button>

      <button
        class="header-btn"
        title="Close Chat"
        @click="emit('close')"
        type="button"
        aria-label="Close chat"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-header__profile {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pixel-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  background: var(--lavender-light);
  border: 1px solid var(--lavender-main);
  border-radius: 10px;
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.chat-header__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.chat-header__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-header__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.online-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}

.online-dot {
  width: 7px;
  height: 7px;
  background: var(--status-online);
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.25);
}

.chat-header__subtitle {
  font-size: 0.75rem;
  color: var(--text-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.chat-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-medium);
  cursor: pointer;
  transition: all 0.15s ease;
}

.header-btn:hover {
  transform: translateY(-1px);
  color: var(--text-dark);
  background: var(--surface);
  border-color: var(--border);
}

.header-btn:active {
  transform: translateY(0);
}

.header-btn--danger:hover {
  background: var(--pink-light);
  border-color: var(--pink-main);
  color: var(--status-error);
}
</style>
