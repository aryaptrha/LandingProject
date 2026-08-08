<script setup lang="ts">
import { useMusicPlayer } from '../../composables/useMusicPlayer'
import IconPause from './icons/IconPause.vue'
import IconPlay from './icons/IconPlay.vue'

const { tracks, currentIndex, isPlaying, playTrack } = useMusicPlayer()
</script>

<template>
  <div class="track-list">
    <!-- `role="list"` is not redundant: `list-style: none` strips list semantics in
         Safari/VoiceOver, and this restores them. -->
    <ul v-if="tracks.length" class="track-list__items" role="list">
      <li v-for="(track, index) in tracks" :key="track.id">
        <button
          type="button"
          class="track"
          :class="{ 'track--current': index === currentIndex }"
          :aria-current="index === currentIndex ? 'true' : undefined"
          @click="playTrack(index)"
        >
          <!--
            The marker column swaps a number for a play/pause glyph on the current
            track. design.md forbids leaning on colour alone for state, so the ring
            and tint below are backed up by this shape change.
          -->
          <span class="track__marker" aria-hidden="true">
            <IconPause v-if="index === currentIndex && isPlaying" class="track__glyph" />
            <IconPlay v-else-if="index === currentIndex" class="track__glyph" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="track__meta">
            <span class="track__title">{{ track.title }}</span>
            <span class="track__artist">{{ track.artist }}</span>
          </span>
        </button>
      </li>
    </ul>

    <p v-else class="track-list__empty">
      No tracks yet — the playlist is still being put together.
    </p>
  </div>
</template>

<style scoped>
.track-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.track-list::-webkit-scrollbar {
  width: 8px;
}

.track-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: var(--radius-badge);
}

.track-list__items {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}

.track {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  /* 44px minimum touch target, per design.md. */
  min-height: 44px;
  padding: var(--space-xs) var(--space-sm);
  text-align: left;
  background: var(--surface-sunken);
  border: 1.5px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;
}

.track:hover {
  background: var(--surface-hover-wash);
  border-color: var(--blue-main);
}

.track:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.track--current {
  border-color: var(--select-ring);
  background: var(--select-bg);
  /* Ring carries the selection; the second layer is plain elevation. A tinted
     bloom would read as glow, which design.md rules out. */
  box-shadow:
    0 0 0 2px var(--select-ring),
    0 4px 12px rgba(0, 0, 0, 0.06);
  transform: scale(1.02);
}

.track--current .track__title,
.track--current .track__marker {
  color: var(--select-text);
}

.track--current .track__artist {
  color: var(--select-text);
  opacity: 0.75;
}

.track__marker {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  color: var(--text-medium);
}

/* 24px like every other icon here. All the pixel art in this feature renders a
   16-unit viewBox at 24px, so one source pixel is one size everywhere — design.md
   treats mixed pixel scales as a mistake. */
.track__glyph {
  width: 24px;
  height: 24px;
}

.track__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.track__title {
  font-family: 'Nunito', sans-serif;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track__artist {
  font-family: 'Nunito', sans-serif;
  font-size: 0.78rem;
  color: var(--text-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-list__empty {
  margin: 0;
  padding: var(--space-lg) var(--space-md);
  font-size: 0.85rem;
  color: var(--text-medium);
  text-align: center;
}
</style>
