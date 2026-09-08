import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import type { WeatherCondition } from '@/composables/useWeather'
import { MOTION, loadGsap, prefersReducedMotion, staggerFor } from '@/utils/motion'

type Gsap = Awaited<ReturnType<typeof loadGsap>>
type Tween = ReturnType<Gsap['to']>

interface SceneSources {
  condition: Ref<WeatherCondition>
  isNight: Ref<boolean>
}

/**
 * Ambient loops for `WeatherSky`'s pixel scene.
 *
 * Kept out of the component because the component is 40 rects of geometry and this
 * is 8 loops of behaviour — putting both in one file would mean neither could be
 * read without the other. It also keeps the split the codebase already has: CSS
 * owns entrances (`motion.css`), GSAP owns the things CSS cannot express, and this
 * is squarely the latter. A cloud that drifts three pixels left, waits, and drifts
 * back is expressible as a keyframe set; a drop that falls continuously and wraps
 * to the top of its band *without ever landing on a half pixel* is not.
 *
 * Two rules from `design.md` shape every tween below, and they pull against each
 * other:
 *
 *   1. Motion must be smooth.
 *   2. Pixel art moves in whole pixels or not at all.
 *
 * They are reconciled with GSAP's `modifiers`, which intercept each tweened value
 * before it is written to the DOM. GSAP still interpolates at full float precision
 * and still eases — so timing, phase and stagger are as smooth as any other tween —
 * but what reaches the element is always an integer. The result is a sprite that
 * steps, driven by a curve that does not. Snapping in the modifier rather than with
 * `steps()` easing is what makes that possible: `steps()` quantises *time*, which
 * would also quantise the stagger and make six drops fall in three visible ranks.
 *
 * No entrance is built here. `EdgeWeather` already reveals the whole panel through
 * `useReveal`, and per the house rule one animation gets one engine — a second
 * entrance on this subtree would fight it.
 */

/** Cloud drift, in whole units. Small enough to read as air, not as a slide. */
const CLOUD_DRIFT = 3
const MIST_DRIFT = 4

/** Seconds for one fall through the drop band, per condition. */
const FALL_SECONDS: Partial<Record<WeatherCondition, number>> = {
  rain: 0.9,
  thunder: 0.9,
  drizzle: 1.4,
  snow: 3.4,
}

export function useWeatherScene(root: Ref<SVGSVGElement | null>, sources: SceneSources) {
  /**
   * Every tween this composable owns, so all of them can be paused, resumed and
   * killed as one. A `gsap.timeline` was the obvious alternative and the wrong one:
   * these are independent infinite loops with different periods, and nesting
   * `repeat: -1` children inside a parent timeline makes the parent's own duration
   * meaningless.
   */
  let tweens: Tween[] = []
  let gsap: Gsap | null = null

  /**
   * Guards the async gap. `loadGsap()` can resolve after the component has gone —
   * a visitor who scrolls past the panel fast enough — and building tweens against
   * detached nodes would leak them, since nothing would be left to kill them.
   */
  let isActive = false

  function killScene() {
    for (const tween of tweens) tween.kill()
    tweens = []
  }

  /** Whole-pixel snap. Applied to every positional tween without exception. */
  function snap(value: string): string {
    return `${Math.round(parseFloat(value))}px`
  }

  function query<T extends Element>(selector: string): T[] {
    const el = root.value
    if (!el) return []
    return Array.from(el.querySelectorAll<T>(selector))
  }

  function buildScene(engine: Gsap) {
    const condition = sources.condition.value

    // --- Clouds -------------------------------------------------------------
    // Alternating direction rather than alternating speed. Differing speeds across
    // stacked layers is how parallax is built, and design.md rules parallax out.
    const clouds = query<SVGGElement>('[data-cloud]')
    if (clouds.length) {
      tweens.push(
        engine.to(clouds, {
          x: (i: number) => (i % 2 === 0 ? CLOUD_DRIFT : -CLOUD_DRIFT),
          duration: 7,
          ease: MOTION.easeFlat,
          repeat: -1,
          yoyo: true,
          stagger: 1.1,
          modifiers: { x: snap },
        }),
      )
    }

    // --- Sun rays -----------------------------------------------------------
    // The sun pulses by fading its ray pixels, never by rotating. A rotation would
    // put a 2x2 pixel on a fractional angle, and design.md rules out spin anyway.
    const rays = query<SVGRectElement>('[data-ray]')
    if (rays.length) {
      tweens.push(
        engine.to(rays, {
          opacity: 0.45,
          duration: 1.4,
          ease: MOTION.easeFlat,
          repeat: -1,
          yoyo: true,
          stagger: staggerFor(rays.length),
        }),
      )
    }

    // --- Stars --------------------------------------------------------------
    const stars = query<SVGRectElement>('[data-star]')
    if (stars.length) {
      tweens.push(
        engine.to(stars, {
          opacity: 0.3,
          duration: 1.8,
          ease: MOTION.easeFlat,
          repeat: -1,
          yoyo: true,
          stagger: { each: 0.28, from: 'random' },
        }),
      )
    }

    // --- Precipitation ------------------------------------------------------
    const dropLayer = root.value?.querySelector<SVGGElement>('[data-layer="drops"]')
    const drops = query<SVGRectElement>('[data-drop]')
    if (dropLayer && drops.length) {
      // Band geometry comes from the SVG, which authored it. Copying the numbers
      // here would mean a cloud could be moved without the rain following.
      const top = Number(dropLayer.dataset.top ?? 0)
      const travel = Number(dropLayer.dataset.travel ?? 0)
      const wrapInBand = engine.utils.wrap(0, travel)

      tweens.push(
        engine.to(drops, {
          y: travel,
          duration: FALL_SECONDS[condition] ?? 1.2,
          ease: 'none',
          repeat: -1,
          stagger: staggerFor(drops.length),
          modifiers: {
            /**
             * Wraps each drop back to the top of the band instead of letting the
             * tween snap it back at the end of each repeat.
             *
             * The difference matters because the drops are authored at irregular
             * heights — that irregularity is what makes the *static* render (no
             * GSAP, or reduced motion) look like rain rather than a row of ticks.
             * A plain repeat would return each drop to its own authored height,
             * which is mid-band and visible, so every cycle would end in six
             * simultaneous pops. Wrapping in absolute band space means the reset
             * always happens off the top edge.
             *
             * `target.getAttribute('y')` is the drop's authored home; GSAP's `y`
             * is a transform delta on top of it, which is why both are needed.
             */
            y: (value: string, target: Element) => {
              const home = parseFloat(target.getAttribute('y') ?? '0')
              const offset = home - top
              const absolute = wrapInBand(offset + parseFloat(value))
              return `${Math.round(absolute - offset)}px`
            },
          },
        }),
      )

      // Snow drifts sideways as it falls; rain does not. Its own tween rather than
      // an `x` on the fall, so the two have independent periods and the path never
      // repeats exactly.
      if (condition === 'snow') {
        tweens.push(
          engine.to(drops, {
            x: 2,
            duration: 2.2,
            ease: MOTION.easeFlat,
            repeat: -1,
            yoyo: true,
            stagger: { each: 0.35, from: 'random' },
            modifiers: { x: snap },
          }),
        )
      }
    }

    // --- Bolt ---------------------------------------------------------------
    // Dims and returns. Deliberately not a strobe: a small bright shape flashing on
    // a two-second cycle is exactly the pattern photosensitivity guidance warns
    // about, and it would also break the "no flash" spirit of design.md's motion
    // section. The bolt is always drawn; only its weight changes.
    const bolt = query<SVGGElement>('[data-layer="bolt"]')
    if (bolt.length) {
      tweens.push(
        engine.to(bolt, {
          opacity: 0.5,
          duration: 0.24,
          ease: MOTION.easeFlat,
          repeat: -1,
          yoyo: true,
          repeatDelay: 2.4,
        }),
      )
    }

    // --- Mist ---------------------------------------------------------------
    const mist = query<SVGRectElement>('[data-mist]')
    if (mist.length) {
      tweens.push(
        engine.to(mist, {
          x: (i: number) => (i % 2 === 0 ? MIST_DRIFT : -MIST_DRIFT),
          duration: 5,
          ease: MOTION.easeFlat,
          repeat: -1,
          yoyo: true,
          stagger: 0.6,
          modifiers: { x: snap },
        }),
      )
    }
  }

  async function rebuild() {
    killScene()
    if (!isActive || !root.value) return

    /*
     * Reduced motion stops here, and stops *before* the import — there is no point
     * pulling 27kB over the wire to build tweens that must not run. The scene is
     * already complete in the DOM, so returning leaves a finished picture rather
     * than a from-state. Same contract `useReveal` and `useCountUp` keep.
     */
    if (prefersReducedMotion()) return

    if (!gsap) {
      try {
        gsap = await loadGsap()
      } catch {
        // Chunk failed to load. The scene stays as authored: still, but whole.
        return
      }
    }

    // The await above is a gap the component can be unmounted across, and the
    // condition can have changed again while it was open.
    if (!isActive || !root.value) return

    buildScene(gsap)
    if (document.hidden) pause()
  }

  function pause() {
    for (const tween of tweens) tween.pause()
  }

  function resume() {
    for (const tween of tweens) tween.resume()
  }

  /*
   * A hidden tab still runs GSAP's ticker, so eight looping tweens keep waking the
   * compositor for a scene nobody is looking at. Pausing is the same courtesy the
   * polling composables pay by stopping their intervals.
   */
  function handleVisibilityChange() {
    if (document.hidden) pause()
    else resume()
  }

  onMounted(() => {
    isActive = true
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void rebuild()
  })

  onUnmounted(() => {
    isActive = false
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    killScene()
  })

  /*
   * `flush: 'post'` is required, not stylistic. A condition change adds and removes
   * layers through `v-if`, and rebuilding before Vue has patched the DOM would tween
   * the elements that are about to be replaced — rain from the previous condition
   * animating while the new scene sits still.
   */
  watch([sources.condition, sources.isNight], () => void rebuild(), { flush: 'post' })
}
