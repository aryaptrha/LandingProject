/**
 * The track list, kept as a static module rather than behind the KV config service.
 *
 * `useSiteConfig` exists so flags can change without a deploy. A track list is not
 * that: it only changes when an audio file is added under `public/music/`, which
 * already needs a deploy, so fetching it at runtime would buy a round-trip and
 * nothing else. This whole module is a few hundred bytes.
 */
export interface MusicTrack {
  /** Stable key for the list; not shown to the visitor. */
  id: string
  title: string
  artist: string
  /** Absolute path under `public/`, e.g. '/music/lofi-morning.mp3'. */
  src: string
}

/**
 * Placeholders, generated rather than licensed — see the "Placeholder tracks"
 * section of `public/music/README.md`. Three of them, because one track makes
 * prev/next and auto-advance impossible to tell apart from a no-op.
 *
 * Swapping in real audio means replacing the files and editing `src` here; the
 * player reads nothing else from this module.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'dust-motes', title: 'Dust Motes', artist: 'Placeholder', src: '/music/dust-motes.wav' },
  { id: 'late-bus', title: 'Late Bus', artist: 'Placeholder', src: '/music/late-bus.wav' },
  { id: 'window-seat', title: 'Window Seat', artist: 'Placeholder', src: '/music/window-seat.wav' },
]
