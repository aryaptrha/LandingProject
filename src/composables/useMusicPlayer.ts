import { computed, ref, watch } from 'vue'
import { MUSIC_TRACKS, type MusicTrack } from '../data/musicTracks'

const STORAGE_KEY = 'portfolio_music'
const DEFAULT_VOLUME = 0.7

/**
 * Module-level state, like `useTheme` and unlike the polling composables: the
 * pull-tab, the track list and the controls are three components that must agree
 * on one playback state, so the refs live here rather than being created per
 * `useMusicPlayer()` call.
 */
const currentIndex = ref(0)
const isPlaying = ref(false)
const volume = ref(DEFAULT_VOLUME)
const isMuted = ref(false)
/** True once a track has failed to load, so the UI can say so instead of looking stuck. */
const hasLoadError = ref(false)

/**
 * The one and only audio element, constructed on first play intent rather than
 * rendered into a template. Two reasons it lives here:
 *
 * 1. An element with no `src` issues no request, so nothing is fetched — not even
 *    a metadata byte range — until the visitor actually asks for a track.
 * 2. Living outside the component tree means it survives the drawer closing. In
 *    the template it would be unmounted on close, silently stopping the music.
 */
let element: HTMLAudioElement | null = null

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        trackIndex: currentIndex.value,
        volume: volume.value,
        isMuted: isMuted.value,
      }),
    )
  } catch {
    // Private browsing / storage full — playback still works for this session.
  }
}

/**
 * Copies any stored preferences into the refs.
 *
 * Runs at module scope, below, rather than from an `init()` on first use like
 * `useTheme` does — deliberately, for two reasons. Hydrating *before* the watchers
 * exist means restoring a value cannot echo straight back into storage, so no
 * suppression flag is needed (and a flag would not work anyway: the default `pre`
 * flush would run the watcher after the flag was cleared). And a `watch()` created
 * during a component's `setup()` is owned by that component's scope and torn down
 * when it unmounts, which would kill persistence the first time the drawer closed.
 */
function hydrateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Copied to locals so the typeof narrowing below is unambiguous — these come
    // off an index signature, and the stored JSON is whatever was last written,
    // which may be from an older build or hand-edited.
    const storedIndex: unknown = parsed.trackIndex
    const storedVolume: unknown = parsed.volume

    // The manifest may have shrunk since this was written.
    if (
      typeof storedIndex === 'number' &&
      Number.isInteger(storedIndex) &&
      storedIndex >= 0 &&
      storedIndex < MUSIC_TRACKS.length
    ) {
      currentIndex.value = storedIndex
    }

    // Number.isFinite rejects NaN and Infinity, either of which would make the
    // element throw on assignment.
    if (typeof storedVolume === 'number' && Number.isFinite(storedVolume)) {
      volume.value = clamp01(storedVolume)
    }

    isMuted.value = parsed.isMuted === true
  } catch {
    // Absent, unreadable or malformed — the defaults above are already correct.
  }
}

hydrateFromStorage()

watch(volume, (next) => {
  if (element) element.volume = next
})
watch(isMuted, (next) => {
  if (element) element.muted = next
})
// One `watch` over all three, so a change that moves two of them at once (see
// `setVolume`) writes once rather than twice.
watch([currentIndex, volume, isMuted], persist)

function wrapIndex(index: number): number {
  const count = MUSIC_TRACKS.length
  return ((index % count) + count) % count
}

function ensureElement(): HTMLAudioElement {
  if (element) return element

  const el = new Audio()
  el.preload = 'none'
  el.volume = volume.value
  el.muted = isMuted.value

  // Mirror the element rather than guess: `isPlaying` then stays honest even when
  // the browser pauses us on its own (interruption, device change, failed load).
  el.addEventListener('play', () => {
    isPlaying.value = true
  })
  el.addEventListener('pause', () => {
    isPlaying.value = false
  })
  el.addEventListener('ended', () => {
    // Safe to auto-advance: the gesture that started the first track satisfies the
    // autoplay policy for the rest of the session. Wrapping past the end means the
    // playlist loops, which is what background music should do.
    playTrack(currentIndex.value + 1)
  })
  el.addEventListener('error', () => {
    isPlaying.value = false
    hasLoadError.value = true
  })

  // Never removed, and that is correct: the element is a session-long singleton, so
  // there is no unmount at which these would become garbage.
  element = el
  return el
}

/**
 * Loads and plays the track at `index`, wrapping past either end.
 *
 * Must stay callable synchronously from a click handler — see the comment on the
 * `play()` call below.
 */
function playTrack(index: number) {
  // Guards `wrapIndex`, whose modulo would be NaN against an empty manifest. Every
  // other entry point routes through here, so this is the only check needed.
  if (!MUSIC_TRACKS.length) return

  const target = wrapIndex(index)
  const track = MUSIC_TRACKS[target]
  // `wrapIndex` already guarantees this is in range; the check is what satisfies
  // `noUncheckedIndexedAccess` without asserting the lookup infallible.
  if (!track) return

  const el = ensureElement()

  // `src` is assigned here and nowhere else. A reactive `:src` binding would hand
  // the browser a URL the moment the drawer mounted — `currentIndex` is already 0
  // — and some engines fetch the opening bytes for container metadata even under
  // preload="none". Skipping the reassignment when nothing changed also lets a
  // paused track resume where it stopped instead of restarting.
  //
  // `hasLoadError` forces the reassignment even for the same track: re-calling
  // play() on an element whose load already failed just rejects again, so retrying
  // has to hand it the URL afresh.
  if (target !== currentIndex.value || !el.src || hasLoadError.value) {
    currentIndex.value = target
    hasLoadError.value = false
    el.src = track.src
  }

  // No `await` or timer may come before this line. The autoplay policy credits the
  // click that is still on the stack; yielding first invalidates the gesture in
  // some engines and the promise rejects.
  void el.play().catch(() => {
    isPlaying.value = false
  })
}

function togglePlay() {
  // `element` is null until the first play, so a cold toggle falls through to
  // playTrack, which builds it.
  if (element && !element.paused) {
    element.pause()
    return
  }
  playTrack(currentIndex.value)
}

function nextTrack() {
  playTrack(currentIndex.value + 1)
}

function previousTrack() {
  playTrack(currentIndex.value - 1)
}

function setVolume(value: number) {
  volume.value = clamp01(value)
  // Reaching for the slider while muted means "let me hear it" — matching what
  // native players do beats leaving the drag silent and looking broken.
  if (isMuted.value && volume.value > 0) isMuted.value = false
}

function toggleMute() {
  isMuted.value = !isMuted.value
}

/*
 * There is deliberately no restore-and-play on load, and deliberately no stored
 * "was playing" flag. Every fresh page load needs a fresh user gesture, so such a
 * flag could only ever produce a rejected promise — or tempt someone into wiring
 * up an autoplay bug later.
 */
export function useMusicPlayer() {
  const currentTrack = computed<MusicTrack | null>(() => MUSIC_TRACKS[currentIndex.value] ?? null)
  const hasTracks = computed(() => MUSIC_TRACKS.length > 0)

  return {
    tracks: MUSIC_TRACKS,
    currentIndex,
    currentTrack,
    hasTracks,
    isPlaying,
    isMuted,
    volume,
    hasLoadError,
    playTrack,
    togglePlay,
    nextTrack,
    previousTrack,
    setVolume,
    toggleMute,
  }
}
