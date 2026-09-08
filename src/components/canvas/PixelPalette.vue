<script setup lang="ts">
import { PALETTE, EMPTY_CELL } from '../../utils/pixelBoard'

/**
 * The colour picker. Presentational — it holds no selection state, it reports clicks.
 *
 * Index 0 is the empty cell and is not offered: a palette entry that erases would let
 * one visitor undo the whole board, and there is no per-cell ownership to appeal to.
 */
const props = defineProps<{
  /** Resolved colours for the active theme, index-aligned with `PALETTE`. */
  colors: string[]
  /** Currently selected palette index. */
  selected: number
  /** True while the board is read-only or the socket is down. */
  disabled: boolean
}>()

const emit = defineEmits<{ select: [index: number] }>()

/** Every paintable entry, paired with its index so the template needn't do arithmetic. */
const swatches = PALETTE.map((entry, index) => ({ index, label: entry.label })).filter(
  (s) => s.index !== EMPTY_CELL,
)
</script>

<template>
  <div class="palette" role="radiogroup" aria-label="Pixel colour">
    <button
      v-for="swatch in swatches"
      :key="swatch.index"
      type="button"
      role="radio"
      class="palette__swatch"
      :class="{ 'palette__swatch--active': swatch.index === props.selected }"
      :style="{ '--swatch': props.colors[swatch.index] ?? '#888888' }"
      :aria-checked="swatch.index === props.selected"
      :aria-label="swatch.label"
      :disabled="props.disabled"
      @click="emit('select', swatch.index)"
    >
      <!--
        The check is the non-colour half of the selected signal, and it is why this
        button has content at all. `design.md` forbids colour as the only indicator of
        state, and on a palette that rule bites hardest: the thing being selected *is* a
        colour, so a coloured selection cue is invisible to the people it is for. The
        border alone would also fail — two adjacent pastels differ by less contrast than
        a border does.
      -->
      <svg
        v-if="swatch.index === props.selected"
        class="palette__check"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
      >
        <!--
          Hand-authored on a 16px grid with whole-pixel rects, per `design.md`: no
          strokes, no curves, nothing that anti-aliases when the swatch scales.
        -->
        <rect x="2" y="8" width="2" height="2" />
        <rect x="4" y="10" width="2" height="2" />
        <rect x="6" y="12" width="2" height="2" />
        <rect x="8" y="10" width="2" height="2" />
        <rect x="10" y="8" width="2" height="2" />
        <rect x="12" y="6" width="2" height="2" />
        <rect x="14" y="4" width="2" height="2" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.palette__swatch {
  /*
   * 44px is `design.md`'s minimum hit area, not a visual choice — one board cell at
   * this zoom is around 8px, so the swatches are the only comfortably clickable
   * control in the panel and shrinking them would leave the feature with none.
   */
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  /* Solid, never glass: `design.md` reserves glass for the surrounding panel and keeps
     buttons, badges and chips flat. A translucent swatch would also misreport its own
     colour, which is the one thing it exists to show. */
  background: var(--swatch);
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--ease-settle),
    border-color var(--motion-fast) var(--ease-flat);
}

.palette__swatch:hover:not(:disabled) {
  /* Within `design.md`'s 1.00 -> 1.02 range; no lift, because these sit in a wrapping
     row and a shadow would cross the gap onto its neighbour. */
  transform: scale(var(--motion-scale));
}

.palette__swatch:focus-visible {
  outline: 2px solid var(--text-dark);
  outline-offset: 2px;
}

.palette__swatch--active {
  border-color: var(--text-dark);
  border-width: 3px;
}

.palette__swatch:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.palette__check {
  /* `--text-dark` on every swatch: the palette is pastel by construction, so ink always
     clears 4.5:1 against it and a per-swatch contrast calculation would be theatre. */
  fill: var(--text-dark);
  /* Whole pixels only — this is a 16-grid sprite, so any fractional scale would blur
     edges the SVG was authored to keep crisp. */
  shape-rendering: crispEdges;
}
</style>
