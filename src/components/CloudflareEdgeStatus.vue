<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useEdgeStatus } from '@/composables/useEdgeStatus'
import { useLatency } from '@/composables/useLatency'

const { data, isLoading, error, refresh } = useEdgeStatus(30000)
const { latency, isLoading: latencyLoading, error: latencyError, measure } = useLatency(20000, 5000)

/** Mirrors the `max-width: 767px` breakpoint in the styles below; keep the two in step. */
const MOBILE_QUERY = '(max-width: 767px)'
const STORAGE_KEY = 'portfolio_edge_collapsed'

function matchesMobile(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
}

/** The visitor's own collapse choice, or null while they haven't made one. */
function readStoredCollapsed(): boolean | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === '1') return true
    if (stored === '0') return false
    return null
  } catch {
    // Private browsing, or storage blocked — fall back to the width-based default.
    return null
  }
}

const isMobile = ref(matchesMobile())
/*
 * Collapsed to a chip by default on a phone, where the panel would cover most of the page
 * it is reporting on; open by default on a desktop, where it has a corner to itself. Those
 * are the widths' existing defaults — what's new is that a remembered choice now outranks
 * both, in either direction. The panel is a permanent fixture of the page, so a visitor who
 * puts it away shouldn't have to put it away again on every visit.
 */
const isCollapsed = ref(readStoredCollapsed() ?? isMobile.value)

watch(isCollapsed, (collapsed) => {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // The choice still holds for the rest of this session.
  }
})

const toggleEl = ref<HTMLButtonElement | null>(null)
const closeEl = ref<HTMLButtonElement | null>(null)

/**
 * Toggles the panel and hands focus to whichever control replaced the one that was used.
 *
 * Both buttons vanish when pressed — expanding unmounts the chip, collapsing hides the
 * panel the ✕ is in — and focus on a vanished element falls back to `<body>`, which would
 * drop a keyboard visitor at the top of the page on every toggle. The `activeElement`
 * check keeps this to the case that needs it: a mouse click leaves the modality heuristic
 * alone, so nothing gains a visible ring that didn't have one.
 */
async function setCollapsed(collapsed: boolean) {
  const from = collapsed ? closeEl.value : toggleEl.value
  const hadFocus = from !== null && document.activeElement === from

  isCollapsed.value = collapsed
  if (!hadFocus) return

  // The chip has to mount, and the panel has to come back out of `display: none`, before
  // either can take focus.
  await nextTick()
  const to = collapsed ? toggleEl.value : closeEl.value
  to?.focus()
}

/*
 * A media-query listener rather than a resize one: it fires only when the breakpoint is
 * actually crossed instead of on every pixel of a window drag, and it reads the boundary
 * from the same place the stylesheet does.
 */
let mobileQuery: MediaQueryList | null = null

function onBreakpointChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  mobileQuery = window.matchMedia(MOBILE_QUERY)
  mobileQuery.addEventListener('change', onBreakpointChange)
})

onUnmounted(() => {
  mobileQuery?.removeEventListener('change', onBreakpointChange)
  mobileQuery = null
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
  <!--
    The panel's collapsed state: a chip standing in for it, at every width rather than
    only on a phone. This is the largest of the floating widgets, and a visitor who wants
    the corner of their screen back should be able to have it on a desktop too. It takes
    the panel's slot in the rail, so the pair never appear at once — hence `aria-expanded`
    being flatly false here and the ✕ inside the panel being the way back.
  -->
  <button
    v-if="isCollapsed"
    ref="toggleEl"
    type="button"
    class="edge-toggle"
    aria-expanded="false"
    aria-controls="edge-panel"
    title="Show edge status"
    @click="setCollapsed(false)"
  >
    <span class="edge-toggle__icon" aria-hidden="true">⚡</span>
    <span class="edge-toggle__label">Edge Status</span>
  </button>

  <!-- Widget panel -->
  <Transition name="edge-fade">
    <div
      v-show="!isCollapsed"
      id="edge-panel"
      class="edge-widget"
      :class="{ 'edge-widget--mobile': isMobile }"
      role="region"
      aria-label="Cloudflare Edge Status"
    >
      <!-- Header -->
      <div class="edge-widget__header">
        <span class="edge-widget__title">☁ Cloudflare Edge</span>
        <!-- Unconditional: the panel above is `v-show`n, so while collapsed it is
             `display: none` and this button is untabbable anyway, in the DOM or not. -->
        <button
          ref="closeEl"
          type="button"
          class="edge-widget__close"
          aria-label="Collapse edge status panel"
          title="Collapse"
          @click="setCollapsed(true)"
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
/*
 * Neither the chip nor the panel positions itself any more: both are laid out by the
 * `.widget-rail` in App.vue, which is what lets the latency meter close the gap when the
 * panel collapses instead of floating beside an empty corner.
 *
 * Solid, not glass, now that this is a control a desktop visitor sees too — design.md
 * reserves glass for surfaces and keeps buttons and chips solid.
 */
.edge-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  /* A legal touch target on its own, unaided by the panel it replaces. */
  min-height: 44px;
  padding: 8px 14px;
  background: var(--surface-muted);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  color: var(--text-dark);
  cursor: pointer;
  /* The rail drops pointer events so its empty upper column doesn't eat clicks meant for
     the page; anything that wants them takes them back. */
  pointer-events: auto;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.edge-toggle:hover {
  /* Fill as well as scale: the panel's own buttons use this blue, and design.md asks for
     a darker fill on hover rather than movement alone. */
  background: var(--blue-light);
  border-color: var(--blue-main);
  transform: scale(1.02);
}

.edge-toggle:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.edge-toggle__icon {
  font-size: 1rem;
}

.edge-toggle__label {
  font-weight: 600;
}

.edge-widget {
  width: 260px;
  padding: 14px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
  pointer-events: auto;
}

/*
 * Spans the viewport at phone widths instead of sitting in the rail — 260px in a corner is
 * most of a phone's width anyway. `position: fixed` is what takes it back out of the rail's
 * flow; the rail sets no transform, so the containing block here is still the viewport.
 */
.edge-widget--mobile {
  position: fixed;
  /* The 60px used to be clearance for the chip below it. The chip is gone while this is
     open now, but the band isn't empty — the chat launcher sits in it — so the offset
     stays and the phone layout is left exactly as it was. */
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

/* 44x44 per design.md, with the overflow pulled back out of the header row by negative
   margins so the header keeps the height it had. */
.edge-widget__close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  margin: -8px -10px -8px 0;
  background: none;
  border: none;
  border-radius: var(--radius-btn);
  font-size: 1rem;
  cursor: pointer;
  color: var(--text-medium);
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.edge-widget__close:hover {
  color: var(--text-dark);
  background: var(--surface-hover-wash);
}

.edge-widget__close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
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
