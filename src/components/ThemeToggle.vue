<script setup lang="ts">
import { useTheme } from '../composables/useTheme'

const { isNight, toggleTheme } = useTheme()
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-pressed="isNight"
    :aria-label="isNight ? 'Switch to day mode' : 'Switch to night mode'"
    :title="isNight ? 'Day mode' : 'Night mode'"
    @click="toggleTheme"
  >
    <!-- Hand-authored pixel art on a 16 grid, one scale, no anti-aliasing. -->
    <svg
      v-if="!isNight"
      class="theme-toggle__icon pixel-art"
      viewBox="0 0 16 16"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Sun: blocky disc plus straight and diagonal rays -->
      <rect x="5" y="5" width="6" height="6" fill="currentColor" />
      <rect x="6" y="4" width="4" height="1" fill="currentColor" />
      <rect x="6" y="11" width="4" height="1" fill="currentColor" />
      <rect x="4" y="6" width="1" height="4" fill="currentColor" />
      <rect x="11" y="6" width="1" height="4" fill="currentColor" />
      <rect x="7" y="1" width="2" height="2" fill="currentColor" />
      <rect x="7" y="13" width="2" height="2" fill="currentColor" />
      <rect x="1" y="7" width="2" height="2" fill="currentColor" />
      <rect x="13" y="7" width="2" height="2" fill="currentColor" />
      <rect x="2" y="2" width="2" height="2" fill="currentColor" />
      <rect x="12" y="2" width="2" height="2" fill="currentColor" />
      <rect x="2" y="12" width="2" height="2" fill="currentColor" />
      <rect x="12" y="12" width="2" height="2" fill="currentColor" />
    </svg>

    <svg
      v-else
      class="theme-toggle__icon pixel-art"
      viewBox="0 0 16 16"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <!-- Crescent moon, built row by row so the edge stays on the grid -->
      <rect x="6" y="3" width="4" height="1" fill="currentColor" />
      <rect x="5" y="4" width="3" height="1" fill="currentColor" />
      <rect x="4" y="5" width="3" height="1" fill="currentColor" />
      <rect x="3" y="6" width="3" height="4" fill="currentColor" />
      <rect x="4" y="10" width="3" height="1" fill="currentColor" />
      <rect x="5" y="11" width="3" height="1" fill="currentColor" />
      <rect x="6" y="12" width="4" height="1" fill="currentColor" />
      <!-- Two stars -->
      <rect x="11" y="4" width="1" height="1" fill="currentColor" />
      <rect x="13" y="8" width="1" height="1" fill="currentColor" />
    </svg>
  </button>
</template>

<style scoped>
/* Solid fill, not glass — glass is reserved for surfaces, per design.md. */
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
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

.theme-toggle:hover {
  background: var(--yellow-light);
  border-color: var(--yellow-main);
  transform: translateY(-1px) scale(1.02);
}

.theme-toggle:active {
  transform: translateY(0) scale(1);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.theme-toggle__icon {
  display: block;
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}

@media (max-width: 480px) {
  .theme-toggle {
    top: 10px;
    right: 10px;
  }
}
</style>
