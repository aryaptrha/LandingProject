import { ref, watch, onMounted } from 'vue'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  status?: 'sending' | 'error' | 'sent'
}

const STORAGE_KEYS = {
  ENDPOINT: 'persona_chat_endpoint',
  API_KEY: 'persona_chat_api_key',
  MESSAGES: 'persona_chat_messages',
}

function getDefaultEndpoint(): string {
  const envUrl = import.meta.env.VITE_PERSONA_API_URL
  if (envUrl && envUrl.trim()) {
    const cleanUrl = envUrl.trim().replace(/\/$/, '')
    if (cleanUrl.endsWith('/api/chat')) {
      return cleanUrl
    }
    return `${cleanUrl}/api/chat`
  }
  return '/api/chat'
}

const DEFAULT_ENDPOINT = getDefaultEndpoint()
const DEFAULT_API_KEY = import.meta.env.VITE_API_KEY || ''

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    role: 'assistant',
    content: 'Halo! Aku AI Persona Arya 🌸. Senang bertemu denganku! Kamu bisa tanya tentang proyek, ide game dev, web dev, atau sekadar menyapa.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'sent',
  },
]

export function useChat() {
  const endpointUrl = ref<string>(localStorage.getItem(STORAGE_KEYS.ENDPOINT) || DEFAULT_ENDPOINT)
  const apiKey = ref<string>(localStorage.getItem(STORAGE_KEYS.API_KEY) || DEFAULT_API_KEY)
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
        content: 'Percakapan telah dibersihkan! Ada yang bisa aku bantu lagi?',
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
    }

    messages.value.push(assistantMsg)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (apiKey.value) {
        headers['Authorization'] = `Bearer ${apiKey.value}`
      }

      const targetUrl = endpointUrl.value || DEFAULT_ENDPOINT

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(apiPayload),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status}: ${errText || response.statusText}`)
      }

      const contentType = response.headers.get('content-type') || ''
      let replyContent = ''

      if (contentType.includes('application/json')) {
        const data = await response.json()
        replyContent = parseApiResponse(data)
      } else {
        replyContent = await response.text()
      }

      if (!replyContent) {
        replyContent = '(Empty response received from persona API)'
      }

      // Find and update assistant message content
      const targetMsg = messages.value.find((m) => m.id === assistantMsgId)
      if (targetMsg) {
        targetMsg.content = replyContent
        targetMsg.status = 'sent'
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to persona endpoint'
      error.value = errMsg

      const targetMsg = messages.value.find((m) => m.id === assistantMsgId)
      if (targetMsg) {
        targetMsg.content = `⚠️ Maaf, gagal terhubung ke endpoint (${errMsg}). Silakan periksa URL endpoint di Settings.`
        targetMsg.status = 'error'
      }
    } finally {
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
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    setEndpoint,
    setApiKey,
    DEFAULT_ENDPOINT,
  }
}
