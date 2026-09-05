<script setup lang="ts">
import { computed, ref } from 'vue'
import { useViewMode, type ViewMode } from '../composables/useViewMode'
import { useRetroSound } from '../composables/useRetroSound'
import { VIEW_MODE_COPY } from '../data/viewModes'
import { originOf, runRevealTransition } from '../utils/themeTransition'

/**
 * Order is both the visual order and the arrow-key order, and it is deliberate:
 * the default view comes first, so moving right reads as asking for more detail.
 */
const MODES: ViewMode[] = ['visitor', 'dev']

const { mode, setMode } = useViewMode()
const { playToggle } = useRetroSound()

// The reveal grows from whichever segment was chosen, so the group has to be
// reachable in order to measure them at press time.
const groupRef = ref<HTMLElement | null>(null)

const checkedIndex = computed(() => MODES.indexOf(mode.value))

function wrap(index: number): number {
  return (index + MODES.length) % MODES.length
}

function segmentAt(index: number): HTMLButtonElement | null {
  const items = groupRef.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
  return items?.[index] ?? null
}

/**
 * Selects the view at `index`, wrapping around the ends.
 *
 * Focus moves *before* the state change rather than after. A radio group is
 * expected to carry focus with its selection, and going first sidesteps the
 * ordering problem the reveal introduces: `runRevealTransition` applies the
 * mutation inside the browser snapshot callback, so the roving `tabindex` has not
 * moved yet by the time this returns. Nothing needs to wait for it either — a
 * button is programmatically focusable even at `tabindex="-1"`.
 */
function select(rawIndex: number) {
  const index = wrap(rawIndex)
  const next = MODES[index]
  if (!next) return

  const segment = segmentAt(index)
  segment?.focus()

  // Home/End can land on the segment that is already checked. Running the reveal
  // for that would spend 300ms uncovering the page it started from.
  if (next === mode.value) return

  playToggle()
  runRevealTransition(originOf(segment), () => setMode(next), 'view')
}

/**
 * Arrows move the selection, per the radio-group pattern — in a radio group,
 * moving focus *is* choosing, which is why there is no separate "focus without
 * selecting" path here. Enter and Space need no handling at all: these are real
 * `<button>`s, so the browser already turns both into a click.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      select(checkedIndex.value + 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      select(checkedIndex.value - 1)
      break
    case 'Home':
      select(0)
      break
    case 'End':
      select(MODES.length - 1)
      break
    default:
      return
  }

  // Only once a key is claimed, so the arrows still scroll the page as usual
  // everywhere else.
  event.preventDefault()
}

const stateText = computed(() => `${VIEW_MODE_COPY[mode.value].label} view`)
</script>

<template>
  <div class="view-toggle">
    <!--
      A radio group, not a pair of toggle buttons. The two views are mutually
      exclusive and exactly one is always on, which is what `radiogroup` states and
      what `aria-pressed` on two independent buttons cannot. The roving `tabindex`
      keeps the pair a single Tab stop, so the switch costs one keystroke to reach
      and one to change rather than two of each.
    -->
    <div
      ref="groupRef"
      class="view-toggle__group"
      role="radiogroup"
      aria-label="View mode"
      @keydown="onKeydown"
    >
      <button
        v-for="(id, index) in MODES"
        :key="id"
        class="view-toggle__option"
        type="button"
        role="radio"
        :aria-checked="id === mode"
        :tabindex="id === mode ? 0 : -1"
        :title="VIEW_MODE_COPY[id].description"
        @click="select(index)"
      >
        <!-- The second signal for which view is on, so the state never rests on
             colour alone. Square and unrounded — a pixel, in a design language made
             of them. Always rendered and faded rather than inserted and removed, so
             the labels hold still as the selection moves. -->
        <span class="view-toggle__marker" aria-hidden="true"></span>
        {{ VIEW_MODE_COPY[id].label }}
      </button>
    </div>

    <!-- Announced on change. A pointer press on a <button> focuses it in most
         browsers but not all, and with focus left behind there is nothing to make a
         screen reader re-read the newly checked radio. Silent on first render (a
         live region only speaks on subsequent changes). Kept outside the radiogroup
         so it is not counted as one of its options. -->
    <span class="view-toggle__status" role="status">{{ stateText }}</span>
  </div>
</template>

<style scoped>
.view-toggle {
  position: relative;
  display: inline-flex;
}

/*
 * Solid, not glass: design.md reserves glass for surfaces, and this is a control.
 * The track sits one shade off the page so the unchecked half still reads as part
 * of a switch rather than as a stray word next to a button.
 */
.view-toggle__group {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--surface-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-badge);
}

/*
 * 44px tall to clear the design.md touch target. `min-width` is equal on both
 * segments rather than letting each size to its own label: a switch whose halves
 * change width as you press them reads as broken, and "Visitor" is more than twice
 * the length of "Dev". No `overflow: hidden` on the track either — it would clip
 * the focus outline of whichever segment is focused.
 */
.view-toggle__option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  min-width: 104px;
  min-height: 44px;
  padding: 0 var(--space-md);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-medium);
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: var(--radius-badge);
  cursor: pointer;
  transition:
    transform var(--motion-fast) var(--ease-flat),
    background-color var(--motion-fast) var(--ease-flat),
    border-color var(--motion-fast) var(--ease-flat),
    color var(--motion-fast) var(--ease-flat);
}

.view-toggle__option[aria-checked='true'] {
  color: var(--text-dark);
  background: var(--blue-light);
  border-color: var(--blue-main);
  cursor: default;
}

/*
 * Only the unchecked half lifts. The checked one is already the pressed-in state
 * of this control, so lifting it would say the opposite of what it is. Whole
 * pixels, no scale: these labels are set in Pixelify Sans, and a 1.02 scale would
 * land its strokes between device pixels and soften them.
 */
.view-toggle__option:hover:not([aria-checked='true']) {
  color: var(--text-dark);
  background: var(--surface-hover-wash);
  transform: translateY(-2px);
}

.view-toggle__option:active:not([aria-checked='true']) {
  transform: translateY(0);
}

.view-toggle__option:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.view-toggle__marker {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: currentColor;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-flat);
}

.view-toggle__option[aria-checked='true'] .view-toggle__marker {
  opacity: 1;
}

/* Visually hidden but exposed to assistive tech (no repo-wide utility exists). */
.view-toggle__status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 480px) {
  .view-toggle__option {
    min-width: 92px;
    font-size: 0.9rem;
  }
}
</style>
