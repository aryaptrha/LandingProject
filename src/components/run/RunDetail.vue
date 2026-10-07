<script setup lang="ts">
import { computed } from 'vue'
import type { PublicRun } from '@/composables/useRuns'
import RunHrZones from './RunHrZones.vue'
import RunSplitsChart from './RunSplitsChart.vue'

const props = defineProps<{
  run: PublicRun
  /** Full date, already formatted by the panel, which knows the snapshot's timezone. */
  dateLabel: string
}>()

const integer = new Intl.NumberFormat('id-ID')
const oneDecimal = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const twoDecimals = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Tile {
  key: string
  label: string
  value: string
  unit?: string
  note?: string
  /** Hero tiles only: which pastel the tile is filled with. */
  tone?: 'blue' | 'green' | 'yellow' | 'lavender'
}

/**
 * Drops the tiles whose reading is missing. Most of a run's numbers are optional
 * — a wrist-only watch records no stride or ground contact — and a tile reading
 * "–" says nothing except that the watch was not wearing a chest strap.
 */
function present(tiles: Array<Tile | null>): Tile[] {
  return tiles.filter((tile): tile is Tile => tile !== null)
}

/** The four numbers a runner reads first, one flat pastel each. */
const hero = computed(() => {
  const run = props.run
  return present([
    { key: 'distance', label: 'Jarak', value: twoDecimals.format(run.distanceKm), unit: 'km', tone: 'blue' },
    { key: 'duration', label: 'Waktu', value: run.duration, tone: 'green' },
    run.pace ? { key: 'pace', label: 'Pace', value: run.pace.replace(/\/km$/, ''), unit: '/km', tone: 'yellow' } : null,
    run.elevationGainM
      ? { key: 'elevation', label: 'Elevasi naik', value: integer.format(run.elevationGainM), unit: 'm', tone: 'lavender' }
      : null,
  ])
})

const heart = computed(() => {
  const run = props.run
  return present([
    run.avgHr ? { key: 'avg', label: 'Rata-rata', value: integer.format(run.avgHr), unit: 'bpm' } : null,
    run.maxHr ? { key: 'max', label: 'Maksimal', value: integer.format(run.maxHr), unit: 'bpm' } : null,
  ])
})

const steps = computed(() => {
  const run = props.run
  return present([
    run.cadence
      ? {
          key: 'cadence',
          label: 'Cadence',
          value: integer.format(run.cadence),
          unit: 'spm',
          note: run.maxCadence ? `maks ${integer.format(run.maxCadence)}` : undefined,
        }
      : null,
    run.strideLengthM
      ? { key: 'stride', label: 'Panjang langkah', value: twoDecimals.format(run.strideLengthM), unit: 'm' }
      : null,
    run.verticalOscillationCm
      ? { key: 'oscillation', label: 'Osilasi vertikal', value: oneDecimal.format(run.verticalOscillationCm), unit: 'cm' }
      : null,
    run.verticalRatio
      ? { key: 'ratio', label: 'Rasio vertikal', value: oneDecimal.format(run.verticalRatio), unit: '%' }
      : null,
    run.groundContactMs
      ? { key: 'contact', label: 'Kontak tanah', value: integer.format(run.groundContactMs), unit: 'ms' }
      : null,
    run.avgPower ? { key: 'power', label: 'Power', value: integer.format(run.avgPower), unit: 'W' } : null,
  ])
})

/** Garmin's own wording for each band of its 0–5 training-effect scale. */
function verdictFor(value: number): string {
  if (value < 1) return 'Tanpa efek'
  if (value < 2) return 'Ringan'
  if (value < 3) return 'Menjaga'
  if (value < 4) return 'Meningkatkan'
  if (value < 5) return 'Sangat meningkatkan'
  return 'Berlebihan'
}

/**
 * Training effect as five pips, each filled by however much of that point the
 * score covers — 3.2 is three full pips and a fifth of the fourth. The number and
 * Garmin's verdict sit beside it in text, so the pips are a picture of the score
 * rather than the only statement of it.
 */
const effects = computed(() => {
  const effect = props.run.trainingEffect
  if (!effect) return []
  const meters = [
    { key: 'aerobic', label: 'Aerobik', value: effect.aerobic },
    { key: 'anaerobic', label: 'Anaerobik', value: effect.anaerobic },
  ]
  return meters.flatMap((meter) => {
    if (meter.value === null) return []
    const value = meter.value
    const text = oneDecimal.format(value)
    const verdict = verdictFor(value)
    return [
      {
        key: meter.key,
        label: meter.label,
        text,
        verdict,
        pips: [0, 1, 2, 3, 4].map((i) => Math.min(1, Math.max(0, value - i))),
        aria: `${meter.label} ${text} dari 5, ${verdict}`,
      },
    ]
  })
})

const effectLabel = computed(() => props.run.trainingEffect?.label ?? null)
const hasHeart = computed(() => heart.value.length > 0 || props.run.hrZones !== null)
const hasEffect = computed(() => effects.value.length > 0 || props.run.trainingLoad !== null)
</script>

<template>
  <div class="detail">
    <p class="detail__date">
      <span>{{ dateLabel }}</span>
      <span v-if="effectLabel" class="detail__chip" title="Label sesi dari Garmin">{{ effectLabel }}</span>
    </p>

    <div class="detail__hero m-cascade">
      <div v-for="tile in hero" :key="tile.key" class="detail__hero-tile" :class="`detail__hero-tile--${tile.tone}`">
        <span class="detail__hero-value">
          {{ tile.value }}<span v-if="tile.unit" class="detail__unit"> {{ tile.unit }}</span>
        </span>
        <span class="detail__label">{{ tile.label }}</span>
      </div>
    </div>

    <!--
      Heart on the left, everything else stacked on the right. The zone list makes
      the heart card the tallest by far, so pairing it with one short card left a
      hole beside it; two short cards fill it.
    -->
    <div v-if="hasHeart || hasEffect || steps.length" class="detail__pair">
      <div v-if="hasHeart" class="detail__card">
        <h3 class="detail__card-title">❤️ Jantung</h3>
        <div v-if="heart.length" class="detail__tiles">
          <div v-for="tile in heart" :key="tile.key" class="detail__tile">
            <span class="detail__value">
              {{ tile.value }}<span v-if="tile.unit" class="detail__unit"> {{ tile.unit }}</span>
            </span>
            <span class="detail__label">{{ tile.label }}</span>
          </div>
        </div>
        <template v-if="run.hrZones">
          <h4 class="detail__sub-title">Waktu di tiap zona</h4>
          <RunHrZones :zones="run.hrZones" />
        </template>
      </div>

      <div v-if="hasEffect || steps.length" class="detail__stack">
        <div v-if="hasEffect" class="detail__card">
          <h3 class="detail__card-title">🔥 Efek latihan</h3>
          <ul v-if="effects.length" class="detail__effects">
            <li v-for="effect in effects" :key="effect.key" class="detail__effect" role="img" :aria-label="effect.aria">
              <span class="detail__effect-name" aria-hidden="true">{{ effect.label }}</span>
              <span class="detail__pips" aria-hidden="true">
                <span v-for="(fill, i) in effect.pips" :key="i" class="detail__pip">
                  <span
                    class="detail__pip-fill"
                    :class="`detail__pip-fill--${effect.key}`"
                    :style="{ transform: `scaleX(${fill})` }"
                  />
                </span>
              </span>
              <span class="detail__effect-score" aria-hidden="true">{{ effect.text }}</span>
              <span class="detail__effect-verdict" aria-hidden="true">{{ effect.verdict }}</span>
            </li>
          </ul>
          <p v-if="run.trainingLoad !== null" class="detail__load">
            Training load <strong class="detail__load-value">{{ integer.format(run.trainingLoad) }}</strong>
          </p>
        </div>

        <div v-if="steps.length" class="detail__card">
          <h3 class="detail__card-title">👟 Langkah</h3>
          <div class="detail__tiles">
            <div v-for="tile in steps" :key="tile.key" class="detail__tile">
              <span class="detail__value">
                {{ tile.value }}<span v-if="tile.unit" class="detail__unit"> {{ tile.unit }}</span>
              </span>
              <span class="detail__label">{{ tile.label }}</span>
              <span v-if="tile.note" class="detail__note">{{ tile.note }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="run.splits" class="detail__card">
      <h3 class="detail__card-title">📍 Splits</h3>
      <RunSplitsChart :splits="run.splits" />
    </div>
  </div>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.detail__date {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dark);
}

.detail__chip {
  padding: 1px 10px;
  background: var(--lavender-light);
  border: 2px solid var(--lavender-main);
  border-radius: var(--radius-badge);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: help;
}

.detail__hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-sm);
}

.detail__hero-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-md);
  border: 2px solid;
  border-radius: var(--radius-input);
}

.detail__hero-tile--blue {
  background: var(--blue-light);
  border-color: var(--blue-main);
}

.detail__hero-tile--green {
  background: var(--green-light);
  border-color: var(--green-main);
}

.detail__hero-tile--yellow {
  background: var(--yellow-light);
  border-color: var(--yellow-main);
}

.detail__hero-tile--lavender {
  background: var(--lavender-light);
  border-color: var(--lavender-main);
}

/* Proportional figures: these stand alone and are never tweened, so tabular
   digits would only make them look loose. */
.detail__hero-value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-dark);
}

.detail__unit {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-medium);
}

.detail__label {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.detail__pair {
  display: grid;
  /* `min()` so a phone's column, narrower than 280px, gets one full-width track
     instead of a 280px one hanging over the panel's edge. */
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: var(--space-md);
}

.detail__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--surface-sunken);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
}

.detail__card-title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dark);
}

.detail__sub-title {
  margin-top: var(--space-xs);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-medium);
}

.detail__tiles {
  display: grid;
  /* 96px is what lets two tiles share a card on a 360px phone. */
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: var(--space-sm);
}

.detail__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-sm) var(--space-md);
  background: var(--surface);
  border-radius: 10px;
}

.detail__value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-dark);
}

.detail__note {
  font-size: 0.65rem;
  color: var(--text-medium);
}

.detail__effects {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  list-style: none;
  padding: 0;
}

/* One line per scale: name, pips, score, verdict — read left to right like a
   sentence, "Aerobik ■■■□□ 3,2 Meningkatkan". Flex rather than grid so that on a
   phone the verdict wraps under the pips instead of being squeezed to nothing. */
.detail__effect {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs) var(--space-sm);
}

.detail__effect-name {
  width: 4.6rem;
  font-size: 0.75rem;
  color: var(--text-dark);
}

.detail__effect-score {
  min-width: 1.8rem;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dark);
}

.detail__pips {
  display: flex;
  gap: 4px;
}

/* Square, like every other pixel on the page. The fill is a scaleX so a
   fractional point reads as a part-filled pip without a second element. */
.detail__pip {
  width: 16px;
  height: 16px;
  background: var(--surface);
  border: 2px solid var(--border);
  overflow: hidden;
}

.detail__pip-fill {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
}

.detail__pip-fill--aerobic {
  background: var(--blue-main);
}

.detail__pip-fill--anaerobic {
  background: var(--pink-main);
}

.detail__effect-verdict {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.detail__load {
  font-size: 0.75rem;
  color: var(--text-medium);
}

.detail__load-value {
  margin-left: var(--space-xs);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  color: var(--text-dark);
}

.detail__stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
</style>
