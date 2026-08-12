import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export type DockSide = 'left' | 'right'

/** Kept clear of the top and bottom of the viewport, so a parked dock never looks wedged. */
const EDGE_GAP = 8
/** How far a pointer must travel before a press on the handle counts as a drag and not a tap. */
const DRAG_SLOP = 6
/** One arrow-key press, in pixels. */
const KEY_STEP = 24
/** How long the caller is told to keep its move transition live after a key press. */
const STEP_WINDOW = 260
/** Keys the dock claims; every other key stays with whatever the handle is. */
const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

export interface EdgeDockOptions {
  /** localStorage key the side and vertical offset are remembered under. */
  storageKey: string
  /** Which edge the dock starts on, before the visitor has moved it. */
  defaultSide?: DockSide
  /** Vertical centre as a fraction of viewport height, before the visitor has moved it. */
  defaultCenter?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Excludes the classic desktop scrollbar, which `window.innerHeight` counts and `position: fixed` does not. */
function readViewportHeight(): number {
  return document.documentElement.clientHeight || window.innerHeight
}

function readViewportWidth(): number {
  return document.documentElement.clientWidth || window.innerWidth
}

/**
 * Sticks an element to the left or right edge of the viewport and lets the visitor
 * slide it along that edge — by drag or by arrow key — without it ever coming away
 * from an edge. Crossing the horizontal midpoint mid-drag hops it to the other side.
 *
 * Three decisions worth knowing about:
 *
 * - The side is returned as a value for the caller to turn into a class, not as a
 *   pixel offset. `left: 0` / `right: 0` in CSS is exact; deriving an x from
 *   `window.innerWidth` would tuck the dock a scrollbar's width under the edge on
 *   Windows, where that scrollbar takes real space.
 * - The vertical position is stored as the *centre* of the dock, as a fraction of
 *   viewport height. A fraction survives resize and rotation; anchoring the centre
 *   rather than the top means a panel opening inside the dock grows it symmetrically
 *   and the handle the visitor placed stays exactly where they put it.
 * - `el` is measured, not just moved. The clamp that keeps the dock on screen needs
 *   its height, and that height changes — a panel opens, or Pixelify Sans swaps in
 *   and re-measures the handle. Hence a ResizeObserver rather than a one-off read.
 * - The offset is handed back as `top`, not as a `translateY`. A transform would be
 *   the cheaper thing to animate, but it makes its element a backdrop root, and
 *   anything inside the dock that wants `backdrop-filter` — the music drawer's glass —
 *   would then have only the dock's own contents to sample and would render unblurred.
 */
export function useEdgeDock(el: Ref<HTMLElement | null>, options: EdgeDockOptions) {
  const side = ref<DockSide>(options.defaultSide ?? 'right')
  /** The dock's vertical centre, as a fraction of viewport height. */
  const center = ref(clamp(options.defaultCenter ?? 0.5, 0, 1))
  const isDragging = ref(false)
  /**
   * True only for the moment after an arrow-key press. Keyboard steps are the one kind
   * of move that wants easing, and they are also the only kind that can afford it:
   *
   * - A drag has to track the pointer 1:1.
   * - Every other change to `top` is a correction, not a move — the offset the first
   *   render guesses before the element can be measured, a clamp after a resize, and
   *   above all the re-measure when a panel opens inside the dock. That last one is
   *   why this is opt-in rather than opt-out: the panel enters the layout at full
   *   height at once, so the handle is instantly re-centred by however tall the panel
   *   is, and the corrected offset arrives a beat later from the ResizeObserver. Left
   *   free to transition, that correction plays as the whole dock lurching away and
   *   easing back on every single open. Suppressed, both land in one frame and the
   *   handle simply doesn't move — which is the promise the centre anchoring makes.
   */
  const isStepping = ref(false)

  // Read eagerly rather than left at 0 until `onMounted`, so the very first render
  // already carries a sane offset even if mounting is deferred.
  const viewportHeight = ref(readViewportHeight())
  const dockHeight = ref(0)

  /** Distance from the top of the viewport to the top of the dock, clamped on screen. */
  const top = computed(() => {
    const limit = viewportHeight.value - dockHeight.value - EDGE_GAP
    // Viewport shorter than the dock plus its gaps — no valid range left, so centre
    // it and let it overhang both ends evenly instead of pinning it to one.
    if (limit < EDGE_GAP) return Math.round((viewportHeight.value - dockHeight.value) / 2)
    return Math.round(clamp(center.value * viewportHeight.value - dockHeight.value / 2, EDGE_GAP, limit))
  })

  const dockStyle = computed(() => ({ top: `${top.value}px` }))

  function measure() {
    viewportHeight.value = readViewportHeight()
    dockHeight.value = el.value?.offsetHeight ?? 0
  }

  function persist() {
    try {
      localStorage.setItem(
        options.storageKey,
        JSON.stringify({ side: side.value, center: Number(center.value.toFixed(4)) }),
      )
    } catch {
      // Private browsing / storage full — the position still holds for this session.
    }
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(options.storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, unknown>

      // Copied to locals so the narrowing below is unambiguous: these come off an
      // index signature, and the stored JSON is whatever was last written, which may
      // be from an older build or hand-edited.
      const storedSide: unknown = parsed.side
      const storedCenter: unknown = parsed.center

      if (storedSide === 'left' || storedSide === 'right') side.value = storedSide
      // Number.isFinite rejects NaN and Infinity, either of which would poison the
      // transform and leave the dock nowhere.
      if (typeof storedCenter === 'number' && Number.isFinite(storedCenter)) {
        center.value = clamp(storedCenter, 0, 1)
      }
    } catch {
      // Absent, unreadable or malformed — the defaults above are already correct.
    }
  }

  /**
   * Moves the dock by a pixel delta.
   *
   * Measured from where the dock actually is — `top`, which is clamped — rather than
   * from `center`, which is not. Without that, arrowing into an edge would bank up
   * off-screen centre values and the first presses back the other way would move
   * nothing.
   */
  function shiftBy(deltaY: number) {
    const height = viewportHeight.value || 1
    center.value = clamp((top.value + dockHeight.value / 2 + deltaY) / height, 0, 1)
  }

  /* --- Drag ---------------------------------------------------------------- */

  let pointerId: number | null = null
  let handle: HTMLElement | null = null
  /** Pointer offset from the dock's centre at press time, so the dock doesn't jump under the finger. */
  let grabOffset = 0
  let startX = 0
  let startY = 0
  let pastSlop = false
  /** Set for the click a released drag fires on the handle, which must not read as a tap. */
  let swallowClick = false
  let restoreCursor = ''
  let restoreUserSelect = ''

  function onMove(event: PointerEvent) {
    if (pointerId === null || event.pointerId !== pointerId) return

    if (!pastSlop) {
      if (
        Math.abs(event.clientX - startX) < DRAG_SLOP &&
        Math.abs(event.clientY - startY) < DRAG_SLOP
      ) {
        return
      }
      pastSlop = true
      isDragging.value = true
      // The pointer roams away from the handle during a drag, so the grab cursor has
      // to come from the body or it reverts to whatever is under the pointer. Text
      // selection is suppressed for the same reason: the drag sweeps over the page.
      restoreCursor = document.body.style.cursor
      restoreUserSelect = document.body.style.userSelect
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }

    const height = viewportHeight.value || 1
    center.value = clamp((event.clientY - grabOffset) / height, 0, 1)
    // Sticky, not free: the dock is always on an edge, and which edge is simply
    // whichever half of the viewport the pointer is in.
    side.value = event.clientX < readViewportWidth() / 2 ? 'left' : 'right'
  }

  function detach() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onEnd)
  }

  function releaseBodyStyles() {
    if (!isDragging.value) return
    document.body.style.cursor = restoreCursor
    document.body.style.userSelect = restoreUserSelect
  }

  function onEnd(event: PointerEvent) {
    if (pointerId === null || event.pointerId !== pointerId) return

    releaseBodyStyles()
    if (handle?.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
    detach()

    const wasDrag = pastSlop
    pointerId = null
    handle = null
    pastSlop = false
    if (!wasDrag) return

    isDragging.value = false
    // Only a release synthesizes that trailing click. A cancel — the OS claiming the
    // gesture, a second finger, the device going away — fires none, so arming the
    // swallow there would leave it primed for the handle's next real activation, and
    // an Enter press is a click with no pointerdown ahead of it to clear the flag.
    if (event.type === 'pointerup') swallowClick = true
    persist()
  }

  /**
   * Bind to `pointerdown` on the handle. Capture retargets the rest of the gesture
   * here even when the pointer leaves the element; the window listeners are what
   * actually run, so a browser that refuses the capture still ends the drag cleanly.
   */
  function startDrag(event: PointerEvent) {
    // Secondary buttons and extra fingers are not drags. A right-click that armed
    // one would leave it hanging, since no pointerup follows.
    if (!event.isPrimary || event.button !== 0 || pointerId !== null) return

    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    // A fresh press settles whatever the last gesture left behind, so a click that
    // never arrived can't swallow this one.
    swallowClick = false
    measure()

    pointerId = event.pointerId
    handle = target
    startX = event.clientX
    startY = event.clientY
    grabOffset = event.clientY - (top.value + dockHeight.value / 2)
    pastSlop = false

    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // Capture is a nicety; the window listeners below carry the gesture regardless.
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  /**
   * Call from the handle's `click` handler and bail out when it returns true — releasing
   * a drag fires a click on the handle, and that click must not also fire whatever the
   * handle does when tapped.
   */
  function shouldIgnoreClick(): boolean {
    if (!swallowClick) return false
    swallowClick = false
    return true
  }

  /**
   * Bind to `keydown` on the handle: arrows and Home/End move the dock, so repositioning
   * it doesn't require a dragging gesture (WCAG 2.5.7). Enter and Space are left alone
   * for whatever the handle itself does.
   */
  let stepTimer: ReturnType<typeof setTimeout> | null = null

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    // Checked before measuring, so an unrelated keystroke costs no forced layout.
    if (!MOVE_KEYS.has(event.key)) return
    measure()

    switch (event.key) {
      case 'ArrowUp':
        shiftBy(-KEY_STEP)
        break
      case 'ArrowDown':
        shiftBy(KEY_STEP)
        break
      case 'ArrowLeft':
        side.value = 'left'
        break
      case 'ArrowRight':
        side.value = 'right'
        break
      case 'Home':
        center.value = 0
        break
      case 'End':
        center.value = 1
        break
      default:
        return
    }

    // Only once a key is claimed, so the arrows scroll the page as usual everywhere else.
    event.preventDefault()

    // Held open a little past the transition itself, so held-down auto-repeat reads as
    // one continuous glide rather than re-arming between presses.
    isStepping.value = true
    if (stepTimer !== null) clearTimeout(stepTimer)
    stepTimer = setTimeout(() => {
      isStepping.value = false
      stepTimer = null
    }, STEP_WINDOW)

    persist()
  }

  /* --- Lifecycle ----------------------------------------------------------- */

  let observer: ResizeObserver | null = null

  hydrate()

  onMounted(() => {
    // Synchronous, not left to the observer's first callback: the first render had no
    // element to measure and so guessed a height of 0, and correcting that here still
    // lands inside the same frame — the visitor never sees the guess.
    measure()

    if (typeof ResizeObserver !== 'undefined' && el.value) {
      // Position is not size, so moving the dock cannot re-trigger this — but the
      // drawer opening inside it can, which is the point.
      observer = new ResizeObserver(measure)
      observer.observe(el.value)
    }
    window.addEventListener('resize', measure)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    if (stepTimer !== null) clearTimeout(stepTimer)
    window.removeEventListener('resize', measure)
    // A drag in flight when the dock unmounts would otherwise leave the body cursor
    // and its listeners behind.
    releaseBodyStyles()
    detach()
  })

  return {
    side,
    isDragging,
    isStepping,
    dockStyle,
    startDrag,
    shouldIgnoreClick,
    onKeydown,
  }
}
