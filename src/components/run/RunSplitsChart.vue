<script setup lang="ts">
import { computed, ref } from 'vue'
import { durationToSeconds, type RunSplit } from '@/composables/useRuns'

const props = defineProps<{
  splits: RunSplit[]
}>()

const integer = new Intl.NumberFormat('id-ID')
const oneDecimal = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const twoDecimals = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Plot height in whole "pixel rows". Bars snap to rows rather than to any pixel,
 * so their tops line up on a 4px grid the way a sprite's would — 24 rows is a
 * 96px plot.
 */
const PLOT_ROWS = 24
const ROW_PX = 4

/** Past this many laps the axis labels every fifth one instead of all of them. */
const DENSE_AFTER = 12

/** A lap within this of 1 km is an auto-lap kilometre and gets called "Km n". */
function isKilometre(distanceKm: number): boolean {
  return Math.abs(distanceKm - 1) <= 0.05
}

/**
 * Speed rather than pace, so a taller bar is a faster lap — the direction every
 * reader expects. Computed from distance over time rather than parsed out of the
 * pace string, so a short last lap is measured the same way as a full one.
 */
function speedOf(split: RunSplit): number | null {
  const seconds = durationToSeconds(split.duration)
  return seconds && split.distanceKm > 0 ? split.distanceKm / seconds : null
}

/**
 * Laps shorter than this can still be drawn but cannot be "the fastest". The tail
 * of a run — the last 100m to the door — is routinely its quickest stretch, and
 * crowning it would hide the kilometre that actually was.
 */
const MIN_RANKED_KM = 0.5

const laps = computed(() => {
  const speeds = props.splits.map(speedOf)
  const top = Math.max(0, ...speeds.map((speed) => speed ?? 0))
  const ranked = props.splits.map((split, i) => (split.distanceKm >= MIN_RANKED_KM ? (speeds[i] ?? null) : null))
  const best = Math.max(0, ...ranked.map((speed) => speed ?? 0))
  const fastestCount = ranked.filter((speed) => speed === best).length
  const dense = props.splits.length > DENSE_AFTER

  return props.splits.map((split, i) => {
    const speed = speeds[i] ?? null
    const whole = isKilometre(split.distanceKm)
    const name = whole ? `Km ${i + 1}` : `Lap ${i + 1}`
    return {
      split,
      name,
      // Zero-based: a bar's height is its speed against the fastest lap's, never
      // against the slowest. Truncating the axis would make an even run look like
      // a sawtooth.
      rows: speed && top > 0 ? Math.max(1, Math.round((speed / top) * PLOT_ROWS)) : 0,
      // Only a unique winner gets the marker; on a tie no lap is "the" fastest.
      isFastest:
        ranked[i] !== null && ranked[i] === best && best > 0 && fastestCount === 1 && props.splits.length > 1,
      tick: whole ? String(i + 1) : twoDecimals.format(split.distanceKm),
      showTick: !dense || i === 0 || (i + 1) % 5 === 0 || i === props.splits.length - 1,
    }
  })
})

/** The lap under the pointer or the keyboard cursor; null when neither is on the chart. */
const active = ref<number | null>(null)
const hasFocus = ref(false)

/** Which lap the readout describes: the active one, else the fastest, else the first. */
const shown = computed(() => {
  if (active.value !== null) return active.value
  const fastest = laps.value.findIndex((lap) => lap.isFastest)
  return fastest === -1 ? 0 : fastest
})

const readout = computed(() => {
  const lap = laps.value[shown.value]
  if (!lap) return ''
  const { split } = lap
  const parts = [lap.isFastest && active.value === null ? `⚡ Tercepat: ${lap.name}` : lap.name]
  if (!isKilometre(split.distanceKm)) parts.push(`${twoDecimals.format(split.distanceKm)} km`, split.duration)
  if (split.pace) parts.push(split.pace)
  if (split.avgHr) parts.push(`❤ ${integer.format(split.avgHr)} bpm`)
  if (split.cadence) parts.push(`${integer.format(split.cadence)} spm`)
  if (split.avgPower) parts.push(`${integer.format(split.avgPower)} W`)
  return parts.join(' · ')
})

const bars = ref<(HTMLElement | null)[]>([])

function setBar(el: unknown, i: number) {
  bars.value[i] = el instanceof HTMLElement ? el : null
}

/*
 * One tab stop for the whole chart rather than one per bar — a long run has fifty
 * laps, and fifty stops would be a wall to tab through. Arrow keys move a cursor
 * across the bars instead, the same contract as the pixel canvas.
 */
function onKeydown(event: KeyboardEvent) {
  const count = laps.value.length
  if (!count) return
  const current = active.value ?? shown.value
  let next: number | null = null
  if (event.key === 'ArrowRight') next = Math.min(count - 1, current + 1)
  else if (event.key === 'ArrowLeft') next = Math.max(0, current - 1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  active.value = next
  bars.value[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function onFocus() {
  hasFocus.value = true
  active.value = shown.value
}

function onBlur() {
  hasFocus.value = false
  active.value = null
}

function onPointerLeave() {
  // Keyboard users keep their cursor when the mouse wanders off the chart.
  if (!hasFocus.value) active.value = null
}

interface Column {
  key: string
  header: string
  value: (split: RunSplit) => string | null
}

/**
 * The table view, and the only place every per-lap number is shown at once. The
 * chart is a sketch of the run's shape; this is the record. Columns the watch
 * never filled are dropped, so a wrist-only run does not get a table of dashes.
 */
const columns = computed<Column[]>(() => {
  const all: Column[] = [
    { key: 'distance', header: 'Jarak', value: (s) => `${twoDecimals.format(s.distanceKm)} km` },
    { key: 'duration', header: 'Waktu', value: (s) => s.duration },
    { key: 'pace', header: 'Pace', value: (s) => s.pace },
    { key: 'hr', header: 'HR', value: (s) => (s.avgHr ? `${integer.format(s.avgHr)} bpm` : null) },
    { key: 'cadence', header: 'Cadence', value: (s) => (s.cadence ? `${integer.format(s.cadence)} spm` : null) },
    { key: 'stride', header: 'Langkah', value: (s) => (s.strideLengthM ? `${twoDecimals.format(s.strideLengthM)} m` : null) },
    {
      key: 'oscillation',
      header: 'Osilasi',
      value: (s) => (s.verticalOscillationCm ? `${oneDecimal.format(s.verticalOscillationCm)} cm` : null),
    },
    { key: 'ratio', header: 'Rasio vert.', value: (s) => (s.verticalRatio ? `${oneDecimal.format(s.verticalRatio)}%` : null) },
    { key: 'contact', header: 'Kontak', value: (s) => (s.groundContactMs ? `${integer.format(s.groundContactMs)} ms` : null) },
    { key: 'power', header: 'Power', value: (s) => (s.avgPower ? `${integer.format(s.avgPower)} W` : null) },
    { key: 'elevation', header: 'Naik', value: (s) => (s.elevationGainM ? `${integer.format(s.elevationGainM)} m` : null) },
  ]
  // Distance only earns a column when some lap is not a plain kilometre.
  const showDistance = props.splits.some((split) => !isKilometre(split.distanceKm))
  return all.filter((column) =>
    column.key === 'distance' ? showDistance : props.splits.some((split) => column.value(split) !== null),
  )
})
</script>

<template>
  <div class="splits">
    <p class="splits__readout" aria-live="polite">{{ readout }}</p>

    <div
      class="splits__scroll"
      tabindex="0"
      role="group"
      :aria-label="`Grafik kecepatan, ${laps.length} lap. Panah kiri dan kanan untuk pindah lap. Semua angka ada di tabel di bawahnya.`"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
      @pointerleave="onPointerLeave"
    >
      <ol class="splits__bars" :style="{ '--plot-height': `${PLOT_ROWS * ROW_PX}px` }" aria-hidden="true">
        <li
          v-for="(lap, i) in laps"
          :key="i"
          :ref="(el) => setBar(el, i)"
          class="splits__col"
          :class="{ 'splits__col--active': i === active }"
          @pointerenter="active = i"
          @click="active = i"
        >
          <span class="splits__marker">{{ lap.isFastest ? '⚡' : '' }}</span>
          <span class="splits__plot">
            <span class="splits__bar" :style="{ height: `${lap.rows * ROW_PX}px` }" />
          </span>
          <span class="splits__tick">{{ lap.showTick ? lap.tick : '' }}</span>
        </li>
      </ol>
    </div>

    <p class="splits__caption">Batang lebih tinggi = lap lebih cepat.</p>

    <details class="splits__details">
      <summary class="splits__summary">Lihat semua angka per lap</summary>
      <div class="splits__table-wrap">
        <table class="splits__table">
          <thead>
            <tr>
              <th scope="col">Lap</th>
              <th v-for="column in columns" :key="column.key" scope="col">{{ column.header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(lap, i) in laps" :key="i">
              <th scope="row">
                {{ lap.name }}<template v-if="lap.isFastest">
                  <span aria-hidden="true"> ⚡</span><span class="splits__sr-only">, tercepat</span>
                </template>
              </th>
              <td v-for="column in columns" :key="column.key">{{ column.value(lap.split) ?? '–' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.splits {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.splits__readout {
  min-height: 1.2em;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  color: var(--text-dark);
}

/*
 * The chart scrolls inside itself when a long run's laps outgrow the column; the
 * page never does. Padding leaves room for the focus outline, which the scroll
 * box would otherwise clip.
 */
.splits__scroll {
  overflow-x: auto;
  padding: 4px;
  border-radius: var(--radius-input);
}

.splits__scroll:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/*
 * `max-content` with a 100% floor: few laps stretch to fill the column, many laps
 * keep their 14px minimum and overflow into the scroll box. The baseline below
 * spans whichever is wider.
 */
.splits__bars {
  position: relative;
  display: flex;
  gap: 2px;
  width: max-content;
  min-width: 100%;
  list-style: none;
  padding: 0;
}

.splits__bars::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16px;
  height: 1px;
  background: var(--border);
}

/* The whole column is the hit target, not just the painted bar. */
.splits__col {
  flex: 1 0 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: default;
}

.splits__marker {
  height: 16px;
  font-size: 0.7rem;
  line-height: 16px;
}

.splits__plot {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: var(--plot-height);
}

/* Capped at 24px so a five-lap run reads as five bars, not five slabs. Rounded at
   the data end only; the baseline end stays square. */
.splits__bar {
  display: block;
  width: 100%;
  max-width: 24px;
  background: var(--blue-main);
  border-radius: 4px 4px 0 0;
  transition: background-color var(--motion-fast) var(--ease-flat);
}

.splits__col--active .splits__bar {
  background: var(--blue-deep);
}

.splits__tick {
  height: 16px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.6rem;
  line-height: 16px;
  color: var(--text-medium);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.splits__caption {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.splits__summary {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

/* `inline-flex` drops the native disclosure triangle along with `list-item`, so
   the open state is drawn back in — a glyph swap, not a rotation. */
.splits__summary::before {
  content: '▸';
  margin-right: var(--space-xs);
}

.splits__details[open] .splits__summary::before {
  content: '▾';
}

.splits__summary:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: 4px;
}

.splits__table-wrap {
  overflow-x: auto;
}

.splits__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  color: var(--text-dark);
  font-variant-numeric: tabular-nums;
}

.splits__table th,
.splits__table td {
  padding: 6px var(--space-sm);
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--divider);
}

.splits__table thead th {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-medium);
}

.splits__table th:first-child {
  text-align: left;
}

.splits__table tbody th {
  font-weight: 700;
}

.splits__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
