<script setup lang="ts">
const emit = defineEmits<{
  (e: 'clear-chat'): void
  (e: 'close'): void
}>()
</script>

<template>
  <header class="chat-header">
    <div class="chat-header__profile">
      <!-- Pixel Avatar -->
      <div class="pixel-avatar pixel-avatar--persona">
        <svg viewBox="0 0 16 16" width="32" height="32" class="pixel-art">
          <!-- Background pixel square -->
          <rect width="16" height="16" fill="#D9C8F1" rx="3" />
          <!-- Pixel Hair -->
          <rect x="3" y="2" width="10" height="3" fill="#2F2F2F" />
          <rect x="2" y="4" width="2" height="4" fill="#2F2F2F" />
          <rect x="12" y="4" width="2" height="4" fill="#2F2F2F" />
          <!-- Skin -->
          <rect x="4" y="5" width="8" height="6" fill="#FFE0BD" />
          <!-- Eyes -->
          <rect x="5" y="7" width="1" height="2" fill="#2F2F2F" />
          <rect x="10" y="7" width="1" height="2" fill="#2F2F2F" />
          <!-- Cheeks -->
          <rect x="4" y="9" width="1" height="1" fill="#F6C6D3" />
          <rect x="11" y="9" width="1" height="1" fill="#F6C6D3" />
          <!-- Smile -->
          <rect x="7" y="10" width="2" height="1" fill="#D27D7D" />
          <!-- Outfit -->
          <rect x="3" y="11" width="10" height="4" fill="#B8E0C8" />
          <rect x="6" y="11" width="4" height="2" fill="#FAFAF7" />
        </svg>
      </div>

      <div class="chat-header__info">
        <div class="chat-header__title-row">
          <h2 class="chat-header__title">Arya's AI Persona</h2>
          <span class="chat-header__status-badge">
            <span class="pixel-dot pixel-dot--online"></span>
            Online
          </span>
        </div>
        <p class="chat-header__subtitle">Ask me anything about my work & projects!</p>
      </div>
    </div>

    <div class="chat-header__actions">
      <button
        class="icon-button icon-button--danger"
        title="Clear Chat History"
        @click="emit('clear-chat')"
        type="button"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
          <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zm3 0a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5z"/>
        </svg>
      </button>

      <button
        class="icon-button"
        title="Close Chat"
        @click="emit('close')"
        type="button"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
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
  padding: var(--space-md) var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border-bottom: var(--glass-border);
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-lg);
}

.chat-header__profile {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.pixel-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--lavender-light);
  border: 1px solid var(--lavender-main);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.chat-header__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-header__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.chat-header__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-dark);
}

.chat-header__status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: var(--green-light);
  border: 1px solid var(--green-main);
  border-radius: var(--radius-badge);
  font-size: 0.75rem;
  font-weight: 600;
  color: #1f5e3b;
}

.pixel-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34c759;
}

.pixel-dot--online {
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.2);
}

.chat-header__subtitle {
  font-size: 0.8rem;
  color: var(--text-medium);
}

.endpoint-code {
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-dark);
}

.chat-header__actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-medium);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-button:hover {
  transform: translateY(-2px);
  color: var(--text-dark);
  background: #ffffff;
  border-color: #bbbbbb;
}

.icon-button:active {
  transform: translateY(0);
}

.icon-button--danger:hover {
  background: var(--pink-light);
  border-color: var(--pink-main);
  color: #c0392b;
}
</style>
