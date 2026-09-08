import type { ViewMode } from '../composables/useViewMode'

/**
 * Every string that differs between the visitor and dev views, in one place.
 *
 * A static module rather than KV config (`useSiteConfig`), for the same reason
 * `musicTracks.ts` is one: this is copy. It changes when someone edits it, and
 * editing it already needs a deploy. KV is for the kill switches that have to flip
 * without one.
 *
 * It lives here rather than inside the components so that "what changes when you
 * switch views" is one file to read instead of five to grep. Only the copy, though —
 * the *visibility* differences can't be expressed as strings and stay as `v-if`s in
 * `App.vue`.
 */

/** One suggested question in the chat's starter chips. */
export interface PromptChip {
  /** What the chip reads. Short enough not to wrap on a phone. */
  label: string
  /** What is actually sent, which may be a fuller sentence than the label. */
  text: string
}

export interface ViewModeCopy {
  /** Segmented-control label. Two or three syllables — it sits in a pill. */
  label: string
  /** What this view shows. Used as the segment's pointer tooltip. */
  description: string
  /** The <h1>. Split on spaces by App.vue for the per-word reveal. */
  title: string
  subtitle: string
  /** Skeleton label on the guestbook's LazySection — the one panel present in both views. */
  guestbookTitle: string
  /** Skeleton label on the pixel canvas, the other panel present in both views. */
  canvasTitle: string
  promptChips: PromptChip[]
}

export const VIEW_MODE_COPY: Record<ViewMode, ViewModeCopy> = {
  visitor: {
    label: 'Visitor',
    description: 'The projects, without the infrastructure readouts.',
    title: 'aryaptrha Projects',
    subtitle: "A cozy collection of things I've built and explored.",
    guestbookTitle: 'Guestbook',
    canvasTitle: 'Pixel Canvas',
    promptChips: [
      { label: 'Siapa kamu?', text: 'Siapa kamu?' },
      { label: 'Project favorit kamu?', text: 'Project favorit kamu apa?' },
      { label: 'Belajar apa sekarang?', text: 'Sekarang kamu sedang belajar apa?' },
    ],
  },
  dev: {
    label: 'Dev',
    description: 'Adds the edge topology, live insights and telemetry widgets.',
    /*
     * The title is deliberately the same string as the visitor one, and that is not a
     * copy-paste slip. It is the site's name, it is the <h1> a crawler reads, and it is
     * what the per-word reveal is timed against — a switch that renames the site reads
     * as a different site rather than as the same one seen from another angle. The
     * reframing is the subtitle's job. The field stays per-view so that changing your
     * mind about this is a one-string edit.
     */
    title: 'aryaptrha Projects',
    subtitle:
      'Vue 3 SPA on Cloudflare Workers — Hono API, D1, KV, and live edge telemetry below.',
    guestbookTitle: 'Edge Guestbook',
    canvasTitle: 'Edge Pixel Canvas',
    promptChips: [
      { label: 'Stack-nya apa?', text: 'Stack yang kamu pakai buat situs ini apa?' },
      {
        label: 'Kenapa Cloudflare Workers?',
        text: 'Kenapa kamu pilih Cloudflare Workers buat situs ini?',
      },
      { label: 'Bagian tersulitnya?', text: 'Bagian tersulit waktu bikin situs ini apa?' },
    ],
  },
}
