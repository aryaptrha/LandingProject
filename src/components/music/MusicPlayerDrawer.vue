<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useMusicPlayer } from '../../composables/useMusicPlayer'
import MusicPlayerControls from './MusicPlayerControls.vue'
import MusicTrackList from './MusicTrackList.vue'

const emit = defineEmits<{ close: [] }>()

const { currentTrack, isPlaying, hasTracks, hasLoadError } = useMusicPlayer()

/*
 * Escape closes. The listener lives here rather than in the widget so that it
 * exists exactly while the drawer is mounted and unbinds itself on close — no
 * `watch(isOpen)` to keep in sync.
 *
 * There is no focus trap, matching the rest of the codebase (ChatSettingsModal
 * doesn't trap either). This drawer is non-modal and sits after its own toggle in
 * DOM order, so Tab walks into it naturally and back out again.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="music-drawer" role="dialog" aria-label="Music player">
    <header class="music-drawer__header">
      <h2 class="music-drawer__title">Music</h2>
      <button
        type="button"
        class="music-drawer__close"
        aria-label="Close music player"
        title="Close"
        @click="emit('close')"
      >
        <svg
          class="pixel-art"
          viewBox="0 0 16 16"
          width="24"
          height="24"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="3" width="2" height="2" fill="currentColor" />
          <rect x="5" y="5" width="2" height="2" fill="currentColor" />
          <rect x="7" y="7" width="2" height="2" fill="currentColor" />
          <rect x="9" y="9" width="2" height="2" fill="currentColor" />
          <rect x="11" y="11" width="2" height="2" fill="currentColor" />
          <rect x="11" y="3" width="2" height="2" fill="currentColor" />
          <rect x="9" y="5" width="2" height="2" fill="currentColor" />
          <rect x="5" y="9" width="2" height="2" fill="currentColor" />
          <rect x="3" y="11" width="2" height="2" fill="currentColor" />
        </svg>
      </button>
    </header>

    <!-- Announced on change so a screen reader hears the new track without the
         list having to take focus. -->
    <div class="now-playing" aria-live="polite">
      <p v-if="hasLoadError" class="now-playing__status">Couldn't load that track.</p>
      <template v-else-if="currentTrack && hasTracks">
        <p class="now-playing__label">{{ isPlaying ? 'Now playing' : 'Paused' }}</p>
        <p class="now-playing__title">{{ currentTrack.title }}</p>
        <p class="now-playing__artist">{{ currentTrack.artist }}</p>
      </template>
      <p v-else class="now-playing__status">Nothing queued up.</p>
    </div>

    <MusicTrackList />
    <MusicPlayerControls />
  </section>
</template>

<style scoped>
/* Glass here is on-spec: design.md allows it for menus, dialogs and sidebars.
   The solid controls inside it stay solid. */
.music-drawer {
  /*
   * Laid out, not positioned: this panel is a flex sibling of the pull tab inside the
   * dock in MusicPlayerWidget, which is the fixed-position element and the one that
   * carries the z-index. Being a sibling is what keeps the panel flush against the
   * tab — and on the correct side of it — wherever the visitor has parked the pair,
   * with no coordinates passed between the two.
   */
  position: relative;
  /* The dock drops pointer events so its empty column doesn't eat clicks; anything
     that wants them takes them back. */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 300px;
  /* Leaves room for the 44px tab plus a margin, so a narrow phone gets a narrower
     panel instead of one pushed off the far edge. */
  max-width: calc(100vw - 44px - var(--space-lg));
  max-height: min(70vh, 520px);
  background: var(--glass-bg);
  /* Depends on no ancestor in the dock being a backdrop root — a transform, filter,
     opacity or will-change on the dock would leave this sampling the dock's own
     contents and render it unblurred. See the note in useEdgeDock. */
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  overflow: hidden;
}

/*
 * The <Transition> that drives these lives in MusicPlayerWidget, but the classes
 * belong here, with the panel they animate. Vite emits this async component's CSS as
 * its own file, injected after the main stylesheet, and nothing guarantees which of
 * the two lands first — so the compound `.music-drawer.music-drawer-anim-*` selector
 * outranks anything equally specific in either sheet, and the animation cannot be
 * silently overridden into a plain fade.
 */
.music-drawer.music-drawer-anim-enter-active,
.music-drawer.music-drawer-anim-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.music-drawer.music-drawer-anim-enter-from,
.music-drawer.music-drawer-anim-leave-to {
  opacity: 0;
  /* Slides out of the tab and folds back into it, so the direction has to follow
     whichever edge the dock is on. `--music-dock-slide` is set per side over in
     MusicPlayerWidget and inherited through the dock; the fallback is the right-edge
     value, which is where the dock starts. */
  transform: translateX(var(--music-dock-slide, 12px)) scale(0.98);
}

.music-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-sm) var(--space-sm) var(--space-md);
  border-bottom: 1.5px solid var(--divider);
}

.music-drawer__title {
  margin: 0;
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-dark);
}

.music-drawer__close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  color: var(--text-medium);
  background: transparent;
  border: none;
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.music-drawer__close:hover {
  color: var(--text-dark);
  background: var(--surface-hover-wash);
}

.music-drawer__close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.now-playing {
  padding: var(--space-sm) var(--space-md);
  background: var(--surface-sunken);
  border-bottom: 1.5px solid var(--divider);
}

.now-playing__label {
  margin: 0 0 2px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  color: var(--text-medium);
}

.now-playing__title {
  margin: 0;
  font-family: 'Nunito', sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-playing__artist {
  margin: 0;
  font-family: 'Nunito', sans-serif;
  font-size: 0.8rem;
  color: var(--text-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-playing__status {
  margin: 0;
  font-family: 'Nunito', sans-serif;
  font-size: 0.85rem;
  color: var(--text-medium);
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}

@media (max-width: 480px) {
  .music-drawer {
    /* Width already gives way via `max-width` above; this is only about leaving more
       of a short viewport visible behind the panel. */
    max-height: min(64vh, 460px);
  }
}
</style>
