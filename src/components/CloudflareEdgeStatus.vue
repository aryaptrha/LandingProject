<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEdgeStatus } from '@/composables/useEdgeStatus'
import { useLatency } from '@/composables/useLatency'

const { data, isLoading, error, refresh } = useEdgeStatus(30000)
const { latency, isLoading: latencyLoading, error: latencyError, measure } = useLatency(20000, 5000)

const isCollapsed = ref(true)
const isMobile = ref(window.innerWidth < 768)

function handleResize() {
  isMobile.value = window.innerWidth < 768
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

const lastUpdated = computed(() => {
  if (!data.value?.timestamp) return '—'
  const date = new Date(data.value.timestamp)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

const rows = computed(() => {
  if (!data.value) return []
  return [
    { label: 'Status', value: data.value.status },
    { label: 'Edge POP', value: data.value.colo },
    { label: 'Country', value: data.value.country },
    { label: 'City', value: data.value.city },
    { label: 'Timezone', value: data.value.timezone },
    { label: 'Protocol', value: data.value.protocol },
    { label: 'TLS Version', value: data.value.tlsVersion },
    { label: 'Ray ID', value: data.value.ray },
    { label: 'Server', value: data.value.server },
    { label: 'Cache', value: data.value.cacheStatus },
    { label: 'Updated', value: lastUpdated.value },
  ]
})

const latencyStatusColor = computed(() => {
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

const latencyStatusLabel = computed(() => {
  if (!latency.value) return '—'
  return latency.value.status.charAt(0).toUpperCase() + latency.value.status.slice(1)
})
</script>

<template>
  <!-- Mobile: collapsible panel toggle -->
  <button
    v-if="isMobile"
    class="edge-toggle"
    :aria-expanded="!isCollapsed"
    aria-controls="edge-panel"
    @click="isCollapsed = !isCollapsed"
  >
    <span class="edge-toggle__icon">⚡</span>
    <span class="edge-toggle__label">Edge Status</span>
  </button>

  <!-- Widget panel -->
  <Transition name="edge-fade">
    <div
      v-show="!isMobile || !isCollapsed"
      id="edge-panel"
      class="edge-widget"
      :class="{ 'edge-widget--mobile': isMobile }"
      role="region"
      aria-label="Cloudflare Edge Status"
    >
      <!-- Header -->
      <div class="edge-widget__header">
        <span class="edge-widget__title">☁ Cloudflare Edge</span>
        <button
          v-if="isMobile"
          class="edge-widget__close"
          aria-label="Close edge status panel"
          @click="isCollapsed = true"
        >
          ✕
        </button>
      </div>

      <!-- Error state -->
      <div v-if="error" class="edge-widget__error">
        <p class="edge-widget__error-text">Cloudflare Offline</p>
        <button class="edge-widget__retry" @click="refresh">
          Retry ⟳
        </button>
      </div>

      <!-- Loading skeleton -->
      <div v-else-if="isLoading && !data" class="edge-widget__skeleton">
        <div
          v-for="i in 8"
          :key="i"
          class="edge-widget__skeleton-row"
        />
      </div>

      <!-- Data rows -->
      <div v-else-if="data" class="edge-widget__body">
        <div
          v-for="row in rows"
          :key="row.label"
          class="edge-widget__row"
        >
          <span class="edge-widget__label">{{ row.label }}</span>
          <span class="edge-widget__value">{{ row.value }}</span>
        </div>

        <button
          class="edge-widget__refresh"
          :disabled="isLoading"
          @click="refresh"
        >
          {{ isLoading ? '...' : 'Refresh ⟳' }}
        </button>
      </div>

      <!-- Mobile latency section -->
      <div v-if="isMobile" class="edge-widget__latency">
        <div class="edge-widget__latency-header">
          <span class="edge-widget__latency-title">Latency</span>
          <span
            class="edge-widget__latency-dot"
            :style="{ background: latencyStatusColor }"
          />
        </div>
        <div v-if="latencyError" class="edge-widget__latency-error">
          <span>{{ latencyError }}</span>
          <button class="edge-widget__retry" @click="measure">Retry</button>
        </div>
        <div v-else-if="latencyLoading && !latency" class="edge-widget__latency-loading">
          <div class="edge-widget__skeleton-row" style="width: 50%;" />
        </div>
        <div v-else-if="latency" class="edge-widget__latency-data">
          <span class="edge-widget__latency-ms">{{ latency.ms }} ms</span>
          <span
            class="edge-widget__latency-status"
            :style="{ color: latencyStatusColor }"
          >
            {{ latencyStatusLabel }}
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.edge-toggle {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  box-shadow: var(--glass-shadow);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  color: var(--text-dark);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.edge-toggle:hover {
  transform: scale(1.03);
}

.edge-toggle__icon {
  font-size: 1rem;
}

.edge-toggle__label {
  font-weight: 600;
}

.edge-widget {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 1000;
  width: 260px;
  padding: 14px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
}

.edge-widget--mobile {
  position: fixed;
  bottom: 60px;
  right: 16px;
  left: 16px;
  width: auto;
}

.edge-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px dashed var(--divider);
}

.edge-widget__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dark);
}

.edge-widget__close {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--text-medium);
  padding: 2px 6px;
  border-radius: 4px;
}

.edge-widget__close:hover {
  background: var(--divider);
}

.edge-widget__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edge-widget__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
}

.edge-widget__label {
  font-size: 0.75rem;
  color: var(--text-medium);
  font-weight: 600;
}

.edge-widget__value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  color: var(--text-dark);
  font-weight: 500;
}

.edge-widget__refresh {
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--blue-light);
  border: 2px solid var(--blue-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
  transition: background 0.15s ease;
  width: 100%;
  text-align: center;
}

.edge-widget__refresh:hover:not(:disabled) {
  background: var(--blue-main);
}

.edge-widget__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Error state */
.edge-widget__error {
  text-align: center;
  padding: 12px 0;
}

.edge-widget__error-text {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  color: var(--pink-main);
  font-weight: 700;
  margin-bottom: 10px;
}

.edge-widget__retry {
  padding: 6px 14px;
  background: var(--pink-light);
  border: 2px solid var(--pink-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
  transition: background 0.15s ease;
}

.edge-widget__retry:hover {
  background: var(--pink-main);
}

/* Loading skeleton */
.edge-widget__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edge-widget__skeleton-row {
  height: 14px;
  background: linear-gradient(
    90deg,
    var(--divider) 25%,
    var(--bg-soft) 50%,
    var(--divider) 75%
  );
  background-size: 200% 100%;
  border-radius: 4px;
  animation: shimmer 1.5s infinite ease-in-out;
}

.edge-widget__skeleton-row:nth-child(odd) {
  width: 85%;
}

.edge-widget__skeleton-row:nth-child(even) {
  width: 70%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Mobile latency section */
.edge-widget__latency {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 2px dashed var(--divider);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.edge-widget__latency-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.edge-widget__latency-title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dark);
}

.edge-widget__latency-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background 0.3s ease;
}

.edge-widget__latency-data {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edge-widget__latency-ms {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-dark);
}

.edge-widget__latency-status {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  font-weight: 600;
}

.edge-widget__latency-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  color: var(--pink-main);
}

.edge-widget__latency-loading {
  width: 100%;
}

/* Transition */
.edge-fade-enter-active,
.edge-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.edge-fade-enter-from,
.edge-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
