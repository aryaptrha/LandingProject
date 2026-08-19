# Persona backend contract

What the external "Arya persona" service must implement for `/api/chat` to work.
Everything here is derived from `src/worker/routes/chat.ts` and
`src/composables/useChat.ts` — if the two disagree, the code wins.

## Shape of the whole thing

```
Browser ──POST /api/chat (with X-Session-Token)──▶ Worker ──POST <PERSONA_API_URL>/api/chat──▶ Backend
        ◀──── reply ─────────────────────────────        ◀──────── reply ────────────────────
```

The browser never talks to the backend directly. The worker holds the URL and secret key,
enforces Turnstile session token validation (`X-Session-Token`), calls the backend server-to-server,
and passes the answer back. Two consequences that save real work:

- **No CORS configuration.** Server-to-server requests aren't subject to CORS, so
  the backend needs no `Access-Control-Allow-*` headers and no preflight
  handling for this client.
- **The backend URL stays private & bot-protected.** It never appears in the shipped bundle, in
  network traces, or in devtools. Direct bot or Postman hits to `/api/chat` are rejected by the worker.

### Anti-Bot & Session Token Flow

```
1. Visitor Browser solves Cloudflare Turnstile challenge
2. Browser sends POST /api/session { turnstileToken }
   ↳ Worker verifies token via Cloudflare siteverify
   ↳ Worker generates HMAC-SHA256 signed X-Session-Token
3. Browser sends POST /api/chat with header `X-Session-Token: <token>`
   ↳ Worker validates HMAC signature, expiry (24h), and rate limits
   ↳ Worker proxies clean request to external backend
```

## Endpoint

The worker normalizes whatever `PERSONA_API_URL` holds
(`routes/chat.ts:20-23`):

```
https://api.example.com          → https://api.example.com/api/chat
https://api.example.com/         → https://api.example.com/api/chat
https://api.example.com/api/chat → https://api.example.com/api/chat   (unchanged)
```

So **the backend's chat endpoint must be `POST /api/chat`.** The suffix is
appended unless the URL already ends in `/api/chat`, which means a value like
`https://api.example.com/v1/chat` silently becomes
`https://api.example.com/v1/chat/api/chat`. If your backend lives at a different
path, change `resolvePersonaUrl` rather than fighting the config.

## Request the backend receives

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
Origin: https://aryaptrha.fun
Referer: https://aryaptrha.fun/
Accept: text/event-stream, application/json
Authorization: Bearer <PERSONA_API_KEY>      ← only if that secret is set
```

```json
{
  "messages": [
    { "role": "user", "content": "hello" },
    { "role": "assistant", "content": "hi there" },
    { "role": "user", "content": "what do you build?" }
  ]
}
```

Notes:

- The body is forwarded verbatim from the browser. `useChat.ts:176` builds it,
  filtering to messages with `status === 'sent'` and non-empty content, so
  pending and failed messages never appear.
- `role` is `'user' | 'assistant' | 'system'`.
- The **full conversation** is sent on every turn — the worker is stateless and
  keeps no session. The backend should treat `messages` as the entire context.
  There is currently no cap on history length; a very long conversation means a
  very large payload.
- `Origin` and `Referer` are synthesized by the worker, because a server-side
  `fetch` sends neither. See [Origin allowlist](#origin-allowlist).

## Response the backend should return

Preferred, and what the fallback path already emits:

```http
200 OK
Content-Type: application/json
```

```json
{ "success": true, "reply": "I build web things, mostly." }
```

The client parser (`useChat.ts:340-368`) is deliberately tolerant and will also
accept, in this order:

| Shape | |
| ----- | --- |
| `{"reply": "…"}` | preferred |
| `{"data": {"reply": "…"}}` | |
| `{"messages": [… , {"content": "…"}]}` | the **last** element's `content` — see the caveat below |
| `{"data": {"messages": [… , {"content": "…"}]}}` | same, one level down |
| `{"choices": [{"message": {"content": "…"}}]}` | OpenAI chat-compatible |
| `{"choices": [{"text": "…"}]}` | OpenAI completions-style |
| `{"message": {"content": "…"}}` | |
| `{"response": "…"}` / `{"content": "…"}` / `{"text": "…"}` | a non-string value here is `JSON.stringify`'d, not rejected |

Anything else gets `JSON.stringify`'d into the bubble, which looks like a bug to
a visitor. Pick one of the above.

**Caveat on the `messages` shapes.** The parser takes the last array element's
`content` and never inspects `role` (`useChat.ts:345-348`). So if you echo the
conversation back and append anything after the assistant turn — a trailing user
message, a system note — that trailing text is what renders as Arya's reply.
Either put the assistant turn last, or just return `{"reply": …}` and avoid the
question.

Non-JSON content types are wrapped by the worker as
`{"success": true, "reply": "<raw body text>"}` (`routes/chat.ts:86-87`), so a
`text/plain` backend works too.

The worker forwards the upstream status code as-is. A non-2xx makes the client
show a retryable error bubble.

## Streaming (optional)

If the backend answers with `Content-Type: text/event-stream`, the worker hands
the upstream `ReadableStream` straight through to the browser without buffering
(`routes/chat.ts:70-80`), adding `Cache-Control: no-store`,
`Connection: keep-alive` and `X-Accel-Buffering: no`. No code change is needed on
this side — streaming activates by itself the day the backend supports it, and
the reply then renders token by token.

The client's SSE reader accepts any of these as a chunk payload:

```
data: some bare text
data: {"delta":"some text"}
data: {"text":"some text"}
data: {"content":"some text"}
data: {"reply":"some text"}
data: {"choices":[{"delta":{"content":"some text"}}]}
data: [DONE]
```

`[DONE]` terminates the stream. Send events promptly — the client aborts after
**45 s with no token received**. Flush each event; a proxy that buffers will trip
that timeout even though the backend is healthy.

## Origin allowlist

If the backend restricts origins — this one does — the allowlist must contain the
site's own origin:

```
https://aryaptrha.fun
```

The worker sends that as `Origin` and `Referer`. In production it derives from
the worker's own URL automatically; locally `PERSONA_ORIGIN` in `.dev.vars`
supplies it, because the worker's real local origin is `http://127.0.0.1:8788`
and would be rejected. Either add the production origin to the allowlist (the
recommended path — nothing local needs whitelisting), or add
`http://127.0.0.1:8788` and drop `PERSONA_ORIGIN`.

Rejecting with `Forbidden: origin not allowed` is the symptom to look for.

## Authentication

Optional. Set the `PERSONA_API_KEY` worker secret and the worker sends
`Authorization: Bearer <key>` on every upstream call. Leave it unset and the
header is omitted entirely. The key exists only inside the worker — rotating it
is a `wrangler secret put` with no rebuild or redeploy.

## Timeouts and how failures look

Client-side, in `useChat.ts`:

| Threshold | Behavior |
| --------- | -------- |
| 120 s | Shows a "still thinking" notice; the request continues |
| 180 s | Aborts the request and shows a retryable error |
| 45 s idle mid-stream | Aborts — no token received for that long |

Backends should answer, or start streaming, well inside those.

### Failures are silent by design, which makes debugging odd

`routes/chat.ts:88-90` catches any upstream error, `console.error`s it, and falls
through to the canned Indonesian fallback:

```
Halo! Pesan kamu "…" udah masuk. Nanti aku (Arya) bakal bales ya!
```

So a DNS failure, a 500, a TLS problem, and an entirely unconfigured
`PERSONA_API_URL` all look identical in the browser. The distinguishing
information only exists in the worker logs:

```bash
npx wrangler tail        # production
                         # locally: the `npm run cf` terminal
```

Look for `Error forwarding to external persona API:`.

## Minimal conforming backend

```js
// POST /api/chat
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages required' })
  }

  // Optional: check Origin against an allowlist, and Authorization if you set a key.
  const reply = await generate(messages)   // full history, no server-side session

  res.json({ success: true, reply })
})
```

That is the whole contract. No CORS headers, no session store, no cookies.
