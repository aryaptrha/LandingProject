<script setup lang="ts">
import { computed } from 'vue'
import { useMusicPlayer } from '../../composables/useMusicPlayer'
import { useRetroSound } from '../../composables/useRetroSound'
import IconPause from './icons/IconPause.vue'
import IconPlay from './icons/IconPlay.vue'
import IconSkipNext from './icons/IconSkipNext.vue'
import IconSkipPrev from './icons/IconSkipPrev.vue'
import IconVolume from './icons/IconVolume.vue'
import IconVolumeMuted from './icons/IconVolumeMuted.vue'

const {
  hasTracks,
  isPlaying,
  isMuted,
  volume,
  togglePlay,
  nextTrack,
  previousTrack,
  setVolume,
  toggleMute,
} = useMusicPlayer()

const { playBlip, playToggle } = useRetroSound()

const volumePercent = computed(() => Math.round(volume.value * 100))

function onVolumeInput(event: Event) {
  setVolume(Number((event.target as HTMLInputElement).value) / 100)
}
</script>

<template>
  <div class="controls">
    <div class="controls__transport">
      <button
        type="button"
        class="ctrl"
        :disabled="!hasTracks"
        aria-label="Previous track"
        title="Previous track"
        @click="() => { playBlip(); previousTrack(); }"
      >
        <IconSkipPrev class="ctrl__icon" />
      </button>

      <!--
        `togglePlay` runs straight off this click with nothing awaited in between:
        the browser's autoplay policy credits the gesture still on the stack, and
        yielding first would get the play() promise rejected.
      -->
      <button
        type="button"
        class="ctrl ctrl--primary"
        :disabled="!hasTracks"
        :aria-label="isPlaying ? 'Pause' : 'Play'"
        :title="isPlaying ? 'Pause' : 'Play'"
        @click="() => { playBlip(); togglePlay(); }"
      >
        <IconPause v-if="isPlaying" class="ctrl__icon" />
        <IconPlay v-else class="ctrl__icon" />
      </button>

      <button
        type="button"
        class="ctrl"
        :disabled="!hasTracks"
        aria-label="Next track"
        title="Next track"
        @click="() => { playBlip(); nextTrack(); }"
      >
        <IconSkipNext class="ctrl__icon" />
      </button>
    </div>

    <div class="controls__volume">
      <button
        type="button"
        class="ctrl ctrl--sm"
        :aria-pressed="isMuted"
        :aria-label="isMuted ? 'Unmute' : 'Mute'"
        :title="isMuted ? 'Unmute' : 'Mute'"
        @click="() => { playToggle(); toggleMute(); }"
      >
        <IconVolumeMuted v-if="isMuted" class="ctrl__icon" />
        <IconVolume v-else class="ctrl__icon" />
      </button>

      <input
        class="volume-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="volumePercent"
        aria-label="Volume"
        :aria-valuetext="`${volumePercent}%`"
        @input="onVolumeInput"
      />

      <span class="controls__volume-readout">{{ volumePercent }}%</span>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md) var(--space-md);
  border-top: 1.5px solid var(--divider);
}

.controls__transport {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

/* Solid fill, not glass — glass is reserved for surfaces, per design.md. */
.ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--text-dark);
  background: var(--surface-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-btn);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.ctrl:hover:not(:disabled) {
  background: var(--blue-light);
  border-color: var(--blue-main);
  transform: translateY(-2px);
}

.ctrl:active:not(:disabled) {
  transform: translateY(0);
}

.ctrl:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.ctrl:disabled {
  color: var(--text-disabled);
  background: var(--surface-disabled);
  cursor: not-allowed;
}

.ctrl--primary {
  width: 52px;
  height: 52px;
  background: var(--blue-main);
  border-color: var(--blue-deep);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
}

.ctrl--primary:hover:not(:disabled) {
  background: var(--blue-deep);
  border-color: var(--blue-deep);
}

.ctrl--sm {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

/* Every icon in this feature renders its 16-unit viewBox at 24px, so one source
   pixel is the same size everywhere. design.md treats mixed pixel scales as a
   mistake, and 24px is its recommended icon size. */
.ctrl__icon {
  width: 24px;
  height: 24px;
}

.controls__volume {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

/* The input box is 44px tall so the draggable area meets the touch-target rule,
   while the visible track stays a 6px pastel bar centred inside it. */
.volume-slider {
  flex: 1;
  min-width: 0;
  height: 44px;
  margin: 0;
  background: transparent;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.volume-slider::-webkit-slider-runnable-track {
  height: 6px;
  background: var(--surface-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-badge);
}

.volume-slider::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  /* (track - thumb) / 2, so the thumb rides centred on the bar. Both are
     border-box per the global reset in base.css, so it is (6 - 16) / 2 and the
     1.5px borders are already inside those numbers. Firefox centres its own thumb
     and needs no equivalent. */
  margin-top: -5px;
  background: var(--blue-main);
  border: 1.5px solid var(--blue-deep);
  border-radius: var(--radius-badge);
  -webkit-appearance: none;
  appearance: none;
}

.volume-slider::-moz-range-track {
  height: 6px;
  background: var(--surface-muted);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-badge);
}

.volume-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--blue-main);
  border: 1.5px solid var(--blue-deep);
  border-radius: var(--radius-badge);
}

.volume-slider:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.controls__volume-readout {
  flex-shrink: 0;
  min-width: 3.2em;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  color: var(--text-medium);
  text-align: right;
}
</style>
