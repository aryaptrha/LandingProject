<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useInsights } from '@/composables/useInsights'

const { data, isLoading, isDisabled, error, refresh } = useInsights()

const numberFormat = new Intl.NumberFormat('id-ID')

const totals = computed(() => {
  if (!data.value) return []
  return [
    { label: 'Total kunjungan', value: numberFormat.format(data.value.totalVisits) },
    { label: 'Pengunjung unik', value: numberFormat.format(data.value.uniqueVisitors) },
    { label: '24 jam terakhir', value: numberFormat.format(data.value.visitsLast24h) },
  ]
})

// Unwrapped here rather than reached through `data` in the template. Inside a
// `v-for` the compiler cannot always carry the `v-if="data"` narrowing, and these
// read better at the call site anyway.
const topCountries = computed(() => data.value?.topCountries ?? [])
const topColos = computed(() => data.value?.topColos ?? [])

/**
 * True share of the leading bucket, 0–100, rounded to a whole percent.
 *
 * Bars are scaled against the largest bucket, not the total: with a handful of
 * visits the top country is most of the traffic, and scaling by total would render
 * every bar as a sliver. Relative to the leader, the shape of the distribution is
 * readable at any volume. This is the honest number reported to assistive tech —
 * `share()` pads the *width* below, this does not.
 */
function rawShare(buckets: { count: number }[], count: number): number {
  const top = buckets.reduce((max, bucket) => Math.max(max, bucket.count), 0)
  if (top === 0) return 0
  return Math.round((count / top) * 100)
}

/**
 * Bar width as a CSS percentage, floored at 6%.
 *
 * The floor is a rendering concession only: a sub-6% sliver is invisible, so the
 * smallest bars are widened just enough to stay perceivable. That padding must
 * never leak into the accessible label — a screen reader hearing "6%" for a bar
 * that is really 2% would be told a wrong number. The `aria-label` therefore reads
 * `rawShare()` (unclamped), while the visual width reads this.
 */
function share(buckets: { count: number }[], count: number): string {
  return `${Math.max(6, rawShare(buckets, count))}%`
}

/**
 * Accessible description of one bar. A screen reader gets nothing from a width
 * alone, so each row carries its key, real count, and true (unclamped) share.
 * Indonesian to match the surrounding copy; numbers via the id-ID formatter.
 */
function barLabel(buckets: { key: string; count: number }[], bucket: { key: string; count: number }): string {
  return `${bucket.key}: ${numberFormat.format(bucket.count)} kunjungan, ${rawShare(buckets, bucket.count)}% dari yang teratas`
}

// `Date.now()` is not reactive, so a computed that reads it directly freezes until
// some unrelated dependency changes — the stamp would drift stale. This ref is the
// computed's reactive clock: ticking it re-evaluates `computedAgo`. The copy is
// minute-granular, so a 30s tick is plenty and 60s would still be defensible.
const now = ref(Date.now())
const TICK_MS = 30_000

/** Honest about age: this is a cached aggregate, not a live counter. */
const computedAgo = computed(() => {
  if (!data.value) return ''
  const seconds = Math.max(0, Math.round((now.value - new Date(data.value.computedAt).getTime()) / 1000))
  if (seconds < 60) return 'baru dihitung'
  const minutes = Math.round(seconds / 60)
  return `dihitung ${minutes} menit lalu`
})

let tickTimer: ReturnType<typeof setInterval> | null = null

function startTicking() {
  if (tickTimer !== null) return
  // Resync on start so a tab returning to the foreground jumps straight to the
  // correct age instead of showing a stale value for up to one full interval.
  now.value = Date.now()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
}

function stopTicking() {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

// A backgrounded tab has no reader, so pause the timer while hidden and resume (with
// an immediate resync, via startTicking) when it comes back — no point burning a
// timer to age a string nobody is looking at.
function handleVisibilityChange() {
  if (document.hidden) stopTicking()
  else startTicking()
}

onMounted(() => {
  if (!document.hidden) startTicking()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  stopTicking()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <!--
    Hidden entirely when switched off in KV or when storage is unwired. A panel of
    zeroes would imply nobody has ever visited, which is worse than no panel.
  -->
  <section v-if="!isDisabled" class="insights" aria-labelledby="insights-title">
    <header class="insights__header">
      <div>
        <h2 id="insights-title" class="insights__title">📊 Edge Insights</h2>
        <p class="insights__subtitle">
          Kunjungan dicatat di D1, ringkasannya dilayani dari KV.
        </p>
      </div>
      <span v-if="data" class="insights__badge" :title="`Sumber: ${data.cached ? 'KV cache' : 'D1 query'}`">
        {{ data.cached ? 'KV cache' : 'D1 query' }}
      </span>
    </header>

    <div v-if="error" class="insights__error">
      <p class="insights__error-text">{{ error }}</p>
      <button class="insights__retry" type="button" @click="refresh">Coba lagi ⟳</button>
    </div>

    <div v-else-if="isLoading && !data" class="insights__skeleton">
      <div v-for="i in 5" :key="i" class="insights__skeleton-row" />
    </div>

    <div v-else-if="data" class="insights__body">
      <div class="insights__totals">
        <div v-for="total in totals" :key="total.label" class="insights__total">
          <span class="insights__total-value">{{ total.value }}</span>
          <span class="insights__total-label">{{ total.label }}</span>
        </div>
      </div>

      <div class="insights__charts">
        <div class="insights__chart">
          <h3 class="insights__chart-title">Negara teratas</h3>
          <p v-if="!topCountries.length" class="insights__chart-empty">Belum ada data.</p>
          <ul v-else class="insights__bars">
            <li
              v-for="bucket in topCountries"
              :key="bucket.key"
              class="insights__bar-row"
              role="img"
              :aria-label="barLabel(topCountries, bucket)"
            >
              <span class="insights__bar-key" aria-hidden="true">{{ bucket.key }}</span>
              <span class="insights__bar-track" aria-hidden="true">
                <span
                  class="insights__bar-fill"
                  :style="{ width: share(topCountries, bucket.count) }"
                />
              </span>
              <span class="insights__bar-count" aria-hidden="true">{{ bucket.count }}</span>
            </li>
          </ul>
        </div>

        <div class="insights__chart">
          <h3 class="insights__chart-title">Edge POP teratas</h3>
          <p v-if="!topColos.length" class="insights__chart-empty">Belum ada data.</p>
          <ul v-else class="insights__bars">
            <li
              v-for="bucket in topColos"
              :key="bucket.key"
              class="insights__bar-row"
              role="img"
              :aria-label="barLabel(topColos, bucket)"
            >
              <span class="insights__bar-key" aria-hidden="true">{{ bucket.key }}</span>
              <span class="insights__bar-track" aria-hidden="true">
                <span
                  class="insights__bar-fill insights__bar-fill--alt"
                  :style="{ width: share(topColos, bucket.count) }"
                />
              </span>
              <span class="insights__bar-count" aria-hidden="true">{{ bucket.count }}</span>
            </li>
          </ul>
        </div>
      </div>

      <footer class="insights__footer">
        <span class="insights__stamp">{{ computedAgo }}</span>
        <button class="insights__refresh" type="button" :disabled="isLoading" @click="refresh">
          {{ isLoading ? '...' : 'Refresh ⟳' }}
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.insights {
  padding: var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
}

.insights__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-md);
  border-bottom: 2px dashed var(--divider);
}

.insights__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.insights__subtitle {
  font-size: 0.85rem;
  color: var(--text-medium);
}

.insights__badge {
  padding: 2px 10px;
  border: 2px solid var(--border);
  border-radius: var(--radius-badge);
  background: var(--surface-sunken);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-medium);
  cursor: help;
  white-space: nowrap;
}

.insights__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.insights__totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.insights__total {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-sm);
  background: var(--surface-sunken);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
}

.insights__total-value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-dark);
}

.insights__total-label {
  font-size: 0.7rem;
  color: var(--text-medium);
  text-align: center;
}

.insights__charts {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

.insights__chart-title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-sm);
}

.insights__chart-empty {
  font-size: 0.8rem;
  color: var(--text-medium);
}

.insights__bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  padding: 0;
}

.insights__bar-row {
  display: grid;
  grid-template-columns: 3.5rem 1fr 2.5rem;
  align-items: center;
  gap: var(--space-sm);
}

.insights__bar-key {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  color: var(--text-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.insights__bar-track {
  height: 10px;
  background: var(--divider);
  border-radius: var(--radius-badge);
  overflow: hidden;
}

.insights__bar-fill {
  display: block;
  height: 100%;
  background: var(--blue-main);
  border-radius: var(--radius-badge);
  transition: width 0.4s ease;
}

.insights__bar-fill--alt {
  background: var(--lavender-main);
}

.insights__bar-count {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  color: var(--text-medium);
  text-align: right;
}

.insights__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 2px dashed var(--divider);
}

.insights__stamp {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.insights__refresh {
  padding: 6px 14px;
  background: var(--blue-light);
  border: 2px solid var(--blue-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

.insights__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.insights__error {
  text-align: center;
  padding: var(--space-md) 0;
}

.insights__error-text {
  font-size: 0.85rem;
  color: var(--status-error);
  margin-bottom: var(--space-sm);
}

.insights__retry {
  padding: 6px 14px;
  background: var(--pink-light);
  border: 2px solid var(--pink-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

.insights__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.insights__skeleton-row {
  height: 16px;
  background: linear-gradient(
    90deg,
    var(--divider) 25%,
    var(--bg-soft) 50%,
    var(--divider) 75%
  );
  background-size: 200% 100%;
  border-radius: 4px;
  animation: insights-shimmer 1.5s infinite ease-in-out;
}

.insights__skeleton-row:nth-child(odd) {
  width: 80%;
}

@keyframes insights-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (min-width: 768px) {
  .insights__charts {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
