<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useEdgeDock } from '../../composables/useEdgeDock'
import { useMusicPlayer } from '../../composables/useMusicPlayer'
import IconMusicNote from './icons/IconMusicNote.vue'

/*
 * The drawer, the track list, the controls and their six icons all sit behind this
 * boundary, so none of that markup or CSS is in the chunk that renders the page.
 * Vite emits it as its own JS + CSS pair, fetched the first time the tab is opened.
 *
 * The tab below is the only part that ships eagerly — it has to be, since it is
 * what the visitor clicks. `useMusicPlayer` comes with it so the tab can show that
 * something is playing while the drawer is closed; that is the whole reason it is
 * on this side of the split.
 */
const MusicPlayerDrawer = defineAsyncComponent(() => import('./MusicPlayerDrawer.vue'))

const { isPlaying } = useMusicPlayer()
const isOpen = ref(false)

/*
 * The tab and the drawer move as one piece, so the two of them live in a dock that
 * is the fixed-position element — the tab is a flex child of it now rather than
 * positioning itself. That is what keeps the panel attached to the tab wherever the
 * visitor parks it, without either of them having to know the other's coordinates.
 *
 * Only the left and right edges are on offer, by design: the tab's label is set in
 * `writing-mode: vertical-rl`, so it reads as a pull tab on a side and would read as
 * a toppled one along the top or bottom.
 */
const dockEl = ref<HTMLElement | null>(null)
const { side, isDragging, isStepping, dockStyle, startDrag, shouldIgnoreClick, onKeydown } =
  useEdgeDock(dockEl, {
    // Right edge, vertically centred — where the tab sat before it could be moved.
    storageKey: 'portfolio_music_dock',
    defaultSide: 'right',
    defaultCenter: 0.5,
  })

function onTabPointerdown(event: PointerEvent) {
  // Touch never fires `mouseenter` before the tap lands, so this is the only warm-up
  // a phone gets — and it still buys the whole press-and-release for the fetch.
  prefetchDrawer()
  startDrag(event)
}

function onTabClick() {
  // A finished drag ends with a click on the tab; that one must not also toggle.
  if (shouldIgnoreClick()) return
  isOpen.value = !isOpen.value
}

let prefetched = false

/**
 * Warms the drawer chunk on intent rather than on click. Two payoffs: the panel is
 * already parsed by the time the click lands, and the open transition actually
 * plays — a chunk still in flight mounts after the transition window has passed,
 * so a cold first open would otherwise just appear.
 *
 * Vite resolves this to the same module as the `defineAsyncComponent` loader above,
 * so it is one request, not two.
 */
function prefetchDrawer() {
  if (prefetched) return
  prefetched = true
  void import('./MusicPlayerDrawer.vue')
}
</script>

<template>
  <div
    ref="dockEl"
    class="music-dock"
    :class="[
      `music-dock--${side}`,
      { 'music-dock--stepping': isStepping, 'music-dock--dragging': isDragging },
    ]"
    :style="dockStyle"
  >
    <!--
      `aria-controls` is bound only while the drawer exists. Pointing it at an absent
      id is an accessibility-validator error, and `aria-expanded` carries the state on
      its own regardless.
    -->
    <button
      type="button"
      class="music-tab"
      :class="{ 'music-tab--open': isOpen }"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? 'music-drawer' : undefined"
      :aria-label="isOpen ? 'Close music player' : 'Open music player'"
      :title="isOpen ? 'Close music player' : 'Music'"
      aria-describedby="music-tab-hint"
      @mouseenter="prefetchDrawer"
      @focus="prefetchDrawer"
      @pointerdown="onTabPointerdown"
      @keydown="onKeydown"
      @click="onTabClick"
    >
      <IconMusicNote class="music-tab__icon" />
      <span class="music-tab__label">MUSIC</span>
      <!--
        Presence, not hue, is the signal — design.md rules out colour-only state. The
        span is always rendered and only its fill toggles, so the icon and label above
        don't shuffle 5px every time playback starts or stops.
      -->
      <span
        class="music-tab__dot"
        :class="{ 'music-tab__dot--on': isPlaying }"
        aria-hidden="true"
      ></span>
    </button>

    <!--
      The grab cursor announces the drag to a mouse, and nothing announces it to a
      screen reader, so this does — including the keyboard route, which is also the
      no-dragging alternative WCAG 2.5.7 asks for. Sits outside the tab, described
      into it, so the tab's own label stays the short thing it should be.
    -->
    <span id="music-tab-hint" class="music-dock__hint"
      >Drag this tab, or press the arrow keys, to move it along either edge of the
      screen.</span
    >

    <Transition name="music-drawer-anim">
      <MusicPlayerDrawer v-if="isOpen" id="music-drawer" @close="isOpen = false" />
    </Transition>
  </div>
</template>

<style scoped>
/*
 * The dock is the only fixed-position box in this widget: the tab and the drawer are
 * its flex children, so they travel together. Vertical position arrives as an inline
 * `top`, already clamped by `useEdgeDock` — see the note there for why it is not a
 * translate. The edge comes in as a class, because `left: 0` / `right: 0` beats any
 * width the script could measure.
 */
.music-dock {
  position: fixed;
  z-index: 1001;
  display: flex;
  align-items: center;
  /* The dock's box spans the tab and the panel side by side, which leaves a dead
     column above and below the tab. Without this, that dead space would swallow
     clicks meant for the page behind it. Restored on each child that wants them. */
  pointer-events: none;
}

/*
 * Easing is opt-in, not the default — see `isStepping` for why. Arrow-key steps are
 * the only move that gets it, at 200ms, the top of the design.md motion budget.
 */
.music-dock--stepping {
  transition: top 0.2s ease;
}

.music-dock--right {
  right: 0;
  /* Panel first in the visual order, tab last, so the tab keeps the edge. */
  flex-direction: row-reverse;
  --music-dock-slide: 12px;
}

.music-dock--left {
  left: 0;
  flex-direction: row;
  /* The drawer slides out of the tab, so its entry direction mirrors with the side.
     Read in MusicPlayerDrawer.vue, which inherits it from here. */
  --music-dock-slide: -12px;
}

/* Below `--stepping` on purpose: same specificity, so source order is what lets this
   win and hand the pointer a 1:1 response if a drag begins inside the step window. */
.music-dock--dragging {
  transition: none;
}

/* Visually hidden, still announced. No shared utility for this in the codebase yet,
   and one class is not worth a global. */
.music-dock__hint {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Solid fill, not glass — glass is reserved for surfaces, per design.md. */
.music-tab {
  /* Positioned only to sit above the panel's edge while the panel scales in. */
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: var(--space-xs);
  pointer-events: auto;
  /* The browser must not claim a vertical swipe that starts here for scrolling —
     that swipe is the drag. Costs page scrolling from this 44px sliver, which is the
     trade every draggable handle makes. */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  /* 44px wide keeps the touch target legal even though the tab is a thin sliver.
     Height is left to the content on purpose: Pixelify Sans loads with
     `display=swap`, so the vertical label is measured in fallback monospace first
     and again after the swap, and any fixed height would clip in one of the two
     states. The padding alone already puts it far past the 44px minimum. */
  width: 44px;
  padding: var(--space-md) 0;
  color: var(--text-dark);
  background: var(--surface-muted);
  border: 1.5px solid var(--border);
  /* Width, not `border-right: none` — that shorthand would also reset the edge's colour
     to `currentColor`, and the left-dock rule below re-opens this very border. */
  border-right-width: 0;
  border-radius: var(--radius-btn) 0 0 var(--radius-btn);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  /* The tab is draggable and clickable both; `grab` is the conventional way to say
     the first without a word of copy, and the click survives either way. */
  cursor: grab;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

/* Mirrored for the left edge: the open side faces inward, the closed side is flush.
   Widths only — no colour, so the resting fill, `:hover`, `--open` and `--dragging`
   keep sole say over it, and no shorthand, since this rule outranks `--open` (0,2,0
   against 0,1,0) and would clobber the lavender border it sets. */
.music-dock--left .music-tab {
  border-left-width: 0;
  border-right-width: 1.5px;
  border-radius: 0 var(--radius-btn) var(--radius-btn) 0;
}

.music-tab:hover {
  background: var(--lavender-light);
  border-color: var(--lavender-main);
}

.music-tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.music-tab--open {
  background: var(--lavender-main);
  border-color: var(--lavender-main);
}

/* Picked up: a slight lift, which design.md endorses. */
.music-dock--dragging .music-tab {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  cursor: grabbing;
}

/* Plus the fill a mouse would already have from :hover and a finger never gets. Held
   off the open tab, whose own fill is the stronger of the two and shouldn't wash out
   for the duration of a drag. */
.music-dock--dragging .music-tab:not(.music-tab--open) {
  background: var(--lavender-light);
  border-color: var(--lavender-main);
}

.music-tab__icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.music-tab__label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.8rem;
  line-height: 1;
  letter-spacing: 0.08em;
  /* Rotates the run of text as a block rather than tipping each glyph, which is
     what a pull tab wants. */
  writing-mode: vertical-rl;
}

.music-tab__dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  /* Holds its slot while idle so the layout above stays put. */
  background: transparent;
  border-radius: var(--radius-badge);
  transition: background-color 0.15s ease;
}

.music-tab__dot--on {
  background: var(--status-online);
}

/* The `music-drawer-anim-*` classes are defined in MusicPlayerDrawer.vue, not here
   — see the comment there for why source order forces that. */

@media (max-width: 480px) {
  .music-tab {
    padding: var(--space-sm) 0;
  }
}
</style>
