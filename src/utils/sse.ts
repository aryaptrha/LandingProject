/**
 * Minimal Server-Sent Events reader for the chat stream.
 *
 * Kept separate from `useChat` because it is pure — no Vue, no DOM beyond the
 * streams API — which makes it directly testable and reusable if another
 * streaming endpoint shows up later.
 */

/**
 * Extracts an incremental text delta from a single SSE event's `data` payload.
 *
 * Deliberately tolerant, in the same spirit as `parseApiResponse` in `useChat`:
 * the persona backend may emit bare text, `{ delta }`, `{ text }`, `{ content }`,
 * `{ reply }`, or the OpenAI `choices[0].delta.content` shape. Returns null for
 * keep-alives, `[DONE]`, and JSON frames that carry no text (e.g. role headers).
 */
export function parseSseDelta(raw: string): string | null {
  const probe = raw.trim()
  if (!probe || probe === '[DONE]') return null

  // Bare text delta, not JSON. Returned verbatim, NOT trimmed — leading and
  // trailing spaces carry the word boundaries in a token stream.
  // A leading quote counts as a JSON probe so `data: "token"` doesn't render
  // its quotes; prose that merely starts with one fails JSON.parse and falls
  // back to the literal via the catch below.
  const looksJson = probe.startsWith('{') || probe.startsWith('[') || probe.startsWith('"')
  if (!looksJson) return raw

  try {
    const obj = JSON.parse(probe)
    if (typeof obj === 'string') return obj
    if (typeof obj?.delta === 'string') return obj.delta
    if (typeof obj?.text === 'string') return obj.text
    if (typeof obj?.content === 'string') return obj.content
    if (typeof obj?.reply === 'string') return obj.reply

    const choice = Array.isArray(obj?.choices) ? obj.choices[0] : undefined
    if (choice) {
      if (typeof choice?.delta?.content === 'string') return choice.delta.content
      if (typeof choice?.text === 'string') return choice.text
    }
    return null
  } catch {
    // Not valid JSON after all — treat the payload as literal text
    return raw
  }
}

/**
 * Splits one SSE event block into its delta, or null if it carries no text.
 *
 * Per the spec an event's multiple `data:` lines join with a newline, and a
 * single space after the colon is field syntax rather than content.
 */
export function parseSseEvent(block: string): string | null {
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const value = line.slice(5)
    dataLines.push(value.startsWith(' ') ? value.slice(1) : value)
  }
  if (dataLines.length === 0) return null

  return parseSseDelta(dataLines.join('\n'))
}

/**
 * Reads an SSE stream, invoking `onDelta` for each text fragment as it arrives.
 *
 * Network chunks do not align with event boundaries — a single JSON frame can
 * be split across two reads — so incomplete events are buffered until their
 * terminating blank line shows up.
 */
export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<void> {
  const reader = body.getReader()
  // `stream: true` carries a multi-byte character split across two network
  // chunks over to the next decode instead of emitting a replacement char.
  const decoder = new TextDecoder()
  let buffer = ''

  const emit = (block: string) => {
    const delta = parseSseEvent(block)
    if (delta) onDelta(delta)
  }

  const drainCompleteEvents = () => {
    const events = buffer.split(/\r?\n\r?\n/)
    // The last piece is either empty or an event still missing its blank line.
    buffer = events.pop() ?? ''
    for (const evt of events) emit(evt)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      drainCompleteEvents()
    }
    buffer += decoder.decode()
    drainCompleteEvents()
    // Flush a trailing event that ended without its blank line
    if (buffer.trim()) emit(buffer)
  } finally {
    reader.releaseLock()
  }
}
