<script setup lang="ts">
import { computed } from 'vue'
import { useRetroSound } from '../composables/useRetroSound'

const { isSfxEnabled, toggleSfx } = useRetroSound()

const label = computed(() =>
  isSfxEnabled.value ? 'Sound effects enabled. Click to mute.' : 'Sound effects muted. Click to enable.',
)

const stateText = computed(() => (isSfxEnabled.value ? 'Sound ON' : 'Sound OFF'))
</script>

<template>
  <button
    class="sound-toggle"
    type="button"
    :aria-label="label"
    :title="stateText"
    @click="toggleSfx"
  >
    <!-- Pixel art speaker icon on a 16x16 grid -->
    <svg
      v-if="isSfxEnabled"
      class="sound-toggle__icon pixel-art"
      viewBox="0 0 16 16"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Speaker Body (cone & body) -->
      <rect x="2" y="6" width="3" height="4" fill="currentColor" />
      <rect x="5" y="5" width="2" height="6" fill="currentColor" />
      <rect x="7" y="4" width="2" height="8" fill="currentColor" />
      <!-- Sound waves / arcs -->
      <rect x="10" y="6" width="1" height="4" fill="currentColor" />
      <rect x="11" y="5" width="1" height="1" fill="currentColor" />
      <rect x="11" y="10" width="1" height="1" fill="currentColor" />
      <rect x="13" y="4" width="1" height="2" fill="currentColor" />
      <rect x="13" y="10" width="1" height="2" fill="currentColor" />
      <rect x="14" y="6" width="1" height="4" fill="currentColor" />
    </svg>

    <!-- Muted Speaker Icon -->
    <svg
      v-else
      class="sound-toggle__icon sound-toggle__icon--muted pixel-art"
      viewBox="0 0 16 16"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Speaker Body -->
      <rect x="2" y="6" width="3" height="4" fill="currentColor" />
      <rect x="5" y="5" width="2" height="6" fill="currentColor" />
      <rect x="7" y="4" width="2" height="8" fill="currentColor" />
      <!-- Pixel 'X' mark -->
      <rect x="10" y="6" width="1" height="1" fill="currentColor" />
      <rect x="11" y="7" width="1" height="1" fill="currentColor" />
      <rect x="12" y="8" width="1" height="1" fill="currentColor" />
      <rect x="13" y="9" width="1" height="1" fill="currentColor" />
      <rect x="14" y="10" width="1" height="1" fill="currentColor" />
      <rect x="10" y="10" width="1" height="1" fill="currentColor" />
      <rect x="11" y="9" width="1" height="1" fill="currentColor" />
      <rect x="13" y="7" width="1" height="1" fill="currentColor" />
      <rect x="14" y="6" width="1" height="1" fill="currentColor" />
    </svg>

    <span class="sound-toggle__status" role="status">{{ stateText }}</span>
  </button>
</template>

<style scoped>
.sound-toggle {
  position: fixed;
  top: var(--space-md);
  right: calc(var(--space-md) + 52px);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  color: var(--text-dark);
  background: var(--surface-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.sound-toggle:hover {
  background: var(--lavender-light);
  border-color: var(--lavender-main);
  transform: translateY(-1px) scale(1.02);
}

.sound-toggle:active {
  transform: translateY(0) scale(1);
}

.sound-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.sound-toggle__icon {
  display: block;
}

.sound-toggle__icon--muted {
  color: var(--text-disabled);
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}

.sound-toggle__status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 480px) {
  .sound-toggle {
    top: var(--space-sm);
    right: calc(var(--space-sm) + 50px);
  }
}
</style>
