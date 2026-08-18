<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string
          action?: string
          theme?: 'auto' | 'light' | 'dark'
          size?: 'normal' | 'flexible' | 'compact'
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: (errorCode?: string) => void
        },
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoaded?: () => void
  }
}

const props = withDefaults(
  defineProps<{
    siteKey?: string
    action?: string
    theme?: 'auto' | 'light' | 'dark'
    size?: 'normal' | 'flexible' | 'compact'
  }>(),
  {
    siteKey: '',
    action: undefined,
    theme: 'auto',
    size: 'normal',
  },
)

const emit = defineEmits<{
  (e: 'verify', token: string): void
  (e: 'expire'): void
  (e: 'error', errorCode?: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const widgetId = ref<string | null>(null)
const currentToken = ref<string>('')

// Fallback to Cloudflare's always-passing test sitekey if none is provided in development
const effectiveSiteKey = ref<string>('')

function updateEffectiveKey() {
  effectiveSiteKey.value =
    props.siteKey ||
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    // Cloudflare dummy test key (Always passes):
    '1x00000000000000000000AA'
}

function loadScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) {
      resolve()
      return
    }

    const scriptId = 'cf-turnstile-script'
    if (document.getElementById(scriptId)) {
      // Script is already loading, wait for callback
      const existingCallback = window.onTurnstileLoaded
      window.onTurnstileLoaded = () => {
        if (existingCallback) existingCallback()
        resolve()
      }
      return
    }

    window.onTurnstileLoaded = () => {
      resolve()
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded&render=explicit'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  })
}

async function renderWidget() {
  if (!containerRef.value) return

  await loadScript()

  if (!window.turnstile || !containerRef.value) return

  // Clean up any previous widget instance
  if (widgetId.value) {
    try {
      window.turnstile.remove(widgetId.value)
    } catch {
      // ignore
    }
    widgetId.value = null
  }

  currentToken.value = ''

  try {
    widgetId.value = window.turnstile.render(containerRef.value, {
      sitekey: effectiveSiteKey.value,
      action: props.action,
      theme: props.theme,
      size: props.size,
      callback: (token: string) => {
        currentToken.value = token
        emit('verify', token)
      },
      'expired-callback': () => {
        currentToken.value = ''
        emit('expire')
      },
      'error-callback': (code?: string) => {
        currentToken.value = ''
        emit('error', code)
      },
    })
  } catch (err) {
    console.error('Failed to render Turnstile widget:', err)
  }
}

function reset() {
  currentToken.value = ''
  if (widgetId.value && window.turnstile) {
    try {
      window.turnstile.reset(widgetId.value)
    } catch (err) {
      console.warn('Failed to reset Turnstile widget:', err)
      renderWidget()
    }
  }
}

function getToken(): string {
  return currentToken.value
}

defineExpose({
  reset,
  getToken,
})

watch(
  () => props.siteKey,
  () => {
    updateEffectiveKey()
    renderWidget()
  },
)

onMounted(() => {
  updateEffectiveKey()
  renderWidget()
})

onBeforeUnmount(() => {
  if (widgetId.value && window.turnstile) {
    try {
      window.turnstile.remove(widgetId.value)
    } catch {
      // ignore
    }
  }
})
</script>

<template>
  <div class="turnstile-wrapper">
    <div ref="containerRef" class="turnstile-container" />
  </div>
</template>

<style scoped>
.turnstile-wrapper {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  min-height: 65px;
  margin: var(--space-xs, 4px) 0;
}

.turnstile-container {
  min-height: 65px;
}
</style>
