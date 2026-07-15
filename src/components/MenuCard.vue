<script setup lang="ts">
import { type Component } from 'vue'

defineProps<{
  title: string
  description: string
  icon: Component
  color: string
  link?: string
  disabled?: boolean
}>()
</script>

<template>
  <a
    v-if="!disabled"
    class="menu-card"
    :style="{ '--accent': color }"
    :href="link"
    target="_blank"
    rel="noopener noreferrer"
  >
    <div class="menu-card__icon">
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
  >
    <div class="menu-card__icon">
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
    transform 200ms ease,
    box-shadow 200ms ease;
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

.menu-card__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent, var(--blue-light));
  border-radius: var(--radius-btn);
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
