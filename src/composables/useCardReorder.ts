import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { loadGsap } from '../utils/motion'

type GsapCore = typeof import('gsap').gsap

/** How long a card must be held before the grid turns editable, in ms. */
const HOLD_MS = 450
/**
 * Pointer travel that cancels a pending hold. A press that moves this far before
 * the timer fires was a scroll or a flick, not a long press — and letting the
 * browser keep that gesture is what keeps normal page scrolling intact.
 */
const HOLD_SLOP = 8
/** How close to the viewport edge the pointer must be to auto-scroll while dragging. */
const SCROLL_EDGE = 80
/** Top auto-scroll speed, in px per frame. */
const SCROLL_MAX = 16
/** Duration of the FLIP reflow and the drop settle, in seconds. */
const REFLOW = 0.28
/** Every reorderable cell carries this attribute with its stable key. */
const CELL_SELECTOR = '[data-reorder-key]'

/**
 * Physical cue for entering arrange mode. Android exposes the Vibration API;
 * iOS Safari does not, which is why this is a bonus on top of the jiggle
 * animation rather than the cue itself. Never throws — a blocked or missing
 * implementation must not interrupt the gesture.
 */
function haptic(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Unsupported or blocked; the jiggle still announces the state.
  }
}

/**
 * Long-press-to-rearrange for a grid of cards, in the spirit of mobile home-screen
 * icon editing: hold a card until it and its neighbours start to jiggle, then drag
 * any card to a new slot. The order lives only in the ref that is passed in — this
 * composable deliberately persists nothing.
 *
 * The gesture is built from pointer events, not HTML5 drag-and-drop, for three
 * reasons: touch support is real rather than emulated, the card can follow the
 * finger 1:1 instead of a ghost image drifting behind it, and `pointercancel`
 * gives an honest end to a gesture the browser took away from us.
 *
 * Motion is split between the two engines the site already has:
 * - The card under the pointer is moved with GSAP `set` (or a plain transform if
 *   the engine could not be fetched). Direct writes are intentional here: a tween
 *   on the dragged card would lag behind the finger, which is the one place a
 *   trailing animation reads as sloppy rather than smooth.
 * - Every other card is re-flowed with a GSAP FLIP. Measure all the cell rects,
 *   reorder the array, then tween each untouched cell back from its old rect to
 *   its new one. 280ms on `power3.out`, matching the house arrival curve.
 */
export function useCardReorder<T>(
  items: Ref<T[]>,
  keyOf: (item: T) => string,
  grid: Ref<HTMLElement | null>,
) {
  const isArmed = ref(false)
  const isDragging = ref(false)
  /** Key of the card currently under the pointer, or null. */
  const activeKey = ref<string | null>(null)

  let gsap: GsapCore | null = null
  let holdTimer: number | null = null
  let pointerId: number | null = null
  /** The cell the pending long press belongs to, before a drag exists. */
  let pendingCell: HTMLElement | null = null

  let dragCell: HTMLElement | null = null
  let dragKey = ''
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  /** Where inside the card the pointer grabbed it, so it doesn't snap to the corner. */
  let grabX = 0
  let grabY = 0
  /** The dragged cell's untransformed (layout) position at the last measurement. */
  let layoutLeft = 0
  let layoutTop = 0

  /** One swap per frame. Rapid pointermoves across a boundary must not queue FLIPs. */
  let swapping = false
  let frame = 0
  /** Disposer for the one-shot click swallow used when tapping outside to exit. */
  let swallowCleanup: (() => void) | null = null

  function cellAt(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null
    const cell = target.closest(CELL_SELECTOR)
    return cell instanceof HTMLElement ? cell : null
  }

  function capture(el: HTMLElement, id: number): void {
    try {
      el.setPointerCapture(id)
    } catch {
      // Capture is a nicety; the window listeners carry the gesture regardless.
    }
  }

  /**
   * Moves the dragged cell. GSAP writes the same `transform` a manual style write
   * would, so the fallback is visually identical — it exists only so a failed
   * `gsap` import degrades to "no FLIP animations" rather than "no dragging".
   */
  function moveTo(x: number, y: number): void {
    if (!dragCell) return
    if (gsap) {
      gsap.set(dragCell, { x, y })
    } else {
      dragCell.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
  }

  /** Keeps the grabbed point of the card under the pointer. */
  function trackPointer(): void {
    moveTo(lastX - grabX - layoutLeft, lastY - grabY - layoutTop)
  }

  /**
   * Clears any transform on `el` and returns where it sits in the grid. Used when a
   * swap moves the dragged cell to a new slot: its old translation is meaningless
   * there, and the new one has to be derived from the new layout position.
   */
  function measureLayout(el: HTMLElement): DOMRect {
    if (gsap) {
      gsap.killTweensOf(el)
      gsap.set(el, { x: 0, y: 0 })
    } else {
      el.style.transform = ''
    }
    return el.getBoundingClientRect()
  }

  /* --- Drag ---------------------------------------------------------------- */

  function beginDrag(el: HTMLElement, x: number, y: number): void {
    dragCell = el
    dragKey = el.dataset.reorderKey ?? ''
    activeKey.value = dragKey
    lastX = x
    lastY = y

    const rect = measureLayout(el)
    layoutLeft = rect.left
    layoutTop = rect.top
    grabX = x - rect.left
    grabY = y - rect.top

    swapping = false
    isDragging.value = true
    moveTo(0, 0)
    startFrame()
  }

  /**
   * Finds a cell under the pointer that is not the one being dragged. The dragged
   * cell is skipped by identity rather than by hiding it with `pointer-events`,
   * because the capture target must keep receiving events.
   */
  function findSwap(): void {
    if (swapping || !dragCell) return

    let target: HTMLElement | null = null
    for (const node of document.elementsFromPoint(lastX, lastY)) {
      const cell = node instanceof Element ? node.closest<HTMLElement>(CELL_SELECTOR) : null
      if (cell && cell !== dragCell) {
        target = cell
        break
      }
    }

    const targetKey = target?.dataset.reorderKey
    if (targetKey) swapTo(targetKey)
  }

  function swapTo(targetKey: string): void {
    const from = items.value.findIndex((item) => keyOf(item) === dragKey)
    const to = items.value.findIndex((item) => keyOf(item) === targetKey)
    if (from < 0 || to < 0 || from === to) return

    // FLIP first: every untouched cell's current visual position.
    const cells = Array.from(grid.value?.querySelectorAll<HTMLElement>(CELL_SELECTOR) ?? [])
    const before = new Map<HTMLElement, DOMRect>()
    for (const cell of cells) {
      if (cell !== dragCell) before.set(cell, cell.getBoundingClientRect())
    }

    const next = items.value.slice()
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    items.value = next
    swapping = true

    // Vue reorders the keyed DOM nodes on the next tick. Only then is there a new
    // layout to measure — and because this lands in a microtask, no scroll or
    // pointermove can slip between the two measurements.
    void nextTick(() => {
      const dragged = dragCell
      if (!dragged) {
        swapping = false
        return
      }

      if (gsap) {
        for (const cell of cells) {
          if (cell === dragged) continue
          const first = before.get(cell)
          if (!first) continue
          const last = cell.getBoundingClientRect()
          const dx = first.left - last.left
          const dy = first.top - last.top
          if (!dx && !dy) continue
          gsap.fromTo(
            cell,
            { x: dx, y: dy },
            {
              x: 0,
              y: 0,
              duration: REFLOW,
              ease: 'power3.out',
              overwrite: true,
              // Same reason as the drop settle below: an identity transform is still
              // a transform, and motion.css is explicit that a lingering one makes a
              // containing block out of an element that has no business being one.
              onComplete: () => gsap?.set(cell, { clearProps: 'transform' }),
            },
          )
        }
      }

      // The dragged card now owns a different layout slot. Re-base its translation
      // so it stays exactly where the finger left it.
      const rect = measureLayout(dragged)
      layoutLeft = rect.left
      layoutTop = rect.top
      trackPointer()
      swapping = false
    })
  }

  function drop(): void {
    stopFrame()
    const el = dragCell

    isDragging.value = false
    activeKey.value = null
    dragCell = null
    dragKey = ''
    swapping = false

    if (!el) return
    if (gsap) {
      gsap.to(el, {
        x: 0,
        y: 0,
        duration: REFLOW,
        ease: 'power3.out',
        overwrite: true,
        // An identity transform is still a transform: clearing it hands the cell
        // back to the plain grid, exactly as motion.css insists for entrances.
        onComplete: () => gsap?.set(el, { clearProps: 'transform' }),
      })
    } else {
      el.style.transform = ''
    }
  }

  /* --- Auto-scroll --------------------------------------------------------- */

  /**
   * A drag that starts on a phone has to be able to reach a card below the fold,
   * and there is no finger left to scroll with. Holding near either edge scrolls
   * the page, and `layoutTop` is shifted by the same amount so the card stays put
   * under the pointer while the grid slides beneath it.
   */
  function startFrame(): void {
    if (frame) return
    // The page can move under the pointer two ways: our own edge scroll, and a
    // wheel/trackpad or momentum scroll. Tracking scrollY as a drift covers both
    // with one rule, so the card stays pinned to the finger either way.
    let scrollY = window.scrollY
    const step = () => {
      frame = 0
      if (!isDragging.value) return

      const viewport = window.innerHeight
      let delta = 0
      if (lastY < SCROLL_EDGE) {
        delta = -SCROLL_MAX * (1 - lastY / SCROLL_EDGE)
      } else if (lastY > viewport - SCROLL_EDGE) {
        delta = SCROLL_MAX * ((lastY - (viewport - SCROLL_EDGE)) / SCROLL_EDGE)
      }
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta)

      const drift = window.scrollY - scrollY
      if (drift) {
        scrollY = window.scrollY
        layoutTop -= drift
        trackPointer()
        findSwap()
      }

      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  function stopFrame(): void {
    if (!frame) return
    cancelAnimationFrame(frame)
    frame = 0
  }

  /* --- Gesture ------------------------------------------------------------- */

  function attachPointer(): void {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  function detachPointer(): void {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }

  function cancelHold(): void {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer)
      holdTimer = null
    }
    pendingCell = null
  }

  function onPointerDown(event: PointerEvent): void {
    // Secondary buttons and extra fingers never start a gesture. A right-click that
    // armed one would leave it hanging, since no pointerup follows a context menu.
    if (!event.isPrimary || pointerId !== null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const cell = cellAt(event.target)
    if (!cell) return

    pointerId = event.pointerId
    startX = lastX = event.clientX
    startY = lastY = event.clientY
    attachPointer()

    // Already armed: a press on any card is a drag from the first pixel.
    if (isArmed.value) {
      event.preventDefault()
      capture(cell, event.pointerId)
      beginDrag(cell, event.clientX, event.clientY)
      return
    }

    pendingCell = cell
    holdTimer = window.setTimeout(() => {
      holdTimer = null
      const target = pendingCell
      if (!target || pointerId === null) return
      arm()
      capture(target, pointerId)
      beginDrag(target, lastX, lastY)
      pendingCell = null
    }, HOLD_MS)
  }

  function onPointerMove(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return

    lastX = event.clientX
    lastY = event.clientY

    if (holdTimer !== null) {
      const moved = Math.abs(lastX - startX) > HOLD_SLOP || Math.abs(lastY - startY) > HOLD_SLOP
      if (moved) {
        cancelHold()
        detachPointer()
        pointerId = null
      }
      return
    }

    if (!isDragging.value) return
    event.preventDefault()
    trackPointer()
    findSwap()
  }

  function onPointerUp(event: PointerEvent): void {
    if (pointerId === null || event.pointerId !== pointerId) return

    const el = dragCell
    const id = pointerId
    const wasDragging = isDragging.value

    cancelHold()
    if (wasDragging) drop()
    detachPointer()

    if (el) {
      try {
        if (el.hasPointerCapture(id)) el.releasePointerCapture(id)
      } catch {
        // The browser may have released it on pointercancel already.
      }
    }

    pointerId = null
    pendingCell = null
  }

  /* --- Arrange mode -------------------------------------------------------- */

  function arm(): void {
    if (isArmed.value) return
    isArmed.value = true
    // The hold is also a text-selection gesture on desktop; drop whatever it caught.
    window.getSelection()?.removeAllRanges()
    haptic([12, 24, 12])
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
  }

  /**
   * While dragging, the page must not scroll under the finger. In arrange mode but
   * not yet dragging, it must — nine cards are taller than any phone, and the only
   * way to reach the last ones is still to scroll. A non-passive `touchmove` can
   * cancel the scroll for exactly the frames that need it.
   */
  function onTouchMove(event: TouchEvent): void {
    if (isDragging.value) event.preventDefault()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    exit()
  }

  /** A press outside the grid leaves arrange mode, like tapping off a home screen. */
  function onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof Element)) return
    if (grid.value?.contains(target)) return
    if (target.closest('[data-reorder-keep]')) return
    // Leave arrange mode first, then arm the swallow: `exit()` disposes any
    // previous one-shot, and the click this press synthesizes has not fired yet.
    exit()
    // The press will synthesize a click on whatever it landed on. Swallow it: the
    // first tap after leaving arrange mode should dismiss the mode, not navigate.
    swallowNextClick()
  }

  function swallowNextClick(): void {
    swallowCleanup?.()

    const handler = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      cleanup()
    }
    const timer = window.setTimeout(() => cleanup(), 700)
    const cleanup = () => {
      document.removeEventListener('click', handler, true)
      window.clearTimeout(timer)
      swallowCleanup = null
    }

    swallowCleanup = cleanup
    document.addEventListener('click', handler, true)
  }

  /** In arrange mode a click never navigates — the card is being arranged, not opened. */
  function onClickCapture(event: MouseEvent): void {
    if (!isArmed.value) return
    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * The mobile long-press callout fires around the same moment the hold does. It
   * is suppressed while a hold is pending or the grid is armed; a deliberate
   * right-click in normal mode is left alone.
   */
  function onContextMenu(event: MouseEvent): void {
    if (isArmed.value || holdTimer !== null) event.preventDefault()
  }

  function exit(): void {
    cancelHold()
    stopFrame()
    detachPointer()

    // Escape can end a drag mid-gesture. Release the capture and clear the id
    // here, or the next pointerdown would see a gesture still "in flight" and
    // refuse to arm.
    const id = pointerId
    const captured = dragCell
    pointerId = null
    pendingCell = null
    if (captured && id !== null) {
      try {
        if (captured.hasPointerCapture(id)) captured.releasePointerCapture(id)
      } catch {
        // Already released by the browser.
      }
    }

    const el = dragCell
    dragCell = null
    dragKey = ''
    swapping = false
    isDragging.value = false
    activeKey.value = null

    if (el) {
      if (gsap) {
        gsap.killTweensOf(el)
        gsap.set(el, { clearProps: 'transform' })
      } else {
        el.style.transform = ''
      }
    }

    // Clear any FLIP transforms still interpolating, so leaving arrange mode does
    // not leave cards offset from the grid.
    grid.value?.querySelectorAll<HTMLElement>(CELL_SELECTOR).forEach((cell) => {
      if (cell === el) return
      if (gsap) {
        gsap.killTweensOf(cell)
        gsap.set(cell, { clearProps: 'transform' })
      } else {
        cell.style.transform = ''
      }
    })

    isArmed.value = false
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    window.removeEventListener('touchmove', onTouchMove)
    swallowCleanup?.()
    swallowCleanup = null
  }

  onMounted(() => {
    // The header reveal already asks for GSAP on mount, so this is normally a
    // memoised no-op. It is requested here too so a drag cannot arrive before the
    // engine does if that reveal is skipped (e.g. reduced motion).
    loadGsap()
      .then((instance) => {
        gsap = instance
      })
      .catch(() => {
        // Dragging still works with plain transforms; only the FLIP is lost.
      })
  })

  onBeforeUnmount(exit)

  return {
    isArmed,
    isDragging,
    activeKey,
    onPointerDown,
    onClickCapture,
    onContextMenu,
    exit,
  }
}
