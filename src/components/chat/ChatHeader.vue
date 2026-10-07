<script setup lang="ts">
import { computed } from 'vue'
import type { GarminSyncView } from '../../composables/useGarminSync'
import AvengerPixelAvatar from './AvengerPixelAvatar.vue'
import AryaPixelFace from './AryaPixelFace.vue'

const props = defineProps<{
  userAvatarId?: string
  /** Owner-only Garmin sync state; null or absent hides the button entirely. */
  syncState?: GarminSyncView | null
}>()

const emit = defineEmits<{
  (e: 'clear-chat'): void
  (e: 'close'): void
  (e: 'open-avatar-picker'): void
  (e: 'sync-garmin'): void
}>()

/**
 * The subtitle carries the sync state in words while there is one. A tooltip
 * alone would never show on a phone, which is where the owner syncs from after a
 * run, and the status dot is never the only signal for a state.
 */
const syncLabel = computed(() =>
  props.syncState && props.syncState.phase !== 'idle' ? props.syncState.label : null,
)
const syncLogUrl = computed(() =>
  props.syncState?.phase === 'failure' && props.syncState.url ? props.syncState.url : null,
)
</script>

<template>
  <header class="chat-header">
    <div class="chat-header__profile">
      <!-- Pixel Avatar -->
      <div class="pixel-avatar">
        <AryaPixelFace :size="28" variant="collar" />
      </div>

      <div class="chat-header__info">
        <div class="chat-header__title-row">
          <h2 class="chat-header__title">Arya</h2>
          <span class="online-indicator" title="Online">
            <span class="online-dot"></span>
          </span>
        </div>
        <p
          class="chat-header__subtitle"
          :class="{ 'chat-header__subtitle--sync': syncLabel }"
          :aria-live="syncState ? 'polite' : undefined"
        >
          <a v-if="syncLogUrl" :href="syncLogUrl" target="_blank" rel="noopener noreferrer">
            {{ syncLabel }}
          </a>
          <template v-else>{{ syncLabel ?? 'Online • Direct Chat' }}</template>
        </p>
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
        v-if="syncState"
        class="header-btn header-btn--sync"
        :title="syncState.label"
        :aria-label="syncState.label"
        :aria-busy="syncState.busy"
        :disabled="syncState.busy"
        @click="emit('sync-garmin')"
        type="button"
      >
        <!-- Blink rather than spin: design.md rules spin out, and m-blink is the
             site's existing "working" signal (the typing indicator). -->
        <svg
          :class="{ 'm-blink': syncState.busy }"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
          <path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
        </svg>
        <span
          v-if="syncState.phase === 'success' || syncState.phase === 'failure' || syncState.phase === 'error'"
          class="sync-dot"
          :class="syncState.phase === 'success' ? 'sync-dot--ok' : 'sync-dot--bad'"
          aria-hidden="true"
        ></span>
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

.header-btn--sync {
  position: relative;
}

.header-btn:disabled {
  cursor: progress;
}

.header-btn:disabled:hover {
  transform: none;
  color: var(--text-medium);
  background: var(--bg-soft);
}

.sync-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.sync-dot--ok {
  background: var(--status-online);
}

.sync-dot--bad {
  background: var(--status-error);
}

/* Sync messages are sentences, and an ellipsis would cut off the part that says
   what to do; let them wrap instead of the usual single truncated line. */
.chat-header__subtitle--sync {
  white-space: normal;
}

.chat-header__subtitle a {
  color: inherit;
  text-decoration: underline;
}
</style>
