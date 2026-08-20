<script setup lang="ts">
import { type Component } from 'vue'
import { useRetroSound } from '../composables/useRetroSound'

defineProps<{
  title: string
  description: string
  icon: Component
  color: string
  link?: string
  disabled?: boolean
}>()

const { playBlip, playError } = useRetroSound()
</script>

<template>
  <a
    v-if="!disabled"
    class="menu-card"
    :style="{ '--accent': color }"
    :href="link"
    target="_blank"
    rel="noopener noreferrer"
    @click="playBlip"
  >
    <div class="menu-card__icon m-sprite">
      <component :is="icon" />
    </div>
    <h3 class="menu-card__title">{{ title }}</h3>
    <p class="menu-card__description">{{ description }}</p>
  </a>

  <div
    v-else
    class="menu-card menu-card--disabled"
    :style="{ '--accent': color }"
    aria-disabled="true"
    @click="playError"
  >
    <div class="menu-card__icon m-sprite">
      <component :is="icon" />
    </div>
    <h3 class="menu-card__title">{{ title }}</h3>
    <p class="menu-card__description">{{ description }}</p>
    <span class="menu-card__badge">Coming Soon</span>
  </div>
</template>

<style scoped>
.menu-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-md);
  cursor: pointer;
  transition:
    transform var(--motion-base) var(--ease-flat),
    box-shadow var(--motion-base) var(--ease-flat);
  min-height: 180px;
  text-decoration: none;
  color: inherit;
}

.menu-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.1);
}

.menu-card:active {
  transform: translateY(0);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.menu-card:focus-visible {
  outline: 2px solid var(--accent, var(--blue-main));
  outline-offset: 2px;
}

.menu-card--disabled {
  cursor: not-allowed;
  opacity: 0.6;
  position: relative;
}

.menu-card--disabled:hover {
  transform: none;
  box-shadow: var(--glass-shadow);
}

.menu-card--disabled:active {
  transform: none;
}

/*
 * The icon lifts 2px inside a card that is itself lifting 2px, so hovering reads
 * as the sprite reacting rather than the card merely moving. `m-sprite`
 * (motion.css) supplies the timing: `steps(3, jump-none)`, which quantises those
 * 2px to 0 / -1 / -2. That matters because these icons are hand-authored pixel
 * art on a 32 grid — a smooth 0.6px offset would land the whole sprite between
 * device pixels and soften every edge, which is exactly the anti-aliasing
 * `design.md` forbids. Stepping keeps it on the grid, and reads as a sprite
 * animating in a game would.
 *
 * Focus gets the same treatment as hover: keyboard users should see the card
 * respond, not just receive an outline.
 */
.menu-card__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent, var(--blue-light));
  border-radius: var(--radius-btn);
}

.menu-card:hover .menu-card__icon,
.menu-card:focus-visible .menu-card__icon {
  transform: translateY(-2px);
}

/* Pressing puts both the card and its sprite back down together. */
.menu-card:active .menu-card__icon {
  transform: translateY(0);
}

.menu-card--disabled:hover .menu-card__icon,
.menu-card--disabled:focus-visible .menu-card__icon {
  transform: none;
}

.menu-card__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-dark);
}

.menu-card__description {
  font-size: 0.9rem;
  color: var(--text-medium);
  line-height: 1.5;
}

.menu-card__badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 3px 10px;
  background: var(--lavender-light);
  border: 1.5px solid var(--lavender-main);
  border-radius: var(--radius-badge);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-dark);
}
</style>
