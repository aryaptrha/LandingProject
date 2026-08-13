import { onMounted, onUnmounted, ref } from 'vue'

/** The floating panels that compete for the bottom of a phone screen. */
export type MobilePanelId = 'chat' | 'edge'

/**
 * The width below which the edge panel leaves the widget rail and becomes a band across
 * the bottom of the screen — which is also the width at which it starts sharing that
 * space with the chat popup. Mirrors the `max-width: 767px` queries in
 * CloudflareEdgeStatus.vue and LatencyIndicator.vue; keep the three in step.
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
let initialized = false

function matchesMobile(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
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
  })
}

/**
 * Registers a floating panel that, on a phone, may only be open while the others are
 * closed.
 *
 * `close` is called when another panel claims the space, so it should do nothing but
 * close this one — no persisting, no focus moves. The visitor didn't ask for it.
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
   * A desktop is left alone: there the two panels sit in opposite corners and never meet.
   * Below the breakpoint the edge panel spans the viewport and the chat popup nearly
   * does, both around z-index 1000, so without this they simply stack on each other.
   *
   * This cannot recurse. Claiming only ever *closes* other panels, and a panel only
   * claims when it *opens*, so nothing a closer does can come back through here.
   */
  function claim() {
    if (!isMobile.value) return
    for (const [otherId, closeOther] of closers) {
      if (otherId === id) continue
      closeOther()
    }
  }

  return { isMobile, claim }
}
