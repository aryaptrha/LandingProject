<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { paceToSeconds, useRuns, type PublicRun } from '@/composables/useRuns'
import { useReveal } from '@/composables/useReveal'
import PixelRunner from './run/PixelRunner.vue'
import RunDetail from './run/RunDetail.vue'
import RunSlot, { type RunBadge } from './run/RunSlot.vue'

const { data, isLoading, isDisabled, error, refresh } = useRuns()

// Below the fold, so it lifts in when first scrolled to — see EdgeInsights.
const { target: panel } = useReveal()

const runs = computed(() => data.value?.runs ?? [])
const timezone = computed(() => data.value?.timezone ?? 'Asia/Jakarta')

/*
 * Save-slot selection. Slot 1 is the newest run, and the one picked by default:
 * someone opening the panel most likely wants to know about today's run, not
 * Thursday's. Clamped back to it if a refresh brings fewer runs than before.
 */
const selected = ref(0)
watch(runs, (list) => {
  if (selected.value >= list.length) selected.value = 0
})
const activeRun = computed(() => runs.value[selected.value] ?? null)

const PANEL_ID = 'run-panel'
const tabId = (i: number) => `run-tab-${i}`

const slotButtons = ref<(HTMLButtonElement | null)[]>([])

function setSlotButton(el: unknown, i: number) {
  slotButtons.value[i] = el instanceof HTMLButtonElement ? el : null
}

/*
 * The WAI-ARIA tabs pattern: one tab stop for the row, arrows to move between
 * slots, and selection following focus. Wraps around at the ends, and up/down do
 * the same as left/right because the slots stack into a scroller on a phone.
 */
function onSlotKeydown(event: KeyboardEvent) {
  const count = runs.value.length
  if (!count) return
  let next: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (selected.value + 1) % count
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (selected.value - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  selected.value = next
  slotButtons.value[next]?.focus()
}

// --- Dates -----------------------------------------------------------------

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A run's `YYYY-MM-DD` as a local midnight.
 *
 * Built from its parts on purpose: `new Date('2026-10-06')` parses as *UTC*
 * midnight, which a browser west of Greenwich then displays as the 5th.
 */
function localDate(date: string): Date | null {
  const match = LOCAL_DATE.exec(date)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/**
 * Today's date where the runs happened, not where the visitor is. "Hari ini" on a
 * Jakarta run should mean the Jakarta today, or a visitor in New York would see
 * this morning's run labelled as tomorrow's.
 */
function todayIn(zone: string, at: number): string {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: zone }).format(at)
  } catch {
    return new Intl.DateTimeFormat('en-CA', options).format(at)
  }
}

function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

function shortDate(date: string): string {
  const day = localDate(date)
  const today = localDate(todayIn(timezone.value, now.value))
  if (!day) return date
  if (today) {
    const diff = daysBetween(day, today)
    if (diff === 0) return 'Hari ini'
    if (diff === 1) return 'Kemarin'
  }
  return day.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
}

function longDate(date: string): string {
  const day = localDate(date)
  if (!day) return date
  return day.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// --- Achievements ----------------------------------------------------------

/**
 * Index of the single best value, or null when there is no clear winner. A tie
 * awards nothing: two slots both labelled "longest" is a contradiction, not a
 * celebration.
 */
function winner(values: Array<number | null>, best: 'max' | 'min'): number | null {
  const present = values.filter((value): value is number => value !== null && value > 0)
  if (present.length < 2) return null
  const target = best === 'max' ? Math.max(...present) : Math.min(...present)
  const indexes = values.flatMap((value, i) => (value === target ? [i] : []))
  return indexes.length === 1 ? (indexes[0] ?? null) : null
}

/**
 * Badges are relative to the other slots, which is what makes them fun rather
 * than vain — "fastest of the three" is a story, "5:42/km" is a number. With only
 * one run there is nothing to compare against, so there are no badges.
 */
const badges = computed<RunBadge[][]>(() => {
  const list = runs.value
  const result: RunBadge[][] = list.map(() => [])
  if (list.length < 2) return result

  const award = (index: number | null, badge: RunBadge) => {
    if (index !== null) result[index]?.push(badge)
  }
  award(winner(list.map((run: PublicRun) => run.distanceKm), 'max'), {
    key: 'longest',
    icon: '🏅',
    label: 'Terjauh',
    tone: 'yellow',
  })
  award(winner(list.map((run) => paceToSeconds(run.pace)), 'min'), {
    key: 'fastest',
    icon: '⚡',
    label: 'Tercepat',
    tone: 'pink',
  })
  award(winner(list.map((run) => run.elevationGainM), 'max'), {
    key: 'climb',
    icon: '⛰',
    label: 'Nanjak',
    tone: 'green',
  })
  return result
})

/** What a screen reader hears for one slot, since the slot's face is mostly pictures. */
function slotLabel(run: PublicRun, i: number): string {
  const parts = [`Slot ${i + 1}`, shortDate(run.date), `${run.distanceKm.toLocaleString('id-ID')} km`]
  if (run.pace) parts.push(`pace ${run.pace}`)
  parts.push(`waktu ${run.duration}`)
  for (const badge of badges.value[i] ?? []) parts.push(badge.label)
  return parts.join(', ')
}

// --- Sync age --------------------------------------------------------------

// The reactive clock from EdgeInsights: `Date.now()` alone would freeze both the
// "synced N hours ago" stamp and the "Hari ini" labels at whatever mount time was.
const now = ref(Date.now())
const TICK_MS = 30_000

/** Matches the persona backend's own staleness cut-off for the same snapshot. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000

function ago(iso: string): string {
  const seconds = Math.max(0, Math.floor((now.value - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'baru saja'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

const syncedAgo = computed(() => (data.value?.generatedAt ? `Disinkron ${ago(data.value.generatedAt)}` : ''))

const isStale = computed(() => {
  const generatedAt = data.value?.generatedAt
  return generatedAt ? now.value - new Date(generatedAt).getTime() > STALE_AFTER_MS : false
})

let tickTimer: ReturnType<typeof setInterval> | null = null

function startTicking() {
  if (tickTimer !== null) return
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
    Hidden when this deploy has no stats to read (namespace unbound, or a snapshot
    format it predates). An empty panel would imply nobody has run, which is not
    what happened.
  -->
  <section v-if="!isDisabled" ref="panel" class="run" aria-labelledby="run-title">
    <header class="run__header">
      <div>
        <h2 id="run-title" class="run__title">🏃 My Run</h2>
        <p class="run__subtitle">
          Tiga lari terakhirku, straight from my watch. Pilih slot buat lihat detailnya.
        </p>
      </div>
      <div class="run__header-side">
        <PixelRunner />
        <span class="run__badge" title="Sumber: Garmin Connect, disinkron tiap 2 jam">Garmin</span>
      </div>
    </header>

    <div v-if="error && !data" class="run__error">
      <p class="run__error-text">{{ error }}</p>
      <button class="run__retry" type="button" @click="refresh">Coba lagi ⟳</button>
    </div>

    <!-- Flat blocks with an opacity pulse, not the gradient shimmer older panels
         use — design.md allows one color per surface. -->
    <div v-else-if="isLoading && !data" class="run__skeleton" aria-hidden="true">
      <div class="run__skeleton-slots">
        <div v-for="i in 3" :key="i" class="run__skeleton-block run__skeleton-block--slot m-breathe" />
      </div>
      <div class="run__skeleton-block run__skeleton-block--panel m-breathe" />
    </div>

    <p v-else-if="data && !runs.length" class="run__empty">
      Belum ada lari tercatat. Sepatunya masih di rak 👟
    </p>

    <div v-else-if="data" class="run__body">
      <div class="run__slots m-cascade" role="tablist" aria-label="Pilih lari" @keydown="onSlotKeydown">
        <button
          v-for="(run, i) in runs"
          :id="tabId(i)"
          :key="`${run.date}-${i}`"
          :ref="(el) => setSlotButton(el, i)"
          class="run__slot"
          :class="{ 'run__slot--active': i === selected }"
          type="button"
          role="tab"
          :aria-selected="i === selected"
          :aria-controls="PANEL_ID"
          :aria-label="slotLabel(run, i)"
          :tabindex="i === selected ? 0 : -1"
          @click="selected = i"
        >
          <RunSlot
            :run="run"
            :index="i"
            :date-label="shortDate(run.date)"
            :badges="badges[i] ?? []"
            :active="i === selected"
          />
        </button>
      </div>

      <!-- Keyed on the selection so a new slot's detail fades in rather than
           snapping its numbers in place under the reader's eyes. -->
      <div
        v-if="activeRun"
        :id="PANEL_ID"
        :key="selected"
        class="run__panel m-fade"
        role="tabpanel"
        :aria-labelledby="tabId(selected)"
      >
        <RunDetail :run="activeRun" :date-label="longDate(activeRun.date)" />
      </div>

      <p v-if="error" class="run__notice">{{ error }}</p>
      <p v-if="isStale" class="run__notice run__notice--stale">
        Jamnya belum sinkron lagi sejak {{ data.generatedAt ? ago(data.generatedAt) : 'lama' }}, jadi
        mungkin ada lari yang belum masuk.
      </p>

      <footer class="run__footer">
        <span class="run__stamp">{{ syncedAgo }}</span>
        <button class="run__refresh" type="button" :disabled="isLoading" @click="refresh">
          {{ isLoading ? '...' : 'Refresh ⟳' }}
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
.run {
  padding: var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
}

.run__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-md);
  border-bottom: 2px dashed var(--divider);
}

.run__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.run__subtitle {
  font-size: 0.85rem;
  color: var(--text-medium);
}

.run__header-side {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.run__badge {
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

.run__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/*
 * Three columns when they fit, a sideways scroller of 168px slots when they do
 * not — on a phone three equal slots would be too narrow to hold a distance in the
 * pixel face. The 4px padding and matching negative margin give the 2px hover lift
 * and the focus ring room inside the scroll box, which would otherwise clip both.
 */
.run__slots {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(168px, 1fr);
  gap: var(--space-sm);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding: var(--space-xs);
  margin: calc(-1 * var(--space-xs));
}

/* A flex column so the slot's face sits at the top. A button centres its content
   vertically, which would drop a badge-less slot lower than its neighbours. */
.run__slot {
  display: flex;
  flex-direction: column;
  scroll-snap-align: start;
  min-height: 44px;
  padding: var(--space-md);
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--ease-flat),
    background-color var(--motion-fast) var(--ease-flat),
    border-color var(--motion-fast) var(--ease-flat);
}

.run__slot:hover {
  transform: translateY(var(--motion-lift));
}

.run__slot:active {
  transform: none;
}

.run__slot:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* Selected is a fill, a border and the ▶ cursor inside the slot — never the
   colour alone. */
.run__slot--active {
  background: var(--blue-light);
  border-color: var(--blue-main);
}

.run__notice {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--pink-light);
  border: 2px solid var(--pink-main);
  border-radius: var(--radius-input);
  font-size: 0.8rem;
  color: var(--text-dark);
}

.run__notice--stale {
  background: var(--yellow-light);
  border-color: var(--yellow-main);
}

.run__empty {
  padding: var(--space-lg) 0;
  font-size: 0.9rem;
  color: var(--text-medium);
  text-align: center;
}

.run__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 2px dashed var(--divider);
}

.run__stamp {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.run__refresh {
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

.run__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.run__error {
  text-align: center;
  padding: var(--space-md) 0;
}

.run__error-text {
  font-size: 0.85rem;
  color: var(--status-error);
  margin-bottom: var(--space-sm);
}

.run__retry {
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

.run__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.run__skeleton-slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-sm);
}

.run__skeleton-block {
  background: var(--divider);
  border-radius: var(--radius-btn);
}

.run__skeleton-block--slot {
  height: 132px;
}

.run__skeleton-block--panel {
  height: 320px;
  border-radius: var(--radius-input);
}
</style>
