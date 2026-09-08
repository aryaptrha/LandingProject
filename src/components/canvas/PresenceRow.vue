<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasStatus } from '../../composables/usePixelCanvas'

/**
 * Connection state, viewer count, and what is left of today's quota.
 *
 * Presentational. Everything here is derived from props — the panel decides, this reads
 * out. Kept separate from the board because it updates on a completely different
 * rhythm: presence changes when someone opens a tab, the board changes on every click.
 */
const props = defineProps<{
  status: CanvasStatus
  presence: number
  remaining: number | null
  dailyQuota: number | null
}>()

/** Human phrasing for each state. Indonesian, matching the other panels' body copy. */
const statusLabel = computed(() => {
  switch (props.status) {
    case 'live':
      return 'Tersambung'
    case 'readonly':
      return 'Hanya lihat'
    case 'connecting':
      return 'Menyambung…'
    case 'disabled':
      return 'Dimatikan'
    default:
      return 'Terputus'
  }
})

const viewerLabel = computed(() => (props.presence === 1 ? '1 orang di sini' : `${props.presence} orang di sini`))
</script>

<template>
  <!--
    `role="status"` so the connection state is announced when it changes, and nothing in
    here is ever tweened. `design.md`'s rule is blunt about why: a screen reader
    re-announces a live region on every frame, so a counted-up number inside one is read
    aloud dozens of times. The viewer count snaps.
  -->
  <div class="presence" role="status">
    <span class="presence__state" :class="`presence__state--${props.status}`">
      <!-- The dot is decoration; `statusLabel` is the actual signal, because state is
           never colour alone. -->
      <span class="presence__dot" aria-hidden="true"></span>
      {{ statusLabel }}
    </span>

    <span class="presence__viewers">{{ viewerLabel }}</span>

    <span v-if="props.remaining !== null && props.dailyQuota !== null" class="presence__quota">
      {{ props.remaining }}/{{ props.dailyQuota }} piksel tersisa hari ini
    </span>
  </div>
</template>

<style scoped>
.presence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm) var(--space-md);
  font-size: 0.85rem;
  color: var(--text-medium);
}

.presence__state {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-weight: 700;
  color: var(--text-dark);
}

.presence__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-medium);
}

.presence__state--live .presence__dot {
  background: var(--green-main);
}

.presence__state--readonly .presence__dot,
.presence__state--connecting .presence__dot {
  background: var(--yellow-main);
}

.presence__state--offline .presence__dot,
.presence__state--disabled .presence__dot {
  background: var(--pink-main);
}

.presence__viewers,
.presence__quota {
  /*
   * Both are polled numbers whose width would otherwise shift as digits change —
   * 1 -> 2 viewers, 150 -> 149 pixels. `design.md` requires tabular figures on any
   * animated or polled readout for exactly this.
   */
  font-variant-numeric: tabular-nums;
}
</style>
