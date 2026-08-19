import { ref, watch, onMounted, computed } from 'vue'
import { consumeSseStream } from '../utils/sse'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /**
   * ISO 8601 instant (`new Date().toISOString()`), NOT a display string.
   */
  timestamp: string
  status?: 'sending' | 'error' | 'sent'
  isSlow?: boolean
}

const STORAGE_KEYS = {
  ENDPOINT: 'persona_chat_endpoint',
  API_KEY: 'persona_chat_api_key',
  MESSAGES: 'persona_chat_messages',
  USER_AVATAR: 'persona_chat_user_avatar',
  SESSION_TOKEN: 'chat_session_token',
}

/**
 * Resolves the chat endpoint.
 *
 * Always defaults to the worker's own `/api/chat`, which proxies to the persona
 * backend using the `PERSONA_API_URL` secret.
 */
function getActiveEndpoint(): string {
  const saved = localStorage.getItem(STORAGE_KEYS.ENDPOINT)
  if (saved && saved.trim()) {
    return saved.trim()
  }
  return '/api/chat'
}

const DEFAULT_ENDPOINT = '/api/chat'

/**
 * Monotonic counter for message ids.
 */
let idCounter = 0
function nextMessageId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content: 'Halo! Aku Arya 👋. Senang bisa ngobrol! tanyain apaan aja kak bebas ini mah, tentang saya boleh, tanya pacar saya siapa boleh, tanya kapan kiamat jangan, curhat bolehhh.',
    timestamp: new Date().toISOString(),
    status: 'sent',
  },
]

/** How long before a still-pending reply gets the apologetic "aku lambat" notice. */
const SLOW_NOTICE_MS = 120_000
/** Hard ceiling for a non-streaming request. */
const REQUEST_TIMEOUT_MS = 180_000
/** Once a stream is flowing, abort only if it goes quiet for this long. */
const STREAM_IDLE_MS = 45_000

export function useChat() {
  const endpointUrl = ref<string>(getActiveEndpoint())
  const apiKey = ref<string>(localStorage.getItem(STORAGE_KEYS.API_KEY) || '')
  const userAvatarId = ref<string>(localStorage.getItem(STORAGE_KEYS.USER_AVATAR) || '')
  const isAvatarPickerOpen = ref<boolean>(!localStorage.getItem(STORAGE_KEYS.USER_AVATAR))
  const messages = ref<ChatMessage[]>([])
  const isLoading = ref<boolean>(false)
  const error = ref<string | null>(null)

  // Session Token State for Bot / Anti-Scraping / Postman Protection
  const sessionToken = ref<string>(sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN) || '')
  const isSessionVerified = computed(() => Boolean(sessionToken.value && sessionToken.value.trim()))
  const isVerifyingSession = ref<boolean>(false)
  const sessionError = ref<string | null>(null)

  let activeController: AbortController | null = null
  let stoppedByUser = false

  // Initialize messages from localStorage or defaults
  onMounted(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          messages.value = parsed
          return
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
    messages.value = [...INITIAL_MESSAGES]
  })

  // Persistence watchers
  watch(endpointUrl, (newVal) => {
    if (newVal) {
      localStorage.setItem(STORAGE_KEYS.ENDPOINT, newVal)
    } else {
      localStorage.removeItem(STORAGE_KEYS.ENDPOINT)
    }
  })

  watch(apiKey, (newVal) => {
    if (newVal) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, newVal)
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_KEY)
    }
  })

  watch(userAvatarId, (newVal) => {
    if (newVal) {
      localStorage.setItem(STORAGE_KEYS.USER_AVATAR, newVal)
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER_AVATAR)
    }
  })

  function setUserAvatar(id: string) {
    userAvatarId.value = id
    isAvatarPickerOpen.value = false
  }

  function openAvatarPicker() {
    isAvatarPickerOpen.value = true
  }

  function closeAvatarPicker() {
    if (userAvatarId.value) {
      isAvatarPickerOpen.value = false
    }
  }

  /**
   * Exchanges a valid Turnstile token for a signed X-Session-Token via POST /api/session
   */
  async function setSessionFromTurnstile(turnstileToken: string): Promise<boolean> {
    if (!turnstileToken) return false
    isVerifyingSession.value = true
    sessionError.value = null

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken }),
      })

      const data = await res.json()
      if (data.success) {
        const token = data.data?.sessionToken || data.sessionToken
        if (token) {
          sessionToken.value = token
          sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token)
          return true
        }
      }

      sessionError.value = data.error || data.message || 'Verifikasi keamanan gagal.'
      return false
    } catch (err) {
      sessionError.value = err instanceof Error ? err.message : 'Gagal menghubungi server verifikasi.'
      return false
    } finally {
      isVerifyingSession.value = false
    }
  }

  function clearSession() {
    sessionToken.value = ''
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN)
  }

  const PERSIST_LIMIT = 100
  watch(
    messages,
    (newVal) => {
      try {
        const toPersist =
          newVal.length > PERSIST_LIMIT ? newVal.slice(-PERSIST_LIMIT) : newVal
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(toPersist))
      } catch {
        // Storage limit protection
      }
    },
    { deep: true },
  )

  function stop() {
    if (activeController) {
      stoppedByUser = true
      activeController.abort()
    }
  }

  function clearMessages() {
    messages.value = [
      {
        id: nextMessageId('welcome'),
        role: 'assistant',
        content: 'Pesan telah dibersihkan! Ada yang mau kamu tanyakan lagi ke aku?',
        timestamp: new Date().toISOString(),
        status: 'sent',
      },
    ]
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isLoading.value) return

    error.value = null

    // 1. Create user message
    const userMsgId = nextMessageId('user')
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      status: 'sent',
    }

    messages.value.push(userMsg)

    // 2. Prepare payload matching exact required schema:
    // { "messages": [ { "role": "user", "content": "..." }, ... ] }
    const apiPayload = {
      messages: messages.value
        .filter((m) => m.status === 'sent' && m.content.trim().length > 0)
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
    }

    isLoading.value = true

    // Placeholder assistant message for loading state
    const assistantMsgId = nextMessageId('assistant')
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      status: 'sending',
      isSlow: false,
    }

    messages.value.push(assistantMsg)

    stoppedByUser = false
    const controller = new AbortController()
    activeController = controller

    let slowTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      const targetMsg = messages.value.find((m) => m.id === assistantMsgId)
      if (targetMsg && targetMsg.status === 'sending') {
        targetMsg.isSlow = true
      }
    }, SLOW_NOTICE_MS)

    const clearSlowTimer = () => {
      if (slowTimer) {
        clearTimeout(slowTimer)
        slowTimer = null
      }
    }

    let hardTimer: ReturnType<typeof setTimeout> | null = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    )
    const clearHardTimer = () => {
      if (hardTimer) {
        clearTimeout(hardTimer)
        hardTimer = null
      }
    }

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const bumpIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_MS)
    }
    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
      }

      if (apiKey.value) {
        headers['Authorization'] = `Bearer ${apiKey.value}`
      }

      // Attach X-Session-Token header for bot/postman protection
      if (sessionToken.value) {
        headers['X-Session-Token'] = sessionToken.value
      }

      const targetUrl = endpointUrl.value || DEFAULT_ENDPOINT

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(apiPayload),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')

        // If session token was rejected or expired, clear local session token
        if (response.status === 401 || response.status === 403) {
          clearSession()
        }

        let parsedMessage = ''
        try {
          const errJson = JSON.parse(errText)
          parsedMessage = errJson.error || errJson.message
        } catch {
          // ignore
        }

        throw new Error(parsedMessage || `HTTP ${response.status}: ${errText || response.statusText}`)
      }

      const contentType = response.headers.get('content-type') || ''
      const targetMsg = messages.value.find((m) => m.id === assistantMsgId)

      // Streaming path — the worker passes an upstream SSE body straight through.
      if (contentType.includes('text/event-stream') && response.body) {
        clearHardTimer()
        bumpIdleTimer()

        await consumeSseStream(response.body, (delta) => {
          clearSlowTimer()
          bumpIdleTimer()
          if (targetMsg) targetMsg.content += delta
        })

        clearIdleTimer()

        if (targetMsg) {
          if (!targetMsg.content) targetMsg.content = '(Tidak ada respon yang diterima)'
          targetMsg.status = 'sent'
        }
        return
      }

      // Non-streaming path.
      let replyContent = ''

      if (contentType.includes('application/json')) {
        const data = await response.json()
        replyContent = parseApiResponse(data)
      } else {
        replyContent = await response.text()
      }

      if (!replyContent) {
        replyContent = '(Tidak ada respon yang diterima)'
      }

      if (targetMsg) {
        targetMsg.content = replyContent
        targetMsg.status = 'sent'
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      const errMsg = aborted
        ? stoppedByUser
          ? 'Dihentikan'
          : 'Waktu tunggu habis'
        : err instanceof Error
          ? err.message
          : 'Gagal terhubung ke endpoint chat'
      error.value = errMsg

      const targetMsg = messages.value.find((m) => m.id === assistantMsgId)
      if (targetMsg) {
        targetMsg.content = targetMsg.content
          ? `${targetMsg.content}\n\n⚠️ (Terputus: ${errMsg})`
          : `⚠️ Maaf, gagal terhubung ke server (${errMsg}). Coba cek koneksi kamu dulu ya, terus kirim lagi.`
        targetMsg.status = 'error'
      }
    } finally {
      clearSlowTimer()
      clearHardTimer()
      clearIdleTimer()
      activeController = null
      isLoading.value = false
    }
  }

  function parseApiResponse(data: any): string {
    if (!data) return ''
    if (typeof data === 'string') return data

    if (typeof data.reply === 'string') return data.reply
    if (data.data && typeof data.data.reply === 'string') return data.data.reply

    if (Array.isArray(data.messages) && data.messages.length > 0) {
      const last = data.messages[data.messages.length - 1]
      if (last && last.content) return last.content
    }

    if (data.data && Array.isArray(data.data.messages) && data.data.messages.length > 0) {
      const last = data.data.messages[data.data.messages.length - 1]
      if (last && last.content) return last.content
    }

    if (Array.isArray(data.choices) && data.choices.length > 0) {
      const choice = data.choices[0]
      if (choice.message && choice.message.content) return choice.message.content
      if (choice.text) return choice.text
    }

    if (data.message && data.message.content) return data.message.content
    if (data.response) return typeof data.response === 'string' ? data.response : JSON.stringify(data.response)
    if (data.content) return typeof data.content === 'string' ? data.content : JSON.stringify(data.content)
    if (data.text) return typeof data.text === 'string' ? data.text : JSON.stringify(data.text)

    return JSON.stringify(data)
  }

  return {
    endpointUrl,
    apiKey,
    userAvatarId,
    isAvatarPickerOpen,
    messages,
    isLoading,
    error,
    sessionToken,
    isSessionVerified,
    isVerifyingSession,
    sessionError,
    setSessionFromTurnstile,
    clearSession,
    sendMessage,
    stop,
    clearMessages,
    setUserAvatar,
    openAvatarPicker,
    closeAvatarPicker,
  }
}
