/**
 * OS-level motion preference.
 *
 * The `prefers-reduced-motion` block in `base.css` neutralises CSS transitions and
 * animations, but it cannot stop a JS-driven loop — a `setInterval` or a canvas
 * `requestAnimationFrame` keeps running and keeps burning battery. Components that
 * own such a loop check this before starting one.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The CSS tokens in `motion.css`, restated for GSAP.
 *
 * GSAP takes seconds and named eases where CSS takes milliseconds and bezier
 * curves, so the two cannot share literals — but they must agree, or a
 * JS-driven reveal will feel different from a CSS one on the same page. Change
 * a value here and change its twin in `motion.css`.
 *
 * `ease` is the house arrival curve. It is deliberately *not* `back.out` or
 * `elastic.out`: `design.md` rules out bounce, and those eases overshoot their
 * target by definition. Every ease named here approaches its value and stops.
 */
export const MOTION = {
  /** 150ms — state flips: hover, focus, icon swaps. */
  fast: 0.15,
  /** 200ms — the design.md ceiling. Arrivals, reveals, value changes. */
  base: 0.2,
  /** 40ms cascade step. Prefer `staggerFor()` for lists of unknown length. */
  stagger: 0.04,
  /** One spacing unit of entrance travel, in px (GSAP `y` takes a number). */
  rise: 8,
  ease: 'power3.out',
  easeFlat: 'power2.inOut',
} as const

/**
 * Stagger step for a group of `count` items, shrunk so the whole cascade still
 * lands inside ~0.5s.
 *
 * A fixed step is fine for the five cards on the landing page. It is not fine
 * for a guestbook that might render twenty entries: 20 x 40ms is 800ms of
 * trickle, which stops reading as one movement and starts reading as a queue
 * being drained. Lists whose length is data-driven use this instead.
 */
export function staggerFor(count: number): number {
  if (count <= 1) return 0
  return Math.min(MOTION.stagger, 0.5 / (count - 1))
}

type GsapCore = typeof import('gsap').gsap

let gsapPromise: Promise<GsapCore> | null = null

/**
 * GSAP, loaded on first use and memoised.
 *
 * It is ~25kB gzipped, and this site is tuned for web vitals — the header is
 * pre-painted in `index.html` so it can paint before any JS runs. Putting an
 * animation library in that critical path to fade a card in would be a bad
 * trade, so above-the-fold motion is pure CSS and GSAP only shows up for the
 * things CSS cannot do well: count-ups, and reveals that need to be driven from
 * an IntersectionObserver. Both live below the fold, where `LazySection`'s
 * 250px `rootMargin` gives the chunk time to arrive before it is needed.
 *
 * Callers must treat the import as fallible. If it rejects, the animation is
 * skipped and the content is shown as-is — never left in a from-state.
 */
export function loadGsap(): Promise<GsapCore> {
  if (!gsapPromise) {
    gsapPromise = import('gsap').then((mod) => mod.gsap)
  }
  return gsapPromise
}
