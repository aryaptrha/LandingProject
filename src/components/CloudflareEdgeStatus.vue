<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useEdgeStatus } from '@/composables/useEdgeStatus'
import { useLatency } from '@/composables/useLatency'
import { useMobilePanel } from '@/composables/useMobilePanels'
import { latencyStatusColor as statusColor, latencyStatusLabel as statusLabel } from '@/utils/latency'

// Both composables are shared singletons now: they own their own poll cadence and
// request timeout, so the per-call interval/timeout arguments are gone. Mounting
// each here only subscribes to the shared loop — it starts no request of its own.
const { data, isLoading, error, refresh } = useEdgeStatus()
const { latency, isLoading: latencyLoading, error: latencyError, measure } = useLatency()

const STORAGE_KEY = 'portfolio_edge_collapsed'

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

function persistCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // The choice still holds for the rest of this session.
  }
}

/*
 * The breakpoint comes from the shared composable rather than a listener of this
 * component's own, because it now decides two things at once: how this panel lays itself
 * out, and — since a phone's bottom edge only has room for one of them — whether opening
 * this panel should close the chat popup.
 */
const { isMobile, claim } = useMobilePanel('edge', () => setCollapsed(true, { remember: false }))

/*
 * Collapsed to a chip by default on a phone, where the panel would cover most of the page
 * it is reporting on; open by default on a desktop, where it has a corner to itself. Those
 * are the widths' existing defaults — what's new is that a remembered choice now outranks
 * both, in either direction. The panel is a permanent fixture of the page, so a visitor who
 * puts it away shouldn't have to put it away again on every visit.
 */
const isCollapsed = ref(readStoredCollapsed() ?? isMobile.value)

const toggleEl = ref<HTMLButtonElement | null>(null)
const closeEl = ref<HTMLButtonElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

/**
 * Toggles the panel and hands focus to whichever control replaced the one that was used.
 *
 * Both states vanish when left — expanding unmounts the chip, collapsing unmounts the
 * whole panel — and focus on a vanished element falls back to `<body>`, which would drop
 * a keyboard visitor at the top of the page on every toggle. The `activeElement` check
 * keeps the hand-off to the case that needs it: a mouse click leaves the modality
 * heuristic alone, so nothing gains a visible ring that didn't have one.
 *
 * Collapsing tests the whole panel rather than just the ✕, because the ✕ is not the only
 * thing focus can be sitting on when the panel goes: an auto-collapse (below) can arrive
 * while focus is on Refresh, and a tap that doesn't move focus — iOS Safari doesn't focus
 * buttons on tap — leaves it there. Moving focus to the chip can't steal it from the
 * control that triggered the auto-collapse, since if that control had focus then it, not
 * anything in this panel, is `activeElement` and the hand-off sits out.
 *
 * `remember: false` is for a collapse this component decided on rather than the visitor —
 * currently only the chat popup claiming the bottom of a phone screen. That writes nothing
 * to storage, so a visitor who deliberately opened the panel still finds it open next
 * visit.
 */
async function setCollapsed(collapsed: boolean, { remember = true } = {}) {
  const losingFocus = collapsed
    ? panelEl.value?.contains(document.activeElement) === true
    : document.activeElement === toggleEl.value

  isCollapsed.value = collapsed
  if (remember) persistCollapsed(collapsed)
  if (!collapsed) claim()

  if (!losingFocus) return

  // Both the chip and the panel are mounted on demand, so whichever one is taking over
  // has to exist before it can take focus.
  await nextTick()
  const to = collapsed ? toggleEl.value : closeEl.value
  to?.focus()
}

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
    // Continent was fetched on every poll but never shown. Slotted into the geo
    // block (broad→narrow: Continent, Country, City) without moving the existing
    // rows. No local fallback needed: the worker substitutes the literal
    // 'unknown' for absent geo, exactly as Country/City already rely on.
    { label: 'Continent', value: data.value.continent },
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

// Colour and label both come from the shared @/utils/latency helpers now, so a
// given round-trip band renders identically here and in the corner indicator,
// and the 30/80/150 boundaries can never drift between the two. The "no reading
// yet" fallbacks stay local: they describe the absence of a reading, not a
// status, so they have no place in the status→colour/label maps.
const latencyStatusColor = computed(() =>
  latency.value ? statusColor(latency.value.status) : 'var(--text-medium)',
)

const latencyStatusLabel = computed(() =>
  latency.value ? statusLabel(latency.value.status) : '—',
)
</script>

<template>
  <!--
    The panel's collapsed state: a chip standing in for it, at every width rather than
    only on a phone. This is the largest of the floating widgets, and a visitor who wants
    the corner of their screen back should be able to have it on a desktop too. It takes
    the panel's slot in the rail, so the pair never appear at once — hence `aria-expanded`
    being flatly false here and the ✕ inside the panel being the way back.

    No `aria-controls`: the panel is mounted on demand, so while this chip is showing
    there is no element left for it to point at.
  -->
  <button
    v-if="isCollapsed"
    ref="toggleEl"
    type="button"
    class="edge-toggle"
    aria-expanded="false"
    title="Show edge status"
    @click="setCollapsed(false)"
  >
    <span class="edge-toggle__icon" aria-hidden="true">⚡</span>
    <span class="edge-toggle__label">Edge Status</span>
  </button>

  <!--
    Widget panel. `v-if` rather than `v-show`, and with no `<Transition>` of its own: the
    rail in App.vue carries auto-animate, which animates this panel and the chip in and out
    as they are added to and removed from it — and slides the latency meter across to meet
    whichever one is there, instead of teleporting it. A transition here as well would put
    two engines on the same element.
  -->
  <div
    v-if="!isCollapsed"
    ref="panelEl"
    class="edge-widget"
    :class="{ 'edge-widget--mobile': isMobile }"
    role="region"
    aria-label="Cloudflare Edge Status"
  >
    <!-- Header -->
    <div class="edge-widget__header">
      <span class="edge-widget__title">☁ Cloudflare Edge</span>
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
      <!-- Surface the composable's actual error (a timeout, an HTTP status, a
           message) instead of a fixed "Cloudflare Offline": the panel was
           discarding the one string that says what actually went wrong. -->
      <p class="edge-widget__error-text">{{ error }}</p>
      <!-- Give the retry the accessible name and disabled-while-loading guard
           that Refresh already has — its ⟳ is decorative, so the button carried
           no stable name of its own. No "..." loading-text swap here, unlike
           Refresh: refresh() clears `error` synchronously, so this region
           unmounts as the fetch starts and a loading label would never render;
           the disabled guard only closes the re-entrant-click window. -->
      <button
        class="edge-widget__retry"
        :disabled="isLoading"
        aria-label="Retry loading edge status"
        @click="refresh"
      >
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

      <!-- Explicit name so the accessible label stays "Refresh edge status"
           rather than collapsing to the "..." (and its ⟳ being read out) while
           loading. Contains the visible word "Refresh" per WCAG label-in-name. -->
      <button
        class="edge-widget__refresh"
        :disabled="isLoading"
        aria-label="Refresh edge status"
        @click="refresh"
      >
        {{ isLoading ? '...' : 'Refresh ⟳' }}
      </button>
    </div>

    <!-- Mobile latency section -->
    <div v-if="isMobile" class="edge-widget__latency">
      <div class="edge-widget__latency-header">
        <span class="edge-widget__latency-title">Latency</span>
        <!-- Same ambient pulse as the desktop latency meter, and for the same
             reasons: opacity only, only while a reading exists, and never the
             sole carrier of the state (the status word below it is). -->
        <span
          class="edge-widget__latency-dot"
          :class="{ 'm-breathe': latency && !latencyError }"
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
</template>

<style scoped>
/*
 * Neither the chip nor the panel positions itself any more: both are laid out by the
 * `.widget-rail` in App.vue, which is what lets the latency meter close the gap when the
 * panel collapses instead of floating beside an empty corner — and, since the rail carries
 * auto-animate, what lets it travel that gap rather than jump it. Neither element animates
 * itself here for the same reason: swapping them is a change to the rail's contents, so
 * the rail is what owns the animation.
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
  transition: background var(--motion-base) var(--ease-flat);
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
  /* A polled figure in a narrow fixed panel: proportional digits would resize
     this line every 20 seconds and shift the status word beside it. */
  font-variant-numeric: tabular-nums;
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
</style>
