import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MOTION, loadGsap, prefersReducedMotion, staggerFor } from '@/utils/motion'

interface RevealOptions {
  /**
   * Selector for children to cascade instead of revealing the element itself.
   * Resolved against the target when it intersects, so it works on lists whose
   * contents arrived after mount.
   */
  children?: string
  /** Entrance travel in px. Defaults to one spacing unit. */
  distance?: number
}

/**
 * Reveal an element the first time it scrolls into view.
 *
 * The entrance itself is a fade and a slight lift — the same gesture as the
 * `.m-rise` class in `motion.css`, because a section arriving on scroll and a
 * card arriving on load should not look like two different ideas. What CSS
 * cannot do is wait for the scroll position, hence the observer.
 *
 * Three things this is careful about, in rough order of how badly they would
 * hurt if got wrong:
 *
 *   1. Content can never stay hidden. The `opacity: 0` from-state is only
 *      applied to an element that is currently off-screen, and only after
 *      reduced-motion has been ruled out. Once it intersects, a watchdog clears
 *      that state unconditionally — if the GSAP chunk is slow, blocked, or
 *      fails outright, the section simply appears.
 *   2. No flash. The from-state goes on at mount, before the element can be
 *      scrolled to, rather than at intersection time when it would be visible.
 *   3. It fires once. The observer disconnects on the first hit; a section that
 *      fades every time it re-enters the viewport is a distraction, not a
 *      reveal.
 */
export function useReveal(options: RevealOptions = {}) {
  const target = ref<HTMLElement | null>(null)
  const isRevealed = ref(false)

  let observer: IntersectionObserver | null = null
  let watchdog: number | null = null
  /*
   * Started at mount, not at intersection. The element is off-screen when the
   * from-state goes on, so the import has the whole scroll distance to arrive —
   * by the time the watchdog below could matter, the chunk is normally already
   * there. Fetching it at intersection instead would mean the first section a
   * visitor scrolls to spends its entrance waiting on a network request.
   */
  let engine: Promise<typeof import('gsap').gsap> | null = null
  /** Set when the from-state was written, so cleanup only clears what it owns. */
  let staged: HTMLElement[] = []

  const distance = options.distance ?? MOTION.rise

  const clearStaged = () => {
    for (const el of staged) {
      el.style.removeProperty('opacity')
      el.style.removeProperty('transform')
      el.style.removeProperty('will-change')
    }
    staged = []
  }

  const settle = () => {
    isRevealed.value = true
    clearStaged()
  }

  const stopWatchdog = () => {
    if (watchdog !== null) {
      window.clearTimeout(watchdog)
      watchdog = null
    }
  }

  const reveal = () => {
    if (!staged.length) {
      isRevealed.value = true
      return
    }

    // Whatever happens to the import, the content is visible within 600ms of
    // entering the viewport.
    const els = staged
    watchdog = window.setTimeout(settle, 600)

    ;(engine ?? loadGsap())
      .then((gsap) => {
        stopWatchdog()
        if (!staged.length) return // watchdog already fired; leave it settled
        isRevealed.value = true
        gsap.to(els, {
          opacity: 1,
          y: 0,
          duration: MOTION.base,
          ease: MOTION.ease,
          stagger: els.length > 1 ? staggerFor(els.length) : 0,
          clearProps: 'opacity,transform,willChange',
          onComplete: () => {
            staged = []
          },
        })
      })
      .catch(() => {
        stopWatchdog()
        settle()
      })
  }

  onMounted(() => {
    const root = target.value
    if (!root) return

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      isRevealed.value = true
      return
    }

    // Already on screen: it has been seen, so there is nothing to reveal.
    const box = root.getBoundingClientRect()
    if (box.top < window.innerHeight && box.bottom > 0) {
      isRevealed.value = true
      return
    }

    const els = options.children
      ? Array.from(root.querySelectorAll<HTMLElement>(options.children))
      : [root]
    if (!els.length) {
      isRevealed.value = true
      return
    }

    for (const el of els) {
      el.style.opacity = '0'
      el.style.transform = 'translateY(' + distance + 'px)'
      el.style.willChange = 'opacity, transform'
    }
    staged = els

    // The no-op catch is here so a failed import is never an unhandled
    // rejection while the observer is still waiting. `reveal()` attaches the
    // handler that actually matters.
    engine = loadGsap()
    engine.catch(() => {})

    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer?.disconnect()
        observer = null
        reveal()
      },
      // A tenth of the section has to be showing. Full-height panels rarely
      // clear a high ratio, so this stays low and margin-free.
      { threshold: 0.1 },
    )
    observer.observe(root)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    stopWatchdog()
    clearStaged()
  })

  return { target, isRevealed }
}
