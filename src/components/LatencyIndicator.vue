<script setup lang="ts">
import { computed } from 'vue'
import { useLatency } from '@/composables/useLatency'
import { latencyStatusColor, latencyStatusLabel } from '@/utils/latency'

// The poll owns its own cadence now, so this call takes no arguments — the old
// (interval, timeout) pair is gone. `history` is the shared ring buffer of recent
// successful readings that feeds the sparkline below.
const { latency, isLoading, error, measure, history } = useLatency()

// The status→colour map and the title-cased label live in `@/utils/latency`,
// shared with the edge panel and the network diagram so a colour here always
// means the same round-trip band as the same colour there. Only the "no reading
// yet" fallbacks (`var(--text-medium)` / '—') stay local: they describe the
// absence of a reading, not a status, so they have no place in the shared maps.
const statusColor = computed(() =>
  latency.value ? latencyStatusColor(latency.value.status) : 'var(--text-medium)',
)

const statusLabel = computed(() =>
  latency.value ? latencyStatusLabel(latency.value.status) : '—',
)

// role="status" is a live region, but its aria-label was a fixed string, so a
// screen reader landing on the region heard only "Edge latency indicator" — the
// measured number never entered the region's accessible name. Deriving the name
// from the current reading exposes the value and its band on navigation, not only
// on the live-region content update.
const ariaLabel = computed(() => {
  if (error.value) return `Edge latency: ${error.value}`
  if (!latency.value) return 'Edge latency: measuring'
  return `Edge latency: ${latency.value.ms} milliseconds, ${statusLabel.value}`
})

// --- D2 sparkline -----------------------------------------------------------
// A flat trend line over the shared latency history. Authored on a small integer
// grid and rendered 1:1 (viewBox size == pixel size, no stretch) with
// shape-rendering="crispEdges", so segments step in hard pixels instead of
// smoothing into a curve — per design.md's no-blur / no-anti-alias rule. No fill,
// no gradient, no glow: just a 2px stroke coloured by the current status.
const SPARK_W = 64
const SPARK_H = 16
// Vertical inset so a peak or trough is not clipped by the 2px stroke at the edge.
const SPARK_PAD = 2

const sparkPoints = computed(() => {
  const data = history.value
  // Zero or one sample cannot describe a trend: a single point draws nothing and
  // a lone flat segment would falsely read as "stable". Show no line until at
  // least two successful readings exist (~two poll ticks after mount); the number
  // and status text carry the widget until then.
  if (data.length < 2) return ''

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min
  const usableH = SPARK_H - SPARK_PAD * 2
  const stepX = SPARK_W / (data.length - 1)

  return data
    .map((ms, i) => {
      const x = Math.round(i * stepX)
      // Auto-scale within the current window so small variations stay visible —
      // the absolute figure is already shown as text above. When every sample is
      // equal (span 0) there is no trend, so pin the line to mid-height.
      const norm = span === 0 ? 0.5 : (ms - min) / span
      // Higher ms sits higher, so a latency spike reads as an upward peak.
      const y = Math.round(SPARK_PAD + (1 - norm) * usableH)
      return `${x},${y}`
    })
    .join(' ')
})
</script>

<template>
  <div class="latency" role="status" :aria-label="ariaLabel">
    <div class="latency__header">
      <span class="latency__title">Latency</span>
      <!--
        The dot breathes only while there is a live reading. Opacity is the only
        thing moving: a pulsing ring or shadow would be the glow design.md rules
        out, and it stays a slow, low-amplitude loop so it reads as ambient
        rather than as an alert. It is never the only signal for the state — the
        status word below it and the region's aria-label both carry that — so
        switching it off under prefers-reduced-motion loses no information.
      -->
      <span
        class="latency__dot"
        :class="{ 'm-breathe': latency && !error }"
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
    <div v-else-if="latency" class="latency__body m-fade">
      <span class="latency__ms">{{ latency.ms }} ms</span>
      <span
        class="latency__status"
        :style="{ color: statusColor }"
      >
        {{ statusLabel }}
      </span>

      <!--
        D2 trend. This is a redundant visual summary of the very figure already
        read out as text above, so it is aria-hidden: announcing it would make a
        screen reader read the same number twice. Rendered at its intrinsic 64x16
        (never scaled) so the crisp-edges stroke lands on whole pixels.
      -->
      <svg
        v-if="sparkPoints"
        class="latency__spark"
        :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
        :width="SPARK_W"
        :height="SPARK_H"
        shape-rendering="crispEdges"
        aria-hidden="true"
      >
        <polyline
          :points="sparkPoints"
          fill="none"
          :stroke="statusColor"
          stroke-width="2"
          stroke-linecap="butt"
          stroke-linejoin="miter"
        />
      </svg>
    </div>
  </div>
</template>

<style scoped>
/*
 * Laid out by the `.widget-rail` in App.vue rather than positioned here. It used to be
 * `right: 284px` — the edge panel's 260px width plus the gap, hardcoded — which only held
 * while that panel could never be collapsed. The rail places the two instead.
 */
.latency {
  /* The rail drops pointer events so its empty upper column doesn't eat clicks meant for
     the page; anything that wants them takes them back. */
  pointer-events: auto;
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
  transition: background var(--motion-base) var(--ease-flat);
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
  /* Proportional digits have different widths, so a poll going from 8 ms to
     112 ms resizes this line and nudges the sparkline under it. Tabular figures
     make every reading the same width, which is what keeps a value that updates
     on a timer from looking like it is twitching. */
  font-variant-numeric: tabular-nums;
}

/*
 * Deliberately *not* counted up, unlike the totals in the insights panel. This
 * widget's root is role="status" — a live region — so the number is announced
 * whenever its text changes. Tweening it would change that text a dozen times
 * per reading and hand a screen reader a dozen announcements for one
 * measurement. The value snaps; the dot beside it carries the liveness instead.
 */

.latency__status {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  transition: color var(--motion-base) var(--ease-flat);
}

/*
 * Trend sparkline. Sized to its intrinsic 64x16 via the SVG width/height
 * attributes and deliberately not stretched, so one SVG unit maps to one CSS
 * pixel and the crisp-edges stroke stays on the pixel grid. No animation is
 * attached: the line simply appears once two samples exist, which keeps this off
 * the JS-loop path that would need a prefersReducedMotion() guard.
 */
.latency__spark {
  display: block;
  margin-top: var(--space-xs);
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
