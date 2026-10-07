<script lang="ts">
/** A small achievement one run earns against the other two, e.g. "longest". */
export interface RunBadge {
  key: string
  icon: string
  label: string
  tone: 'yellow' | 'pink' | 'green'
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import type { PublicRun } from '@/composables/useRuns'

/**
 * The face of one save slot. Content only: the `<button role="tab">` around it
 * lives in MyRun.vue, which owns selection and the arrow-key roving between slots.
 * Everything in here is therefore phrasing content — spans, no blocks.
 */
const props = defineProps<{
  run: PublicRun
  index: number
  dateLabel: string
  badges: RunBadge[]
  active: boolean
}>()

const twoDecimals = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A marathon's worth. Past it the strip stops growing rather than wrapping forever. */
const MAX_BLOCKS = 43

/**
 * One block per whole kilometre and a lighter one for the remainder, so the three
 * slots compare at a glance before any number is read. Purely decorative — the
 * distance is right above it as text — so it is hidden from assistive tech.
 */
const blocks = computed(() => {
  const whole = Math.floor(props.run.distanceKm)
  const list: Array<'full' | 'part'> = Array.from({ length: Math.min(whole, MAX_BLOCKS) }, () => 'full')
  if (props.run.distanceKm - whole >= 0.05 && list.length < MAX_BLOCKS) list.push('part')
  return list
})

const pace = computed(() => props.run.pace?.replace(/\/km$/, '') ?? null)
</script>

<template>
  <span class="slot">
    <span class="slot__top">
      <span class="slot__label">SLOT {{ index + 1 }}</span>
      <span class="slot__cursor" aria-hidden="true">{{ active ? '▶' : '' }}</span>
    </span>
    <span class="slot__date">{{ dateLabel }}</span>
    <span class="slot__distance">
      {{ twoDecimals.format(run.distanceKm) }}<span class="slot__unit"> km</span>
    </span>
    <span class="slot__meta">
      <template v-if="pace">{{ pace }}/km · </template>{{ run.duration }}
    </span>
    <span class="slot__blocks" aria-hidden="true">
      <span
        v-for="(block, i) in blocks"
        :key="i"
        class="slot__block"
        :class="{ 'slot__block--part': block === 'part' }"
      />
    </span>
    <span v-if="badges.length" class="slot__badges">
      <span
        v-for="badge in badges"
        :key="badge.key"
        class="slot__badge"
        :class="`slot__badge--${badge.tone}`"
      >
        <span aria-hidden="true">{{ badge.icon }}</span> {{ badge.label }}
      </span>
    </span>
  </span>
</template>

<style scoped>
.slot {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.slot__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xs);
}

.slot__label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-medium);
}

.slot__cursor {
  font-size: 0.7rem;
  line-height: 1;
  color: var(--text-dark);
}

.slot__date {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dark);
}

.slot__distance {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-dark);
}

.slot__unit {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-medium);
}

.slot__meta {
  font-size: 0.75rem;
  color: var(--text-medium);
}

.slot__blocks {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: var(--space-sm);
}

/* Square on purpose: these are pixels, and design.md keeps pixels square. */
.slot__block {
  width: 6px;
  height: 6px;
  background: var(--green-main);
}

.slot__block--part {
  background: var(--green-light);
  box-shadow: inset 0 0 0 1px var(--green-main);
}

.slot__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}

.slot__badge {
  padding: 1px 8px;
  border: 2px solid;
  border-radius: var(--radius-badge);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dark);
  white-space: nowrap;
}

.slot__badge--yellow {
  background: var(--yellow-light);
  border-color: var(--yellow-main);
}

.slot__badge--pink {
  background: var(--pink-light);
  border-color: var(--pink-main);
}

.slot__badge--green {
  background: var(--green-light);
  border-color: var(--green-main);
}
</style>
