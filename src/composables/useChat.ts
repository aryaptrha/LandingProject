import { ref, watch, onMounted } from 'vue'
import { consumeSseStream } from '../utils/sse'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  status?: 'sending' | 'error' | 'sent'
  isSlow?: boolean
}

const STORAGE_KEYS = {
  ENDPOINT: 'persona_chat_endpoint',
  API_KEY: 'persona_chat_api_key',
  MESSAGES: 'persona_chat_messages',
  USER_AVATAR: 'persona_chat_user_avatar',
}

/**
 * Resolves the chat endpoint.
 *
 * Always defaults to the worker's own `/api/chat`, which proxies to the persona
 * backend using the `PERSONA_API_URL` secret. The upstream host is deliberately
 * NOT read from a `VITE_*` var — those are inlined into the client bundle, which
 * would publish the upstream URL to every visitor.
 *
 * The localStorage override remains for pointing a local build at a different
 * backend while debugging.
 */
function getActiveEndpoint(): string {
  const saved = localStorage.getItem(STORAGE_KEYS.ENDPOINT)
  if (saved && saved.trim()) {
    return saved.trim()
  }
  return '/api/chat'
}

const DEFAULT_ENDPOINT = '/api/chat'

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content: 'Halo! Aku Arya 👋. Senang bisa ngobrol! tanyain apaan aja kak bebas ini mah, tentang saya boleh, tanya pacar saya siapa boleh, tanya kapan kiamat jangan, curhat bolehhh.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

  watch(
    messages,
    (newVal) => {
      try {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(newVal))
      } catch {
        // Storage limit protection
      }
    },
    { deep: true }
  )

  function setEndpoint(url: string) {
    endpointUrl.value = url.trim() || DEFAULT_ENDPOINT
  }

  function setApiKey(key: string) {
    apiKey.value = key.trim()
  }

  function clearMessages() {
    messages.value = [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: 'Pesan telah dibersihkan! Ada yang mau kamu tanyakan lagi ke aku?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'sent',
      },
    ]
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || isLoading.value) return

    error.value = null

    // 1. Create user message
    const userMsgId = `user-${Date.now()}`
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    const assistantMsgId = `assistant-${Date.now()}`
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sending',
      isSlow: false,
    }

    messages.value.push(assistantMsg)

    const controller = new AbortController()

    // Apologetic notice if nothing has come back yet. For a stream this is cleared
    // on the *first token*, not on completion — once text is moving, we're not stuck.
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

    // Hard ceiling so a wedged upstream can't leave the UI spinning forever.
    let hardTimer: ReturnType<typeof setTimeout> | null = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    )
    const clearHardTimer = () => {
      if (hardTimer) {
        clearTimeout(hardTimer)
        hardTimer = null
      }
    }

    // A long stream is legitimate, a silent one is not. Once tokens flow, the
    // overall ceiling is replaced by this idle watchdog, reset on every chunk.
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

      const targetUrl = endpointUrl.value || DEFAULT_ENDPOINT

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(apiPayload),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`)
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

      // Non-streaming path. parseApiResponse stays untouched — it is deliberately
      // tolerant of several upstream envelope shapes.
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
        ? 'Waktu tunggu habis'
        : err instanceof Error
          ? err.message
          : 'Gagal terhubung ke endpoint chat'
      error.value = errMsg

      const targetMsg = messages.value.find((m) => m.id === assistantMsgId)
      if (targetMsg) {
        // Keep whatever streamed in before the break instead of throwing it away.
        targetMsg.content = targetMsg.content
          ? `${targetMsg.content}\n\n⚠️ (Terputus: ${errMsg})`
          : `⚠️ Maaf, gagal terhubung ke server (${errMsg}). Silakan periksa koneksi atau URL endpoint di Settings.`
        targetMsg.status = 'error'
      }
    } finally {
      clearSlowTimer()
      clearHardTimer()
      clearIdleTimer()
      isLoading.value = false
    }
  }

  // Parse API payload response schema: {"success": true, "reply": "the answer"}
  function parseApiResponse(data: any): string {
    if (!data) return ''
    if (typeof data === 'string') return data

    // Check {"success": true, "reply": "..."} or {"reply": "..."}
    if (typeof data.reply === 'string') return data.reply
    if (data.data && typeof data.data.reply === 'string') return data.data.reply

    // Check data.messages array
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      const last = data.messages[data.messages.length - 1]
      if (last && last.content) return last.content
    }

    if (data.data && Array.isArray(data.data.messages) && data.data.messages.length > 0) {
      const last = data.data.messages[data.data.messages.length - 1]
      if (last && last.content) return last.content
    }

    // Check OpenAI standard choices format
    if (Array.isArray(data.choices) && data.choices.length > 0) {
      const choice = data.choices[0]
      if (choice.message && choice.message.content) return choice.message.content
      if (choice.text) return choice.text
    }

    // Single message object / fallbacks
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
    sendMessage,
    clearMessages,
    setEndpoint,
    setApiKey,
    setUserAvatar,
    openAvatarPicker,
    closeAvatarPicker,
    DEFAULT_ENDPOINT,
  }
}
