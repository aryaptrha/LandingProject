import { onMounted, onUnmounted, ref } from 'vue'

/**
 * The floating panels that compete for room on a phone screen: the chat popup and the
 * edge-status band across the bottom, plus the music drawer docked to a side edge. All
 * three sit near z-index 1001, so on a phone only one may be open at a time.
 */
export type MobilePanelId = 'chat' | 'edge' | 'music'

/**
 * The width below which the edge panel leaves the widget rail and becomes a band across
 * the bottom of the screen — which is also the width at which it starts sharing that
 * space with the chat popup. This is the only definition of that boundary in JS; the one
 * stylesheet that repeats it is LatencyIndicator.vue's `max-width: 767px`, so keep the
 * two in step. CloudflareEdgeStatus.vue has no query of its own — it switches layout on
 * the `isMobile` returned below.
 *
 * Note this is the edge panel's breakpoint, not the chat's own 480px one. Between 481px
 * and 767px the chat popup is still 360px wide while the edge panel already spans the
 * viewport, so they overlap there too.
 */
const MOBILE_QUERY = '(max-width: 767px)'

/**
 * Module-level state, like useTheme and unlike the polling composables: every panel has
 * to agree both on where the breakpoint is and on who currently holds the bottom of the
 * screen, so this lives here rather than being rebuilt per `useMobilePanel()` call. One
 * media-query listener then serves the whole app instead of one per widget.
 */
const isMobile = ref(false)
/**
 * How to close each mounted panel, keyed by id rather than by component instance: both
 * consumers are singletons, rendered once each in App.vue.
 */
const closers = new Map<MobilePanelId, () => void>()
/**
 * The panel that most recently took the bottom of the screen — tracked at every width,
 * including the ones where the panels are allowed to coexist. That is the point of it:
 * a viewport narrowing past the breakpoint arrives with whatever was open on a desktop
 * still open, and this is what then says which of them keeps the space.
 */
let holder: MobilePanelId | null = null
let initialized = false

function matchesMobile(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
}

/** Closes every registered panel except one. Closers are safe to call on an already
 *  closed panel, so this needn't know who is actually open. */
function closeAllBut(keep: MobilePanelId) {
  for (const [id, close] of closers) {
    if (id === keep) continue
    close()
  }
}

/**
 * Reads the breakpoint and then follows it.
 *
 * A media-query listener rather than a resize one: it fires only when the boundary is
 * actually crossed instead of on every pixel of a window drag, and it reads that boundary
 * from the same place the stylesheets do. Never torn down — like the theme's, this is
 * app-lifetime state, and there is no point at which no widget cares about it.
 */
function init() {
  if (initialized) return
  initialized = true

  isMobile.value = matchesMobile()

  if (typeof window.matchMedia !== 'function') return
  window.matchMedia(MOBILE_QUERY).addEventListener('change', (event) => {
    isMobile.value = event.matches
    /*
     * The rule has to be enforced at the boundary as well as when a panel opens. Above the
     * breakpoint both panels may be open — they sit in opposite corners — so a window drag
     * or a rotation into phone widths can land in exactly the overlap this composable
     * exists to prevent, without any panel having opened to trigger a claim. Last one
     * opened keeps the space; the other is closed as if it had been claimed over, so
     * nothing is persisted and the visitor's remembered choice survives.
     */
    if (event.matches && holder !== null) closeAllBut(holder)
  })
}

/**
 * Registers a floating panel that, on a phone, may only be open while the others are
 * closed.
 *
 * `close` is called when another panel claims the space. The visitor didn't ask for it, so
 * it must not persist anything — a panel that gave way is not a panel the visitor put
 * away. It does have to rescue focus if it is holding it, though: the closing panel is
 * unmounted, and focus inside an unmounted element falls to `<body>`.
 */
export function useMobilePanel(id: MobilePanelId, close: () => void) {
  // Eager, so `isMobile` is already correct for a caller that reads it during setup
  // rather than only in the template.
  init()

  onMounted(() => closers.set(id, close))
  onUnmounted(() => closers.delete(id))

  /**
   * Call when this panel opens, to take the bottom of the screen off whoever else has it.
   *
   * Above the breakpoint nothing is closed — there the two panels sit in opposite corners
   * and never meet — but the claim is still *recorded*, because that is what lets the
   * listener above sort them out if the viewport later narrows. Below it the edge panel
   * spans the viewport and the chat popup nearly does, both around z-index 1000, so
   * without this they simply stack on each other.
   *
   * This cannot recurse. Claiming only ever *closes* other panels, and a panel only
   * claims when it *opens*, so nothing a closer does can come back through here.
   */
  function claim() {
    holder = id
    if (!isMobile.value) return
    closeAllBut(id)
  }

  return { isMobile, claim }
}
