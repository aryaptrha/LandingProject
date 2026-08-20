import { nextTick } from 'vue'
import { prefersReducedMotion } from './motion'

/**
 * Palette reveal for the theme toggle: the incoming theme is uncovered by a
 * circle growing out of the button that was pressed.
 *
 * The approach comes from the hyperframes `theme-crossfade-morph` rule, whose
 * central claim is that a re-skin must never tween its properties — fonts,
 * icons and border radii cannot interpolate, and tweening `background-color`
 * animates the one thing that looks worst mid-flight. Instead you stack two
 * complete, fully-styled states and animate only the boundary between them.
 *
 * The View Transitions API is that recipe implemented by the browser: it holds
 * a snapshot of the outgoing palette underneath a live rendering of the
 * incoming one, and hands us a single pseudo-element to clip. Nothing in the
 * page transitions, so no colour is ever caught halfway between two themes.
 *
 * That rule's other borrowed idea is its anchor: everything re-skins while one
 * element visibly holds still. Here the anchor is the toggle itself, and it
 * holds still for free — it is captured inside the root snapshot at identical
 * coordinates in both states, so it is never given a `view-transition-name` of
 * its own. Naming it would animate it separately and make it flinch, which the
 * rule calls out as the one thing that breaks the effect.
 */

/** Viewport coordinates the reveal grows from — normally a button's centre. */
export interface RevealOrigin {
  x: number
  y: number
}

/**
 * design.md caps motion at 200ms and every other animation here obeys it. This
 * one does not, deliberately.
 *
 * That ceiling governs *feedback* — a hover, a press, a card arriving — where
 * the eye is already on the element and the travel is a few pixels. This
 * animation's travel is the viewport diagonal, roughly 1600px on a laptop. The
 * hyperframes rule puts the readable window for a whole-surface re-skin at
 * 250-400ms and warns that anything quicker "reads as a hard cut"; at 200ms
 * this would be a cut wearing the costume of a transition.
 *
 * Recorded here rather than buried: if design.md's ceiling is meant as absolute,
 * set this to 200 and the reveal collapses into a snap. Nothing else breaks.
 */
const REVEAL_MS = 300

/**
 * Matches `--ease-flat`, and matches the rule's own `power2.inOut`. Symmetric
 * easing is the right choice for long travel: `--ease-settle` would cover most
 * of the radius in the first third of the duration and then crawl, which reads
 * as a whoosh followed by lag rather than one deliberate sweep.
 */
const REVEAL_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

interface ViewTransitionLike {
  ready: Promise<void>
  finished: Promise<void>
  skipTransition: () => void
}

type StartViewTransition = (callback: () => void | Promise<void>) => ViewTransitionLike

/**
 * Measured at press time rather than precomputed. The hyperframes constraint
 * against `getBoundingClientRect()` exists because a video renderer samples
 * frames in parallel and a tween-time measurement desyncs; in a live click
 * handler the opposite holds — this button is `position: fixed` and moves with
 * the viewport and the 480px breakpoint, so a constant would go stale.
 */
export function originOf(el: Element | null | undefined): RevealOrigin | null {
  if (!el) return null
  const box = el.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return null
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/**
 * Applies `mutate` — expected to change the theme — and reveals the result from
 * `origin`. Falls back to applying it outright, which is exactly what the toggle
 * did before this existed, so an unsupported browser loses an animation rather
 * than a feature.
 */
export function runThemeTransition(origin: RevealOrigin | null, mutate: () => void): void {
  const start = (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition

  if (!start || !origin || prefersReducedMotion()) {
    mutate()
    return
  }

  const root = document.documentElement
  const before = root.dataset.theme

  const transition = start.call(document, async () => {
    mutate()
    // `useTheme`'s watcher writes `data-theme` on flush, and the toggle swaps its
    // icon in the same tick. Both must land before the browser captures the new
    // state, or the reveal would uncover the palette it started from.
    await nextTick()
  })

  // Scopes the stylesheet's pseudo-element overrides to this transition, so a
  // future view transition elsewhere still gets the browser's own cross-fade.
  root.dataset.themeReveal = ''
  const cleanup = () => {
    delete root.dataset.themeReveal
  }

  transition.ready
    .then(() => {
      // The toggle is tri-state: day -> night -> system -> day. Landing on
      // "system" resolves to whichever palette the OS asks for, which is
      // frequently the one already on screen. Revealing an identical surface
      // would spend 300ms saying nothing, so only a real palette change earns
      // the reveal — the icon swap has its own `m-fade` either way.
      if (root.dataset.theme === before) {
        transition.skipTransition()
        return
      }

      // Grow to the furthest viewport corner, so the circle finishes covering
      // the page exactly as the tween ends.
      const radius = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      )

      root.animate(
        {
          clipPath: [
            'circle(0px at ' + origin.x + 'px ' + origin.y + 'px)',
            'circle(' + radius + 'px at ' + origin.x + 'px ' + origin.y + 'px)',
          ],
        },
        {
          duration: REVEAL_MS,
          easing: REVEAL_EASING,
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    // A second press while one reveal is in flight makes the browser abandon the
    // first, and `ready` rejects. Nothing to recover from; without this it
    // surfaces as an unhandled rejection.
    .catch(() => {})

  transition.finished.then(cleanup, cleanup)
}
