<script setup lang="ts">
import { computed } from 'vue'
import { useLatency } from '@/composables/useLatency'

const { latency, isLoading, error, measure } = useLatency(20000, 5000)

const statusColor = computed(() => {
  if (!latency.value) return 'var(--text-medium)'
  switch (latency.value.status) {
    case 'excellent':
      return 'var(--green-main)'
    case 'good':
      return 'var(--blue-main)'
    case 'average':
      return 'var(--yellow-main)'
    case 'slow':
      return 'var(--pink-main)'
  }
})

const statusLabel = computed(() => {
  if (!latency.value) return '—'
  return latency.value.status.charAt(0).toUpperCase() + latency.value.status.slice(1)
})
</script>

<template>
  <div class="latency" role="status" aria-label="Edge latency indicator">
    <div class="latency__header">
      <span class="latency__title">Latency</span>
      <span
        class="latency__dot"
        :style="{ background: statusColor }"
      />
    </div>

    <!-- Error state -->
    <div v-if="error" class="latency__error">
      <span class="latency__error-text">{{ error }}</span>
      <button class="latency__retry" @click="measure">Retry</button>
    </div>

    <!-- Loading state -->
    <div v-else-if="isLoading && !latency" class="latency__loading">
      <div class="latency__skeleton latency__skeleton--lg" />
      <div class="latency__skeleton latency__skeleton--sm" />
    </div>

    <!-- Data -->
    <div v-else-if="latency" class="latency__body">
      <span class="latency__ms">{{ latency.ms }} ms</span>
      <span
        class="latency__status"
        :style="{ color: statusColor }"
      >
        {{ statusLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.latency {
  position: fixed;
  bottom: 16px;
  right: 284px;
  z-index: 1000;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  box-shadow: var(--glass-shadow);
  min-width: 100px;
  text-align: center;
}

@media (max-width: 767px) {
  .latency {
    display: none;
  }
}

.latency__header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.latency__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dark);
}

.latency__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background 0.3s ease;
}

.latency__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.latency__ms {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-dark);
}

.latency__status {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  transition: color 0.3s ease;
}

/* Error */
.latency__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.latency__error-text {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  color: var(--pink-main);
  font-weight: 600;
}

.latency__retry {
  padding: 3px 10px;
  background: var(--pink-light);
  border: 1.5px solid var(--pink-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
  transition: background 0.15s ease;
}

.latency__retry:hover {
  background: var(--pink-main);
}

/* Loading skeleton */
.latency__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.latency__skeleton {
  background: linear-gradient(
    90deg,
    var(--divider) 25%,
    var(--bg-soft) 50%,
    var(--divider) 75%
  );
  background-size: 200% 100%;
  border-radius: 4px;
  animation: latency-shimmer 1.5s infinite ease-in-out;
}

.latency__skeleton--lg {
  width: 60px;
  height: 18px;
}

.latency__skeleton--sm {
  width: 44px;
  height: 12px;
}

@keyframes latency-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
