<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
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
    @mouseenter="prefetchDrawer"
    @focus="prefetchDrawer"
    @click="isOpen = !isOpen"
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

  <Transition name="music-drawer-anim">
    <MusicPlayerDrawer v-if="isOpen" id="music-drawer" @close="isOpen = false" />
  </Transition>
</template>

<style scoped>
/* Solid fill, not glass — glass is reserved for surfaces, per design.md. */
.music-tab {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
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
  border-right: none;
  border-radius: var(--radius-btn) 0 0 var(--radius-btn);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
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
