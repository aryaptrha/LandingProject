import { Hono } from 'hono'
import { success, error } from '../utils/response'

const chat = new Hono()

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestBody {
  messages: ChatMessage[]
}

chat.post('/chat', async (c) => {
  try {
    const body = await c.req.json<ChatRequestBody>()

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return error('Invalid request format. Expected { messages: [{ role, content }] }', 'BAD_REQUEST', 400)
    }

    // Check if worker environment has an external Persona API target URL configured
    const envApiUrl = (c.env as any)?.PERSONA_API_URL || (c.env as any)?.VITE_PERSONA_API_URL
    if (envApiUrl && typeof envApiUrl === 'string' && envApiUrl.trim()) {
      const cleanUrl = envApiUrl.trim().replace(/\/$/, '')
      const targetUrl = cleanUrl.endsWith('/api/chat') ? cleanUrl : `${cleanUrl}/api/chat`

      try {
        const extRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        const extContentType = extRes.headers.get('content-type') || ''
        if (extContentType.includes('application/json')) {
          const extJson = await extRes.json()
          return c.json(extJson, extRes.status as any)
        }
        const extText = await extRes.text()
        return c.json({ success: true, reply: extText }, extRes.status as any)
      } catch (proxyErr) {
        console.error('Error forwarding to external persona API:', proxyErr)
      }
    }

    const lastUserMessage = [...body.messages].reverse().find(m => m.role === 'user')?.content || ''

    // Local fallback response when no external persona endpoint URL is active
    const replyContent = `Pesan diterima: "${lastUserMessage}". [Catatan: Set VITE_PERSONA_API_URL di environment variables untuk menghubungkan ke AI Backend live!]`

    return c.json({
      success: true,
      reply: replyContent,
      messages: [
        ...body.messages,
        {
          role: 'assistant',
          content: replyContent
        }
      ]
    })
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Internal Server Error', 'SERVER_ERROR', 500)
  }
})

export { chat }
