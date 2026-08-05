import { ref, computed, watch } from 'vue'

export type Theme = 'day' | 'night'

const STORAGE_KEY = 'portfolio_theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Module-level state, unlike the polling composables: every caller must agree on
 * one theme, so the refs live here rather than being created per `useTheme()` call.
 */
const theme = ref<Theme>('day')
/** True once the visitor has picked a side; until then we follow the OS. */
const hasExplicitChoice = ref(false)
let initialized = false

function systemPrefersNight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'day' || value === 'night' ? value : null
  } catch {
    return null
  }
}

/**
 * The night palette hangs off `data-theme` on <html>. `index.html` sets the same
 * attribute inline before first paint to avoid a flash of the day palette; this
 * keeps it in sync afterwards.
 */
function applyToDocument(next: Theme) {
  document.documentElement.dataset.theme = next
  // Keep mobile browser chrome in step with the palette.
  document
    .getElementById('theme-color-meta')
    ?.setAttribute('content', next === 'night' ? '#1E1C22' : '#FAFAF7')
}

function init() {
  if (initialized) return
  initialized = true

  const stored = readStored()
  hasExplicitChoice.value = stored !== null
  theme.value = stored ?? (systemPrefersNight() ? 'night' : 'day')
  applyToDocument(theme.value)

  // Keep following the OS as long as the visitor hasn't overridden it.
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_QUERY).addEventListener('change', (event) => {
      if (hasExplicitChoice.value) return
      theme.value = event.matches ? 'night' : 'day'
    })
  }

  watch(theme, (next) => {
    applyToDocument(next)
    if (!hasExplicitChoice.value) return
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing / storage full — the theme still applies for this session.
    }
  })
}

export function useTheme() {
  init()

  const isNight = computed(() => theme.value === 'night')

  function setTheme(next: Theme) {
    hasExplicitChoice.value = true
    if (theme.value === next) {
      // Watcher won't fire, but the choice still needs persisting.
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      return
    }
    theme.value = next
  }

  function toggleTheme() {
    setTheme(theme.value === 'night' ? 'day' : 'night')
  }

  /** Drops the override and goes back to following the OS preference. */
  function useSystemTheme() {
    hasExplicitChoice.value = false
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    theme.value = systemPrefersNight() ? 'night' : 'day'
  }

  return {
    theme,
    isNight,
    hasExplicitChoice,
    setTheme,
    toggleTheme,
    useSystemTheme,
  }
}
