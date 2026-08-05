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
