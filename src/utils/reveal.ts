import { nextTick } from 'vue'
import { prefersReducedMotion } from './motion'
import { buildDissolveFrames, DISSOLVE_MS } from './pixelDissolve'

/**
 * State reveal for the page's two whole-page switches: the incoming state is
 * uncovered, growing out of the control that was pressed.
 *
 * Two of them, because two controls re-make the whole page. The theme toggle changes
 * the palette and gets a smooth circular wipe. The view-mode switch changes which
 * half of the page exists at all and gets a pixel dissolve (`pixelDissolve.ts`).
 * They are deliberately not the same gesture — see that file for why.
 *
 * Both are the same underlying problem: a change too large for the page to animate
 * its way through property by property.
 *
 * The approach comes from the hyperframes `theme-crossfade-morph` rule, whose central
 * claim is that a re-skin must never tween its properties — fonts, icons and border
 * radii cannot interpolate, and tweening `background-color` animates the one thing
 * that looks worst mid-flight. Instead you stack two complete, fully-styled states
 * and animate only the boundary between them.
 *
 * The View Transitions API is that recipe implemented by the browser: it holds a
 * snapshot of the outgoing state underneath a live rendering of the incoming one, and
 * hands us a single pseudo-element to clip. Nothing in the page transitions, so no
 * colour is ever caught halfway between two themes.
 *
 * That rule's other borrowed idea is its anchor: everything re-makes itself while one
 * element visibly holds still. Here the anchor is the pressed control, and it holds
 * still for free — it is captured inside the root snapshot at identical coordinates in
 * both states, so it is never given a `view-transition-name` of its own. Naming it
 * would animate it separately and make it flinch, which the rule calls out as the one
 * thing that breaks the effect.
 *
 * Not to be confused with `composables/useReveal.ts`, which shares the word and none
 * of the job: that one fades a single section in when it scrolls into view. This one
 * uncovers the entire document after a state change. Nothing imports both.
 */

/** Viewport coordinates the reveal grows from — normally a button's centre. */
export interface RevealOrigin {
  x: number
  y: number
}

/**
 * How the incoming state is uncovered.
 *
 * Also the value of `data-reveal-style` on <html> for the length of the transition,
 * which is how `motion.css` tells the two apart: the circle suppresses entrance
 * animations inside itself and the dissolve does not.
 */
export type RevealStyle = 'circle' | 'pixel'

export interface RevealTransitionOptions {
  /**
   * Names the `data-*` attribute on <html> that `mutate` is expected to change —
   * `data-theme` for the palette, `data-view` for the view mode. Not decoration: the
   * reveal is skipped when that attribute comes back unchanged (see below), so a
   * caller that named the wrong one would be silently un-animated.
   */
  watchedKey?: 'theme' | 'view'
  /** Defaults to the circle, which is the older of the two and the gentler default. */
  style?: RevealStyle
}

/**
 * design.md caps motion at 200ms and every other animation here obeys it. This one
 * does not, deliberately.
 *
 * That ceiling governs *feedback* — a hover, a press, a card arriving — where the eye
 * is already on the element and the travel is a few pixels. This animation's travel is
 * the viewport diagonal, roughly 1600px on a laptop. The hyperframes rule puts the
 * readable window for a whole-surface re-skin at 250-400ms and warns that anything
 * quicker "reads as a hard cut"; at 200ms this would be a cut wearing the costume of a
 * transition.
 *
 * Recorded here rather than buried: if design.md's ceiling is meant as absolute, set
 * this to 200 and the reveal collapses into a snap. Nothing else breaks. `DISSOLVE_MS`
 * carries the same note for the pixel dissolve, which needs longer still.
 */
const REVEAL_MS = 300

/**
 * Matches `--ease-flat`, and matches the rule's own `power2.inOut`. Symmetric easing is
 * the right choice for long travel: `--ease-settle` would cover most of the radius in
 * the first third of the duration and then crawl, which reads as a whoosh followed by
 * lag rather than one deliberate sweep.
 */
const REVEAL_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

interface ViewTransitionLike {
  ready: Promise<void>
  finished: Promise<void>
  skipTransition: () => void
}

type StartViewTransition = (callback: () => void | Promise<void>) => ViewTransitionLike

/**
 * Measured at press time rather than precomputed. The hyperframes constraint against
 * `getBoundingClientRect()` exists because a video renderer samples frames in parallel
 * and a tween-time measurement desyncs; in a live click handler the opposite holds —
 * every control that calls this moves, whether by being `position: fixed` against a
 * resizing viewport or by sitting in a header that reflows, so a constant would go
 * stale.
 */
export function originOf(el: Element | null | undefined): RevealOrigin | null {
  if (!el) return null
  const box = el.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return null
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/** Grows to the furthest viewport corner, so the circle finishes covering the page
 *  exactly as the tween ends. */
function paintCircle(root: HTMLElement, origin: RevealOrigin): void {
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  )

  root.animate(
    {
      clipPath: [
        `circle(0px at ${origin.x}px ${origin.y}px)`,
        `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
      ],
    },
    {
      duration: REVEAL_MS,
      easing: REVEAL_EASING,
      pseudoElement: '::view-transition-new(root)',
    },
  )
}

/** Memoised: a browser does not gain or lose `path()` support mid-session. */
let pathClipSupport: boolean | null = null

function supportsPathClip(): boolean {
  if (pathClipSupport === null) {
    pathClipSupport =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('clip-path', 'path("M0 0Z")')
  }
  return pathClipSupport
}

/**
 * Thirty precomputed `clip-path` frames, stepped through rather than interpolated.
 *
 * `easing: 'linear'` on purpose, and it is not the whole story: consecutive frames
 * cannot interpolate, so the browser steps between them discretely and the easing only
 * decides *when* each step lands. The curve lives in the frames themselves — see
 * `pixelDissolve.ts`.
 */
function paintPixels(root: HTMLElement, origin: RevealOrigin): void {
  // `path()` is the only thing the dissolve can be expressed as, so where `clip-path`
  // does not take one there is no degraded version of this effect — the keyframes are
  // dropped and the incoming view is simply *there* for 500ms, a hard cut with a pause
  // in front of it. The circle is the wrong gesture for this control but it is a real
  // transition, which makes it the better failure.
  if (!supportsPathClip()) {
    paintCircle(root, origin)
    return
  }

  root.animate(
    { clipPath: buildDissolveFrames(origin, window.innerWidth, window.innerHeight) },
    {
      duration: DISSOLVE_MS,
      easing: 'linear',
      pseudoElement: '::view-transition-new(root)',
    },
  )
}

/**
 * Applies `mutate` and reveals the result from `origin`. Falls back to applying it
 * outright, which is exactly what the toggles did before this existed, so an
 * unsupported browser loses an animation rather than a feature.
 */
export function runRevealTransition(
  origin: RevealOrigin | null,
  mutate: () => void,
  options: RevealTransitionOptions = {},
): void {
  const { watchedKey = 'theme', style = 'circle' } = options
  const start = (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition

  if (!start || !origin || prefersReducedMotion()) {
    mutate()
    return
  }

  const root = document.documentElement
  const before = root.dataset[watchedKey]

  const transition = start.call(document, async () => {
    mutate()
    // The composable's watcher writes the attribute on flush, and the toggle
    // re-renders in the same tick. Both must land before the browser captures the
    // new state, or the reveal would uncover the state it started from.
    await nextTick()
  })

  // Scopes the stylesheet's pseudo-element overrides to this transition, so a future
  // view transition elsewhere still gets the browser's own cross-fade. The style goes
  // on as an attribute too, because the two reveals need different overrides and CSS
  // has no other way to know which one is running.
  root.dataset.reveal = ''
  root.dataset.revealStyle = style
  const cleanup = () => {
    delete root.dataset.reveal
    delete root.dataset.revealStyle
  }

  transition.ready
    .then(() => {
      // Revealing an identical surface would spend half a second saying nothing, so
      // only a real change earns the reveal. The theme toggle is where this bites: it
      // is tri-state — day -> night -> system -> day — and landing on "system"
      // resolves to whichever palette the OS asks for, frequently the one already on
      // screen. Its icon swap has its own `m-fade` either way.
      if (root.dataset[watchedKey] === before) {
        transition.skipTransition()
        return
      }

      if (style === 'pixel') paintPixels(root, origin)
      else paintCircle(root, origin)
    })
    // A second press while one reveal is in flight makes the browser abandon the
    // first, and `ready` rejects. Nothing to recover from; without this it surfaces as
    // an unhandled rejection.
    .catch(() => {})

  transition.finished.then(cleanup, cleanup)
}
