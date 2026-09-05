import { computed, ref, watch } from 'vue'

/**
 * Who the page is currently addressing.
 *
 * `visitor` is the cozy portfolio: the project cards, the guestbook, the music
 * player. `dev` is the same page with the infrastructure on show — the edge
 * topology diagram, the live insights panel, and the floating latency and
 * edge-status widgets.
 */
export type ViewMode = 'visitor' | 'dev'

const STORAGE_KEY = 'portfolio_view'

/**
 * Module-level state, like useTheme's and unlike the polling composables: the header
 * copy, the landing sections, the floating telemetry rail and the chat's prompt chips
 * must all agree on one view, so the ref lives here rather than being created per
 * `useViewMode()` call.
 */
const mode = ref<ViewMode>('visitor')
let initialized = false

function readStored(): ViewMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'visitor' || value === 'dev' ? value : null
  } catch {
    return null
  }
}

/**
 * The view hangs off `data-view` on <html>, mirroring `data-theme`.
 *
 * No stylesheet reads it today — the sections are gated with `v-if`, which is what
 * actually stops a hidden `LazySection` from reserving its `min-height`. It is
 * written for two other reasons: `runRevealTransition` compares this attribute
 * before and after the flip to decide whether the change is worth animating, and it
 * puts the current view somewhere a dev-view visitor can see it. `index.html` sets
 * the same attribute inline before first paint, so it is never briefly absent.
 */
function applyToDocument(next: ViewMode) {
  document.documentElement.dataset.view = next
}

function init() {
  if (initialized) return
  initialized = true

  // Visitor unless the visitor has said otherwise. The cozy view is the one that
  // works for everybody who lands here; dev view is the opt-in.
  mode.value = readStored() ?? 'visitor'
  applyToDocument(mode.value)

  watch(mode, (next) => {
    applyToDocument(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing / storage full — the view still applies for this session.
    }
  })
}

export function useViewMode() {
  init()

  const isDev = computed(() => mode.value === 'dev')

  /**
   * Unlike `useTheme.setTheme`, this needs no branch for "same value, still persist".
   * There the third state made an explicit day pick meaningfully different from the
   * absence of one; here an absent key already *means* `visitor`, so selecting the
   * mode you are already in has nothing left to record.
   */
  function setMode(next: ViewMode) {
    mode.value = next
  }

  function toggleMode() {
    setMode(mode.value === 'dev' ? 'visitor' : 'dev')
  }

  return {
    mode,
    isDev,
    setMode,
    toggleMode,
  }
}
