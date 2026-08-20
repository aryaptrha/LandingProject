import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { MOTION, loadGsap, prefersReducedMotion } from '@/utils/motion'

interface CountUpOptions {
  /**
   * Below this absolute change the value snaps instead of tweening. A latency
   * meter that ticks 41 -> 42 should just say 42; animating it draws the eye to
   * noise. Defaults to 2.
   */
  threshold?: number
}

/**
 * A number that settles into its new value instead of swapping to it.
 *
 * Duration is the standard `--motion-base`, which is roughly a dozen frames.
 * That is deliberately not long enough to *count* — it reads as the digits
 * settling, which is the effect worth having, and it keeps the readout inside
 * the 150-200ms budget `design.md` sets for everything else on the page. A true
 * two-second odometer would look good and would also be the one thing here
 * openly ignoring the style guide.
 *
 * Callers must render the result with `font-variant-numeric: tabular-nums`.
 * Proportional digits have different widths, so an animated number reflows on
 * nearly every frame, and whatever sits next to it jitters.
 */
export function useCountUp(source: Ref<number | null | undefined>, options: CountUpOptions = {}) {
  const threshold = options.threshold ?? 2
  const display = ref(source.value ?? 0)

  /*
   * The tween runs on a plain object rather than on the ref, because GSAP mutates
   * its target in place and every intermediate write to a ref would be a reactive
   * notification.
   */
  const proxy = { value: display.value }
  let tween: gsap.core.Tween | null = null

  /*
   * Start fetching GSAP now, and hold the instance rather than the promise.
   *
   * The alternative — awaiting the import inside the watcher — quietly breaks
   * correctness: the display would sit at its old value (0, on first load) until
   * the chunk arrived, so a slow network would show "0 total visits" for as long
   * as the request took. A number is not decoration; it is either right or it is
   * misinformation. So the watcher below reads this synchronously and, if the
   * library has not landed yet, snaps.
   *
   * In practice it usually has: this fires when the component mounts, while the
   * data it is going to animate is still in flight over its own request.
   */
  let engine: typeof import('gsap').gsap | null = null
  loadGsap()
    .then((mod) => {
      engine = mod
    })
    .catch(() => {
      /* Stays null; every change snaps. */
    })

  const snap = (value: number) => {
    tween?.kill()
    tween = null
    proxy.value = value
    display.value = value
  }

  watch(source, (next) => {
    if (next === null || next === undefined || !Number.isFinite(next)) return

    if (!engine || prefersReducedMotion() || Math.abs(next - display.value) < threshold) {
      snap(next)
      return
    }

    // `overwrite` matters more than it looks: these values come from polling, so
    // a fresh number can land mid-tween, and without it the two tweens would
    // fight over the same object.
    tween = engine.to(proxy, {
      value: next,
      duration: MOTION.base,
      ease: MOTION.ease,
      overwrite: true,
      onUpdate: () => {
        display.value = Math.round(proxy.value)
      },
      // Rounding on the way up can leave the final frame a digit short of the
      // real value. Assert it at the end.
      onComplete: () => {
        display.value = next
        tween = null
      },
    })
  })

  onBeforeUnmount(() => {
    tween?.kill()
    tween = null
  })

  return { display }
}
