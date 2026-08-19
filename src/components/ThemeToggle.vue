<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '../composables/useTheme'
import { useRetroSound } from '../composables/useRetroSound'

// This control is tri-state — day, night, and "follow system" — not a boolean
// toggle. `useTheme` already models the third state: an explicit day/night pick
// sets `hasExplicitChoice`, and dropping it (via `useSystemTheme`) goes back to
// tracking the OS `prefers-color-scheme`. Before this, that reset was unreachable
// from the UI, so once a visitor picked a side there was no way back to system.
const { theme, hasExplicitChoice, setTheme, useSystemTheme } = useTheme()
const { playThemeDay, playThemeNight, playToggle } = useRetroSound()

type ThemeMode = 'day' | 'night' | 'system'

// "system" is the *absence* of an explicit choice, so it can't live in `theme`
// (which only ever holds the resolved day/night palette). It's derived from
// whether the visitor has overridden the OS preference.
const mode = computed<ThemeMode>(() => {
  if (!hasExplicitChoice.value) return 'system'
  return theme.value === 'night' ? 'night' : 'day'
})

// One button cycling day -> night -> system -> day keeps this a single 44x44
// control in the corner, rather than growing a second floating button or a menu
// for a cozy portfolio's lone theme switch.
function cycleMode() {
  if (mode.value === 'day') {
    setTheme('night')
    playThemeNight()
  } else if (mode.value === 'night') {
    useSystemTheme()
    playToggle()
  } else {
    setTheme('day')
    playThemeDay()
  }
}

// The accessible name leads with the *current* mode (what a screen reader hears
// when the control is merely focused) and follows with the action (heard as
// "…, button"). This replaces `aria-pressed`, which is boolean and cannot
// express three states.
const label = computed(() => {
  switch (mode.value) {
    case 'day':
      return 'Day mode. Switch to night mode.'
    case 'night':
      return 'Night mode. Switch to following the system theme.'
    default:
      return 'Following the system theme. Switch to day mode.'
  }
})

// Short current-state string for the pointer tooltip and the live region.
const stateText = computed(() => {
  switch (mode.value) {
    case 'day':
      return 'Day mode'
    case 'night':
      return 'Night mode'
    default:
      return 'Following the system theme'
  }
})
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="label"
    :title="stateText"
    @click="cycleMode"
  >
    <!-- Hand-authored pixel art on a 16 grid, one scale, no anti-aliasing.
         Each state is a distinct silhouette (radial disc / lopsided crescent /
         rectangular screen) so the mode never rests on colour alone. -->
    <svg
      v-if="mode === 'day'"
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
      v-else-if="mode === 'night'"
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

    <svg
      v-else
      class="theme-toggle__icon pixel-art"
      viewBox="0 0 16 16"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <!-- "Follow system" reads as a pixel monitor: the theme tracks whatever the
           device asks for. A desktop PC is one of design.md's preferred subjects,
           and its hollow-screen-plus-stand silhouette is unmistakably neither the
           sun's radial disc nor the moon's crescent. Drawn on the same 16 grid. -->
      <!-- Bezel: a one-unit frame, drawn as four edges so the screen stays hollow -->
      <rect x="2" y="2" width="12" height="1" fill="currentColor" />
      <rect x="2" y="9" width="12" height="1" fill="currentColor" />
      <rect x="2" y="3" width="1" height="6" fill="currentColor" />
      <rect x="13" y="3" width="1" height="6" fill="currentColor" />
      <!-- Stand: neck then a wider foot, both centred under the screen -->
      <rect x="7" y="10" width="2" height="1" fill="currentColor" />
      <rect x="5" y="11" width="6" height="1" fill="currentColor" />
    </svg>

    <!-- Announced when the mode changes while focus stays on the button — a lone
         changed aria-label is not reliably re-read by screen readers, and there is
         no longer an aria-pressed flip to carry the update. Silent on first render
         (a live region only speaks on subsequent changes). -->
    <span class="theme-toggle__status" role="status">{{ stateText }}</span>
  </button>
</template>

<style scoped>
/* Solid fill, not glass — glass is reserved for surfaces, per design.md. */
.theme-toggle {
  position: fixed;
  top: var(--space-md);
  right: var(--space-md);
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

/* Visually hidden but exposed to assistive tech (no repo-wide utility exists). */
.theme-toggle__status {
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
  .theme-toggle {
    top: var(--space-sm);
    right: var(--space-sm);
  }
}
</style>
