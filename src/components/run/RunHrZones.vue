<script setup lang="ts">
import { computed } from 'vue'
import { durationToSeconds } from '@/composables/useRuns'

const props = defineProps<{
  /** Time in zones 1 to 5, as the sync's duration strings. */
  zones: string[]
}>()

/** Garmin's own zone names, in Indonesian. */
const ZONE_NAMES = ['Pemanasan', 'Santai', 'Aerobik', 'Ambang', 'Maksimal'] as const

/**
 * One row per zone, one color for all of them.
 *
 * Not the stacked five-color bar a fitness app would draw, and on purpose: run
 * through the palette validator, no five of design.md's pastels can be told apart
 * as categories — adjacent pairs like blue and green sit far below the
 * normal-vision floor, never mind colour-blind readers. A zone's identity is its
 * row and its label instead, which every reader gets, and the colour is left to
 * mean only "time".
 */
const rows = computed(() => {
  const seconds = props.zones.map((zone) => durationToSeconds(zone) ?? 0)
  const total = seconds.reduce((sum, value) => sum + value, 0)
  const top = Math.max(0, ...seconds)

  return props.zones.map((zone, i) => {
    const value = seconds[i] ?? 0
    const share = total > 0 ? Math.round((value / total) * 100) : 0
    return {
      key: `Z${i + 1}`,
      name: ZONE_NAMES[i] ?? '',
      time: zone,
      share,
      // Scaled against the largest zone, as in EdgeInsights: scaled by total, an
      // easy run would draw four slivers and one bar. A zone with no time keeps an
      // empty track rather than the 6% floor, because zero is a real answer here.
      scale: top > 0 && value > 0 ? Math.max(6, (value / top) * 100) / 100 : 0,
      label: `Zona ${i + 1} (${ZONE_NAMES[i] ?? ''}): ${zone}, ${share}% dari total waktu`,
    }
  })
})
</script>

<template>
  <ul class="zones">
    <li v-for="row in rows" :key="row.key" class="zones__row" role="img" :aria-label="row.label">
      <span class="zones__key" aria-hidden="true">{{ row.key }}</span>
      <span class="zones__name" aria-hidden="true">{{ row.name }}</span>
      <span class="zones__track" aria-hidden="true">
        <span class="zones__fill" :style="{ transform: `scaleX(${row.scale})` }" />
      </span>
      <span class="zones__value" aria-hidden="true">
        {{ row.time }} <span class="zones__share">· {{ row.share }}%</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.zones {
  display: flex;
  flex-direction: column;
  gap: 6px;
  list-style: none;
  padding: 0;
}

.zones__row {
  display: grid;
  grid-template-columns: 1.6rem 4.6rem 1fr auto;
  align-items: center;
  gap: var(--space-sm);
}

.zones__key {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dark);
}

.zones__name {
  font-size: 0.7rem;
  color: var(--text-medium);
  white-space: nowrap;
}

.zones__track {
  height: 10px;
  background: var(--divider);
  border-radius: var(--radius-badge);
  overflow: hidden;
}

/* scaleX rather than width, for the reason given on `.insights__bar-fill`. */
.zones__fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--pink-main);
  border-radius: var(--radius-badge);
  transform-origin: left center;
  transition: transform var(--motion-base) var(--ease-settle);
}

.zones__value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  color: var(--text-dark);
  text-align: right;
  white-space: nowrap;
  /* A column of times that should line up, which is what tabular figures are for. */
  font-variant-numeric: tabular-nums;
}

.zones__share {
  color: var(--text-medium);
}

@media (max-width: 420px) {
  .zones__row {
    grid-template-columns: 1.6rem 1fr auto;
  }

  .zones__name {
    display: none;
  }
}
</style>
