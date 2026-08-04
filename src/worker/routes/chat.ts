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

    const lastUserMessage = [...body.messages].reverse().find(m => m.role === 'user')?.content || ''

    // Friendly persona responses (Arya's AI Persona)
    let replyContent = "Halo! Aku AI Persona Arya. Senang bisa mengobrol denganmu! Ada yang bisa aku bantu?"

    const lowerMsg = lastUserMessage.toLowerCase()

    if (lowerMsg.includes('kamu siapa') || lowerMsg.includes('siapa sih')) {
      replyContent = "Aku adalah AI Persona dari Arya (aryaptrha)! 🚀 Aku diprogram untuk mewakili persona Arya: ramah, suka game dev, web dev, dan karya-karya piksel yang cozy!"
    } else if (lowerMsg.includes('ganteng') || lowerMsg.includes('keren')) {
      replyContent = "Makasih banget pujiannya! 😊 Kamu juga luar biasa! Ada proyek menarik apa yang lagi kamu kerjakan?"
    } else if (lowerMsg.includes('project') || lowerMsg.includes('proyek') || lowerMsg.includes('buat apa')) {
      replyContent = "Arya sudah membuat berbagai proyek keren! Seperti Personal Portfolio Website, Game Prototype Unity di itch.io, Fullstack Kecha App, dan Cloudflare Worker landing page ini!"
    } else if (lowerMsg.includes('halo') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
      replyContent = "Halo kawan! Selamat datang di room chat persona Arya. Gimana harimu sejauh ini?"
    } else {
      replyContent = `Terima kasih pesannya! [Persona AI]: Aku menerima pesanmu "${lastUserMessage}". Sebagai persona AI Arya, aku selalu siap berdiskusi soal teknologi, desain piksel, atau ide-ide kreatif!`
    }

    return success({
      messages: [
        ...body.messages,
        {
          role: 'assistant',
          content: replyContent
        }
      ],
      reply: replyContent
    })
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Internal Server Error', 'SERVER_ERROR', 500)
  }
})

export { chat }
